# Bottle Rocket Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new `rocket` tab in the WishWorld web headset view: the child's scanned water bottle becomes a bottle rocket that they pilot through six missions teaching thrust, pitch, yaw, roll, lift and drag.

**Architecture:** All physics and mission rules are pure JavaScript with no three.js import (`math.js`, `flight.js`, `attitude.js`, `rings.js`, `missions.js`, `run.js`, `autopilot.js`), so Node can test them. The three.js side (`rocket.js`, `course.js`, `sky.js`, `forces.js`, `hud.js`, `controls.js`, `game.js`) draws the state and reads the controllers. The existing toy scan (`/vr/core/toyscan.js`) is reused, with two backward-compatible options (wording and a fallback toy).

**Tech Stack:** Browser ES modules, three.js (vendored, import map `three`), WebXR via the existing shell `ctx`, Node 20 for the pure tests, headless Chrome through `public/vr/dev/test/cdp.mjs` for the browser check.

**User decisions (already made):**
- Platform: the web build first ("Web build (Recommended)").
- Core loop: "Pilot it (Recommended)": live steering, trigger = thrust, controller tilt = pitch/yaw/roll.
- Setting: "Room, then sky (Recommended)".
- Bottle: "Full 3D model". Then: "dont rebuild a scan feature, we have a working scan feature where we take a pic of something on phone and it builds a 3d model".
- Lesson depth: not answered; ages 6 to 12, "feel it, then name it" (no numbers) was assumed and recorded in the spec.
- Spec sections 1 and 2: "Looks good". Plan: "Write the plan".

Spec: `docs/superpowers/specs/2026-11-21-bottle-rocket-design.md`.

**Spec refinements made while planning** (the spec has been updated to match):
- Controls: thrust is the trigger (laptop: hold the left mouse button). Force arrows toggle on the grip (laptop: G). The A button (push-to-talk), Space (play mode talk) and F (desktop A) are taken by the shell.
- Fins: four, two big side fins (peach, along the rocket's local X: these must line up with a slot) and two small ones.
- Sky: the game draws its own sky field (sphere, ground, clouds), so "Go outside" works in AR passthrough too. The viewer stays on a fixed viewpoint behind the pad; no chase camera (comfort in a hospital bed). The sky numbers are half real scale so the course fits inside 120 m.
- The parachute opens whenever the rocket falls while not firing, and closes again on thrust. The rocket cannot steer under the parachute.

## File map

All paths are under `wishworld-web/public/vr/`.

| File | Responsibility |
|---|---|
| `games/rocket/math.js` | Vectors and quaternions as plain arrays (no three.js) |
| `games/rocket/flight.js` | The flight model: `ROOM`, `SKY`, `H`, `createState`, `stepFixed`, `outOfBounds` |
| `games/rocket/attitude.js` | Angles plus an unlock mask become a target attitude quaternion |
| `games/rocket/rings.js` | Ring and slot geometry: basis, pass-through, roll match |
| `games/rocket/missions.js` | The six missions as data |
| `games/rocket/run.js` | One mission attempt: steps the flight, counts rings, decides won or failed |
| `games/rocket/autopilot.js` | Flies a run by itself (Node tests and `?autoplay=1`) |
| `games/rocket/dev/sim.test.mjs` | Node tests for all of the above |
| `core/toyscan.js` | Modify: optional `words` and `fallbackToy` options; defaults keep the Reef unchanged |
| `games/rocket/rocket.js` | The rocket's look: body (scan or practice bottle), nose, fins, nozzle, spray, parachute |
| `games/rocket/course.js` | Rings, slots, pad and landing circle for a mission |
| `games/rocket/sky.js` | The sky field: sphere, ground and clouds |
| `games/rocket/forces.js` | The four labelled force arrows |
| `games/rocket/hud.js` | Mission card, water gauge and buttons |
| `games/rocket/controls.js` | Right controller (or mouse and keys) becomes angles and thrust |
| `games/rocket/game.js` | The tab object: phases, missions, room and sky placement, scan, dev autoplay |
| `tabs/rocket.js`, `tabs/tabs.json` | Register the tab |
| `games/rocket/dev/check.mjs` | Browser check in the real shell, with screenshots |

Run all commands from `wishworld-web/` unless a step says otherwise.

---

### Task 1: Math helpers and the flight model

**Goal:** `math.js` and `flight.js`, with Node tests proving thrust beats weight, an empty tank cannot launch, the parachute slows the fall, and landing works.

**Files:**
- Create: `public/vr/games/rocket/math.js`
- Create: `public/vr/games/rocket/flight.js`
- Create: `public/vr/games/rocket/dev/sim.test.mjs`

**Acceptance Criteria:**
- [ ] `node public/vr/games/rocket/dev/sim.test.mjs` prints `PASS` for: thrust beats weight (ROOM and SKY), lift-off with a full tank, no lift-off with an empty tank, parachute descent under the limit (room 0.6 m/s, sky 4 m/s), landing on the pad, landing on the floor.
- [ ] Neither file imports three.js or anything outside `games/rocket/`.

**Verify:** `node public/vr/games/rocket/dev/sim.test.mjs` → every line `PASS`, last line `all passed`, exit code 0.

**Steps:**

- [ ] **Step 1: Write `math.js`**

```js
// Vectors [x, y, z] and quaternions [x, y, z, w] as plain arrays, so the flight model runs in Node without three.js.
// Every function writes into `o` and returns it; `o` may be one of the inputs.

export const DEG = Math.PI / 180;
export function set(o, x, y, z) { o[0] = x; o[1] = y; o[2] = z; return o; }
export function copy(o, a) { o[0] = a[0]; o[1] = a[1]; o[2] = a[2]; return o; }
export function add(o, a, b) { o[0] = a[0] + b[0]; o[1] = a[1] + b[1]; o[2] = a[2] + b[2]; return o; }
export function sub(o, a, b) { o[0] = a[0] - b[0]; o[1] = a[1] - b[1]; o[2] = a[2] - b[2]; return o; }
export function scale(o, a, k) { o[0] = a[0] * k; o[1] = a[1] * k; o[2] = a[2] * k; return o; }
/** o = a + b * k */
export function addScaled(o, a, b, k) { o[0] = a[0] + b[0] * k; o[1] = a[1] + b[1] * k; o[2] = a[2] + b[2] * k; return o; }
export function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
export function len(a) { return Math.hypot(a[0], a[1], a[2]); }
export function cross(o, a, b) {
  const x = a[1] * b[2] - a[2] * b[1], y = a[2] * b[0] - a[0] * b[2], z = a[0] * b[1] - a[1] * b[0];
  o[0] = x; o[1] = y; o[2] = z; return o;
}
export function normalize(o, a) { const l = len(a); return l > 1e-12 ? scale(o, a, 1 / l) : set(o, 0, 0, 0); }
export const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

export function qAxisAngle(o, axis, angle) {
  const s = Math.sin(angle / 2);
  o[0] = axis[0] * s; o[1] = axis[1] * s; o[2] = axis[2] * s; o[3] = Math.cos(angle / 2); return o;
}
/** o = a * b (apply b first, then a). */
export function qMul(o, a, b) {
  const ax = a[0], ay = a[1], az = a[2], aw = a[3], bx = b[0], by = b[1], bz = b[2], bw = b[3];
  o[0] = aw * bx + ax * bw + ay * bz - az * by;
  o[1] = aw * by - ax * bz + ay * bw + az * bx;
  o[2] = aw * bz + ax * by - ay * bx + az * bw;
  o[3] = aw * bw - ax * bx - ay * by - az * bz;
  return o;
}
/** o = v rotated by q (the same formula as three.js Vector3.applyQuaternion). */
export function qRotate(o, v, q) {
  const x = v[0], y = v[1], z = v[2], qx = q[0], qy = q[1], qz = q[2], qw = q[3];
  const ix = qw * x + qy * z - qz * y, iy = qw * y + qz * x - qx * z, iz = qw * z + qx * y - qy * x, iw = -qx * x - qy * y - qz * z;
  o[0] = ix * qw + iw * -qx + iy * -qz - iz * -qy;
  o[1] = iy * qw + iw * -qy + iz * -qx - ix * -qz;
  o[2] = iz * qw + iw * -qz + ix * -qy - iy * -qx;
  return o;
}
export function qNormalize(q) {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  q[0] /= l; q[1] /= l; q[2] /= l; q[3] /= l; return q;
}
/** The angle (radians) between two attitudes. */
export function qAngle(a, b) {
  const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
  return 2 * Math.acos(Math.min(1, d));
}
/** Turn q toward target by at most maxAngle radians (in place). */
export function qRotateToward(q, target, maxAngle) {
  const angle = qAngle(q, target);
  if (angle < 1e-6) return q;
  const t = Math.min(1, maxAngle / angle);
  let bx = target[0], by = target[1], bz = target[2], bw = target[3];
  let c = q[0] * bx + q[1] * by + q[2] * bz + q[3] * bw;
  if (c < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; c = -c; }
  let k0, k1;
  if (c > 0.9995) { k0 = 1 - t; k1 = t; }
  else { const th = Math.acos(c), s = Math.sin(th); k0 = Math.sin((1 - t) * th) / s; k1 = Math.sin(t * th) / s; }
  q[0] = q[0] * k0 + bx * k1; q[1] = q[1] * k0 + by * k1; q[2] = q[2] * k0 + bz * k1; q[3] = q[3] * k0 + bw * k1;
  return qNormalize(q);
}
```

- [ ] **Step 2: Write the failing tests in `dev/sim.test.mjs`**

```js
// Node tests for the Bottle Rocket's pure modules (no browser, no three.js).
//   node public/vr/games/rocket/dev/sim.test.mjs
// Prints PASS or FAIL per check and exits 1 if anything failed.

import { ROOM, SKY, H, createState, stepFixed } from '../flight.js';

const failures = [];
export function check(ok, what) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}`);
  if (!ok) failures.push(what);
}
const UPRIGHT = [0, 0, 0, 1];
function fly(params, seconds, input, state = createState()) {
  for (let t = 0; t < seconds; t += H) stepFixed(state, input, params);
  return state;
}

