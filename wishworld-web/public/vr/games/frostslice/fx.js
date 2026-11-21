// Frost Slice effects, each one draw call and no allocations per frame:
//   blob shadows   Scripts/Core/BlobShadow.cs (a soft disc on the floor under every fruit in the air)
//   juice          the JuiceBurst particle prefab (Builder.Games.cs): 14 dots per cut
//   blade trails   the TrailRenderer on each blade's Tip
// All of it lives in the stage frame (see rules.js).

import * as THREE from 'three';
import { RULES, COLORS } from './rules.js';

const toLinear = (x) => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

// ------------------------------------------------------------------------------------------ shadows

export function createShadows(dot, max = 16) {
  const geometry = new THREE.PlaneGeometry(1, 1);
  const material = new THREE.MeshBasicMaterial({
    map: dot, transparent: true, opacity: COLORS.shadowAlpha, depthWrite: false, fog: false, toneMapped: false,
  });
  material.color.setRGB(COLORS.shadow[0], COLORS.shadow[1], COLORS.shadow[2], THREE.SRGBColorSpace);
  const mesh = new THREE.InstancedMesh(geometry, material, max);
  mesh.name = 'FruitShadows';
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  mesh.count = 0;
  let n = 0;
  return {
    mesh,
    begin() { n = 0; },
    /** x, y, z: the owner in the stage frame (floor at y = 0); radius: the disc's radius on the ground. */
    add(x, y, z, radius) {
      if (n >= max) return;
      const k = Math.min(1, Math.max(0, 1 - Math.max(0, y - radius) / RULES.shadow.maxHeight));
      if (k <= 0.06) return;
      const d = radius * 2 * (0.45 + 0.55 * k);
      _m.compose(_p.set(x, RULES.shadow.lift, z), _flat, _s.set(d, d, 1));
      mesh.setMatrixAt(n++, _m);
    },
    end() { mesh.count = n; mesh.visible = n > 0; if (n > 0) mesh.instanceMatrix.needsUpdate = true; },
    clear() { n = 0; mesh.count = 0; mesh.visible = false; },
    dispose() { geometry.dispose(); material.dispose(); mesh.dispose(); if (mesh.parent) mesh.parent.remove(mesh); },
  };
}

// ------------------------------------------------------------------------------------------ juice

export function createJuice(dot) {
  const J = RULES.juice, max = J.max;
  const geometry = new THREE.PlaneGeometry(1, 1);
  const material = new THREE.MeshBasicMaterial({ map: dot, transparent: true, depthWrite: false, fog: false, toneMapped: false });
  const mesh = new THREE.InstancedMesh(geometry, material, max);
  mesh.name = 'JuiceBurst';
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.setColorAt(0, new THREE.Color(1, 1, 1));           // makes the per-particle colour buffer
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.renderOrder = 6;
  mesh.count = 0;
  mesh.visible = false;

  const pos = new Float32Array(max * 3), vel = new Float32Array(max * 3);
  const life = new Float32Array(max), size = new Float32Array(max);
  const color = mesh.instanceColor.array;
  let n = 0, emitted = 0;
  const rand = (a, b) => a + Math.random() * (b - a);

  return {
    mesh,
    /** One puff at a stage-frame point, in an sRGB colour (ParticleSystem.Emit with a sphere shape of 3 cm). */
    burst(x, y, z, rgb) {
      const r = toLinear(rgb[0]), g = toLinear(rgb[1]), b = toLinear(rgb[2]);
      for (let k = 0; k < J.count && n < max; k++) {
        // A random direction; the particle starts inside the sphere and flies straight out of it.
        const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, h = Math.sqrt(1 - u * u);
        const dx = h * Math.cos(a), dy = u, dz = h * Math.sin(a);
        const d = J.radius * Math.cbrt(Math.random()), sp = rand(J.speed[0], J.speed[1]);
        const i = n++;
        pos[i * 3] = x + dx * d; pos[i * 3 + 1] = y + dy * d; pos[i * 3 + 2] = z + dz * d;
        vel[i * 3] = dx * sp; vel[i * 3 + 1] = dy * sp; vel[i * 3 + 2] = dz * sp;
        life[i] = rand(J.life[0], J.life[1]);
        size[i] = rand(J.size[0], J.size[1]);
        color[i * 3] = r; color[i * 3 + 1] = g; color[i * 3 + 2] = b;
        emitted++;
      }
      mesh.instanceColor.needsUpdate = true;
    },
    /** facing: the camera's rotation in the stage frame, so every dot is a billboard. */
    update(dt, facing) {
      if (n === 0) { if (mesh.visible) { mesh.visible = false; mesh.count = 0; } return; }
      let moved = false;
      for (let i = n - 1; i >= 0; i--) {
        life[i] -= dt;
        if (life[i] <= 0) {
          const last = --n;
          if (i !== last) {
            pos.copyWithin(i * 3, last * 3, last * 3 + 3);
            vel.copyWithin(i * 3, last * 3, last * 3 + 3);
            color.copyWithin(i * 3, last * 3, last * 3 + 3);
            life[i] = life[last]; size[i] = size[last];
            moved = true;
          }
        }
      }
      for (let i = 0; i < n; i++) {
        const j = i * 3;
        vel[j + 1] -= J.gravity * dt;
        pos[j] += vel[j] * dt; pos[j + 1] += vel[j + 1] * dt; pos[j + 2] += vel[j + 2] * dt;
        _m.compose(_p.set(pos[j], pos[j + 1], pos[j + 2]), facing, _s.set(size[i], size[i], 1));
        mesh.setMatrixAt(i, _m);
      }
      mesh.count = n;
      mesh.visible = n > 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (moved) mesh.instanceColor.needsUpdate = true;
    },
    clear() { n = 0; mesh.count = 0; mesh.visible = false; },
    get live() { return n; },
    get emitted() { return emitted; },
    dispose() { geometry.dispose(); material.dispose(); mesh.dispose(); if (mesh.parent) mesh.parent.remove(mesh); },
  };
}

