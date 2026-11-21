// Frost Slice models and materials.
//
// The fruit, the cut halves, the ice block, the blade and the scene props are the Unity meshes exported to
// /models/*.glb (geometry + linear vertex colours, no normals, no textures; Unity x negated, +Z forward).
// A file that is missing or broken is replaced by a simple shape in the same colours, so the game always runs.
//
// Everything lit shares ONE material: the Unity shader WishWorld/VertexColorLit (faceted half-Lambert sun
// plus flat ambient, docs/UNITY_PARITY.md 4.3). The blades use the same shader with Unity's glow
// (M_VertexLit_Glow: _Glow 0.55, _GlowColor ice).
//   - In the shell that material is the shell's own (/shared/models.js sharedVertexLit), so the game is drawn
//     exactly like the hub and the worlds, and the light is set through the shell's setLighting to this
//     scene's values (Game_FrostSlice.unity: white sun at Euler(50, -30, 0), ambient (0.72, 0.72, 0.74)).
//     The shell's light is put back when the tab is left.
//   - Without the shell's models module (the dev harness) the same formula is compiled here.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FRUITS, LAYOUT, COLORS } from './rules.js';

const VERT = /* glsl */ `
attribute vec4 color;
varying vec3 vColor;
varying vec3 vWorld;
void main() {
  vColor = color.rgb;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const FRAG = /* glsl */ `
uniform vec3 uToSun;
uniform vec3 uSun;
uniform vec3 uAmbient;
uniform vec3 uGlowColor;
uniform float uGlow;
varying vec3 vColor;
varying vec3 vWorld;
void main() {
  vec3 albedo = vColor;
  // One normal per triangle, turned toward the eye (the meshes carry no normals).
  vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  n *= sign(dot(n, cameraPosition - vWorld));
  float wrap = clamp(dot(n, uToSun), 0.0, 1.0) * 0.5 + 0.5;          // half Lambert
  vec3 lit = albedo * (uSun * wrap * wrap * 0.62 + uAmbient * 0.61);
  lit += uGlowColor * uGlow * (0.3 + 0.7 * albedo);
  gl_FragColor = vec4(lit, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const toLinear = (x) => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));

/** Give a geometry one flat vertex colour (sRGB in, stored linear as the exports are). */
function paint(geometry, rgb) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  if (g !== geometry) geometry.dispose();
  const n = g.attributes.position.count;
  const data = new Float32Array(n * 4);
  const r = toLinear(rgb[0]), gg = toLinear(rgb[1]), b = toLinear(rgb[2]);
  for (let i = 0; i < n; i++) { data[i * 4] = r; data[i * 4 + 1] = gg; data[i * 4 + 2] = b; data[i * 4 + 3] = 1; }
  g.setAttribute('color', new THREE.BufferAttribute(data, 4));
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  return g;
}

/** Join painted, non-indexed geometries into one. */
function join(parts) {
  let total = 0;
  for (const p of parts) total += p.attributes.position.count;
  const pos = new Float32Array(total * 3), col = new Float32Array(total * 4);
  let at = 0;
  for (const p of parts) {
    pos.set(p.attributes.position.array, at * 3);
    col.set(p.attributes.color.array, at * 4);
    at += p.attributes.position.count;
    p.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 4));
  g.computeBoundingSphere();
  return g;
}

// ---- stand-ins, shaped like the builder's own generated meshes (Builder.Games.cs) ----------------------

function fallbackWhole(kind) {
  const [x, y, z] = kind.size;
  return join([paint(new THREE.IcosahedronGeometry(0.5, 1).scale(x, y, z), kind.skin)]);
}

