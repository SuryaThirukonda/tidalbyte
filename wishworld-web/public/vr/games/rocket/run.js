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
