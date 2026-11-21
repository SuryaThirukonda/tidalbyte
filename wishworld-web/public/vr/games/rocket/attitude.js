// Pitch, yaw and roll (radians) become the attitude the rocket should turn to. Pure maths, no three.js.
//   pitch > 0  tips the nose forward (toward -Z, away from the child)
//   yaw   > 0  turns the heading left (toward -X)
//   roll       spins the rocket about its own nose
// A control that is not unlocked yet counts as 0. The order is yaw * pitch * roll: roll about the nose first, then tip,
// then turn the heading.

import { DEG, clamp, qAxisAngle, qMul } from './math.js';

export const MAX_PITCH = 85 * DEG;
const X = [1, 0, 0], Y = [0, 1, 0];
const _y = [0, 0, 0, 1], _p = [0, 0, 0, 1], _r = [0, 0, 0, 1];

export function attitudeTarget(angles, unlocked, out = [0, 0, 0, 1]) {
  const pitch = unlocked.pitch ? clamp(angles.pitch, -MAX_PITCH, MAX_PITCH) : 0;
  const yaw = unlocked.yaw ? angles.yaw : 0;
  const roll = unlocked.roll ? angles.roll : 0;
  qAxisAngle(_y, Y, yaw); qAxisAngle(_p, X, -pitch); qAxisAngle(_r, Y, roll);
  qMul(out, _y, _p);
  return qMul(out, out, _r);
}