function fallbackHalf(kind) {
  const [x, y, z] = kind.size;
  // Dome up, flat cut face (the flesh) down.
  const dome = paint(new THREE.SphereGeometry(0.5, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(x, y, z), kind.skin);
  const face = paint(new THREE.CircleGeometry(0.5, 10).rotateX(Math.PI / 2).scale(x, 1, z), kind.flesh);
  return join([dome, face]);
}

function fallbackIce() {
  return join([
    paint(new THREE.BoxGeometry(0.15, 0.13, 0.14).rotateY(0.38), COLORS.ice),
    paint(new THREE.BoxGeometry(0.07, 0.05, 0.07).translate(0.03, 0.075, 0.01), [0.98, 0.98, 0.98]),
  ]);
}

function fallbackBlade() {
  // Runs along +Z from the grip: slate handle, peach guard, ice blade; the tip is at z = 0.64.
  return join([
    paint(new THREE.BoxGeometry(0.028, 0.028, 0.13), COLORS.slate),
    paint(new THREE.BoxGeometry(0.1, 0.022, 0.022).translate(0, 0, 0.075), COLORS.peach),
    paint(new THREE.BoxGeometry(0.012, 0.05, 0.5).translate(0, 0, 0.34), COLORS.ice),
    paint(new THREE.ConeGeometry(0.025, 0.05, 4).rotateX(Math.PI / 2).scale(0.24, 1, 1).translate(0, 0, 0.615), COLORS.ice),
  ]);
}

function fallbackProps() {
  // A snow mound where the fruit pops out, and a ring marking where to stand.
  return join([
    paint(new THREE.SphereGeometry(0.5, 12, 6).scale(1.5, 0.5, 0.9).translate(0, 0.02, 1.78), COLORS.snow),
    paint(new THREE.SphereGeometry(0.5, 8, 5).scale(0.7, 0.36, 0.6).translate(0.5, 0.02, 1.9), COLORS.snowShade),
    paint(new THREE.SphereGeometry(0.5, 8, 5).scale(0.6, 0.3, 0.55).translate(-0.55, 0.02, 1.86), COLORS.snowShade),
    paint(new THREE.CylinderGeometry(0.45, 0.45, 0.008, 24).translate(0, 0.004, 0), COLORS.peach),
    paint(new THREE.CylinderGeometry(0.39, 0.39, 0.008, 24).translate(0, 0.006, 0), COLORS.snow),
  ]);
}

/** The 64 px soft dot Unity uses for particles and blob shadows (T_Dot: alpha = 1 - d^2). */
function makeDot() {
  const size = 64, c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - 31.5) / 31.5, dy = (y - 31.5) / 31.5;
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(Math.max(0, Math.min(1, 1 - (dx * dx + dy * dy))) * 255);
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createAssets(ctx = {}, { standIns = false } = {}) {
  const models = ctx.models || null;
  const shellLook = Boolean(models && typeof models.sharedVertexLit === 'function'
    && typeof models.createVertexLitMaterial === 'function' && typeof models.setLighting === 'function');
  const iceGlow = new THREE.Color().setRGB(COLORS.ice[0], COLORS.ice[1], COLORS.ice[2], THREE.SRGBColorSpace);
  const sun = new THREE.Vector3().fromArray(LAYOUT.toSun).normalize();       // toward the sun, world space
  let lit, glow, shared = null, lightIsOurs = false;
  if (shellLook) {
    lit = models.sharedVertexLit();
    glow = models.createVertexLitMaterial();
    glow.name = 'FrostSliceBladeGlow';
    glow.uniforms.uGlow.value = 0.55;
    glow.uniforms.uGlowColor.value.copy(iceGlow);
  } else {
    shared = {
      uToSun: { value: sun },
      uSun: { value: new THREE.Color(1, 1, 1) },                                // white, intensity 1
      uAmbient: { value: new THREE.Color(LAYOUT.ambient[0], LAYOUT.ambient[1], LAYOUT.ambient[2]) },   // used as linear numbers, as Unity does
    };
    const makeMaterial = (name, amount) => new THREE.ShaderMaterial({
      name, vertexShader: VERT, fragmentShader: FRAG, fog: false,
      uniforms: { ...shared, uGlow: { value: amount }, uGlowColor: { value: iceGlow.clone() } },
    });
    lit = makeMaterial('FrostSliceLit', 0);
    glow = makeMaterial('FrostSliceBladeGlow', 0.55);
  }

  const geo = { whole: [], half: [], ice: null, blade: null, props: null };
  const fallbacks = [];            // names of the files that were replaced by a stand-in
  let triangles = 0;

  const loader = new GLTFLoader();
  function loadGeometry(url, fallback) {
    return new Promise((resolve) => {
      const useFallback = (why) => {
        fallbacks.push(url);
        console.warn(`[frostslice] ${url} is not available (${why}); using a simple shape instead`);
        resolve(fallback());
      };
      if (standIns) { fallbacks.push(url); resolve(fallback()); return; }      // dev: as if no model file existed
      try {
        loader.load(url, (gltf) => {
          let found = null;
          gltf.scene.updateMatrixWorld(true);
          gltf.scene.traverse((o) => { if (!found && o.isMesh && o.geometry && o.geometry.attributes.position) found = o; });
          if (!found || !found.geometry.attributes.color) { useFallback('no vertex-coloured mesh in it'); return; }
          const g = found.geometry;
          g.applyMatrix4(found.matrixWorld);
          if (!g.boundingSphere) g.computeBoundingSphere();
          gltf.scene.traverse((o) => { if (o.isMesh && o.material && o.material.dispose) o.material.dispose(); });
          resolve(g);
        }, undefined, (err) => useFallback(err && err.message ? err.message : 'load failed'));
      } catch (err) { useFallback(err && err.message ? err.message : 'load failed'); }
    });
  }

  let loading = null;
  function load() {
    if (loading) return loading;
    const jobs = [];
    FRUITS.forEach((kind, i) => {
      jobs.push(loadGeometry(kind.whole, () => fallbackWhole(kind)).then((g) => { geo.whole[i] = g; }));
      jobs.push(loadGeometry(kind.half, () => fallbackHalf(kind)).then((g) => { geo.half[i] = g; }));
    });
    jobs.push(loadGeometry('/models/ice_block.glb', fallbackIce).then((g) => { geo.ice = g; }));
    jobs.push(loadGeometry('/models/blade.glb', fallbackBlade).then((g) => { geo.blade = g; }));
    jobs.push(loadGeometry('/models/frostslice_props.glb', fallbackProps).then((g) => { geo.props = g; }));
    loading = Promise.all(jobs).then(() => {
      const count = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
      triangles = [...geo.whole, ...geo.half, geo.ice, geo.blade, geo.props].reduce((sum, g) => sum + count(g), 0);
      return geo;
    });
    return loading;
  }

  const dot = makeDot();

  return {
    lit, glow, geo, dot, load, fallbacks,
    look: shellLook ? 'shell material' : 'own material',
    get triangles() { return triangles; },
    /**
     * Light the scene as Unity's Game_FrostSlice does. `yaw` is the stage's turn about Y in the world: the sun
     * stands where it does relative to the game, wherever the player was facing when it was placed.
     */
    setLight(yaw) {
      sun.fromArray(LAYOUT.toSun).normalize().applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
      if (!shellLook) return;
      models.setLighting({ sunDirection: sun, sunColor: [1, 1, 1], sunIntensity: 1, ambient: LAYOUT.ambient });
      lightIsOurs = true;
    },
    /** Hand the shell its own light back (leaving the tab). */
    restoreLight() {
      if (!lightIsOurs) return;
      lightIsOurs = false;
      try { if (ctx.environment && typeof ctx.environment.refresh === 'function') ctx.environment.refresh(); } catch { /* the next tab sets its own */ }
    },
    dispose() {
      for (const g of [...geo.whole, ...geo.half, geo.ice, geo.blade, geo.props]) if (g) g.dispose();
      if (!shellLook) lit.dispose();                       // the shell's shared material is not ours to free
      glow.dispose(); dot.dispose();
    },
  };
}
