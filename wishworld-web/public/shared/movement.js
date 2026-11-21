// WishWorld shared movement: life from code, so models need no rigging.
//
//   import { createMover, createCompanionFollower } from '/shared/movement.js';
//   const mover = createMover(fish, creature, { center, minRadius: 1, maxRadius: 3, height: 1.3 });
//   mover.update(dt, elapsed, viewerPosition);          // every frame
//   mover.scatter(controllerPosition);                  // dart away from a point
//
// A port of the Unity game's Mover.cs and the scatter in Creature.cs. Every type keeps the creature on a
// ring around a centre point, which keeps it in view and away from the viewer's head. The maths is done in
// Unity's own coordinates (left-handed, +Z forward) and mirrored at the end, so paths, banking and wiggles
// match the game. Objects are expected to face +Z, as /shared/models.js returns them.
//
// Used by the headset view and the phone's AR tab: no WebXR, nothing from /vr, no per-frame allocations.

import * as THREE from 'three';

const DEG = Math.PI / 180;
const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _target = new THREE.Quaternion();
const TURN = new THREE.Quaternion(0, 1, 0, 0);   // half a turn about Y: Unity's mirrored +Z to the model's +Z
const _v = new THREE.Vector3();

function moveTowards(a, b, step) { return Math.abs(b - a) <= step ? b : a + Math.sign(b - a) * step; }

/** A small repeatable random source, so a creature takes the same place every time. */
export function seededRandom(seed) {
  let s = (seed >>> 0) || 1;
  return function rand(a = 0, b = 1) {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return a + (((t ^ (t >>> 14)) >>> 0) / 4294967296) * (b - a);
  };
}

function moveTypeOf(creature) {
  const m = String((creature && (creature.move ?? creature.moveType ?? creature.movement)) || 'swim').toLowerCase();
  return m === 'float' ? 'hover' : m;
}

/**
 * Move `object` like the Unity creature it is.
 *
 * creature: a row from CREATURES. Read: move ('swim' | 'fly' | 'walk' | 'hover' | 'orbit'), speed (m/s).
 * options:
 *   center      THREE.Vector3 on the floor that the ring goes around (copied)
 *   minRadius, maxRadius   the ring, metres (a radius is picked between them)
 *   height      metres above center.y (walkers ignore it and stay on the floor)
 * and, optionally: radius, angle (radians), direction (1 | -1), phase, speed, bob, arc (walkers),
 *   follow (true: the ring drifts after the viewer so creatures stay around someone who walks; default true),
 *   scatterRange (metres, default 1.2), random (a seededRandom) or seed.
 *
 * Returns { update(dt, elapsed, viewerPosition), scatter(fromPoint), avoid(point, dt), setCenter(vec3),
 *           dispose(), speedScale, radius, height, angle, type }.
 */
