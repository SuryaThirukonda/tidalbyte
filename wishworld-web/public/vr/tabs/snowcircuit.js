// Snow Circuit: Unity's seated cockpit racer (Scripts/Games/SnowCircuitGame.cs, RaceRivals.cs, scene
// Game_SnowCircuit.unity) for the headset browser. Hold both controllers like a steering wheel: the tilt of
// the line between the hands steers. Right trigger accelerates, left trigger brakes. Three laps of the snowy
// circuit against four computer cars; a gentle knock is the worst that can happen.
//
// The game's rules and numbers live in /vr/games/snowcircuit/ (sim.js, rivals.js, track.js: line-for-line
// ports of the C#, in Unity coordinates); scene.js draws them, hud.js writes the menu, countdown and dashboard,
// sfx.js makes the engine and the effects. This file joins them to the shell.
//
// How the player sits. Unity parents the rig to the car and calls XRRig.Recenter(car, true, 1.05): head above
// the car's origin at seat height, facing down the nose. A headset cannot be moved in WebXR, so the car is
// put under the head instead, and from then on the world is moved under the car. The view turns with the car:
// up to 110 degrees a second at walking pace and 55 at top speed (Unity: 75 and 34; sharper here, see sim.js). Y on the left controller
// (R on a keyboard) seats the player again, as in Unity.
//
// Unity's .env options, as URL parameters:
//   raceview=world|room   WISHWORLD_RACE_VIEW. world: the alpine valley all around (Unity's default; what VR and the
//                         desktop preview show). room: only the track and the cars are drawn and the real room shows
//                         through (what a passthrough session shows; a grey backdrop stands in for the room elsewhere,
//                         as in the Unity editor). Without the parameter the session decides: passthrough = room.
//   rivals=0..5           WISHWORLD_RACE_RIVALS (default 4). 0 brings back the ghost car of the session's best lap.
// Dev only:
//   autodrive=1           a driver that follows the centre line presses Start and races (autodrive=loop keeps racing)
//   speed=N               run the game N times faster (N steps a frame)
//   racelog=1             print countdown, checkpoints, laps, places and the finish to the console
//   nomodels=1            use only the built-in stand-in shapes, as if no model file had loaded
//
// Desktop preview (Unity's keyboard stand-in): A / D steer, W accelerates, S brakes; drag to look around.

import * as THREE from 'three';
import { buildTrack, moveTowards, DEG2RAD } from '/vr/games/snowcircuit/track.js';
import { SnowCircuitSim, Phase, STRINGS, steerFromHands, formatTime } from '/vr/games/snowcircuit/sim.js';
import { createRaceScene, RACE_ENV } from '/vr/games/snowcircuit/scene.js';
import { createHud } from '/vr/games/snowcircuit/hud.js';
import { createRaceAudio } from '/vr/games/snowcircuit/sfx.js';
import { createAutodrive } from '/vr/games/snowcircuit/autodrive.js';

export const meta = { id: 'snowcircuit', label: 'Snow Circuit', order: 5 };

const BEST_KEY = 'SnowCircuitBestLap';             // the PlayerPrefs key in Unity

const _head = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _left = new THREE.Vector3();
const _right = new THREE.Vector3();

function readBest() {
  try { const v = Number(localStorage.getItem(BEST_KEY)); return v > 0 && Number.isFinite(v) ? v : 0; } catch { return 0; }
}
function writeBest(v) { try { localStorage.setItem(BEST_KEY, String(v)); } catch { /* private mode: the best lasts for the session */ } }

/**
 * The guide's voice, the way SnowCircuitGame uses GuideVoice: say (caption and voice, in turn), read (voice
 * only, in turn: the words are already on a panel), readNow (voice only, at once), hush.
 */