console.log('flight');
check(ROOM.thrust > ROOM.gravity, 'room: thrust beats weight');
check(SKY.thrust > SKY.gravity, 'sky: thrust beats weight');
{
  const s = fly(ROOM, 1, { target: UPRIGHT, thrust: true });
  check(s.launched && s.pos[1] > 0.15, `room: a full tank lifts off (height after 1 s = ${s.pos[1].toFixed(2)} m)`);
  check(s.water < 1 && s.water > 0, 'room: firing uses water');
}
{
  const s = fly(ROOM, 1, { target: UPRIGHT, thrust: true }, createState({ water: 0 }));
  check(!s.launched && s.pos[1] === 0, 'room: an empty tank does not lift off');
}
for (const [name, p, limit] of [['room', ROOM, 0.6], ['sky', SKY, 4]]) {
  const s = fly(p, p.waterSeconds + 0.5, { target: UPRIGHT, thrust: true });   // climb until the tank is empty
  fly(p, 6, { target: UPRIGHT, thrust: false }, s);                            // then fall under the parachute
  check(s.chute || s.landed, `${name}: the parachute opens when falling without thrust`);
  check(s.landed || Math.abs(s.vel[1]) < limit, `${name}: parachute descent ${Math.abs(s.vel[1]).toFixed(2)} m/s is under ${limit} m/s`);
}
{
  const s = fly(ROOM, 0.6, { target: UPRIGHT, thrust: true });                 // hop straight up, then fall back
  fly(ROOM, 8, { target: UPRIGHT, thrust: false }, s);
  check(s.landed && s.landedOn === 'pad', `room: a straight hop lands back on the pad (landed on ${s.landedOn})`);
}
{
  const s = createState({ pos: [1, 0.3, 0], launched: true, vel: [0, -0.5, 0], water: 0 });
  fly(ROOM, 8, { target: UPRIGHT, thrust: false }, s);
  check(s.landed && s.landedOn === 'floor' && Math.abs(s.pos[1] - ROOM.floorY) < 1e-9, 'room: away from the pad it lands on the floor');
}

// Later tasks append their sections above this line.
console.log(failures.length ? `${failures.length} failed` : 'all passed');
process.exit(failures.length ? 1 : 0);
```

- [ ] **Step 3: Run it to see it fail**

Run: `node public/vr/games/rocket/dev/sim.test.mjs`
Expected: an error, `Cannot find module ... flight.js`.

- [ ] **Step 4: Write `flight.js`**

```js
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

import { DEG, set, copy, addScaled, dot, len, qRotate, qRotateToward } from './math.js';

export const H = 1 / 120;

/** The room: metres, around a pad 0.8 m in front of the child. floorY is set by the game when it places the pad. */
export const ROOM = {
  gravity: 1.6, thrust: 2.3, waterSeconds: 6,
  drag: 0.6, chuteDrag: 6, chuteAt: 0.35,
  finLift: 2.2, turnRate: 140 * DEG, minAuthority: 0.35, authoritySpeed: 1.2,
  floorY: -1.3, padRadius: 0.12, bounds: 4,
  autoClimb: 0.6, autoMin: 0.3, arrowPerUnit: 0.1,
};
/** The sky field: half real scale, so the course fits inside about 120 m. */
export const SKY = {
  gravity: 6, thrust: 13, waterSeconds: 6,
  drag: 0.03, chuteDrag: 0.6, chuteAt: 2,
  finLift: 1.6, turnRate: 90 * DEG, minAuthority: 0.2, authoritySpeed: 12,
  floorY: 0, padRadius: 2.5, bounds: 160,
  autoClimb: 0.5, autoMin: 8, arrowPerUnit: 0.025,
};

const NOSE = [0, 1, 0];
const _nose = [0, 0, 0], _acc = [0, 0, 0], _perp = [0, 0, 0];

