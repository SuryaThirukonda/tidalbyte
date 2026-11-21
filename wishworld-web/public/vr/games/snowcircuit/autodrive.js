// Snow Circuit, dev only (?autodrive=1): a driver that follows the centre line, so a headless run can prove a
// whole race. It does not touch the car: it only produces what a player's hands would (steering -1..1,
// throttle and brake 0..1), which then go through the same handling model as everyone else's.

import { clamp, lerp, clamp01, RAD2DEG, DEG2RAD } from './track.js';

export function createAutodrive(sim) {
  const t = sim.track;
  const spacing = t.length / t.n;
  const out = { steer: 0, throttle: 0, brake: 0 };

  // How sharply the centre line bends around sample i (1 / radius), from the turn between its neighbours.
  const bend = new Float64Array(t.n);
  for (let i = 0; i < t.n; i++) {
    const a = (i - 3 + t.n) % t.n, b = (i + 3) % t.n;
    const dot = clamp(t.segX[a] * t.segX[b] + t.segZ[a] * t.segZ[b], -1, 1);
    bend[i] = Math.acos(dot) / (6 * spacing);
  }

  out.update = () => {
    const v = sim.speed;
    const i = t.nearest(sim.carX, sim.carZ, sim.index);

    // Aim at a point on the centre line a little way ahead: further when going faster.
    const look = Math.max(2, Math.round((3.5 + v * 0.45) / spacing));
    const j = (i + look) % t.n;
    const bearing = Math.atan2(t.x[j] - sim.carX, t.z[j] - sim.carZ) * RAD2DEG;
    let err = (bearing - sim.yaw) % 360;
    if (err > 180) err -= 360; else if (err < -180) err += 360;
    // The turn rate the car has at this speed (SnowCircuitGame.Drive), in degrees a second at full lock.
    const rate = lerp(sim.turnSlow, sim.turnFast, v / sim.topSpeed) * clamp01(v / 2.5);
    out.steer = clamp(rate > 1 ? (err / 0.35) / rate : err / 20, -1, 1);

    // Slow for what is coming. Each bend ahead has a fastest speed at which full lock still turns as tightly
    // as the road does (v * k = rad(slow - (slow - fast) v / top)); allow whatever can still be braked down to that in time.
    let want = sim.topSpeed;
    const reach = Math.round(22 / spacing);
    for (let s = 0; s <= reach; s += 2) {
      const corner = 0.93 * (sim.turnSlow * DEG2RAD) / (bend[(i + s) % t.n] + (sim.turnSlow - sim.turnFast) / sim.topSpeed * DEG2RAD);
      const allowed = Math.sqrt(corner * corner + 2 * 8 * Math.max(0, s * spacing - 1.5));
      if (allowed < want) want = allowed;
    }
    out.throttle = v < want ? 1 : 0;
    out.brake = v > want + 0.5 ? 1 : 0;
    return out;
  };
  return out;
}
