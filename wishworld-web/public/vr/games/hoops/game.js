// Snow Hoops: a Wii Sports Resort style 3-point contest where the ball is a toy the child scanned.
//
//   pick     "Pick your ball": the room's saved companions, Bubby, or "Scan something new" (/vr/core/toyscan.js)
//   round    5 racks x 5 balls at 5 spots on the arc; the 5th ball of each rack is the gold money ball (2 points).
//            Hold grip by the rack to take a ball, swing, let go to throw. A white fade moves the player on.
//   results  score, baskets, best; Play again or Home
//
// Frames: the tab's group is the shell's world. `world` (a child) is the court frame of rules.js; it is the
// identity in VR and on a desktop, where the player is moved to each spot with the rig (rig.setHome). In AR the
// real room cannot move, so the court is turned and moved around the player instead.
//
// Dev only (localhost or the dev harness): ?autoplay=1 picks a ball and shoots by itself (?autoplay=perfect never
// misses), ?round=12 shortens the round, ?standins=1 plays without the server (Bubby and a 19k-triangle stand-in
// scan). window.__hoops has the checks used by dev/check.mjs.

import * as THREE from 'three';
import { COURT, BALL, PHYSICS, THROW, CONTEST, HAPTIC, VOLUME, LAYOUT, COLORS, TEXT } from './rules.js';
import { makeCourt, makeBall, launchBall, advance, isSettled, idealVelocity, assistThrow, yawVelocity, HIT } from './physics.js';
import { createContest } from './contest.js';
import { createTracker } from './tracker.js';
import { createCourt } from './court.js';
import { createSfx } from './sfx.js';
import { createSparkles } from './fx.js';
import { createCrowd, crowdSpots } from './crowd.js';
import { createHud } from './hud.js';
import { listChoices, createBallCache } from './balls.js';
import { makeRack } from './ballshape.js';
import { createToyScan } from '/vr/core/toyscan.js';
import { createSnowfall, dotTexture } from '/vr/core/fx.js';

const UP = new THREE.Vector3(0, 1, 0);
const DEG = Math.PI / 180;
const PREVIEW_DOTS = 20;

function isDev(ctx) {
  if (ctx.dev && ctx.dev.harness) return true;
  return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
}

