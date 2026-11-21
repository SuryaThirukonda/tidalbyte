// WishWorld shared 3D models: the Unity look for every creature and prop, on any page.
//
//   import { loadCreature, loadModelUrl } from '/shared/models.js';
//   const turtle = await loadCreature('turtle');      // never rejects: a low-poly stand-in if the .glb is missing
//   const toy = await loadModelUrl(gift.model_url, 0.3);
//
// Used by the headset view (/vr) and the phone's AR tab. Depends only on three.js and /shared/creatures.js,
// never on anything under /vr, and works with or without WebXR.
//
// The look is Unity's VertexColorLit shader: colour from vertex colours (or a texture), one faceted normal
// per triangle, half-Lambert sun plus a flat ambient, an optional warm glow, and fog. Nothing here uses
// three.js lights, so a scene needs none: call setLighting() to match a world.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ---------------------------------------------------------------------------------------------- lighting

/** Uniforms shared by every material made here. Change them with setLighting(). */
export const lighting = {
  sunDirection: { value: new THREE.Vector3(0.3214, 0.766, 0.5567) }, // towards the sun, world space (Unity sun at 50, -30, 0)
  sunColor: { value: new THREE.Color(1, 1, 1) },                     // colour x intensity, linear
  ambient: { value: new THREE.Color(0.62, 0.62, 0.62) },             // flat ambient; Unity uses the numbers as they are
  caustic: { value: 0 },                                             // underwater light patterns, 0..1 (the reef turns them on)
  time: { value: 0 },                                                // seconds, for the caustics
};

const DEFAULT_SUN = new THREE.Vector3(0.3214, 0.766, 0.5567);

/**
 * Match a Unity world's light. Colours are the Unity inspector values (0..1 arrays, hex numbers, "#rrggbb"
 * strings or THREE.Color). `sunDirection` points from the scene towards the sun, in three.js axes
 * (Unity's vector with z negated).
 */
export function setLighting({ sunDirection, sunColor, sunIntensity = 1, ambient } = {}) {
  if (sunDirection) lighting.sunDirection.value.copy(sunDirection).normalize();
  else lighting.sunDirection.value.copy(DEFAULT_SUN);
  toLinear(sunColor ?? [1, 1, 1], lighting.sunColor.value).multiplyScalar(sunIntensity);
  // The ambient colour goes into Unity's ambient probe unconverted (docs/UNITY_PARITY.md 4.3), so the
  // inspector numbers are used as linear values here too.
  rawColor(ambient ?? [0.62, 0.62, 0.62], lighting.ambient.value);
}

function rawColor(c, out) {
  if (Array.isArray(c)) return out.setRGB(c[0], c[1], c[2]);
  if (c && c.isColor) return out.copy(c);
  if (typeof c === 'number') return out.setRGB(((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255);
  if (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)) return rawColor(parseInt(c.slice(1), 16), out);
  return toLinear(c, out);
}

/** Any colour description -> a linear THREE.Color (the space vertex colours and uniforms are kept in). */
export function toLinear(c, out = new THREE.Color()) {
  if (c && c.isColor) return out.copy(c);
  if (Array.isArray(c)) return out.setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);
  if (c && typeof c === 'object' && 'r' in c) return out.setRGB(c.r, c.g, c.b, THREE.SRGBColorSpace);
  if (typeof c === 'number' || typeof c === 'string') {
    try { return out.set(c); } catch { /* fall through */ }
  }
  return out.setRGB(1, 1, 1);
}

// ---------------------------------------------------------------------------------------------- material

const VERT = /* glsl */ `
varying vec3 vColor;
varying vec3 vViewPos;
varying vec3 vWorldPos;
#ifdef WW_MASK
attribute float _bodymask;
varying float vMask;
#endif
#ifdef WW_MAP
varying vec2 vMapUv;
#endif
#ifdef WW_SMOOTH
varying vec3 vNormalV;
#endif
#include <common>
#include <fog_pars_vertex>
void main() {
  #ifdef WW_MASK
  vMask = _bodymask;
  #endif
  vColor = vec3(1.0);
  #ifdef USE_COLOR
  vColor = color.rgb;
  #endif
  #ifdef WW_MAP
  vMapUv = uv;
  #endif
  #include <begin_vertex>
  #include <project_vertex>
  vViewPos = -mvPosition.xyz;
  vec4 wp = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  wp = instanceMatrix * wp;
  #endif
  vWorldPos = (modelMatrix * wp).xyz;
  #ifdef WW_SMOOTH
  vec3 n = normal;
  #ifdef USE_INSTANCING
  n = mat3(instanceMatrix) * n;
  #endif
  vNormalV = normalMatrix * n;
  #endif
  #include <fog_vertex>
}`;

