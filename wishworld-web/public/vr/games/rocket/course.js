// Rings, slots, the launch pad and the landing circle for one mission, in the stage's frame (see game.js).
// Uses rings.js's basis so the drawn ring is exactly the one crossesRing tests.

import * as THREE from 'three';
import { ringBasis } from './rings.js';

const PEACH = new THREE.Color('#ffc79e'), NEXT = new THREE.Color('#ffe066'), DONE = new THREE.Color('#9fd6a8');
const _u = [0, 0, 0], _v = [0, 0, 0];
const _U = new THREE.Vector3(), _V = new THREE.Vector3(), _N = new THREE.Vector3(), _A = new THREE.Vector3(), _P = new THREE.Vector3();
const _m = new THREE.Matrix4();

export function createCourse() {
  const group = new THREE.Group(); group.name = 'Course';
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.02, 24), new THREE.MeshBasicMaterial({ color: '#456190' }));
  pad.position.y = -0.01;
  const landing = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 40), new THREE.MeshBasicMaterial({ color: '#ffc79e', side: THREE.DoubleSide }));
  landing.rotation.x = -Math.PI / 2;
  group.add(pad, landing);
  let rings = [];

  function clear() {
    for (const r of rings) {
      group.remove(r.object);
      r.object.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    }
    rings = [];
  }

  function makeRing(ring) {
    const material = new THREE.MeshBasicMaterial({ color: PEACH });
    const holder = new THREE.Group();
    ringBasis(ring, _u, _v);
    _U.fromArray(_u); _V.fromArray(_v); _N.fromArray(ring.facing);
    if (ring.slot) {
      // Rotate the basis so local X is the slot's long side.
      const a = ring.slot.angle * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
      _A.copy(_U).multiplyScalar(c).addScaledVector(_V, s);
      _P.copy(_U).multiplyScalar(-s).addScaledVector(_V, c);
      _U.copy(_A); _V.copy(_P);
      const w = ring.slot.width, h = ring.slot.height, t = Math.max(0.015, w * 0.05);
      for (const [x, y, sx, sy] of [[0, h / 2 + t / 2, w + 2 * t, t], [0, -h / 2 - t / 2, w + 2 * t, t], [w / 2 + t / 2, 0, t, h], [-w / 2 - t / 2, 0, t, h]]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, t), material);
        bar.position.set(x, y, 0);
        holder.add(bar);
      }
    } else {
      holder.add(new THREE.Mesh(new THREE.TorusGeometry(ring.radius, Math.max(0.012, ring.radius * 0.07), 8, 32), material));
    }
    _m.makeBasis(_U, _V, _N);
    holder.quaternion.setFromRotationMatrix(_m);
    holder.position.fromArray(ring.at);
    return { object: holder, material };
  }

  return {
    group,
    build(mission, params) {
      clear();
      for (const ring of mission.rings) { const r = makeRing(ring); rings.push(r); group.add(r.object); }
      const thick = mission.place === 'sky' ? 10 : 1;              // 2 cm in the room, 20 cm in the sky
      pad.scale.set(params.padRadius, thick, params.padRadius);
      pad.position.y = -0.01 * thick;                              // the top stays at y = 0
      landing.visible = Boolean(mission.landing);
      if (mission.landing) {
        landing.position.set(mission.landing.at[0], 0.02, mission.landing.at[2]);
        landing.scale.setScalar(mission.landing.radius);
      }
      this.setProgress(0);
    },
    setProgress(next) {
      rings.forEach((r, i) => r.material.color.copy(i < next ? DONE : i === next ? NEXT : PEACH));
    },
    ringObject(i) { return rings[i] ? rings[i].object : null; },
  };
}
