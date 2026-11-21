// Flies a mission run by itself: for the Node tests and the dev-only ?autoplay=1. Pure: no three.js.
// It aims the nose at the next ring's axis (correcting for sideways drift) with a climb bias against gravity, matches a slot's roll by search, and after
// the last ring flies over the landing circle and lets go so the parachute brings it down.

import { attitudeTarget } from './attitude.js';
import { rollMatches } from './rings.js';
import { DEG } from './math.js';

// lead: seconds of velocity correction in the aim. approach: how far back along a ring's axis to aim (0 = its centre).
// coast: seconds of horizontal coasting allowed for when letting go over the landing circle.
export const AUTO = { lead: 0.75, approach: 0.2, coast: 1 };
const _q = [0, 0, 0, 1], _try = { pitch: 0, yaw: 0, roll: 0 };

export function autopilot(run, out = { angles: { pitch: 0, yaw: 0, roll: 0 }, thrust: false }) {
  const { mission, state: s, params: p } = run;
  const ring = mission.rings[run.next];
  const l = mission.landing;
  let tx, ty, tz;
  if (ring) {
    // Aim at a point on the ring's axis, a fraction of the way back toward the rocket, so it lines up to fly
    // straight through instead of clipping the ring at an angle.
    const f = ring.facing;
    const along = Math.min(0, (s.pos[0] - ring.at[0]) * f[0] + (s.pos[1] - ring.at[1]) * f[1] + (s.pos[2] - ring.at[2]) * f[2]);
    tx = ring.at[0] + f[0] * along * AUTO.approach;
    ty = ring.at[1] + f[1] * along * AUTO.approach;
    tz = ring.at[2] + f[2] * along * AUTO.approach;
  } else if (l) { tx = l.at[0]; ty = s.pos[1]; tz = l.at[2]; }
  else { out.thrust = false; return out; }
  // Aim at the target plus a correction that cancels the part of the motion not heading at it, so the rocket
  // turns onto the line to the ring instead of sliding past it.
  let dx = tx - s.pos[0], dy = ty - s.pos[1], dz = tz - s.pos[2];
  const dist = Math.hypot(dx, dy, dz), speed = Math.hypot(s.vel[0], s.vel[1], s.vel[2]);
  if (dist > 1e-6 && s.launched) {
    const k = AUTO.lead * speed / dist;
    dx += AUTO.lead * -s.vel[0] + k * dx; dy += AUTO.lead * -s.vel[1] + k * dy; dz += AUTO.lead * -s.vel[2] + k * dz;
  }
  const horiz = Math.hypot(dx, dz);
  const climb = p.autoClimb * Math.max(horiz, p.autoMin);
  out.angles.pitch = Math.atan2(horiz, dy + climb);          // 0 = straight up
  out.angles.yaw = horiz > 1e-3 ? Math.atan2(-dx, -dz) : 0;
  out.angles.roll = ring && ring.slot ? matchRoll(ring, out.angles, mission.unlocked) : 0;
  // Over the landing, let go early enough that the coast before the parachute opens ends inside the circle.
  out.thrust = ring ? true : Math.hypot(l.at[0] - s.pos[0], l.at[2] - s.pos[2]) - AUTO.coast * Math.hypot(s.vel[0], s.vel[2]) > l.radius * 0.4;
  return out;
}

function matchRoll(ring, angles, unlocked) {
  _try.pitch = angles.pitch; _try.yaw = angles.yaw;
  for (let step = 0; step <= 36; step++) {                    // 0, +5, -5, +10, -10, ... degrees
    const r = (step % 2 ? 1 : -1) * Math.ceil(step / 2) * 5 * DEG;
    _try.roll = r;
    if (rollMatches(ring, attitudeTarget(_try, unlocked, _q), 15)) return r;
  }
  return 0;
}