const FRAG = /* glsl */ `
uniform vec3 uBase;
uniform float uOpacity;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uAmbient;
uniform float uAmbientBoost;
uniform float uCaustic;
uniform float uTime;
varying vec3 vWorldPos;
uniform float uGlow;
uniform vec3 uGlowColor;
uniform vec3 uTint;
uniform float uTintAmount;
#ifdef WW_MAP
uniform sampler2D map;
varying vec2 vMapUv;
#endif
#ifdef WW_SMOOTH
varying vec3 vNormalV;
#endif
#ifdef WW_MASK
varying float vMask;
#endif
varying vec3 vColor;
varying vec3 vViewPos;
#include <common>
#include <fog_pars_fragment>
void main() {
  vec3 albedo = vColor * uBase;
  float alpha = uOpacity;
  #ifdef WW_MAP
  vec4 texel = texture2D(map, vMapUv);
  albedo *= texel.rgb;
  alpha *= texel.a;
  #endif
  #ifdef WW_CUTOUT
  if (alpha < 0.5) discard;
  #endif
  float luma = dot(albedo, vec3(0.299, 0.587, 0.114));
  float tintMask = uTintAmount;
  #ifdef WW_MASK
  tintMask *= vMask;                       // 1 = body, 0 = eyes, bellies, beaks: a colour wish repaints only the body
  #endif
  albedo = mix(albedo, uTint * clamp(luma * 1.2 + 0.3, 0.0, 1.0), tintMask);
  #ifdef WW_SMOOTH
  vec3 n = normalize(vNormalV);
  if (!gl_FrontFacing) n = -n;
  #else
  // One normal per triangle, from how the position changes across the screen: the faceted retro look.
  vec3 n = normalize(cross(dFdx(vViewPos), dFdy(vViewPos)));
  #endif
  vec3 l = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
  float ndl = clamp(dot(n, l), 0.0, 1.0) * 0.5 + 0.5;
  #ifdef WW_SMOOTH
  // Toon bands for smooth (generated and scanned) models, so they share the library's flat-lit look.
  float q = ndl * 3.0;
  ndl = mix(ndl, (floor(q) + smoothstep(0.4, 0.6, fract(q))) / 3.0, 0.8);
  #endif
  vec3 lit = albedo * (uSunColor * ndl * ndl * 0.62 + uAmbient * (0.4 + uAmbientBoost * 0.6));
  if (uCaustic > 0.0) {
    // Moving underwater light: crossing sine waves over the world's xz, brightest on upward-facing surfaces.
    vec2 p = vWorldPos.xz * 1.7 + vWorldPos.y * 0.3;
    float c = sin(p.x * 3.1 + uTime * 1.3) + sin(p.y * 2.7 - uTime * 1.1) + sin((p.x + p.y) * 2.3 + uTime * 0.9) + sin((p.x - p.y) * 3.7 - uTime * 1.6);
    float caust = pow(clamp(1.0 - abs(c) * 0.5, 0.0, 1.0), 4.0);
    float up = clamp(dot(n, normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz)) * 0.5 + 0.5, 0.0, 1.0);
    lit += albedo * caust * uCaustic * 0.6 * up;
  }
  lit += uGlowColor * uGlow * (0.3 + 0.7 * albedo);
  #ifdef USE_FOG
  // Unity's fog: a straight line between near and far, mixed in linear light. (three.js's own fog chunk
  // eases with a smoothstep and mixes after the sRGB conversion, which reads hazier up close.)
  vec3 fogLinear = mix(fogColor / 12.92, pow((fogColor + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), fogColor));
  lit = mix(lit, fogLinear, clamp((vFogDepth - fogNear) / (fogFar - fogNear), 0.0, 1.0));
  #endif
  gl_FragColor = vec4(lit, alpha);
  #include <colorspace_fragment>
}`;

/**
 * The Unity VertexColorLit look as a three.js material.
 *   vertexColors  use the mesh's COLOR_0 (default true)
 *   map           optional texture (multiplied in)
 *   color         base colour multiplier
 *   flat          faceted shading (default true; false uses the mesh normals, for scanned toys)
 *   transparent / opacity / cutout / side
 * Instances share the light uniforms; glow and tint are per material (see setGlow / setTint).
 */
