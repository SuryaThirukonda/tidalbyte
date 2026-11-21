// A crowd of penguins watching Snow Hoops from behind and beside the hoop, well clear of the ball's paths. They
// sway a little while they wait and hop and wiggle when a basket goes in (higher and longer for the money ball).
// The penguin is the library's /models/penguin.glb (one 132-triangle mesh), drawn as ONE InstancedMesh: the
// whole crowd is a single draw call. The shared vertex-lit material supports instancing.

import * as THREE from 'three';
import { loadCreature } from '/shared/models.js';

const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler();

/**
 * spots: [{ x, z, scale }] on the floor, court frame. lookAt: { x, z } the point they all face.
 */
export function createCrowd(spots, lookAt) {
  const group = new THREE.Group();
  group.name = 'HoopsCrowd';
  const n = spots.length;
  const yaw = new Float32Array(n), phase = new Float32Array(n), scale = new Float32Array(n);
  spots.forEach((s, i) => {
    yaw[i] = Math.atan2(lookAt.x - s.x, lookAt.z - s.z);       // penguins face +Z in their file
    phase[i] = Math.random() * Math.PI * 2;
    scale[i] = s.scale || 1;
  });
  let mesh = null, geometry = null, loading = null, excitement = 0, cheers = 0;

  function load() {
    if (!loading) {
      loading = loadCreature('penguin').then((model) => {
        // one mesh, baked into the creature holder's frame (its size and feet-on-the-floor offset)
        model.updateMatrixWorld(true);
        let source = null;
        model.traverse((o) => { if (o.isMesh && (!source || o.geometry.attributes.position.count > source.geometry.attributes.position.count)) source = o; });
        if (!source) return;
        geometry = source.geometry.clone().applyMatrix4(source.matrixWorld);
        mesh = new THREE.InstancedMesh(geometry, source.material, n);
        mesh.name = 'HoopsPenguins';
        mesh.frustumCulled = false;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        group.add(mesh);
        pose(0);
      }).catch((err) => console.warn('[hoops] the penguin crowd could not be loaded:', err && err.message));
    }
    return loading;
  }

  function pose(t) {
    if (!mesh) return;
    for (let i = 0; i < n; i++) {
      const s = spots[i], ph = phase[i];
      const hop = excitement > 0 ? Math.abs(Math.sin(t * 9 + ph)) * 0.16 * Math.min(1.5, excitement) : 0;
      const wiggle = excitement > 0 ? Math.sin(t * 14 + ph) * 0.22 * Math.min(1, excitement) : Math.sin(t * 1.3 + ph) * 0.04;
      _p.set(s.x, hop, s.z);
      _q.setFromEuler(_e.set(0, yaw[i], wiggle, 'YXZ'));
      const squash = 1 + (excitement > 0 ? Math.sin(t * 18 + ph) * 0.04 : 0);
      _s.set(scale[i] / squash, scale[i] * squash, scale[i] / squash);
      mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  return {
    group, load,
    get count() { return mesh ? n : 0; },
    get cheers() { return cheers; },
    get excited() { return excitement > 0; },
    /** A basket: 1 for a regular ball, 2 for the money ball. They cheer for about a second per level. */
    cheer(level = 1) { cheers++; excitement = Math.max(excitement, level * 1.1); },
    update(dt, t) {
      if (!mesh) return;
      if (excitement > 0) excitement = Math.max(0, excitement - dt);
      pose(t);
    },
    clear() { excitement = 0; pose(0); },
    dispose() { if (geometry) geometry.dispose(); if (mesh) { mesh.dispose(); group.remove(mesh); } mesh = null; },
  };
}

/** Where the penguins stand: rows behind the hoop and down both sides, out of the way of every throw. */
export function crowdSpots(hoop) {
  const [hx, , hz] = hoop, spots = [];
  for (let i = 0; i < 7; i++) spots.push({ x: hx - 3 + i, z: hz - 3.4 - (i % 2) * 0.6, scale: 0.9 + (i % 3) * 0.08 });   // behind the hoop
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) spots.push({ x: hx + side * (6.2 + (i % 2) * 0.5), z: hz - 2.5 + i * 1.3, scale: 0.85 + (i % 2) * 0.1 });   // the sides
  }
  return spots;
}