export function createState(overrides = {}) {
  return {
    pos: [0, 0, 0], vel: [0, 0, 0], quat: [0, 0, 0, 1],
    water: 1,                 // 1 = full tank, 0 = empty
    launched: false, firing: false, chute: false, landed: false, landedOn: null,
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
  if (input.target && !s.chute) qRotateToward(s.quat, input.target, p.turnRate * a * H);
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

  // The pad top is y = 0 at the origin: falling through it within padRadius is a pad landing.
  if (s.t > 0.3 && s.vel[1] < 0 && prevY >= 0 && s.pos[1] <= 0 && Math.hypot(s.pos[0], s.pos[2]) <= p.padRadius) {
    land(s, 0, 'pad');
  } else if (s.pos[1] <= p.floorY && s.vel[1] < 0) {
    land(s, p.floorY, 'floor');
  }
  return s;
}

function land(s, y, where) {
  s.pos[1] = y; set(s.vel, 0, 0, 0);
  s.landed = true; s.landedOn = where; s.firing = false;
}

/** True once the rocket is further than p.bounds from the pad. */
export function outOfBounds(s, p) { return len(s.pos) > p.bounds; }
```

- [ ] **Step 5: Run the tests**

Run: `node public/vr/games/rocket/dev/sim.test.mjs`
Expected: all `PASS`, then `all passed`. If a speed limit fails, change only that parameter (`chuteDrag` up for a slow parachute, or `thrust` relative to `gravity` for lift-off) and keep `thrust > gravity`.

- [ ] **Step 6: Commit**

```bash
git add public/vr/games/rocket/math.js public/vr/games/rocket/flight.js public/vr/games/rocket/dev/sim.test.mjs
git commit -m "Bottle Rocket: pure flight model (thrust, weight, drag, fin lift, parachute) with Node tests"
```

---

### Task 2: Attitude and ring geometry

**Goal:** `attitude.js` (pitch, yaw and roll plus an unlock mask give a target attitude) and `rings.js` (pass through a ring, fit through a slot only when rolled to match), with tests.

**Files:**
- Create: `public/vr/games/rocket/attitude.js`
- Create: `public/vr/games/rocket/rings.js`
- Modify: `public/vr/games/rocket/dev/sim.test.mjs` (add an `attitude and rings` section)

**Acceptance Criteria:**
- [ ] A locked control has no effect: with pitch locked, pitch 30° leaves the nose at (0, 1, 0).
- [ ] Pitch 30° tips the nose forward to (0, 0.866, -0.5). Yaw 90° with pitch 30° gives (-0.5, 0.866, 0) (left).
- [ ] Roll changes the fin axis, not the nose.
- [ ] A path through a ring's centre counts, a path outside its radius does not, and a path the wrong way does not.
- [ ] A slot counts only when the fins line up within 30°.

**Verify:** `node public/vr/games/rocket/dev/sim.test.mjs` → all `PASS`, exit 0.

**Steps:**

- [ ] **Step 1: Add the failing tests.** Insert this section in `sim.test.mjs` above the `// Later tasks append...` line, and add the imports at the top:

```js
import { attitudeTarget } from '../attitude.js';
import { crossesRing, rollMatches } from '../rings.js';
import { DEG, qRotate } from '../math.js';
```

```js
console.log('attitude and rings');
const ALL = { pitch: true, yaw: true, roll: true }, NONE = { pitch: false, yaw: false, roll: false };
const near = (a, b, e = 1e-3) => a.every((x, i) => Math.abs(x - b[i]) < e);
const noseOf = (q) => qRotate([0, 0, 0], [0, 1, 0], q);
const finOf = (q) => qRotate([0, 0, 0], [1, 0, 0], q);
check(near(noseOf(attitudeTarget({ pitch: 30 * DEG, yaw: 0, roll: 0 }, NONE)), [0, 1, 0]), 'locked pitch does nothing');
check(near(noseOf(attitudeTarget({ pitch: 30 * DEG, yaw: 0, roll: 0 }, ALL)), [0, 0.866, -0.5]), 'pitch tips the nose forward');
check(near(noseOf(attitudeTarget({ pitch: 30 * DEG, yaw: 90 * DEG, roll: 0 }, ALL)), [-0.5, 0.866, 0]), 'yaw turns the nose left');
{
  const a = attitudeTarget({ pitch: 30 * DEG, yaw: 0, roll: 0 }, ALL), b = attitudeTarget({ pitch: 30 * DEG, yaw: 0, roll: 60 * DEG }, ALL);
  check(near(noseOf(a), noseOf(b)) && !near(finOf(a), finOf(b)), 'roll spins the fins, not the nose');
}
{
  const ring = { at: [0, 0.6, -1.2], facing: [0, 0, -1], radius: 0.28 };
  const q = [0, 0, 0, 1];
  check(crossesRing([0, 0.6, -1.1], [0, 0.6, -1.3], ring, q), 'through the centre of a ring counts');
  check(!crossesRing([0.4, 0.6, -1.1], [0.4, 0.6, -1.3], ring, q), 'outside the ring does not count');
  check(!crossesRing([0, 0.6, -1.3], [0, 0.6, -1.1], ring, q), 'through the ring backwards does not count');
}
{
  const slot = { at: [0, 0.6, -1.3], facing: [0, 0, -1], radius: 0.35, slot: { width: 0.5, height: 0.16, angle: 60 } };
  const flat = attitudeTarget({ pitch: 80 * DEG, yaw: 0, roll: 0 }, ALL);
  let fits = null;
  for (let r = -180; r <= 180 && !fits; r += 5) {
    const q = attitudeTarget({ pitch: 80 * DEG, yaw: 0, roll: r * DEG }, ALL);
    if (rollMatches(slot, q)) fits = q;
  }
  check(!rollMatches(slot, flat), 'a slot at 60 degrees does not fit an unrolled rocket');
  check(Boolean(fits) && crossesRing([0, 0.6, -1.2], [0, 0.6, -1.4], slot, fits), 'rolled to match, the rocket fits through the slot');
}
```

- [ ] **Step 2: Run to see it fail**

Run: `node public/vr/games/rocket/dev/sim.test.mjs`
Expected: `Cannot find module ... attitude.js`.

- [ ] **Step 3: Write `attitude.js`**

```js
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
```

- [ ] **Step 4: Write `rings.js`**

```js
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
```

- [ ] **Step 5: Run the tests**

Run: `node public/vr/games/rocket/dev/sim.test.mjs`
Expected: all `PASS`, `all passed`.

- [ ] **Step 6: Commit**

```bash
git add public/vr/games/rocket/attitude.js public/vr/games/rocket/rings.js public/vr/games/rocket/dev/sim.test.mjs
git commit -m "Bottle Rocket: attitude from pitch/yaw/roll with unlocks, ring and slot pass-through"
```

---

### Task 3: Missions, mission runs and the autopilot

**Goal:** The six missions as data, `run.js` deciding won or failed, and an autopilot that completes every mission in a Node simulation.

**Files:**
- Create: `public/vr/games/rocket/missions.js`
- Create: `public/vr/games/rocket/run.js`
- Create: `public/vr/games/rocket/autopilot.js`
- Modify: `public/vr/games/rocket/dev/sim.test.mjs` (add a `missions` section)

**Acceptance Criteria:**
- [ ] `MISSIONS` has 6 entries. Missions 1 to 4 are `place: 'room'`, 5 and 6 are `'sky'`. Each unlocks at least what the one before it did.
- [ ] Every ring's `facing` is a unit vector.
- [ ] The autopilot wins every mission within 40 simulated seconds (`run.won === true`).
- [ ] Flying off to the side fails with `reason: 'far'` (or `'landed'` if it comes down first). A short hop that misses the ring fails with `reason: 'landed'`.

**Verify:** `node public/vr/games/rocket/dev/sim.test.mjs` → a `PASS mission N (...) won in X s` line for each of the 6 missions, `all passed`, exit 0.

**Steps:**

- [ ] **Step 1: Add the failing tests.** Imports at the top of `sim.test.mjs`:

```js
import { MISSIONS } from '../missions.js';
import { createRun, stepRun } from '../run.js';
import { autopilot } from '../autopilot.js';
```

Section above `// Later tasks append...`:

```js
console.log('missions');
check(MISSIONS.length === 6, 'six missions');
check(MISSIONS.slice(0, 4).every((m) => m.place === 'room') && MISSIONS.slice(4).every((m) => m.place === 'sky'), 'four in the room, two in the sky');
check(MISSIONS.every((m, i) => i === 0 || ['pitch', 'yaw', 'roll'].every((k) => !MISSIONS[i - 1].unlocked[k] || m.unlocked[k])), 'unlocks only ever grow');
check(MISSIONS.every((m) => m.rings.every((r) => Math.abs(Math.hypot(...r.facing) - 1) < 1e-6)), 'every ring faces along a unit vector');
const paramsFor = (m) => (m.place === 'sky' ? SKY : ROOM);
MISSIONS.forEach((m, i) => {
  const run = createRun(m, paramsFor(m));
  let t = 0;
  while (!run.won && !run.failed && t < 40) { stepRun(run, autopilot(run), 1 / 60); t += 1 / 60; }
  check(run.won, `mission ${i + 1} (${m.id}) ${run.won ? `won in ${t.toFixed(1)} s` : `not won: ${run.reason || 'timed out'}, ring ${run.next} of ${m.rings.length}`}`);
});
{
  const run = createRun(MISSIONS[3], ROOM);            // every control unlocked
  const away = { angles: { pitch: 50 * DEG, yaw: 90 * DEG, roll: 0 }, thrust: true };   // off to the left, away from the slot
  for (let t = 0; t < 30 && !run.failed && !run.won; t += 1 / 60) {
    away.thrust = run.state.pos[1] < 0.5;
    stepRun(run, away, 1 / 60);
  }
  check(run.failed && (run.reason === 'far' || run.reason === 'landed'), `flying away fails (${run.reason})`);
}
{
  const run = createRun(MISSIONS[0], ROOM);
  for (let t = 0; t < 10 && !run.failed; t += 1 / 60) stepRun(run, { angles: { pitch: 0, yaw: 0, roll: 0 }, thrust: t < 0.3 }, 1 / 60);
  check(run.failed && run.reason === 'landed', 'a short hop that misses the ring fails as landed');
}
```

- [ ] **Step 2: Run to see it fail**

Run: `node public/vr/games/rocket/dev/sim.test.mjs`
Expected: `Cannot find module ... missions.js`.

- [ ] **Step 3: Write `missions.js`**

```js
// The six Bottle Rocket missions. Data only: add a mission by adding an entry.
// Room coordinates are metres from the pad top, -Z away from the child, +Y up. Sky coordinates are metres from the
// sky pad (see flight.js SKY). Each mission unlocks one more control; the guide says `line` when it starts.
//   rings    flown through in order (see rings.js)
//   landing  optional: after the last ring, land within `radius` of `at` to win
//   arrows   whether the force arrows start switched on

const unit = (x, y, z) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; };
const LOCKED = { pitch: false, yaw: false, roll: false };

export const MISSIONS = [
  {
    id: 'thrust', title: 'Thrust', place: 'room', unlocked: { ...LOCKED }, arrows: true,
    line: 'Thrust pushes your rocket. Push harder than gravity pulls, and up you go!',
    tip: 'Hold the trigger to squirt water out of the bottom. Fly up through the ring!',
    win: 'Liftoff! Thrust beat gravity!',
    rings: [{ at: [0, 0.8, 0], facing: [0, 1, 0], radius: 0.25 }],
  },
  {
    id: 'pitch', title: 'Pitch', place: 'room', unlocked: { pitch: true, yaw: false, roll: false }, arrows: false,
    line: "Tip the nose to point where you want to go. That's pitch!",
    tip: 'Tip your controller forward to tip the nose, then fly through the ring.',
    win: 'Great pitching!',
    rings: [{ at: [0, 0.6, -1.2], facing: [0, 0, -1], radius: 0.28 }],
  },
  {
    id: 'yaw', title: 'Yaw', place: 'room', unlocked: { pitch: true, yaw: true, roll: false }, arrows: false,
    line: "Twist to turn left and right. That's called yaw!",
    tip: 'Twist your controller left or right to turn. Left ring first!',
    win: 'You turned like a pro!',
    rings: [
      { at: [-0.8, 0.6, -1.0], facing: unit(-0.6, 0, -0.8), radius: 0.3 },
      { at: [0.5, 0.7, -2.0], facing: unit(0.6, 0, -0.8), radius: 0.3 },
    ],
  },
  {
    id: 'roll', title: 'Roll', place: 'room', unlocked: { pitch: true, yaw: true, roll: true }, arrows: false,
    line: 'Roll spins your rocket around its nose. Tilt to fit through!',
    tip: 'Rotate your wrist until the big orange fins match the slot.',
    win: 'Perfect fit!',
    rings: [{ at: [0, 0.6, -1.3], facing: [0, 0, -1], radius: 0.35, slot: { width: 0.5, height: 0.16, angle: 60 } }],
  },
  {
    id: 'liftdrag', title: 'Lift and Drag', place: 'sky', unlocked: { pitch: true, yaw: true, roll: true }, arrows: true,
    line: 'Out here you can go fast! Fins make lift so you can steer, and air drag slows you down.',
    tip: 'Fly through both rings, then let go of the trigger to open the parachute over the circle.',
    win: 'Soft landing! Drag slowed you down.',
    rings: [
      { at: [0, 18, -35], facing: unit(0, 0.3, -1), radius: 6 },
      { at: [0, 24, -70], facing: [0, 0, -1], radius: 6 },
    ],
    landing: { at: [0, 0, -105], radius: 20 },
  },
  {
    id: 'course', title: 'Sky Course', place: 'sky', unlocked: { pitch: true, yaw: true, roll: true }, arrows: false,
    line: 'You know it all now. Fly the course and land on the pad!',
    tip: 'Rings, a slot, then let go to land on the far pad.',
    win: "You're a rocket scientist!",
    rings: [
      { at: [0, 15, -30], facing: [0, 0, -1], radius: 6 },
      { at: [-20, 22, -60], facing: unit(-0.5, 0, -0.85), radius: 6 },
      { at: [0, 26, -90], facing: [0, 0, -1], radius: 7, slot: { width: 11, height: 3.5, angle: 90 } },
    ],
    landing: { at: [8, 0, -120], radius: 10 },
  },
];

export const FAIL_LINES = {
  far: "Whoa, too far! Let's try again.",
  landed: "Down it came! Try again, you've got this.",
  missed: 'So close! Try to land inside the circle.',
};
```

- [ ] **Step 4: Write `run.js`**

```js
// One attempt at a mission: steps the flight model in fixed steps, counts rings, and decides won or failed.
// Pure: no three.js. The game and the Node tests both drive it with { angles, thrust } (controls or autopilot).

import { H, createState, stepFixed, outOfBounds } from './flight.js';
import { crossesRing } from './rings.js';
import { attitudeTarget } from './attitude.js';
import { copy } from './math.js';

export function createRun(mission, params) {
  return {
    mission, params, state: createState(),
    next: 0,                       // index of the next ring
    won: false, failed: false, reason: null,
    events: [],                    // { type: 'ring', index } | { type: 'won' } | { type: 'failed', reason }; the game empties it
    acc: 0, prev: [0, 0, 0], input: { target: [0, 0, 0, 1], thrust: false },
  };
}

export function stepRun(run, controls, dt) {
  if (run.won || run.failed) return run;
  const { mission, params: p, state: s } = run;
  attitudeTarget(controls.angles, mission.unlocked, run.input.target);
  run.input.thrust = Boolean(controls.thrust);
  run.acc += Math.min(dt, 0.1);
  while (run.acc >= H && !run.won && !run.failed) {
    run.acc -= H;
    copy(run.prev, s.pos);
    stepFixed(s, run.input, p);
    const ring = mission.rings[run.next];
    if (ring && crossesRing(run.prev, s.pos, ring, s.quat)) {
      run.events.push({ type: 'ring', index: run.next });
      run.next++;
      if (run.next === mission.rings.length && !mission.landing) finish(run, true);
    } else if (s.landed) {
      const l = mission.landing;
      if (run.next < mission.rings.length) finish(run, false, 'landed');
      else if (Math.hypot(s.pos[0] - l.at[0], s.pos[2] - l.at[2]) <= l.radius) finish(run, true);
      else finish(run, false, 'missed');
    } else if (outOfBounds(s, p)) {
      finish(run, false, 'far');
    }
  }
  return run;
}

function finish(run, won, reason = null) {
  run.won = won; run.failed = !won; run.reason = reason;
  run.events.push(won ? { type: 'won' } : { type: 'failed', reason });
}
```

- [ ] **Step 5: Write `autopilot.js`**

```js
// Flies a mission run by itself: for the Node tests and the dev-only ?autoplay=1. Pure: no three.js.
// It aims the nose at the next ring with a climb bias against gravity, matches a slot's roll by search, and after
// the last ring flies over the landing circle and lets go so the parachute brings it down.

import { attitudeTarget } from './attitude.js';
import { rollMatches } from './rings.js';
import { DEG } from './math.js';

const _q = [0, 0, 0, 1], _try = { pitch: 0, yaw: 0, roll: 0 };

export function autopilot(run, out = { angles: { pitch: 0, yaw: 0, roll: 0 }, thrust: false }) {
  const { mission, state: s, params: p } = run;
  const ring = mission.rings[run.next];
  const l = mission.landing;
  let tx, ty, tz;
  if (ring) { [tx, ty, tz] = ring.at; }
  else if (l) { tx = l.at[0]; ty = s.pos[1]; tz = l.at[2]; }
  else { out.thrust = false; return out; }
  const dx = tx - s.pos[0], dy = ty - s.pos[1], dz = tz - s.pos[2];
  const horiz = Math.hypot(dx, dz);
  const climb = p.autoClimb * Math.max(horiz, p.autoMin);
  out.angles.pitch = Math.atan2(horiz, dy + climb);          // 0 = straight up
  out.angles.yaw = horiz > 1e-3 ? Math.atan2(-dx, -dz) : 0;
  out.angles.roll = ring && ring.slot ? matchRoll(ring, out.angles, mission.unlocked) : 0;
  out.thrust = ring ? true : horiz > l.radius * 0.4;
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
```

- [ ] **Step 6: Run the tests and tune until all six missions are won**

Run: `node public/vr/games/rocket/dev/sim.test.mjs`
Expected: `PASS mission 1 (thrust) won in ...` through `mission 6`, then `all passed`.

If a mission fails, its line gives the reason and the ring reached. Tune in this order and rerun after each change:
1. Ring positions in `missions.js`, keeping room rings within 2.2 m of the pad and 0.4 to 1.0 m above it, and sky rings within 120 m.
2. `autoClimb` and `autoMin` in `flight.js` (the autopilot's gains).
3. `waterSeconds`, only if the tank runs dry before the last ring.

Do not loosen the tests, ring radii below the values above, or the slot tolerance in `rings.js` (30°).

- [ ] **Step 7: Commit**

```bash
git add public/vr/games/rocket/missions.js public/vr/games/rocket/run.js public/vr/games/rocket/autopilot.js public/vr/games/rocket/dev/sim.test.mjs public/vr/games/rocket/flight.js
git commit -m "Bottle Rocket: six missions, mission runs and an autopilot that wins them all in simulation"
```

---

### Task 4: Let the toy scan take wording and a fallback toy

**Goal:** `createToyScan` accepts optional `words` and `fallbackToy`, so the rocket can say "bottle" and use its practice bottle instead of Bubby. The Reef behaves exactly as before.

**Files:**
- Modify: `public/vr/core/toyscan.js` (constants near line 34, `toyName` near line 53, the `createToyScan` signature near line 68, `loadToy` near line 178, `start`, `showFinder`, `greet`)

**Acceptance Criteria:**
- [ ] With no `words` or `fallbackToy`, every spoken line and status text is the same string as before (check with `git diff`: the old literals become the defaults in `WORDS`).
- [ ] `words` overrides any of: `hold`, `phone`, `hint`, `scanning`, `waiting`, `greeting` (with `{name}` and `{child}`), `greeting2`, `noName`.
- [ ] `fallbackToy()` (if given) replaces Bubby when no photo arrives or the model fails to load.
- [ ] An empty `greeting2` is not spoken.
- [ ] The Reef still scans: `/vr/?mode=desktop&tab=reef&autostart=1`, press **Scan a toy** then **Bring Bubby**. Bubby arrives and says the usual lines, with no console errors.

**Verify:** `git diff public/vr/core/toyscan.js` shows only the changes below, and the Reef scan works by hand as described.

**Steps:**

- [ ] **Step 1: Replace the line constants with a defaults table.** Replace

```js
const LINE_HOLD = 'Hold your toy up in front of me!';
const LINE_PHONE = 'Take a picture of your toy with the phone!';
const LINE_GREETING2 = "I can't wait to learn new things together. Where should we go first?";
```

with

```js
/** What the scan says and shows. createToyScan({ words }) overrides any of these (the Bottle Rocket does). */
const WORDS = {
  hold: 'Hold your toy up in front of me!',
  phone: 'Take a picture of your toy with the phone!',
  hint: 'Take a picture of your toy with the phone',
  scanning: 'Scanning your toy...',
  waiting: 'Waiting for a picture from the phone...',
  greeting: "Hi {child}! I'm {name}! I'm so excited to be on this adventure with you!",
  greeting2: "I can't wait to learn new things together. Where should we go first?",
  noName: 'your toy',
};
```

- [ ] **Step 2: `toyName` takes the "no name" word.**

```js
/** "Honey, a golden teddy bear" -> "Honey". */
function toyName(gift, noName = WORDS.noName) {
  const first = String((gift && gift.wish) || '').split(',')[0].trim();
  return first && first.length <= 24 ? first : noName;
}
```

- [ ] **Step 3: The signature and the merged words.** Change the signature to

```js
export function createToyScan({ ctx, ui, audio, rig, parent, takeToy, setScanView = () => {}, setStatus = () => {}, onBusy = () => {}, words = {}, fallbackToy = null }) {
  const w = { ...WORDS, ...words };
```

and add to the options comment above it:

```js
 *   words                     optional: overrides for WORDS (what the scan says and shows)
 *   fallbackToy()             optional: returns { model, name, greeting, greeting2 } to use instead of Bubby
```

- [ ] **Step 4: `loadToy` uses the words and the fallback.**

```js
  function prepared() {
    if (fallbackToy) return { gift: null, ...fallbackToy() };
    return { model: buildBubby(0.3), gift: null, name: BUBBY.name, greeting: BUBBY.greeting, greeting2: BUBBY.greeting2 };
  }
  async function loadToy(gift) {
    if (!gift) return prepared();
    const name = toyName(gift, w.noName);
    const greeting = w.greeting.replace('{name}', name);
    try {
      const model = gift.kind === 'mesh' ? await loadModelUrl(gift.model_url, 0.3) : await loadCreature(gift.option_id);
      return { model, gift, name, greeting, greeting2: w.greeting2 };
    } catch (err) {
      console.warn('[wishworld] toy scan: the scanned toy could not be loaded, the prepared one comes instead.', err && err.message);
      return prepared();
    }
  }
```

- [ ] **Step 5: `start` and `showFinder` use the words.** In `start`: `audio.speak(ready ? w.hold : w.phone);`. In `showFinder`:

```js
    hint.setText(ready ? '' : w.hint);
    ...
    setStatus(ready ? w.scanning : w.waiting);
```

- [ ] **Step 6: `greet` skips an empty second line.** Replace the speak line with

```js
    audio.speak(toy.greeting.replace('{child}', child)).then(() => ((run === r || !run) && toy.greeting2 ? audio.speak(toy.greeting2) : null));
```

- [ ] **Step 7: Check the Reef by hand.** Serve the site (`python -m http.server 8106 --directory public`), open `http://localhost:8106/vr/?mode=desktop&tab=reef&autostart=1`, press **Scan a toy** then **Bring Bubby**. Expected: the status reads "Waiting for a picture from the phone...", Bubby pops in and greets, and the console shows no errors.

- [ ] **Step 8: Commit**

```bash
git add public/vr/core/toyscan.js
git commit -m "Toy scan: optional wording and fallback toy, defaults unchanged for the Reef"
```

---

### Task 5: The rocket's look

**Goal:** `rocket.js` builds the rocket: the scanned model (or a practice bottle) as the body, plus nose cone, four fins, nozzle, water spray and parachute.

**Files:**
- Create: `public/vr/games/rocket/rocket.js`

**Acceptance Criteria:**
- [ ] `createRocket()` returns `{ object, setBody(model|null) -> 'scan'|'practice', setChute(open), setScale(k), update(dt, firing), buildPracticeBottle() }`.
- [ ] `object`'s origin is the nozzle tip and its nose is +Y, matching `flight.js`.
- [ ] `fitBody` turns the model's longest side to +Y, scales it to 0.22 m and stands it on the nozzle. It returns `null` (practice bottle) when the shortest side is under 10% of the longest.
- [ ] The rocket is at most 3 meshes plus the spray points (draw calls).

**Verify:** after Task 7, `/vr/?mode=desktop&tab=rocket&autostart=1&mission=1` shows the practice rocket upright on the pad (screenshot in Task 8). For now: `node --check public/vr/games/rocket/rocket.js` → no output.

**Steps:**

- [ ] **Step 1: Write `rocket.js`**

```js
// The Bottle Rocket's look. The origin is the nozzle tip and the nose points up (+Y), as in flight.js.
// Body: the child's scanned model (from the toy scan), fitted to bottle size, or a practice bottle.
// Kit: nose cone, two big peach side fins along local X (these line up with slots), two small slate fins, nozzle.
// A bottle rocket flies neck-down, so the nozzle is the bottle's neck.

import * as THREE from 'three';
import { MeshBuilder } from '/shared/models.js';
import { dotTexture } from '/vr/core/fx.js';

const NOZZLE = 0.02, BODY = 0.22, NOSE = 0.06;          // 0.30 m nozzle to nose tip at room scale
const PEACH = '#ffc79e', SLATE = '#334052', ICE = '#8fb0d4', RED = '#e86b5a', WHITE = '#fbfdff';
const SPRAY = 48;

/** Turn and scale a model so its longest side is +Y, `length` long, standing on y = 0. null if it is too thin. */
export function fitBody(model, length = BODY) {
  model.position.set(0, 0, 0); model.rotation.set(0, 0, 0);
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  if (box.isEmpty()) return null;
  const size = box.getSize(new THREE.Vector3());
  const longest = Math.max(size.x, size.y, size.z), shortest = Math.min(size.x, size.y, size.z);
  if (!(longest > 0) || shortest < longest * 0.1) return null;
  const turn = new THREE.Group();
  turn.add(model);
  if (longest === size.x) turn.rotation.z = Math.PI / 2;
  else if (longest === size.z) turn.rotation.x = Math.PI / 2;
  const holder = new THREE.Group();
  holder.add(turn);
  holder.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(turn);
  const k = length / (b.max.y - b.min.y);
  turn.scale.setScalar(k);
  const c = b.getCenter(new THREE.Vector3());
  turn.position.set(-c.x * k, -b.min.y * k, -c.z * k);
  return holder;
}

export function buildPracticeBottle() {
  const b = new MeshBuilder();
  b.cylinder([0, 0.015, 0], [0.034, 0.03, 0.034], ICE, null, 2.2, 10);     // shoulder, widening up from the neck
  b.cylinder([0, 0.12, 0], [0.075, 0.18, 0.075], ICE, null, 1, 10);         // body
  b.cylinder([0, 0.11, 0], [0.078, 0.06, 0.078], PEACH, null, 1, 10);       // label band
  const holder = new THREE.Group();
  holder.add(b.mesh({ mirror: 'x' }));
  holder.name = 'PracticeBottle';
  return holder;
}

export function createRocket() {
  const object = new THREE.Group(); object.name = 'Rocket';
  const pose = new THREE.Group(); object.add(pose);

  const kit = new MeshBuilder();
  kit.cylinder([0, NOZZLE / 2, 0], [0.034, NOZZLE, 0.034], WHITE, null, 1, 8);
  kit.cone([0, NOZZLE + BODY + NOSE / 2, 0], [0.08, NOSE, 0.08], RED, null, 10);
  kit.taperBox([0.06, NOZZLE + 0.045, 0], [0.05, 0.08, 0.006], PEACH, null, 0.4, 1);
  kit.taperBox([-0.06, NOZZLE + 0.045, 0], [0.05, 0.08, 0.006], PEACH, null, 0.4, 1);
  kit.taperBox([0, NOZZLE + 0.035, 0.05], [0.006, 0.06, 0.03], SLATE, null, 1, 0.4);
  kit.taperBox([0, NOZZLE + 0.035, -0.05], [0.006, 0.06, 0.03], SLATE, null, 1, 0.4);
  pose.add(kit.mesh({ mirror: 'x' }));

  const bodySlot = new THREE.Group(); bodySlot.position.y = NOZZLE; pose.add(bodySlot);

  const chute = new MeshBuilder();
  chute.hemisphere([0, 0, 0], [0.26, 0.12, 0.26], PEACH, WHITE);
  const chuteMesh = chute.mesh({ mirror: 'x' });
  chuteMesh.position.y = NOZZLE + BODY + NOSE + 0.12;
  chuteMesh.visible = false;
  pose.add(chuteMesh);
  let chuteOpen = false, chuteT = 0;

  // Water spray: a small pool of points falling out of the nozzle, in the rocket's own frame.
  const pos = new Float32Array(SPRAY * 3), vel = new Float32Array(SPRAY * 3), life = new Float32Array(SPRAY);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const sprayMat = new THREE.PointsMaterial({ map: dotTexture(), size: 0.025, color: 0xd8ecff, transparent: true, depthWrite: false });
  const spray = new THREE.Points(geo, sprayMat);
  spray.frustumCulled = false;
  pose.add(spray);
  let nextDrop = 0, kScale = 1;

  return {
    object,
    buildPracticeBottle,
    /** The scanned model, or null for the practice bottle. Returns which one is in use. */
    setBody(model) {
      while (bodySlot.children.length) bodySlot.remove(bodySlot.children[0]);
      const fitted = model ? fitBody(model) : null;
      bodySlot.add(fitted || buildPracticeBottle());
      return fitted ? 'scan' : 'practice';
    },
    setChute(open) {
      if (open !== chuteOpen) { chuteOpen = open; chuteT = 0; chuteMesh.visible = open; }
    },
    setScale(k) { kScale = k; pose.scale.setScalar(k); sprayMat.size = 0.025 * k; },
    update(dt, firing) {
      if (chuteOpen && chuteT < 1) { chuteT = Math.min(1, chuteT + dt * 4); const s = 0.2 + 0.8 * chuteT; chuteMesh.scale.set(s, s, s); }
      if (firing && (nextDrop -= dt) <= 0) {
        nextDrop = 0.012;
        const i = (Math.random() * SPRAY) | 0;
        pos[i * 3] = 0; pos[i * 3 + 1] = 0; pos[i * 3 + 2] = 0;
        vel[i * 3] = (Math.random() - 0.5) * 0.3; vel[i * 3 + 1] = -0.9 - Math.random() * 0.4; vel[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
        life[i] = 0.35;
      }
      for (let i = 0; i < SPRAY; i++) {
        if (life[i] <= 0) { pos[i * 3 + 1] = -1000; continue; }
        life[i] -= dt;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}
```

- [ ] **Step 2: Syntax check**

Run: `node --check public/vr/games/rocket/rocket.js`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add public/vr/games/rocket/rocket.js
git commit -m "Bottle Rocket: rocket model (scanned body or practice bottle, fins, nose, nozzle, spray, parachute)"
```

---

### Task 6: Course, sky field, force arrows and HUD

**Goal:** The things around the rocket: rings, slots, pad and landing circle (`course.js`), the outdoor sky field (`sky.js`), the four labelled force arrows (`forces.js`) and the mission card, water gauge and buttons (`hud.js`).

**Files:**
- Create: `public/vr/games/rocket/course.js`
- Create: `public/vr/games/rocket/sky.js`
- Create: `public/vr/games/rocket/forces.js`
- Create: `public/vr/games/rocket/hud.js`

**Acceptance Criteria:**
- [ ] `createCourse()` returns `{ group, build(mission, params), setProgress(next), ringObject(i) }`. The next ring is bright yellow, passed rings green, later rings peach. Ring and slot frames use `ringBasis` from `rings.js`, so what is drawn is what `crossesRing` tests.
- [ ] `createSky(ctx)` returns `{ group, place(center, floorY) }`: an opaque sphere of radius `min(170, 0.9 * ctx.camera.far)` with vertex-colour gradient, a ground disc and a few clouds. It hides passthrough in AR.
- [ ] `createForces(ctx)` returns `{ group, setScale(k, perUnit), update(state, at, viewer) }`: four arrows (Thrust, Weight, Lift, Drag) with labels facing the viewer, hidden when the force is near zero.
- [ ] `createHud(ctx, handlers)` returns `{ group, place(viewer, forward), setMission(index, mission), setMessage(title, body), setWater(fraction), show(names) }`. Button names: `scan`, `practice`, `arrows`, `again`, `next`, `outside`, `restart`.
- [ ] No allocation in any `update` or `setWater` (module-level scratch objects only).

**Verify:** `node --check` on each of the four files → no output. Visual check in Task 8.

**Steps:**

- [ ] **Step 1: Write `course.js`**

```js
// Rings, slots, the launch pad and the landing circle for one mission, in the stage's frame (see game.js).
// Uses rings.js's basis so the drawn ring is exactly the one crossesRing tests.

import * as THREE from 'three';
import { ringBasis } from './rings.js';

const PEACH = new THREE.Color('#ffc79e'), NEXT = new THREE.Color('#ffe066'), DONE = new THREE.Color('#9fd6a8');
const _u = [0, 0, 0], _v = [0, 0, 0];
const _U = new THREE.Vector3(), _V = new THREE.Vector3(), _N = new THREE.Vector3(), _A = new THREE.Vector3(), _P = new THREE.Vector3();
const _m = new THREE.Matrix4();

export function createCourse() {
  const group = new THREE.Group(); group.name = 'Course';
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.02, 24), new THREE.MeshBasicMaterial({ color: '#456190' }));
  pad.position.y = -0.01;
  const landing = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 40), new THREE.MeshBasicMaterial({ color: '#ffc79e', side: THREE.DoubleSide }));
  landing.rotation.x = -Math.PI / 2;
  group.add(pad, landing);
  let rings = [];

  function clear() {
    for (const r of rings) {
      group.remove(r.object);
      r.object.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    }
    rings = [];
  }

  function makeRing(ring) {
    const material = new THREE.MeshBasicMaterial({ color: PEACH });
    const holder = new THREE.Group();
    ringBasis(ring, _u, _v);
    _U.fromArray(_u); _V.fromArray(_v); _N.fromArray(ring.facing);
    if (ring.slot) {
      // Rotate the basis so local X is the slot's long side.
      const a = ring.slot.angle * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
      _A.copy(_U).multiplyScalar(c).addScaledVector(_V, s);
      _P.copy(_U).multiplyScalar(-s).addScaledVector(_V, c);
      _U.copy(_A); _V.copy(_P);
      const w = ring.slot.width, h = ring.slot.height, t = Math.max(0.015, w * 0.05);
      for (const [x, y, sx, sy] of [[0, h / 2 + t / 2, w + 2 * t, t], [0, -h / 2 - t / 2, w + 2 * t, t], [w / 2 + t / 2, 0, t, h], [-w / 2 - t / 2, 0, t, h]]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, t), material);
        bar.position.set(x, y, 0);
        holder.add(bar);
      }
    } else {
      holder.add(new THREE.Mesh(new THREE.TorusGeometry(ring.radius, Math.max(0.012, ring.radius * 0.07), 8, 32), material));
    }
    _m.makeBasis(_U, _V, _N);
    holder.quaternion.setFromRotationMatrix(_m);
    holder.position.fromArray(ring.at);
    return { object: holder, material };
  }

  return {
    group,
    build(mission, params) {
      clear();
      for (const ring of mission.rings) { const r = makeRing(ring); rings.push(r); group.add(r.object); }
      const thick = mission.place === 'sky' ? 10 : 1;              // 2 cm in the room, 20 cm in the sky
      pad.scale.set(params.padRadius, thick, params.padRadius);
      pad.position.y = -0.01 * thick;                              // the top stays at y = 0
      landing.visible = Boolean(mission.landing);
      if (mission.landing) {
        landing.position.set(mission.landing.at[0], 0.02, mission.landing.at[2]);
        landing.scale.setScalar(mission.landing.radius);
      }
      this.setProgress(0);
    },
    setProgress(next) {
      rings.forEach((r, i) => r.material.color.copy(i < next ? DONE : i === next ? NEXT : PEACH));
    },
    ringObject(i) { return rings[i] ? rings[i].object : null; },
  };
}
```

- [ ] **Step 2: Write `sky.js`**

```js
// "Go outside": an opaque sky sphere, a snowy ground disc and a few clouds. It is drawn by the game itself so it
// works in AR passthrough too (it covers the room). One draw call per part, unlit vertex colours.