export function createVertexLitMaterial({
  vertexColors = true, map = null, color = 0xffffff, flat = true, bodyMask = false,
  transparent = false, opacity = 1, cutout = false, side = THREE.FrontSide, fog = true,
} = {}) {
  const defines = {};
  if (bodyMask) defines.WW_MASK = 1;
  if (map) defines.WW_MAP = 1;
  if (!flat) defines.WW_SMOOTH = 1;
  if (cutout) defines.WW_CUTOUT = 1;
  const uniforms = {
    uBase: { value: toLinear(color) },
    uOpacity: { value: opacity },
    uSunDir: lighting.sunDirection,
    uSunColor: lighting.sunColor,
    uAmbient: lighting.ambient,
    uAmbientBoost: { value: 0.35 },
    uCaustic: lighting.caustic,
    uTime: lighting.time,
    uGlow: { value: 0 },
    uGlowColor: { value: new THREE.Color().setRGB(1, 0.85, 0.6, THREE.SRGBColorSpace) },
    uTint: { value: new THREE.Color(1, 1, 1) },
    uTintAmount: { value: 0 },
    map: { value: map },
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
  };
  const m = new THREE.ShaderMaterial({
    name: 'WWVertexLit', defines, uniforms, vertexShader: VERT, fragmentShader: FRAG,
    vertexColors, fog, transparent, side, depthWrite: !transparent,
  });
  m.userData.wwVertexLit = true;
  return m;
}

let sharedLit = null, sharedLitMasked = null;
/**
 * The one material every vertex-coloured mesh shares (fewest state changes). `bodyMask` is the variant for
 * meshes that carry Unity's body mask (the exported `_BODYMASK` attribute), so that tints skip eyes and beaks.
 */
export function sharedVertexLit(bodyMask = false) {
  if (bodyMask) {
    if (!sharedLitMasked) sharedLitMasked = createVertexLitMaterial({ bodyMask: true });
    return sharedLitMasked;
  }
  if (!sharedLit) sharedLit = createVertexLitMaterial();
  return sharedLit;
}

// Glow and tint are per object: the first time one is set, the object's meshes get their own copy of the
// material (same compiled program, so it costs a few uniforms, not a shader).
function ownMaterials(object) {
  if (object.userData.wwOwn) return object.userData.wwOwn;
  const own = [];
  const seen = new Map();
  object.traverse((o) => {
    if (!o.isMesh || !o.material || !o.material.userData || !o.material.userData.wwVertexLit) return;
    let copy = seen.get(o.material);
    if (!copy) {
      copy = o.material.clone();
      copy.uniforms.uSunDir = lighting.sunDirection;
      copy.uniforms.uSunColor = lighting.sunColor;
      copy.uniforms.uAmbient = lighting.ambient;
      copy.uniforms.uCaustic = lighting.caustic;
      copy.uniforms.uTime = lighting.time;
      copy.userData.wwVertexLit = true;
      seen.set(o.material, copy);
      own.push(copy);
    }
    o.material = copy;
  });
  object.userData.wwOwn = own;
  return own;
}

// ---------------------------------------------------------------------------------------------- outlines

const OUTLINES = !/[?&]outline=0/.test(globalThis.location ? location.search : '');
let outlineMaterial = null;
/**
 * A dark outline round every mesh of a creature (the toon look shared by library and generated models): a
 * back-facing shell a few percent larger, sharing the mesh's geometry. It never takes pointer hits.
 */
export function addOutline(object, { scale = 1.045 } = {}) {
  if (!OUTLINES || !object || object.userData.outlined) return object;
  object.userData.outlined = true;
  if (!outlineMaterial) outlineMaterial = new THREE.MeshBasicMaterial({ color: 0x22303f, side: THREE.BackSide, fog: true });
  const meshes = [];
  object.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && o.geometry && !o.userData.isOutline) meshes.push(o); });
  for (const m of meshes) {
    const g = m.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    const c = g.boundingBox.getCenter(new THREE.Vector3());
    const shell = new THREE.Mesh(g, outlineMaterial);
    shell.userData.isOutline = true;
    shell.raycast = () => {};
    shell.scale.setScalar(scale);
    shell.position.copy(c).multiplyScalar(1 - scale);   // grow about the mesh's middle, not its origin
    shell.renderOrder = -1;
    m.add(shell);
  }
  return object;
}

/** The fact-card highlight: 0 = none, about 0.25 = pointed at, 0.55 = talking. */
export function setGlow(object, amount) {
  if (!object) return;
  if (amount <= 0 && !object.userData.wwOwn) return;
  for (const m of ownMaterials(object)) m.uniforms.uGlow.value = amount;
}

/** Recolour a creature (Unity's colour commands). amount 0 restores its own colours. */
export function setTint(object, color, amount = 1) {
  if (!object) return;
  for (const m of ownMaterials(object)) {
    toLinear(color, m.uniforms.uTint.value);
    m.uniforms.uTintAmount.value = amount;
  }
}

// ---------------------------------------------------------------------------------------------- mesh builder

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _c = new THREE.Color();
const DEG = Math.PI / 180;

