// Frost Slice: the Unity game (Assets/WishWorld/Scripts/Games/FrostSliceGame.cs) on the web.
// Fruit arcs up in front of the player and each controller is a blade. A hit only counts when the blade is
// moving fast, so resting a blade on fruit does nothing. Rules, numbers and strings are in rules.js.
//
// Frames of reference:
//   world   the shell's: the tab's group sits at the scene's origin.
//   stage   the game's own, a child group. The player stands at its origin and the fruit comes from +Z.
//           It is put under the player's head, facing the way they face, two frames after the tab opens
//           (Unity recentres the player on the game the same way) and again whenever they recentre. In AR
//           this is what places the game in the real room.
// Everything that moves is pooled; nothing is allocated per frame.

import * as THREE from 'three';
import { FRUITS, RULES, LAYOUT, COLORS, TEXT } from './rules.js';
import { createAssets } from './assets.js';
import { createSfx } from './sfx.js';
import { createShadows, createJuice, createTrail, disposeTrailMaterial } from './fx.js';
import { createHud } from './hud.js';
import { createVoice } from './voice.js';
import { createAutoplay } from './autoplay.js';
import { createCustomFruit } from './customfruit.js';

const MAX_FLYING = 16;
const MAX_DEBRIS = 24;
const SWEEP_LINES = 8;             // Unity tests 5 lines across the swept blade; 8 leaves no gap a fruit fits through
const DEG = Math.PI / 180;
const UP = new THREE.Vector3(0, 1, 0);

const rand = (a, b) => a + Math.random() * (b - a);

function distToSegment(px, py, pz, ax, ay, az, bx, by, bz) {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const t = Math.min(1, Math.max(0, ((px - ax) * abx + (py - ay) * aby + (pz - az) * abz) / Math.max(1e-6, abx * abx + aby * aby + abz * abz)));
  return Math.hypot(px - (ax + abx * t), py - (ay + aby * t), pz - (az + abz * t));
}

function isDev(ctx) {
  if (ctx.dev && ctx.dev.harness) return true;
  return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
}

