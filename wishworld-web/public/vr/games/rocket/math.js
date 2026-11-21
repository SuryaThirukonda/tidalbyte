// Vectors [x, y, z] and quaternions [x, y, z, w] as plain arrays, so the flight model runs in Node without three.js.
// Every function writes into `o` and returns it; `o` may be one of the inputs.

export const DEG = Math.PI / 180;
export function set(o, x, y, z) { o[0] = x; o[1] = y; o[2] = z; return o; }
export function copy(o, a) { o[0] = a[0]; o[1] = a[1]; o[2] = a[2]; return o; }
export function add(o, a, b) { o[0] = a[0] + b[0]; o[1] = a[1] + b[1]; o[2] = a[2] + b[2]; return o; }
export function sub(o, a, b) { o[0] = a[0] - b[0]; o[1] = a[1] - b[1]; o[2] = a[2] - b[2]; return o; }
export function scale(o, a, k) { o[0] = a[0] * k; o[1] = a[1] * k; o[2] = a[2] * k; return o; }
/** o = a + b * k */
export function addScaled(o, a, b, k) { o[0] = a[0] + b[0] * k; o[1] = a[1] + b[1] * k; o[2] = a[2] + b[2] * k; return o; }
export function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
export function len(a) { return Math.hypot(a[0], a[1], a[2]); }
export function cross(o, a, b) {
  const x = a[1] * b[2] - a[2] * b[1], y = a[2] * b[0] - a[0] * b[2], z = a[0] * b[1] - a[1] * b[0];
  o[0] = x; o[1] = y; o[2] = z; return o;
}
export function normalize(o, a) { const l = len(a); return l > 1e-12 ? scale(o, a, 1 / l) : set(o, 0, 0, 0); }
export const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

export function qAxisAngle(o, axis, angle) {
  const s = Math.sin(angle / 2);
  o[0] = axis[0] * s; o[1] = axis[1] * s; o[2] = axis[2] * s; o[3] = Math.cos(angle / 2); return o;
}
/** o = a * b (apply b first, then a). */
export function qMul(o, a, b) {
  const ax = a[0], ay = a[1], az = a[2], aw = a[3], bx = b[0], by = b[1], bz = b[2], bw = b[3];
  o[0] = aw * bx + ax * bw + ay * bz - az * by;
  o[1] = aw * by - ax * bz + ay * bw + az * bx;
  o[2] = aw * bz + ax * by - ay * bx + az * bw;
  o[3] = aw * bw - ax * bx - ay * by - az * bz;
  return o;
}
/** o = v rotated by q (the same formula as three.js Vector3.applyQuaternion). */
export function qRotate(o, v, q) {
  const x = v[0], y = v[1], z = v[2], qx = q[0], qy = q[1], qz = q[2], qw = q[3];
  const ix = qw * x + qy * z - qz * y, iy = qw * y + qz * x - qx * z, iz = qw * z + qx * y - qy * x, iw = -qx * x - qy * y - qz * z;
  o[0] = ix * qw + iw * -qx + iy * -qz - iz * -qy;
  o[1] = iy * qw + iw * -qy + iz * -qx - ix * -qz;
  o[2] = iz * qw + iw * -qz + ix * -qy - iy * -qx;
  return o;
}
export function qNormalize(q) {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  q[0] /= l; q[1] /= l; q[2] /= l; q[3] /= l; return q;
}
/** The angle (radians) between two attitudes. */
export function qAngle(a, b) {
  const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
  return 2 * Math.acos(Math.min(1, d));
}
/** Turn q toward target by at most maxAngle radians (in place). */
export function qRotateToward(q, target, maxAngle) {
  const angle = qAngle(q, target);
  if (angle < 1e-6) return q;
  const t = Math.min(1, maxAngle / angle);
  let bx = target[0], by = target[1], bz = target[2], bw = target[3];
  let c = q[0] * bx + q[1] * by + q[2] * bz + q[3] * bw;
  if (c < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; c = -c; }
  let k0, k1;
  if (c > 0.9995) { k0 = 1 - t; k1 = t; }
  else { const th = Math.acos(c), s = Math.sin(th); k0 = Math.sin((1 - t) * th) / s; k1 = Math.sin(t * th) / s; }
  q[0] = q[0] * k0 + bx * k1; q[1] = q[1] * k0 + by * k1; q[2] = q[2] * k0 + bz * k1; q[3] = q[3] * k0 + bw * k1;
  return qNormalize(q);
}