import * as THREE from 'three';
import { MeshBuilder } from '/shared/models.js';

export function createSky(ctx) {
  const group = new THREE.Group(); group.name = 'SkyField'; group.visible = false;
  const radius = Math.min(170, 0.9 * (ctx.camera.far || 200));

  const sphereGeo = new THREE.SphereGeometry(radius, 24, 12);
  const top = new THREE.Color('#6fa8dc'), horizon = new THREE.Color('#dcecf8');
  const colors = [], p = sphereGeo.attributes.position, c = new THREE.Color();
  for (let i = 0; i < p.count; i++) { c.copy(horizon).lerp(top, Math.max(0, p.getY(i) / radius)); colors.push(c.r, c.g, c.b); }
  sphereGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const sphere = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  sphere.renderOrder = -10;

  const ground = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.98, 48), new THREE.MeshBasicMaterial({ color: '#f5f7fa', fog: false }));
  ground.rotation.x = -Math.PI / 2;

  const clouds = new MeshBuilder();
  for (const [x, y, z, s] of [[-40, 45, -90, 14], [30, 55, -120, 18], [70, 40, -60, 12], [-80, 50, -40, 16], [10, 60, -150, 20]]) {
    clouds.sphere([x, y, z], [s * 1.6, s * 0.6, s], '#ffffff', null, 8);
    clouds.sphere([x + s * 0.7, y + s * 0.15, z], [s, s * 0.5, s * 0.8], '#ffffff', null, 8);
  }
  const cloudMesh = clouds.mesh({ mirror: 'x' });

  group.add(sphere, ground, cloudMesh);
  return {
    group,
    /** Centre the field on the viewer, with the ground at floorY. */
    place(center, floorY) { group.position.set(center.x, floorY, center.z); sphere.position.y = 0; },
  };
}
```

- [ ] **Step 3: Write `forces.js`**

```js
// The four forces drawn as labelled arrows from the rocket: thrust, weight, lift and drag. Lengths follow the forces
// flight.js reports, clamped so they stay readable. No numbers: this is for ages 6 to 12.

