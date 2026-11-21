// Makes a generated model light enough for a Quest 2 and safe for three.js GLTFLoader:
// about 12,000 triangles or fewer (three followers and the reef's gifts share a Quest 2's budget), textures no larger than 1024 px (JPEG unless they need transparency),
// smooth normals, a plain non-metal material, no Draco or meshopt compression, one self-contained .glb.
import { NodeIO, PropertyType } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, weld, simplify, prune, textureCompress, compactPrimitive, unpartition } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';

export const MAX_TRIANGLES = 12000;
export const MAX_TEXTURE = 1024;

let ioPromise = null;
async function getIO() {
  if (!ioPromise) {
    ioPromise = (async () => {
      await Promise.all([MeshoptSimplifier.ready, MeshoptDecoder.ready]);
      return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
    })();
  }
  return ioPromise;
}

function countTriangles(doc) {
  let triangles = 0;
  let vertices = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const position = prim.getAttribute('POSITION');
      if (!position || prim.getMode() !== 4) continue; // 4 = TRIANGLES
      const indices = prim.getIndices();
      triangles += Math.floor((indices ? indices.getCount() : position.getCount()) / 3);
      vertices += position.getCount();
    }
  }
  return { triangles, vertices };
}

/** Reads a .glb and reports what is in it. Throws if it does not parse. */
export async function inspectGlb(bytes) {
  const io = await getIO();
  const doc = await io.readBinary(new Uint8Array(bytes));
  const root = doc.getRoot();
  const { triangles, vertices } = countTriangles(doc);
  return {
    bytes: bytes.length,
    triangles,
    vertices,
    meshes: root.listMeshes().length,
    materials: root.listMaterials().length,
    textures: root.listTextures().map((t) => ({ type: t.getMimeType(), size: t.getSize(), bytes: t.getImage() ? t.getImage().byteLength : 0 })),
    extensions: root.listExtensionsUsed().map((e) => e.extensionName),
    vertexColors: root.listMeshes().some((m) => m.listPrimitives().some((p) => p.getAttribute('COLOR_0'))),
  };
}

/** Last resort when careful simplification cannot get low enough (many texture seams): ignores topology. */
function sloppy(doc, target) {
  const { triangles } = countTriangles(doc);
  if (triangles <= target) return;
  const keep = target / triangles;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const position = prim.getAttribute('POSITION');
      const indices = prim.getIndices();
      if (!position || !indices || prim.getMode() !== 4) continue;
      const count = indices.getCount();
      const want = Math.max(3, Math.floor((count * keep) / 3) * 3);
      const src = new Uint32Array(indices.getArray());
      const positions = position.getArray() instanceof Float32Array ? position.getArray() : new Float32Array(position.getArray());
      const [out] = MeshoptSimplifier.simplifySloppy(src, positions, 3, null, want, 0.2);
      if (out.length >= 3 && out.length < count) {
        indices.setArray(position.getCount() > 65535 ? new Uint32Array(out) : new Uint16Array(out));
        compactPrimitive(prim);
      }
    }
  }
}

/**
 * Smooth shading: three.js falls back to flat (faceted) shading when a mesh has no normals, so give every
 * primitive that lacks them area-weighted vertex normals. (gltf-transform's own normals() un-welds the mesh.)
 */
function smoothNormals(doc) {
  const buffer = doc.getRoot().listBuffers()[0] || doc.createBuffer();
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const position = prim.getAttribute('POSITION');
      if (!position || prim.getAttribute('NORMAL') || prim.getMode() !== 4) continue;
      const pos = position.getArray();
      const index = prim.getIndices() ? prim.getIndices().getArray() : null;
      const count = position.getCount();
      const out = new Float32Array(count * 3);
      const corners = index ? index.length : count;
      for (let i = 0; i + 2 < corners; i += 3) {
        const a = (index ? index[i] : i) * 3;
        const b = (index ? index[i + 1] : i + 1) * 3;
        const c = (index ? index[i + 2] : i + 2) * 3;
        const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
        const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; // length = twice the area
        for (const k of [a, b, c]) {
          out[k] += nx;
          out[k + 1] += ny;
          out[k + 2] += nz;
        }
      }
      for (let k = 0; k < out.length; k += 3) {
        const len = Math.hypot(out[k], out[k + 1], out[k + 2]);
        if (len > 1e-20) {
          out[k] /= len;
          out[k + 1] /= len;
          out[k + 2] /= len;
        } else {
          out[k + 1] = 1; // a vertex no triangle uses, or a degenerate one: any unit vector will do
        }
      }
      prim.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(out).setBuffer(buffer));
    }
  }
}

