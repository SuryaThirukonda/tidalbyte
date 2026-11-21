// Small shared effects from the Unity game, built to cost one draw call each:
//   createSnowfall()    Generated/Prefabs/Snowfall.prefab (Builder.Core.cs BuildSnow)
//   createShadowPool()  Scripts/Core/BlobShadow.cs: soft discs on the floor instead of real shadows
//   dotTexture()        T_Dot.png: a white dot with a soft edge
//
// Tabs may import this file directly: import { createSnowfall } from '/vr/core/fx.js';

import * as THREE from 'three';

let dot = null;
/** The 64 px soft dot (alpha = 1 - d^2). Generated, so it never depends on a file. */
export function dotTexture() {
  if (dot) return dot;
  const size = 64, c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - 31.5) / 31.5, dy = (y - 31.5) / 31.5;
      const a = Math.max(0, Math.min(1, 1 - (dx * dx + dy * dy)));
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  dot = new THREE.CanvasTexture(c);
  dot.colorSpace = THREE.SRGBColorSpace;
  return dot;
}

const SNOW_VERT = /* glsl */ `
attribute vec3 aStart;
attribute vec3 aVelocity;
attribute vec2 aSeed;             // x: phase in seconds, y: size in metres
uniform float uTime;
uniform float uLife;
varying vec2 vUv;
void main() {
  vUv = uv;
  float age = mod(uTime + aSeed.x, uLife);
  vec3 center = aStart + aVelocity * age;
  vec4 mv = modelViewMatrix * vec4(center, 1.0);
  mv.xy += position.xy * aSeed.y;                // a billboard: always facing the eye
  gl_Position = projectionMatrix * mv;
}`;
const SNOW_FRAG = /* glsl */ `
uniform float uAlpha;
varying vec2 vUv;
void main() {
  vec2 d = vUv * 2.0 - 1.0;
  float a = clamp(1.0 - dot(d, d), 0.0, 1.0) * uAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(1.0, 1.0, 1.0, a);
}`;

/**
 * Falling snow as in the hub: flakes born in a box `area` wide at the object's origin, drifting down for
 * `life` seconds. All motion happens in the vertex shader, so it costs nothing per frame on the CPU.
 * Returns a Mesh; call mesh.update(elapsedSeconds) each frame, and put it where the box should be
 * (the hub's is 4.5 m up, 2 m ahead of the player).
 */
export function createSnowfall({ count = 320, area = [12, 0.1, 12], life = 7, size = [0.02, 0.045], alpha = 0.9 } = {}) {
  const base = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index;
  g.setAttribute('position', base.attributes.position);
  g.setAttribute('uv', base.attributes.uv);
  const start = new Float32Array(count * 3), vel = new Float32Array(count * 3), seed = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    start[i * 3] = (Math.random() - 0.5) * area[0];
    start[i * 3 + 1] = (Math.random() - 0.5) * area[1];
    start[i * 3 + 2] = (Math.random() - 0.5) * area[2];
    vel[i * 3] = -0.12 + Math.random() * 0.24;
    vel[i * 3 + 1] = -0.62 + Math.random() * 0.22;
    vel[i * 3 + 2] = -0.12 + Math.random() * 0.24;
    seed[i * 2] = Math.random() * life;
    seed[i * 2 + 1] = size[0] + Math.random() * (size[1] - size[0]);
  }
  g.setAttribute('aStart', new THREE.InstancedBufferAttribute(start, 3));
  g.setAttribute('aVelocity', new THREE.InstancedBufferAttribute(vel, 3));
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 2));
  g.instanceCount = count;
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uLife: { value: life }, uAlpha: { value: alpha } },
    vertexShader: SNOW_VERT, fragmentShader: SNOW_FRAG, transparent: true, depthWrite: false, fog: false,
  });
  const mesh = new THREE.Mesh(g, material);
  mesh.name = 'Snowfall';
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  mesh.update = (elapsed) => { material.uniforms.uTime.value = elapsed; };
  mesh.dispose = () => { g.dispose(); material.dispose(); base.dispose(); if (mesh.parent) mesh.parent.remove(mesh); };
  return mesh;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/**
 * Blob shadows for up to `max` things, as one instanced mesh. Each frame, for every owner:
 *   pool.place(index, ownerPosition, radius, floorY, maxHeight)
 * The disc shrinks and disappears as the owner rises (BlobShadow.LateUpdate); pool.hide(index) removes one,
 * and pool.commit() uploads the frame's changes.
 */
export function createShadowPool(max = 32) {
  const geometry = new THREE.PlaneGeometry(1, 1);
  const material = new THREE.MeshBasicMaterial({
    map: dotTexture(), color: 0x0a0f1f, transparent: true, opacity: 0.46, depthWrite: false, fog: false, toneMapped: false,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, max);
  mesh.name = 'BlobShadows';
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  _m.makeScale(0, 0, 0);
  for (let i = 0; i < max; i++) mesh.setMatrixAt(i, _m);
  mesh.count = max;
  return {
    mesh,
    place(index, position, radius, floorY = 0, maxHeight = 3.5) {
      if (index < 0 || index >= max) return;
      const k = Math.min(1, Math.max(0, 1 - Math.max(0, position.y - floorY - radius) / maxHeight));
      if (k <= 0.06) { _m.makeScale(0, 0, 0); mesh.setMatrixAt(index, _m); return; }
      const d = radius * 2 * (0.45 + 0.55 * k);
      _m.compose(_p.set(position.x, floorY + 0.012, position.z), _q, _s.set(d, d, 1));
      mesh.setMatrixAt(index, _m);
    },
    hide(index) { if (index >= 0 && index < max) { _m.makeScale(0, 0, 0); mesh.setMatrixAt(index, _m); } },
    commit() { mesh.instanceMatrix.needsUpdate = true; },
    dispose() { geometry.dispose(); material.dispose(); if (mesh.parent) mesh.parent.remove(mesh); },
  };
}
