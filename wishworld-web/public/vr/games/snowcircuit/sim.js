// Snow Circuit: the race itself. A port of Assets/WishWorld/Scripts/Games/SnowCircuitGame.cs with the Unity
// objects taken out: this file holds the state, the handling model, checkpoints, laps, places, the countdown
// and the ghost, and tells the tab what happened through `on`. Arcade handling only: no tyre model.
// Unity coordinates throughout (see track.js). No three.js, so node can run a whole race.

import { clamp01, lerp, moveTowards, RAD2DEG, DEG2RAD } from './track.js';
import { Rivals } from './rivals.js';

export const Phase = { Ready: 0, Countdown: 1, Racing: 2, Finished: 3 };

/** Every line the game says or shows, as written in the Unity source (VoiceLines, SnowCircuitGame). */
export const STRINGS = {
  title: 'Snow Circuit',
  intro: 'Hold both controllers like a steering wheel.\nRight trigger: go.   Left trigger: brake.',
  start: 'Start', again: 'Race again', hub: 'Hub',
  voiceIntro: 'Snow Circuit. Hold both controllers like a steering wheel. Right trigger to go, left trigger to brake.',
  countdown: ['3', '2', '1', 'Go!'],
  countdownVoice: ['Three.', 'Two.', 'One.', 'Go!'],
  ordinals: ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'],
};

const COUNT_STEP = 0.8;            // seconds between "3", "2", "1", "Go!" and before "Go!" goes away
const TRACE_STEP = 0.1;            // the ghost's lap is sampled ten times a second
const TRACE_MAX = 6000;            // ten minutes of lap

/** SnowCircuitGame.Format: minutes, then seconds as "00.0". */
export function formatTime(seconds) {
  const m = Math.trunc(seconds / 60);
  const s = (seconds - m * 60).toFixed(1);
  return m + ':' + (s.length < 4 ? '0' + s : s);
}

const noop = () => {};

export class SnowCircuitSim {
  /**
   * track: from buildTrack(). rivalCount: WISHWORLD_RACE_RIVALS (0 to 5, default 4; 0 brings back the ghost).
   * bestLap: the stored best (PlayerPrefs "SnowCircuitBestLap"), 0 for none.
   * on: { countdown(step), countdownEnd(), lapDone(), lap(lap, isLast), finish(result), bump(), checkpoint(next), saveBest(seconds) }
   */
  constructor({ track, rivalCount = 4, bestLap = 0, on = {} }) {
    this.track = track;
    this.on = {
      countdown: on.countdown || noop, countdownEnd: on.countdownEnd || noop, lapDone: on.lapDone || noop,
      lap: on.lap || noop, finish: on.finish || noop, bump: on.bump || noop,
      checkpoint: on.checkpoint || noop, saveBest: on.saveBest || noop,
    };

    // Tuning (kept slow and gentle for comfort)
    this.laps = 3;
    this.topSpeed = 13;
    this.acceleration = 5.5;
    this.braking = 11;
    this.offTrackSpeed = 4.5;
    this.fullLockDegrees = 35;       // hand tilt, in degrees, that gives full steering lock (Unity: 45)
    // Turn rate at full lock, degrees a second, at walking pace and at top speed (Unity: 75 and 34; sharper here)
    this.turnSlow = 110;
    this.turnFast = 55;
    this.seatEyeHeight = 1.05;

    this.state = Phase.Ready;
    this.speed = 0;
    this.steer = 0;
    this.lap = 0;
    this.raceTime = 0;
    this.lastLapTime = 0;
    this.bestLap = bestLap > 0 ? bestLap : 0;
    this.onTrack = true;
    this.place = 1;                  // 1 for first place. With no rivals the player is always first.

    // The car starts 4 m behind the line, facing along the track.
    const dx = track.dirX[0], dz = track.dirZ[0];
    this.startX = track.x[0] - dx * 4;
    this.startZ = track.z[0] - dz * 4;
    let yaw = Math.atan2(dx, dz) * RAD2DEG;
    if (yaw < 0) yaw += 360;         // Transform.eulerAngles.y is 0..360
    this.startYaw = yaw;
    this.carX = this.startX; this.carZ = this.startZ; this.yaw = this.startYaw;

    this.index = 0;
    this.nextCheckpoint = 0;
    this.lapStart = 0;
    this.traceTimer = 0;
    this.sessionBest = 0;
    this.bumpCooldown = 0;

    this.rivals = rivalCount > 0 ? new Rivals(track, rivalCount) : null;

    // the lap being driven and the one the ghost replays: x, z, yaw, time
    this.lapTrace = new Float32Array(TRACE_MAX * 4); this.lapTraceCount = 0;
    this.ghostTrace = new Float32Array(TRACE_MAX * 4); this.ghostTraceCount = 0;
    this.ghost = { active: false, x: 0, z: 0, yaw: 0 };

    this.countStep = -1;             // 0..2 = "3" "2" "1" showing, 3 = "Go!" showing, -1 = no countdown running
    this.countTimer = 0;
    this.result = null;              // what the finish panel says, once finished
  }