/**
 * A port of the Unity project's MeshBuilder: one low-poly mesh out of coloured primitives, colour in the
 * vertex colours. Positions, sizes (full extents, metres) and Euler angles (degrees) are written exactly as
 * in the Unity source (left-handed, +Z forward); build() converts to three.js:
 *   mirror 'z' (default): Unity +Z becomes three -Z, for scenery laid out around a viewer who looks down -Z;
 *   mirror 'x': the model keeps facing +Z, as creatures do.
 * No normals are stored: the material shades each triangle flat.
 */
export class MeshBuilder {
  constructor() { this.pos = []; this.col = []; this.idx = []; }

  get triangleCount() { return this.idx.length / 3; }

  _add(verts, tris, pos, size, euler, color) {
    const start = this.pos.length / 3;
    if (euler) _q.setFromEuler(_e.set(euler[0] * DEG, euler[1] * DEG, euler[2] * DEG, 'YXZ'));
    else _q.identity();
    toLinear(color, _c);
    for (let i = 0; i < verts.length; i += 3) {
      _v.set(verts[i] * size[0], verts[i + 1] * size[1], verts[i + 2] * size[2]).applyQuaternion(_q);
      this.pos.push(pos[0] + _v.x, pos[1] + _v.y, pos[2] + _v.z);
      this.col.push(_c.r, _c.g, _c.b);
    }
    for (let i = 0; i < tris.length; i++) this.idx.push(start + tris[i]);
    return this;
  }

  static _grid(t, rings, seg) {
    for (let r = 0; r < rings; r++) {
      for (let s = 0; s < seg; s++) {
        const a = r * (seg + 1) + s, b = a + seg + 1;
        t.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }

  sphere(pos, size, color, euler = null, seg = 7) {
    const v = [], t = [];
    const rings = Math.max(3, Math.floor(seg * 2 / 3));
    for (let r = 0; r <= rings; r++) {
      const phi = Math.PI * r / rings;
      for (let s = 0; s <= seg; s++) {
        const th = 2 * Math.PI * s / seg;
        v.push(Math.sin(phi) * Math.cos(th) * 0.5, Math.cos(phi) * 0.5, Math.sin(phi) * Math.sin(th) * 0.5);
      }
    }
    MeshBuilder._grid(t, rings, seg);
    return this._add(v, t, pos, size, euler, color);
  }

  /** Dome, flat side down, with a cap. */
  hemisphere(pos, size, color, capColor, euler = null, seg = 10) {
    const v = [], t = [];
    const rings = Math.max(2, Math.floor(seg / 3));
    for (let r = 0; r <= rings; r++) {
      const phi = Math.PI * 0.5 * r / rings;
      for (let s = 0; s <= seg; s++) {
        const th = 2 * Math.PI * s / seg;
        v.push(Math.sin(phi) * Math.cos(th) * 0.5, Math.cos(phi) * 0.5, Math.sin(phi) * Math.sin(th) * 0.5);
      }
    }
    MeshBuilder._grid(t, rings, seg);
    this._add(v, t, pos, size, euler, color);
    const cv = [0, 0, 0], ct = [];
    for (let s = 0; s <= seg; s++) { const th = 2 * Math.PI * s / seg; cv.push(Math.cos(th) * 0.5, 0, Math.sin(th) * 0.5); }
    for (let s = 0; s < seg; s++) ct.push(0, 1 + s, 2 + s);
    return this._add(cv, ct, pos, size, euler, capColor ?? color);
  }

  cube(pos, size, color, euler = null) { return this.taperBox(pos, size, color, euler, 1, 1); }

  /** Box whose top face is scaled (topX, topZ): the building block of the blocky look. */
  taperBox(pos, size, color, euler = null, topX = 1, topZ = 1) {
    const v = [], t = [];
    const P = (x, y, z) => [x * 0.5 * (y > 0 ? topX : 1), y * 0.5, z * 0.5 * (y > 0 ? topZ : 1)];
    const face = (a, b, c, d) => {
      const s = v.length / 3;
      v.push(...a, ...b, ...c, ...d);
      t.push(s, s + 1, s + 2, s, s + 2, s + 3);
    };
    face(P(-1, 1, -1), P(-1, 1, 1), P(1, 1, 1), P(1, 1, -1));
    face(P(-1, -1, 1), P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1));
    face(P(-1, -1, -1), P(-1, 1, -1), P(1, 1, -1), P(1, -1, -1));
    face(P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1), P(-1, -1, 1));
    face(P(-1, -1, 1), P(-1, 1, 1), P(-1, 1, -1), P(-1, -1, -1));
    face(P(1, -1, -1), P(1, 1, -1), P(1, 1, 1), P(1, -1, 1));
    return this._add(v, t, pos, size, euler, color);
  }

