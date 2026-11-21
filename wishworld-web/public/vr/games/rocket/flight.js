// The Bottle Rocket's flight model: pure maths, no three.js, so Node can test it (dev/sim.test.mjs).
//
// The rocket is a point at its base (the nozzle) with an attitude. Its nose is local +Y. Each fixed step of H
// seconds: turn toward the target attitude (faster when flying fast: the fins need moving air), then add up four
// accelerations (mass is 1, so force = acceleration), the same four the force arrows draw:
//   thrust  along the nose while the trigger is held and water is left
//   weight  straight down
//   drag    against the motion, much bigger under the parachute
//   lift    from the fins: pushes the motion round toward where the nose points
// Numbers are "toy" numbers: the room is slow and gentle, the sky is half real scale.

import { DEG, set, copy, addScaled, dot, cross, len, normalize, qAxisAngle, qMul, qRotate, qRotateToward } from './math.js';

export const H = 1 / 120;

/** The room: metres, around a pad 0.8 m in front of the child. floorY is set by the game when it places the pad. */
export const ROOM = {
  gravity: 1.6, thrust: 2.3, waterSeconds: 6,
  drag: 0.6, chuteDrag: 6, chuteAt: 0.35,
  finLift: 2.2, turnRate: 140 * DEG, minAuthority: 0.35, authoritySpeed: 1.2,
  floorY: -1.3, padRadius: 0.12, padClear: 0.03, bounds: 4,
  autoClimb: 0.6, autoMin: 0.3, arrowPerUnit: 0.1,
};
/** The sky field: half real scale, so the course fits inside about 120 m. */
export const SKY = {
  gravity: 6, thrust: 13, waterSeconds: 12,
  drag: 0.03, chuteDrag: 0.6, chuteAt: 2,
  finLift: 1.6, turnRate: 90 * DEG, minAuthority: 0.2, authoritySpeed: 12,
  floorY: 0, padRadius: 2.5, padClear: 1, bounds: 160,
  autoClimb: 0.5, autoMin: 8, arrowPerUnit: 0.025,
};

const NOSE = [0, 1, 0];
const _nose = [0, 0, 0], _acc = [0, 0, 0], _perp = [0, 0, 0], _axis = [0, 0, 0], _swing = [0, 0, 0, 1], _up = [0, 0, 0, 1];

export function createState(overrides = {}) {
  return {
    pos: [0, 0, 0], vel: [0, 0, 0], quat: [0, 0, 0, 1],
    water: 1,                 // 1 = full tank, 0 = empty
    launched: false, firing: false, chute: false, landed: false, landedOn: null,
    cleared: false,           // has risen padClear above the pad top: until then the pad is solid underneath
    t: 0,                     // seconds since launch
    forces: { thrust: [0, 0, 0], weight: [0, 0, 0], lift: [0, 0, 0], drag: [0, 0, 0] },
    ...overrides,
  };
}

/** How well the fins can steer at this speed, 0 to 1. On the pad the rocket can always be aimed. */
export function authority(s, p) {
  return s.launched ? Math.min(1, p.minAuthority + len(s.vel) / p.authoritySpeed) : 1;
}

/** One fixed step of H seconds. input = { target: [x, y, z, w] attitude, thrust: boolean }. Mutates and returns s. */
export function stepFixed(s, input, p) {
  const f = s.forces;
  if (s.landed) { s.firing = false; return s; }
  const a = authority(s, p);
  if (s.chute) hangUpright(s, p.turnRate * H);              // the canopy swings it upright: not steering
  else if (input.target) qRotateToward(s.quat, input.target, p.turnRate * a * H);
  qRotate(_nose, NOSE, s.quat);

  s.firing = Boolean(input.thrust) && s.water > 0;
  if (s.firing) { s.launched = true; s.chute = false; }
  if (!s.launched) {
    set(f.thrust, 0, 0, 0); set(f.weight, 0, 0, 0); set(f.lift, 0, 0, 0); set(f.drag, 0, 0, 0);
    return s;
  }
  s.t += H;
  if (s.firing) s.water = Math.max(0, s.water - H / p.waterSeconds);
  if (!s.firing && s.vel[1] < -p.chuteAt) s.chute = true;

  const speed = len(s.vel);
  if (s.firing) set(f.thrust, _nose[0] * p.thrust, _nose[1] * p.thrust, _nose[2] * p.thrust); else set(f.thrust, 0, 0, 0);
  set(f.weight, 0, -p.gravity, 0);
  const k = (s.chute ? p.chuteDrag : p.drag) * speed;
  set(f.drag, -s.vel[0] * k, -s.vel[1] * k, -s.vel[2] * k);
  if (s.chute) set(f.lift, 0, 0, 0);
  else {
    const along = dot(s.vel, _nose);
    addScaled(_perp, s.vel, _nose, -along);                  // the part of the motion that is not along the nose
    const l = -p.finLift * a;
    set(f.lift, _perp[0] * l, _perp[1] * l, _perp[2] * l);
  }

  copy(_acc, f.thrust);
  addScaled(_acc, _acc, f.weight, 1); addScaled(_acc, _acc, f.drag, 1); addScaled(_acc, _acc, f.lift, 1);
  addScaled(s.vel, s.vel, _acc, H);
  const prevY = s.pos[1];
  addScaled(s.pos, s.pos, s.vel, H);

  // The pad top is y = 0 at the origin. Until the rocket has cleared it the pad is solid: a tap or a launch tipped
  // too far to climb just sits on it, with the water left for another go. After that, falling onto it is a landing.
  if (s.pos[1] > p.padClear) s.cleared = true;
  const overPad = Math.hypot(s.pos[0], s.pos[2]) <= p.padRadius;
  if (!s.cleared && overPad && prevY >= 0 && s.pos[1] < 0) {
    s.pos[1] = 0; s.vel[1] = Math.max(0, s.vel[1]);
  } else if (s.cleared && overPad && s.vel[1] < 0 && prevY >= 0 && s.pos[1] <= 0) {
    land(s, 0, 'pad');
  } else if (s.pos[1] <= p.floorY && s.vel[1] < 0) {
    land(s, p.floorY, 'floor');
  }
  return s;
}

function land(s, y, where) {
  const f = s.forces;
  s.pos[1] = y; set(s.vel, 0, 0, 0);
  s.landed = true; s.landedOn = where; s.firing = false;
  set(f.thrust, 0, 0, 0); set(f.weight, 0, 0, 0); set(f.lift, 0, 0, 0); set(f.drag, 0, 0, 0);
}

/** Under the parachute: swing the nose toward straight up by at most maxAngle, keeping the heading (no twist). */
function hangUpright(s, maxAngle) {
  qRotate(_nose, NOSE, s.quat);
  const angle = Math.acos(Math.max(-1, Math.min(1, _nose[1])));
  if (angle < 1e-6) return;
  cross(_axis, _nose, NOSE);
  if (len(_axis) < 1e-9) set(_axis, 1, 0, 0);               // nose straight down: any level axis will do
  normalize(_axis, _axis);
  qAxisAngle(_swing, _axis, angle);
  qMul(_up, _swing, s.quat);                                 // the shortest swing that stands the nose up
  qRotateToward(s.quat, _up, maxAngle);
}

/** True once the rocket is further than p.bounds from the pad. */
export function outOfBounds(s, p) { return len(s.pos) > p.bounds; }
