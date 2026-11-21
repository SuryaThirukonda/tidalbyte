// The hand's recent path, for the release velocity: a ring of timed positions per hand, and the least-squares
// slope over the last ~90 ms of them. input.js gives positions, not velocities, so this is ours. No allocation.

export function createTracker(samples = 24) {
  const t = new Float64Array(samples), p = new Float64Array(samples * 3);
  let head = 0, count = 0;
  return {
    clear() { count = 0; head = 0; },
    push(time, x, y, z) {
      t[head] = time; p[head * 3] = x; p[head * 3 + 1] = y; p[head * 3 + 2] = z;
      head = (head + 1) % samples;
      if (count < samples) count++;
    },
    get count() { return count; },
    /** Average velocity over the last `window` seconds (least-squares line through those samples). Writes `out`. */
    velocity(now, window, out) {
      out.x = 0; out.y = 0; out.z = 0;
      let n = 0, st = 0, stt = 0, sx = 0, sy = 0, sz = 0, stx = 0, sty = 0, stz = 0;
      for (let k = 0; k < count; k++) {
        const i = (head - 1 - k + samples) % samples;
        const dt = t[i] - now;
        if (dt < -window - 1e-6) break;
        const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
        n++; st += dt; stt += dt * dt; sx += x; sy += y; sz += z; stx += dt * x; sty += dt * y; stz += dt * z;
      }
      if (n < 2) return out;
      const den = n * stt - st * st;
      if (Math.abs(den) < 1e-12) return out;
      out.x = (n * stx - st * sx) / den;
      out.y = (n * sty - st * sy) / den;
      out.z = (n * stz - st * sz) / den;
      return out;
    },
  };
}