export function createMover(object, creature, options = {}) {
  const rand = options.random || seededRandom(options.seed ?? Math.floor(Math.random() * 1e9));
  const type = moveTypeOf(creature);
  const center = new THREE.Vector3();
  if (options.center) center.copy(options.center);
  const minR = options.minRadius ?? 1, maxR = options.maxRadius ?? Math.max(minR, 3);

  const m = {
    type,
    radius: options.radius ?? rand(minR, maxR),
    height: type === 'walk' ? 0 : (options.height ?? 1.2),
    angle: options.angle ?? rand(0, Math.PI * 2),
    direction: options.direction ?? (rand() < 0.5 ? 1 : -1),
    phase: options.phase ?? rand(0, Math.PI * 2),
    speed: options.speed ?? (Number(creature && creature.speed) > 0 ? Number(creature.speed) : 0.35),
    bob: options.bob ?? (type === 'fly' ? 0.25 : 0.15),
    arc: options.arc ?? 0.4,
    /** 1 = normal. Ease towards 0.15 while a fact card is up, so the creature can be touched. */
    speedScale: 1,
    follow: options.follow !== false,
    scatterRange: options.scatterRange ?? 1.2,
  };

  let t = 0, spin = 0, walkT = m.phase, placed = false, boost = 0;
  const home = m.angle;
  const nudge = new THREE.Vector3(), nudgeTarget = new THREE.Vector3();
  const walkQ = new THREE.Quaternion();
  const baseScaleY = object.scale.y || 1;

  function step(dt) {
    t += dt;
    const scale = m.speedScale * (1 + boost);
    let x, y = m.height, z;
    if (type === 'hover') {
      spin += dt * 12 * m.direction * m.speedScale;
      y += Math.sin(t * 0.6 + m.phase) * m.bob;
      x = Math.cos(m.angle) * m.radius; z = Math.sin(m.angle) * m.radius;
      _q.setFromEuler(_e.set(Math.sin(t * 0.4 + m.phase) * 6 * DEG, m.phase + spin * DEG, 0, 'YXZ'));
    } else if (type === 'walk') {
      // Pace along a short arc; top speed in the middle, slowing to turn at each end.
      walkT += dt * m.speed * scale / Math.max(0.05, m.radius * m.arc);
      m.angle = home + m.arc * Math.sin(walkT);
      const sign = Math.cos(walkT) >= 0 ? 1 : -1;
      const stride = Math.abs(Math.cos(walkT));
      y += Math.abs(Math.sin(t * 5 + m.phase)) * 0.02 * stride * baseScaleY;
      x = Math.cos(m.angle) * m.radius; z = Math.sin(m.angle) * m.radius;
      const heading = Math.atan2(-Math.sin(m.angle) * sign, Math.cos(m.angle) * sign);
      _target.setFromEuler(_e.set(0, heading, Math.sin(t * 5 + m.phase) * 2 * stride * DEG, 'YXZ'));
      if (!placed) walkQ.copy(_target); else walkQ.slerp(_target, Math.min(1, dt * 2.5));
      _q.copy(walkQ);
    } else {
      m.angle += m.direction * (m.speed * scale / Math.max(m.radius, 0.2)) * dt;
      let pitch = 0, roll = 0, wiggle = 0;
      if (type === 'swim') {
        y += Math.sin(t * 0.6 + m.phase) * m.bob;
        pitch = -Math.cos(t * 0.6 + m.phase) * 6;
        wiggle = Math.sin(t * 5 + m.phase) * 7 * Math.min(1.6, scale);
      } else if (type === 'fly') {
        y += Math.sin(t * 0.9 + m.phase) * m.bob;
        pitch = -Math.cos(t * 0.9 + m.phase) * 8;
        roll = -m.direction * 14;
      } else if (type === 'orbit') {
        y += Math.sin(m.angle + m.phase) * m.bob;
      }
      x = Math.cos(m.angle) * m.radius; z = Math.sin(m.angle) * m.radius;
      if (type === 'orbit') {
        _q.setFromEuler(_e.set(12 * DEG, (t * 20) * DEG + m.phase, 0, 'YXZ'));
      } else {
        const heading = Math.atan2(-Math.sin(m.angle) * m.direction, Math.cos(m.angle) * m.direction);
        _q.setFromEuler(_e.set(pitch * DEG, heading + wiggle * DEG, roll * DEG, 'YXZ'));
      }
    }
    placed = true;
    // Unity space to three.js: mirror Z, then half a turn because the model faces +Z rather than -Z.
    object.position.set(center.x + x + nudge.x, center.y + y + nudge.y, center.z - z + nudge.z);
    object.quaternion.set(-_q.x, -_q.y, _q.z, _q.w).multiply(TURN);
  }

  m.update = function update(dt, elapsed, viewerPosition) {
    if (m.follow && viewerPosition) {
      // Stay around someone who walks about: the ring's centre drifts after them, slowly.
      const dx = viewerPosition.x - center.x, dz = viewerPosition.z - center.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.35) {
        const k = Math.min(1, (0.6 * dt) / d);
        center.x += dx * k; center.z += dz * k;
      }
    }
    if (boost > 0) boost = Math.max(0, boost - dt * 1.6);
    if (nudgeTarget.lengthSq() > 1e-8 || nudge.lengthSq() > 1e-8) {
      nudge.lerp(nudgeTarget, Math.min(1, dt * 9));
      const len = nudgeTarget.length();
      if (len > 1e-4) nudgeTarget.multiplyScalar(Math.max(0, len - dt * 0.35) / len); else nudgeTarget.set(0, 0, 0);
    }
    step(dt);
  };

  /** Dart away from a point (a trigger pull, a clap): creatures within scatterRange jump back, then drift home. */
  m.scatter = function scatter(fromPoint, strength = 1) {
    if (!fromPoint) return false;
    _v.copy(object.position).sub(fromPoint);
    const d = _v.length();
    if (d > m.scatterRange) return false;
    if (d < 1e-4) _v.set(Math.cos(m.phase), 0.2, Math.sin(m.phase)); else _v.multiplyScalar(1 / d);
    if (type === 'walk') _v.y = 0;
    nudgeTarget.copy(_v).multiplyScalar((0.22 + 0.45 * (1 - d / m.scatterRange)) * strength);
    boost = type === 'walk' ? 0.6 : 2.2;
    return true;
  };

  /** Shy away from a reaching hand, continuously (Unity's AR hand avoidance). Call every frame with the hand position. */
  m.avoid = function avoid(point, dt, range = 0.4) {
    if (!point || type === 'walk') return;
    _v.copy(object.position).sub(point);
    const d = _v.length();
    if (d >= range || d < 1e-4) return;
    _v.multiplyScalar((0.45 * (1 - d / range)) / d);
    nudgeTarget.x = moveTowards(nudgeTarget.x, _v.x, dt * 2.5);
    nudgeTarget.y = moveTowards(nudgeTarget.y, _v.y, dt * 2.5);
    nudgeTarget.z = moveTowards(nudgeTarget.z, _v.z, dt * 2.5);
  };

  m.setCenter = function setCenter(v) { if (v) center.copy(v); };
  m.getCenter = function getCenter(out = new THREE.Vector3()) { return out.copy(center); };
  m.dispose = function dispose() { m.update = m.scatter = m.avoid = m.setCenter = () => false; };

  step(0);
  return m;
}