  /** Cylinder along Y. topScale 0 makes a cone. */
  cylinder(pos, size, color, euler = null, topScale = 1, seg = 6) {
    const v = [], t = [];
    for (let s = 0; s <= seg; s++) {
      const th = 2 * Math.PI * s / seg, x = Math.cos(th), z = Math.sin(th);
      v.push(x * 0.5, -0.5, z * 0.5, x * 0.5 * topScale, 0.5, z * 0.5 * topScale);
    }
    for (let s = 0; s < seg; s++) { const a = s * 2; t.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const c0 = v.length / 3;
    v.push(0, -0.5, 0);
    for (let s = 0; s <= seg; s++) { const th = 2 * Math.PI * s / seg; v.push(Math.cos(th) * 0.5, -0.5, Math.sin(th) * 0.5); }
    for (let s = 0; s < seg; s++) t.push(c0, c0 + 1 + s, c0 + 2 + s);
    if (topScale > 0.01) {
      const c1 = v.length / 3;
      v.push(0, 0.5, 0);
      for (let s = 0; s <= seg; s++) { const th = 2 * Math.PI * s / seg; v.push(Math.cos(th) * 0.5 * topScale, 0.5, Math.sin(th) * 0.5 * topScale); }
      for (let s = 0; s < seg; s++) t.push(c1, c1 + 2 + s, c1 + 1 + s);
    }
    return this._add(v, t, pos, size, euler, color);
  }

  cone(pos, size, color, euler = null, seg = 6) { return this.cylinder(pos, size, color, euler, 0, seg); }

  /** Flat disc facing up. size = [x, z] full extents. */
  disc(pos, size, color, euler = null, seg = 12) {
    const v = [0, 0, 0], t = [];
    for (let s = 0; s <= seg; s++) { const th = 2 * Math.PI * s / seg; v.push(Math.cos(th) * 0.5, 0, Math.sin(th) * 0.5); }
    for (let s = 0; s < seg; s++) t.push(0, 2 + s, 1 + s);
    return this._add(v, t, pos, [size[0], 1, size[1]], euler, color);
  }

  /** Copy another builder in, moved, turned about Y (degrees) and scaled. */
  append(other, pos = [0, 0, 0], yaw = 0, scale = 1) {
    if (!other) return this;
    const start = this.pos.length / 3;
    _q.setFromEuler(_e.set(0, yaw * DEG, 0, 'YXZ'));
    for (let i = 0; i < other.pos.length; i += 3) {
      _v.set(other.pos[i] * scale, other.pos[i + 1] * scale, other.pos[i + 2] * scale).applyQuaternion(_q);
      this.pos.push(pos[0] + _v.x, pos[1] + _v.y, pos[2] + _v.z);
    }
    for (let i = 0; i < other.col.length; i++) this.col.push(other.col[i]);
    for (let i = 0; i < other.idx.length; i++) this.idx.push(start + other.idx[i]);
    return this;
  }

  /** -> THREE.BufferGeometry with position, color and an index. */
  build({ mirror = 'z' } = {}) {
    const n = this.pos.length / 3;
    const p = new Float32Array(this.pos);
    const axis = mirror === 'x' ? 0 : mirror === 'z' ? 2 : -1;
    if (axis >= 0) for (let i = axis; i < p.length; i += 3) p[i] = -p[i];
    const Index = n > 65535 ? Uint32Array : Uint16Array;
    const ix = new Index(this.idx.length);
    // Read as right-handed numbers, a Unity triangle already winds the way three.js wants. Mirroring an
    // axis reverses that, so the order is swapped whenever the mesh is mirrored.
    for (let i = 0; i < this.idx.length; i += 3) {
      ix[i] = this.idx[i];
      ix[i + 1] = axis >= 0 ? this.idx[i + 2] : this.idx[i + 1];
      ix[i + 2] = axis >= 0 ? this.idx[i + 1] : this.idx[i + 2];
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.col), 3));
    g.setIndex(new THREE.BufferAttribute(ix, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }

  /** -> THREE.Mesh on the shared vertex-lit material. */
  mesh(options) {
    const m = new THREE.Mesh(this.build(options), sharedVertexLit());
    m.matrixAutoUpdate = true;
    return m;
  }
}

// ---------------------------------------------------------------------------------------------- creature table

let creatureTable = null;
/** /shared/creatures.js, loaded on first use. A page still works if that file is missing or broken. */
function creatureLibrary() {
  if (!creatureTable) {
    creatureTable = import('/shared/creatures.js').catch((err) => {
      console.warn('[wishworld] creature table unavailable, using stand-ins', err && err.message);
      return {};
    });
  }
  return creatureTable;
}

const FALLBACK_COLORS = [0xfa7a1a, 0x4f9ad6, 0x8ccf6a, 0xf2c14e, 0xc78be0, 0xf08a8a];
function hashString(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }

/** A creature row with every field the 3D code reads, whatever the table calls them. Never null. */
export function describeCreature(row, id = 'creature') {
  const c = row || {};
  const cid = String(c.id ?? id);
  const move = String(c.move ?? c.moveType ?? c.movement ?? 'swim').toLowerCase();
  return {
    ...c,
    id: cid,
    name: c.name ?? c.displayName ?? cid.charAt(0).toUpperCase() + cid.slice(1),
    move: move === 'float' ? 'hover' : move,
    size: Number(c.size) > 0 ? Number(c.size) : 0.3,
    color: c.color ?? c.colour ?? FALLBACK_COLORS[hashString(cid) % FALLBACK_COLORS.length],
    accent: c.accent ?? c.color2 ?? null,
    habitat: c.habitat ?? c.world ?? '',
    speed: Number(c.speed) > 0 ? Number(c.speed) : 0.35,
    schooling: Boolean(c.schooling ?? c.school),
    fact: c.fact ?? '',
    file: c.model ?? c.file ?? null,
  };
}

/** The creature row for an id (described), or a generic fish for an unknown id. */
export async function getCreature(id) {
  const lib = await creatureLibrary();
  let row = null;
  try {
    if (typeof lib.creatureById === 'function') row = lib.creatureById(id);
    else if (Array.isArray(lib.CREATURES)) row = lib.CREATURES.find((c) => c && c.id === id);
    else if (lib.CREATURES && typeof lib.CREATURES === 'object') row = lib.CREATURES[id];
  } catch { row = null; }
  return describeCreature(row, id);
}

// ---------------------------------------------------------------------------------------------- loading

const gltfLoader = new GLTFLoader();
const glbCache = new Map();      // url -> Promise<THREE.Object3D> (the template; callers get clones)
let manifestPromise = null;

/** /models/manifest.json as a Map of id -> entry. Empty when the file is missing. */
export function loadManifest() {
  if (!manifestPromise) {
    manifestPromise = fetch('/models/manifest.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : { models: [] }))
      .then((data) => {
        const map = new Map();
        for (const m of (data && data.models) || []) if (m && m.id) map.set(String(m.id), m);
        return map;
      })
      .catch(() => new Map());
  }
  return manifestPromise;
}

function convertMaterials(root, { flat = true } = {}) {
  const made = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = true;
    o.castShadow = o.receiveShadow = false;
    const src = Array.isArray(o.material) ? o.material[0] : o.material;
    const hasColors = Boolean(o.geometry && o.geometry.attributes.color);
    const map = src && src.map ? src.map : null;
    const plain = hasColors && !map && (!src || !src.transparent) && flat
      && (!src || !src.color || (src.color.r > 0.98 && src.color.g > 0.98 && src.color.b > 0.98));
    const masked = Boolean(o.geometry && o.geometry.attributes._bodymask);
    if (plain) { o.material = sharedVertexLit(masked); return; }
    const key = (src ? src.uuid : 'none') + (hasColors ? 'c' : 'n') + (masked ? 'm' : '');
    let m = made.get(key);
    if (!m) {
      m = createVertexLitMaterial({
        vertexColors: hasColors, map, flat, bodyMask: masked,
        color: src && src.color ? src.color : 0xffffff,
        transparent: Boolean(src && src.transparent && src.opacity < 0.999),
        opacity: src && src.opacity !== undefined ? src.opacity : 1,
        cutout: Boolean(src && src.alphaTest > 0),
        side: src && src.side !== undefined ? src.side : THREE.FrontSide,
      });
      made.set(key, m);
    }
    o.material = m;
    if (src && src.dispose && src !== m) src.dispose();
  });
}

