// The four forces drawn as labelled arrows from the rocket: thrust, weight, lift and drag. Lengths follow the forces
// flight.js reports, clamped so they stay readable. No numbers: this is for ages 6 to 12.

import * as THREE from 'three';

const KINDS = [['thrust', '#ff9a5a', 'Thrust'], ['weight', '#6f87b8', 'Weight'], ['lift', '#5fbf73', 'Lift'], ['drag', '#c07ad6', 'Drag']];
const ON_TOP = 30;                   // drawn after the rocket, the course and the HUD panels
const _dir =new THREE.Vector3(), _tip = new THREE.Vector3(), _world = new THREE.Vector3();

export function createForces(ctx) {
  const group = new THREE.Group(); group.name = 'Forces';
  const arrows = KINDS.map(([key, color, label]) => {
    const arrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 0.1, color, 0.03, 0.02);
    const tag = ctx.ui.makeTextPanel(label, { width: 0.16, fontSize: 0.026, background: null, color });
    // Always on top: thrust starts at the nozzle and points up through the bottle, so it would hide inside the body.
    for (const o of [arrow, tag]) {
      o.traverse((m) => {
        if (!m.material) return;
        m.renderOrder = ON_TOP;
        for (const mat of Array.isArray(m.material) ? m.material : [m.material]) { mat.depthTest = false; mat.depthWrite = false; }
      });
    }
    group.add(arrow, tag);
    return { key, arrow, tag };
  });
  let k = 1, perUnit = 0.1;

  return {
    group,
    setScale(scale, per) { k = scale; perUnit = per; for (const a of arrows) a.tag.scale.setScalar(scale); },
    /** state: flight state; at: the rocket's position (stage frame, a Vector3); viewer: head position (world). */
    update(state, at, viewer) {
      for (const a of arrows) {
        const f = state.forces[a.key];
        const m = Math.hypot(f[0], f[1], f[2]);
        const on = m > 1e-3;
        a.arrow.visible = on; a.tag.visible = on;
        if (!on) continue;
        _dir.set(f[0] / m, f[1] / m, f[2] / m);
        const length = Math.min(0.35, Math.max(0.05, m * perUnit)) * k;
        a.arrow.position.copy(at);
        a.arrow.setDirection(_dir);
        a.arrow.setLength(length, 0.05 * k, 0.03 * k);
        _tip.copy(at).addScaledVector(_dir, length + 0.04 * k);
        a.tag.position.copy(_tip);
        ctx.ui.faceViewer(a.tag, _world.copy(viewer));
        // faceViewer writes a world yaw into the local rotation; the stage only ever yaws, so subtract its yaw.
        if (group.parent) a.tag.rotation.y -= group.parent.rotation.y;
      }
    },
  };
}
