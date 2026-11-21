// Snow Circuit: everything that is drawn, and where.
//
// Unity parents the player's rig to the car, so the player rides it round the track. A headset cannot be
// moved in WebXR, so here it is the other way round: the car stays where the player is and the whole world
// (track, valley, rivals, sky, sun) is moved and turned under it by the inverse of the car's pose. What the
// player sees is the same, frame for frame.
//
//   group (the tab's)
//   ├─ seat            the car's own frame, placed under the player's head by seatAt() = XRRig.Recenter(car, true, 1.05).
//   │   │              Local axes: -Z forward, +X right, +Y up; a Unity car-local point (x, y, z) is (x, y, -z).
//   │   ├─ car         cockpit (with the frame that stays in view), steering wheel; the tab adds the dashboard and menu
//   │   └─ world       the Unity scene: a Unity point (x, y, z) is (x, y, -z). Moved every frame by setCar().
//   │       ├─ track, surroundings (static), rivals, their blob shadows, the ghost car
//   └─ sky             the panorama, turned with the world

import * as THREE from 'three';
import { loadGLB, MeshBuilder, sharedVertexLit, lighting } from '/shared/models.js';
import { createShadowPool } from '/vr/core/fx.js';
import { DEG2RAD } from './track.js';

/** Game_SnowCircuit.unity as built by Builder.Games.cs BuildSnowCircuitSceneImpl (values as exported in /models/layouts.json). */
export const RACE_ENV = {
  ambient: [0.74, 0.78, 0.86],                       // used as linear numbers, as the game does
  sunColor: [1, 0.98, 0.94], sunIntensity: 1.05,     // sRGB inspector colour x intensity
  toSunUnity: [0.5705, 0.73265, -0.37115],           // measured from the sky photo (SunDirection("Race"))
  fogColor: [0.6103, 0.64189, 0.71311],              // the photo's horizon colour, #9ca4b6
  fogNear: 90, fogFar: 740,
  sky: '/textures/sky_race.jpg',
  skyFallback: { top: [0.50, 0.63, 0.79], horizon: [0.86, 0.90, 0.96], bottom: [0.95, 0.97, 0.99] },
  roomBackdrop: [0.42, 0.43, 0.45],                  // PassthroughToggle.EditorBackdrop: stands in for the room on a desktop
  farClip: 800,
};

