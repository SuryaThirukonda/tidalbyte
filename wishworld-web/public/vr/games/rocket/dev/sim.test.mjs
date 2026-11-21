// Node tests for the Bottle Rocket's pure modules (no browser, no three.js).
//   node public/vr/games/rocket/dev/sim.test.mjs
// Prints PASS or FAIL per check and exits 1 if anything failed.

import { ROOM, SKY, H, createState, stepFixed } from '../flight.js';
import { attitudeTarget } from '../attitude.js';
import { crossesRing, rollMatches } from '../rings.js';
import { DEG, qRotate } from '../math.js';
import { MISSIONS } from '../missions.js';
import { createRun, stepRun } from '../run.js';
import { autopilot } from '../autopilot.js';

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
  check(s.chute && !s.landed, `${name}: the parachute opens when falling without thrust (still in the air)`);
  check(s.chute && !s.landed && Math.abs(s.vel[1]) < limit, `${name}: parachute descent ${Math.abs(s.vel[1]).toFixed(2)} m/s is under ${limit} m/s`);
  s.water = 0.5;
  fly(p, H, { target: UPRIGHT, thrust: true }, s);
  check(!s.chute && s.firing, `${name}: firing again closes the parachute`);
}
{
  const s = fly(ROOM, 0.6, { target: UPRIGHT, thrust: true });                 // hop straight up, then fall back
  fly(ROOM, 8, { target: UPRIGHT, thrust: false }, s);
  check(s.landed && s.landedOn === 'pad', `room: a straight hop lands back on the pad (landed on ${s.landedOn})`);
  check(Object.values(s.forces).every((v) => v.every((x) => x === 0)), 'room: landing clears all four force arrows');
}
for (const [name, p] of [['room', ROOM], ['sky', SKY]]) {
  const s = fly(p, 0.05, { target: UPRIGHT, thrust: true });                // a tap of the trigger
  fly(p, 3, { target: UPRIGHT, thrust: false }, s);
  check(!s.landed && s.pos[1] === 0 && s.water < 1, `${name}: a 0.05 s tap leaves the rocket sitting on the pad (y = ${s.pos[1]}, water ${s.water.toFixed(3)})`);
}
for (const [name, p] of [['room', ROOM], ['sky', SKY]]) {
  const tipped = attitudeTarget({ pitch: 80 * DEG, yaw: 0, roll: 0 }, { pitch: true, yaw: false, roll: false });
  const s = createState({ quat: [...tipped] });
  let lowest = 0;
  for (let t = 0; t < 3 && !s.landed; t += H) {
    stepFixed(s, { target: tipped, thrust: true }, p);
    if (Math.hypot(s.pos[0], s.pos[2]) <= p.padRadius) lowest = Math.min(lowest, s.pos[1]);
  }
  check(lowest >= 0, `${name}: a full-thrust launch pitched 80 degrees never sinks into the pad (lowest ${lowest.toFixed(3)} m over it)`);
}
{
  const tipped = attitudeTarget({ pitch: 80 * DEG, yaw: 30 * DEG, roll: 0 }, { pitch: true, yaw: true, roll: false });
  const s = createState({ pos: [0, 30, 0], vel: [0, -3, -5], launched: true, cleared: true, water: 0, quat: [...tipped] });
  fly(SKY, 2, { target: tipped, thrust: false }, s);
  const tilt = Math.acos(Math.min(1, qRotate([0, 0, 0], [0, 1, 0], s.quat)[1])) / DEG;
  check(s.chute && tilt < 10, `sky: a rocket pitched 80 degrees hangs upright under its parachute after 2 s (tilt ${tilt.toFixed(1)} degrees)`);
}
{
  const s = createState({ pos: [1, 0.3, 0], launched: true, vel: [0, -0.5, 0], water: 0 });
  fly(ROOM, 8, { target: UPRIGHT, thrust: false }, s);
  check(s.landed && s.landedOn === 'floor' && Math.abs(s.pos[1] - ROOM.floorY) < 1e-9, 'room: away from the pad it lands on the floor');
}

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

console.log('missions');
check(MISSIONS.length === 6, 'six missions');
check(MISSIONS.slice(0, 4).every((m) => m.place === 'room') && MISSIONS.slice(4).every((m) => m.place === 'sky'), 'four in the room, two in the sky');
check(MISSIONS.every((m, i) => i === 0 || ['pitch', 'yaw', 'roll'].every((k) => !MISSIONS[i - 1].unlocked[k] || m.unlocked[k])), 'unlocks only ever grow');
check(MISSIONS.every((m) => m.rings.every((r) => Math.abs(Math.hypot(...r.facing) - 1) < 1e-6)), 'every ring faces along a unit vector');
const paramsFor = (m) => (m.place === 'sky' ? SKY : ROOM);
MISSIONS.forEach((m, i) => {
  const run = createRun(m, paramsFor(m));
  let t = 0, afterRings = null;
  while (!run.won && !run.failed && t < 40) {
    stepRun(run, autopilot(run), 1 / 60); t += 1 / 60;
    if (afterRings === null && run.next === m.rings.length) afterRings = run.state.water;
  }
  const pct = (w) => `${Math.round(w * 100)}%`;
  check(run.won, `mission ${i + 1} (${m.id}) ${run.won ? `won in ${t.toFixed(1)} s, water left ${pct(afterRings)} after the rings, ${pct(run.state.water)} at the end` : `not won: ${run.reason || 'timed out'}, ring ${run.next} of ${m.rings.length}`}`);
  if (m.place === 'sky') check(afterRings !== null && afterRings >= 0.3, `mission ${i + 1} (${m.id}) leaves a child at least 30% of the tank after the rings`);
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

// Later tasks append their sections above this line.
console.log(failures.length ? `${failures.length} failed` : 'all passed');
process.exit(failures.length ? 1 : 0);
