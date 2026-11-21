// Rings and slots the rocket flies through. Pure maths, no three.js.
// ring = { at: [x, y, z], facing: unit [x, y, z] (the way to fly through), radius, slot?: { width, height, angle } }
// A slot is a rectangle `width` x `height` whose long side is turned `angle` degrees from the ring plane's
// horizontal (u) toward its vertical (v). It only lets the rocket through when the big fins (local +X) line up
// with the long side.

import { DEG, set, sub, dot, cross, len, normalize, qRotate } from './math.js';

const UP = [0, 1, 0], FIN = [1, 0, 0];
const _a = [0, 0, 0], _b = [0, 0, 0], _h = [0, 0, 0], _u = [0, 0, 0], _v = [0, 0, 0], _f = [0, 0, 0];

/** The ring plane's horizontal u and vertical v (unit vectors, written into u and v). */
export function ringBasis(ring, u, v) {
  cross(u, UP, ring.facing);
  if (len(u) < 1e-4) set(u, 1, 0, 0);
  normalize(u, u);
  cross(v, ring.facing, u);
  return u;
}

/** True when the fins line up with the slot's long side within `tolerance` degrees. */
export function rollMatches(ring, quat, tolerance = 30) {
  qRotate(_f, FIN, quat);
  ringBasis(ring, _u, _v);
  const fu = dot(_f, _u), fv = dot(_f, _v);
  if (Math.hypot(fu, fv) < 0.3) return false;                 // fins edge-on to the ring
  const diff = (((Math.atan2(fv, fu) / DEG - ring.slot.angle) % 180) + 180) % 180;
  return Math.min(diff, 180 - diff) <= tolerance;
}

/** True when the step prev -> cur passes through the ring the right way (and fits, for a slot). */
export function crossesRing(prev, cur, ring, quat) {
  sub(_a, prev, ring.at); sub(_b, cur, ring.at);
  const da = dot(_a, ring.facing), db = dot(_b, ring.facing);
  if (!(da < 0 && db >= 0)) return false;
  const t = da / (da - db);
  set(_h, _a[0] + (_b[0] - _a[0]) * t, _a[1] + (_b[1] - _a[1]) * t, _a[2] + (_b[2] - _a[2]) * t);
  ringBasis(ring, _u, _v);
  const pu = dot(_h, _u), pv = dot(_h, _v);
  if (!ring.slot) return pu * pu + pv * pv <= ring.radius * ring.radius;
  const c = Math.cos(ring.slot.angle * DEG), s = Math.sin(ring.slot.angle * DEG);
  const along = pu * c + pv * s, across = -pu * s + pv * c;
  if (Math.abs(along) > ring.slot.width / 2 || Math.abs(across) > ring.slot.height / 2) return false;
  return rollMatches(ring, quat);
}