/** Float vertex colors (16 bytes a vertex) become normalized bytes (4 bytes a vertex). Plain glTF, no extension. */
function shrinkVertexColors(doc) {
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const color = prim.getAttribute('COLOR_0');
      if (!color || !(color.getArray() instanceof Float32Array)) continue;
      const src = color.getArray();
      const out = new Uint8Array(src.length);
      for (let i = 0; i < src.length; i++) out[i] = Math.round(Math.min(1, Math.max(0, src[i])) * 255);
      color.setArray(out).setNormalized(true);
    }
  }
}

/** Every triangle gets a plain, matte, non-metal material so it looks right without an environment map. */
function plainMaterials(doc) {
  const root = doc.getRoot();
  let fallback = null;
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      if (!prim.getMaterial()) {
        if (!fallback) fallback = doc.createMaterial('companion').setBaseColorFactor([1, 1, 1, 1]);
        prim.setMaterial(fallback);
      }
    }
  }
  for (const material of root.listMaterials()) {
    material.setMetallicFactor(0);
    material.setRoughnessFactor(Math.max(0.7, material.getMetallicRoughnessTexture() ? 0.9 : material.getRoughnessFactor()));
    material.setMetallicRoughnessTexture(null);
    material.setNormalTexture(null); // the headset shades with its own simple lighting; a normal map is dead weight
    material.setOcclusionTexture(null);
    material.setEmissiveTexture(null).setEmissiveFactor([0, 0, 0]);
    material.setDoubleSided(true); // generated meshes are not always closed or wound consistently
    for (const ext of material.listExtensions()) ext.dispose(); // clearcoat, specular and friends: not worth it on a Quest
  }
}

/**
 * Turns whatever the generator produced into a headset-ready .glb.
 * `yaw` (radians) turns the whole model about the up axis, for generators whose models face away from +Z.
 * Returns { glb: Buffer, before: {...}, after: {...} } where before/after are inspectGlb() reports.
 */
export async function optimizeGlb(input, { maxTriangles = MAX_TRIANGLES, maxTexture = MAX_TEXTURE, yaw = 0 } = {}) {
  const io = await getIO();
  const doc = await io.readBinary(new Uint8Array(input));
  const root = doc.getRoot();
  const before = { bytes: input.length, ...countTriangles(doc), textures: root.listTextures().length };
  if (before.triangles < 4) throw new Error('the model has no triangles');

  // Drop anything that is not the mesh itself.
  for (const animation of root.listAnimations()) animation.dispose();
  for (const skin of root.listSkins()) skin.dispose();
  for (const camera of root.listCameras()) camera.dispose();

  await doc.transform(dedup(), weld());

  // Careful simplification first (keeps seams and silhouette), loosening the allowed error step by step.
  for (const error of [0.005, 0.02, 0.06]) {
    const now = countTriangles(doc).triangles;
    if (now <= maxTriangles) break;
    const ratio = Math.max(0.01, (maxTriangles * 0.97) / now);
    await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error, lockBorder: false }));
  }
  if (countTriangles(doc).triangles > maxTriangles) sloppy(doc, maxTriangles);

  plainMaterials(doc);
  await doc.transform(prune({ keepAttributes: false, keepLeaves: false, propertyTypes: [PropertyType.NODE, PropertyType.MESH, PropertyType.MATERIAL, PropertyType.TEXTURE, PropertyType.ACCESSOR, PropertyType.BUFFER] }));

  smoothNormals(doc);
  shrinkVertexColors(doc);

  // Textures: at most maxTexture on a side; JPEG for colour, PNG kept only where transparency is used.
  if (root.listTextures().length) {
    const opaque = root.listMaterials().every((m) => m.getAlphaMode() === 'OPAQUE');
    await doc.transform(
      textureCompress({ encoder: sharp, resize: [maxTexture, maxTexture], targetFormat: opaque ? 'jpeg' : undefined, quality: 82 }),
    );
  }

  // Turn the model to face +Z by putting everything under one rotated node.
  if (yaw) {
    const turn = doc.createNode('companion').setRotation([0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)]);
    for (const scene of root.listScenes()) {
      for (const child of scene.listChildren()) turn.addChild(child);
      scene.addChild(turn);
    }
  }

  // No compression extensions in the output: plain accessors load everywhere.
  for (const ext of root.listExtensionsUsed()) {
    if (/draco|meshopt|quantization|basisu|webp|avif/i.test(ext.extensionName)) ext.dispose();
  }
  await doc.transform(unpartition());

  const glb = Buffer.from(await io.writeBinary(doc));
  const after = await inspectGlb(glb);
  if (after.triangles < 4) throw new Error('nothing was left after simplifying');
  return { glb, before, after };
}