export function createFrostSlice(ctx) {
  const dev = isDev(ctx);
  const query = new URLSearchParams(location.search);
  const autoMode = dev && query.get('autoplay') && query.get('autoplay') !== '0' ? query.get('autoplay') : null;
  const roundSeconds = dev && Number(query.get('round')) > 0 ? Number(query.get('round')) : RULES.roundSeconds;
  const muted = Boolean(ctx.params && typeof ctx.params.get === 'function' && ctx.params.get('mute') === '1');

  const say = (what, detail) => console.info('[frostslice] ' + what + (detail !== undefined ? ' ' + detail : ''));
  const trace = dev ? say : null;

  // ---- scene graph ---------------------------------------------------------------------------------------
  const group = new THREE.Group();
  group.name = 'FrostSlice';
  const stage = new THREE.Group();
  stage.name = 'FrostSliceStage';
  stage.visible = false;
  group.add(stage);
  const invStage = new THREE.Matrix4();
  const invStageQuat = new THREE.Quaternion();

  const assets = createAssets(ctx, { standIns: dev && query.get('standins') === '1' });
  const sfx = createSfx({ shellAudio: ctx.audio, camera: ctx.camera, muted });
  const shadows = createShadows(assets.dot, MAX_FLYING);
  const juice = createJuice(assets.dot);
  stage.add(shadows.mesh, juice.mesh);
  const custom = createCustomFruit(ctx, { dev, query, log: trace });
  let toldPending = false;

  let hud = null, voice = null, autoplay = null;
  let props = null;

  // ---- game state (FrostSliceGame fields) ------------------------------------------------------------------
  let phase = 'off';               // 'off' | 'loading' | 'ready' | 'playing' | 'over'   (Unity: Ready, Playing, Over)
  let active = false, built = false, started = false, building = null;
  let frames = 0, reanchorIn = 0;
  let score = 0, lives = 0, best = 0, sliced = 0, maxCombo = 0, hazardsHit = 0, launched = 0;
  let timeLeft = 0, roundTime = 0, nextWave = 0, clock = 0, shownSecond = -1;
  let perfAt = 0, perfPeakCalls = 0, perfPeakTris = 0;
  let autoStarted = false, autoStartIn = 1.2;

  try { best = parseInt(localStorage.getItem(RULES.bestKey) || '0', 10) || 0; } catch { best = 0; }

  function setPhase(next, why) {
    if (phase === next) return;
    say('state ' + phase + ' -> ' + next, why ? '(' + why + ')' : undefined);
    phase = next;
  }

  // ---- pools -------------------------------------------------------------------------------------------------
  const flying = [];               // in the air, oldest first
  const flyingPool = [];
  const debris = [];
  const pending = new Float32Array(8);     // launch times of the wave being thrown
  let pendingHead = 0, pendingCount = 0;

  function makePools() {
    for (let i = 0; i < MAX_FLYING; i++) {
      const mesh = new THREE.Mesh(assets.geo.whole[0], assets.lit);
      mesh.name = 'Fruit'; mesh.visible = false;
      stage.add(mesh);
      flyingPool.push({
        mesh, live: false, hazard: false, custom: false, kind: 0, radius: 0, time: 0, apexTime: 1, gravity: 0, v0y: 0,
        sx: 0, sy: 0, sz: 0, tx: 0, ty: 0, tz: 0, spinX: 0, spinY: 0, spinZ: 0, roll: 0,
      });
    }
    for (let i = 0; i < MAX_DEBRIS; i++) {
      const mesh = new THREE.Mesh(assets.geo.half[0], assets.lit);
      mesh.name = 'FruitHalf'; mesh.visible = false;
      stage.add(mesh);
      debris.push({ mesh, life: 0, born: 0, custom: false, vx: 0, vy: 0, vz: 0, spinX: 0, spinY: 0, spinZ: 0 });
    }
  }

  function releaseFlying(i) {
    const f = flying[i];
    f.live = false; f.mesh.visible = false;
    for (let j = i; j < flying.length - 1; j++) flying[j] = flying[j + 1];
    flying.length--;
  }
  function clearFlying() {
    for (let i = 0; i < flying.length; i++) { flying[i].live = false; flying[i].mesh.visible = false; }
    flying.length = 0;
    pendingHead = 0; pendingCount = 0;
  }
  function clearDebris() { for (let i = 0; i < debris.length; i++) { debris[i].life = 0; debris[i].mesh.visible = false; } }

  // ---- blades ------------------------------------------------------------------------------------------------
  const blades = [];
  function makeBlades() {
    for (let i = 0; i < 2; i++) {
      const holder = new THREE.Group();
      holder.name = i === 0 ? 'LeftBlade' : 'RightBlade';
      holder.matrixAutoUpdate = false;
      holder.visible = false;
      // The exported blade runs along +Z from the grip; a WebXR grip points along -Z.
      const mesh = new THREE.Mesh(assets.geo.blade, assets.glow);
      mesh.rotation.y = Math.PI;
      holder.add(mesh);
      const trail = createTrail();
      stage.add(holder, trail.mesh);
      blades.push({
        holder, trail, left: i === 0, hand: i === 0 ? 'left' : 'right',
        tip: new THREE.Vector3(), base: new THREE.Vector3(), prevTip: new THREE.Vector3(), prevBase: new THREE.Vector3(),
        hasPrev: false, lastSlice: -10, combo: 0,
      });
    }
  }
  function hideBlade(b) { b.holder.visible = false; b.hasPrev = false; b.trail.clear(); }
  function hideBlades() { for (let i = 0; i < blades.length; i++) hideBlade(blades[i]); }

  // ---- the desktop stand-in (Scripts/DebugTools/DesktopInputSource.cs), for shells that do not move the
  //      controllers with the mouse themselves: the active hand rides the cursor ray half a metre out. ------
  const desk = { x: 0, y: -0.25, shift: false, listening: false };
  const shellMovesHands = Boolean(ctx.input && ctx.input.state);
  const dom = ctx.renderer && ctx.renderer.domElement ? ctx.renderer.domElement : null;
  function onPointerMove(event) {
    const rect = dom.getBoundingClientRect();
    desk.x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    desk.y = -(((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1);
  }
  function onPointerDown() { sfx.unlock(); }
  function onKeyDown(event) { if (event.code === 'ShiftLeft') desk.shift = true; sfx.unlock(); }
  function onKeyUp(event) { if (event.code === 'ShiftLeft') desk.shift = false; }
  function listen(on) {
    if (!dom || desk.listening === on) return;
    desk.listening = on;
    const f = on ? 'addEventListener' : 'removeEventListener';
    dom[f]('pointermove', onPointerMove);
    dom[f]('pointerdown', onPointerDown);
    window[f]('keydown', onKeyDown);
    window[f]('keyup', onKeyUp);
  }

  // ---- scratch -------------------------------------------------------------------------------------------------
  const _head = new THREE.Vector3(), _headLocal = new THREE.Vector3(), _fwd = new THREE.Vector3(), _right = new THREE.Vector3();
  const _dir = new THREE.Vector3(), _pos = new THREE.Vector3(), _aim = new THREE.Vector3(), _v = new THREE.Vector3();
  const _swing = new THREE.Vector3(), _along = new THREE.Vector3(), _normal = new THREE.Vector3(), _n = new THREE.Vector3();
  const _w = new THREE.Matrix4(), _q = new THREE.Quaternion(), _facing = new THREE.Quaternion(), _e = new THREE.Euler();
  const _one = new THREE.Vector3(1, 1, 1);
  const _eye = new THREE.Vector3(), _cutQ = new THREE.Quaternion(), _side = new THREE.Vector3();

  function viewerFlatForward(out) {
    if (typeof ctx.viewerForwardFlat === 'function') ctx.viewerForwardFlat(out);
    else { ctx.viewerForward(out); out.y = 0; }
    if (out.lengthSq() < 1e-4) out.set(0, 0, -1);
    return out.normalize();
  }

  /** Put the stage under the player, facing the way they face (XRRig.Recenter, seen from the game's side). */
  function anchor() {
    group.updateWorldMatrix(true, false);
    ctx.viewerPosition(_head);
    viewerFlatForward(_fwd);
    _pos.set(_head.x, 0, _head.z);
    group.worldToLocal(_pos);
    const yaw = Math.atan2(_fwd.x, _fwd.z);
    stage.position.set(_pos.x, 0, _pos.z);
    stage.rotation.set(0, yaw, 0);
    stage.updateMatrixWorld(true);
    invStage.copy(stage.matrixWorld).invert();
    stage.getWorldQuaternion(invStageQuat).invert();
    assets.setLight(yaw);
    for (let i = 0; i < blades.length; i++) { blades[i].hasPrev = false; blades[i].trail.clear(); }
    if (trace) trace('anchored', `at (${_pos.x.toFixed(2)}, ${_pos.z.toFixed(2)}) yaw ${(yaw / DEG).toFixed(0)} deg`);
  }

  // ---- building (once) ---------------------------------------------------------------------------------------
  async function build() {
    await assets.load();
    props = new THREE.Mesh(assets.geo.props, assets.lit);
    props.name = 'Props';
    stage.add(props);
    makePools();
    makeBlades();
    hud = await createHud(ctx, { root: group, stageRoot: stage, sfx, onStart: () => startRound(), onHub: () => goHub(), plain: dev && query.get('plainui') === '1' });
    voice = createVoice(ctx, { caption: hud.caption, log: trace });
    if (autoMode) autoplay = createAutoplay(autoMode);
    built = true;
    say('ready to start', `(panels: ${hud.kind}; models: ${assets.fallbacks.length ? assets.fallbacks.length + ' stand-ins' : 'all exported'}, ${assets.look}; ${Math.round(assets.triangles)} triangles loaded)`);
  }

  function goHub() {
    say('hub pressed');
    try { ctx.switchTab('hub'); } catch (err) { console.warn('[frostslice] could not open the hub', err && err.message); }
  }

  // ---- FrostSliceGame.Start: two frames after the scene opens ------------------------------------------------
  function start() {
    started = true;
    anchor();                                                // the shell has already stood the player on its origin (VR, desktop)
    stage.visible = true;
    setPhase('ready', 'menu');
    showMenu(TEXT.title, menuInfo(), TEXT.start);
    voice.read(TEXT.intro);
  }

  const menuInfo = () => (custom.active ? TEXT.infoScanned : TEXT.info);

  /**
   * A safe moment (no round being played): swap in a fruit scanned on the phone, or go back to the normal
   * fruit. Scanned fruit still drawn with the old picture are put away first, so nothing uses a freed texture.
   */
  function applyFruit(announce = true) {
    if (!custom.hasPending) return null;
    for (let i = flying.length - 1; i >= 0; i--) if (flying[i].custom) releaseFlying(i);
    for (let i = 0; i < debris.length; i++) if (debris[i].custom) { debris[i].life = 0; debris[i].custom = false; debris[i].mesh.visible = false; }
    const change = custom.takePending();
    if (toldPending) hud.popups.clear();                     // the "next round" notice has done its job
    toldPending = false;
    if (!change) return null;
    say(change === 'new' ? 'scanned fruit in use' : 'back to the normal fruit');
    if (phase === 'ready' && hud.menuVisible) hud.showMenu(TEXT.title, menuInfo(), TEXT.start);
    if (change === 'new' && announce) voice.say(TEXT.fruitReady);
    return change;
  }

  /**
   * XRRig.pointersEnabled: Unity switches the pointer rays off for the round. With them goes the desktop hand's
   * aim-from-the-hip pose: during a round it floats on the cursor ray, as Unity's desktop stand-in does for blades.
   */
  function setPointers(on) {
    if (!shellMovesHands) return;
    ctx.input.state.pointersEnabled = on;
    ctx.input.state.desktopPointerMode = on;
  }

  function showMenu(title, info, button) {
    hud.showMenu(title, info, button);
    setPointers(true);
    hideBlades();
  }

  function updateHud() {
    hud.setScore(String(score));
    shownSecond = Math.ceil(timeLeft);
    hud.setTime(TEXT.time(timeLeft));
    hud.setLives(TEXT.lives(lives));
  }

  function startRound() {
    if (!built || !started || !active) return;
    sfx.unlock();
    const fruitChange = applyFruit(false);
    clearFlying();
    score = 0; sliced = 0; maxCombo = 0; hazardsHit = 0; launched = 0;
    lives = RULES.startLives;
    timeLeft = roundSeconds;
    roundTime = 0;
    nextWave = RULES.firstWave;
    setPhase('playing', 'round of ' + roundSeconds + ' s, ' + lives + ' lives');
    hud.hideMenu();
    hud.showHud();
    setPointers(false);
    for (let i = 0; i < blades.length; i++) { blades[i].hasPrev = false; blades[i].combo = 0; blades[i].trail.clear(); }
    if (autoplay) autoplay.reset();
    updateHud();
    voice.sayNow(TEXT.go);                                   // cuts off the menu being read
    if (fruitChange === 'new') voice.say(TEXT.fruitReady);
  }

  function endRound(title) {
    setPhase('over', `${title} score ${score}, best ${Math.max(best, score)}, sliced ${sliced}, max combo ${maxCombo}, ice hit ${hazardsHit}`);
    const newBest = score > best;
    if (newBest) {
      best = score;
      try { localStorage.setItem(RULES.bestKey, String(best)); } catch { /* private mode: the best lasts this visit */ }
    }
    hud.hideHud();
    sfx.play('success', RULES.volume.success, _v.fromArray(LAYOUT.successSound).applyMatrix4(stage.matrixWorld));
    showMenu(title, TEXT.score(score, best, newBest), TEXT.again);
    voice.read(TEXT.readOut(title, score, best));
    voice.say(newBest ? TEXT.newBest : TEXT.niceRound);
    logPerf('round end');
  }

  // ---- Launch ------------------------------------------------------------------------------------------------
  /** force: 0 = normal rules, 1 = always fruit, 2 = always an ice block (the last two are for checks). */
  function launch(force = 0) {
    const hazard = force === 2 || (force === 0 && roundTime > RULES.hazardAfter && Math.random() < RULES.hazardChance);
    const kind = Math.floor(Math.random() * FRUITS.length);
    let f = null;
    for (let i = 0; i < flyingPool.length; i++) if (!flyingPool[i].live) { f = flyingPool[i]; break; }
    if (!f) return null;
    const L = RULES.launch;
    const scanned = hazard ? null : custom.active;
    f.live = true; f.hazard = hazard; f.kind = kind; f.time = 0; f.custom = Boolean(scanned);
    f.radius = hazard ? RULES.hazardRadius : scanned ? scanned.radius : FRUITS[kind].radius;
    // From the front only: thrown from 1.5 to 2 m ahead, peaking inside arm's reach.
    f.sx = rand(L.startX[0], L.startX[1]); f.sy = L.startY; f.sz = rand(L.startZ[0], L.startZ[1]);
    f.tx = rand(L.targetX[0], L.targetX[1]); f.ty = rand(L.targetY[0], L.targetY[1]); f.tz = rand(L.targetZ[0], L.targetZ[1]);
    f.apexTime = rand(L.apexTime[0], L.apexTime[1]);
    f.spinX = rand(-L.spin, L.spin) * DEG; f.spinY = rand(-L.spin, L.spin) * DEG; f.spinZ = rand(-L.spin, L.spin) * DEG;
    // Gentle custom gravity so the fruit hangs near its peak, where it can be reached.
    f.gravity = 2 * (f.ty - f.sy) / (f.apexTime * f.apexTime);
    f.v0y = f.gravity * f.apexTime;
    f.mesh.geometry = hazard ? assets.geo.ice : scanned ? scanned.whole : assets.geo.whole[kind];
    f.mesh.material = scanned ? scanned.material : assets.lit;
    if (scanned) {
      // A flat picture: it faces the player and only rolls, with a little wobble.
      f.roll = rand(0, Math.PI * 2);
      f.spinZ = rand(L.scannedRoll[0], L.scannedRoll[1]) * DEG * (Math.random() < 0.5 ? -1 : 1);
    }
    f.mesh.position.set(f.sx, f.sy, f.sz);
    f.mesh.quaternion.identity();
    f.mesh.scale.set(1, 1, 1);
    f.mesh.visible = true;
    flying.push(f);
    launched++;
    sfx.play('pop', RULES.volume.pop, _v.set(f.sx, f.sy, f.sz).applyMatrix4(stage.matrixWorld));
    if (trace) trace('launch', hazard ? 'ice block' : scanned ? 'scanned fruit' : FRUITS[kind].name);
    return f;
  }

  function updateFlying(dt) {
    ctx.viewerPosition(_eye);
    for (let i = flying.length - 1; i >= 0; i--) {
      const f = flying[i];
      f.time += dt;
      const u = Math.min(1, Math.max(0, f.time / f.apexTime));
      const ease = 1 - (1 - u) * (1 - u);
      const y = f.sy + f.v0y * f.time - 0.5 * f.gravity * f.time * f.time;
      f.mesh.position.set(f.sx + (f.tx - f.sx) * ease, y, f.sz + (f.tz - f.sz) * ease);
      if (f.custom) {
        f.roll += f.spinZ * dt;
        f.mesh.lookAt(_eye);
        f.mesh.rotateY(Math.sin(f.time * 3.1 + f.roll) * RULES.launch.scannedWobble * DEG);
        f.mesh.rotateZ(f.roll);
      } else f.mesh.quaternion.multiply(_q.setFromEuler(_e.set(f.spinX * dt, f.spinY * dt, f.spinZ * dt, 'YXZ')));
      if (y < RULES.launch.floorCutoff && f.time > f.apexTime) releaseFlying(i);
    }
  }

  // ---- blades: where they are, and what they cut --------------------------------------------------------------
  function bladePose(b, dt) {
    // -> true with the blade's world matrix in _w, or false when that hand is not there
    const immersive = ctx.isImmersive();
    if (immersive || shellMovesHands) {
      const c = ctx.controllers ? ctx.controllers[b.hand] : null;
      if (!c || !c.grip || !c.connected || c.tracked === false) return false;
      c.grip.updateWorldMatrix(true, false);
      _w.copy(c.grip.matrixWorld);
      return true;
    }
    // Desktop: the mouse moves the right blade (Left Shift: the left one); the other hand rests low.
    ctx.viewerPosition(_head);
    const activeLeft = desk.shift;
    if (b.left === activeLeft) {
      _dir.set(desk.x, desk.y, 0.5).unproject(ctx.camera).sub(_head).normalize();
      _pos.copy(_head).addScaledVector(_dir, LAYOUT.desktopReach);
    } else {
      const R = LAYOUT.desktopRest;
      viewerFlatForward(_fwd);
      _right.crossVectors(_fwd, UP);
      _pos.copy(_head).addScaledVector(_right, (b.left ? -1 : 1) * R.side).addScaledVector(UP, -R.down).addScaledVector(_fwd, R.ahead);
      _dir.copy(_fwd).multiplyScalar(Math.cos(R.pitchUpDegrees * DEG)).addScaledVector(UP, Math.sin(R.pitchUpDegrees * DEG));
    }
    _w.lookAt(_pos, _aim.copy(_pos).add(_dir), UP);          // -Z along the ray
    _w.setPosition(_pos);
    return true;
  }

  function updateBlades(dt) {
    ctx.viewerPosition(_headLocal).applyMatrix4(invStage);
    for (let bi = 0; bi < blades.length; bi++) {
      const b = blades[bi];
      let there;
      if (autoplay && !b.left) {
        if (autoplay.update(dt, flying, b.holder.matrix)) b.hasPrev = false;
        there = true;
      } else {
        there = bladePose(b, dt);
        if (there) b.holder.matrix.multiplyMatrices(invStage, _w);
      }
      if (!there) { if (b.holder.visible) hideBlade(b); else b.hasPrev = false; continue; }
      b.holder.matrixWorldNeedsUpdate = true;
      b.holder.visible = true;
      b.base.setFromMatrixPosition(b.holder.matrix);
      b.tip.set(0, 0, -RULES.blade.length).applyMatrix4(b.holder.matrix);
      b.trail.update(b.tip, _headLocal, clock);

      if (b.hasPrev && dt > 0) {
        _swing.subVectors(b.tip, b.prevTip);
        const speed = _swing.length() / dt;
        if (speed >= RULES.minSliceSpeed) {
          for (let i = flying.length - 1; i >= 0; i--) {
            const f = flying[i], c = f.mesh.position;
            const reach = f.radius + RULES.reachPadding;
            // The blade now, plus the paths of points along it since the last frame, so a fast swing
            // cannot pass through fruit between two frames.
            let hit = distToSegment(c.x, c.y, c.z, b.base.x, b.base.y, b.base.z, b.tip.x, b.tip.y, b.tip.z) < reach;
            for (let k = 0; k <= SWEEP_LINES && !hit; k++) {
              const u = k / SWEEP_LINES;
              hit = distToSegment(c.x, c.y, c.z,
                b.prevBase.x + (b.prevTip.x - b.prevBase.x) * u, b.prevBase.y + (b.prevTip.y - b.prevBase.y) * u, b.prevBase.z + (b.prevTip.z - b.prevBase.z) * u,
                b.base.x + (b.tip.x - b.base.x) * u, b.base.y + (b.tip.y - b.base.y) * u, b.base.z + (b.tip.z - b.base.z) * u) < reach;
            }
            if (hit) {
              slice(i, b);
              if (phase !== 'playing') break;               // that cut ended the round
            }
          }
        }
      }
      b.prevTip.copy(b.tip); b.prevBase.copy(b.base); b.hasPrev = true;
      if (phase !== 'playing') return;
    }
  }

  function haptic(hand, pulse) {
    try { if (typeof ctx.haptic === 'function') ctx.haptic(hand, pulse[0], pulse[1]); } catch { /* no haptics */ }
  }

  function slice(index, b) {
    const f = flying[index];
    const px = f.mesh.position.x, py = f.mesh.position.y, pz = f.mesh.position.z;
    const hazard = f.hazard, kindIndex = f.kind;
    const scanned = f.custom ? custom.active : null;
    if (scanned) _cutQ.copy(f.mesh.quaternion);
    releaseFlying(index);
    haptic(b.hand, hazard ? RULES.haptic.hazard : RULES.haptic.fruit);
    _v.set(px, py, pz).applyMatrix4(stage.matrixWorld);       // where it happened, for the sound

    if (hazard) {
      lives--; hazardsHit++;
      sfx.play('buzz', RULES.volume.buzz, _v);
      hud.popups.add(px, py, pz, TEXT.ouch, COLORS.ouch, _headLocal);
      hud.kickScore();
      juice.burst(px, py, pz, COLORS.iceBurst);
      updateHud();
      if (trace) trace('ice block hit', 'lives ' + lives);
      if (lives <= 0) endRound(TEXT.outOfLives);
      return;
    }

    const kind = scanned ? scanned.kind : FRUITS[kindIndex];
    // Combo: several fruit in one swing of the same blade.
    b.combo = clock - b.lastSlice < RULES.comboWindow ? b.combo + 1 : 1;
    b.lastSlice = clock;
    if (b.combo > maxCombo) maxCombo = b.combo;
    const gained = kind.points * b.combo;
    score += gained;
    sliced++;
    sfx.play('slice', RULES.volume.slice, _v);
    hud.popups.add(px, py, pz, TEXT.popup(b.combo, gained), COLORS.slate, _headLocal);
    hud.kickScore();
    if (b.combo === 3) voice.say(TEXT.combo3);
    juice.burst(px, py, pz, kind.juice);

    // Two pre-made halves fly apart, across the cut.
    const D = RULES.debris;
    _swing.normalize();
    _along.subVectors(b.tip, b.base).normalize();
    _normal.crossVectors(_swing, _along);
    if (_normal.lengthSq() < 1e-4) _normal.copy(UP);
    _normal.normalize();
    for (let s = -1; s <= 1; s += 2) {
      let d = null;
      for (let i = 0; i < debris.length; i++) { const c = debris[i]; if (c.life <= 0) { d = c; break; } if (!d || c.born < d.born) d = c; }
      d.life = D.life; d.born = clock;
      d.custom = Boolean(scanned);
      if (scanned) {
        // The picture's two halves part sideways, in the picture's own plane, then fall.
        d.mesh.geometry = scanned.halves[s < 0 ? 0 : 1];
        d.mesh.material = scanned.material;
        d.mesh.position.set(px, py, pz);
        d.mesh.quaternion.copy(_cutQ);
        d.mesh.scale.set(1, 1, 1);
        d.mesh.visible = true;
        _side.set(s, 0, 0).applyQuaternion(_cutQ);
        d.vx = _swing.x * D.swing + _side.x * D.apart;
        d.vy = _swing.y * D.swing + _side.y * D.apart + D.up;
        d.vz = _swing.z * D.swing + _side.z * D.apart;
        d.spinX = rand(-D.spin, D.spin) * DEG * 0.15; d.spinY = rand(-D.spin, D.spin) * DEG * 0.15; d.spinZ = s * rand(0.3, 1) * D.spin * DEG;
        continue;
      }
      d.mesh.material = assets.lit;
      d.mesh.geometry = assets.geo.half[kindIndex];
      d.mesh.position.set(px + _normal.x * s * kind.radius * D.offset, py + _normal.y * s * kind.radius * D.offset, pz + _normal.z * s * kind.radius * D.offset);
      d.mesh.quaternion.setFromUnitVectors(UP, _n.copy(_normal).multiplyScalar(s));     // dome outward, cut face inward
      d.mesh.scale.set(1, 1, 1);
      d.mesh.visible = true;
      d.vx = _swing.x * D.swing + _normal.x * s * D.apart;
      d.vy = _swing.y * D.swing + _normal.y * s * D.apart + D.up;
      d.vz = _swing.z * D.swing + _normal.z * s * D.apart;
      d.spinX = rand(-D.spin, D.spin) * DEG; d.spinY = rand(-D.spin, D.spin) * DEG; d.spinZ = rand(-D.spin, D.spin) * DEG;
    }
    updateHud();
    if (trace) trace('sliced', `${kind.name} +${gained}${b.combo > 1 ? ' (combo x' + b.combo + ')' : ''} score ${score} [${b.hand}]`);
  }

  function updateDebris(dt) {
    const D = RULES.debris;
    for (let i = 0; i < debris.length; i++) {
      const d = debris[i];
      if (d.life <= 0) continue;
      d.life -= dt;
      if (d.life <= 0) { d.mesh.visible = false; continue; }
      d.vy -= D.gravity * dt;
      d.mesh.position.x += d.vx * dt; d.mesh.position.y += d.vy * dt; d.mesh.position.z += d.vz * dt;
      d.mesh.quaternion.multiply(_q.setFromEuler(_e.set(d.spinX * dt, d.spinY * dt, d.spinZ * dt, 'YXZ')));
      if (d.life < D.shrinkAt) d.mesh.scale.multiplyScalar(Math.max(0, 1 - dt * D.shrinkRate));
    }
  }

  function updateShadows() {
    shadows.begin();
    for (let i = 0; i < flying.length; i++) {
      const f = flying[i], p = f.mesh.position;
      shadows.add(p.x, p.y, p.z, f.radius * RULES.shadow.radiusScale);
    }
    shadows.end();
  }

  // ---- pointing at the menu, when the panels are our own copy of the kit ------------------------------------------
  function updatePointer() {
    const pointer = hud.pointer;
    if (!pointer) return;
    if (!hud.menuVisible) { pointer.point('left', null); pointer.point('right', null); return; }
    if (ctx.isImmersive()) {
      for (let i = 0; i < 2; i++) {
        const hand = i === 0 ? 'left' : 'right';
        const c = ctx.controllers ? ctx.controllers[hand] : null;
        if (!c || !c.ray || !c.connected) { pointer.point(hand, null); continue; }
        c.ray.updateWorldMatrix(true, false);
        _pos.setFromMatrixPosition(c.ray.matrixWorld);
        _dir.set(0, 0, -1).transformDirection(c.ray.matrixWorld);
        pointer.point(hand, _pos, _dir);
      }
    } else {
      ctx.viewerPosition(_head);
      _dir.set(desk.x, desk.y, 0.5).unproject(ctx.camera).sub(_head).normalize();
      pointer.point('right', _head, _dir);
      pointer.point('left', null);
    }
  }

  // ---- numbers for the report ----------------------------------------------------------------------------------
  function readPerf() {
    const info = ctx.renderer && ctx.renderer.info ? ctx.renderer.info.render : null;
    if (!info) return null;
    if (info.calls > perfPeakCalls) perfPeakCalls = info.calls;
    if (info.triangles > perfPeakTris) perfPeakTris = info.triangles;
    return info;
  }
  function logPerf(when) {
    const info = readPerf();
    if (!info || !trace) return;
    trace('perf', `${when}: ${info.calls} draw calls, ${info.triangles} triangles (peak ${perfPeakCalls} / ${perfPeakTris}); in the air ${flying.length}, juice ${juice.live}`);
  }

  // ---- the frame (FrostSliceGame.Update) -----------------------------------------------------------------------
  function update(dt) {
    if (!active) return;
    sfx.update();
    if (!built) return;
    if (!started) {
      frames++;
      ctx.viewerPosition(_head);
      const tracked = !ctx.isImmersive() || _head.y > 0.2 || frames > 45;       // wait for the first real head pose
      if (frames >= 2 && tracked) start();
      return;
    }
    if (reanchorIn > 0 && --reanchorIn === 0) anchor();
    clock += dt;
    if (autoplay && phase === 'ready' && !autoStarted && (autoStartIn -= dt) <= 0) { autoStarted = true; startRound(); }   // dev: press Start by itself, once

    updatePointer();
    hud.update(dt);
    updateDebris(dt);
    ctx.camera.getWorldQuaternion(_facing).premultiply(invStageQuat);
    juice.update(dt, _facing);

    if (phase !== 'playing') applyFruit();
    else if (!toldPending && custom.hasPending && custom.status === 'ready') {
      toldPending = true;                                    // it joins at the next round; say so without stopping this one
      hud.popups.add(0, 1.72, 0.9, TEXT.fruitNext, COLORS.slate, _headLocal, 3.5);
    }

    if (phase === 'playing') {
      if (dev) readPerf();
      roundTime += dt;
      timeLeft -= dt;
      if (timeLeft <= 0) {
        timeLeft = 0;
        updateHud();
        endRound(TEXT.timeUp);
      } else {
        // Waves: a few fruit close together, then a pause that shortens as the round goes on.
        nextWave -= dt;
        if (nextWave <= 0 && !debug.noWaves) {
          const progress = roundTime / roundSeconds;
          const count = 1 + Math.floor(Math.random() * (progress < 0.3 ? 2 : progress < 0.7 ? 3 : 4));
          for (let i = 0; i < count; i++) {
            if (pendingCount < pending.length) { pending[(pendingHead + pendingCount) % pending.length] = roundTime + i * RULES.waveSpacing; pendingCount++; }
          }
          nextWave = RULES.wavePauseStart + (RULES.wavePauseEnd - RULES.wavePauseStart) * Math.min(1, progress) + count * RULES.waveSpacing;
        }
        while (pendingCount > 0 && pending[pendingHead] <= roundTime) {
          pendingHead = (pendingHead + 1) % pending.length; pendingCount--;
          launch();
        }
        updateFlying(dt);
        updateBlades(dt);
        if (phase === 'playing') {
          const second = Math.ceil(timeLeft);
          if (second !== shownSecond) { shownSecond = second; hud.setTime(TEXT.time(timeLeft)); }
          if (trace && clock >= perfAt) { perfAt = clock + 5; logPerf('playing'); }
        }
      }
    }
    updateShadows();
  }

  // ---- for checks, as FrostSliceGame's Debug* members are -------------------------------------------------------
  const debug = {
    noWaves: false,
    launch(hazard = false) { return phase === 'playing' ? Boolean(launch(hazard ? 2 : 1)) : false; },
    setTimeLeft(seconds) { timeLeft = seconds; },
    start() { startRound(); },
    state() {
      return {
        phase, score, lives, best, sliced, maxCombo, hazardsHit, launched, timeLeft, roundTime, flying: flying.length,
        popups: hud ? hud.popups.shown : 0, juice: juice.emitted, sounds: sfx.played, soundSources: sfx.sources, spoken: voice ? voice.spoken.slice() : [],
        panels: hud ? hud.kind : null, standIns: assets.fallbacks.slice(), triangles: assets.triangles,
        fruit: custom.status, scanned: Boolean(custom.active), scannedInAir: flying.filter((f) => f.custom).length,
        menu: hud ? hud.menuVisible : false, hud: hud ? hud.hudVisible : false,
        blades: blades.map((b) => b.holder.visible), peak: { calls: perfPeakCalls, triangles: perfPeakTris },
      };
    },
  };
  if (dev) window.__frostslice = debug;

  // ---- the tab ------------------------------------------------------------------------------------------------
  return {
    name: 'Frost Slice',
    group,

    enter() {
      active = true; started = false; frames = 0; reanchorIn = 0;
      stage.visible = false;
      setPhase('loading', 'entered');
      // Unity plays this game in passthrough. In AR the real room stays; otherwise the scene's own sky (the hub's).
      try { if (typeof ctx.setEnvironment === 'function') ctx.setEnvironment(null); } catch { /* the shell's default is fine */ }
      if (!shellMovesHands) listen(true);
      if (!building) building = build().catch((err) => { console.error('[frostslice] could not be built', err); });
      custom.start();
    },

    exit() {
      active = false;
      custom.stop();
      listen(false);
      if (voice) voice.hush();
      clearFlying(); clearDebris();
      shadows.clear(); juice.clear();
      hideBlades();
      if (hud) hud.hideAll();
      setPointers(true);
      assets.restoreLight();
      stage.visible = false;
      setPhase('off', 'left');
    },

    update,

    onSelectStart(hand) {
      sfx.unlock();
      if (hud && hud.pointer && hud.menuVisible) hud.pointer.press(hand);
    },

    /**
     * B and X open the shell's tab menu. Unity has no such menu; so that it can be used in the middle of a
     * round, the pointer rays come back for the rest of that round.
     */
    onButtonDown(hand, name) {
      if (phase === 'playing' && (name === 'b' || name === 'x') && shellMovesHands) ctx.input.state.pointersEnabled = true;
    },

    /** The shell's recentre (Y on the left controller, R on a keyboard, the menu's button). */
    onRecenter() { if (started) reanchorIn = 2; },

    /** Free everything for good (the shell never needs to; tests do). */
    dispose() {
      this.exit();
      if (hud) hud.dispose();
      for (let i = 0; i < blades.length; i++) blades[i].trail.dispose();
      disposeTrailMaterial();
      shadows.dispose(); juice.dispose();
      custom.dispose();
      assets.dispose(); sfx.dispose();
      if (dev && window.__frostslice === debug) delete window.__frostslice;
    },
  };
}