import * as THREE from 'three';

const KINDS = [['thrust', '#ff9a5a', 'Thrust'], ['weight', '#6f87b8', 'Weight'], ['lift', '#5fbf73', 'Lift'], ['drag', '#c07ad6', 'Drag']];
const _dir = new THREE.Vector3(), _tip = new THREE.Vector3(), _world = new THREE.Vector3();

export function createForces(ctx) {
  const group = new THREE.Group(); group.name = 'Forces';
  const arrows = KINDS.map(([key, color, label]) => {
    const arrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 0.1, color, 0.03, 0.02);
    const tag = ctx.ui.makeTextPanel(label, { width: 0.16, fontSize: 0.026, background: null, color });
    group.add(arrow, tag);
    return { key, arrow, tag };
  });
  let k = 1, perUnit = 0.1;

  return {
    group,
    setScale(scale, per) { k = scale; perUnit = per; for (const a of arrows) a.tag.scale.setScalar(scale); },
    /** state: flight state; at: the rocket's position (stage frame, a Vector3); viewer: head position (world). */
    update(state, at, viewer) {
      for (const a of arrows) {
        const f = state.forces[a.key];
        const m = Math.hypot(f[0], f[1], f[2]);
        const on = m > 1e-3;
        a.arrow.visible = on; a.tag.visible = on;
        if (!on) continue;
        _dir.set(f[0] / m, f[1] / m, f[2] / m);
        const length = Math.min(0.35, Math.max(0.05, m * perUnit)) * k;
        a.arrow.position.copy(at);
        a.arrow.setDirection(_dir);
        a.arrow.setLength(length, 0.05 * k, 0.03 * k);
        _tip.copy(at).addScaledVector(_dir, length + 0.04 * k);
        a.tag.position.copy(_tip);
        ctx.ui.faceViewer(a.tag, _world.copy(viewer));
      }
    },
  };
}
```

- [ ] **Step 4: Write `hud.js`**

```js
// The Bottle Rocket's HUD: a mission card on the left, a water gauge on the right, and buttons under the card.
// Placed 0.9 m in front of the viewer, facing them, in world space (not on the stage).

