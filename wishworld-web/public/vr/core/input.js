// Input: Unity's XRRig pointer, poke and button logic (Scripts/Core/XRRig.cs, WWInput.cs), for WebXR
// controllers and for the desktop preview (Scripts/DebugTools/DesktopInputSource.cs).
//
//   - both controllers are always the same two objects (`controllers.left`, `controllers.right`), whichever
//     WebXR input slot they arrive on, and whether or not a headset is present;
//   - each has a pointer ray that tests UI first, then world objects, highlights what it is on, and clicks
//     it with the trigger; pushing a controller tip into a button also presses it;
//   - buttons follow the Unity mapping: trigger, grip, A / X (primary), B / Y (secondary), thumbstick.
//
// Nothing here allocates per frame.

import * as THREE from 'three';
import { MeshBuilder, sharedVertexLit, loadManifest, loadGLB } from '/shared/models.js';
import { colors, hex } from './theme.js';

const PRESS = 0.55;                // Unity's trigger threshold
const RAY_LENGTH = 10;
const HANDS = ['left', 'right'];

const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _lo = new THREE.Vector3();
const _inv = new THREE.Matrix4();
const _c = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _e = new THREE.Euler();
const FORWARD = new THREE.Vector3(0, 0, -1);
const UP = new THREE.Vector3(0, 1, 0);

function isLive(object) {
  for (let o = object; o; o = o.parent) {
    if (!o.visible) return false;
    if (o.isScene) return true;
  }
  return false;
}

function controllerVisual() {
  // Unity's Controller mesh: a slate hexagonal handle with a peach ball on the front (Builder.Core.cs BuildRig).
  const mesh = new MeshBuilder()
    .cylinder([0, -0.015, -0.035], [0.034, 0.11, 0.034], colors.slate, [70, 0, 0])
    .sphere([0, 0.01, 0.03], [0.06, 0.05, 0.06], colors.peach)
    .mesh({ mirror: 'z' });
  mesh.name = 'ControllerVisual';
  return mesh;
}

function fakeGamepad() {
  const buttons = [];
  for (let i = 0; i < 6; i++) buttons.push({ pressed: false, touched: false, value: 0 });
  return { id: 'desktop-preview', mapping: 'xr-standard', buttons, axes: [0, 0, 0, 0], hapticActuators: [] };
}

