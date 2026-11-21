// The player: Unity's XRRig as a three.js group. The camera and both controllers are children of `rig`,
// so moving the rig moves the player through the scene without touching what the headset reports.
// Unity never moves the player except to recentre them on a scene's anchor; neither does this.

import * as THREE from 'three';

const _f = new THREE.Vector3();
const _off = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export function createRig({ scene, camera, isAR }) {
  const rig = new THREE.Group();
  rig.name = 'XRRig';
  scene.add(rig);
  rig.add(camera);
  camera.position.set(0, 1.6, 0);

  // The white quad Unity fades scene changes through: 2 x 2 m, 0.12 m in front of the head, drawn over everything.
  const fadeMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false, toneMapped: false,
  });
  const fade = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), fadeMaterial);
  fade.position.set(0, 0, -0.12);
  fade.renderOrder = 10000;
  fade.frustumCulled = false;
  fade.visible = false;
  camera.add(fade);

  const home = { set: false, point: new THREE.Vector3(), forward: new THREE.Vector3(0, 0, -1), matchHeight: false, eye: 1.15 };
  let fadeFrom = 0, fadeTo = 0, fadeT = 1, fadeDur = 0, fadeDone = null, fadeAlpha = 0;

  function setFade(alpha) {
    fadeAlpha = Math.min(1, Math.max(0, alpha));
    fade.visible = fadeAlpha > 0.002;
    fadeMaterial.opacity = fadeAlpha;
  }

  const api = {
    object: rig,
    camera,

    /** Head position in world space. */
    viewerPosition(out = new THREE.Vector3()) { return out.setFromMatrixPosition(camera.matrixWorld); },
    /** Unit vector the head looks along, world space. */
    viewerForward(out = new THREE.Vector3()) { return out.setFromMatrixColumn(camera.matrixWorld, 2).negate().normalize(); },
    /** The same, flattened onto the floor (Unity's HeadForwardFlat). Falls back to the rig's forward when looking straight up or down. */
    viewerForwardFlat(out = new THREE.Vector3()) {
      api.viewerForward(out);
      out.y = 0;
      if (out.lengthSq() < 1e-4) out.set(0, 0, -1).applyQuaternion(rig.quaternion);
      return out.normalize();
    },
    /** Height of the floor under the player, world space. */
    floorY() { return rig.position.y; },

    /**
     * Turn and move the whole rig so the head is above `floorPoint`, facing `forward` (XRRig.Recenter).
     * With matchHeight the head is also put at eyeHeight (seated games). Ignored in AR, where the real room
     * is the frame of reference.
     */
    recenter(floorPoint, forward, matchHeight = false, eyeHeight = 1.15) {
      if (isAR && isAR()) return false;
      _f.copy(forward || home.forward); _f.y = 0;
      if (_f.lengthSq() < 1e-4) _f.set(0, 0, -1);
      _f.normalize();
      const targetYaw = Math.atan2(-_f.x, -_f.z);
      // The head's own yaw inside the rig.
      _off.set(0, 0, -1).applyQuaternion(camera.quaternion);
      const headYaw = Math.abs(_off.y) > 0.98 ? 0 : Math.atan2(-_off.x, -_off.z);
      rig.rotation.set(0, targetYaw - headYaw, 0);
      _off.set(camera.position.x, matchHeight ? camera.position.y : 0, camera.position.z).applyAxisAngle(UP, rig.rotation.y);
      rig.position.copy(floorPoint || home.point).sub(_off);
      if (matchHeight) rig.position.y += eyeHeight;
      rig.updateMatrixWorld(true);
      return true;
    },

    /** Recentre on an anchor and remember it: the Y button (R on a keyboard) repeats it. */
    setHome(floorPoint, forward, matchHeight = false, eyeHeight = 1.15) {
      home.set = true;
      home.point.copy(floorPoint || home.point.set(0, 0, 0));
      home.forward.copy(forward || home.forward.set(0, 0, -1));
      home.matchHeight = matchHeight; home.eye = eyeHeight;
      return api.recenter(home.point, home.forward, matchHeight, eyeHeight);
    },
    recenterHome() {
      if (!home.set) { home.set = true; home.point.set(0, 0, 0); home.forward.set(0, 0, -1); }
      return api.recenter(home.point, home.forward, home.matchHeight, home.eye);
    },
    /** Put the rig back at the origin (entering AR: the real floor is the floor). */
    reset() { rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0); rig.updateMatrixWorld(true); },

    setFade,
    get fadeAlpha() { return fadeAlpha; },
    /** Fade the white quad to `alpha` over `seconds`. Resolves when done. */
    fadeTo(alpha, seconds) {
      if (fadeDone) { const d = fadeDone; fadeDone = null; d(); }
      if (!(seconds > 0)) { setFade(alpha); return Promise.resolve(); }
      fadeFrom = fadeAlpha; fadeTo = alpha; fadeT = 0; fadeDur = seconds;
      return new Promise((resolve) => { fadeDone = resolve; });
    },
    update(dt) {
      if (fadeT < 1) {
        fadeT = Math.min(1, fadeT + dt / Math.max(0.001, fadeDur));
        setFade(fadeFrom + (fadeTo - fadeFrom) * fadeT);
        if (fadeT >= 1 && fadeDone) { const d = fadeDone; fadeDone = null; d(); }
      }
    },
  };
  return api;
}
