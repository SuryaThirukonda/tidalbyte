// The right controller (or the mouse and keys) becomes { angles: { pitch, yaw, roll }, thrust }.
// Angles are the controller's turn since calibrate() (called at launch), read in its own frame:
// tip forward = pitch, twist = yaw, wrist roll = roll. On a laptop the mouse aims the controller ray, so it steers
// too; W/S pitch, A/D yaw and Q/E roll add on top. Thrust is the trigger (left mouse button on a laptop: the shell's
// desktop preview sets controllers.right.trigger to 1 while it is held).

import * as THREE from 'three';

const TURN = 70 * Math.PI / 180;     // radians per second for the keys
const _q = new THREE.Quaternion(), _inv = new THREE.Quaternion(), _e = new THREE.Euler();

export function createControls(ctx) {
  const out = { angles: { pitch: 0, yaw: 0, roll: 0 }, thrust: false };
  const keyed = { pitch: 0, yaw: 0, roll: 0 };
  let calibrated = false;

  return {
    calibrate() {
      ctx.controllers.right.ray.getWorldQuaternion(_inv).invert();
      keyed.pitch = keyed.yaw = keyed.roll = 0;
      calibrated = true;
    },
    reset() { calibrated = false; out.angles.pitch = out.angles.yaw = out.angles.roll = 0; },
    read(dt) {
      const hand = ctx.controllers.right, keys = ctx.input.state.keys;
      out.thrust = Boolean(hand.connected && hand.trigger > 0.55);
      if (!calibrated) { out.angles.pitch = out.angles.yaw = out.angles.roll = 0; return out; }
      if (keys.has('KeyW')) keyed.pitch += TURN * dt;
      if (keys.has('KeyS')) keyed.pitch -= TURN * dt;
      if (keys.has('KeyA')) keyed.yaw += TURN * dt;
      if (keys.has('KeyD')) keyed.yaw -= TURN * dt;
      if (keys.has('KeyQ')) keyed.roll += TURN * dt;
      if (keys.has('KeyE')) keyed.roll -= TURN * dt;
      hand.ray.getWorldQuaternion(_q).premultiply(_inv);           // turn since calibrate, in the controller's frame
      _e.setFromQuaternion(_q, 'YXZ');
      out.angles.pitch = -_e.x + keyed.pitch;                         // pointing down = nose forward
      out.angles.yaw = _e.y + keyed.yaw;                              // twist left = turn left
      out.angles.roll = _e.z + keyed.roll;
      return out;
    },
  };
}