export function createInput({ renderer, scene, camera, rig, dom, isImmersive }) {
  const targets = [];              // every registered pointer target
  const callbacks = {
    onSelectStart: null, onSelectEnd: null, onSqueezeStart: null, onSqueezeEnd: null,
    onButtonDown: null, onButtonUp: null, onKey: null, onConnection: null,
  };

  const lineMaterial = new THREE.MeshBasicMaterial({ color: hex(colors.peach), fog: false, toneMapped: false });
  const lineGeometry = new THREE.CylinderGeometry(0.0015, 0.003, 1, 5, 1, true);
  lineGeometry.translate(0, 0.5, 0);
  lineGeometry.rotateX(-Math.PI / 2);

  function makeHand(name) {
    const grip = new THREE.Group(); grip.name = name + 'Grip';
    const ray = new THREE.Group(); ray.name = name + 'Ray';
    rig.object.add(grip); rig.object.add(ray);
    const visual = controllerVisual();
    grip.add(visual);
    const line = new THREE.Mesh(lineGeometry, lineMaterial);
    line.name = name + 'PointerLine'; line.visible = false; line.frustumCulled = false; line.renderOrder = 50;
    scene.add(line);
    grip.visible = false;
    return {
      name, grip, ray, visual, line,
      connected: false, tracked: false, gamepad: null,
      trigger: 0, squeeze: 0, primary: false, secondary: false, stickPressed: false, stick: { x: 0, y: 0 },
      // pointer state
      hover: null, hit: new THREE.Vector3(), hitDistance: 0, consumed: false, selecting: false, squeezing: false,
      poked: new Set(), pokeNow: new Set(),
      origin: new THREE.Vector3(), direction: new THREE.Vector3(0, 0, -1),
      slot: -1, source: null, prevPrimary: false, prevSecondary: false, prevStick: false,
    };
  }

  const controllers = { left: makeHand('left'), right: makeHand('right') };

  const state = {
    pointersEnabled: true,
    /** Desktop preview: true keeps the mouse-driven controller low and aims it at what is under the cursor
     *  (good for menus); false floats it on the cursor ray at `reach` metres, as Unity does for blades. */
    desktopPointerMode: true,
    desktopMoveEnabled: true,
    /** Desktop preview: false stops a left-drag on open space from turning the view (a tab that uses the drag
     *  itself, such as Snow Hoops' aim). Right-drag still looks. The shell sets it back on every tab switch. */
    desktopLookEnabled: true,
    reach: 0.5,
    keys: new Set(),
    desktop: !isImmersive(),
    /** "Play in browser": the mouse is captured for first-person look and aims through the screen centre, a touch
     *  screen gets a move stick, a game controller works, and nobody flies (see setPlay). */
    play: false,
  };

  // ---------------------------------------------------------------------------------- targets

  /**
   * Make `object` something a pointer can hover and click.
   *   { width, height }        a rectangle in the object's local XY plane, centred on its origin (panels, buttons)
   *   { radius }               a sphere around the object's origin, in the object's own units (creatures)
   *   ui                       true: tested before world objects, and pokeable (default: true for rectangles)
   *   onClick(hand, object), onHover(isHovering, hand, object), enabled
   * Only objects that are in the scene and visible are tested. Returns the target; call removeTarget(object) when done.
   */
  function addTarget(object, spec = {}) {
    removeTarget(object);
    const t = {
      object, width: spec.width || 0, height: spec.height || 0, depth: spec.depth ?? 0.03, radius: spec.radius || 0,
      offset: spec.offset || null,
      ui: spec.ui ?? !(spec.radius > 0), onClick: spec.onClick || null, onHover: spec.onHover || null,
      enabled: spec.enabled !== false, button: Boolean(spec.button), live: false, hovers: 0,
    };
    targets.push(t);
    object.userData.pointerTarget = t;
    return t;
  }

  function removeTarget(object) {
    const t = object && object.userData ? object.userData.pointerTarget : null;
    if (!t) return;
    const i = targets.indexOf(t);
    if (i >= 0) targets.splice(i, 1);
    for (const name of HANDS) {
      const h = controllers[name];
      if (h.hover === t) setHover(h, null);
      h.poked.delete(t);
    }
    delete object.userData.pointerTarget;
  }

  function setHover(h, t) {
    if (h.hover === t) return;
    const old = h.hover;
    h.hover = t;
    if (old) {
      old.hovers = Math.max(0, old.hovers - 1);
      if (old.hovers === 0 && old.onHover) { try { old.onHover(false, h.name, old.object); } catch (err) { console.error(err); } }
    }
    if (t) {
      t.hovers += 1;
      if (t.hovers === 1 && t.onHover) { try { t.onHover(true, h.name, t.object); } catch (err) { console.error(err); } }
    }
  }

  // Nearest target of one kind along a ray. Returns the target and writes the distance to pickDistance.
  let pickDistance = 0;
  function pick(origin, dir, wantUi) {
    let best = null, bestT = RAY_LENGTH;
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      if (!t.live || !t.enabled || t.ui !== wantUi) continue;
      const mw = t.object.matrixWorld;
      if (t.radius > 0) {
        if (t.offset) _c.copy(t.offset).applyMatrix4(mw); else _c.setFromMatrixPosition(mw);
        const r = t.radius * mw.getMaxScaleOnAxis();
        _c.sub(origin);
        const tca = _c.dot(dir);
        const d2 = _c.lengthSq() - tca * tca;
        if (d2 > r * r) continue;
        const thc = Math.sqrt(r * r - d2);
        if (tca + thc < 0) continue;
        const dist = Math.max(0, tca - thc);
        if (dist < bestT) { bestT = dist; best = t; }
      } else {
        _inv.copy(mw).invert();
        _lo.copy(origin).applyMatrix4(_inv);
        const e = _inv.elements;                          // the direction in local space, unnormalised, so `dist` stays in metres
        const sx = dir.x * e[0] + dir.y * e[4] + dir.z * e[8];
        const sy = dir.x * e[1] + dir.y * e[5] + dir.z * e[9];
        const sz = dir.x * e[2] + dir.y * e[6] + dir.z * e[10];
        if (Math.abs(sz) < 1e-6) continue;
        const dist = -_lo.z / sz;
        if (dist <= 0 || dist >= bestT) continue;
        const x = _lo.x + sx * dist, y = _lo.y + sy * dist;
        if (Math.abs(x) > t.width / 2 || Math.abs(y) > t.height / 2) continue;
        bestT = dist; best = t;
      }
    }
    pickDistance = bestT;
    return best;
  }

  function refreshTargets() {
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      t.live = isLive(t.object);
      if (t.live) t.object.updateWorldMatrix(true, false);
    }
  }

  // ---------------------------------------------------------------------------------- WebXR controllers

  const slots = [];
  for (let i = 0; i < 2; i++) {
    const slot = { index: i, ray: renderer.xr.getController(i), grip: renderer.xr.getControllerGrip(i), hand: null, source: null };
    slots.push(slot);
    slot.ray.addEventListener('connected', (event) => {
      const source = event.data;
      let name = source && source.handedness === 'left' ? 'left' : source && source.handedness === 'right' ? 'right' : null;
      if (!name) name = controllers.right.slot < 0 ? 'right' : 'left';     // a pointer with no handedness
      if (controllers[name].slot >= 0 && controllers[name].slot !== i) name = name === 'left' ? 'right' : 'left';
      slot.hand = name; slot.source = source;
      const h = controllers[name];
      h.slot = i; h.source = source; h.connected = true; h.gamepad = source ? source.gamepad || null : null;
      if (callbacks.onConnection) callbacks.onConnection(name, true);
    });
    slot.ray.addEventListener('disconnected', () => {
      const name = slot.hand;
      slot.hand = null; slot.source = null;
      if (!name) return;
      const h = controllers[name];
      if (h.slot !== i) return;
      release(h);
      h.slot = -1; h.source = null; h.connected = false; h.tracked = false; h.gamepad = null;
      h.grip.visible = false; h.line.visible = false;
      setHover(h, null);
      if (callbacks.onConnection) callbacks.onConnection(name, false);
    });
    slot.ray.addEventListener('selectstart', () => { if (slot.hand) selectStart(controllers[slot.hand]); });
    slot.ray.addEventListener('selectend', () => { if (slot.hand) selectEnd(controllers[slot.hand]); });
    slot.ray.addEventListener('squeezestart', () => { if (slot.hand) squeezeStart(controllers[slot.hand]); });
    slot.ray.addEventListener('squeezeend', () => { if (slot.hand) squeezeEnd(controllers[slot.hand]); });
  }

  function emit(name, a, b) {
    const fn = callbacks[name];
    if (!fn) return;
    try { fn(a, b); } catch (err) { console.error('[wishworld] ' + name + ' failed', err); }
  }

  function selectStart(h) {
    if (h.selecting) return;
    h.selecting = true;
    const t = state.pointersEnabled ? h.hover : null;
    if (t && t.onClick) {
      h.consumed = true;
      try { t.onClick(h.name, t.object); } catch (err) { console.error('[wishworld] click handler failed', err); }
    } else {
      h.consumed = false;
      emit('onSelectStart', h.name, h);
    }
  }
  function selectEnd(h) {
    if (!h.selecting) return;
    h.selecting = false;
    if (!h.consumed) emit('onSelectEnd', h.name, h);
    h.consumed = false;
  }
  function squeezeStart(h) { if (h.squeezing) return; h.squeezing = true; emit('onSqueezeStart', h.name, h); }
  function squeezeEnd(h) { if (!h.squeezing) return; h.squeezing = false; emit('onSqueezeEnd', h.name, h); }

  /** Let go of everything a hand holds (controller lost, session ended, window lost focus). */
  function release(h) {
    selectEnd(h); squeezeEnd(h);
    if (h.prevPrimary) { h.prevPrimary = false; emit('onButtonUp', h.name, h.name === 'right' ? 'a' : 'x'); }
    if (h.prevSecondary) { h.prevSecondary = false; emit('onButtonUp', h.name, h.name === 'right' ? 'b' : 'y'); }
    if (h.prevStick) { h.prevStick = false; emit('onButtonUp', h.name, 'stick'); }
    h.primary = h.secondary = h.stickPressed = false; h.trigger = h.squeeze = 0;
  }
  function releaseAll() { release(controllers.left); release(controllers.right); state.keys.clear(); }

  function buttonEdges(h) {
    if (h.primary !== h.prevPrimary) { h.prevPrimary = h.primary; emit(h.primary ? 'onButtonDown' : 'onButtonUp', h.name, h.name === 'right' ? 'a' : 'x'); }
    if (h.secondary !== h.prevSecondary) { h.prevSecondary = h.secondary; emit(h.secondary ? 'onButtonDown' : 'onButtonUp', h.name, h.name === 'right' ? 'b' : 'y'); }
    if (h.stickPressed !== h.prevStick) { h.prevStick = h.stickPressed; emit(h.stickPressed ? 'onButtonDown' : 'onButtonUp', h.name, 'stick'); }
  }

  function updateXRHand(h) {
    const slot = h.slot >= 0 ? slots[h.slot] : null;
    const tracked = Boolean(slot && slot.ray.visible);
    h.tracked = tracked;
    h.grip.visible = tracked;                       // hidden while that controller is not tracked, as in Unity
    if (!tracked) { h.line.visible = false; setHover(h, null); if (!h.connected) return; }
    if (tracked) {
      h.ray.position.copy(slot.ray.position); h.ray.quaternion.copy(slot.ray.quaternion);
      if (slot.grip.visible) { h.grip.position.copy(slot.grip.position); h.grip.quaternion.copy(slot.grip.quaternion); }
      else { h.grip.position.copy(slot.ray.position); h.grip.quaternion.copy(slot.ray.quaternion); }
      h.ray.updateWorldMatrix(true, false); h.grip.updateWorldMatrix(true, false);
      h.origin.setFromMatrixPosition(h.ray.matrixWorld);
      h.direction.set(0, 0, -1).transformDirection(h.ray.matrixWorld);
    }
    const gp = h.source ? h.source.gamepad : null;
    h.gamepad = gp || null;
    if (gp && gp.buttons) {
      const b = gp.buttons;
      h.trigger = b[0] ? b[0].value : 0;
      h.squeeze = b[1] ? b[1].value : 0;
      h.stickPressed = Boolean(b[3] && b[3].pressed);
      h.primary = Boolean(b[4] && b[4].pressed);
      h.secondary = Boolean(b[5] && b[5].pressed);
      const ax = gp.axes || [];
      h.stick.x = ax.length >= 4 ? ax[2] : (ax[0] || 0);
      h.stick.y = ax.length >= 4 ? ax[3] : (ax[1] || 0);
    } else {
      h.trigger = h.selecting ? 1 : 0; h.squeeze = h.squeezing ? 1 : 0;
      h.primary = h.secondary = h.stickPressed = false; h.stick.x = h.stick.y = 0;
    }
    buttonEdges(h);
  }

  function updatePointer(h) {
    if (!h.tracked || !state.pointersEnabled) { setHover(h, null); h.line.visible = false; return; }
    // Menus win over creatures: a shark drifting past must not block a button.
    let t = pick(h.origin, h.direction, true);
    if (!t) t = pick(h.origin, h.direction, false);
    setHover(h, t);
    if (t) {
      h.hitDistance = pickDistance;
      h.hit.copy(h.direction).multiplyScalar(pickDistance).add(h.origin);
      drawLine(h, h.origin, h.hit);
    } else h.line.visible = false;
  }

  function drawLine(h, from, to) {
    const len = from.distanceTo(to);
    if (len < 0.01) { h.line.visible = false; return; }
    h.line.visible = true;
    h.line.position.copy(from);
    _p.copy(to).sub(from).multiplyScalar(1 / len);
    h.line.quaternion.setFromUnitVectors(FORWARD, _p);
    h.line.scale.set(1, 1, len);
  }

  // Pushing a controller into a button also presses it.
  function updatePoke(h) {
    h.pokeNow.clear();
    if (h.tracked && state.pointersEnabled) {
      _c.setFromMatrixPosition(h.grip.matrixWorld).addScaledVector(h.direction, 0.04);
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        if (!t.live || !t.enabled || !t.ui || !t.button) continue;
        _inv.copy(t.object.matrixWorld).invert();
        _lo.copy(_c).applyMatrix4(_inv);
        if (Math.abs(_lo.x) > t.width / 2 + 0.03 || Math.abs(_lo.y) > t.height / 2 + 0.03 || Math.abs(_lo.z) > t.depth / 2 + 0.03) continue;
        h.pokeNow.add(t);
        if (!h.poked.has(t)) {
          h.poked.add(t);
          if (t.onClick) { try { t.onClick(h.name, t.object); } catch (err) { console.error(err); } }
          haptic(h.name, 0.4, 40);
        }
      }
    }
    for (const t of h.poked) if (!h.pokeNow.has(t)) h.poked.delete(t);
  }

  // ---------------------------------------------------------------------------------- desktop preview

  const desk = {
    yaw: 0, pitch: 0, pos: new THREE.Vector3(0, 1.6, 0), ndcX: 0, ndcY: 0, inside: false,
    looking: false, lookButton: -1, lastX: 0, lastY: 0, moved: 0, leftActive: false,
    pads: { left: fakeGamepad(), right: fakeGamepad() },
    locked: false,                    // the mouse is captured (pointer lock): look with it, aim at the centre
    joy: { id: null, ox: 0, oy: 0, x: 0, y: 0 },   // the on-screen move stick (touch)
    pad: { index: -1, prev: [], lx: 0, ly: 0, rx: 0, ry: 0, used: 0 },   // a game controller, when one is used
  };
  const JOY_RADIUS = 60;              // px the stick can be pushed
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  function activeHand() { return desk.leftActive ? controllers.left : controllers.right; }

  function pointerPos(event) {
    if (desk.locked) { desk.ndcX = 0; desk.ndcY = 0; return; }
    const rect = dom.getBoundingClientRect();
    desk.ndcX = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    desk.ndcY = -(((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1);
  }

  /** Play mode, touch: the lower left of the screen is the move stick. */
  function inJoystickZone(event) {
    const rect = dom.getBoundingClientRect();
    return event.clientX - rect.left < rect.width * 0.42 && event.clientY - rect.top > rect.height * 0.45;
  }

  function overTarget(event) {
    pointerPos(event);
    updateDesktopPointer();
    return Boolean(activeHand().hover);
  }

  function onPointerDown(event) {
    if (!state.desktop) return;
    if (state.play && event.pointerType === 'mouse' && !desk.locked && !overTarget(event)) {
      // A click on open space captures the mouse; it does not also press the trigger. (A click on a menu button
      // while the mouse is free still presses the button.)
      try { const r = dom.requestPointerLock && dom.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch { /* not allowed here */ }
      event.preventDefault();
      return;
    }
    if (state.play && event.pointerType === 'touch' && desk.joy.id === null && inJoystickZone(event)) {
      desk.joy.id = event.pointerId; desk.joy.ox = event.clientX; desk.joy.oy = event.clientY; desk.joy.x = 0; desk.joy.y = 0;
      try { dom.setPointerCapture(event.pointerId); } catch { /* fine */ }
      if (callbacks.onJoystick) callbacks.onJoystick({ active: true, x: event.clientX, y: event.clientY, dx: 0, dy: 0 });
      event.preventDefault();
      return;
    }
    if (desk.locked) {
      desk.ndcX = 0; desk.ndcY = 0;
      const h = activeHand();
      if (event.button === 0) { updateDesktopPointer(); selectStart(h); }
      else if (event.button === 2) squeezeStart(h);
      event.preventDefault();
      return;
    }
    pointerPos(event);
    desk.lastX = event.clientX; desk.lastY = event.clientY; desk.moved = 0;
    try { dom.setPointerCapture(event.pointerId); } catch { /* not capturable */ }
    const h = activeHand();
    if (event.button === 0) {
      updateDesktopPointer();                       // hover what is under the cursor right now
      const onTarget = Boolean(h.hover);
      selectStart(h);
      if (!onTarget && state.desktopLookEnabled) { desk.looking = true; desk.lookButton = 0; }
    } else if (event.button === 2) {
      squeezeStart(h);
      desk.looking = true; desk.lookButton = 2;
    } else if (event.button === 1) { desk.looking = true; desk.lookButton = 1; }
    event.preventDefault();
  }

  function onPointerMove(event) {
    if (!state.desktop) return;
    if (desk.joy.id !== null && event.pointerId === desk.joy.id) {
      let dx = event.clientX - desk.joy.ox, dy = event.clientY - desk.joy.oy;
      const len = Math.hypot(dx, dy);
      if (len > JOY_RADIUS) { dx *= JOY_RADIUS / len; dy *= JOY_RADIUS / len; }
      desk.joy.x = dx / JOY_RADIUS; desk.joy.y = dy / JOY_RADIUS;
      if (callbacks.onJoystick) callbacks.onJoystick({ active: true, x: desk.joy.ox, y: desk.joy.oy, dx, dy });
      return;
    }
    if (desk.locked) {
      desk.yaw -= (event.movementX || 0) * 0.0022;
      desk.pitch = Math.max(-1.48, Math.min(1.48, desk.pitch - (event.movementY || 0) * 0.0022));
      return;
    }
    pointerPos(event);
    desk.inside = true;
    if (desk.looking) {
      const dx = event.clientX - desk.lastX, dy = event.clientY - desk.lastY;
      desk.lastX = event.clientX; desk.lastY = event.clientY;
      desk.moved += Math.abs(dx) + Math.abs(dy);
      desk.yaw -= dx * 0.0035;
      desk.pitch = Math.max(-1.48, Math.min(1.48, desk.pitch - dy * 0.0035));
    }
  }

  function onPointerUp(event) {
    if (!state.desktop) return;
    if (desk.joy.id !== null && event.pointerId === desk.joy.id) {
      desk.joy.id = null; desk.joy.x = 0; desk.joy.y = 0;
      if (callbacks.onJoystick) callbacks.onJoystick({ active: false });
      try { dom.releasePointerCapture(event.pointerId); } catch { /* fine */ }
      return;
    }
    const h = activeHand();
    if (event.button === 0) { selectEnd(controllers.left); selectEnd(controllers.right); }
    if (event.button === 2) { squeezeEnd(controllers.left); squeezeEnd(controllers.right); }
    if (event.button === desk.lookButton) { desk.looking = false; desk.lookButton = -1; }
    try { dom.releasePointerCapture(event.pointerId); } catch { /* fine */ }
    void h;
  }

  const KEY_BUTTONS = {
    KeyV: ['right', 'primary'], KeyF: ['right', 'primary'], Space: ['right', 'primary'], KeyC: ['right', 'secondary'],
    KeyX: ['left', 'primary'], KeyR: ['left', 'secondary'],
    // a game controller's face buttons (see pollGamepad)
    PadA: ['right', 'primary'], PadB: ['right', 'secondary'], PadX: ['left', 'primary'], PadY: ['left', 'secondary'],
  };

  function onKeyDown(event) {
    if (!state.desktop) return;
    const tag = event.target && event.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.repeat) { if (event.code === 'Tab' || event.code.startsWith('Arrow') || event.code === 'Space') event.preventDefault(); return; }
    state.keys.add(event.code);
    if (event.code === 'KeyG') squeezeStart(activeHand());
    if (event.code === 'ShiftLeft') desk.leftActive = true;
    if (callbacks.onKey) { try { if (callbacks.onKey(event.code, event) === true) event.preventDefault(); } catch (err) { console.error(err); } }
    if (event.code === 'Tab' || event.code.startsWith('Arrow') || event.code === 'Space') event.preventDefault();
  }

  function onKeyUp(event) {
    state.keys.delete(event.code);
    if (event.code === 'KeyG') { squeezeEnd(controllers.left); squeezeEnd(controllers.right); }
    if (event.code === 'ShiftLeft') desk.leftActive = false;
  }

  dom.addEventListener('pointerdown', onPointerDown);
  dom.addEventListener('pointermove', onPointerMove);
  dom.addEventListener('pointerup', onPointerUp);
  dom.addEventListener('pointercancel', onPointerUp);
  dom.addEventListener('contextmenu', (event) => event.preventDefault());
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => { if (state.desktop) { releaseAll(); desk.looking = false; desk.leftActive = false; } });
  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === dom;
    if (locked === desk.locked) return;
    desk.locked = locked;
    if (!locked) { releaseAll(); desk.looking = false; }
    desk.ndcX = 0; desk.ndcY = 0;
    if (callbacks.onLockChange) { try { callbacks.onLockChange(locked); } catch (err) { console.error(err); } }
  });

  /** A standard game controller: left stick moves, right stick looks, triggers and face buttons act. */
  const PAD_EDGES = [
    [7, (down, h) => { if (down) { desk.ndcX = 0; desk.ndcY = 0; updateDesktopPointer(); selectStart(h); } else { selectEnd(controllers.left); selectEnd(controllers.right); } }],
    [6, (down, h) => { if (down) squeezeStart(h); else { squeezeEnd(controllers.left); squeezeEnd(controllers.right); } }],
    [5, (down, h) => { if (down) squeezeStart(h); else { squeezeEnd(controllers.left); squeezeEnd(controllers.right); } }],
    [0, (down) => { if (down) state.keys.add('PadA'); else state.keys.delete('PadA'); }],
    [1, (down) => { if (down) state.keys.add('PadB'); else state.keys.delete('PadB'); }],
    [2, (down) => { if (down) state.keys.add('PadX'); else state.keys.delete('PadX'); }],
    [3, (down) => { if (down) state.keys.add('PadY'); else state.keys.delete('PadY'); }],
    [9, (down) => { if (down && callbacks.onKey) callbacks.onKey('KeyM', null); }],
  ];
  function pollGamepad() {
    const pad = desk.pad;
    let gp = null;
    try {
      const list = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const g of list) { if (g && g.connected && g.mapping === 'standard') { gp = g; break; } }
    } catch { gp = null; }
    if (!gp) { pad.lx = pad.ly = pad.rx = pad.ry = 0; return; }
    const dead = (v) => (Math.abs(v) < 0.15 ? 0 : v);
    pad.lx = dead(gp.axes[0] || 0); pad.ly = dead(gp.axes[1] || 0);
    pad.rx = dead(gp.axes[2] || 0); pad.ry = dead(gp.axes[3] || 0);
    const h = activeHand();
    for (const [index, act] of PAD_EDGES) {
      const b = gp.buttons[index];
      const down = Boolean(b && (b.pressed || b.value > 0.5));
      if (down !== Boolean(pad.prev[index])) { pad.prev[index] = down; act(down, h); pad.used = 1; }
    }
    if (pad.lx || pad.ly || pad.rx || pad.ry) pad.used = 1;
    if (pad.used && !desk.inside) { desk.ndcX = 0; desk.ndcY = 0; }
  }

  function updateDesktopHead(dt) {
    const k = state.keys;
    if (k.has('ArrowLeft')) desk.yaw += dt * 1.6;
    if (k.has('ArrowRight')) desk.yaw -= dt * 1.6;
    if (k.has('ArrowUp')) desk.pitch = Math.min(1.48, desk.pitch + dt * 1.2);
    if (k.has('ArrowDown')) desk.pitch = Math.max(-1.48, desk.pitch - dt * 1.2);
    if (desk.pad.rx || desk.pad.ry) {
      desk.yaw -= desk.pad.rx * dt * 2.4;
      desk.pitch = Math.max(-1.48, Math.min(1.48, desk.pitch - desk.pad.ry * dt * 1.8));
    }
    if (state.desktopMoveEnabled) {
      let mx = desk.joy.x + desk.pad.lx, my = 0, mz = desk.joy.y + desk.pad.ly;
      if (k.has('KeyW')) mz -= 1;
      if (k.has('KeyS')) mz += 1;
      if (k.has('KeyD')) mx += 1;
      if (k.has('KeyA')) mx -= 1;
      if (!state.play && k.has('KeyE')) my += 1;     // flying up and down is for the preview only
      if (!state.play && k.has('KeyQ')) my -= 1;
      const len = Math.hypot(mx, mz);
      if (len > 1) { mx /= len; mz /= len; }
      if (mx || my || mz) {
        _p.set(mx, 0, mz).applyAxisAngle(UP, desk.yaw).multiplyScalar(2 * dt);
        desk.pos.x += _p.x; desk.pos.z += _p.z;
        desk.pos.y = Math.max(0.3, Math.min(3, desk.pos.y + my * 2 * dt));
      }
    }
    camera.position.copy(desk.pos);
    camera.rotation.set(desk.pitch, desk.yaw, 0, 'YXZ');
    rig.object.updateMatrixWorld(true);
  }

  function updateDesktopPointer() {
    const h = activeHand();
    const other = desk.leftActive ? controllers.right : controllers.left;
    ndc.set(desk.ndcX, desk.ndcY);
    raycaster.setFromCamera(ndc, camera);
    _origin.copy(raycaster.ray.origin); _dir.copy(raycaster.ray.direction);

    let t = null;
    if (state.pointersEnabled) {
      t = pick(_origin, _dir, true);
      if (!t) t = pick(_origin, _dir, false);
    }
    const dist = t ? pickDistance : 2.5;
    h.hit.copy(_dir).multiplyScalar(dist).add(_origin);
    h.hitDistance = dist;
    setHover(h, t);
    setHover(other, null);

    // Hand poses, in rig space (the rig may be turned by a recentre).
    _m.copy(rig.object.matrixWorld).invert();
    const side = desk.leftActive ? -1 : 1;
    if (state.desktopPointerMode) {
      // Held low, as a hand would be, aiming at whatever is under the cursor.
      h.grip.position.set(side * 0.2, -0.3, -0.36).applyAxisAngle(UP, desk.yaw).add(desk.pos);
      _p.copy(h.hit).applyMatrix4(_m);
      _m.lookAt(h.grip.position, _p, UP);
      h.grip.quaternion.setFromRotationMatrix(_m);
    } else {
      // On the ray through the cursor, pointing along it (blades, reaching).
      _p.copy(_dir).transformDirection(_m);
      h.grip.position.copy(desk.pos).addScaledVector(_p, state.reach);
      h.grip.quaternion.setFromUnitVectors(FORWARD, _p);
    }
    h.ray.position.copy(h.grip.position); h.ray.quaternion.copy(h.grip.quaternion);
    other.grip.position.set(-side * 0.24, -0.38, -0.32).applyAxisAngle(UP, desk.yaw).add(desk.pos);
    other.grip.quaternion.setFromEuler(_e.set(20 * Math.PI / 180, desk.yaw, 0, 'YXZ'));
    other.ray.position.copy(other.grip.position); other.ray.quaternion.copy(other.grip.quaternion);

    for (const name of HANDS) {
      const c = controllers[name];
      c.connected = true; c.tracked = true; c.grip.visible = true;
      c.grip.updateWorldMatrix(true, false); c.ray.updateWorldMatrix(true, false);
      c.origin.setFromMatrixPosition(c.ray.matrixWorld);
      c.direction.set(0, 0, -1).transformDirection(c.ray.matrixWorld);
    }
    if (t) drawLine(h, h.origin, h.hit); else h.line.visible = false;
    other.line.visible = false;
  }

  function updateDesktopButtons() {
    const k = state.keys;
    for (const name of HANDS) {
      const h = controllers[name], pad = desk.pads[name];
      const active = h === activeHand();
      let primary = false, secondary = false;
      for (const code in KEY_BUTTONS) {
        if (!k.has(code)) continue;
        const [hand, which] = KEY_BUTTONS[code];
        if (hand !== name) continue;
        if (which === 'primary') primary = true; else secondary = true;
      }
      h.trigger = h.selecting ? 1 : 0;
      h.squeeze = h.squeezing ? 1 : 0;
      h.primary = primary; h.secondary = secondary; h.stickPressed = false;
      h.stick.x = active ? (k.has('KeyL') ? 1 : 0) - (k.has('KeyJ') ? 1 : 0) : 0;
      h.stick.y = active ? (k.has('KeyK') ? 1 : 0) - (k.has('KeyI') ? 1 : 0) : 0;
      pad.buttons[0].pressed = h.selecting; pad.buttons[0].value = h.trigger;
      pad.buttons[1].pressed = h.squeezing; pad.buttons[1].value = h.squeeze;
      pad.buttons[4].pressed = primary; pad.buttons[4].value = primary ? 1 : 0;
      pad.buttons[5].pressed = secondary; pad.buttons[5].value = secondary ? 1 : 0;
      pad.axes[2] = h.stick.x; pad.axes[3] = h.stick.y;
      h.gamepad = pad;
      buttonEdges(h);
    }
  }

  // ---------------------------------------------------------------------------------- shared

  /** A short vibration. hand: 'left' | 'right' | 'both'; strength 0..1; ms. Silent where unsupported. */
  function haptic(hand, strength = 0.5, ms = 40) {
    if (hand === 'both') { haptic('left', strength, ms); haptic('right', strength, ms); return; }
    const h = controllers[hand];
    const gp = h && h.source ? h.source.gamepad : null;
    if (!gp) return;
    const s = Math.max(0, Math.min(1, strength)), d = Math.max(1, ms);
    try {
      const act = gp.hapticActuators && gp.hapticActuators[0];
      if (act && typeof act.pulse === 'function') { act.pulse(s, d); return; }
      const vib = gp.vibrationActuator;
      if (vib && typeof vib.playEffect === 'function') vib.playEffect('dual-rumble', { duration: d, strongMagnitude: s, weakMagnitude: s });
    } catch { /* no haptics on this device */ }
  }

  /** Call when the mode changes (session started or ended). */
  function setDesktop(on) {
    releaseAll();
    state.desktop = on;
    for (const name of HANDS) {
      const h = controllers[name];
      setHover(h, null);
      h.line.visible = false; h.poked.clear();
      if (on) { h.slot = -1; h.source = null; }
      else { h.connected = false; h.tracked = false; h.grip.visible = false; h.gamepad = null; }
    }
    if (!on) {
      // Controllers that were already connected before this point keep their slots.
      for (const slot of slots) {
        if (slot.hand && slot.source) {
          const h = controllers[slot.hand];
          h.slot = slot.index; h.source = slot.source; h.connected = true;
        }
      }
    }
  }

  /** Desktop: put the head back at standing height over the rig origin, looking ahead. */
  function resetDesktopHead(eyeHeight = 1.6) {
    desk.pos.set(0, eyeHeight, 0); desk.yaw = 0; desk.pitch = 0;
    camera.position.copy(desk.pos); camera.rotation.set(0, 0, 0, 'YXZ');
    rig.object.updateMatrixWorld(true);
  }

  function update(dt) {
    refreshTargets();
    if (state.desktop) {
      pollGamepad();
      updateDesktopHead(dt);
      updateDesktopPointer();
      updateDesktopButtons();
    } else {
      rig.object.updateMatrixWorld(true);
      for (const name of HANDS) {
        const h = controllers[name];
        updateXRHand(h);
        updatePointer(h);
        updatePoke(h);
      }
    }
  }

  /** Swap the primitive controller for the exported Unity mesh when the manifest has one. */
  async function adoptControllerModel() {
    try {
      const manifest = await loadManifest();
      const entry = manifest.get('controller');
      if (!entry || !entry.file) return false;
      for (const name of HANDS) {
        const model = await loadGLB('/models/' + entry.file);
        model.name = 'ControllerVisual';
        model.rotation.y = Math.PI;                 // exported pointing +Z; a WebXR grip points along -Z
        const h = controllers[name];
        h.grip.remove(h.visual);
        h.visual = model;
        h.grip.add(model);
      }
      return true;
    } catch (err) {
      console.warn('[wishworld] keeping the built-in controller shape', err && err.message);
      return false;
    }
  }

  return {
    controllers, callbacks, state, addTarget, removeTarget, haptic, update, setDesktop, resetDesktopHead, releaseAll,
    adoptControllerModel,
    /** "Play in browser" on or off (desktop only). Off also lets go of a captured mouse. */
    setPlay(on) {
      state.play = Boolean(on);
      if (!state.play) {
        if (document.pointerLockElement === dom) { try { document.exitPointerLock(); } catch { /* fine */ } }
        desk.joy.id = null; desk.joy.x = 0; desk.joy.y = 0;
      }
    },
    /** Capture the mouse for first-person look (needs a click or key press to be allowed). */
    lockPointer() { try { const r = dom.requestPointerLock && dom.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch { /* not allowed */ } },
    /** On-screen buttons: 'a' (talk), 'grip', 'trigger' pressed or let go. */
    press(name, down) {
      const h = activeHand();
      if (name === 'a') { if (down) state.keys.add('PadA'); else state.keys.delete('PadA'); }
      else if (name === 'grip') { if (down) squeezeStart(h); else { squeezeEnd(controllers.left); squeezeEnd(controllers.right); } }
      else if (name === 'trigger') { if (down) { updateDesktopPointer(); selectStart(h); } else { selectEnd(controllers.left); selectEnd(controllers.right); } }
    },
    /** The target a hand's pointer is on (or null) and where the ray meets it. */
    hovered(hand) { return controllers[hand] && controllers[hand].hover ? controllers[hand].hover.object : null; },
    desk,
    sharedMaterial: sharedVertexLit,
  };
}

export { PRESS };
