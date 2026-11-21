// The creatures of a world: Unity's Spawner.cs (where each one goes) and Creature.cs (touch, gaze, glow,
// learning), on top of /shared/movement.js (Mover.cs) and /shared/models.js (the exported meshes and shader).
//
// Everything here works in the frame of an "anchor" group whose origin is the floor point under the player
// and whose -Z is the way the scene faces (Unity's Floor and Forward). In VR that is the world origin; in
// the real room it is where the viewer stands. Unity (x, y, z) is (x, y, -z) in that frame.

import * as THREE from 'three';
import { creatureById } from '/shared/creatures.js';
import * as Models from '/shared/models.js';
import { createMover, seededRandom } from '/shared/movement.js';

export const MAX_PER_ENTRY = 30, MAX_TOTAL = 60;     // WorldController.MaxPerEntry, MaxTotal
const MIN_RING = 1, MAX_RING = 6;                     // Spawner.MinRing, MaxRing
const TAU = 6.283;                                    // Unity writes 6.283f
const FORWARD = Math.PI / 2;                          // atan2(forward.z, forward.x) with forward = +Z
const GAZE_SECONDS = 2;                               // Creature.GazeSeconds
const SCATTER_RANGE = 0.4;                            // Creature.ScatterRange
const TOUCH = 0.06;                                   // a controller this close to the creature's box learns it
const POINTER_LENGTH = 10, GAZE_LENGTH = 12;          // XRRig pointer and gaze rays

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const moveTowards = (a, b, step) => (Math.abs(b - a) <= step ? b : a + Math.sign(b - a) * step);

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Unity's MoveType of a creature row: 'swim' | 'fly' | 'walk' | 'float' | 'orbit'. */
export function moveType(def) {
  const m = String((def && (def.motion ?? def.move)) || 'swim').toLowerCase();
  return m === 'hover' ? 'float' : m;
}

/**
 * Spawner.Spawn for one kind: the numbers for every member, drawn in the same order as Unity draws them
 * (Unity seeds its generator with the id's hash code, which JavaScript cannot reproduce: the rules match,
 * the exact spots do not). `shared` carries the walker count of the whole world: { ar, walkerTotal, walkerIndex }.
 */
