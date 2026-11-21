// Any model as a ball: a scanned toy, a library creature, Bubby. Only three.js here (Node tests load it too).
//
//   normalizeBall(model, 0.24)   a new Group holding a clone of the model, largest side 0.24 m, centred on the
//                                Group's origin (the pivot). The model itself is not changed. Its geometry and
//                                materials are shared with the clone, never copied.
//   makeRack(ball, 5)            five clones of that, again sharing geometry and materials
//   makeGold(ball, THREE, rgb)   ONE gold copy of each of the ball's materials, for every money ball
//
// Physics never looks at the mesh: the ball is a sphere of BALL.radius (physics.js), whatever its shape.

import * as THREE from 'three';

const _box = new THREE.Box3(), _size = new THREE.Vector3(), _centre = new THREE.Vector3();

export function countTriangles(object) {
  let n = 0;
  object.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry;
    n += (g.index ? g.index.count : g.attributes.position ? g.attributes.position.count : 0) / 3;
  });
  return Math.round(n);
}

export function normalizeBall(model, size) {
  const holder = new THREE.Group();
  holder.name = 'HoopsBall';
  const copy = model.clone(true);
  copy.position.set(0, 0, 0);
  copy.quaternion.identity();
  copy.scale.set(1, 1, 1);
  holder.add(copy);
  holder.updateMatrixWorld(true);
  _box.setFromObject(copy, true);
  if (!_box.isEmpty()) {
    _box.getSize(_size);
    _box.getCenter(_centre);
    const k = size / (Math.max(_size.x, _size.y, _size.z) || 1);
    copy.scale.setScalar(k);
    copy.position.copy(_centre).multiplyScalar(-k);
  }
  holder.userData.triangles = countTriangles(holder);
  holder.userData.size = size;
  return holder;
}

export function makeRack(ball, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(ball.clone(true));
  return out;
}

/**
 * Gold for the money ball: one copy of each distinct material of `ball`, tinted and glowing, shared by every money
 * ball. The Unity-look material (/shared/models.js, `wwVertexLit`) keeps the world's shared light uniforms.
 */
export function makeGold(ball, three = THREE, rgb = [1, 0.78, 0.22]) {
  const gold = new three.Color().setRGB(rgb[0], rgb[1], rgb[2], three.SRGBColorSpace);
  const map = new Map();               // original material -> gold copy
  const lit = [];
  function goldOf(m) {
    let g = map.get(m);
    if (g) return g;
    g = m.clone();
    if (m.userData && m.userData.wwVertexLit && m.uniforms && g.uniforms) {
      for (const k of ['uSunDir', 'uSunColor', 'uAmbient', 'map']) if (m.uniforms[k]) g.uniforms[k] = m.uniforms[k];
      g.uniforms.uTint.value.copy(gold);
      g.uniforms.uTintAmount.value = 0.55;
      g.uniforms.uGlowColor.value.copy(gold);
      g.uniforms.uGlow.value = 0.3;
      g.userData.wwVertexLit = true;
      lit.push(g);
    } else {
      if (g.color) g.color.lerp(gold, 0.55);
      if (g.emissive) { g.emissive.copy(gold); g.emissiveIntensity = 0.3; }
    }
    map.set(m, g);
    return g;
  }
  ball.traverse((o) => { if (o.isMesh && o.material && !Array.isArray(o.material)) goldOf(o.material); });
  return {
    /** Swap `object`'s materials for the gold ones (made on first sight). Returns object. */
    apply(object) {
      object.traverse((o) => { if (o.isMesh && o.material && !Array.isArray(o.material)) o.material = goldOf(o.material); });
      return object;
    },
    /** A slow shimmer: one uniform per material, not per ball. */
    setGlow(amount) { for (const g of lit) g.uniforms.uGlow.value = amount; },
    dispose() { for (const g of map.values()) g.dispose(); map.clear(); lit.length = 0; },
  };
}
