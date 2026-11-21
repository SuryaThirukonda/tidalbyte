// The surroundings of a Unity world for VR and the desktop preview: sky, fog, light and ground, and on
// request the world's exported scenery. In AR none of it is shown: the real room is the world.
//
// Values come from WORLDS in /shared/creatures.js (docs/UNITY_PARITY.md section 2). The default, used when
// a tab asks for nothing, is the snow hub's sky and light over a plain of snow.
//
// World frame: the viewer starts at the origin looking down -Z. A Unity position (x, y, z) is (x, y, -z)
// here. The exported .glb files are mirrored the other way (Unity x negated, +Z forward), so they are added
// under a group turned half a turn about Y, which lands them in the same frame.

import * as THREE from 'three';
import { MeshBuilder, createVertexLitMaterial, setLighting, loadGLB } from '/shared/models.js';
import { colors, rgb } from './theme.js';

const HUB = {
  id: 'hub', name: 'Hub',
  sky: { texture: '/textures/sky_hub.jpg', top: '#80a1c9', horizon: '#dbe5f2', bottom: '#f2f7fc' },
  fog: '#979793', fogNear: 45, fogFar: 620,
  ground: '#f2f7fc', groundMode: 'full',
  light: { color: '#fff7eb', intensity: 1.0, toSunUnity: [0.627, 0.616, -0.477] },
  ambient: '#bdc7d9', ambientSound: null,
};