import * as THREE from 'three';

const BUTTONS = [
  ['scan', 'Scan your bottle'], ['practice', 'Use a practice bottle'], ['arrows', 'Force arrows'],
  ['again', 'Try again'], ['next', 'Next mission'], ['outside', 'Go outside'], ['restart', 'Fly again'],
];

export function createHud(ctx, handlers) {
  const group = new THREE.Group(); group.name = 'RocketHud';
  const card = ctx.ui.makePanel({
    width: 0.44, height: 0.24, style: 'frame',
    labels: [{ text: 'Bottle Rocket', size: 0.044, font: 'title', y: 0.07, h: 0.07 }, { text: '', size: 0.026, y: -0.03, h: 0.14 }],
  });
  card.position.set(-0.5, 0.02, 0);
  card.rotation.y = 0.3;
  group.add(card);

  const gauge = new THREE.Group();
  gauge.position.set(0.5, -0.05, 0);
  gauge.rotation.y = -0.3;
  const back = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.24), new THREE.MeshBasicMaterial({ color: '#334052' }));
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(0.038, 0.228), new THREE.MeshBasicMaterial({ color: '#8fd0ff' }));
  fill.position.z = 0.001;
  const label = ctx.ui.makeTextPanel('Water', { width: 0.14, fontSize: 0.024, background: null });
  label.position.y = -0.15;
  gauge.add(back, fill, label);
  group.add(gauge);

  const buttons = {};
  BUTTONS.forEach(([name, text]) => {
    const b = ctx.ui.makeButton(text, () => handlers[name] && handlers[name](), { width: 0.3, height: 0.085, textHeight: 0.028 });
    b.visible = false;
    buttons[name] = b;
    group.add(b);
  });

  return {
    group,
    place(viewer, forward) {
      group.position.set(viewer.x + forward.x * 0.9, viewer.y - 0.15, viewer.z + forward.z * 0.9);
      group.rotation.set(0, Math.atan2(-forward.x, -forward.z), 0);
    },
    setMission(index, mission) { card.setText(`${index + 1}. ${mission.title}`, 0); card.setText(mission.tip, 1); },
    setMessage(title, body) { card.setText(title, 0); card.setText(body, 1); },
    setWater(fraction) { fill.scale.y = Math.max(0.001, fraction); fill.position.y = -0.114 * (1 - fraction); },
    /** Show only these buttons, stacked under the card in this order. */
    show(names) {
      for (const name in buttons) buttons[name].visible = false;
      names.forEach((name, i) => { const b = buttons[name]; b.visible = true; b.position.set(-0.5, -0.17 - i * 0.1, 0.01); b.rotation.y = 0.3; });
    },
  };
}
```

- [ ] **Step 5: Syntax check**

Run: `for f in course sky forces hud; do node --check public/vr/games/rocket/$f.js; done`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add public/vr/games/rocket/course.js public/vr/games/rocket/sky.js public/vr/games/rocket/forces.js public/vr/games/rocket/hud.js
git commit -m "Bottle Rocket: rings and slots, sky field, force arrows and HUD"
```

---

### Task 7: Controls, the game and the tab

**Goal:** `controls.js`, `game.js`, `tabs/rocket.js` and the `tabs.json` entry. A child can open Bottle Rocket, scan a bottle (or use the practice one), fly the four room missions, go outside, and fly the two sky missions.

**Files:**
- Create: `public/vr/games/rocket/controls.js`
- Create: `public/vr/games/rocket/game.js`
- Create: `public/vr/tabs/rocket.js`
- Modify: `public/vr/tabs/tabs.json` (add `"rocket"` after `"snowcircuit"`)

**Acceptance Criteria:**
- [ ] The tab menu shows **Bottle Rocket**. Entering shows the card, **Scan your bottle** and **Use a practice bottle**.
- [ ] **Scan your bottle** runs the existing scan with bottle wording. A scanned model becomes the body. **Use a practice bottle** pressed while the scan waits, a scan timeout, or a model that is too thin gives the practice bottle.
- [ ] Holding the trigger (or the left mouse button) launches. Tipping, twisting and rolling the right controller steer, with locked controls ignored. The mouse also steers on a laptop, with W/S/A/D (pitch, yaw) and Q/E (roll).
- [ ] Ring passes chime and buzz the controller. A win shows **Next mission** (after mission 4: **Go outside**; after mission 6: **Fly again**). A failure says the matching `FAIL_LINES` line and shows **Try again**.
- [ ] Missions 5 and 6 play in the sky field, which also covers the room in AR.
- [ ] Grip (laptop: G) or **Force arrows** toggles the arrows.
- [ ] Dev only (localhost): `?autoplay=1` plays all six missions by itself with the practice bottle; `?mission=N` starts at mission N; `window.__rocket.state()` returns `{ phase, mission, next, won, failed, reason, water, body, place }`.
- [ ] Leaving the tab cancels a running scan, unsubscribes from gifts and gives W A S D back to the shell (`desktopMoveEnabled = true`).

**Verify:** `python -m http.server 8106 --directory public`, then open `http://localhost:8106/vr/?mode=desktop&tab=rocket&autostart=1&autoplay=1`. Within about 3 minutes `window.__rocket.state().phase === 'done'` in the console, with no errors.

**Steps:**

- [ ] **Step 1: Write `controls.js`**