export function planKind(def, count, scale, shared) {
  const out = [];
  if (!def || count <= 0) return out;
  const rand = seededRandom(hashString(def.id));
  const coin = () => (rand(0, 1) < 0.5 ? 1 : -1);
  const move = moveType(def);
  const ar = Boolean(shared.ar);
  const [minD, maxD] = def.ring || [1.5, 3];
  const [minH, maxH] = def.height || [1, 1.6];
  const arScale = Number(def.arScale) > 0 ? Number(def.arScale) : 1;

  const size = scale * (ar ? arScale : 1);
  const baseAngle = FORWARD + (def.schooling ? rand(-0.7, 0.1) : rand(-1.2, 1.2));
  const schoolRadius = rand(minD, maxD);
  const schoolHeight = rand(minH, maxH);
  const dir = coin();

  for (let i = 0; i < count; i++) {
    const p = { size, move, forward: 0, arc: 0.4 };
    p.speed = def.speed * rand(0.8, 1.2) * (ar ? lerp(arScale, 1, 0.5) : 1);
    p.phase = rand(0, TAU);
    p.bob = (move === 'fly' ? 0.25 : 0.15) * (ar ? 0.5 : 1);
    let radius, height, angle;
    if (move === 'orbit') {
      // A little solar system in front of the player: tabletop sized in the real room.
      const k = ar ? 0.3 : 1;
      p.forward = ar ? 0.85 : 3.2;
      radius = lerp(minD, maxD, count > 1 ? i / (count - 1) : rand(0, 1)) * k;
      height = ar ? 1.05 : 1.45;
      angle = rand(0, TAU);
      p.direction = 1;
      p.bob = radius * 0.18;
    } else {
      if (def.schooling) {
        radius = schoolRadius + rand(-0.35, 0.35);
        height = schoolHeight + rand(-0.3, 0.3);
        angle = baseAngle + i * 0.16 + rand(-0.05, 0.05);
        p.direction = dir;
      } else {
        radius = rand(minD, maxD);
        height = rand(minH, maxH);
        angle = baseAngle + i * (TAU / Math.max(count, 3)) + rand(-0.3, 0.3);
        p.direction = coin();
      }
      if (ar) { radius = clamp(radius * 0.45, 0.9, 2.4); height = clamp(height * 0.8, 0, 1.9); }
      // Bigger creatures stand further back so they never crowd the head.
      radius = clamp(Math.max(radius, MIN_RING + 0.4 * (size - 1)), MIN_RING, MAX_RING);
      if (move === 'walk') {
        // Each walker gets its own slice of the circle and paces inside it.
        height = 0;
        const total = Math.max(1, shared.walkerTotal);
        const slice = TAU / total;
        angle = FORWARD + slice * (shared.walkerIndex + 0.5);
        p.arc = Math.min(0.45, slice * 0.32);
        shared.walkerIndex++;
      }
    }
    p.radius = radius; p.height = height; p.angle = angle;
    out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------- models

const _box = new THREE.Box3();

/**
 * One model per call, in Unity's own pivot (a walker's feet on y = 0, a jellyfish hanging from its bell),
 * which is what the heights in the library are measured from. Falls back to /shared/models.js's centred
 * stand-in when the manifest has no file for the creature.
 */
async function loadModel(id) {
  try {
    if (typeof Models.loadGLB === 'function' && typeof Models.loadManifest === 'function') {
      const manifest = await Models.loadManifest();
      const entry = manifest.get(id);
      if (entry && entry.file) return await Models.loadGLB('/models/' + entry.file);
    }
  } catch (err) {
    console.warn('[wishworld] worlds: using the stand-in for', id, err && err.message);
  }
  return Models.loadCreature(id);
}

// ---------------------------------------------------------------------------------------------- the set

const _inv = new THREE.Matrix4();
const _p0 = new THREE.Vector3(), _p1 = new THREE.Vector3(), _c = new THREE.Vector3(), _w = new THREE.Vector3();
const _local = new THREE.Vector3();

/**
 * The live creatures of one world.
 *   parent        the anchor group (see the top of this file)
 *   shadows       a pool from /vr/core/fx.js createShadowPool, or null
 *   onLearn(creature, isNewToSession)
 */
export function createCreatureSet({ parent, shadows = null, shadowOffset = 0, onLearn = null }) {
  const root = new THREE.Group();
  root.name = 'Creatures';
  parent.add(root);
  const live = [];
  let clock = 0, serial = 0, withShadows = false, ar = false;
  let gazeTarget = null, gazeSeconds = 0;

  function clear() {
    serial++;
    for (const c of live) {
      root.remove(c.object);
      // Glow and tint give an object its own copy of the material: let those go. The meshes themselves are
      // shared with /shared/models.js's cache; disposing only frees the GPU copy (it is re-sent if used again).
      const own = c.object.userData.wwOwn;
      if (own) for (const m of own) m.dispose();
      c.object.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
      if (c.mover && c.mover.dispose) c.mover.dispose();
      if (shadows && c.shadow >= 0) shadows.hide(c.shadow);
    }
    live.length = 0;
    gazeTarget = null; gazeSeconds = 0;
    if (shadows) shadows.commit();
  }

  /**
   * WorldController.Rebuild: replace everything with `entries` ([{ creatureId, count, scale? }]).
   * options: { ar, shadows }. Resolves with the number of creatures placed (0 if a newer call took over).
   */
  async function spawn(entries, options = {}) {
    clear();
    const mine = serial;
    ar = Boolean(options.ar);
    withShadows = Boolean(options.shadows) && Boolean(shadows);

    const shared = { ar, walkerTotal: 0, walkerIndex: 0 };
    const kinds = [];
    let total = 0;
    for (const e of entries) {
      const def = creatureById(e.creatureId);
      if (!def) continue;
      const count = Math.min(Math.min(e.count, MAX_PER_ENTRY), MAX_TOTAL - total);
      if (count <= 0) break;
      total += count;
      if (moveType(def) === 'walk') shared.walkerTotal += count;
      kinds.push({ def, count, scale: e.scale ?? 1 });
    }
    // Every model first, so the world arrives all at once.
    const jobs = [];
    for (const k of kinds) for (let i = 0; i < k.count; i++) jobs.push(loadModel(k.def.id));
    const models = await Promise.all(jobs);
    if (mine !== serial) return 0;

    let n = 0, shadowIndex = shadowOffset;
    for (const k of kinds) {
      const plan = planKind(k.def, k.count, k.scale, shared);
      const move = moveType(k.def);
      for (let i = 0; i < plan.length; i++) {
        const p = plan[i];
        const model = models[n++];
        const holder = new THREE.Group();
        holder.name = k.def.name;
        holder.add(model);
        // The box Unity gives every creature: its mesh bounds, at least 0.12 m a side.
        model.updateMatrixWorld(true);
        _box.setFromObject(model);
        const box = _box.isEmpty() ? new THREE.Box3(new THREE.Vector3(-0.1, -0.1, -0.1), new THREE.Vector3(0.1, 0.1, 0.1)) : _box.clone();
        for (const axis of ['x', 'y', 'z']) {
          const short = 0.12 - (box.max[axis] - box.min[axis]);
          if (short > 0) { box.min[axis] -= short / 2; box.max[axis] += short / 2; }
        }
        holder.scale.setScalar(p.size);
        const center = new THREE.Vector3(0, 0, -p.forward);
        const mover = createMover(holder, k.def, {
          center, radius: p.radius, height: p.height, angle: p.angle, direction: p.direction, phase: p.phase,
          speed: p.speed, bob: p.bob, arc: p.arc, follow: false,
        });
        root.add(holder);
        const half = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
        const c = {
          def: k.def, object: holder, mover, move, box,
          center: box.getCenter(new THREE.Vector3()),
          reach: half.length(),                                   // bounding sphere, model units
          shadowRadius: Math.max(half.x, half.z) * 0.85 * p.size, // BlobShadow.Attach
          shadowHeight: move === 'walk' ? 2 : 3.5,
          shadow: withShadows && shadows ? shadowIndex++ : -1,
          shy: ar && (k.def.addCount ?? 1) > 1 && move !== 'walk',
          glow: 0, glowUntil: -1, cooldownUntil: -1, hovered: false, gazeConsumed: false,
        };
        live.push(c);
      }
    }
    return live.length;
  }

  /**
   * Where a ray first meets a creature's box. `origin` and `direction` (unit) are in world space.
   * Returns the creature or null; the distance is left in `hit.distance`.
   */
  const hit = { distance: 0 };
  function pick(origin, direction, maxDistance = POINTER_LENGTH) {
    let best = null, bestT = maxDistance;
    for (let i = 0; i < live.length; i++) {
      const c = live[i];
      const mw = c.object.matrixWorld;
      // Cheap sphere test first.
      _c.copy(c.center).applyMatrix4(mw).sub(origin);
      const r = c.reach * c.object.scale.x;
      const along = _c.dot(direction);
      if (along < -r || along - r > bestT) continue;
      if (_c.lengthSq() - along * along > r * r) continue;
      // Then the box, in the creature's own space. The direction is left unnormalised so t stays in metres.
      _inv.copy(mw).invert();
      _p0.copy(origin).applyMatrix4(_inv);
      _p1.copy(origin).add(direction).applyMatrix4(_inv).sub(_p0);
      let t0 = 0, t1 = bestT, miss = false;
      for (let a = 0; a < 3 && !miss; a++) {
        const o = _p0.getComponent(a), d = _p1.getComponent(a);
        const lo = c.box.min.getComponent(a), hi = c.box.max.getComponent(a);
        if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) miss = true; continue; }
        let ta = (lo - o) / d, tb = (hi - o) / d;
        if (ta > tb) { const s = ta; ta = tb; tb = s; }
        if (ta > t0) t0 = ta;
        if (tb < t1) t1 = tb;
        if (t0 > t1) miss = true;
      }
      if (miss) continue;
      best = c; bestT = t0;
    }
    hit.distance = bestT;
    return best;
  }

  /** Distance in metres from a world point to a creature's box (0 inside). */
  function distanceTo(c, point) {
    _inv.copy(c.object.matrixWorld).invert();
    _p0.copy(point).applyMatrix4(_inv);
    _p1.copy(_p0).clamp(c.box.min, c.box.max).sub(_p0);
    return _p1.length() * c.object.scale.x;
  }

  /** Creature.Learn: glow, slow down, and tell the world. Returns false while it is still on its 4 s cooldown. */
  function learn(c) {
    if (!c || clock < c.cooldownUntil) return false;
    c.cooldownUntil = clock + 4;
    c.glowUntil = clock + 5;
    if (onLearn) onLearn(c);
    return true;
  }

  /** Mark what a pointer is on this frame (Creature.OnHover). Call clearHover() first, then hover() per pointer. */
  function clearHover() { for (let i = 0; i < live.length; i++) live[i].hovered = false; }

  /**
   * The head's gaze (XRRig.UpdateGaze + Creature.Update): looking at one creature for two seconds learns it.
   * `blocked` stops it while a quiz is open.
   */
  function gaze(origin, direction, dt, blocked) {
    const c = blocked ? null : pick(origin, direction, GAZE_LENGTH);
    if (c === gazeTarget) gazeSeconds += dt;
    else { if (gazeTarget) gazeTarget.gazeConsumed = false; gazeTarget = c; gazeSeconds = 0; }
    if (c && gazeSeconds >= GAZE_SECONDS && !c.gazeConsumed) { c.gazeConsumed = true; learn(c); }
  }

  /**
   * A controller in reach (world position): touching a creature learns it, and in the real room the small
   * schooling ones dart away from the hand. Returns true when the touch taught something (for the haptic tick).
   */
  function hand(point, dt) {
    let taught = false;
    for (let i = 0; i < live.length; i++) {
      const c = live[i];
      _w.copy(c.center).applyMatrix4(c.object.matrixWorld);
      const far = c.reach * c.object.scale.x + Math.max(TOUCH, SCATTER_RANGE);
      if (_w.distanceToSquared(point) > far * far) continue;
      if (distanceTo(c, point) < TOUCH && clock >= c.cooldownUntil) { learn(c); taught = true; }
      if (c.shy && c.mover.avoid) {
        // The mover works in the anchor's frame.
        _local.copy(point);
        root.worldToLocal(_local);
        c.mover.avoid(_local, dt, SCATTER_RANGE);
      }
    }
    return taught;
  }

  function update(dt, elapsed) {
    clock += dt;
    for (let i = 0; i < live.length; i++) {
      const c = live[i];
      const lit = clock < c.glowUntil;
      const gazeGlow = c === gazeTarget ? clamp(gazeSeconds / GAZE_SECONDS, 0, 1) * 0.4 : 0;
      const target = lit ? 0.55 + Math.sin(clock * 6) * 0.15 : Math.max(gazeGlow, c.hovered ? 0.25 : 0);
      if (c.glow !== target) {
        c.glow = moveTowards(c.glow, target, dt * 3);
        Models.setGlow(c.object, c.glow);
      }
      // Slows to a crawl while its fact card is showing, so it can be touched.
      c.mover.speedScale = moveTowards(c.mover.speedScale, lit ? 0.15 : 1, dt * 1.5);
      c.mover.update(dt, elapsed, null);
      if (c.shadow >= 0) shadows.place(c.shadow, c.object.position, c.shadowRadius, 0, c.shadowHeight);
    }
    if (shadows && withShadows) shadows.commit();
  }

  return {
    root, live, hit,
    spawn, clear, pick, learn, clearHover, gaze, hand, update,
    /** The first live creature of a kind (tests and the debug handle). */
    find(id) { return live.find((c) => c.def.id === id) || null; },
    get count() { return live.length; },
    get clock() { return clock; },
    dispose() { clear(); parent.remove(root); },
  };
}
