// Snow Circuit: the other cars. A line-for-line port of Assets/WishWorld/Scripts/Games/RaceRivals.cs.
//
// Each drives itself round the track: it slows for corners according to how tight they are, keeps to a lane,
// pulls out to pass a slower car (or the player) and tucks back in afterwards. A car far ahead eases off and
// a car far behind pushes on, so the race stays close. There is no physics: positions come from distance
// along the centre line plus a sideways lane offset. Unity coordinates throughout (see track.js).

import { clamp, lerp, inverseLerp, moveTowards, repeat } from './track.js';

const NAMES = ['Pip', 'Juno', 'Rex', 'Skye', 'Bo'];
const LANES = [-2.6, 2.6, -2.6, 2.6, 0];      // home lanes, metres from the centre line (the road is 11 m wide)
export const CAR_LENGTH = 4.0, CAR_WIDTH = 1.9;

export class Rivals {
  constructor(track, count) {
    this.track = track;
    this.length = track.length;
    this.cars = [];
    const n = clamp(count | 0, 0, 5);
    for (let i = 0; i < n; i++) {
      this.cars.push({
        index: i, name: NAMES[i], homeLane: LANES[i], skill: lerp(0.86, 0.72, i / 4),
        distance: 0, lane: 0, targetLane: 0, speed: 0, finished: false, finishTime: 0,
        x: 0, z: 0, fx: 0, fz: 1,               // where it is and which way it faces (set by place)
      });
    }
    // scratch results (no allocation while racing)
    this._px = 0; this._pz = 0; this._dx = 0; this._dz = 1;
    this.otherSpeed = 0; this.playerBehind = false;
    this.resetGrid();
  }

  get count() { return this.cars.length; }

  /** Line the cars up on the grid ahead of the player, who starts at the back. */
  resetGrid() {
    for (let i = 0; i < this.cars.length; i++) {
      const c = this.cars[i];
      c.distance = 3 + i * 5;
      c.lane = c.targetLane = c.homeLane;
      c.speed = 0; c.finished = false; c.finishTime = 0;
      this.place(c);
    }
  }

  /** The centre line, by distance: point in _px/_pz, direction of travel in _dx/_dz. */
  pointAt(d) {
    const t = this.track, n = t.n;
    const f = repeat(d, this.length) / this.length * n;
    const i = Math.floor(f) % n, j = (i + 1) % n;
    this._dx = t.segX[i]; this._dz = t.segZ[i];
    const u = f - Math.floor(f);
    this._px = t.x[i] + (t.x[j] - t.x[i]) * u;
    this._pz = t.z[i] + (t.z[j] - t.z[i]) * u;
  }

  /** How sharply the road bends over the next few metres (1 / radius). */
  bend(d) {
    this.pointAt(d);
    const ax = this._dx, az = this._dz;
    this.pointAt(d + 7);
    return Math.acos(clamp(ax * this._dx + az * this._dz, -1, 1)) / 7;
  }

  place(c) {
    this.pointAt(c.distance);
    const px = this._px, pz = this._pz, dx = this._dx, dz = this._dz;
    // side = Cross(up, dir): to the right of the direction of travel
    c.x = px + dz * c.lane;
    c.z = pz - dx * c.lane;
    // look a little ahead so the nose swings into the corner: Slerp(dir, ahead, 0.5) is the bisector
    this.pointAt(c.distance + 2.5);
    let fx = dx + this._dx, fz = dz + this._dz;
    const l = Math.hypot(fx, fz);
    if (l > 1e-6) { fx /= l; fz /= l; } else { fx = dx; fz = dz; }
    c.fx = fx; c.fz = fz;
  }