function loadTemplate(url, options) {
  const key = url + (options && options.flat === false ? '|smooth' : '');
  let p = glbCache.get(key);
  if (!p) {
    p = new Promise((resolve, reject) => {
      gltfLoader.load(url, (gltf) => {
        try {
          const root = gltf.scene || (gltf.scenes && gltf.scenes[0]);
          if (!root) throw new Error('empty model');
          convertMaterials(root, options);
          root.updateMatrixWorld(true);
          resolve(root);
        } catch (err) { reject(err); }
      }, undefined, (err) => reject(err instanceof Error ? err : new Error('Could not load ' + url)));
    });
    p.catch(() => glbCache.delete(key));
    glbCache.set(key, p);
  }
  return p;
}

/** A cached .glb as a fresh clone in the Unity look (geometry and materials are shared between clones). */
export async function loadGLB(url, options) {
  const template = await loadTemplate(url, options);
  return template.clone(true);
}

const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _center = new THREE.Vector3();

/**
 * Wrap `content` in a Group so that its longest side is `targetSize` metres and its middle is at the
 * Group's origin. The Group is what callers move, turn and scale. `ground: true` puts the feet at y = 0.
 */
export function normalize(content, targetSize, { ground = false } = {}) {
  const holder = new THREE.Group();
  holder.add(content);
  content.updateMatrixWorld(true);
  _box.setFromObject(content);
  if (_box.isEmpty()) return holder;
  _box.getSize(_size);
  _box.getCenter(_center);
  const longest = Math.max(_size.x, _size.y, _size.z) || 1;
  const k = targetSize > 0 ? targetSize / longest : 1;
  content.scale.multiplyScalar(k);
  content.position.sub(_center).multiplyScalar(k);
  if (ground) content.position.y += _size.y * k * 0.5;
  holder.userData.size = targetSize > 0 ? targetSize : longest;
  holder.userData.radius = 0.5 * Math.hypot(_size.x, _size.y, _size.z) * k;
  holder.userData.height = _size.y * k;
  return holder;
}

