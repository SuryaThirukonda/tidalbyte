// Dev only: runs whole races in node (no browser) and checks the port against the exported Unity data.
//   node public/vr/games/snowcircuit/dev/sim.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildTrack } from '../track.js';
import { SnowCircuitSim, Phase, formatTime, steerFromHands } from '../sim.js';
import { createAutodrive } from '../autodrive.js';

let failed = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) failed++; };

// ---- the centre line against /models/layouts.json (written by the Unity exporter) ----
const track = buildTrack();
try {
  const layouts = JSON.parse(readFileSync(fileURLToPath(new URL('../../../../models/layouts.json', import.meta.url)), 'utf8'));
  const t = layouts.track;
  // The exporter writes Unity (x, y, z) either as (-x, y, z) or as (x, y, -z): accept whichever it is.
  let worst = Infinity;
  for (const [xSign, zSign] of [[-1, 1], [1, -1]]) {
    let w = 0;
    for (let i = 0; i < track.n; i++) w = Math.max(w, Math.hypot(track.x[i] - xSign * t.points[i][0], track.z[i] - zSign * t.points[i][2]));
    worst = Math.min(worst, w);
  }
  check(t.points.length === track.n, `320 samples (${t.points.length} in layouts.json)`);
  check(Math.abs(t.length - track.length) < 0.01, `length ${track.length.toFixed(4)} m (Unity ${t.length})`);
  check(worst < 0.002, `centre line matches the Unity export to ${(worst * 1000).toFixed(2)} mm`);
  check(t.width === track.width, 'width 7 m');
} catch (err) { console.log('skip layouts.json: ' + err.message); }

check(formatTime(7.34) === '0:07.3' && formatTime(83.96) === '1:24.0' && formatTime(0) === '0:00.0', 'time format');
check(steerFromHands(0.3, 0, 45) === 0 && steerFromHands(0.05, 0.1, 45) === null && Math.abs(steerFromHands(0.3, -0.3, 45) - 1) < 1e-9
  && Math.abs(steerFromHands(0.3, 0.3 * Math.tan(22.5 * Math.PI / 180), 45) + 0.5) < 1e-9 && steerFromHands(0.3, -0.01, 45) === 0,
'hand tilt to steering: 45 degrees is full lock, 3 degree dead zone, right hand lower turns right');

// ---- a whole race, driven by the autodrive through the real handling model ----
function race({ rivals, fps = 72, quiet = false, driver = true }) {
  const log = [];
  const sim = new SnowCircuitSim({
    track, rivalCount: rivals, on: {
      countdown: (s) => log.push(['count', s, sim.raceTime]),
      countdownEnd: () => log.push(['countEnd']),
      checkpoint: (n) => log.push(['checkpoint', n, sim.raceTime]),
      lapDone: (time) => log.push(['lapDone', time]),
      lap: (lap, last) => log.push(['lap', lap, last, sim.place]),
      bump: () => log.push(['bump', sim.raceTime]),
      finish: (r) => log.push(['finish', r]),
    },
  });
  const auto = createAutodrive(sim);
  const dt = 1 / fps;
  let time = 0, maxSpeed = 0, offFrames = 0, maxOff = 0, maxTurn = 0, lastYaw = sim.yaw;
  for (let i = 0; i < 30; i++) { sim.update(dt, 0, 0, 0); time += dt; }      // sitting at the menu
  const startState = sim.state;
  sim.startRace();
  let countdownTime = 0;
  while (sim.state !== Phase.Finished && time < 600) {
    const a = driver ? auto.update() : { steer: 0, throttle: 0, brake: 0 };
    sim.update(dt, a.steer, a.throttle, a.brake);
    time += dt;
    if (sim.state === Phase.Countdown) countdownTime += dt;
    if (sim.state === Phase.Racing) {
      maxSpeed = Math.max(maxSpeed, sim.speed);
      if (!sim.onTrack) offFrames++;
      const off = Math.hypot(sim.carX - track.x[sim.index], sim.carZ - track.z[sim.index]);
      maxOff = Math.max(maxOff, off);
      maxTurn = Math.max(maxTurn, Math.abs(sim.yaw - lastYaw) / dt);
    }
    lastYaw = sim.yaw;
    if (!driver && time > 20) break;
  }
  for (let i = 0; i < fps * 4; i++) { sim.update(dt, 0, 0, 0); time += dt; }  // rolling to a stop behind the finish panel
  if (!quiet) {
    for (const e of log) {
      if (e[0] === 'lap') console.log(`     lap ${e[1]}${e[2] ? ' (last)' : ''} place ${e[3]}/${sim.racers}`);
      if (e[0] === 'lapDone') console.log(`     lap time ${formatTime(e[1])}`);
      if (e[0] === 'finish') console.log(`     finish: "${e[1].title}" | ${e[1].info.replace('\n', ' | ')} | says "${e[1].voice}"`);
    }
    if (sim.rivals) console.log('     rivals: ' + sim.rivals.cars.map((c) => `${c.name} ${c.distance.toFixed(0)} m${c.finished ? ' (home ' + formatTime(c.finishTime) + ')' : ''}`).join(', '));
  }
  return { sim, log, startState, countdownTime, maxSpeed, offFrames, maxOff, maxTurn };
}

