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
