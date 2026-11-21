// Snow Hoops ball physics, written by hand: gravity, light drag, and bounces off the rim, the backboard and the
// floor. Plain numbers and objects only (no three.js), so Node can test it (dev/rules.test.mjs).
//
//   const court = makeCourt(COURT, BALL, PHYSICS);
//   const ball = makeBall(); launchBall(ball, x, y, z, vx, vy, vz);
//   const hits = advance(ball, court, dt);       // HIT bits of what happened this frame
//
// The ball is always a sphere of BALL.radius, whatever the visual is. The rim is a ring of straight segments
// (a torus with a thin tube); the backboard is a bounded plane facing the player; the floor is y = 0. A basket
// counts when the ball's centre passes DOWN through the plane of the rim inside the opening.

export const HIT = { RIM: 1, BOARD: 2, FLOOR: 4, MAKE: 8 };

const DEG = Math.PI / 180;

export function makeCourt(court, ball, physics) {
  const [hx, , hz] = court.hoop;
  const rim = { x: hx, y: court.rimHeight, z: hz };
  const n = court.rimSegments;
  const segs = new Float64Array(n * 6);
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    segs.set([rim.x + Math.cos(a0) * court.rimRadius, rim.y, rim.z + Math.sin(a0) * court.rimRadius,
      rim.x + Math.cos(a1) * court.rimRadius, rim.y, rim.z + Math.sin(a1) * court.rimRadius], i * 6);
  }
  const B = court.board;
  const boardZ = rim.z - court.rimRadius - B.offset;
  const spots = court.spotAngles.map((deg) => {
    const a = deg * DEG;
    return { x: hx + Math.sin(a) * court.arcRadius, z: hz + Math.cos(a) * court.arcRadius };
  });
  return {
    rim, rimRadius: court.rimRadius, tube: court.rimTube, segs, segCount: n,
    board: { z: boardZ, x0: hx - B.width / 2, x1: hx + B.width / 2, y0: rim.y - B.below, y1: rim.y - B.below + B.height, thickness: B.thickness },
    radius: ball.radius,
    spots,
    ...physics,
  };
}

export function makeBall() {
  return { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 0, live: false, made: false, rimHits: 0, boardHits: 0, bounces: 0 };
}

export function launchBall(b, x, y, z, vx, vy, vz) {
  b.x = x; b.y = y; b.z = z; b.vx = vx; b.vy = vy; b.vz = vz;
  b.t = 0; b.live = true; b.made = false; b.rimHits = 0; b.boardHits = 0; b.bounces = 0;
  return b;
}

/** One fixed step of `dt` seconds. Returns HIT bits. */
export function stepBall(b, c, dt) {
  let hits = 0;
  const R = c.radius;
  b.vy -= c.gravity * dt;
  const damp = Math.max(0, 1 - c.drag * dt);
  b.vx *= damp; b.vy *= damp; b.vz *= damp;
  const prevY = b.y;
  b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
  b.t += dt;

  // ---- rim: only tested when the ball is near the ring
  const rim = c.rim, reach = R + c.tube;
  const dxr = b.x - rim.x, dzr = b.z - rim.z, dyr = b.y - rim.y;
  const flat2 = dxr * dxr + dzr * dzr;
  const outer = c.rimRadius + reach, inner = Math.max(0, c.rimRadius - reach);
  if (Math.abs(dyr) < reach && flat2 < outer * outer && flat2 > inner * inner) {
    let best = Infinity, qx = 0, qy = 0, qz = 0;
    const s = c.segs;
    for (let i = 0; i < c.segCount; i++) {
      const o = i * 6, ax = s[o], ay = s[o + 1], az = s[o + 2];
      const ex = s[o + 3] - ax, ey = s[o + 4] - ay, ez = s[o + 5] - az;
      const len2 = ex * ex + ey * ey + ez * ez;
      let u = ((b.x - ax) * ex + (b.y - ay) * ey + (b.z - az) * ez) / len2;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const px = ax + ex * u, py = ay + ey * u, pz = az + ez * u;
      const d2 = (b.x - px) ** 2 + (b.y - py) ** 2 + (b.z - pz) ** 2;
      if (d2 < best) { best = d2; qx = px; qy = py; qz = pz; }
    }
    if (best < reach * reach) {
      const d = Math.sqrt(best) || 1e-6;
      const nx = (b.x - qx) / d, ny = (b.y - qy) / d, nz = (b.z - qz) / d;
      b.x = qx + nx * reach; b.y = qy + ny * reach; b.z = qz + nz * reach;
      const vn = b.vx * nx + b.vy * ny + b.vz * nz;
      if (vn < 0) {
        const tx = b.vx - vn * nx, ty = b.vy - vn * ny, tz = b.vz - vn * nz;
        const f = c.rimFriction, e = c.rimRestitution;
        b.vx = tx * f - e * vn * nx; b.vy = ty * f - e * vn * ny; b.vz = tz * f - e * vn * nz;
        b.rimHits++;
        hits |= HIT.RIM;
      }
    }
  }

  // ---- backboard: the front face, a plane at board.z facing +Z, within its rectangle
  const bd = c.board;
  if (b.vz < 0 && b.z - R < bd.z && b.z > bd.z - bd.thickness - R &&
      b.x > bd.x0 - R && b.x < bd.x1 + R && b.y > bd.y0 - R && b.y < bd.y1 + R) {
    b.z = bd.z + R;
    b.vz = -b.vz * c.boardRestitution;
    b.vx *= c.boardFriction; b.vy *= c.boardFriction;
    b.boardHits++;
    hits |= HIT.BOARD;
  }

  // ---- floor
  if (b.y < R) {
    b.y = R;
    if (b.vy < 0) {
      b.vy = -b.vy * c.floorRestitution;
      b.vx *= c.floorFriction; b.vz *= c.floorFriction;
      b.bounces++;
      hits |= HIT.FLOOR;
    }
  }

  // ---- a basket: the centre goes down through the rim's plane, inside the opening
  if (!b.made && b.vy < 0 && prevY >= rim.y && b.y < rim.y) {
    const fx = b.x - rim.x, fz = b.z - rim.z;
    const open = c.rimRadius - c.tube;
    if (fx * fx + fz * fz < open * open) { b.made = true; hits |= HIT.MAKE; }
  }
  return hits;
}

