// The Bottle Rocket's look. The origin is the nozzle tip and the nose points up (+Y), as in flight.js.
// Body: the child's scanned model (from the toy scan), fitted to bottle size, or a practice bottle.
// Kit: nose cone, two big peach side fins along local X (these line up with slots), two small slate fins, nozzle.
// A bottle rocket flies neck-down, so the nozzle is the bottle's neck.

import * as THREE from 'three';
import { MeshBuilder } from '/shared/models.js';
import { dotTexture } from '/vr/core/fx.js';

const NOZZLE = 0.02, BODY = 0.22, NOSE = 0.06;          // 0.30 m nozzle to nose tip at room scale
const PEACH = '#ffc79e', SLATE = '#334052', ICE = '#8fb0d4', RED = '#e86b5a', WHITE = '#fbfdff';
const SPRAY = 48;

/** Turn and scale a model so its longest side is +Y, `length` long, standing on y = 0. null if it is too thin. */
export function fitBody(model, length = BODY) {
  model.position.set(0, 0, 0); model.rotation.set(0, 0, 0);
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  if (box.isEmpty()) return null;
  const size = box.getSize(new THREE.Vector3());
  const longest = Math.max(size.x, size.y, size.z), shortest = Math.min(size.x, size.y, size.z);
  if (!(longest > 0) || shortest < longest * 0.1) return null;
  const turn = new THREE.Group();
  turn.add(model);
  if (longest === size.x) turn.rotation.z = Math.PI / 2;
  else if (longest === size.z) turn.rotation.x = Math.PI / 2;
  const holder = new THREE.Group();
  holder.add(turn);
  holder.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(turn);
  const k = length / (b.max.y - b.min.y);
  turn.scale.setScalar(k);
  const c = b.getCenter(new THREE.Vector3());
  turn.position.set(-c.x * k, -b.min.y * k, -c.z * k);
  return holder;
}

export function buildPracticeBottle() {
  const b = new MeshBuilder();
  b.cylinder([0, 0.015, 0], [0.034, 0.03, 0.034], ICE, null, 2.2, 10);     // shoulder, widening up from the neck
  b.cylinder([0, 0.12, 0], [0.075, 0.18, 0.075], ICE, null, 1, 10);         // body
  b.cylinder([0, 0.11, 0], [0.078, 0.06, 0.078], PEACH, null, 1, 10);       // label band
  const holder = new THREE.Group();
  holder.add(b.mesh({ mirror: 'x' }));
  holder.name = 'PracticeBottle';
  return holder;
}

export function createRocket() {
  const object = new THREE.Group(); object.name = 'Rocket';
  const pose = new THREE.Group(); object.add(pose);

  const kit = new MeshBuilder();
  kit.cylinder([0, NOZZLE / 2, 0], [0.034, NOZZLE, 0.034], WHITE, null, 1, 8);
  kit.cone([0, NOZZLE + BODY + NOSE / 2, 0], [0.08, NOSE, 0.08], RED, null, 10);
  kit.taperBox([0.06, NOZZLE + 0.045, 0], [0.05, 0.08, 0.006], PEACH, null, 0.4, 1);
  kit.taperBox([-0.06, NOZZLE + 0.045, 0], [0.05, 0.08, 0.006], PEACH, null, 0.4, 1);
  kit.taperBox([0, NOZZLE + 0.035, 0.05], [0.006, 0.06, 0.03], SLATE, null, 1, 0.4);
  kit.taperBox([0, NOZZLE + 0.035, -0.05], [0.006, 0.06, 0.03], SLATE, null, 1, 0.4);
  pose.add(kit.mesh({ mirror: 'x' }));

  const bodySlot = new THREE.Group(); bodySlot.position.y = NOZZLE; pose.add(bodySlot);

  const chute = new MeshBuilder();
  chute.hemisphere([0, 0, 0], [0.26, 0.12, 0.26], PEACH, WHITE);
  const chuteMesh = chute.mesh({ mirror: 'x' });
  chuteMesh.position.y = NOZZLE + BODY + NOSE + 0.12;
  chuteMesh.visible = false;
  pose.add(chuteMesh);
  let chuteOpen = false, chuteT = 0;

  // Water spray: a small pool of points falling out of the nozzle, in the rocket's own frame.
  const pos = new Float32Array(SPRAY * 3), vel = new Float32Array(SPRAY * 3), life = new Float32Array(SPRAY);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const sprayMat = new THREE.PointsMaterial({ map: dotTexture(), size: 0.025, color: 0xd8ecff, transparent: true, depthWrite: false });
  const spray = new THREE.Points(geo, sprayMat);
  spray.frustumCulled = false;
  pose.add(spray);
  let nextDrop = 0, kScale = 1;

  return {
    object,
    buildPracticeBottle,
    /** The scanned model, or null for the practice bottle. Returns which one is in use. */
    setBody(model) {
      while (bodySlot.children.length) bodySlot.remove(bodySlot.children[0]);
      const fitted = model ? fitBody(model) : null;
      bodySlot.add(fitted || buildPracticeBottle());
      return fitted ? 'scan' : 'practice';
    },
    setChute(open) {
      if (open !== chuteOpen) { chuteOpen = open; chuteT = 0; chuteMesh.visible = open; }
    },
    setScale(k) { kScale = k; pose.scale.setScalar(k); sprayMat.size = 0.025 * k; },
    update(dt, firing) {
      if (chuteOpen && chuteT < 1) { chuteT = Math.min(1, chuteT + dt * 4); const s = 0.2 + 0.8 * chuteT; chuteMesh.scale.set(s, s, s); }
      if (firing && (nextDrop -= dt) <= 0) {
        nextDrop = 0.012;
        const i = (Math.random() * SPRAY) | 0;
        pos[i * 3] = 0; pos[i * 3 + 1] = 0; pos[i * 3 + 2] = 0;
        vel[i * 3] = (Math.random() - 0.5) * 0.3; vel[i * 3 + 1] = -0.9 - Math.random() * 0.4; vel[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
        life[i] = 0.35;
      }
      for (let i = 0; i < SPRAY; i++) {
        if (life[i] <= 0) { pos[i * 3 + 1] = -1000; continue; }
        life[i] -= dt;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}
