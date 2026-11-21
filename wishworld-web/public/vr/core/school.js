// A school of small fish for the reef, drawn efficiently: every fish of one colour is one instance of a single
// InstancedMesh (one draw call for the lot), on the game's shared vertex-lit material (so it gets the same
// light, fog and underwater caustics as everything else).
//
// Movement is a cheap flock: each fish steers toward its own slot around a leader that loops through the
// water, matches its neighbours' heading through that shared target, keeps its distance from the child's head,
// and darts away from a hand. CPU cost is a few vector operations a fish a frame.
import * as THREE from 'three';
import { MeshBuilder, sharedVertexLit } from '/shared/models.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const _d = new THREE.Vector3(), _t = new THREE.Vector3(), _look = new THREE.Matrix4(), _w = new THREE.Quaternion();

function fishGeometry(len, body, belly, fin) {
  const b = new MeshBuilder();
  b.taperBox([0, 0, len * 0.18], [len * 0.22, len * 0.34, len * 0.38], body, [90, 0, 0], 0.5, 0.55);
  b.taperBox([0, 0, -len * 0.18], [len * 0.22, len * 0.34, len * 0.36], body, [-90, 0, 0], 0.35, 0.3);
  b.taperBox([0, -len * 0.08, len * 0.05], [len * 0.2, len * 0.12, len * 0.4], belly, null, 0.8, 0.8);
  b.taperBox([0, 0, -len * 0.46], [len * 0.04, len * 0.26, len * 0.32], fin, [90, 0, 0], 1, 0.15);
  return b.build();
}

/**
 * createSchool({ count, colors: [[body, belly, fin], ...], length })
 * -> { group, update(dt, t, { center, head, hands }), setVisible(on), count }
 */
export function createSchool({ count = 160, length = 0.07, colors = [['#f2a65a', '#fff1d6', '#e0703a'], ['#7ec8e3', '#eaf7ff', '#3e86b8']] } = {}) {
  const group = new THREE.Group();
  group.name = 'FishSchool';
  const perKind = Math.ceil(count / colors.length);
  const meshes = colors.map(([body, belly, fin]) => {
    const mesh = new THREE.InstancedMesh(fishGeometry(length, body, belly, fin), sharedVertexLit(), perKind);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;            // the school is all around the child
    group.add(mesh);
    return mesh;
  });

  const fish = [];
  for (let i = 0; i < perKind * colors.length; i++) {
    const r = () => Math.random() * 2 - 1;
    fish.push({
      mesh: meshes[i % colors.length], index: Math.floor(i / colors.length),
      slot: new THREE.Vector3(r() * 0.9, r() * 0.35, r() * 0.9),        // where it likes to be around the leader
      pos: new THREE.Vector3(r() * 2, 1 + r() * 0.4, r() * 2),
      vel: new THREE.Vector3(r() * 0.2, 0, r() * 0.2),
      speed: 0.35 + Math.random() * 0.25, phase: Math.random() * 10, scale: 0.8 + Math.random() * 0.45,
    });
  }
  const leader = new THREE.Vector3();

  function update(dt, t, { center, head = null, hands = [] } = {}) {
    if (!group.visible) return;
    dt = Math.min(dt, 0.05);
    // The leader loops through the water around the child, rising and falling.
    leader.set(
      center.x + Math.sin(t * 0.13) * 2.6 + Math.sin(t * 0.31) * 0.6,
      center.y + 1.15 + Math.sin(t * 0.21) * 0.35,
      center.z + Math.cos(t * 0.11) * 2.6 + Math.cos(t * 0.27) * 0.6,
    );
    for (const f of fish) {
      _t.copy(f.slot).applyAxisAngle(_up, t * 0.2).add(leader);   // its slot turns with the school
      _d.copy(_t).sub(f.pos);
      const dist = _d.length();
      _d.multiplyScalar(Math.min(1.5, dist) / (dist || 1));       // steer toward the slot
      // keep clear of the head
      if (head) {
        _t.copy(f.pos).sub(head);
        const h = _t.length();
        if (h < 0.7) _d.addScaledVector(_t, ((0.7 - h) / (h || 1)) * 6);
      }
      // dart away from a hand
      for (const hand of hands) {
        if (!hand) continue;
        _t.copy(f.pos).sub(hand);
        const h = _t.length();
        if (h < 0.35) _d.addScaledVector(_t, ((0.35 - h) / (h || 1)) * 14);
      }
      f.vel.addScaledVector(_d, dt * 2.2);
      const sp = f.vel.length(), max = f.speed * (1 + Math.min(2, _d.length() * 0.3));
      if (sp > max) f.vel.multiplyScalar(max / sp);
      f.pos.addScaledVector(f.vel, dt);

      // face the way it swims, with a tail-beat wiggle
      _t.copy(f.pos).sub(f.vel);
      _look.lookAt(f.pos, _t, _up);
      _q.setFromRotationMatrix(_look);
      _q.multiply(_w.setFromAxisAngle(_up, Math.sin(t * 9 + f.phase) * 0.25));
      _s.setScalar(f.scale);
      _m.compose(f.pos, _q, _s);
      f.mesh.setMatrixAt(f.index, _m);
    }
    for (const m of meshes) m.instanceMatrix.needsUpdate = true;
  }

  return {
    group, update,
    count: fish.length,
    setVisible(on) { group.visible = Boolean(on); },
    /** Put every fish near a point (on entering the reef). */
    gather(center) { for (const f of fish) f.pos.copy(f.slot).add(center).add(_t.set(0, 1.1, 0)); },
  };
}
