// The right controller (or the mouse and keys) becomes { angles: { pitch, yaw, roll }, thrust }.
// Angles are the controller's turn since calibrate() (called at launch), read in its own frame:
// tip forward = pitch, twist = yaw, wrist roll = roll (the rocket's right side follows the controller's right side).
// On a laptop the mouse aims the controller ray, so it steers too; W/S pitch, A/D yaw and Q/E roll add on top.
// Thrust is the trigger (left mouse button on a laptop: the shell's desktop preview sets controllers.right.trigger
// to 1 while it is held). When the right controller is not tracked but the left one is (an IV line in the right
// arm, say), the left one flies the rocket.

import * as THREE from 'three';
import { MAX_PITCH } from './attitude.js';

const TURN = 70 * Math.PI / 180;     // radians per second for the keys
const _q = new THREE.Quaternion(), _inv = new THREE.Quaternion(), _e = new THREE.Euler();
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

export function createControls(ctx) {
  const out = { angles: { pitch: 0, yaw: 0, roll: 0 }, thrust: false };
  const keyed = { pitch: 0, yaw: 0, roll: 0 };
  let calibrated = false, calibratedHand = null;

  /** The controller that flies: the right one, or the left one when only it is tracked. */
  function hand() {
    const { right, left } = ctx.controllers;
    return !right.tracked && left.tracked ? left : right;
  }

  return {
    hand,
    calibrate() {
      const h = hand();
      h.ray.getWorldQuaternion(_inv).invert();
      calibratedHand = h;
      keyed.pitch = keyed.yaw = keyed.roll = 0;
      calibrated = true;
    },
    reset() { calibrated = false; calibratedHand = null; out.angles.pitch = out.angles.yaw = out.angles.roll = 0; },
    read(dt) {
      const h = hand(), keys = ctx.input.state.keys;
      // A press that clicked a button (input.js marks it `consumed` until it is let go) is not thrust.
      out.thrust = Boolean(h.connected && h.trigger > 0.55 && !h.consumed);
      if (!calibrated) { out.angles.pitch = out.angles.yaw = out.angles.roll = 0; return out; }
      if (h !== calibratedHand) this.calibrate();                     // switched hands mid-flight: start from here
      if (keys.has('KeyW')) keyed.pitch += TURN * dt;
      if (keys.has('KeyS')) keyed.pitch -= TURN * dt;
      if (keys.has('KeyA')) keyed.yaw += TURN * dt;
      if (keys.has('KeyD')) keyed.yaw -= TURN * dt;
      if (keys.has('KeyQ')) keyed.roll -= TURN * dt;                  // Q rolls left, as a counter-clockwise wrist does
      if (keys.has('KeyE')) keyed.roll += TURN * dt;
      keyed.pitch = clamp(keyed.pitch, -MAX_PITCH, MAX_PITCH);
      keyed.roll = clamp(keyed.roll, -Math.PI, Math.PI);
      h.ray.getWorldQuaternion(_q).premultiply(_inv);                 // turn since calibrate, in the controller's frame
      _e.setFromQuaternion(_q, 'YXZ');
      out.angles.pitch = -_e.x + keyed.pitch;                           // pointing down = nose forward
      out.angles.yaw = _e.y + keyed.yaw;                                // twist left = turn left
      out.angles.roll = -_e.z + keyed.roll;                             // attitude.js rolls the other way round from a wrist turn
      return out;
    },
  };
}
