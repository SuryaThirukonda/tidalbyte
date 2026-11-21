// "Go outside": an opaque sky sphere, a snowy ground disc and a few clouds. It is drawn by the game itself so it
// works in AR passthrough too (it covers the room). One draw call per part, unlit vertex colours.

import * as THREE from 'three';
import { MeshBuilder } from '/shared/models.js';

export function createSky(ctx) {
  const group = new THREE.Group(); group.name = 'SkyField'; group.visible = false;
  const radius = Math.min(170, 0.9 * (ctx.camera.far || 200));

  const sphereGeo = new THREE.SphereGeometry(radius, 24, 12);
  const top = new THREE.Color('#6fa8dc'), horizon = new THREE.Color('#dcecf8');
  const colors = [], p = sphereGeo.attributes.position, c = new THREE.Color();
  for (let i = 0; i < p.count; i++) { c.copy(horizon).lerp(top, Math.max(0, p.getY(i) / radius)); colors.push(c.r, c.g, c.b); }
  sphereGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const sphere = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  sphere.renderOrder = -10;

  const ground = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.98, 48), new THREE.MeshBasicMaterial({ color: '#f5f7fa', fog: false }));
  ground.rotation.x = -Math.PI / 2;

  const clouds = new MeshBuilder();
  for (const [x, y, z, s] of [[-40, 45, -90, 14], [30, 55, -120, 18], [70, 40, -60, 12], [-80, 50, -40, 16], [10, 60, -150, 20]]) {
    clouds.sphere([x, y, z], [s * 1.6, s * 0.6, s], '#ffffff', null, 8);
    clouds.sphere([x + s * 0.7, y + s * 0.15, z], [s, s * 0.5, s * 0.8], '#ffffff', null, 8);
  }
  const cloudMesh = clouds.mesh({ mirror: 'x' });

  group.add(sphere, ground, cloudMesh);
  return {
    group,
    /** Centre the field on the viewer, with the ground at floorY. */
    place(center, floorY) { group.position.set(center.x, floorY, center.z); sphere.position.y = 0; },
  };
}
