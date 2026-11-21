// The Bottle Rocket tab: the child's scanned water bottle becomes a rocket they pilot through six missions.
// Spec: docs/superpowers/specs/2026-11-21-bottle-rocket-design.md. Physics and rules are pure (flight.js, run.js);
// this file places things, reads the controls and plays the moments.
//
// Phases: choose -> scanning -> ready -> flying -> won | failed -> ready (next or again) ... -> done.
// ("outside" is the short fade between mission 4 and mission 5.)
// Room missions sit on a "stage": a group at the pad, 0.8 m in front of the viewer and 0.3 m below the eyes, local -Z
// facing away from them. Sky missions sit on a stage 6 m ahead on the ground, inside the sky field.
//
// Dev only (localhost): ?autoplay=1 flies every mission with the autopilot and the practice bottle,
// ?mission=N starts at mission N, window.__rocket has state() for checks (dev/check.mjs).

import * as THREE from 'three';
import { MISSIONS, FAIL_LINES } from './missions.js';
import { ROOM, SKY, H, stepFixed } from './flight.js';
import { createRun, stepRun } from './run.js';
import { autopilot } from './autopilot.js';
import { createControls } from './controls.js';
import { createRocket, buildPracticeBottle } from './rocket.js';
import { createCourse } from './course.js';
import { createSky } from './sky.js';
import { createForces } from './forces.js';
import { createHud } from './hud.js';
import { createToyScan } from '/vr/core/toyscan.js';

const SKY_SCALE = 8;
const SKY_GROUND_DROP = 0.05;      // metres the sky field's ground sits under the pad top and landing circle (no z-fighting)
const BOTTLE_WORDS = {
  hold: 'Hold your bottle up in front of me!',
  phone: 'Take a picture of your water bottle with the phone!',
  hint: 'Take a picture of your bottle with the phone',
  scanning: 'Scanning your bottle...',
  waiting: 'Waiting for a picture from the phone...',
  greeting: "Your bottle is a rocket now, {child}! Let's learn to fly!",
  greeting2: '',
  noName: 'your bottle',
};
const PRACTICE_LINE = "Let's fly this practice bottle!";

const _head = new THREE.Vector3(), _fwd = new THREE.Vector3(), _at = new THREE.Vector3();

function isDev(ctx) {
  if (ctx.dev && ctx.dev.harness) return true;
  return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
}