  get racers() { return 1 + (this.rivals ? this.rivals.count : 0); }
  get progress() { return this.index / this.track.n; }
  get forwardX() { return Math.sin(this.yaw * DEG2RAD); }
  get forwardZ() { return Math.cos(this.yaw * DEG2RAD); }

  /** The Start / Race again button. */
  startRace() {
    if (this.state === Phase.Countdown || this.state === Phase.Racing) return false;
    this.state = Phase.Countdown;
    this.carX = this.startX; this.carZ = this.startZ; this.yaw = this.startYaw;
    this.speed = 0; this.lap = 1; this.raceTime = 0; this.lapStart = 0; this.nextCheckpoint = 1;
    this.place = this.racers;
    if (this.rivals) this.rivals.resetGrid();
    this.index = this.track.nearest(this.carX, this.carZ, 0, this.track.n >> 1);
    this.lapTraceCount = 0;
    this.result = null;
    this.countStep = 0; this.countTimer = 0;
    this.on.countdown(0);
    return true;
  }

  /** One frame. steerTarget is -1..1 (what the hands ask for); throttle and brake are the triggers, 0..1. */
  update(dt, steerTarget, throttle, brake) {
    this.steer = moveTowards(this.steer, steerTarget, dt * 9);
    if (this.state === Phase.Racing) this.drive(dt, throttle, brake);
    else this.speed = moveTowards(this.speed, 0, this.braking * dt);

    if (this.state === Phase.Finished || this.state === Phase.Ready) {
      const d = this.speed * dt;
      this.carX += this.forwardX * d; this.carZ += this.forwardZ * d;
    }
    this.updateRivals(dt);
    this.updateGhost();
    this.tickCountdown(dt);
  }

  drive(dt, throttle, brake) {
    const t = this.track;
    this.raceTime += dt;

    this.index = t.nearest(this.carX, this.carZ, this.index);
    const cx = t.x[this.index], cz = t.z[this.index];
    const off = Math.hypot(this.carX - cx, this.carZ - cz);
    const half = t.width * 0.5;
    this.onTrack = off <= half;

    const cap = this.onTrack ? this.topSpeed : this.offTrackSpeed;
    this.speed += throttle * this.acceleration * dt;
    this.speed -= brake * this.braking * dt;
    this.speed -= this.speed * 0.3 * dt;                               // rolling drag
    if (this.speed > cap) this.speed = moveTowards(this.speed, cap, this.braking * dt);
    this.speed = Math.max(0, this.speed);

    // Turn rate drops as speed rises, and there is no turning on the spot.
    const turn = this.steer * lerp(this.turnSlow, this.turnFast, this.speed / this.topSpeed) * clamp01(this.speed / 2.5);
    this.yaw += turn * dt;
    const a = this.yaw * DEG2RAD;
    let px = this.carX + Math.sin(a) * (this.speed * dt);
    let pz = this.carZ + Math.cos(a) * (this.speed * dt);

    // Snow banks: never let the car leave the corridor.
    const rx = px - cx, rz = pz - cz;
    const limit = half + 1.2, rl = Math.hypot(rx, rz);
    if (rl > limit) {
      px = cx + rx / rl * limit;
      pz = cz + rz / rl * limit;
      this.speed *= 1 - 1.5 * dt;
    }
    this.carX = px; this.carZ = pz;

    // Checkpoints at each quarter stop a lap being counted by reversing over the line.
    const quarter = Math.trunc(this.index * 4 / t.n);
    if (this.nextCheckpoint === 0) { if (quarter === 0) this.completeLap(); }
    else if (quarter === this.nextCheckpoint) {
      this.nextCheckpoint = (this.nextCheckpoint + 1) % 4;
      this.on.checkpoint(this.nextCheckpoint);
    }

    this.traceTimer -= dt;
    if (this.traceTimer <= 0) {
      this.traceTimer = TRACE_STEP;
      if (this.lapTraceCount < TRACE_MAX) {
        const o = this.lapTraceCount++ * 4, tr = this.lapTrace;
        tr[o] = px; tr[o + 1] = pz; tr[o + 2] = this.yaw; tr[o + 3] = this.raceTime - this.lapStart;
      }
    }
  }

  /** The player's distance from the start line, counting laps. Negative on the grid, before the line is first crossed. */
  playerDistance() {
    const t = this.track, n = t.n;
    let along = this.index / n * t.length;
    if (this.lap === 1 && this.nextCheckpoint === 1 && this.index > Math.trunc(n * 3 / 4)) along -= t.length;   // still behind the line at the start
    return (this.lap - 1) * t.length + along;
  }