// Builder.Core.cs palette (sRGB)
const SNOW = [0.95, 0.97, 0.99], SNOW_SHADE = [0.84, 0.89, 0.95], SLATE = [0.20, 0.25, 0.32], PEACH = [1.00, 0.72, 0.55];
const WHITE = [0.98, 0.98, 0.98], ICE = [0.74, 0.90, 1.00], CAR_BODY = [0.96, 0.56, 0.36], TYRE = [0.13, 0.14, 0.16];
const ROAD = [0.78, 0.84, 0.92];
const RIVAL_HUES = [0, 0.58, 0.30, 0.12, 0.80];

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * viewMatrix * vec4(mat3(modelMatrix) * position + cameraPosition, 1.0);
  gl_Position = p.xyww;            // always at the far plane, whatever the camera's range
}`;
// Shown as stored (sRGB in, sRGB out), which is how Unity shows a panoramic sky at exposure 1.
// Unity's panorama puts u = 0.5 towards +X with u falling towards +Z; in this frame (Unity z negated) that is atan(z, x).
const SKY_FRAG = /* glsl */ `
uniform sampler2D map;
uniform float uUseMap;
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uBottom;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  vec3 c;
  if (uUseMap > 0.5) {
    vec2 uv = vec2(atan(d.z, d.x) * 0.15915494 + 0.5, asin(clamp(d.y, -1.0, 1.0)) * 0.31830989 + 0.5);
    c = texture2D(map, uv).rgb;
  } else {
    c = d.y >= 0.0 ? mix(uHorizon, uTop, pow(d.y, 0.6)) : mix(uHorizon, uBottom, pow(-d.y, 0.5));
  }
  gl_FragColor = vec4(c, 1.0);
}`;

const _box = new THREE.Box3();

// ---- stand-ins, from the Unity builder's own recipes, for when a model file is missing ------------------------

/** Builder.Games.cs BuildCarAssets: the open-wheel car, seen from the driving seat. Built in the seat's frame. */
function cockpitFallback() {
  return new MeshBuilder()
    .cube([0, 0.30, 0.3], [0.98, 0.12, 2.3], CAR_BODY)                                   // floor
    .cube([-0.46, 0.56, 0.25], [0.08, 0.42, 1.7], CAR_BODY)                              // side walls
    .cube([0.46, 0.56, 0.25], [0.08, 0.42, 1.7], CAR_BODY)
    .cylinder([0, 0.42, 1.95], [0.72, 1.7, 0.32], CAR_BODY, [90, 0, 0], 0.35, 10)        // nose
    .cube([0, 0.50, 1.7], [0.16, 0.03, 1.5], WHITE)                                      // stripe
    .cube([0, 0.20, 2.78], [1.75, 0.05, 0.36], SLATE)                                    // front wing
    .cube([0, 0.74, -0.85], [0.72, 0.5, 1.2], CAR_BODY)                                  // engine cover
    .cube([0, 1.05, -1.45], [1.3, 0.06, 0.3], SLATE)                                     // rear wing
    .cylinder([-0.92, 0.33, 2.05], [0.66, 0.3, 0.66], TYRE, [0, 0, 90], 1, 12)
    .cylinder([0.92, 0.33, 2.05], [0.66, 0.3, 0.66], TYRE, [0, 0, 90], 1, 12)
    .cylinder([-0.95, 0.36, -1.0], [0.72, 0.36, 0.72], TYRE, [0, 0, 90], 1, 12)
    .cylinder([0.95, 0.36, -1.0], [0.72, 0.36, 0.72], TYRE, [0, 0, 90], 1, 12)
    .cube([0, 0.78, 0.80], [0.84, 0.2, 0.12], SLATE)                                     // dashboard
    .cube([0, 0.885, 0.80], [0.56, 0.13, 0.06], SLATE, [15, 0, 0])                       // read-out hood, just above the wheel
    // Frame that stays in view the whole time: a fixed reference against motion sickness.
    .cube([-0.41, 1.13, 0.74], [0.045, 0.74, 0.045], SLATE, [-14, 0, 5])
    .cube([0.41, 1.13, 0.74], [0.045, 0.74, 0.045], SLATE, [-14, 0, -5])
    .cube([0, 1.49, 0.65], [0.78, 0.045, 0.045], SLATE)
    .mesh({ mirror: 'z' });
}

function wheelFallback() {
  return new MeshBuilder()
    .cylinder([0, 0, 0], [0.34, 0.03, 0.34], SLATE, [90, 0, 0], 1, 16)
    .cylinder([0, 0, -0.012], [0.24, 0.03, 0.24], [0.32, 0.37, 0.45], [90, 0, 0], 1, 16)
    .cube([0, 0.145, -0.02], [0.04, 0.04, 0.02], PEACH)
    .mesh({ mirror: 'z' });
}

function hsv(h, s, v) {
  const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  return [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6];
}

/** BuildRivalCars without the car kit (also the ghost's shape): a tinted open-wheel car. Faces -Z, like the world. */
function simpleCar(body, wing, tyre) {
  const mb = new MeshBuilder()
    .cube([0, 0.36, 0.2], [0.95, 0.3, 2.2], body)
    .cylinder([0, 0.42, 1.95], [0.7, 1.6, 0.3], body, [90, 0, 0], 0.35, 10)
    .cube([0, 1.0, -1.4], [1.3, 0.06, 0.3], wing);
  for (const [x, z] of [[-0.92, 2], [0.92, 2], [-0.95, -1], [0.95, -1]]) mb.cylinder([x, 0.35, z], [0.7, 0.32, 0.7], tyre, [0, 0, 90], 1, 10);
  return mb.mesh({ mirror: 'z' });
}

/** Builder.Games.cs BuildTrack: road, kerb stripes, snow banks and the start line, straight from the centre line. */
function trackFallback(track) {
  const n = track.n, half = track.width * 0.5;
  const pos = [], col = [], idx = [];
  const c = new THREE.Color();
  const lin = (rgb) => { c.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace); return [c.r, c.g, c.b]; };
  const road = lin(ROAD), peach = lin(PEACH), white = lin(WHITE), snow = lin(SNOW), shade = lin(SNOW_SHADE), slate = lin(SLATE);
  // side = Cross(up, dir) = (dirZ, 0, -dirX); drawn at (x, y, -z)
  const at = (i, offset, y) => [track.x[i] + track.dirZ[i] * offset, y, -(track.z[i] - track.dirX[i] * offset)];
  const quad = (a, b, cc, d, color) => {
    const s = pos.length / 3;
    pos.push(...a, ...b, ...cc, ...d);
    for (let k = 0; k < 4; k++) col.push(color[0], color[1], color[2]);
    idx.push(s, s + 1, s + 2, s + 1, s + 3, s + 2);        // Unity's (s, s+2, s+1), (s+1, s+2, s+3), mirrored
  };
  const strip = (lo, ly, ro, ry, color) => {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      quad(at(i, lo, ly), at(i, ro, ry), at(j, lo, ly), at(j, ro, ry), typeof color === 'function' ? color(i) : color);
    }
  };
  const kerb = (i) => ((i >> 1) % 2 === 0 ? peach : white);
  strip(-half + 0.4, 0.01, half - 0.4, 0.01, road);
  strip(-half, 0.012, -half + 0.4, 0.012, kerb);
  strip(half - 0.4, 0.012, half, 0.012, kerb);
  strip(half, 0.01, half + 0.7, 0.6, snow);                 // banks: rise to a crest, then fall away
  strip(half + 0.7, 0.6, half + 2.3, -0.3, shade);
  strip(-half - 0.7, 0.6, -half, 0.01, snow);
  strip(-half - 2.3, -0.3, -half - 0.7, 0.6, shade);
  // start line: slate and white checks across the road at sample 0
  const w = (track.width - 0.8) / 10, dX = track.dirX[0], dZ = track.dirZ[0];
  for (let k = 0; k < 10; k++) {
    for (let row = 0; row < 2; row++) {
      const x0 = -half + 0.4 + k * w, f0 = row * 0.45 - 0.445;
      const p = (o, f) => [track.x[0] + dZ * o + dX * f, 0.019, -(track.z[0] - dX * o + dZ * f)];
      quad(p(x0, f0), p(x0 + w, f0), p(x0, f0 + 0.45), p(x0 + w, f0 + 0.45), (k + row) % 2 === 0 ? slate : white);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
  g.setIndex(pos.length / 3 > 65535 ? new THREE.BufferAttribute(new Uint32Array(idx), 1) : new THREE.BufferAttribute(new Uint16Array(idx), 1));
  g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, sharedVertexLit());
  mesh.name = 'TrackFallback';
  return mesh;
}

// ---------------------------------------------------------------------------------------------------------------

/**
 * group: the tab's group. track: from buildTrack(). rivalCount: 0..5. roomView: no surroundings, no sky
 * (WISHWORLD_RACE_VIEW=room). lite: load the surroundings cut for the headset. noModels: dev, use only stand-ins.
 */
export function createRaceScene({ group, track, rivalCount = 4, roomView = false, lite = false, noModels = false, seatEyeHeight = 1.05 }) {
  const seat = new THREE.Group(); seat.name = 'Car';
  const world = new THREE.Group(); world.name = 'RaceWorld';
  const car = new THREE.Group(); car.name = 'Cockpit';
  group.add(seat);
  seat.add(world, car);

  // The steering wheel: mounted at Unity (0, 0.70, 0.44), tilted 22 degrees; SnowCircuitGame turns it about its own Z.
  const wheelMount = new THREE.Group(); wheelMount.name = 'WheelMount';
  wheelMount.position.set(0, 0.70, -0.44);
  wheelMount.rotation.x = -22 * DEG2RAD;
  const wheel = new THREE.Group(); wheel.name = 'Wheel';
  wheelMount.add(wheel);
  seat.add(wheelMount);

  const trackHolder = new THREE.Group(); trackHolder.name = 'Track';
  const surroundings = new THREE.Group(); surroundings.name = 'Surroundings';
  surroundings.visible = !roomView;
  world.add(trackHolder, surroundings);

  // ---- rivals, their shadows, the ghost
  const rivals = [];
  for (let i = 0; i < rivalCount; i++) {
    const holder = new THREE.Group(); holder.name = 'Rival ' + i;
    world.add(holder);
    rivals.push(holder);
  }
  const shadows = rivalCount > 0 ? createShadowPool(rivalCount) : null;
  if (shadows) world.add(shadows.mesh);
  const shadowPos = new THREE.Vector3();
  const ghost = new THREE.Group(); ghost.name = 'Ghost'; ghost.visible = false;
  world.add(ghost);

  // ---- sky
  const env = RACE_ENV;
  const skyUniforms = {
    map: { value: null }, uUseMap: { value: 0 },
    uTop: { value: new THREE.Vector3().fromArray(env.skyFallback.top) },
    uHorizon: { value: new THREE.Vector3().fromArray(env.skyFallback.horizon) },
    uBottom: { value: new THREE.Vector3().fromArray(env.skyFallback.bottom) },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1, 24, 12),
    new THREE.ShaderMaterial({ uniforms: skyUniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false }),
  );
  sky.name = 'RaceSky'; sky.frustumCulled = false; sky.renderOrder = 1001;   // after everything opaque: fills only what is left
  group.add(sky);
  let skyTexture = null;

  /** 'world' (the valley and its sky), 'room' on a headset (nothing: the real room shows), or 'backdrop' (grey, a desktop standing in for the room). */
  function setView(view) {
    surroundings.visible = view === 'world';
    sky.visible = view !== 'room';
    if (view === 'backdrop') {
      skyUniforms.uUseMap.value = 0;
      for (const u of [skyUniforms.uTop, skyUniforms.uHorizon, skyUniforms.uBottom]) u.value.fromArray(env.roomBackdrop);
    } else {
      skyUniforms.uTop.value.fromArray(env.skyFallback.top);
      skyUniforms.uHorizon.value.fromArray(env.skyFallback.horizon);
      skyUniforms.uBottom.value.fromArray(env.skyFallback.bottom);
      skyUniforms.uUseMap.value = skyTexture ? 1 : 0;
    }
    currentView = view;
  }
  let currentView = roomView ? 'room' : 'world';

  // ---- loading: every file is optional; a stand-in is used when one is missing --------------------------------

  /** Model files face +Z with Unity's x mirrored; older exports faced -Z. The player's car tells which (its nose is longer than its tail). */
  let propsFacePlusZ = true;
  function faceForward(model) { model.rotation.y = propsFacePlusZ ? Math.PI : 0; return model; }

  /**
   * Scene files ("already placed") have been exported both as Unity (-x, y, z) and as (x, y, -z). The track
   * sits off-centre (towards Unity +X), so the side its bounding box is on says which this file is.
   */
  function alignPlaced(model, what) {
    model.updateMatrixWorld(true);
    _box.setFromObject(model);
    if (_box.isEmpty()) return model;
    const cx = (_box.min.x + _box.max.x) / 2, cz = (_box.min.z + _box.max.z) / 2;
    if (cx < 0) model.rotation.y = Math.PI;                 // (-x, y, z): half a turn makes it (x, y, -z)
    if (cx * cz > 0) console.warn(`[snowcircuit] ${what} is in axes this game does not know; it may be mirrored`);
    return model;
  }

  const load = (file) => (noModels ? Promise.reject(new Error('stand-ins only')) : loadGLB('/models/' + file));
  const loaded = { cockpit: false, wheel: false, track: false, surroundings: false, rivals: 0, sky: false, ghost: false };
  let loading = null;
  let disposed = false;

  function loadAll({ wantLite = lite } = {}) {
    if (loading) return loading;
    const jobs = [];

    jobs.push(load('car_cockpit.glb').then((m) => {
      m.updateMatrixWorld(true);
      _box.setFromObject(m);
      propsFacePlusZ = (_box.max.z + _box.min.z) >= 0;
      loaded.cockpit = true;
      return m;
    }, () => null).then((cockpit) => {
      car.add(cockpit ? faceForward(cockpit) : cockpitFallback());
      // the rest of the props follow the cockpit's convention
      const props = [];
      props.push(load('steering_wheel.glb').then((m) => { loaded.wheel = true; wheel.add(faceForward(m)); }, () => { wheel.add(wheelFallback()); }));
      for (let i = 0; i < rivalCount; i++) {
        props.push(load(`rival_car_${i}.glb`).then((m) => { loaded.rivals++; rivals[i].add(faceForward(m)); }, () => {
          rivals[i].add(simpleCar(hsv(RIVAL_HUES[i], 0.7, 0.9), SLATE, [0.12, 0.12, 0.14]));
        }));
      }
      if (rivalCount === 0) {
        props.push(load('ghost_car.glb').then((m) => { loaded.ghost = true; ghost.add(faceForward(m)); }, () => { ghost.add(simpleCar(ICE, WHITE, WHITE)); }));
      }
      return Promise.all(props);
    }));

    // The road is built here from the track's own width: the exported track_snowcircuit.glb is Unity's 7 m road,
    // narrower than the 11 m this game now races on.
    trackHolder.add(trackFallback(track));
    loaded.track = true;

    if (!roomView) {
      const files = wantLite ? ['world_race_lite.glb', 'world_race.glb'] : ['world_race.glb', 'world_race_lite.glb'];
      jobs.push(load(files[0]).catch(() => load(files[1])).then((m) => { loaded.surroundings = true; surroundings.add(alignPlaced(m, 'the valley')); }, () => {
        // No valley: at least a snowfield under the track, out to the fog.
        surroundings.add(new THREE.Mesh(new MeshBuilder().disc([23, -0.14, 13], [1500, 1500], SNOW, null, 48).build(), sharedVertexLit()));
      }));
      jobs.push(new Promise((resolve) => {
        new THREE.TextureLoader().load(env.sky, (t) => {
          if (disposed) { t.dispose(); resolve(); return; }
          t.colorSpace = THREE.NoColorSpace;               // shown as stored
          t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter;
          t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
          skyTexture = t; skyUniforms.map.value = t; loaded.sky = true;
          if (currentView === 'world') skyUniforms.uUseMap.value = 1;
          resolve();
        }, undefined, () => resolve());
      }));
    }
    loading = Promise.all(jobs).then(() => loaded, () => loaded);
    return loading;
  }

  // ---- the frame -------------------------------------------------------------------------------------------------

  const savedLight = { dir: new THREE.Vector3(), sun: new THREE.Color(), ambient: new THREE.Color(), saved: false };
  const sunWorld = new THREE.Vector3(env.toSunUnity[0], env.toSunUnity[1], -env.toSunUnity[2]).normalize();
  const sunColor = new THREE.Color().setRGB(env.sunColor[0], env.sunColor[1], env.sunColor[2], THREE.SRGBColorSpace).multiplyScalar(env.sunIntensity);

  return {
    seat, world, car, wheel, sky, rivals, ghost, surroundings, loaded,
    load: loadAll,
    setView,
    get view() { return currentView; },

    /**
     * XRRig.Recenter(car, true, seatEyeHeight): the car goes under the head (given in the tab group's space),
     * facing the way the head faces, with the head seatEyeHeight above the car's floor.
     */
    seatAt(head, forwardFlat) {
      seat.position.set(head.x, head.y - seatEyeHeight, head.z);
      seat.rotation.y = Math.atan2(-forwardFlat.x, -forwardFlat.z);
      seat.updateMatrixWorld(true);
    },
    /** Desktop preview: the head never leaves the seat (Unity's keyboard stand-in does not move it while driving). */
    holdHead(head) {
      seat.position.set(head.x, head.y - seatEyeHeight, head.z);
    },

    /** Where the car is on the track (Unity x, z and yaw in degrees): moves the world the other way. */
    setCar(x, z, yawDegrees) {
      const a = yawDegrees * DEG2RAD, c = Math.cos(a), s = Math.sin(a);
      world.rotation.y = a;
      world.position.set(-x * c + z * s, 0, x * s + z * c);
      // The sky and the sun turn with the world.
      const total = seat.rotation.y + a;
      sky.rotation.y = total;
      const ct = Math.cos(total), st = Math.sin(total);
      lighting.sunDirection.value.set(sunWorld.x * ct + sunWorld.z * st, sunWorld.y, -sunWorld.x * st + sunWorld.z * ct);
    },

    /** Unity position and facing of rival i. */
    setRival(i, x, z, fx, fz) {
      const r = rivals[i];
      if (!r) return;
      r.position.set(x, 0, -z);
      r.rotation.y = Math.atan2(-fx, fz);                    // -Z forward turned onto (fx, 0, -fz)
      // BlobShadow.Attach(car, groundY 0.02, radius 1.5, maxHeight 3)
      if (shadows) shadows.place(i, shadowPos.set(x, 0, -z), 1.5, 0.02, 3);
    },
    commitRivals() { if (shadows) shadows.commit(); },

    setGhost(active, x, z, yawDegrees) {
      ghost.visible = active;
      if (!active) return;
      ghost.position.set(x, 0, -z);
      ghost.rotation.y = -yawDegrees * DEG2RAD;
    },

    /** wheel.localRotation = Euler(0, 0, -steer * 80) */
    setWheel(steer) { wheel.rotation.z = -steer * 80 * DEG2RAD; },

    /** The race scene's sun and ambient light (the shared material's uniforms). The sun's direction follows in setCar(). */
    applyLight() {
      if (!savedLight.saved) {
        savedLight.dir.copy(lighting.sunDirection.value);
        savedLight.sun.copy(lighting.sunColor.value);
        savedLight.ambient.copy(lighting.ambient.value);
        savedLight.saved = true;
      }
      lighting.sunColor.value.copy(sunColor);
      lighting.ambient.value.setRGB(env.ambient[0], env.ambient[1], env.ambient[2]);
    },
    restoreLight() {
      if (!savedLight.saved) return;
      lighting.sunDirection.value.copy(savedLight.dir);
      lighting.sunColor.value.copy(savedLight.sun);
      lighting.ambient.value.copy(savedLight.ambient);
      savedLight.saved = false;
    },

    dispose() {
      disposed = true;
      if (shadows) shadows.dispose();
      sky.geometry.dispose(); sky.material.dispose();
      if (skyTexture) skyTexture.dispose();
      group.remove(seat, sky);
    },
  };
}