export function createSnowHoops(ctx) {
  const dev = isDev(ctx);
  const query = new URLSearchParams(location.search);
  const autoMode = dev && query.get('autoplay') && query.get('autoplay') !== '0' ? query.get('autoplay') : null;
  const roundSeconds = dev && Number(query.get('round')) > 0 ? Number(query.get('round')) : CONTEST.roundSeconds;
  const standIns = dev && query.get('standins') === '1';
  const muted = Boolean(ctx.params && typeof ctx.params.get === 'function' && ctx.params.get('mute') === '1');
  const log = (what, detail) => console.info('[hoops] ' + what + (detail !== undefined ? ' ' + detail : ''));

  // ---- scene ---------------------------------------------------------------------------------------------------
  const group = new THREE.Group();
  group.name = 'SnowHoops';
  const world = new THREE.Group();
  world.name = 'HoopsWorld';
  group.add(world);
  const invWorld = new THREE.Matrix4();

  const pc = makeCourt(COURT, BALL, PHYSICS);
  const court = createCourt(pc, COURT, COLORS);
  world.add(court.group);
  const snow = createSnowfall({ count: 260 });
  snow.position.set(COURT.hoop[0], 4.5, COURT.hoop[2] + 2.5);
  world.add(snow);
  const sparkles = createSparkles();
  world.add(sparkles.points);
  const sfx = createSfx(ctx, { muted });
  const crowd = createCrowd(crowdSpots(COURT.hoop), { x: COURT.hoop[0], z: COURT.hoop[2] + COURT.arcRadius * 0.6 });
  world.add(crowd.group);

  // the desktop's dotted aim line: the first part of the flight only
  const aimPos = new Float32Array(PREVIEW_DOTS * 3);
  const aimGeo = new THREE.BufferGeometry();
  aimGeo.setAttribute('position', new THREE.BufferAttribute(aimPos, 3));
  const aimDots = new THREE.Points(aimGeo, new THREE.PointsMaterial({ map: dotTexture(), color: new THREE.Color().setRGB(...COLORS.ice, THREE.SRGBColorSpace), size: 0.03, transparent: true, opacity: 0.9, depthWrite: false }));
  aimDots.name = 'HoopsAim'; aimDots.frustumCulled = false; aimDots.visible = false;
  world.add(aimDots);

  const hud = createHud(ctx, {
    parent: group,
    onPick: (choice) => pick(choice),
    onScan: () => scan(),
    onHome: () => goHome(),
    onAgain: () => startRound(),
  });
  world.add(hud.board);              // the scoreboard belongs to the court

  const balls = createBallCache(ctx, { size: BALL.size });
  const contest = createContest(CONTEST, roundSeconds);
  const trackers = { left: createTracker(THROW.trackSamples), right: createTracker(THROW.trackSamples) };

  // ---- state ---------------------------------------------------------------------------------------------------
  let phase = 'off';                 // 'off' | 'loading' | 'pick' | 'scan' | 'round' | 'results'
  let active = false, clock = 0, enterId = 0;
  let choices = [], chosen = null;   // chosen: the ball cache entry
  let slots = [];                    // one per ball of a rack: { obj, sim, state: 'rack'|'held'|'air'|'gone', ball, hand, axis, rate }
  let visibleOnRack = CONTEST.perRack;
  let spot = 2, moving = false, readyIn = 0, side = 1, waist = 0.9;
  let best = 0, autoIn = 0, autoPickIn = 0, boardDirty = true, shownSecond = -1;
  let unsubscribeGifts = null;
  const held = { left: null, right: null, desk: null };
  const spoken = [];
  const rackFront = new THREE.Vector3(), rackDir = new THREE.Vector3(), spotPoint = new THREE.Vector3(), toHoop = new THREE.Vector3();
  let perfPeakCalls = 0, perfPeakTris = 0;
  try { best = parseInt(localStorage.getItem(CONTEST.bestKey) || '0', 10) || 0; } catch { best = 0; }

  // scratch (no allocation per frame)
  const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _head = new THREE.Vector3(), _fwd = new THREE.Vector3(), _right = new THREE.Vector3();
  const _q = new THREE.Quaternion(), _vel = { x: 0, y: 0, z: 0 }, _out = { x: 0, y: 0, z: 0 }, _ideal = { x: 0, y: 0, z: 0 };
  const _dots = new Array(CONTEST.perRack).fill(0);
  const assistOpts = { amount: THROW.assist, cone: THROW.assistCone, minSpeed: THROW.assistMinSpeed, elevation: THROW.idealElevation };

  function say(line) {
    spoken.push(line);
    try { if (typeof ctx.say === 'function') ctx.say(line); else ctx.audio.speak(line); } catch { /* silence is fine */ }
  }
  function haptic(hand, pulse) {
    if (hand !== 'left' && hand !== 'right') return;
    try { ctx.haptic(hand, pulse[0], pulse[1]); } catch { /* no haptics */ }
  }
  /** A court-frame point as a world Vector3 (for sounds). */
  const toWorld = (x, y, z) => _w.set(x, y, z).applyMatrix4(world.matrixWorld);

  // ---- placing the player (or, in AR, the court) -------------------------------------------------------------
  function placeAt(index) {
    spot = index;
    const s = pc.spots[index];
    spotPoint.set(s.x, 0, s.z);
    toHoop.set(pc.rim.x - s.x, 0, pc.rim.z - s.z).normalize();
    const ar = typeof ctx.isAR === 'function' && ctx.isAR();
    if (!ar) {
      world.position.set(0, 0, 0); world.rotation.set(0, 0, 0);
      world.updateMatrixWorld(true);
      if (ctx.rig && typeof ctx.rig.setHome === 'function') ctx.rig.setHome(spotPoint, toHoop, false);
    } else {
      // the room is real: turn and move the court so this spot is under the viewer, the hoop ahead of them
      ctx.viewerPosition(_head);
      flatForward(_fwd);
      const yaw = Math.atan2(_fwd.x, _fwd.z) - Math.atan2(toHoop.x, toHoop.z);
      world.rotation.set(0, yaw, 0);
      _v.copy(spotPoint).applyAxisAngle(UP, yaw);
      world.position.set(_head.x - _v.x, ctx.rig ? ctx.rig.floorY() : 0, _head.z - _v.z);
      world.updateMatrixWorld(true);
    }
    invWorld.copy(world.matrixWorld).invert();
    // the rack: waist height, beside the dominant hand, a little ahead; the queue runs outward and slightly back
    ctx.viewerPosition(_head).applyMatrix4(invWorld);
    const L = LAYOUT.rack;
    waist = Math.min(L.waistMax, Math.max(L.waistMin, _head.y * L.waistOfHead));
    placeRack();
    court.markSpot(index);
    hud.faceBoard(spotPoint);
    trackers.left.clear(); trackers.right.clear();
  }
  function placeRack() {
    const L = LAYOUT.rack;
    _right.set(-toHoop.z, 0, toHoop.x);                       // the player's right, facing the hoop
    rackFront.copy(spotPoint).addScaledVector(_right, side * L.side).addScaledVector(toHoop, L.ahead);
    rackFront.y = waist;
    rackDir.copy(_right).multiplyScalar(side).addScaledVector(toHoop, -0.35).normalize();
  }
  function flatForward(out) {
    if (ctx.rig && typeof ctx.rig.viewerForwardFlat === 'function') ctx.rig.viewerForwardFlat(out);
    else { ctx.viewerForward(out); out.y = 0; }
    if (out.lengthSq() < 1e-4) out.set(0, 0, -1);
    return out.normalize();
  }
  function fadeThen(fn) {
    const rig = ctx.rig;
    if (!rig || typeof rig.fadeTo !== 'function' || (typeof ctx.isAR === 'function' && ctx.isAR())) { fn(); return; }
    const mine = enterId;
    rig.fadeTo(1, CONTEST.fadeOut).then(() => {
      if (!active || mine !== enterId) return;
      fn();
      rig.fadeTo(0, CONTEST.fadeIn);
    });
  }

  // ---- the balls ----------------------------------------------------------------------------------------------
  function setBall(entry) {
    for (const s of slots) world.remove(s.obj);
    chosen = entry;
    const visuals = makeRack(entry.ball, CONTEST.perRack);
    entry.gold.apply(visuals[CONTEST.perRack - 1]);        // the money ball: the same model, the shared gold set
    slots = visuals.map((obj, i) => {
      obj.name = i === CONTEST.perRack - 1 ? 'HoopsMoneyBall' : 'HoopsBall';
      obj.visible = false;
      world.add(obj);
      return { obj, sim: makeBall(), state: 'gone', ball: null, hand: null, axis: new THREE.Vector3(1, 0, 0), rate: 0 };
    });
    // Quest 2: a scan can be ~19k triangles. Show only as many rack balls at once as the budget allows.
    visibleOnRack = Math.max(2, Math.min(CONTEST.perRack, Math.floor(BALL.rackTriangleBudget / Math.max(1, entry.triangles))));
    log('ball', `${entry.label}: ${entry.triangles} triangles, ${visibleOnRack} on the rack at once`);
  }

  function refillRack() {
    for (const s of slots) { s.state = 'rack'; s.ball = null; s.hand = null; s.obj.visible = false; s.obj.quaternion.identity(); }
    layoutRack(1);
  }
  /** Rack balls glide to their places in the queue; k = 1 snaps them. */
  function layoutRack(k) {
    const taken = contest.taken, L = LAYOUT.rack;
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (s.state !== 'rack') continue;
      const q = i - taken;
      s.obj.visible = q >= 0 && q < visibleOnRack && phase === 'round';
      _v.copy(rackFront).addScaledVector(rackDir, Math.max(0, q) * L.spacing);
      _v.y += Math.max(0, q) * L.rise;
      if (k >= 1) s.obj.position.copy(_v); else s.obj.position.lerp(_v, k);
    }
  }
  const frontSlot = () => { const s = slots[contest.taken]; return s && s.state === 'rack' ? s : null; };

  function takeBall(hand) {
    const s = frontSlot();
    if (!s) return null;
    const b = contest.take();
    if (!b) return null;
    s.state = 'held'; s.ball = b; s.hand = hand; s.obj.visible = true;
    held[hand] = s;
    sfx.play('pop', VOLUME.grab, toWorld(s.obj.position.x, s.obj.position.y, s.obj.position.z));
    haptic(hand, HAPTIC.grab);
    if (b.money) say(TEXT.money);
    boardDirty = true;
    return s;
  }

  /** Let go of a held ball at court-frame point p with velocity v (court frame). `boost` scales a real hand's throw. */
  function release(s, hand, px, py, pz, vx, vy, vz, boost = 1) {
    held[hand] = null;
    const speed = Math.hypot(vx, vy, vz);
    if (speed < THROW.putBackSpeed && Math.hypot(px - rackFront.x, py - rackFront.y, pz - rackFront.z) < THROW.putBackDistance && contest.putBack(s.ball)) {
      s.state = 'rack'; s.ball = null; s.hand = null;
      boardDirty = true;
      return 'back';
    }
    vx *= boost; vy *= boost; vz *= boost;
    const helped = assistThrow(pc, px, py, pz, vx, vy, vz, _out, assistOpts, _ideal);
    contest.throwBall(s.ball, clock);
    launchBall(s.sim, px, py, pz, _out.x, _out.y, _out.z);
    s.state = 'air'; s.hand = hand;
    // backspin: about the axis across the throw
    s.axis.set(_out.x, 0, _out.z);
    if (s.axis.lengthSq() < 1e-6) s.axis.set(0, 0, -1);
    s.axis.cross(UP).normalize();
    s.rate = BALL.spinRevsPerSecond * Math.PI * 2;
    haptic(hand, HAPTIC.release);
    boardDirty = true;
    if (dev) log('throw', `${hand} ${speed.toFixed(2)} m/s${boost !== 1 ? ' x' + boost : ''}${helped ? ' (aim assist)' : ''} -> ${Math.hypot(_out.x, _out.y, _out.z).toFixed(2)} m/s, ball ${s.ball.index + 1}${s.ball.money ? ' (money)' : ''}`);
    return helped ? 'assisted' : 'thrown';
  }

  function updateFlight(dt) {
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (s.state !== 'air') continue;
      const sim = s.sim;
      const hits = advance(sim, pc, dt);
      if (hits & HIT.RIM) { sfx.play('clank', VOLUME.clank, toWorld(sim.x, sim.y, sim.z)); haptic(s.hand, HAPTIC.rim); s.axis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(); }
      if (hits & HIT.BOARD) sfx.play('board', VOLUME.board, toWorld(sim.x, sim.y, sim.z));
      if (hits & HIT.FLOOR) s.rate *= 0.6;
      if (hits & HIT.MAKE) {
        const clean = sim.rimHits === 0 && sim.boardHits === 0;
        const points = contest.resolve(s.ball, true);
        sfx.play('swish', clean ? VOLUME.swish : VOLUME.swish * 0.6, toWorld(pc.rim.x, pc.rim.y, pc.rim.z));
        if (s.ball.money) sfx.play('chime', VOLUME.money, toWorld(pc.rim.x, pc.rim.y, pc.rim.z));
        if (clean) haptic(s.hand, HAPTIC.swish);
        court.swish(clean ? 1 : 0.6);
        crowd.cheer(s.ball.money ? 2 : 1);
        sparkles.burst(pc.rim.x, pc.rim.y - 0.1, pc.rim.z, s.ball.money ? COLORS.gold : COLORS.ice, s.ball.money ? 40 : 22);
        boardDirty = true;
        if (dev) log('basket', `+${points}${clean ? ' swish' : ''} score ${contest.score}`);
      }
      s.obj.position.set(sim.x, sim.y, sim.z);
      s.obj.quaternion.premultiply(_q.setFromAxisAngle(s.axis, s.rate * dt));
      if (isSettled(sim, pc)) {
        if (s.ball && !s.ball.done) { contest.resolve(s.ball, false); boardDirty = true; }
        sim.live = false; s.state = 'gone'; s.obj.visible = false;
      }
    }
  }

  // ---- hands ---------------------------------------------------------------------------------------------------
  /** Where a hand holds a ball, in the court frame. False when that hand is not there. */
  function handPoint(hand, out) {
    const c = ctx.controllers ? ctx.controllers[hand] : null;
    if (!c || !c.grip || !c.connected || c.tracked === false) return false;
    c.grip.updateWorldMatrix(true, false);
    out.fromArray(THROW.holdOffset).applyMatrix4(c.grip.matrixWorld).applyMatrix4(invWorld);
    return true;
  }
  function updateHands() {
    const immersive = ctx.isImmersive();
    for (const hand of ['left', 'right']) {
      if (immersive && handPoint(hand, _v)) trackers[hand].push(clock, _v.x, _v.y, _v.z);
      const s = held[hand];
      if (s) {
        if (immersive && handPoint(hand, _v)) s.obj.position.copy(_v);
      }
    }
    const d = held.desk;
    if (d) { deskHandPoint(_v); d.obj.position.copy(_v); updateAimPreview(); }
  }

  function grab(hand) {
    if (phase !== 'round' || contest.phase !== 'playing' || held[hand] || moving) return false;
    const s = frontSlot();
    if (!s || !handPoint(hand, _v)) return false;
    if (_v.distanceTo(s.obj.position) > THROW.grabRadius) {
      // A left-handed player reaching for the other side: the rack follows them there.
      const mirrored = _head.copy(rackFront).sub(spotPoint);
      _right.set(-toHoop.z, 0, toHoop.x);
      mirrored.addScaledVector(_right, -2 * mirrored.dot(_right)).add(spotPoint);
      if (_v.distanceTo(mirrored) > THROW.grabRadius * 1.6 || held.left || held.right) return false;
      side = -side;
      placeRack();
      layoutRack(1);
      log('rack', 'moved to the ' + (side > 0 ? 'right' : 'left'));
    }
    return Boolean(takeBall(hand));
  }
  function letGo(hand) {
    const s = held[hand];
    if (!s) return;
    trackers[hand].velocity(clock, THROW.velocityWindow, _vel);
    const p = s.obj.position;
    release(s, hand, p.x, p.y, p.z, _vel.x, _vel.y, _vel.z, THROW.boost);
  }

  // ---- desktop: press to pick up, drag up for power and sideways to aim, let go to shoot -----------------------
  const dom = ctx.renderer && ctx.renderer.domElement ? ctx.renderer.domElement : null;
  const desk = { down: false, x0: 0, y0: 0, dx: 0, dy: 0, listening: false };
  function deskHandPoint(out) {
    ctx.viewerPosition(_head);
    flatForward(_fwd);
    _right.crossVectors(_fwd, UP);
    out.copy(_head).addScaledVector(_fwd, 0.55).addScaledVector(_right, 0.2).addScaledVector(UP, -0.24).applyMatrix4(invWorld);
    return out;
  }
  /** The desktop throw for the current drag, unassisted: writes `out`. */
  function deskVelocity(p, out) {
    const D = THROW.desktop, w = dom ? Math.max(1, dom.clientWidth) : 1280, h = dom ? Math.max(1, dom.clientHeight) : 800;
    const power = Math.min(D.maxPower, Math.max(D.minPower, D.restPower + (-desk.dy / h) * D.powerPerScreen));
    let yaw = -(desk.dx / w) * D.yawPerScreen;
    if (document.pointerLockElement === dom) {            // the mouse also turns the view: aim where you look
      flatForward(_fwd); _fwd.transformDirection(invWorld);
      _w.set(pc.rim.x - p.x, 0, pc.rim.z - p.z).normalize();
      yaw = Math.atan2(_w.x * _fwd.z - _w.z * _fwd.x, _w.x * _fwd.x + _w.z * _fwd.z) / DEG * -1;
    }
    idealVelocity(pc, p.x, p.y, p.z, out, THROW.idealElevation);
    yawVelocity(out, yaw);
    out.x *= power; out.y *= power; out.z *= power;
    return out;
  }
  function updateAimPreview() {
    const s = held.desk;
    if (!s) { aimDots.visible = false; return; }
    const p = s.obj.position;
    deskVelocity(p, _vel);
    const T = THROW.desktop.previewSeconds;
    for (let i = 0; i < PREVIEW_DOTS; i++) {
      const t = (i + 1) / PREVIEW_DOTS * T;
      aimPos[i * 3] = p.x + _vel.x * t; aimPos[i * 3 + 1] = p.y + _vel.y * t - 0.5 * PHYSICS.gravity * t * t; aimPos[i * 3 + 2] = p.z + _vel.z * t;
    }
    aimGeo.attributes.position.needsUpdate = true;
    aimDots.visible = true;
  }
  function onPointerDown(event) {
    if (event.button !== 0 || ctx.isImmersive() || phase !== 'round' || contest.phase !== 'playing' || held.desk || moving) return;
    if (!takeBall('desk')) return;
    desk.down = true; desk.x0 = event.clientX; desk.y0 = event.clientY; desk.dx = 0; desk.dy = 0;
  }
  function onPointerMove(event) {
    if (!desk.down) return;
    if (document.pointerLockElement === dom) { desk.dx += event.movementX || 0; desk.dy += event.movementY || 0; }
    else { desk.dx = event.clientX - desk.x0; desk.dy = event.clientY - desk.y0; }
  }
  function onPointerUp(event) {
    if (event.button !== 0 || !desk.down) return;
    desk.down = false;
    const s = held.desk;
    aimDots.visible = false;
    if (!s) return;
    const p = s.obj.position;
    deskVelocity(p, _vel);
    release(s, 'desk', p.x, p.y, p.z, _vel.x, _vel.y, _vel.z);
  }
  function listen(on) {
    if (!dom || desk.listening === on) return;
    desk.listening = on;
    const f = on ? 'addEventListener' : 'removeEventListener';
    dom[f]('pointerdown', onPointerDown);
    window[f]('pointermove', onPointerMove);
    window[f]('pointerup', onPointerUp);
  }

  // ---- autoplay (dev): shoots by itself through the same release path ------------------------------------------
  function autoShoot(power = 1, yaw = 0) {
    if (phase !== 'round' || contest.phase !== 'playing' || moving) return false;
    const s = takeBall('right');
    if (!s) return false;
    _v.copy(rackFront).addScaledVector(UP, 0.45).addScaledVector(rackDir, -0.1);
    s.obj.position.copy(_v);
    idealVelocity(pc, _v.x, _v.y, _v.z, _vel, THROW.idealElevation);
    yawVelocity(_vel, yaw);
    release(s, 'right', _v.x, _v.y, _v.z, _vel.x * power, _vel.y * power, _vel.z * power);
    return true;
  }
  function updateAutoplay(dt) {
    if (!autoMode) return;
    if (phase === 'pick' && choices.length && (autoPickIn -= dt) <= 0) { autoPickIn = 999; pick(choices[0]); return; }
    if (phase !== 'round' || contest.phase !== 'playing' || moving || (autoIn -= dt) > 0) return;
    autoIn = 0.8;
    const perfect = autoMode === 'perfect';
    // realistic misses: a little long or short, a little left or right
    const power = perfect ? 1 : 1 + (Math.random() + Math.random() + Math.random() - 1.5) * 0.06;
    const yaw = perfect ? 0 : (Math.random() - 0.5) * 6;
    autoShoot(power, yaw);
  }

  // ---- phases --------------------------------------------------------------------------------------------------
  async function showPicker() {
    phase = 'pick';
    hud.hideResults(); hud.hideBoard();
    hud.setStatus('');
    hud.setScanLabel(TEXT.scan);
    const mine = enterId;
    choices = await listChoices(ctx, { standIns });
    if (!active || mine !== enterId) return;
    hud.setChoices(choices);
    hud.showPicker();
    autoPickIn = 1.0;
    log('pick', choices.map((c) => c.label).join(', '));
    // the balls turning above their buttons, one by one
    for (const choice of choices) {
      const entry = await balls.get(choice);
      if (!active || mine !== enterId || phase !== 'pick') return;
      hud.setPreview(choice.key, entry.ball);
    }
  }

  async function pick(choice) {
    if (phase !== 'pick') return;
    phase = 'loading';
    hud.setStatus('Getting your ball ready...');
    const mine = enterId;
    const entry = await balls.get(choice);
    if (!active || mine !== enterId) return;
    setBall(entry);
    startRound();
  }

  const toyScan = createToyScan({
    ctx, ui: ctx.ui, audio: ctx.audio, rig: ctx.rig, parent: group,
    takeToy(model, gift, at) {
      // the ball first (a clone), then the toy joins the companions as it does in the Reef
      const choice = gift
        ? { key: 'gift:' + gift.id, label: String(gift.wish || 'My toy').split(',')[0].slice(0, 18), kind: 'scan', model }
        : { key: 'toy:bubby', label: 'Bubby', kind: 'bubby', model };
      const ready = balls.get(choice);
      if (ctx.companions) ctx.companions.add(model, { gift, toy: gift ? null : 'bubby', from: at });
      const mine = enterId;
      ready.then((entry) => {
        if (!active || mine !== enterId) return;
        setBall(entry);
        phase = 'loading';
        startRound();
      });
    },
    setScanView(on) { hud.setPickerVisible(!on && phase === 'scan'); if (ctx.companions) ctx.companions.setVisible(!on); },
    setStatus(text) { hud.setStatus(text); },
    onBusy(busy) { hud.setScanLabel(busy ? TEXT.bringBubby : TEXT.scan); },
  });

  function scan() {
    if (phase !== 'pick' && phase !== 'scan') return;
    phase = 'scan';
    toyScan.start();                                       // pressed again while waiting: Bubby comes
  }

  function startRound() {
    if (!active || !chosen) return;
    enterId++;                                             // anything still loading for the picker is dropped
    phase = 'round';
    hud.hidePicker(); hud.hideResults();
    for (const h of ['left', 'right', 'desk']) held[h] = null;
    desk.down = false; aimDots.visible = false;
    sparkles.clear();
    contest.start();
    moving = true;
    setRoundInput(true);
    autoIn = 0.6;
    fadeThen(() => {
      placeAt(0);
      refillRack();
      _v.set(pc.rim.x, pc.board.y1 + LAYOUT.scoreboard.above, pc.board.z + 0.05);
      hud.showBoard(_v, spotPoint);
      boardDirty = true;
      moving = false;
      readyIn = CONTEST.readySeconds;
      say(TEXT.intro);
    });
    log('round', `${roundSeconds} s, ball ${chosen.label}`);
  }

  function nextRack() {
    // balls still rolling from this rack are cleared away by the fade
    for (const s of slots) if (s.state === 'air' || s.state === 'held') { if (s.ball && !s.ball.done) contest.resolve(s.ball, false); s.state = 'gone'; s.obj.visible = false; s.sim.live = false; }
    const next = contest.beginMove();
    if (next === 'over') { endRound(); return; }
    moving = true;
    fadeThen(() => {
      if (contest.arrived()) {
        placeAt(contest.rack);
        refillRack();
        log('rack', `${contest.rack + 1} at ${COURT.spotNames[contest.rack]}, score ${contest.score}, ${contest.timeLeft.toFixed(1)} s left`);
      }
      moving = false;
      boardDirty = true;
    });
  }

  function endRound() {
    if (phase !== 'round') return;
    phase = 'results';
    const st = contest.state();
    for (const h of ['left', 'right', 'desk']) { const s = held[h]; if (s) { contest.drop(s.ball); s.state = 'gone'; s.obj.visible = false; } held[h] = null; }
    for (const s of slots) if (s.state === 'rack') { s.state = 'gone'; s.obj.visible = false; }
    aimDots.visible = false; desk.down = false;
    const isNew = st.score > best;
    if (isNew) { best = st.score; try { localStorage.setItem(CONTEST.bestKey, String(best)); } catch { /* private mode */ } }
    setRoundInput(false);
    boardDirty = true;
    updateBoard();
    sfx.play('success', VOLUME.end);
    hud.showResults(st.endedBy === 'all' ? TEXT.allDone : TEXT.timeUp, TEXT.result(st.score, st.max, st.makes, st.shots, best, isNew));
    say(TEXT.end);
    log('over', `${st.endedBy}: score ${st.score}/${st.max}, ${st.makes} of ${st.shots}, money ${st.moneyMakes}, best ${best}; peak ${perfPeakCalls} draws, ${perfPeakTris} triangles`);
  }

  /** During a round: no pointer rays (Unity does this for Frost Slice), companions out of the way, the mouse's drag is the aim. */
  function setRoundInput(on) {
    if (ctx.input && ctx.input.state) {
      ctx.input.state.pointersEnabled = !on;
      ctx.input.state.desktopLookEnabled = !on;
    }
    if (ctx.companions) ctx.companions.setVisible(!on);
  }

  function goHome() {
    try { ctx.switchTab('hub'); } catch (err) { console.warn('[hoops] could not open the hub', err && err.message); }
  }

  function updateBoard() {
    const second = Math.ceil(contest.timeLeft);
    if (!boardDirty && second === shownSecond) return;
    boardDirty = false; shownSecond = second;
    const row = contest.state().balls[contest.rack];
    for (let i = 0; i < _dots.length; i++) _dots[i] = row[i];
    hud.setBoard(contest.score, contest.timeLeft, contest.rack, _dots);
  }

  function readPerf() {
    const info = ctx.renderer && ctx.renderer.info ? ctx.renderer.info.render : null;
    if (!info) return;
    if (info.calls > perfPeakCalls) perfPeakCalls = info.calls;
    if (info.triangles > perfPeakTris) perfPeakTris = info.triangles;
  }

  // ---- the frame -----------------------------------------------------------------------------------------------
  function update(dt) {
    if (!active) return;
    clock += dt;
    toyScan.update(dt);
    hud.update(dt);
    court.update(dt);
    sparkles.update(dt);
    crowd.update(dt, clock);
    snow.update(ctx.elapsed || clock);
    if (chosen) chosen.gold.setGlow(0.22 + 0.14 * Math.sin(clock * 4));
    updateAutoplay(dt);
    if (phase === 'round' || phase === 'results') updateFlight(dt);
    if (phase !== 'round') return;
    if (dev) readPerf();
    if (readyIn > 0 && (readyIn -= dt) <= 0) { contest.go(); say(TEXT.go); boardDirty = true; }
    const ev = contest.tick(dt);
    if (ev === 'buzzer') {
      sfx.play('buzz', VOLUME.buzzer);
      for (const h of ['left', 'right', 'desk']) { const s = held[h]; if (s) { contest.drop(s.ball); s.state = 'gone'; s.obj.visible = false; held[h] = null; } }
      aimDots.visible = false; desk.down = false;
      boardDirty = true;
    }
    if (contest.phase === 'over') { endRound(); return; }
    updateHands();
    layoutRack(Math.min(1, dt * 12));
    if (!moving && contest.rackDone(clock)) nextRack();
    updateBoard();
  }

  // ---- checks (dev) --------------------------------------------------------------------------------------------
  const debug = {
    state() {
      const st = contest.state();
      return {
        phase, contest: st.phase, spot, side, score: st.score, makes: st.makes, moneyMakes: st.moneyMakes, shots: st.shots, rack: st.rack,
        taken: st.taken, timeLeft: st.timeLeft, endedBy: st.endedBy, max: st.max, best, moving, balls: st.balls,
        choices: choices.map((c) => c.label), ball: chosen ? { label: chosen.label, triangles: chosen.triangles } : null,
        visibleOnRack, slots: slots.map((s) => s.state), shown: slots.filter((s) => s.obj.visible).length, held: { left: Boolean(held.left), right: Boolean(held.right), desk: Boolean(held.desk) },
        picker: hud.pickerVisible, results: hud.resultsVisible, board: hud.boardVisible, spoken: spoken.slice(), sounds: sfx.played,
        sparkles: sparkles.emitted, crowd: { penguins: crowd.count, cheers: crowd.cheers }, peak: { calls: perfPeakCalls, triangles: perfPeakTris },
      };
    },
    setTimeLeft(s) { contest.setTimeLeft(s); boardDirty = true; },
    /** Throw the next ball from the rack's hand position: power 1 and yaw 0 is the ideal arc (before assist). */
    shoot(power = 1, yaw = 0) { return autoShoot(power, yaw); },
    pick(index = 0) { if (choices[index]) pick(choices[index]); return Boolean(choices[index]); },
    again() { startRound(); },
    /** The chosen ball's measurements: size, pivot, triangles, and what the rack's clones share. */
    measure() {
      if (!chosen) return null;
      const box = new THREE.Box3().setFromObject(chosen.ball, true), size = box.getSize(new THREE.Vector3()), centre = box.getCenter(new THREE.Vector3());
      const geos = new Set(), mats = new Set();
      for (const s of slots) s.obj.traverse((o) => { if (o.isMesh) { geos.add(o.geometry.uuid); mats.add(o.material.uuid); } });
      let meshes = 0;
      chosen.ball.traverse((o) => { if (o.isMesh) meshes++; });
      return { largest: Math.max(size.x, size.y, size.z), centre: centre.toArray(), triangles: chosen.triangles, meshes, geometries: geos.size, materials: mats.size };
    },
    /** A ball's world position projected nowhere: for pictures. */
    get world() { return world; },
    /**
     * Hold and release with a scripted hand path, through the real tracker (checks the release velocity). The
     * hand's velocity is given in the spot's own frame: toward the hoop, up, and to the right.
     */
    scriptedThrow(ahead, up, right) {
      if (phase !== 'round' || contest.phase !== 'playing') return null;
      const s = takeBall('right');
      if (!s) return null;
      _right.set(-toHoop.z, 0, toHoop.x);
      const vx = toHoop.x * ahead + _right.x * right, vy = up, vz = toHoop.z * ahead + _right.z * right;
      const tr = trackers.right;
      tr.clear();
      _v.copy(rackFront).addScaledVector(UP, 0.4);
      for (let k = 0; k < 8; k++) { const t = clock - (7 - k) / 72; tr.push(t, _v.x + vx * (t - clock), _v.y + vy * (t - clock), _v.z + vz * (t - clock)); }
      s.obj.position.copy(_v);
      tr.velocity(clock, THROW.velocityWindow, _vel);
      const result = release(s, 'right', _v.x, _v.y, _v.z, _vel.x, _vel.y, _vel.z, THROW.boost);
      return { given: [vx, vy, vz], measured: [_vel.x, _vel.y, _vel.z], launched: [s.sim.vx, s.sim.vy, s.sim.vz], result };
    },
  };
  if (dev) window.__hoops = debug;

  // ---- the tab -------------------------------------------------------------------------------------------------
  return {
    name: 'Snow Hoops',
    group,

    enter() {
      active = true; enterId++; clock = 0; moving = false; readyIn = 0; side = 1;
      try { if (typeof ctx.setEnvironment === 'function') ctx.setEnvironment(null); } catch { /* the default is fine */ }
      placeAt(2);                                           // the top of the key is the shell's origin
      crowd.load();
      if (ctx.rig && typeof ctx.rig.setHome === 'function' && !(ctx.isAR && ctx.isAR())) ctx.rig.setHome(spotPoint, toHoop, false);
      for (const s of slots) { s.state = 'gone'; s.obj.visible = false; s.sim.live = false; }
      listen(true);
      if (ctx.gifts && typeof ctx.gifts.subscribe === 'function') unsubscribeGifts = ctx.gifts.subscribe((gift) => { toyScan.offer(gift); }, { replay: false });
      showPicker().catch((err) => console.error('[hoops] the picker could not be shown', err));
    },

    exit() {
      active = false; enterId++;
      toyScan.cancel();
      if (unsubscribeGifts) { unsubscribeGifts(); unsubscribeGifts = null; }
      listen(false);
      contest.stop();
      for (const h of ['left', 'right', 'desk']) held[h] = null;
      for (const s of slots) { s.state = 'gone'; s.obj.visible = false; s.sim.live = false; }
      hud.hideAll();
      aimDots.visible = false; desk.down = false;
      sparkles.clear();
      crowd.clear();
      setRoundInput(false);
      phase = 'off';
    },

    update,
    onSqueezeStart(hand) { if (ctx.isImmersive()) grab(hand); },
    onSqueezeEnd(hand) { if (ctx.isImmersive()) letGo(hand); },
    /** B and X open the shell's menu: give the pointer rays back for it. */
    onButtonDown(hand, name) { if (phase === 'round' && (name === 'b' || name === 'x') && ctx.input) ctx.input.state.pointersEnabled = true; },
    onRecenter() { if (typeof ctx.isAR === 'function' && ctx.isAR() && phase === 'round') placeAt(spot); },

    dispose() {
      this.exit();
      court.dispose(); sparkles.dispose(); crowd.dispose(); sfx.dispose(); balls.dispose();
      aimGeo.dispose(); aimDots.material.dispose(); snow.dispose();
      if (dev && window.__hoops === debug) delete window.__hoops;
    },
  };
}