/**
 * A library creature by id. Resolves to an Object3D whose longest side is creature.size, centred, facing +Z.
 * Never rejects: a missing or broken .glb becomes a low-poly stand-in in the creature's colour.
 * `userData.creature` is the creature row; `userData.fallback` says a stand-in was used.
 */
export async function loadCreature(id) {
  let creature = describeCreature(null, id);
  try {
    creature = await getCreature(id);
    const manifest = await loadManifest();
    const entry = manifest.get(creature.id);
    // With a manifest, only what it lists exists; without one, try the path the creature table names.
    const file = entry && entry.file ? entry.file : (manifest.size === 0 ? creature.file : null);
    if (file) {
      const url = /^(https?:)?\//.test(file) ? file : '/models/' + file;
      const model = await loadGLB(url);
      const holder = normalize(model, creature.size, { ground: creature.move === 'walk' });
      holder.name = creature.id;
      holder.userData.creature = creature;
      return addOutline(holder);
    }
  } catch (err) {
    console.warn('[wishworld] using a stand-in for', id, err && err.message);
  }
  return addOutline(fallbackCreature(creature));
}

/**
 * A scanned companion (or any .glb by URL), longest side = targetSize metres, centred. Rejects on failure.
 * Scans keep their texture and smooth normals; they are lit by the same sun as everything else.
 */
export async function loadModelUrl(url, targetSize = 0.3) {
  if (!url || typeof url !== 'string') throw new Error('No model to load.');
  const model = await loadGLB(url, { flat: false });
  let triangles = 0;
  model.traverse((o) => {
    if (o.isMesh && o.geometry) triangles += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
  });
  if (triangles === 0) throw new Error('That model is empty.');
  const holder = normalize(model, targetSize);
  holder.userData.triangles = Math.round(triangles);
  return addOutline(holder);
}

// ---------------------------------------------------------------------------------------------- stand-ins

const W = [0.98, 0.98, 0.98], K = [0.08, 0.08, 0.10];

function shade(color, k) {
  const c = toLinear(color).clone().convertLinearToSRGB();
  return k >= 0
    ? [c.r + (1 - c.r) * k, c.g + (1 - c.g) * k, c.b + (1 - c.b) * k]
    : [c.r * (1 + k), c.g * (1 + k), c.b * (1 + k)];
}

// Unity's blocky fish (CreatureMeshes.Fish): two tapered boxes nose to tail, wedge fins.
function fishShape(len, body, fin) {
  const b = new MeshBuilder();
  b.taperBox([0, 0, len * 0.2], [len * 0.26, len * 0.4, len * 0.4], body, [90, 0, 0], 0.55, 0.6);
  b.taperBox([0, 0, -len * 0.2], [len * 0.26, len * 0.4, len * 0.4], body, [-90, 0, 0], 0.4, 0.35);
  b.taperBox([0, 0, -len * 0.5], [len * 0.05, len * 0.22, len * 0.4], fin, [90, 0, 0], 1, 0.15);
  b.taperBox([0, len * 0.27, -len * 0.04], [len * 0.05, len * 0.16, len * 0.3], fin, null, 1, 0.3);
  for (const s of [-1, 1]) {
    b.taperBox([s * len * 0.15, -len * 0.08, len * 0.08], [len * 0.04, len * 0.14, len * 0.16], fin, [0, 0, s * -70], 1, 0.4);
    b.cube([s * len * 0.105, len * 0.07, len * 0.27], [len * 0.075, len * 0.075, len * 0.075], W);
    b.cube([s * len * 0.125, len * 0.07, len * 0.285], [len * 0.04, len * 0.04, len * 0.04], K);
  }
  b.cube([0, 0, len * 0.14], [len * 0.27, len * 0.37, len * 0.07], shade(body, 0.75));
  return b;
}