function createVoice(ctx) {
  const guide = ctx.guide;
  if (guide && typeof guide.say === 'function') {
    // The shell's guide plays the recorded Unity line when the text is in /audio/audio.json, the live voice otherwise.
    return {
      say: (text) => { guide.say(text, { queue: true }); },
      read: (text) => { guide.say(text, { queue: true, caption: false }); },
      readNow: (text) => { guide.say(text, { caption: false }); },
      hush: () => { if (typeof guide.hush === 'function') guide.hush(); else if (ctx.audio) ctx.audio.stop(); },
    };
  }
  // Only the contract's audio: look the line up in the recorded voice bank ourselves, else ask for it to be spoken.
  const audio = ctx.audio || {};
  let bank = null;
  fetch('/audio/audio.json').then((r) => (r.ok ? r.json() : null)).then((index) => {
    bank = new Map();
    for (const line of (index && index.voice) || []) if (line && line.file) bank.set(line.key || keyOf(line.text), line.file);
  }).catch(() => { bank = new Map(); });
  const keyOf = (text) => String(text).trim().toLowerCase().split(/\s+/).filter(Boolean).join(' ');
  const speak = (text) => {
    try {
      const file = bank ? bank.get(keyOf(text)) : null;
      const p = file && typeof audio.playUrl === 'function' ? audio.playUrl('/audio/' + file) : typeof audio.speak === 'function' ? audio.speak(text) : null;
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch { /* silence */ }
  };
  return { say: speak, read: speak, readNow: speak, hush: () => { try { if (audio.stop) audio.stop(); } catch { /* fine */ } } };
}

export function createTab(ctx) {
  const group = new THREE.Group();
  group.name = 'SnowCircuit';
  const params = ctx.params || new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
  const track = buildTrack();
  const fog = new THREE.Fog(new THREE.Color().setRGB(RACE_ENV.fogColor[0], RACE_ENV.fogColor[1], RACE_ENV.fogColor[2], THREE.SRGBColorSpace), RACE_ENV.fogNear, RACE_ENV.fogFar);

  const keys = { KeyW: false, KeyA: false, KeyS: false, KeyD: false };
  const selecting = { left: false, right: false };
  const drive = { steer: 0, throttle: 0, brake: 0 };
  let g = null;                                    // everything that exists only while the tab is open

  const immersive = () => Boolean(ctx.isImmersive && ctx.isImmersive());
  const inputState = () => (ctx.input && ctx.input.state ? ctx.input.state : null);

  function onKeyDown(event) { if (event.code in keys) keys[event.code] = true; }
  function onKeyUp(event) { if (event.code in keys) keys[event.code] = false; }
  function onBlur() { keys.KeyW = keys.KeyA = keys.KeyS = keys.KeyD = false; selecting.left = selecting.right = false; }

  function note(...words) { if (g && g.verbose) console.info('[snowcircuit]', ...words); }

  // ---- seating -------------------------------------------------------------------------------------------------

  /** SnowCircuitGame.Seat: put the player's head at the driving position, facing down the car. */
  function seat() {
    if (!g) return;
    ctx.viewerPosition(_head);
    ctx.viewerForward(_fwd);
    _fwd.y = 0;
    if (_fwd.lengthSq() < 1e-4) { const a = g.scene.seat.rotation.y; _fwd.set(-Math.sin(a), 0, -Math.cos(a)); }   // looking straight up or down: keep the heading
    else _fwd.normalize();
    g.scene.seatAt(_head, _fwd);
    g.seated = true;
  }

  /** WWInput.SteeringMode: while driving, the pointers are off and (on a desktop) the keys drive instead of walking. */
  function setSteeringMode(on) {
    if (!g) return;
    g.steering = on;
    const s = inputState();
    if (s) s.pointersEnabled = !on;
  }

  // ---- input ---------------------------------------------------------------------------------------------------

  function triggerOf(hand) {
    const c = ctx.controllers ? ctx.controllers[hand] : null;
    if (c) {
      if (typeof c.trigger === 'number') return c.trigger;
      const gp = c.gamepad;
      if (gp && gp.buttons && gp.buttons[0]) return gp.buttons[0].value || 0;
    }
    return selecting[hand] ? 1 : 0;
  }
  function isTracked(c) { return Boolean(c && (c.tracked !== undefined ? c.tracked : c.connected) && c.grip); }
  function stickX(c) {
    if (!c) return 0;
    if (c.stick && typeof c.stick.x === 'number') return c.stick.x;
    const ax = c.gamepad && c.gamepad.axes;
    return ax ? (ax.length >= 4 ? ax[2] : ax[0]) || 0 : 0;
  }

  /** What the player asks for this frame: steering -1..1, throttle and brake 0..1. */
  function readInput(dt) {
    if (g.auto && (g.sim.state === Phase.Countdown || g.sim.state === Phase.Racing)) {
      const a = g.auto.update();
      drive.steer = a.steer; drive.throttle = a.throttle; drive.brake = a.brake;
      return;
    }
    if (!immersive()) {
      // DesktopInputSource: while driving, A and D turn two pretend hands about the wheel's centre (up to 55
      // degrees, moving at 3 a second), W is the right trigger and S the left.
      if (g.steering) {
        const target = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
        g.deskSteer = moveTowards(g.deskSteer, target, dt * 5);
        const roll = g.deskSteer * 55 * DEG2RAD;
        const t = steerFromHands(0.34 * Math.cos(roll), -0.34 * Math.sin(roll), g.sim.fullLockDegrees);
        drive.steer = t === null ? 0 : t;
        drive.throttle = keys.KeyW || selecting.right ? 1 : 0;
        drive.brake = keys.KeyS || selecting.left ? 1 : 0;
      } else {
        g.deskSteer = 0;
        drive.steer = 0; drive.throttle = 0; drive.brake = 0;
      }
      return;
    }
    // SnowCircuitGame.ReadSteering: the tilt of the line between the hands, in the car's frame.
    const cs = ctx.controllers || {};
    const l = cs.left, r = cs.right;
    let target = null;
    if (isTracked(l) && isTracked(r)) {
      l.grip.getWorldPosition(_left); r.grip.getWorldPosition(_right);
      g.scene.seat.worldToLocal(_left); g.scene.seat.worldToLocal(_right);
      target = steerFromHands(_right.x - _left.x, _right.y - _left.y, g.sim.fullLockDegrees);
    }
    if (target === null) {
      const x = stickX(r);                                     // one-handed fallback: right thumbstick
      target = Math.abs(x) > 0.15 ? x : 0;
    }
    drive.steer = target;
    drive.throttle = triggerOf('right');
    drive.brake = triggerOf('left');
  }

  // ---- what the game tells us ------------------------------------------------------------------------------------

  const on = {
    countdown(step) {
      if (!g) return;
      if (step === 0) {
        g.hud.hideMenu();
        seat();
        setSteeringMode(true);
        g.voice.hush();
      }
      g.hud.showBig(STRINGS.countdown[step], step === 3 ? 0.6 : 0.45);       // each number lands with a thump
      g.voice.readNow(STRINGS.countdownVoice[step]);
      g.sfx.play(step === 3 ? 'chime' : 'click', 0.7);
      note('countdown', STRINGS.countdown[step]);
    },
    countdownEnd() { if (g) g.hud.hideBig(); },
    checkpoint(next) { if (g && g.verbose) note(`checkpoint passed, next ${next === 0 ? 'the line' : next + '/4'}; lap ${g.sim.lap}/${g.sim.laps} place ${g.sim.place}/${g.sim.racers}`); },
    lapDone(time, best) {
      if (!g) return;
      g.sfx.play('chime', 0.7);
      if (g.verbose) note(`lap time ${formatTime(time)}${best ? ' (best)' : ''}`);
    },
    lap(lap, last) {
      if (!g) return;
      g.voice.say(last ? 'Last lap!' : 'Lap ' + lap + '!');
      if (g.verbose) note(`lap ${lap}/${g.sim.laps} place ${g.sim.place}/${g.sim.racers}`);
    },
    finish(result) {
      if (!g) return;
      g.sfx.play('success', 0.7);
      g.hud.showMenu(result.title, result.info, result.button);
      setSteeringMode(false);
      g.voice.say(result.voice);
      g.finishedAt = g.clock;
      note(`finished: "${result.title}" place ${result.place}/${result.racers} time ${formatTime(result.time)} best lap ${formatTime(result.bestLap)}`);
    },
    bump() {
      if (!g) return;
      g.sfx.play('click', 0.8);
      if (ctx.haptic) { ctx.haptic('left', 0.5, 120); ctx.haptic('right', 0.5, 120); }
      g.bumps++;
      note('bump');
    },
    saveBest: writeBest,
  };

  function startRace() { if (g && g.started) g.sim.startRace(); }
  function goHub() { if (ctx.switchTab) ctx.switchTab('hub'); }

  // ---- the shell's surroundings: this game brings its own valley, sky, sun and fog ---------------------------------

  function takeEnvironment() {
    const scene3 = ctx.scene;
    try { if (ctx.setEnvironment) ctx.setEnvironment(null, { ground: false, ambientSound: false }); } catch { /* an older shell */ }
    g.envRoot = (ctx.environment && ctx.environment.root) || (scene3 && scene3.getObjectByName ? scene3.getObjectByName('Environment') : null) || null;
    g.envWasVisible = g.envRoot ? g.envRoot.visible : false;
    g.savedFog = scene3 ? scene3.fog : null;
    g.fog = g.view === 'world' ? fog : null;                    // room view: RenderSettings.fog = false
    const cam = ctx.camera;
    if (cam && cam.isPerspectiveCamera && cam.far < RACE_ENV.farClip) {       // Unity's far plane: the valley reaches 740 m
      g.savedFar = cam.far; cam.far = RACE_ENV.farClip; cam.updateProjectionMatrix();
    }
    holdEnvironment();
  }
  function holdEnvironment() {
    if (g.envRoot && g.envRoot.visible) g.envRoot.visible = false;
    if (ctx.scene && ctx.scene.fog !== g.fog) ctx.scene.fog = g.fog;
    g.scene.applyLight();
  }
  function giveBackEnvironment() {
    if (g.envRoot) g.envRoot.visible = g.envWasVisible;
    if (ctx.scene) ctx.scene.fog = g.savedFog;
    g.scene.restoreLight();
    const cam = ctx.camera;
    if (g.savedFar && cam) { cam.far = g.savedFar; cam.updateProjectionMatrix(); }
  }

  // ---- tab ---------------------------------------------------------------------------------------------------------

  function enter() {
    if (g) exit();
    // int.TryParse(EnvConfig.Get("WISHWORLD_RACE_RIVALS", "4")): not a whole number means none
    const rivalsText = params.get('rivals');
    let rivalCount = 4;
    if (rivalsText !== null && rivalsText !== '') rivalCount = /^-?\d+$/.test(rivalsText.trim()) ? Math.min(5, Math.max(0, parseInt(rivalsText, 10))) : 0;
    const wanted = (params.get('raceview') || '').toLowerCase();
    const ar = Boolean(ctx.isAR && ctx.isAR());
    const roomView = wanted === 'room' || (wanted !== 'world' && ar);
    const view = roomView ? (ar ? 'room' : 'backdrop') : 'world';
    const autoParam = params.get('autodrive');
    const auto = autoParam === '1' || autoParam === 'loop';

    const sim = new SnowCircuitSim({ track, rivalCount, bestLap: readBest(), on });
    const scene = createRaceScene({
      group, track, rivalCount, roomView, lite: typeof ctx.preferLite === 'function' ? ctx.preferLite() : immersive() || params.get('lite') === '1', noModels: params.get('nomodels') === '1', seatEyeHeight: sim.seatEyeHeight,
    });
    scene.setView(view);
    g = {
      sim, scene, view,
      hud: createHud(ctx, scene.seat, { start: startRace, hub: goHub }),
      sfx: createRaceAudio({ shellAudio: ctx.audio, muted: params.get('mute') === '1' }),
      voice: createVoice(ctx),
      auto: auto ? createAutodrive(sim) : null,
      autoLoop: autoParam === 'loop',
      steps: Math.min(20, Math.max(1, parseInt(params.get('speed') || '1', 10) || 1)),
      verbose: auto || params.get('racelog') === '1',
      frame: 0, clock: 0, seated: false, started: false, steering: false, modelsReady: false,
      deskSteer: 0, engineVolume: 0, bumps: 0, finishedAt: -1, menuAt: -1, lastLog: 0,
      envRoot: null, envWasVisible: false, savedFog: null, fog: null, savedFar: 0,
    };
    takeEnvironment();
    const s = inputState();
    if (s) s.desktopMoveEnabled = false;                        // W A S D drive; they do not walk the head about
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    onBlur();

    const mine = g;
    scene.load().then((loaded) => {
      if (g !== mine) return;
      g.modelsReady = true;
      note(`models: cockpit ${loaded.cockpit}, wheel ${loaded.wheel}, track ${loaded.track}, valley ${loaded.surroundings}, rivals ${loaded.rivals}/${rivalCount}, sky ${loaded.sky}`);
    });
    scene.setCar(sim.carX, sim.carZ, sim.yaw);
    if (auto || params.get('racelog') === '1' || ctx.dev) {
      window.__snowcircuit = {
        get game() { return g; },
        state() {
          if (!g) return null;
          const m = g.sim;
          return {
            phase: ['Ready', 'Countdown', 'Racing', 'Finished'][m.state], lap: m.lap, laps: m.laps, place: m.place, racers: m.racers,
            speed: m.speed, steer: m.steer, raceTime: m.raceTime, lastLap: m.lastLapTime, bestLap: m.bestLap, index: m.index,
            nextCheckpoint: m.nextCheckpoint, onTrack: m.onTrack, car: [m.carX, m.carZ, m.yaw], bumps: g.bumps,
            rivals: m.rivals ? m.rivals.cars.map((c) => ({ name: c.name, distance: c.distance, lane: c.lane, speed: c.speed, finished: c.finished })) : [],
            menu: g.hud.menuVisible, dash: g.hud.dashText, result: m.result, modelsReady: g.modelsReady, loaded: g.scene.loaded,
            engine: { running: g.sfx.engineRunning, volume: g.sfx.engineVolume, pitch: g.sfx.enginePitch, source: g.sfx.source('engine') },
            view: g.view, seated: g.seated,
          };
        },
      };
    }
  }

  // SnowCircuitGame.Start, two frames in: seat the player, start the engine, show the menu, read the instructions.
  function begin() {
    seat();
    g.sfx.startEngine();
    g.hud.showMenu(STRINGS.title, STRINGS.intro, STRINGS.start);
    setSteeringMode(false);
    g.voice.read(STRINGS.voiceIntro);
    g.started = true;
    g.menuAt = g.clock;
  }

  function update(dt) {
    if (!g) return;
    if (dt > 0.1) dt = 0.1;
    g.frame++;
    g.clock += dt;
    if (g.frame === 2) begin();
    holdEnvironment();

    const sim = g.sim;
    if (g.auto && g.started && g.modelsReady) {
      if (sim.state === Phase.Ready && g.clock - g.menuAt > 1.5) sim.startRace();
      else if (g.autoLoop && sim.state === Phase.Finished && g.clock - g.finishedAt > 6) sim.startRace();
    }
    for (let s = 0; s < g.steps; s++) {
      readInput(dt);
      sim.update(dt, drive.steer, drive.throttle, drive.brake);
    }

    const scene = g.scene;
    if (g.seated && !immersive()) { ctx.viewerPosition(_head); scene.holdHead(_head); }
    scene.setCar(sim.carX, sim.carZ, sim.yaw);
    if (sim.rivals) {
      const cars = sim.rivals.cars;
      for (let i = 0; i < cars.length; i++) scene.setRival(i, cars[i].x, cars[i].z, cars[i].fx, cars[i].fz);
      scene.commitRivals();
    } else scene.setGhost(sim.ghost.active, sim.ghost.x, sim.ghost.z, sim.ghost.yaw);
    scene.setWheel(sim.steer);

    // engine.pitch = 0.6 + Speed / topSpeed * 1.3; volume 0.22 racing, easing to 0.06 otherwise
    g.engineVolume = sim.state === Phase.Racing ? 0.22 : moveTowards(g.engineVolume, 0.06, dt);
    g.sfx.setEngine(0.6 + sim.speed / sim.topSpeed * 1.3, g.engineVolume);

    g.hud.update(dt);
    g.hud.updateDash(sim);

    if (g.verbose && sim.state === Phase.Racing && sim.raceTime - g.lastLog >= 5) {
      g.lastLog = sim.raceTime;
      const rivals = sim.rivals ? sim.rivals.cars.map((c) => `${c.name} ${c.distance.toFixed(0)}m`).join(' ') : 'none';
      note(`t ${formatTime(sim.raceTime)} lap ${sim.lap}/${sim.laps} place ${sim.place}/${sim.racers} speed ${(sim.speed * 3.6).toFixed(0)} km/h at ${(sim.playerDistance()).toFixed(0)}m; rivals: ${rivals}`);
    }
    if (sim.state !== Phase.Racing) g.lastLog = 0;
  }

  function exit() {
    if (!g) return;
    const old = g;
    old.sfx.dispose();                                          // the engine stops
    old.voice.hush();
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    const s = inputState();
    if (s) { s.pointersEnabled = true; s.desktopMoveEnabled = true; }
    giveBackEnvironment();
    old.hud.dispose();
    // Free the GPU copies of the models (the files stay cached for the next visit); materials are shared.
    old.scene.seat.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
    old.scene.dispose();
    g = null;
    if (window.__snowcircuit) delete window.__snowcircuit;
  }

  return {
    name: 'Snow Circuit',
    group,
    enter, exit, update,
    onSelectStart(hand) { if (hand === 'left' || hand === 'right') selecting[hand] = true; },
    onSelectEnd(hand) { if (hand === 'left' || hand === 'right') selecting[hand] = false; },
    onSqueezeStart() {}, onSqueezeEnd() {},
    /** The shell's recentre (Y on the left controller): sit the player back in the car. */
    onRecenter() { if (g && g.started) seat(); },
  };
}