  updateRivals(dt) {
    const r = this.rivals;
    if (!r) return;
    const t = this.track, i = this.index;
    const distance = this.state === Phase.Finished ? this.laps * t.length + 5 : this.playerDistance();
    // sideways offset: dot with Cross(up, direction) = (dirZ, 0, -dirX)
    const lane = (this.carX - t.x[i]) * t.dirZ[i] - (this.carZ - t.z[i]) * t.dirX[i];
    r.tick(dt, this.state === Phase.Racing || this.state === Phase.Finished, distance, lane, this.speed, this.topSpeed, this.laps, this.raceTime);
    if (this.state !== Phase.Racing) return;
    this.place = r.playerPlace(distance);
    this.bumpCooldown -= dt;
    if (r.touching(this.carX, this.carZ, dt)) {
      // No crash, just a knock: running into the back of a car costs speed, being run into does not.
      if (r.playerBehind && this.speed > r.otherSpeed) this.speed = moveTowards(this.speed, Math.max(r.otherSpeed - 0.5, 0), 30 * dt);
      if (this.bumpCooldown <= 0) {
        this.bumpCooldown = 0.5;
        this.on.bump();
      }
    }
  }

  completeLap() {
    this.nextCheckpoint = 1;
    this.lastLapTime = this.raceTime - this.lapStart;
    this.lapStart = this.raceTime;
    const best = this.bestLap <= 0 || this.lastLapTime < this.bestLap;
    if (best) {
      this.bestLap = this.lastLapTime;
      this.on.saveBest(this.bestLap);
    }
    // The fastest lap since the game was opened becomes the ghost car to chase.
    if (this.sessionBest <= 0 || this.lastLapTime < this.sessionBest) {
      this.sessionBest = this.lastLapTime;
      this.ghostTrace.set(this.lapTrace.subarray(0, this.lapTraceCount * 4));
      this.ghostTraceCount = this.lapTraceCount;
    }
    this.lapTraceCount = 0;
    this.on.lapDone(this.lastLapTime, best);
    if (this.lap >= this.laps) {
      this.state = Phase.Finished;
      const t = this.track;
      if (this.rivals) {
        this.place = this.rivals.playerPlace(this.laps * t.length + 5);
        const o = STRINGS.ordinals;
        const place = o[Math.min(Math.max(this.place - 1, 0), o.length - 1)];
        this.result = {
          title: this.place === 1 ? 'You won!' : 'Finished ' + place + '!',
          info: 'of ' + this.racers + ' cars.  Time ' + formatTime(this.raceTime) + '\nBest lap ' + formatTime(this.bestLap),
          button: STRINGS.again,
          voice: 'You finished ' + place + '!',
        };
      } else {
        this.result = {
          title: 'Finished!',
          info: 'Time ' + formatTime(this.raceTime) + '\nBest lap ' + formatTime(this.bestLap),
          button: STRINGS.again,
          voice: best ? 'A new best lap! Great driving.' : 'Great driving! Want another race?',
        };
      }
      this.result.place = this.place; this.result.racers = this.racers;
      this.result.time = this.raceTime; this.result.bestLap = this.bestLap;
      this.on.finish(this.result);
    } else {
      this.lap++;
      this.on.lap(this.lap, this.lap === this.laps);       // "Last lap!" or "Lap N!"
    }
  }

  updateGhost() {
    const g = this.ghost;
    // With real cars to race there is no ghost: it would only be one more shape on the road.
    if (this.rivals || this.ghostTraceCount < 2 || this.state !== Phase.Racing) { g.active = false; return; }
    const tr = this.ghostTrace, count = this.ghostTraceCount;
    const t = this.raceTime - this.lapStart;
    const i = Math.min(Math.max(Math.floor(t / TRACE_STEP), 0), count - 2);
    const u = clamp01(t / TRACE_STEP - i);
    const a = i * 4, b = a + 4;
    g.active = t < tr[(count - 1) * 4 + 3];
    g.x = tr[a] + (tr[b] - tr[a]) * u;
    g.z = tr[a + 1] + (tr[b + 1] - tr[a + 1]) * u;
    let d = (tr[b + 2] - tr[a + 2]) % 360;                  // Mathf.LerpAngle: the short way round
    if (d > 180) d -= 360; else if (d < -180) d += 360;
    g.yaw = tr[a + 2] + d * u;
  }

  // Unity's Countdown coroutine: "3", "2", "1" 0.8 s apart, then "Go!" starts the race and stays up 0.8 s.
  tickCountdown(dt) {
    if (this.countStep < 0) return;
    this.countTimer += dt;
    if (this.countTimer < COUNT_STEP) return;
    this.countTimer = 0;
    this.countStep++;
    if (this.countStep <= 2) this.on.countdown(this.countStep);
    else if (this.countStep === 3) {
      this.state = Phase.Racing;
      this.on.countdown(3);
    } else {
      this.countStep = -1;
      this.on.countdownEnd();
    }
  }
}

/**
 * SnowCircuitGame.ReadSteering: steering from how far the line between the two hands is tilted.
 * dx, dy: right hand minus left hand in the car's frame (x to the right, y up), metres.
 * Returns the steering asked for, -1..1, or null when the hands are not held like a wheel (the caller
 * then falls back to the right thumbstick).
 */
export function steerFromHands(dx, dy, fullLockDegrees) {
  if (!(dx > 0.06)) return null;
  let angle = Math.atan2(-dy, dx) * RAD2DEG;                 // right hand lower = positive = turn right
  if (Math.abs(angle) < 3) angle = 0;
  const v = angle / fullLockDegrees;
  return v < -1 ? -1 : v > 1 ? 1 : v;
}