for (const rivals of [4, 0, 5]) {
  console.log(`-- race with ${rivals} rivals`);
  const r = race({ rivals });
  const s = r.sim;
  const laps = r.log.filter((e) => e[0] === 'lapDone').length;
  const cps = r.log.filter((e) => e[0] === 'checkpoint').map((e) => e[1]).join('');
  check(r.startState === Phase.Ready, 'starts at the menu (Ready)');
  check(r.log.filter((e) => e[0] === 'count').length === 4 && Math.abs(r.countdownTime - 2.4) < 0.05, `countdown: 4 steps, race starts after ${r.countdownTime.toFixed(2)} s`);
  check(s.state === Phase.Finished && laps === 3, `finished 3 laps in ${formatTime(s.raceTime)}`);
  check(cps === '230230230', `checkpoints in order (${cps})`);
  check(r.maxSpeed <= 13.0001 && r.maxSpeed > 11, `top speed ${r.maxSpeed.toFixed(2)} m/s (cap 13)`);
  check(r.maxOff <= 3.5 + 1.2 + 0.35, `stayed in the corridor (furthest from a centre-line sample ${r.maxOff.toFixed(2)} m; wall at 4.70 from the last sample)`);
  check(r.maxTurn <= 75.001, `fastest turn ${r.maxTurn.toFixed(1)} degrees a second (the game's limit is 75)`);
  check(s.speed === 0, 'rolled to a stop after the line');
  check(s.result && s.result.button === 'Race again', 'finish panel offers "Race again"');
  if (rivals) {
    check(s.rivals.count === rivals && s.racers === rivals + 1, `${rivals} rivals on the grid`);
    check(s.rivals.cars.every((c) => c.distance > 100), 'every rival drove');
    check(s.result.place >= 1 && s.result.place <= s.racers && /^(You won!|Finished (second|third|fourth|fifth|sixth)!)$/.test(s.result.title), `place ${s.result.place} of ${s.racers}: "${s.result.title}"`);
    let overlap = false;
    for (const a of s.rivals.cars) for (const b of s.rivals.cars) if (a !== b && Math.abs(a.distance - b.distance) < 4.29 && Math.abs(a.lane - b.lane) < 1.9) overlap = true;
    check(!overlap, 'no rival sits inside another');
    console.log(`     bumps: ${r.log.filter((e) => e[0] === 'bump').length}`);
  } else {
    check(s.result.title === 'Finished!' && /^(A new best lap! Great driving\.|Great driving! Want another race\?)$/.test(s.result.voice), 'no rivals: plain finish panel');
    check(s.ghostTraceCount > 50, `ghost lap recorded (${s.ghostTraceCount} samples)`);
  }
  check(s.startRace() === true && s.state === Phase.Countdown && s.lap === 1 && s.place === s.racers && Math.abs(s.carX - s.startX) < 1e-9, '"Race again" puts everything back on the grid');
}

console.log('-- a player who never touches the controls');
{
  const r = race({ rivals: 4, driver: false, quiet: true });
  check(r.sim.speed === 0 && r.sim.lap === 1 && r.sim.place === 5, 'stays on the grid, last of 5');
  check(r.sim.rivals.cars.every((c) => c.speed <= 13 * 0.86 * 0.72 + 0.01), 'rivals far ahead ease off (rubber band)');
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed');
process.exit(failed ? 1 : 0);
