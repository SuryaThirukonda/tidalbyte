// The prepared toy behind "Scan a toy" (Unity: Assets/WishWorld/Editor/Builder.Toy.cs and
// CreatureMeshes.Bubby() on branch feat/newparts). In the web build a scan normally ends with the child's
// own toy, made into a 3D model from a phone photo (POST /api/scan). Bubby is what arrives when no photo
// comes in time, so the moment always ends with a friend.
//
// Bubby is the team's own soft toy: a brown plush lying on its belly, modelled by hand from photographs as a
// generated low-poly mesh. The photographs are not in the repository and nothing here was captured.

import * as THREE from 'three';
import { MeshBuilder, loadModelUrl } from '/shared/models.js';

/** Bubby made from photos of the real plush (tools/bubby-model.mjs). The blocky one stands in until it loads. */
export const BUBBY_MODEL = '/models/bubby.glb';
let scanned = null;
function scannedBubby() {
  if (!scanned) scanned = loadModelUrl(BUBBY_MODEL, 1).catch((err) => { console.warn('[wishworld] Bubby model', err && err.message); return null; });
  return scanned;
}

export const BUBBY = {
  id: 'bubby',
  name: 'Bubby',
  // The words are the team's own, written for this toy; the species is deliberately not named.
  greeting: "Hi {child}! I'm Bubby! I'm so excited to be on this adventure with you!",
  greeting2: "I can't wait to learn new things together. Where should we go first?",
  fact: 'Bubby is soft and fuzzy, and loves exploring and learning new things with you.',
};

const K = [0.08, 0.08, 0.1], W = [0.97, 0.97, 0.97];
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3();
const DEG = Math.PI / 180;

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
/** Turns an offset about Y by `yaw` degrees, the same numbers Unity's Quaternion.Euler(0, yaw, 0) * v gives. */
function turn(yaw, v) {
  _q.setFromEuler(_e.set(0, yaw * DEG, 0, 'YXZ'));
  _v.set(v[0], v[1], v[2]).applyQuaternion(_q);
  return [_v.x, _v.y, _v.z];
}

/**
 * Bubby's mesh, in Unity's numbers (MeshBuilder mirrors them into three.js space when it builds).
 * About 0.3 m from nose to back feet, front toward +Z in Unity, origin under the middle of the belly.
 */
export function bubbyBuilder() {
  const fur = [0.60, 0.43, 0.28];        // mid warm brown
  const tip = [0.71, 0.55, 0.39];        // the lighter tips of the fur, where the light catches it
  const muzzle = [0.40, 0.29, 0.11];     // darker olive-brown muzzle
  const nose = [0.27, 0.19, 0.08];
  const pad = [0.34, 0.22, 0.13];        // paw pads and feet
  const earInside = [0.47, 0.33, 0.20];
  const b = new MeshBuilder();

  // body: a low rounded lump, a little fuller at the rump
  b.sphere([0, 0.056, -0.015], [0.150, 0.112, 0.205], fur, null, 12);
  b.sphere([0, 0.052, -0.075], [0.142, 0.104, 0.120], fur, null, 10);
  b.sphere([0, 0.088, -0.030], [0.096, 0.056, 0.150], tip, null, 10);          // sheen along the back
  b.sphere([0, 0.062, -0.128], [0.034, 0.034, 0.034], fur, null, 6);           // stub of a tail

  // head: big and round, resting just above the front paws
  const head = [0, 0.078, 0.092];
  b.sphere(head, [0.136, 0.122, 0.128], fur, null, 12);
  b.sphere(add(head, [0, 0.034, -0.006]), [0.092, 0.060, 0.094], tip, null, 10);   // lighter crown
  b.sphere(add(head, [0, -0.022, 0.060]), [0.078, 0.062, 0.072], muzzle, null, 10);
  b.sphere(add(head, [0, -0.012, 0.094]), [0.032, 0.024, 0.022], nose, null, 6);
  for (let s = -1; s <= 1; s += 2) {
    b.sphere(add(head, [s * 0.052, 0.050, -0.016]), [0.038, 0.036, 0.024], fur, [0, s * 20, 0], 8);        // ear
    b.sphere(add(head, [s * 0.053, 0.049, -0.008]), [0.020, 0.019, 0.012], earInside, [0, s * 20, 0], 6);  // inside of the ear
    b.sphere(add(head, [s * 0.040, 0.012, 0.052]), [0.013, 0.013, 0.013], K, null, 6);                    // eye
    b.sphere(add(head, [s * 0.042, 0.015, 0.056]), [0.004, 0.004, 0.004], W, null, 5);                    // glint

    // front paw, flopped forward and a little outward, with a flat pad at the end
    const paw = [s * 0.068, 0.024, 0.086], pawYaw = s * 22;
    b.sphere(paw, [0.056, 0.046, 0.116], fur, [0, pawYaw, 0], 10);
    b.sphere(add(paw, turn(pawYaw, [0, -0.002, 0.052])), [0.044, 0.036, 0.026], pad, [0, pawYaw, 0], 6);

    // back leg, stretched out behind and splayed, foot turned so the pad shows
    const leg = [s * 0.060, 0.026, -0.104], legYaw = s * -30;
    b.sphere(leg, [0.062, 0.050, 0.128], fur, [0, legYaw, 0], 10);
    b.sphere(add(leg, turn(legYaw, [0, 0.001, -0.058])), [0.054, 0.048, 0.034], pad, [0, legYaw, 0], 8);
  }
  // Built a little large for easy numbers; brought down here so nose to back feet is about 0.3 m.
  return new MeshBuilder().append(b, [0, 0, 0], 0, 0.8);
}

/**
 * Bubby as a three.js object, ready to be a companion: centred on its middle (the companion follower floats
 * objects about their origin) and `size` metres long. Real size is 0.3 m.
 */
export function buildBubby(size = 0.3) {
  const mesh = bubbyBuilder().mesh({ mirror: 'x' });   // keeps facing +Z, as creatures do (companions turn +Z to the viewer)
  mesh.geometry.computeBoundingBox();
  const box = mesh.geometry.boundingBox, center = box.getCenter(new THREE.Vector3()), extent = box.getSize(new THREE.Vector3());
  mesh.position.copy(center).multiplyScalar(-1);
  const holder = new THREE.Group();
  holder.name = 'Bubby';
  holder.add(mesh);
  const longest = Math.max(extent.x, extent.y, extent.z, 1e-6);
  holder.scale.setScalar(size / longest);
  holder.userData.toy = BUBBY;
  // Swap in the model made from the real plush when it has loaded, where the blocky one is now (it may have been
  // wrapped in a pivot by then, see /vr/core/alive.js). Same size: the template is 1 m, the holder scales it.
  scannedBubby().then((template) => {
    if (!template || !mesh.parent) return;
    const real = template.clone(true);
    real.scale.multiplyScalar(longest);
    const parent = mesh.parent;
    parent.remove(mesh);
    parent.add(real);
    holder.userData.scanned = true;
  });
  return holder;
}
