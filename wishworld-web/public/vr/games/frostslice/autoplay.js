// Dev only (?autoplay=1 on localhost or in the dev harness): a scripted right blade that sweeps through the
// fruit, so a headless run can prove slicing, scoring, combos, penalties and the end screen with no hands.
//
//   autoplay=1     slice the fruit, leave the ice blocks alone
//   autoplay=ice   slice everything (to see "Ouch!" and "Out of lives")
//
// The script only moves the blade; every cut still goes through the game's own speed and swept-segment test.

import * as THREE from 'three';

const SWEEP_SECONDS = 0.2;        // one pass across a fruit
const SWEEP_HALF = 0.3;           // metres either side of it: 0.6 m in 0.2 s = 3 m/s at the blade
const BEHIND = 0.35;              // the grip is this far nearer the player than the fruit, blade pointing away

// True when an ice block hangs where a sweep across `f` would pass.
function nearIce(f, flying) {
  const p = f.mesh.position;
  for (let i = 0; i < flying.length; i++) {
    const h = flying[i];
    if (!h.hazard) continue;
    const q = h.mesh.position;
    if (Math.abs(q.y - p.y) < 0.22 && Math.abs(q.x - p.x) < SWEEP_HALF + 0.2) return true;
  }
  return false;
}

export function createAutoplay(mode) {
  const sliceIce = mode === 'ice';
  const rest = new THREE.Vector3(-0.28, 1.05, 0.2);       // stage frame: right of the player (-X), low, a little ahead
  const pos = new THREE.Vector3().copy(rest);
  const quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);   // the holder's -Z along the stage's +Z
  const scale = new THREE.Vector3(1, 1, 1);
  let target = null, t = 0, side = 1, sweeps = 0;

  return {
    /**
     * Pick and follow a target. `flying` is the game's list of things in the air. Writes the blade pose (stage
     * frame) and returns true when the blade was just lifted to a new place (that jump is not a swing).
     */
    update(dt, flying, matrix) {
      let jumped = false;
      if (target && (!target.live || target.time > target.apexTime * 2.2)) target = null;
      if (!target) {
        // the one nearest the top of its arc that the blade can reach
        let best = null, bestScore = Infinity;
        for (let i = 0; i < flying.length; i++) {
          const f = flying[i];
          if (f.hazard && !sliceIce) continue;
          const phase = f.time / f.apexTime;
          if (phase < 0.7 || phase > 1.9) continue;
          if (!sliceIce && nearIce(f, flying)) continue;   // wait until the ice block has moved away
          const score = Math.abs(phase - 1);
          if (score < bestScore) { bestScore = score; best = f; }
        }
        if (best) { target = best; t = 0; side = -side; sweeps++; jumped = true; }
      }
      if (target) {
        if (!jumped) t += dt;                              // the first frame only places the blade
        const k = Math.min(1, t / SWEEP_SECONDS);
        const p = target.mesh.position;
        pos.set(p.x + side * SWEEP_HALF * (k * 2 - 1), p.y, p.z - BEHIND);
        if (k >= 1) target = null;                         // missed (or it was cut on the way): choose again
      } else {
        // drift back to rest, slowly enough never to count as a swing
        const step = Math.min(1, dt * 1.2 / Math.max(0.001, pos.distanceTo(rest)));
        pos.lerp(rest, step);
      }
      matrix.compose(pos, quat, scale);
      return jumped;
    },
    reset() { target = null; pos.copy(rest); },
    get sweeps() { return sweeps; },
  };
}