export function createRocketGame(ctx) {
  const dev = isDev(ctx);
  const query = ctx.params || new URLSearchParams(location.search);
  const autoMode = dev && query.get('autoplay') === '1';
  const startAt = dev ? Math.max(0, Math.min(MISSIONS.length - 1, (parseInt(query.get('mission'), 10) || 1) - 1)) : 0;

  const group = new THREE.Group(); group.name = 'BottleRocket';
  const stage = new THREE.Group(); stage.name = 'RocketStage'; group.add(stage);
  const sky = createSky(ctx); group.add(sky.group);
  const course = createCourse(); stage.add(course.group);
  const rocket = createRocket(); stage.add(rocket.object);
  const forces = createForces(ctx); stage.add(forces.group);       // a direct child of the stage (forces.js undoes its yaw)
  const controls = createControls(ctx);
  const autoOut = { angles: { pitch: 0, yaw: 0, roll: 0 }, thrust: false };
  // Every HUD press also disarms the launch: thrust needs a fresh press after any button (see update()).
  const press = (fn) => () => { armed = false; fn(); };
  const hud = createHud(ctx, {
    scan: press(() => { phase = 'scanning'; hud.setMessage('Scanning...', 'Take a picture of your water bottle with the phone.'); hud.show(['practice']); toyScan.start(); }),
    // While a scan waits for the phone, pressing the practice button brings the fallback (the practice bottle).
    practice: press(() => (toyScan.busy ? toyScan.start() : useBody(null))),
    arrows: press(() => toggleArrows()),
    again: press(() => startMission(index)),
    next: press(() => startMission(index + 1)),
    outside: press(() => goOutside()),
    restart: press(() => { place = null; startMission(0); }),
  });
  group.add(hud.group);

  let phase = 'choose', index = startAt, run = null, place = null, params = ROOM, body = 'practice';
  let arrowsOn = false, autoWait = 0, buzz = 0, unsubscribe = null, active = false;
  let armed = false;               // the trigger has been let go since the mission was set up (a button press is not a launch)
  const pendingLines = [];         // said (queued) on the next frame, after whatever the scan is saying
  let gen = 0;                     // bumped on enter and exit, so a fade that outlives the tab does nothing
  let settle = null;               // after a win or a far fail: the rocket keeps falling (visuals only) until it lands
  const COAST = { target: null, thrust: false };
  let roomParams = { ...ROOM };
  const skyParams = { ...SKY };

  const toyScan = createToyScan({
    ctx, ui: ctx.ui, audio: ctx.audio, rig: ctx.rig, parent: group, words: BOTTLE_WORDS,
    fallbackToy: () => ({ model: buildPracticeBottle(), name: 'Practice bottle', greeting: PRACTICE_LINE, greeting2: '' }),
    // The scan speaks its greeting right after this, so the mission's own line waits for it.
    takeToy(model, gift) {
      if (gift) { useBody(model, true); return; }
      disposeGeometry(model);                        // the fallback's own copy: the rocket builds its practice bottle
      useBody(null, true);
    },
    setScanView(on) { stage.visible = !on; },
    setStatus() {},
  });

  function toggleArrows() {
    arrowsOn = !arrowsOn;
    forces.group.visible = arrowsOn;
    if (arrowsOn && run) drawForces();
  }

  function disposeGeometry(model) {
    if (model) model.traverse((o) => { if (o.geometry) o.geometry.dispose(); });   // geometry only: materials may be shared
  }

  function useBody(model, fromScan = false) {
    if (phase === 'outside') return;
    body = rocket.setBody(model);
    if (model && body === 'practice') {                                // the scan was too thin to be a body
      disposeGeometry(model);
      if (fromScan) pendingLines.push(PRACTICE_LINE); else ctx.say(PRACTICE_LINE);
    }
    startMission(index, fromScan);
  }

  // Outside, the sky field replaces the shell's surroundings (VR and the desktop preview): its sky would otherwise
  // paint over the field's sphere (which does not write depth) and its snow plain would fight the field's ground.
  // In AR the shell already hides them, so whatever it had is put back as it was.
  let envHidden = false, envWasVisible = true;
  function setOutside(on) {
    sky.group.visible = on;
    const env = ctx.environment && ctx.environment.root;
    if (!env) return;
    if (on && !envHidden) { envWasVisible = env.visible; env.visible = false; envHidden = true; }
    else if (!on && envHidden) { env.visible = envWasVisible; envHidden = false; }
  }

  function placeRoom() {
    ctx.viewerPosition(_head); ctx.rig.viewerForwardFlat(_fwd);
    stage.position.set(_head.x + _fwd.x * 0.8, _head.y - 0.3, _head.z + _fwd.z * 0.8);
    stage.rotation.set(0, Math.atan2(-_fwd.x, -_fwd.z), 0);
    roomParams = { ...ROOM, floorY: ctx.rig.floorY() - stage.position.y };
    setOutside(false);
    hud.place(_head, _fwd);
    place = 'room';
  }

  function placeSky() {
    ctx.viewerPosition(_head); ctx.rig.viewerForwardFlat(_fwd);
    const floor = ctx.rig.floorY();
    stage.position.set(_head.x + _fwd.x * 6, floor, _head.z + _fwd.z * 6);
    stage.rotation.set(0, Math.atan2(-_fwd.x, -_fwd.z), 0);
    sky.place(_head, floor - SKY_GROUND_DROP);       // the pad top sits on the floor; the ground just under it
    setOutside(true);
    hud.place(_head, _fwd);
    place = 'sky';
  }

  async function goOutside() {
    if (phase === 'outside') return;                  // one fade at a time (autoplay calls this every frame)
    phase = 'outside';
    const token = gen;
    hud.show([]);
    await ctx.rig.fadeTo(1, 0.35);
    if (!active || phase !== 'outside' || token !== gen) return;   // the tab was left (or entered again) meanwhile
    placeSky();
    startMission(index + 1);
    ctx.rig.fadeTo(0, 0.5);
  }

  function startMission(i, queueLine = false) {
    index = i;
    const mission = MISSIONS[i];
    if (place !== mission.place) (mission.place === 'sky' ? placeSky : placeRoom)();
    params = mission.place === 'sky' ? skyParams : roomParams;
    run = createRun(mission, params);
    settle = null;
    course.build(mission, params);
    course.group.visible = true;
    const k = mission.place === 'sky' ? SKY_SCALE : 1;
    rocket.setScale(k);
    rocket.setChute(false);
    forces.setScale(k, params.arrowPerUnit);
    arrowsOn = mission.arrows;
    forces.group.visible = arrowsOn;
    drawForces();                                     // all forces are zero on the pad: this hides the arrows
    showRocket();
    hud.setMission(i, mission);
    hud.setWater(1);
    hud.show(['arrows']);
    controls.reset();
    ctx.input.state.pointersEnabled = true;
    if (queueLine) pendingLines.push(mission.line); else ctx.say(mission.line);
    phase = 'ready';
    armed = false;
    autoWait = 1.2;
  }

  function showRocket() {
    const s = run.state;
    rocket.object.position.fromArray(s.pos);
    rocket.object.quaternion.fromArray(s.quat);
  }

  function drawForces() {
    _at.fromArray(run.state.pos);
    ctx.viewerPosition(_head);
    forces.update(run.state, _at, _head);
  }

  function finish() {
    const mission = MISSIONS[index];
    ctx.input.state.pointersEnabled = true;
    if (run.won) {
      phase = 'won';
      ctx.audio.sfx('success', 0.7);
      ctx.say(mission.win);
      const last = index === MISSIONS.length - 1;
      if (last) { phase = 'done'; hud.setMessage('All missions done!', 'You learned thrust, pitch, yaw, roll, lift and drag.'); hud.show(['restart']); }
      else { hud.setMessage('Mission complete!', mission.win); hud.show([MISSIONS[index + 1].place !== mission.place ? 'outside' : 'next']); }
      ctx.log('rocket_mission', { mission: mission.id, won: true, body });
    } else {
      phase = 'failed';
      const line = FAIL_LINES[run.reason] || FAIL_LINES.landed;
      ctx.audio.sfx('buzz', 0.5);
      ctx.say(line);
      hud.setMessage('Try again!', line);
      hud.show(['again']);
      ctx.log('rocket_mission', { mission: mission.id, won: false, reason: run.reason, body });
    }
    // A win at a ring, or flying off too far, leaves the rocket in the air: let it come down under its parachute.
    if (!run.state.landed && run.state.launched && (run.won || run.reason === 'far')) settle = { acc: 0, t: 0 };
    autoWait = 1.5;
  }

  /** After the run is decided: keep the flight going with no thrust (visuals only) until the rocket lands. */
  function coast(dt) {
    const s = run.state;
    settle.acc += Math.min(dt, 0.1); settle.t += dt;
    while (settle.acc >= H && !s.landed) { settle.acc -= H; stepFixed(s, COAST, params); }
    showRocket();
    rocket.setChute(s.chute);
    if (arrowsOn) drawForces();
    if (s.landed || settle.t > 30) { settle = null; if (arrowsOn) forces.group.visible = false; }
  }

  function autoStep(dt) {
    if (phase === 'choose') { useBody(null); return; }
    if ((autoWait -= dt) > 0) return;
    if (phase === 'won') { if (MISSIONS[index + 1].place !== MISSIONS[index].place) goOutside(); else startMission(index + 1); }
    else if (phase === 'failed') startMission(index);
  }

  const debug = {
    state: () => ({
      phase, mission: index, next: run ? run.next : 0, won: run ? run.won : false, failed: run ? run.failed : false,
      reason: run ? run.reason : null, water: run ? run.state.water : 1, body, place,
    }),
    practice: () => useBody(null),
  };

  return {
    name: 'Bottle Rocket', group,
    enter() {
      active = true;
      gen++;
      ctx.input.state.desktopMoveEnabled = false;      // W A S D steer here
      place = null;
      placeRoom();
      phase = 'choose';
      index = startAt;
      run = null; settle = null; pendingLines.length = 0;
      stage.visible = true; hud.group.visible = true;
      hud.setMessage('Bottle Rocket', 'Turn your water bottle into a rocket!');
      hud.show(['scan', 'practice']);
      // Whatever the last visit left (a sky course, a rocket in mid-air) waits out of the way: no course until a
      // mission starts, and the rocket upright on the pad at room scale.
      course.group.visible = false;
      rocket.setBody(null);
      rocket.setScale(1); rocket.setChute(false);
      rocket.object.position.set(0, 0, 0); rocket.object.quaternion.identity();
      forces.group.visible = false;
      if (ctx.gifts) unsubscribe = ctx.gifts.subscribe((gift) => { toyScan.offer(gift); });
      ctx.say('Want to turn your water bottle into a rocket? Scan it with the phone!');
      if (dev) window.__rocket = debug;
    },
    exit() {
      active = false;
      gen++;
      toyScan.cancel();
      if (unsubscribe) { unsubscribe(); unsubscribe = null; }
      ctx.input.state.desktopMoveEnabled = true;
      ctx.input.state.pointersEnabled = true;
      setOutside(false);
      pendingLines.length = 0;
      if (dev && window.__rocket === debug) delete window.__rocket;
    },
    update(dt) {
      if (!active) return;
      toyScan.update(dt);
      for (const line of pendingLines) ctx.say(line, { queue: true });
      pendingLines.length = 0;
      if (autoMode) autoStep(dt);
      if (phase !== 'ready' && phase !== 'flying') {
        if (settle && run) coast(dt);
        rocket.update(dt, false);                     // let the last spray fall
        return;
      }
      const input = autoMode ? autopilot(run, autoOut) : controls.read(dt);
      if (phase === 'ready') {
        if (!autoMode && !armed) { armed = !input.thrust; return; }
        if (!input.thrust) return;
        if (!autoMode) { controls.calibrate(); controls.read(0); }
        phase = 'flying';
        hud.show([]);
        ctx.input.state.pointersEnabled = false;
      }
      const passed = run.next;
      stepRun(run, input, dt);
      const s = run.state;
      showRocket();
      rocket.setChute(s.chute);
      rocket.update(dt, s.firing);
      hud.setWater(s.water);
      const handName = autoMode ? 'right' : controls.hand().name;
      if (s.firing && (buzz -= dt) <= 0) { buzz = 0.12; ctx.haptic(handName, 0.2, 40); }
      if (arrowsOn) drawForces();
      if (run.next !== passed) {
        course.setProgress(run.next);
        ctx.audio.chime(course.ringObject(passed));
        ctx.haptic(handName, 0.6, 80);
      }
      run.events.length = 0;
      if (run.won || run.failed) finish();
    },
    onSqueezeStart() { if (phase === 'ready' || phase === 'flying') toggleArrows(); },
    onRecenter() {
      if (phase === 'outside') return;
      if (place === 'sky') {                          // the course stays put; the card and gauge come back in front
        ctx.viewerPosition(_head); ctx.rig.viewerForwardFlat(_fwd);
        hud.place(_head, _fwd);
        return;
      }
      if (place !== 'room' || phase === 'flying') return;
      place = null; placeRoom();
      // A mission waiting on the pad gets a fresh run with the new floor height.
      if (phase === 'ready') { params = roomParams; run = createRun(MISSIONS[index], params); showRocket(); }
    },
  };
}