// Unity's World scene before a world is applied; also what AR uses.
const AR_LIGHT = { sunColor: [1, 1, 1], sunIntensity: 1, ambient: [0.62, 0.62, 0.62], sunDirection: new THREE.Vector3(0.3214, 0.766, 0.5567) };

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * viewMatrix * vec4(position + cameraPosition, 1.0);
  gl_Position = p.xyww;            // always at the far plane, whatever the camera's range
}`;

// Colours are written out as they are (sRGB in, sRGB out), which is how Unity shows a sky at exposure 1.
const SKY_FRAG = /* glsl */ `
uniform sampler2D map;
uniform float uUseMap;
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uBottom;
uniform float uExposure;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  vec3 c;
  if (uUseMap > 0.5) {
    vec2 uv = vec2(atan(d.z, d.x) * 0.15915494 + 0.5, asin(clamp(d.y, -1.0, 1.0)) * 0.31830989 + 0.5);
    c = texture2D(map, uv).rgb;
  } else {
    // Unity's painted sky: lerp(horizon, top, sin(elevation)^0.6) above, lerp(horizon, bottom, (-sin)^0.5) below.
    c = d.y >= 0.0 ? mix(uHorizon, uTop, pow(d.y, 0.6)) : mix(uHorizon, uBottom, pow(-d.y, 0.5));
  }
  gl_FragColor = vec4(c * uExposure, 1.0);
}`;

export function createEnvironment({ scene, isAR, isImmersive, preferLite = null, audio = null }) {
  const lite = () => (preferLite ? preferLite() : isImmersive());
  const root = new THREE.Group();
  root.name = 'Environment';
  scene.add(root);

  let worlds = [];                 // WORLDS from creatures.js, once known
  let wanted = { id: null, options: {} };
  let applied = null;              // key of what is built now
  let serial = 0;

  // ---- sky ------------------------------------------------------------------------------------------------
  const skyUniforms = {
    map: { value: null }, uUseMap: { value: 0 },
    uTop: { value: new THREE.Vector3(0.5, 0.63, 0.79) }, uHorizon: { value: new THREE.Vector3(0.86, 0.9, 0.95) },
    uBottom: { value: new THREE.Vector3(0.95, 0.97, 0.99) }, uExposure: { value: 1 },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1, 24, 12),
    new THREE.ShaderMaterial({ uniforms: skyUniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false }),
  );
  sky.name = 'Sky'; sky.frustumCulled = false; sky.renderOrder = 1000;   // after everything opaque: fills only what is left
  root.add(sky);
  const skyTextures = new Map();
  const textureLoader = new THREE.TextureLoader();

  function loadSky(url) {
    let p = skyTextures.get(url);
    if (!p) {
      p = new Promise((resolve) => {
        textureLoader.load(url, (t) => {
          t.colorSpace = THREE.NoColorSpace;           // shown as stored
          t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter;
          t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
          resolve(t);
        }, undefined, () => resolve(null));
      });
      skyTextures.set(url, p);
    }
    return p;
  }

  // ---- ground -----------------------------------------------------------------------------------------------
  const groundMaterial = createVertexLitMaterial({ color: 0xffffff });
  // Unity's WorldGround: a white disc 90 m across, tinted with the world's ground colour.
  const disc = new THREE.Mesh(new MeshBuilder().disc([0, 0, 0], [90, 90], [1, 1, 1], null, 40).build(), groundMaterial);
  disc.name = 'Ground';
  // Unity's WorldPlatform: a round platform for worlds with no ground (space, sky, the wish world).
  const platform = new THREE.Mesh(new MeshBuilder()
    .cylinder([0, -0.06, 0], [3.4, 0.12, 3.4], [1, 1, 1], null, 1, 28)
    .cylinder([0, -0.2, 0], [2.6, 0.2, 2.6], [0.8, 0.8, 0.85], null, 0.5, 28).build(), groundMaterial);
  platform.name = 'Platform';
  // The hub's base: snow out to the fog, for tabs that bring no ground of their own.
  const snowPlain = new THREE.Mesh(new MeshBuilder().disc([0, 0, 0], [1300, 1300], colors.snow, null, 40).build(), groundMaterial);
  snowPlain.name = 'SnowPlain';
  root.add(disc, platform, snowPlain);

  // ---- scenery ------------------------------------------------------------------------------------------------
  const sceneryHolder = new THREE.Group();
  sceneryHolder.name = 'Scenery';
  sceneryHolder.rotation.y = Math.PI;              // exported x-mirrored, +Z forward: turn into the viewer's frame
  root.add(sceneryHolder);
  let sceneryUrl = null;

  function clearScenery() {
    sceneryUrl = null;
    while (sceneryHolder.children.length) sceneryHolder.remove(sceneryHolder.children[0]);
  }

  function findWorld(id) {
    if (!id || id === 'hub') return HUB;
    const alias = id === 'reef' || id === 'ocean' || id === 'sea' ? 'aquarium' : id === 'wish' ? 'blank' : id;
    for (const w of worlds) if (w && w.id === alias) return w;
    return null;
  }

  function toSun(light) {
    if (light && Array.isArray(light.toSunUnity)) return new THREE.Vector3(light.toSunUnity[0], light.toSunUnity[1], -light.toSunUnity[2]);
    if (light && Array.isArray(light.toSun)) return new THREE.Vector3(-light.toSun[0], light.toSun[1], -light.toSun[2]);  // x-mirrored export axes
    return AR_LIGHT.sunDirection.clone();
  }

  function apply() {
    const ar = isAR();
    root.visible = !ar;
    if (ar) {
      // The real room: Unity forces a white light, the default ambient, no fog, no surroundings, no ambient loop.
      scene.fog = null;
      scene.background = null;
      setLighting(AR_LIGHT);
      if (audio) audio.setAmbient(null);
      applied = 'ar';
      return;
    }
    const world = findWorld(wanted.id) || HUB;
    const o = wanted.options || {};
    const key = world.id + '|' + (o.scenery ? 's' : '') + (o.ground === false ? 'n' : '') + (lite() ? 'i' : 'd');
    if (key === applied) return;
    applied = key;
    const mine = ++serial;

    // sky
    const s = world.sky || {};
    skyUniforms.uTop.value.fromArray(rgb(s.top, [0.5, 0.63, 0.79]));
    skyUniforms.uHorizon.value.fromArray(rgb(s.horizon, [0.86, 0.9, 0.95]));
    skyUniforms.uBottom.value.fromArray(rgb(s.bottom, [0.95, 0.97, 0.99]));
    skyUniforms.uUseMap.value = 0;
    if (s.texture) {
      loadSky(s.texture).then((t) => {
        if (mine !== serial || !t) return;                 // a newer world took over, or no photo: keep the gradient
        skyUniforms.map.value = t; skyUniforms.uUseMap.value = 1;
      });
    }

    // fog (linear, on view depth)
    if (world.fog && world.fogFar > 0) {
      const f = rgb(world.fog, [1, 1, 1]);
      const color = new THREE.Color().setRGB(f[0], f[1], f[2], THREE.SRGBColorSpace);
      // Without the world's surroundings Unity pulls the fog in (painted-sky values); with them it reaches the horizon.
      scene.fog = new THREE.Fog(color, world.fogNear ?? world.fogFar * 0.2, world.fogFar);
    } else scene.fog = null;

    // light
    const l = world.light || {};
    setLighting({ sunDirection: toSun(l), sunColor: rgb(l.color, [1, 1, 1]), sunIntensity: l.intensity ?? 1, ambient: rgb(world.ambient, [0.62, 0.62, 0.62]) });

    // ground
    const wantGround = o.ground !== false;
    const g = rgb(world.ground ?? world.groundColor, [1, 1, 1]);
    groundMaterial.uniforms.uBase.value.setRGB(g[0], g[1], g[2], THREE.SRGBColorSpace);
    const mode = String(world.groundMode || 'full').toLowerCase();
    const isHub = world === HUB;
    snowPlain.visible = wantGround && isHub;
    disc.visible = wantGround && !isHub && mode === 'full';
    platform.visible = wantGround && !isHub && mode === 'platform';
    if (isHub) groundMaterial.uniforms.uBase.value.setRGB(1, 1, 1);

    // scenery: only one world's set is in memory at a time
    const url = o.scenery ? (lite() ? (world.sceneryLite || world.scenery) : (world.scenery || world.sceneryLite)) : null;
    if (url !== sceneryUrl) {
      clearScenery();
      if (url) {
        sceneryUrl = url;
        loadGLB(url).then((model) => {
          if (mine !== serial || sceneryUrl !== url) return;
          sceneryHolder.add(model);
          // Surroundings bring their own ground, so the plain disc is only for worlds without any.
          disc.visible = false; platform.visible = false;
        }).catch((err) => { console.warn('[wishworld] scenery not available:', url, err && err.message); });
      }
    } else if (url && sceneryHolder.children.length) { disc.visible = false; platform.visible = false; }

    if (audio) audio.setAmbient(o.ambientSound === false ? null : world.ambientSound || null);
  }

  return {
    /** The contract's setEnvironment. id: a world id from WORLDS ('aquarium', 'zoo', ...), 'hub', or null for the default.
     *  options: { scenery: true } also loads the world's exported surroundings; { ground: false } leaves the floor out;
     *  { ambientSound: false } keeps the world's background loop off. Ignored in AR. */
    set(id, options = {}) {
      wanted = { id: id || null, options: options || {} };
      apply();
    },
    /** Give the environment the WORLDS table. */
    setWorlds(list) { worlds = Array.isArray(list) ? list : []; applied = null; apply(); },
    /** Re-apply after the mode changed (a session started or ended). */
    refresh() { applied = null; apply(); },
    world(id) { return findWorld(id); },
    get current() { return wanted.id; },
    root,
  };
}