// ------------------------------------------------------------------------------------------ trails

const MAX_POINTS = 28;
let trailMaterial = null;
const _tan = new THREE.Vector3();
const _eye = new THREE.Vector3();
const _side = new THREE.Vector3();

/** A ribbon behind a blade tip: 4 cm wide at the tip to nothing, ice blue to white, fading out, 0.16 s long. */
export function createTrail() {
  const B = RULES.blade;
  if (!trailMaterial) {
    trailMaterial = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false,
    });
  }
  const positions = new Float32Array(MAX_POINTS * 2 * 3);
  const colors = new Float32Array(MAX_POINTS * 2 * 4);
  const index = new Uint16Array((MAX_POINTS - 1) * 6);
  for (let i = 0; i < MAX_POINTS - 1; i++) {
    const a = i * 2;
    index.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], i * 6);
  }
  const geometry = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
  const colAttr = new THREE.BufferAttribute(colors, 4).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', posAttr);
  geometry.setAttribute('color', colAttr);
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.setDrawRange(0, 0);
  const mesh = new THREE.Mesh(geometry, trailMaterial);
  mesh.name = 'BladeTrail';
  mesh.frustumCulled = false;
  mesh.renderOrder = 7;
  mesh.visible = false;

  // Stored points, newest last (a ring is not worth it at this size).
  const px = new Float32Array(MAX_POINTS), py = new Float32Array(MAX_POINTS), pz = new Float32Array(MAX_POINTS);
  const pt = new Float32Array(MAX_POINTS);
  let count = 0;
  const ice = COLORS.ice.map(toLinear);

  function drop(k) {                                   // forget the k oldest points
    if (k <= 0) return;
    px.copyWithin(0, k, count); py.copyWithin(0, k, count); pz.copyWithin(0, k, count); pt.copyWithin(0, k, count);
    count -= k;
  }

  return {
    mesh,
    /** tip and eye in the stage frame; now in seconds. */
    update(tip, eye, now) {
      let old = 0;
      while (old < count && now - pt[old] > B.trailTime) old++;
      drop(old);
      const last = count - 1;
      if (count === 0 || Math.hypot(tip.x - px[last], tip.y - py[last], tip.z - pz[last]) >= B.trailMinStep) {
        if (count === MAX_POINTS - 1) drop(1);
        px[count] = tip.x; py[count] = tip.y; pz[count] = tip.z; pt[count] = now; count++;
      }
      // The ribbon: the tip itself, then the stored points from newest to oldest.
      const points = count + 1;
      let length = 0, ax = tip.x, ay = tip.y, az = tip.z;
      for (let i = count - 1; i >= 0; i--) { length += Math.hypot(px[i] - ax, py[i] - ay, pz[i] - az); ax = px[i]; ay = py[i]; az = pz[i]; }
      if (points < 2 || length < 1e-4) { geometry.setDrawRange(0, 0); mesh.visible = false; return; }
      let run = 0;
      ax = tip.x; ay = tip.y; az = tip.z;
      for (let k = 0; k < points; k++) {
        const i = count - k;                            // k = 0 is the tip; k >= 1 reads stored point i
        const x = k === 0 ? tip.x : px[i], y = k === 0 ? tip.y : py[i], z = k === 0 ? tip.z : pz[i];
        run += Math.hypot(x - ax, y - ay, z - az);
        // direction of the ribbon here: toward the next older point (or from the newer one at the tail)
        const j = k < points - 1 ? i - 1 : i;
        if (k < points - 1) _tan.set(px[j] - x, py[j] - y, pz[j] - z); else _tan.set(x - ax, y - ay, z - az);
        ax = x; ay = y; az = z;
        const f = Math.min(1, run / length);
        _eye.set(eye.x - x, eye.y - y, eye.z - z);
        _side.crossVectors(_tan, _eye);
        const len = _side.length();
        if (len > 1e-8) _side.multiplyScalar((B.trailWidth * 0.5 * (1 - f)) / len); else _side.set(0, 0, 0);
        const v = k * 6, c = k * 8;
        positions[v] = x + _side.x; positions[v + 1] = y + _side.y; positions[v + 2] = z + _side.z;
        positions[v + 3] = x - _side.x; positions[v + 4] = y - _side.y; positions[v + 5] = z - _side.z;
        const r = ice[0] + (1 - ice[0]) * f, g = ice[1] + (1 - ice[1]) * f, b = ice[2] + (1 - ice[2]) * f, a = 0.8 * (1 - f);
        colors[c] = r; colors[c + 1] = g; colors[c + 2] = b; colors[c + 3] = a;
        colors[c + 4] = r; colors[c + 5] = g; colors[c + 6] = b; colors[c + 7] = a;
      }
      posAttr.needsUpdate = true; colAttr.needsUpdate = true;
      geometry.setDrawRange(0, (points - 1) * 6);
      mesh.visible = true;
    },
    clear() { count = 0; geometry.setDrawRange(0, 0); mesh.visible = false; },
    dispose() { geometry.dispose(); if (mesh.parent) mesh.parent.remove(mesh); },
  };
}

export function disposeTrailMaterial() { if (trailMaterial) { trailMaterial.dispose(); trailMaterial = null; } }