```js
// The right controller (or the mouse and keys) becomes { angles: { pitch, yaw, roll }, thrust }.
// Angles are the controller's turn since calibrate() (called at launch), read in its own frame:
// tip forward = pitch, twist = yaw, wrist roll = roll. On a laptop the mouse aims the controller ray, so it steers
// too; W/S pitch, A/D yaw and Q/E roll add on top. Thrust is the trigger (left mouse button on a laptop).

import * as THREE from 'three';

const TURN = 70 * Math.PI / 180;     // radians per second for the keys
const _q = new THREE.Quaternion(), _inv = new THREE.Quaternion(), _e = new THREE.Euler();

export function createControls(ctx) {
  const out = { angles: { pitch: 0, yaw: 0, roll: 0 }, thrust: false };
  const keyed = { pitch: 0, yaw: 0, roll: 0 };
  let calibrated = false;

  return {
    calibrate() {
      ctx.controllers.right.ray.getWorldQuaternion(_inv).invert();
      keyed.pitch = keyed.yaw = keyed.roll = 0;
      calibrated = true;
    },
    reset() { calibrated = false; out.angles.pitch = out.angles.yaw = out.angles.roll = 0; },
    read(dt) {
      const hand = ctx.controllers.right, keys = ctx.input.state.keys;
      out.thrust = Boolean(hand.connected && hand.trigger > 0.55);
      if (!calibrated) { out.angles.pitch = out.angles.yaw = out.angles.roll = 0; return out; }
      if (keys.has('KeyW')) keyed.pitch += TURN * dt;
      if (keys.has('KeyS')) keyed.pitch -= TURN * dt;
      if (keys.has('KeyA')) keyed.yaw += TURN * dt;
      if (keys.has('KeyD')) keyed.yaw -= TURN * dt;
      if (keys.has('KeyQ')) keyed.roll += TURN * dt;
      if (keys.has('KeyE')) keyed.roll -= TURN * dt;
      hand.ray.getWorldQuaternion(_q).premultiply(_inv);           // turn since calibrate, in the controller's frame
      _e.setFromQuaternion(_q, 'YXZ');
      out.angles.pitch = -_e.x + keyed.pitch;                         // pointing down = nose forward
      out.angles.yaw = _e.y + keyed.yaw;                              // twist left = turn left
      out.angles.roll = _e.z + keyed.roll;
      return out;
    },
  };
}
```

- [ ] **Step 2: Write `game.js`**

```js
// The Bottle Rocket tab: the child's scanned water bottle becomes a rocket they pilot through six missions.
// Spec: docs/superpowers/specs/2026-11-21-bottle-rocket-design.md. Physics and rules are pure (flight.js, run.js);
// this file places things, reads the controls and plays the moments.
//
// Phases: choose -> scanning -> ready -> flying -> won | failed -> ready (next or again) ... -> done.
// Room missions sit on a "stage": a group at the pad, 0.8 m in front of the viewer and 0.3 m below the eyes, local -Z
// facing away from them. Sky missions sit on a stage 6 m ahead on the ground, inside the sky field.
//
// Dev only (localhost): ?autoplay=1 flies every mission with the autopilot and the practice bottle,
// ?mission=N starts at mission N, window.__rocket has state() for checks (dev/check.mjs).

import * as THREE from 'three';
import { MISSIONS, FAIL_LINES } from './missions.js';
import { ROOM, SKY } from './flight.js';
import { createRun, stepRun } from './run.js';
import { autopilot } from './autopilot.js';
import { createControls } from './controls.js';
import { createRocket, buildPracticeBottle } from './rocket.js';
import { createCourse } from './course.js';
import { createSky } from './sky.js';
import { createForces } from './forces.js';
import { createHud } from './hud.js';
import { createToyScan } from '/vr/core/toyscan.js';

const SKY_SCALE = 8;
const BOTTLE_WORDS = {
  hold: 'Hold your bottle up in front of me!',
  phone: 'Take a picture of your water bottle with the phone!',
  hint: 'Take a picture of your bottle with the phone',
  scanning: 'Scanning your bottle...',
  waiting: 'Waiting for a picture from the phone...',
  greeting: "Your bottle is a rocket now, {child}! Let's learn to fly!",
  greeting2: '',
  noName: 'your bottle',
};
const PRACTICE_LINE = "Let's fly this practice bottle!";

const _head = new THREE.Vector3(), _fwd = new THREE.Vector3(), _at = new THREE.Vector3();

function isDev(ctx) {
  if (ctx.dev && ctx.dev.harness) return true;
  return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
}

export function createRocketGame(ctx) {
  const dev = isDev(ctx);
  const query = ctx.params || new URLSearchParams(location.search);
  const autoMode = dev && query.get('autoplay') === '1';
  const startAt = dev ? Math.max(0, Math.min(MISSIONS.length - 1, (parseInt(query.get('mission'), 10) || 1) - 1)) : 0;

  const group = new THREE.Group(); group.name = 'BottleRocket';
  const stage = new THREE.Group(); group.add(stage);
  const sky = createSky(ctx); group.add(sky.group);
  const course = createCourse(); stage.add(course.group);
  const rocket = createRocket(); stage.add(rocket.object);
  const forces = createForces(ctx); stage.add(forces.group);
  const controls = createControls(ctx);
  const hud = createHud(ctx, {
    scan: () => { phase = 'scanning'; hud.setMessage('Scanning...', 'Take a picture of your water bottle with the phone.'); hud.show(['practice']); toyScan.start(); },
    // While a scan waits for the phone, pressing the scan again brings the fallback (the practice bottle).
    practice: () => (toyScan.busy ? toyScan.start() : useBody(null)),
    arrows: () => { arrowsOn = !arrowsOn; forces.group.visible = arrowsOn; },
    again: () => startMission(index),
    next: () => startMission(index + 1),
    outside: () => goOutside(),
    restart: () => { place = null; startMission(0); },
  });
  group.add(hud.group);

  let phase = 'choose', index = startAt, run = null, place = null, params = ROOM, body = 'practice';
  let arrowsOn = false, autoWait = 0, buzz = 0, unsubscribe = null, active = false;
  let roomParams = { ...ROOM };
  const skyParams = { ...SKY };

  const toyScan = createToyScan({
    ctx, ui: ctx.ui, audio: ctx.audio, rig: ctx.rig, parent: group, words: BOTTLE_WORDS,
    fallbackToy: () => ({ model: buildPracticeBottle(), name: 'Practice bottle', greeting: PRACTICE_LINE, greeting2: '' }),
    takeToy(model, gift) { useBody(gift ? model : null); },
    setScanView(on) { stage.visible = !on; },
    setStatus() {},
  });

  function useBody(model) {
    body = rocket.setBody(model);
    if (model && body === 'practice') ctx.say(PRACTICE_LINE);
    startMission(index);
  }

  function placeRoom() {
    ctx.viewerPosition(_head); ctx.rig.viewerForwardFlat(_fwd);
    stage.position.set(_head.x + _fwd.x * 0.8, _head.y - 0.3, _head.z + _fwd.z * 0.8);
    stage.rotation.set(0, Math.atan2(-_fwd.x, -_fwd.z), 0);
    roomParams = { ...ROOM, floorY: ctx.rig.floorY() - stage.position.y };
    sky.group.visible = false;
    hud.place(_head, _fwd);
    place = 'room';
  }

  function placeSky() {
    ctx.viewerPosition(_head); ctx.rig.viewerForwardFlat(_fwd);
    const floor = ctx.rig.floorY();
    stage.position.set(_head.x + _fwd.x * 6, floor, _head.z + _fwd.z * 6);
    stage.rotation.set(0, Math.atan2(-_fwd.x, -_fwd.z), 0);
    sky.place(_head, floor);
    sky.group.visible = true;
    hud.place(_head, _fwd);
    place = 'sky';
  }

  async function goOutside() {
    hud.show([]);
    await ctx.rig.fadeTo(1, 0.35);
    placeSky();
    startMission(index + 1);
    ctx.rig.fadeTo(0, 0.5);
  }

  function startMission(i) {
    index = i;
    const mission = MISSIONS[i];
    if (place !== mission.place) (mission.place === 'sky' ? placeSky : placeRoom)();
    params = mission.place === 'sky' ? skyParams : roomParams;
    run = createRun(mission, params);
    course.build(mission, params);
    const k = mission.place === 'sky' ? SKY_SCALE : 1;
    rocket.setScale(k);
    rocket.setChute(false);
    forces.setScale(k, params.arrowPerUnit);
    arrowsOn = mission.arrows;
    forces.group.visible = arrowsOn;
    showRocket();
    hud.setMission(i, mission);
    hud.setWater(1);
    hud.show(['arrows']);
    controls.reset();
    ctx.input.state.pointersEnabled = true;
    ctx.say(mission.line);
    phase = 'ready';
    autoWait = 1.2;
  }

  function showRocket() {
    const s = run.state;
    rocket.object.position.fromArray(s.pos);
    rocket.object.quaternion.fromArray(s.quat);
  }

  function finish() {
    const mission = MISSIONS[index];
    ctx.input.state.pointersEnabled = true;
    if (run.won) {
      phase = 'won';
      ctx.audio.sfx('success', 0.7);
      ctx.say(mission.win);
      const last = index === MISSIONS.length - 1;
      if (last) { phase = 'done'; hud.setMessage('All missions done!', 'You learned thrust, pitch, yaw, roll, lift and drag.'); hud.show(['restart']); }
      else { hud.setMessage('Mission complete!', mission.win); hud.show([MISSIONS[index + 1].place !== mission.place ? 'outside' : 'next']); }
      ctx.log('rocket_mission', { mission: mission.id, won: true, body });
    } else {
      phase = 'failed';
      ctx.audio.sfx('buzz', 0.5);
      ctx.say(FAIL_LINES[run.reason] || FAIL_LINES.landed);
      hud.setMessage('Try again!', FAIL_LINES[run.reason] || FAIL_LINES.landed);
      hud.show(['again']);
      ctx.log('rocket_mission', { mission: mission.id, won: false, reason: run.reason, body });
    }
    autoWait = 1.5;
  }

  function autoStep(dt) {
    if (phase === 'choose') { useBody(null); return; }
    if ((autoWait -= dt) > 0) return;
    if (phase === 'won') (MISSIONS[index + 1].place !== MISSIONS[index].place ? goOutside : () => startMission(index + 1))();
    else if (phase === 'failed') startMission(index);
  }

  const debug = {
    state: () => ({
      phase, mission: index, next: run ? run.next : 0, won: run ? run.won : false, failed: run ? run.failed : false,
      reason: run ? run.reason : null, water: run ? run.state.water : 1, body, place,
    }),
    practice: () => useBody(null),
  };

  return {
    name: 'Bottle Rocket', group,
    enter() {
      active = true;
      ctx.input.state.desktopMoveEnabled = false;
      place = null;
      placeRoom();
      phase = 'choose';
      index = startAt;
      stage.visible = true; hud.group.visible = true;
      hud.setMessage('Bottle Rocket', 'Turn your water bottle into a rocket!');
      hud.show(['scan', 'practice']);
      rocket.setBody(null);
      if (ctx.gifts) unsubscribe = ctx.gifts.subscribe((gift) => { toyScan.offer(gift); });
      ctx.say('Want to turn your water bottle into a rocket? Scan it with the phone!');
      if (dev) window.__rocket = debug;
    },
    exit() {
      active = false;
      toyScan.cancel();
      if (unsubscribe) { unsubscribe(); unsubscribe = null; }
      ctx.input.state.desktopMoveEnabled = true;
      sky.group.visible = false;
      if (dev && window.__rocket === debug) delete window.__rocket;
    },
    update(dt) {
      if (!active) return;
      toyScan.update(dt);
      if (autoMode) autoStep(dt);
      if (phase !== 'ready' && phase !== 'flying') return;
      const input = autoMode ? autopilot(run) : controls.read(dt);
      if (phase === 'ready') {
        if (!input.thrust) return;
        if (!autoMode) controls.calibrate();
        phase = 'flying';
        hud.show([]);
        ctx.input.state.pointersEnabled = false;
      }
      const passed = run.next;
      stepRun(run, input, dt);
      const s = run.state;
      showRocket();
      rocket.setChute(s.chute);
      rocket.update(dt, s.firing);
      hud.setWater(s.water);
      if (s.firing && (buzz -= dt) <= 0) { buzz = 0.12; ctx.haptic('right', 0.2, 40); }
      if (arrowsOn) { _at.fromArray(s.pos); ctx.viewerPosition(_head); forces.update(s, _at, _head); }
      if (run.next !== passed) {
        course.setProgress(run.next);
        ctx.audio.chime(course.ringObject(passed));
        ctx.haptic('right', 0.6, 80);
      }
      run.events.length = 0;
      if (run.won || run.failed) finish();
    },
    onSqueezeStart() { if (phase === 'ready' || phase === 'flying') { arrowsOn = !arrowsOn; forces.group.visible = arrowsOn; } },
    onRecenter() { if (place === 'room' && phase !== 'flying') { place = null; placeRoom(); } },
  };
}
```