/** Move the ball on by a frame of `dt` seconds in fixed substeps. Returns the OR of every substep's HIT bits. */
export function advance(b, c, dt) {
  if (!b.live) return 0;
  let left = Math.min(dt, c.maxFrame), hits = 0;
  while (left > 1e-9) {
    const h = Math.min(c.substep, left);
    hits |= stepBall(b, c, h);
    left -= h;
  }
  return hits;
}

/** True once a ball has finished: it went in and dropped clear, bounced enough on the floor, or is too old. */
export function isSettled(b, c) {
  return b.bounces >= c.settleBounces || b.t > c.maxLife || (b.made && b.y < c.rim.y - 1.2) || b.y < -1;
}

// ---------------------------------------------------------------------------------------------- the ideal arc

const _probe = makeBall();

/** Height of the ball's centre when it has travelled `dist` horizontally (gravity and drag, no collisions). */
function heightAt(c, x, y, z, vx, vy, vz, dist) {
  const b = launchBall(_probe, x, y, z, vx, vy, vz);
  const step = c.substep, damp = 1 - c.drag * step;
  let travelled = 0, prevY = y;
  for (let i = 0; i < 2400; i++) {
    b.vy -= c.gravity * step;
    b.vx *= damp; b.vy *= damp; b.vz *= damp;
    prevY = b.y;
    const sx = b.vx * step, sz = b.vz * step, s = Math.hypot(sx, sz);
    b.x += sx; b.y += b.vy * step; b.z += sz;
    if (travelled + s >= dist) {
      const k = s > 0 ? (dist - travelled) / s : 1;
      return prevY + (b.y - prevY) * k;
    }
    travelled += s;
    if (b.y < -2) return -Infinity;
  }
  return -Infinity;
}

/**
 * The velocity that drops a ball from (x, y, z) through the rim's centre on an arc launched `elevation` degrees
 * above the horizontal. Bisection on the speed, simulated with the same gravity and drag. Writes `out`.
 */
export function idealVelocity(c, x, y, z, out, elevation = 55) {
  const dx = c.rim.x - x, dz = c.rim.z - z, dist = Math.hypot(dx, dz) || 1e-6;
  const ux = dx / dist, uz = dz / dist, ce = Math.cos(elevation * DEG), se = Math.sin(elevation * DEG);
  let lo = 0.5, hi = 25;
  for (let i = 0; i < 30; i++) {
    const s = (lo + hi) / 2;
    const h = heightAt(c, x, y, z, ux * ce * s, se * s, uz * ce * s, dist);
    if (h < c.rim.y) lo = s; else hi = s;
  }
  const s = (lo + hi) / 2;
  out.x = ux * ce * s; out.y = se * s; out.z = uz * ce * s;
  return out;
}

/**
 * Gentle aim assist. If the throw (vx, vy, vz) from (x, y, z) goes up, fast enough, and within `cone` degrees of
 * the hoop's direction seen from above, blend it `amount` of the way toward the ideal arc. Writes `out` (the throw
 * itself when it is not helped) and returns true when it helped.
 */
export function assistThrow(c, x, y, z, vx, vy, vz, out, { amount, cone, minSpeed, elevation }, ideal = { x: 0, y: 0, z: 0 }) {
  out.x = vx; out.y = vy; out.z = vz;
  const speed = Math.hypot(vx, vy, vz);
  if (!(amount > 0) || speed < minSpeed || vy <= 0) return false;
  const dx = c.rim.x - x, dz = c.rim.z - z;
  const flat = Math.hypot(vx, vz), toward = Math.hypot(dx, dz);
  if (flat < 1e-6 || toward < 1e-6) return false;
  const cos = (vx * dx + vz * dz) / (flat * toward);
  if (cos < Math.cos(cone * DEG)) return false;
  idealVelocity(c, x, y, z, ideal, elevation);
  out.x = vx + (ideal.x - vx) * amount;
  out.y = vy + (ideal.y - vy) * amount;
  out.z = vz + (ideal.z - vz) * amount;
  return true;
}

/** Turn (v.x, v.z) by `deg` degrees about the vertical; positive turns a throw to the thrower's left. */
export function yawVelocity(v, deg) {
  const a = deg * DEG, c = Math.cos(a), s = Math.sin(a);
  const x = v.x * c + v.z * s, z = -v.x * s + v.z * c;
  v.x = x; v.z = z;
  return v;
}
