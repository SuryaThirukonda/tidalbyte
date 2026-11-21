// Snow Circuit: the track's centre line, exactly as the Unity builder makes it
// (Assets/WishWorld/Editor/Builder.Games.cs BuildTrack, Scripts/Games/TrackData.cs).
//
// Everything in this folder that is game logic works in UNITY coordinates (metres, +X right, +Z forward,
// yaw in degrees clockwise seen from above), so the numbers and formulas read the same as the C# source.
// Only scene.js turns them into three.js positions: a Unity point (x, y, z) is drawn at (x, y, -z).
// No three.js in here, so node can run it.

// ---- Unity's Mathf, as far as the game uses it ---------------------------------------------------------
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * clamp01(t);                       // Mathf.Lerp clamps t
export const inverseLerp = (a, b, v) => (a !== b ? clamp01((v - a) / (b - a)) : 0);
export function moveTowards(current, target, maxDelta) {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}
export const repeat = (t, length) => clamp(t - Math.floor(t / length) * length, 0, length);
export const RAD2DEG = 180 / Math.PI, DEG2RAD = Math.PI / 180;

// One closed loop: start straight, a long right-hander, a gentle chicane, then back. (x, z) in metres.
const CTRL = [
  [0, 0], [0, 26], [8, 43], [26, 49], [43, 41],
  [47, 23], [37, 10], [41, -8], [28, -22], [10, -21], [1, -12],
];
export const SAMPLES = 320;
// 11 m (Unity built it 7 m wide): with 1.9 m cars that left no room to overtake. The road is drawn from this
// width (scene.js trackFallback), not from the exported 7 m track model.
export const TRACK_WIDTH = 11;

function catmullRom(a, b, c, d, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
}

export class Track {
  constructor(x, z, width, length) {
    this.n = x.length;
    this.x = x; this.z = z;                    // centre-line samples, evenly spaced
    this.width = width;
    this.length = length;
    const n = this.n;
    // TrackData.Direction(i): from the sample before to the sample after.
    this.dirX = new Float64Array(n); this.dirZ = new Float64Array(n);
    // The unit vector from sample i to sample i + 1 (RaceRivals.PointAt).
    this.segX = new Float64Array(n); this.segZ = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const a = (i - 1 + n) % n, b = (i + 1) % n;
      let dx = x[b] - x[a], dz = z[b] - z[a], l = Math.hypot(dx, dz) || 1;
      this.dirX[i] = dx / l; this.dirZ[i] = dz / l;
      dx = x[b] - x[i]; dz = z[b] - z[i]; l = Math.hypot(dx, dz) || 1;
      this.segX[i] = dx / l; this.segZ[i] = dz / l;
    }
  }

  /** Index of the nearest centre-line sample, searching near a previous index (TrackData.Nearest). */
  nearest(px, pz, hint, window = 14) {
    const n = this.n, x = this.x, z = this.z;
    let best = hint, bestD = Infinity;
    for (let k = -window; k <= window; k++) {
      const i = ((hint + k) % n + n) % n;
      const dx = x[i] - px, dz = z[i] - pz;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }
}

/** Builder.Games.cs BuildTrack: Catmull-Rom through the control points, then 320 samples at even spacing. */
export function buildTrack() {
  const n = CTRL.length;
  const dx = [], dz = [];
  const P = (j) => CTRL[((j % n) + n) % n];
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 40; k++) {
      const a = P(i - 1), b = P(i), c = P(i + 1), d = P(i + 2), t = k / 40;
      dx.push(catmullRom(a[0], b[0], c[0], d[0], t));
      dz.push(catmullRom(a[1], b[1], c[1], d[1], t));
    }
  }
  const count = dx.length;
  const dist = (i, j) => Math.hypot(dx[j] - dx[i], dz[j] - dz[i]);
  let total = 0;
  for (let i = 0; i < count; i++) total += dist(i, (i + 1) % count);

  // Resample at even spacing so progress and checkpoints are uniform.
  const x = new Float64Array(SAMPLES), z = new Float64Array(SAMPLES);
  const step = total / SAMPLES;
  let di = 0, segStart = 0;
  for (let s = 0; s < SAMPLES; s++) {
    const target = s * step;
    for (;;) {
      const i = di % count, j = (di + 1) % count;
      const seg = dist(i, j);
      if (segStart + seg >= target || di > count * 2) {
        const t = clamp01(seg > 0 ? (target - segStart) / seg : 0);
        x[s] = dx[i] + (dx[j] - dx[i]) * t;
        z[s] = dz[i] + (dz[j] - dz[i]) * t;
        break;
      }
      segStart += seg; di++;
    }
  }
  return new Track(x, z, TRACK_WIDTH, total);
}