- [ ] **Step 3: Write `tabs/rocket.js`**

```js
// The Bottle Rocket tab: the child's scanned water bottle becomes a rocket they pilot through six missions that
// teach thrust, pitch, yaw, roll, lift and drag. The game lives in /vr/games/rocket/ (game.js is the place to start).
// Dev only: ?autoplay=1, ?mission=N, window.__rocket. Checks: games/rocket/dev/.

import { createRocketGame } from '/vr/games/rocket/game.js';

export const meta = { id: 'rocket', label: 'Bottle Rocket', order: 4 };

export function createTab(ctx) {
  return createRocketGame(ctx);
}
```

- [ ] **Step 4: Register the tab.** `public/vr/tabs/tabs.json` becomes:

```json
["hub", "reef", "worlds", "frostslice", "snowcircuit", "rocket", "explore", "calm", "mailbox"]
```

- [ ] **Step 5: Play it by hand on the laptop.** Run `python -m http.server 8106 --directory public` (from `wishworld-web/`), open `http://localhost:8106/vr/?mode=desktop&tab=rocket&autostart=1`, press **Use a practice bottle**, then hold the left mouse button. Expected: water spray, the rocket rises through the ring, the ring turns green with a chime, "Mission complete!", **Next mission**. Then `...&autoplay=1` and wait. Expected: in the console, `window.__rocket.state().phase` eventually reads `'done'`, with no red errors.

If the shell's ctx lacks `ctx.rig.viewerForwardFlat` or `ctx.rig.floorY` (it should not: `main.js:132-133`), use `ctx.viewerForwardFlat(_fwd)` and `ctx.floorY()` instead, which `main.js` also exposes.

- [ ] **Step 6: Commit**

```bash
git add public/vr/games/rocket/controls.js public/vr/games/rocket/game.js public/vr/tabs/rocket.js public/vr/tabs/tabs.json
git commit -m "Bottle Rocket: playable tab (scan or practice bottle, six missions, room and sky)"
```

---

### Task 8: Browser check with screenshots

**Goal:** `dev/check.mjs` opens the real shell headless, plays every mission with the autopilot, saves a screenshot of each in flight, and fails if any mission is not won or the page logs an error.

**Files:**
- Create: `public/vr/games/rocket/dev/check.mjs`

**Acceptance Criteria:**
- [ ] `node public/vr/games/rocket/dev/check.mjs autoplay ../Logs/verification/rocket` saves `autoplay-0N-mission-N.png` for N = 1..6 plus `autoplay-07-done.png`, and prints `PASS` per mission.
- [ ] `node public/vr/games/rocket/dev/check.mjs start ../Logs/verification/rocket` saves the choose screen and the rocket on the pad, and checks that the body is `practice`.
- [ ] The draw-call count with the rocket in flight is printed and is under 60.
- [ ] Exit code 1 if a mission is lost or times out, or if `window.__rocket` never appears.

**Verify:** with `python -m http.server 8106 --directory public` running, both commands above exit 0. Open the screenshots and check by eye: an upright rocket with fins and nose on a blue pad, rings visible, and the sky field in missions 5 and 6.

**Steps:**

- [ ] **Step 1: Write `check.mjs`**

```js
// Browser check for the Bottle Rocket tab in the real shell (/vr/?mode=desktop&autostart=1), headless.
// Needs the site served locally:  python -m http.server 8106 --directory public   (from wishworld-web/)
//
//   node check.mjs <scenario> <out-dir> [--base http://localhost:8106]
//     start     the choose screen, then the practice bottle on the pad
//     autoplay  ?autoplay=1: the autopilot flies all six missions; one picture per mission in flight
// Exits 1 on a failure. Set BROWSER to another Chromium (for example Edge) if Chrome will not start headless.

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launch, sleep } from '../../../dev/test/cdp.mjs';

const args = process.argv.slice(2);
const scenario = args[0] || 'start';
const out = args[1] || '.';
const option = (name, fallback) => { const i = args.indexOf('--' + name); return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback; };
const base = option('base', 'http://localhost:8106');
if (!['start', 'autoplay'].includes(scenario)) { console.error('unknown scenario ' + scenario); process.exit(2); }
mkdirSync(out, { recursive: true });

const url = `${base}/vr/?mode=desktop&tab=rocket&autostart=1&mute=1${scenario === 'autoplay' ? '&autoplay=1' : ''}`;
const AWAKE = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling',
  '--disable-features=CalculateNativeWinOcclusion'];
const browser = await launch({ width: 1280, height: 800, flags: AWAKE });
try { await browser.send('Emulation.setFocusEmulationEnabled', { enabled: true }); } catch { /* older browsers */ }

let shots = 0, failed = false;
const shot = async (name) => { const f = join(out, `${scenario}-${String(++shots).padStart(2, '0')}-${name}.png`); await browser.screenshot(f); console.log('  saved ' + f); };
const state = async () => JSON.parse(await browser.evaluate('JSON.stringify(window.__rocket ? window.__rocket.state() : null)'));
const check = (ok, what) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}`); if (!ok) failed = true; };
const calls = () => browser.evaluate('window.wishworld.renderer.info.render.calls');

try {
  await browser.navigate(url);
  await browser.until('window.__rocket', 30000, 200);
  if (scenario === 'start') {
    await sleep(1500);
    await shot('choose');
    await browser.evaluate('window.__rocket.practice()');
    await sleep(1500);
    const s = await state();
    check(s.phase === 'ready' && s.body === 'practice' && s.mission === 0, `practice bottle on the pad (${JSON.stringify(s)})`);
    await shot('pad');
  } else {
    for (let i = 0; i < 6; i++) {
      await browser.until(`window.__rocket.state().mission === ${i} && window.__rocket.state().phase === 'flying'`, 60000, 100);
      await sleep(i < 4 ? 1500 : 3000);
      await shot(`mission-${i + 1}`);
      if (i === 0) { const c = await calls(); check(c < 60, `draw calls in flight: ${c}`); }
      await browser.until(`['won', 'failed', 'done'].includes(window.__rocket.state().phase)`, 90000, 100);
      const s = await state();
      check(s.phase === 'won' || s.phase === 'done', `mission ${i + 1} ${s.phase}${s.reason ? ' (' + s.reason + ')' : ''}`);
      if (s.phase === 'failed') break;
    }
    if (!failed) { await sleep(1000); await shot('done'); check((await state()).phase === 'done', 'all six missions done'); }
  }
} catch (err) {
  check(false, String(err && err.message ? err.message : err));
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Check `cdp.mjs`'s method names.** Run: `grep -n "navigate\|close\|screenshot\|send" public/vr/dev/test/cdp.mjs | head`. If the page-open method is not `navigate` (for example it is `open` or `goto`) or closing is not `close`, rename those two calls in `check.mjs` to match. Use `games/frostslice/dev/check.mjs` as the working reference for how it opens a URL.

- [ ] **Step 3: Run both scenarios**

Run (two shells, from `wishworld-web/`):
```bash
python -m http.server 8106 --directory public
node public/vr/games/rocket/dev/check.mjs start ../Logs/verification/rocket
node public/vr/games/rocket/dev/check.mjs autoplay ../Logs/verification/rocket
```
Expected: `PASS` lines, exit 0, and 9 PNGs in `Logs/verification/rocket/`. Open them: the rocket and rings are visible in 1 to 4, and the sky field in 5 and 6. If a mission passes in Node (Task 3) but fails here, the cause is the game wiring, not the physics: compare `window.__rocket.state()` against the Node run of the same mission.

- [ ] **Step 4: Commit**

```bash
git add public/vr/games/rocket/dev/check.mjs ../Logs/verification/rocket
git commit -m "Bottle Rocket: headless browser check with a screenshot per mission"
```

---

### After the tasks: on the headset (by hand)

Not an automated task. Open `https://wishworld-web.netlify.app/vr/?room=WISH&tab=rocket` on the Quest 2 after deploying, or `/vr/?tab=rocket` locally over the network. Check that:
- the seated controls feel right (tip, twist and wrist roll), and the pad sits where someone in bed can see it;
- a real phone scan of a water bottle becomes the rocket body;
- "Go outside" covers the room in passthrough;
- it runs smoothly (`&stats=1`: under about 60 draws).