  /**
   * playerDistance: the player's distance from the start line, counting laps.
   * playerLane: the player's sideways offset from the centre line (+ is the inside of this clockwise track).
   */
  tick(dt, racing, playerDistance, playerLane, playerSpeed, topSpeed, laps, raceTime) {
    const cars = this.cars, count = cars.length;
    for (let k = 0; k < count; k++) {
      const c = cars[k];
      let vmax = topSpeed * c.skill;
      // Keep the race close: ease off when well ahead of the player, push on when well behind.
      const gap = c.distance - playerDistance;
      if (gap > 12) vmax *= lerp(1, 0.72, inverseLerp(12, 50, gap));
      else if (gap < -15) vmax *= lerp(1, 1.06, inverseLerp(-15, -60, gap));
      const bend = Math.max(this.bend(c.distance), this.bend(c.distance + 5));
      const corner = bend > 0.001 ? Math.sqrt(6.5 * c.skill / bend) : 99;
      let target = racing ? Math.min(vmax, corner) : 0;
      if (c.finished) target = Math.min(target, topSpeed * 0.45);          // the cool-down lap

      // Who is in the way? The nearest car ahead within a few lengths, the player included.
      let blockGap = Infinity, blockLane = 0, blockSpeed = 0;
      for (let m = 0; m < count; m++) {
        if (m === k) continue;
        const ahead = cars[m].distance - c.distance;
        if (ahead > 0.2 && ahead < blockGap && ahead < 9) { blockGap = ahead; blockLane = cars[m].lane; blockSpeed = cars[m].speed; }
      }
      const aheadP = playerDistance - c.distance;
      if (aheadP > 0.2 && aheadP < blockGap && aheadP < 9) { blockGap = aheadP; blockLane = playerLane; blockSpeed = playerSpeed; }

      c.targetLane = c.homeLane;
      if (blockGap < 9 && Math.abs(blockLane - c.lane) < CAR_WIDTH) {
        // pull out to whichever side has more road
        c.targetLane = blockLane > 0 ? blockLane - CAR_WIDTH * 1.15 : blockLane + CAR_WIDTH * 1.15;
        if (blockGap < CAR_LENGTH + 1.2) target = Math.min(target, Math.max(blockSpeed - 0.3, 1.5));
      }
      const room = this.track.width * 0.5 - CAR_WIDTH * 0.5 - 0.2;
      c.targetLane = clamp(c.targetLane, -room, room);
      c.lane = moveTowards(c.lane, c.targetLane, 1.8 * dt);

      c.speed = moveTowards(c.speed, target, (target > c.speed ? 4.6 * c.skill : 9) * dt);
      c.distance += c.speed * dt;
    }

    // No car may sit inside another: whichever is behind in an overlapping pair is held on the other's tail.
    for (let pass = 0; pass < 2; pass++) {
      for (let a = 0; a < count; a++) {
        const rear = cars[a];
        for (let b = 0; b < count; b++) {
          if (a === b) continue;
          const front = cars[b];
          const ahead = front.distance - rear.distance;
          if (ahead < 0 || (ahead === 0 && a < b)) continue;
          if (ahead < CAR_LENGTH + 0.3 && Math.abs(front.lane - rear.lane) < CAR_WIDTH) {
            rear.distance = front.distance - (CAR_LENGTH + 0.3);
            rear.speed = Math.min(rear.speed, front.speed);
          }
        }
        const toPlayer = playerDistance - rear.distance;       // and none may drive through the player from behind
        if (toPlayer >= 0 && toPlayer < CAR_LENGTH + 0.2 && Math.abs(playerLane - rear.lane) < CAR_WIDTH) {
          rear.distance = playerDistance - (CAR_LENGTH + 0.2);
          rear.speed = Math.min(rear.speed, playerSpeed);
        }
      }
    }

    for (let k = 0; k < count; k++) {
      const c = cars[k];
      if (!c.finished && c.distance >= laps * this.length) { c.finished = true; c.finishTime = raceTime; }
      this.place(c);
    }
  }

  /** 1 for first. Counts every rival that is further round than the player, or already home. */
  playerPlace(playerDistance) {
    let place = 1;
    for (let k = 0; k < this.cars.length; k++) {
      const c = this.cars[k];
      if (c.finished || c.distance > playerDistance) place++;
    }
    return place;
  }

  /**
   * Is the player's car touching a rival? If so the rival is nudged aside, `otherSpeed` says how fast the
   * car in front is going so the caller can take the knock, and `playerBehind` whether the player ran into it.
   */
  touching(px, pz, dt) {
    this.otherSpeed = 0; this.playerBehind = false;
    for (let k = 0; k < this.cars.length; k++) {
      const c = this.cars[k];
      const rx = px - c.x, rz = pz - c.z;
      const along = rx * c.fx + rz * c.fz;
      const across = rx * c.fz - rz * c.fx;                   // right = Cross(up, forward) = (fz, 0, -fx)
      if (Math.abs(along) > CAR_LENGTH * 0.95 || Math.abs(across) > CAR_WIDTH * 0.92) continue;
      c.lane = moveTowards(c.lane, c.lane - (across >= 0 ? 1 : -1) * 2, 4 * dt);
      this.otherSpeed = c.speed;
      this.playerBehind = along < 0;
      if (!this.playerBehind) c.speed = Math.min(c.speed, Math.max(2, c.speed - 6 * dt));   // it ran into the player's tail
      return true;
    }
    return false;
  }
}