/**
 * A scanned companion's behaviour: float beside the viewer at arm's length, bob, turn to face them, follow
 * when they move, and hop when spoken to or poked.
 *
 *   const pal = createCompanionFollower(model, { armLength: 0.6 });
 *   pal.update(dt, elapsed, viewerPosition, viewerForward);   pal.hop();
 *
 * options: armLength (m), side (1 = viewer's right, -1 = left), drop (m below the eyes, default 0.28),
 *          angle (degrees off straight ahead, default 38), slot (0, 1, 2...: several companions fan out
 *          instead of sharing a spot).
 */
/**
 * `from` (a Vector3) starts the companion there, already full size, instead of popping it in at its place:
 * it then drifts over to the viewer's side (the headset toy scan hands a toy over this way).
 */
export function createCompanionFollower(object, { armLength = 0.6, side = 1, drop = 0.28, slot = 0, angle = 38, from = null } = {}) {
  const baseScale = object.scale.clone();
  const fwd = new THREE.Vector3(0, 0, -1);
  const want = new THREE.Vector3();
  const anchor = new THREE.Vector3();
  const phase = (slot * 1.7 + 0.4) % (Math.PI * 2);
  let placed = false, hopT = -1, yaw = 0, grow = 0;
  const HOP = 0.5;

  return {
    update(dt, elapsed, viewerPosition, viewerForward) {
      if (!viewerPosition) return;
      if (viewerForward) {
        const fx = viewerForward.x, fz = viewerForward.z, len = Math.hypot(fx, fz);
        if (len > 0.2) {
          // Follow where the viewer faces, but lazily, so a glance around does not swing the companion about.
          const k = placed ? Math.min(1, dt * 1.2) : 1;
          fwd.x += (fx / len - fwd.x) * k; fwd.z += (fz / len - fwd.z) * k;
          const n = Math.hypot(fwd.x, fwd.z) || 1;
          fwd.x /= n; fwd.z /= n;
        }
      }
      // To the side and a little ahead, fanned out by slot.
      const a = (angle + slot * 26) * DEG * side;
      const cos = Math.cos(a), sin = Math.sin(a);
      const dx = fwd.x * cos - fwd.z * sin, dz = fwd.z * cos + fwd.x * sin;   // forward turned towards the side
      want.set(viewerPosition.x + dx * armLength, viewerPosition.y - drop, viewerPosition.z + dz * armLength);

      if (!placed && from) { anchor.copy(from); placed = true; grow = 1; yaw = Math.atan2(viewerPosition.x - from.x, viewerPosition.z - from.z); }
      if (!placed) { anchor.copy(want); placed = true; grow = 0; }
      else anchor.lerp(want, 1 - Math.exp(-dt * 2.4));

      let lift = Math.sin(elapsed * 1.6 + phase) * 0.03;
      let squash = 1;
      if (hopT >= 0) {
        hopT += dt;
        const x = hopT / HOP;
        if (x >= 1) hopT = -1;
        else { lift += Math.sin(x * Math.PI) * 0.14; squash = 1 + Math.sin(x * Math.PI * 2) * 0.16; }
      }
      object.position.set(anchor.x, anchor.y + lift, anchor.z);

      // Turn to face the viewer.
      const tx = viewerPosition.x - object.position.x, tz = viewerPosition.z - object.position.z;
      if (tx * tx + tz * tz > 1e-4) {
        const wantYaw = Math.atan2(tx, tz);
        let d = wantYaw - yaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        yaw += d * Math.min(1, dt * 5);
      }
      const spinHop = hopT >= 0 ? (hopT / HOP) * Math.PI * 2 : 0;
      object.rotation.set(Math.sin(elapsed * 1.1 + phase) * 0.06, yaw + spinHop, Math.sin(elapsed * 0.9 + phase) * 0.05, 'YXZ');

      // Pop in on arrival, then squash and stretch on a hop.
      if (grow < 1) grow = Math.min(1, grow + dt * 2.5);
      const g = grow < 1 ? 1 + 2.70158 * Math.pow(grow - 1, 3) + 1.70158 * Math.pow(grow - 1, 2) : 1;
      object.scale.set(baseScale.x * g / Math.sqrt(squash), baseScale.y * g * squash, baseScale.z * g / Math.sqrt(squash));
    },
    /** A happy hop with a spin: call when the child speaks to the companion or pokes it. */
    hop() { if (hopT < 0) hopT = 0; },
    get hopping() { return hopT >= 0; },
  };
}