function birdShape(len, body, wing) {
  const b = new MeshBuilder();
  b.taperBox([0, 0, 0], [len * 0.3, len * 0.3, len * 0.62], body, [90, 0, 0], 0.5, 0.5);                      // body, nose forward
  b.taperBox([0, len * 0.14, len * 0.3], [len * 0.24, len * 0.22, len * 0.24], body, null, 0.8, 0.8);          // head
  b.taperBox([0, len * 0.12, len * 0.46], [len * 0.08, len * 0.16, len * 0.07], [1.0, 0.72, 0.3], [90, 0, 0], 0.2, 0.3); // beak
  b.taperBox([0, 0.02 * len, -len * 0.42], [len * 0.22, len * 0.3, len * 0.04], wing, [-78, 0, 0], 0.5, 1);   // tail
  for (const s of [-1, 1]) {
    b.taperBox([s * len * 0.42, len * 0.06, 0], [len * 0.6, len * 0.035, len * 0.34], wing, [0, 0, s * 12], 1, 1);
    b.taperBox([s * len * 0.78, len * 0.14, -len * 0.03], [len * 0.3, len * 0.03, len * 0.22], shade(wing, -0.18), [0, 0, s * 22], 1, 1);
    b.cube([s * len * 0.1, len * 0.19, len * 0.4], [len * 0.045, len * 0.045, len * 0.045], K);
  }
  return b;
}

function animalShape(len, body, dark) {
  const b = new MeshBuilder();
  const h = len * 0.5;
  b.taperBox([0, h, 0], [len * 0.36, len * 0.34, len * 0.74], body, null, 0.86, 0.94);                         // torso
  b.taperBox([0, h + len * 0.2, len * 0.42], [len * 0.28, len * 0.28, len * 0.3], body, null, 0.84, 0.84);     // head
  b.taperBox([0, h + len * 0.14, len * 0.6], [len * 0.18, len * 0.14, len * 0.12], shade(body, 0.35), null, 0.8, 0.8); // muzzle
  b.taperBox([0, h + len * 0.06, -len * 0.42], [len * 0.06, len * 0.26, len * 0.06], dark, [-35, 0, 0], 0.5, 0.5);     // tail
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) b.taperBox([sx * len * 0.12, h * 0.42, sz * len * 0.25], [len * 0.1, h * 0.84, len * 0.1], dark, [180, 0, 0], 0.8, 0.8);
    b.taperBox([sx * len * 0.11, h + len * 0.38, len * 0.38], [len * 0.07, len * 0.1, len * 0.05], dark, null, 0.5, 0.5); // ears
    b.cube([sx * len * 0.1, h + len * 0.24, len * 0.565], [len * 0.045, len * 0.045, len * 0.03], K);
  }
  return b;
}

function floaterShape(len, body, under) {
  const b = new MeshBuilder();
  b.hemisphere([0, len * 0.12, 0], [len * 0.74, len * 0.52, len * 0.74], body, under, null, 9);
  b.hemisphere([0, len * 0.12, 0], [len * 0.46, len * 0.2, len * 0.46], under, under, [180, 0, 0], 8);
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2;
    b.taperBox([Math.cos(a) * len * 0.2, -len * 0.16, Math.sin(a) * len * 0.2], [len * 0.05, len * 0.52, len * 0.05], under, [180, 0, 0], 0.3, 0.3);
  }
  return b;
}

const fallbackGeometry = new Map();

/** The stand-in for a creature whose .glb is missing: a fish, bird, four-legged animal or floater in its colour. */
export function fallbackCreature(creatureRow) {
  const creature = describeCreature(creatureRow, creatureRow && creatureRow.id);
  const kind = creature.move === 'fly' ? 'bird' : creature.move === 'walk' ? 'animal'
    : (creature.move === 'hover' || creature.move === 'orbit') ? 'floater' : 'fish';
  const body = shade(creature.color, 0);
  const second = creature.accent ? shade(creature.accent, 0) : shade(creature.color, kind === 'floater' ? 0.45 : -0.22);
  const key = kind + '|' + body.map((x) => x.toFixed(2)).join(',') + '|' + second.map((x) => x.toFixed(2)).join(',');
  let geometry = fallbackGeometry.get(key);
  if (!geometry) {
    const make = kind === 'bird' ? birdShape : kind === 'animal' ? animalShape : kind === 'floater' ? floaterShape : fishShape;
    geometry = make(1, body, second).build({ mirror: 'x' });
    fallbackGeometry.set(key, geometry);
  }
  const mesh = new THREE.Mesh(geometry, sharedVertexLit());
  const holder = normalize(mesh, creature.size, { ground: kind === 'animal' });
  holder.name = creature.id;
  holder.userData.creature = creature;
  holder.userData.fallback = true;
  return holder;
}
