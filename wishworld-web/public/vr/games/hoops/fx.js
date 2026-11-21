// The one particle system Snow Hoops has: a pool of glowing dots (one THREE.Points, one draw call) for the
// sparkle of a basket, gold for a money ball. Additive, so a dot fades by darkening its colour. No allocation
// per frame.

import * as THREE from 'three';
import { dotTexture } from '/vr/core/fx.js';

export function createSparkles(max = 96) {
  const pos = new Float32Array(max * 3), vel = new Float32Array(max * 3), col = new Float32Array(max * 3), base = new Float32Array(max * 3), life = new Float32Array(max);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({ map: dotTexture(), size: 0.06, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const points = new THREE.Points(geo, mat);
  points.name = 'HoopsSparkles';
  points.frustumCulled = false;
  points.visible = false;
  let next = 0, live = 0, emitted = 0;
  const LIFE = 0.9;
  const _c = new THREE.Color();

  return {
    points,
    get emitted() { return emitted; },
    burst(x, y, z, rgb, count = 24, speed = 1.4) {
      _c.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
      for (let k = 0; k < count; k++) {
        const i = next; next = (next + 1) % max;
        const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u), s = speed * (0.4 + Math.random() * 0.6);
        pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
        vel[i * 3] = r * Math.cos(a) * s; vel[i * 3 + 1] = u * s * 0.6 + 0.5; vel[i * 3 + 2] = r * Math.sin(a) * s;
        base[i * 3] = _c.r; base[i * 3 + 1] = _c.g; base[i * 3 + 2] = _c.b;
        life[i] = LIFE * (0.7 + Math.random() * 0.3);
      }
      emitted += count;
      live = max;
      points.visible = true;
    },
    update(dt) {
      if (!points.visible) return;
      let any = false;
      for (let i = 0; i < max; i++) {
        if (life[i] <= 0) { col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0; continue; }
        any = true;
        life[i] -= dt;
        vel[i * 3 + 1] -= 2.5 * dt;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        const k = Math.max(0, life[i] / LIFE);
        col[i * 3] = base[i * 3] * k; col[i * 3 + 1] = base[i * 3 + 1] * k; col[i * 3 + 2] = base[i * 3 + 2] * k;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      if (!any) { points.visible = false; live = 0; }
    },
    clear() { life.fill(0); points.visible = false; live = 0; },
    get live() { return live; },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}
