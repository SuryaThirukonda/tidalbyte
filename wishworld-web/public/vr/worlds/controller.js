// The Unity World scene on the web: WorldController.cs.
//
// One world at a time: its sky, fog, light and surroundings (through the shell's environment, which reads
// the same exported files Unity built), its creatures on their rings around the player, the info panel with
// the found counter, the fact cards, the quiz and the penguin guide. In the real room (an AR session, or the
// "In my room" button) the sky and ground go away and the creatures come to the viewer, smaller, closer and
// slower, exactly as WorldController.ApplyEnvironment and Spawner do it.
//
// Frames: the viewer starts at the origin looking down -Z; a Unity position (x, y, z) is (x, y, -z).
// Everything placed "around the player" hangs from `anchor`: the origin in VR, the viewer's own spot and
// heading in the real room.
//
// URL parameters (for checking and screenshots; `world` is also how to link straight into a world):
//   world=<id>     open that world instead of the picker (aquarium, zoo, space, dinosaurs, arctic, rainforest, farm, sky, blank)
//   ar=1           the shell's AR preview (the real-room version against grey); on a host without it, starts with
//                  "In my room" on                  picker=1   show the picker over the world
//   learn=<id>     play that creature's fact card      quiz=1     open the quiz
//   yaw=<deg>&pitch=<deg>   turn the desktop preview's head (positive yaw looks left)

import * as THREE from 'three';
import { WORLDS, worldById, creatureById, THEME } from '/shared/creatures.js';
import * as Models from '/shared/models.js';
import { createCreatureSet } from './creatures.js';
import { pickKit, createPicker, createInfoPanel, createFactCard, createQuiz } from './panels.js';
import { createVoice } from './voice.js';

// Blob shadows and falling snow come from the shell's effects file when it is there.
let fx = null;
try { fx = await import('/vr/core/fx.js'); } catch { fx = null; }

const DEG = Math.PI / 180;
const WORLDS_MENU_LINE = 'Worlds. Where would you like to go?';        // VoiceLines.WorldsMenu
const AR_LINE = 'This is your room. Say or pick what should visit!';   // WorldController.Start, AR mode
const FOUND_ALL_LINE = 'You found them all! Press Finish for a quiz.';
const ROOM_GREY = 0x6b6e73;                                            // PassthroughToggle's backdrop with no headset

/** AppState.learned: creature ids whose fact card has played this session. Survives leaving the tab. */
const learned = new Set();
let urlWorldUsed = false;

const _head = new THREE.Vector3(), _fwd = new THREE.Vector3(), _pos = new THREE.Vector3();
const _origin = new THREE.Vector3(), _dir = new THREE.Vector3(), _hit = new THREE.Vector3();
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();
const AXIS_Z = new THREE.Vector3(0, 0, 1), AIM = new THREE.Vector3(0, 0, -1);
const HANDS = ['left', 'right'];

export function createWorldsTab(ctx) {
  const group = new THREE.Group();
  group.name = 'Worlds';
  const anchor = new THREE.Group();          // Unity's Floor and Forward
  anchor.name = 'WorldAnchor';
  group.add(anchor);

  const params = ctx.params && typeof ctx.params.get === 'function' ? ctx.params : new URLSearchParams(globalThis.location ? location.search : '');
  const menuWorlds = WORLDS.filter((w) => w.showInMenu);
  const hasShellEnv = Boolean(ctx.environment && ctx.environment.root);

  // What is on show: WorldState.
  const state = { worldId: '', ar: false, entries: [] };
  let active = false, serial = 0, clock = 0;
  let lastAR = false, lastImmersive = false, anchorPlaced = false, overriding = false, shownEnv = '', shownSky = 'hub';

  // Built on enter, gone on exit.
  let kit = null, voice = null, shadows = null, creatures = null;
  let picker = null, info = null, fact = null, quiz = null;
  let penguin = null, backdrop = null, hub = null, lines = null, timers = [];

  const realAR = () => Boolean(ctx.isAR && ctx.isAR());
  const immersive = () => Boolean(ctx.isImmersive && ctx.isImmersive());
  /** The lighter cut of an exported scene: always on a headset (the shell decides). */
  const preferLite = () => (typeof ctx.preferLite === 'function' ? Boolean(ctx.preferLite()) : immersive());
  /** WorldState.ar: the real room, or the "In my room" switch. */
  const inRoom = () => realAR() || state.ar;
  const hasTab = (id) => (typeof ctx.hasTab === 'function' ? ctx.hasTab(id) : typeof ctx.switchTab === 'function');

  // ------------------------------------------------------------------------------------------ surroundings

  function setShellEnvironment(id, options) {
    if (typeof ctx.setEnvironment !== 'function') return;
    try { ctx.setEnvironment(id, options); } catch (err) { console.warn('[wishworld] worlds: setEnvironment failed', err && err.message); }
  }

  /**
   * Change what the shell's environment shows, then free the graphics memory of what it showed before
   * (its sky photo and its surroundings), so that only one world is held at a time. The shell keeps the
   * files themselves cached, so going back does not download anything again.
   */
  function showEnvironment(key, id, options) {
    const root = hasShellEnv ? ctx.environment.root : null;
    const holder = root ? root.getObjectByName('Scenery') : null;
    const sky = root ? root.getObjectByName('Sky') : null;
    const map = sky && sky.material && sky.material.uniforms ? sky.material.uniforms.map : null;
    const oldModels = holder ? holder.children.slice() : [];
    const oldSky = map ? map.value : null;
    setShellEnvironment(id, options);
    if (key === shownEnv) return;
    shownEnv = key;
    for (const m of oldModels) {
      if (m.parent) continue;
      m.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
    }
    // The sky photo only when the shell is now fetching a different one (it puts the new one in itself).
    const skyOf = id || 'hub';
    if (skyOf !== shownSky) {
      shownSky = skyOf;
      if (oldSky && map && map.value === oldSky) { map.value = null; oldSky.dispose(); }
    }
  }

  /** WorldController.ApplyEnvironment. */
  function applyEnvironment() {
    const def = worldById(state.worldId);
    const pretend = !realAR() && state.ar;
    overriding = pretend && hasShellEnv;
    if (pretend) {
      // "In my room" without passthrough: Unity's plain grey backdrop, white light, no fog, no surroundings, no loop.
      showEnvironment('room', null, { ground: false, ambientSound: false });
      if (!backdrop) backdrop = makeBackdrop();
      backdrop.visible = true;
      if (hasShellEnv) ctx.environment.root.visible = false;
      ctx.scene.fog = null;
      Models.setLighting({ sunColor: [1, 1, 1], sunIntensity: 1, ambient: [0.62, 0.62, 0.62] });
      voice.ambient(null);
      return;
    }
    if (backdrop) backdrop.visible = false;
    if (def) {
      showEnvironment('world:' + def.id, def.id, { scenery: true });
      // The loop stops in the real room. The shell's environment starts it itself.
      voice.ambient(realAR() ? null : def.ambientSound, hasShellEnv);
    } else {
      // No world yet: the picker hangs in the snow hub, as Unity's Worlds menu does.
      showEnvironment('hub', 'hub', { ground: !(hub && hub.ready) });
      voice.ambient(null, hasShellEnv);
    }
  }

  function makeBackdrop() {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(120, 16, 8),
      new THREE.MeshBasicMaterial({ color: ROOM_GREY, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false }),
    );
    mesh.name = 'RoomBackdrop';
    mesh.frustumCulled = false;
    mesh.renderOrder = -10;
    group.add(mesh);
    return mesh;
  }

  // The snow hub behind the picker: the same exported scene the hub tab shows (shared with it through the model cache).
  function makeHub() {
    const holder = new THREE.Group();
    holder.name = 'HubBehindPicker';
    holder.rotation.y = Math.PI;               // exported x-mirrored, +Z forward
    holder.visible = false;
    group.add(holder);
    const h = { holder, model: null, ready: false, loading: false, snow: null };
    if (fx && typeof fx.createSnowfall === 'function') {
      h.snow = fx.createSnowfall();
      h.snow.position.set(0, 4.5, -2);
      h.snow.visible = false;
      group.add(h.snow);
    }
    return h;
  }

  async function loadHub() {
    if (!hub || hub.ready || hub.loading || typeof Models.loadGLB !== 'function') return;
    hub.loading = true;
    const mine = hub;
    try {
      const manifest = await Models.loadManifest();
      const entry = (preferLite() && manifest.get('scene_hub_lite')) || manifest.get('scene_hub') || manifest.get('scene_hub_lite');
      if (!entry) return;
      const model = await Models.loadGLB('/models/' + entry.file);
      if (hub !== mine || !active) return;
      hub.model = model;
      hub.holder.add(model);
      hub.ready = true;
      if (!state.worldId && !inRoom()) applyEnvironment();     // the exported terrain is its own ground
    } catch (err) {
      console.warn('[wishworld] worlds: the hub scene is not available behind the picker', err && err.message);
    } finally {
      mine.loading = false;
    }
  }

  function releaseHub() {
    if (!hub || !hub.model) return;
    hub.holder.remove(hub.model);
    hub.model.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
    hub.model = null; hub.ready = false;
  }

  function showHub(on) {
    if (!hub) return;
    hub.holder.visible = on;
    if (hub.snow) hub.snow.visible = on;
    if (on) loadHub(); else releaseHub();
  }

  // ------------------------------------------------------------------------------------------ the guide

  function makePenguin() {
    const root = new THREE.Group();
    root.name = 'PenguinGuide';
    root.visible = false;
    anchor.add(root);
    const p = { root, wings: null, waveUntil: 0, yaw: 0, scale: 0.6, loaded: false };
    (async () => {
      try {
        const manifest = await Models.loadManifest();
        const entry = manifest.get('penguin_guide');
        if (!entry || typeof Models.loadGLB !== 'function') return;
        const model = await Models.loadGLB('/models/' + entry.file);
        if (penguin !== p) return;
        root.add(model);
        const left = model.getObjectByName('LeftWing'), right = model.getObjectByName('RightWing');
        if (left && right) p.wings = { left, right, leftRest: left.quaternion.clone(), rightRest: right.quaternion.clone() };
        p.loaded = true;
        root.visible = true;
        p.waveUntil = clock + 3;
      } catch (err) {
        console.warn('[wishworld] worlds: no penguin guide', err && err.message);
      }
    })();
    return p;
  }

  /** In a world the guide stands at Floor + Forward * 1.5 - Right * 1.55 at 0.6 size; in the hub at (-1.3, 0, 2.15). */
  function posePenguin() {
    if (!penguin) return;
    const inHub = !state.worldId && !inRoom();
    penguin.scale = inHub ? 1 : 0.6;
    penguin.root.position.set(inHub ? -1.3 : -1.55, 0, inHub ? -2.15 : -1.5);
    penguin.root.scale.setScalar(penguin.scale);
    penguin.yaw = Math.atan2(-penguin.root.position.x, -penguin.root.position.z);
    penguin.root.rotation.y = penguin.yaw;
  }

  function updatePenguin(dt) {
    const p = penguin;
    if (!p || !p.loaded) return;
    // PenguinGuide.Update: turn to the player, bob, wave while a new line starts.
    ctx.viewerPosition(_head);
    anchor.worldToLocal(_head);
    const dx = _head.x - p.root.position.x, dz = _head.z - p.root.position.z;
    if (dx * dx + dz * dz > 0.01) {
      let d = Math.atan2(dx, dz) - p.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      p.yaw += d * Math.min(1, dt * 2);
      p.root.rotation.y = p.yaw;
    }
    p.root.position.y = Math.abs(Math.sin(clock * 2.2)) * 0.015 * p.scale;
    if (p.wings) {
      // Unity raises the right wing 105 degrees about Z and shakes it; the export mirrors X, which turns that the other way.
      _qa.copy(p.wings.rightRest);
      if (clock < p.waveUntil) _qa.multiply(_qb.setFromAxisAngle(AXIS_Z, -(105 + Math.sin(clock * 9) * 22) * DEG));
      p.wings.right.quaternion.slerp(_qa, Math.min(1, dt * 10));
      _qa.copy(p.wings.leftRest).multiply(_qb.setFromAxisAngle(AXIS_Z, Math.sin(clock * 2.2) * 5 * DEG));
      p.wings.left.quaternion.slerp(_qa, Math.min(1, dt * 6));
    }
    if (shadows) shadows.place(0, p.root.position, 0.3 * p.scale, 0, 2);
  }

  function say(text) { if (penguin) penguin.waveUntil = clock + 3; return voice.say(text); }
  function sayNow(text) { if (penguin) penguin.waveUntil = clock + 3; return voice.sayNow(text); }

  // ------------------------------------------------------------------------------------------ the HUD

  function foundCount() {
    let n = 0;
    for (const e of state.entries) if (learned.has(e.creatureId)) n++;
    return n;
  }
  function counterText() {
    const total = state.entries.length;
    return total === 0 ? 'Nothing here yet' : foundCount() + ' of ' + total + ' found';
  }
  function updateHud() {
    const def = worldById(state.worldId);
    const showing = Boolean(def) || state.entries.length > 0;
    if (!showing) { info.hide(); return; }
    info.setTitle(def && def.showInMenu ? def.name : inRoom() ? 'My room' : 'Wish world');
    info.setCounter(counterText());
    info.setAR(inRoom(), !realAR() && Boolean(def));
    info.show();
  }

  /** Creature.Learn, FactCardPanel.Show and WorldController.OnLearned. */
  function onLearn(c) {
    const def = c.def;
    c.object.getWorldPosition(_pos);
    voice.learned(def, _pos);
    const isNew = !learned.has(def.id);
    learned.add(def.id);
    fact.show(def, _pos, isNew);
    const reading = voice.read(def.fact);
    if (isNew && typeof ctx.log === 'function') ctx.log('creature_learned', { creature: def.id, world: state.worldId || 'room' });
    info.setCounter(counterText(), isNew);
    if (isNew && state.entries.length > 1 && foundCount() === state.entries.length) {
      void reading;
      say(FOUND_ALL_LINE);
    }
  }

  // ------------------------------------------------------------------------------------------ building the world

  function placeAnchor() {
    if (realAR()) {
      // The real room: the rings go around wherever the child is standing, facing the way they face.
      ctx.viewerPosition(_head);
      ctx.viewerForward(_fwd);
      _fwd.y = 0;
      if (_fwd.lengthSq() < 1e-4) _fwd.set(0, 0, -1);
      _fwd.normalize();
      anchor.position.set(_head.x, typeof ctx.floorY === 'function' ? ctx.floorY() : 0, _head.z);
      anchor.rotation.set(0, Math.atan2(-_fwd.x, -_fwd.z), 0);
    } else {
      anchor.position.set(0, 0, 0);
      anchor.rotation.set(0, 0, 0);
    }
    anchor.updateMatrixWorld(true);
  }

  /** WorldController.Rebuild: surroundings, then every creature from the state. */
  async function rebuild() {
    const def = worldById(state.worldId);
    const room = inRoom();
    fact.hide();
    showHub(!def && !room);
    applyEnvironment();
    placeAnchor();
    posePenguin();
    updateHud();
    // Blob shadows on a real floor: worlds with a full ground, and the real room.
    await creatures.spawn(state.entries, { ar: room, shadows: room || Boolean(def && String(def.groundMode).toLowerCase() === 'full') });
    if (active) updateHud();
  }

  function sceneryReady() {
    if (!hasShellEnv) return true;
    const holder = ctx.environment.root.getObjectByName('Scenery');
    return !holder || holder.children.length > 0;
  }

  function waitFor(test, ms) {
    return new Promise((resolve) => {
      const started = performance.now();
      const tick = () => {
        if (!active || test() || performance.now() - started > ms) resolve();
        else timers.push(setTimeout(tick, 60));
      };
      tick();
    });
  }

  const fade = (alpha, seconds) => (ctx.rig && typeof ctx.rig.fadeTo === 'function' && !realAR() ? ctx.rig.fadeTo(alpha, seconds) : Promise.resolve());

  /** WorldController.LoadWorld, with Unity's white fade between scenes (0.35 s out, 0.45 s back). */
  async function loadWorld(id, { fadeOut = true } = {}) {
    const def = worldById(id);
    if (!def) return false;
    const mine = ++serial;
    picker.close();
    quiz.close();
    if (fadeOut) await fade(1, 0.35);
    if (mine !== serial || !active) return false;
    state.worldId = def.id;
    state.entries = def.creatures.map(([creatureId, count]) => ({ creatureId, count }));
    await rebuild();
    if (mine !== serial || !active) return false;
    if (def.scenery && !inRoom()) await waitFor(sceneryReady, 4000);
    if (mine !== serial || !active) return false;
    if (fadeOut) fade(0, 0.45);
    if (typeof ctx.log === 'function') ctx.log('world_visited', { world: def.id });
    sayNow(def.id === 'blank' ? 'Welcome to the Wish World!' : (def.description || 'Welcome to the ' + def.name + '!'));
    return true;
  }

  // ------------------------------------------------------------------------------------------ buttons

  function openPicker(announce) {
    quiz.close();
    picker.open();
    if (realAR() && !anchorPlaced) return;
    if (announce) voice.read(WORLDS_MENU_LINE);
  }

  function goHome() {
    if (hasTab('hub') && typeof ctx.switchTab === 'function') { ctx.switchTab('hub'); return; }
    // No hub on this host: back to the picker with no world.
    serial++;
    state.worldId = ''; state.entries = []; state.ar = false;
    rebuild();
    openPicker(true);
  }

  function back() {
    if (state.worldId) picker.close(); else goHome();
  }

  /** The wish menu's "In my room" and "Take me there". */
  function toggleAR() {
    if (realAR()) return;
    state.ar = !state.ar;
    say(state.ar ? 'Here it is, in your room.' : 'Off we go!');
    rebuild();
  }

  /** WorldController.StartQuiz. */
  function startQuiz() {
    picker.close();
    const defs = [];
    for (const e of state.entries) {
      const c = creatureById(e.creatureId);
      if (c && c.quiz) defs.push(c);
    }
    quiz.begin(defs, foundCount(), state.entries.length);
  }

  // ------------------------------------------------------------------------------------------ pointing

  // Desktop preview: the mouse is the right trigger, so the pointer is the ray through the cursor.
  const cursor = new THREE.Vector2(0, 0);
  const raycaster = new THREE.Raycaster();
  function onPointerMove(event) {
    const dom = ctx.renderer && ctx.renderer.domElement;
    if (!dom) return;
    const rect = dom.getBoundingClientRect();
    cursor.set(((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1, -(((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1));
  }

  /** A hand's pointer ray in world space. False when that hand has none right now. */
  function handRay(hand, origin, direction) {
    const c = ctx.controllers && ctx.controllers[hand];
    if (!immersive()) {
      if (hand !== 'right') return false;
      raycaster.setFromCamera(cursor, ctx.camera);
      origin.copy(raycaster.ray.origin); direction.copy(raycaster.ray.direction);
      return true;
    }
    if (!c || !c.ray || c.connected === false || c.tracked === false) return false;
    origin.setFromMatrixPosition(c.ray.matrixWorld);
    direction.copy(AIM).transformDirection(c.ray.matrixWorld);
    return true;
  }

  // The pointer line Unity draws while a ray is on something: 6 mm wide at the hand, 3 mm at the far end, peach.
  function makeLines() {
    const geometry = new THREE.CylinderGeometry(0.0015, 0.003, 1, 5, 1, true);
    geometry.translate(0, 0.5, 0);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({ color: THEME.colors.peach, fog: false, toneMapped: false });
    const make = () => {
      const m = new THREE.Mesh(geometry, material);
      m.name = 'WorldsPointerLine'; m.visible = false; m.frustumCulled = false; m.renderOrder = 50;
      group.add(m);
      return m;
    };
    return { geometry, material, left: make(), right: make() };
  }

  function drawLine(hand, to) {
    const line = lines[hand];
    const c = ctx.controllers && ctx.controllers[hand];
    if (!c || !c.ray) { line.visible = false; return; }
    _origin.setFromMatrixPosition(c.ray.matrixWorld);
    const length = _origin.distanceTo(to);
    if (length < 0.05) { line.visible = false; return; }
    line.visible = true;
    line.position.copy(_origin);
    _dir.copy(to).sub(_origin).multiplyScalar(1 / length);
    line.quaternion.setFromUnitVectors(AIM, _dir);
    line.scale.set(1, 1, length);
  }

  function updatePointers(dt) {
    creatures.clearHover();
    for (const hand of HANDS) {
      const line = lines[hand];
      const c = ctx.controllers && ctx.controllers[hand];
      // Menus win over creatures: when the shell says this hand is on a button, leave it alone.
      if ((c && c.hover) || !handRay(hand, _origin, _dir)) { line.visible = false; continue; }
      const target = creatures.pick(_origin, _dir);
      if (!target) { line.visible = false; continue; }
      target.hovered = true;
      _hit.copy(_dir).multiplyScalar(creatures.hit.distance).add(_origin);
      drawLine(hand, _hit);
    }
    // Gaze: looking at one creature for two seconds plays its fact (not while a quiz is open).
    ctx.viewerPosition(_origin);
    ctx.viewerForward(_dir);
    creatures.gaze(_origin, _dir, dt, quiz.blocking);
    // Touch, and in the real room the small ones dart away from a hand. Hands only exist in a headset.
    if (immersive()) {
      for (const hand of HANDS) {
        const c = ctx.controllers && ctx.controllers[hand];
        if (!c || !c.grip || c.connected === false || c.tracked === false) continue;
        _pos.setFromMatrixPosition(c.grip.matrixWorld);
        if (creatures.hand(_pos, dt) && typeof ctx.haptic === 'function') ctx.haptic(hand, 0.5, 80);
      }
    }
  }

  // ------------------------------------------------------------------------------------------ the tab

  function later(seconds, fn) { timers.push(setTimeout(() => { if (active) fn(); }, seconds * 1000)); }

  function applyUrlExtras() {
    const yaw = Number(params.get('yaw')), pitch = Number(params.get('pitch'));
    const desk = ctx.input && ctx.input.desk;
    if (desk && !immersive()) {
      if (params.has('yaw') && Number.isFinite(yaw)) desk.yaw = yaw * DEG;
      if (params.has('pitch') && Number.isFinite(pitch)) desk.pitch = pitch * DEG;
    }
    if (params.get('picker') === '1') later(1.2, () => openPicker(false));
    if (params.get('quiz') === '1') later(1.5, () => startQuiz());
    const want = params.get('learn');
    if (want) later(1.5, () => { const c = creatures.find(want); if (c) creatures.learn(c); });
  }

  const tab = {
    name: 'Worlds',
    group,

    enter() {
      active = true;
      serial++;
      clock = 0;
      state.worldId = ''; state.ar = false; state.entries = [];
      shownEnv = ''; shownSky = 'hub'; overriding = false; anchorPlaced = false;
      lastAR = realAR(); lastImmersive = immersive();

      kit = pickKit(ctx);
      voice = createVoice(ctx, group);
      shadows = fx && typeof fx.createShadowPool === 'function' ? fx.createShadowPool(32) : null;
      if (shadows) anchor.add(shadows.mesh);
      creatures = createCreatureSet({ parent: anchor, shadows, shadowOffset: 1, onLearn });
      picker = createPicker(kit, anchor, { worlds: menuWorlds, onPick: (id) => loadWorld(id), onBack: back });
      info = createInfoPanel(kit, anchor, { onHome: goHome, onFinish: startQuiz, onWorlds: () => openPicker(true), onToggleAR: toggleAR });
      fact = createFactCard(kit, group, ctx);
      quiz = createQuiz(kit, anchor, { voice, onHome: goHome });
      penguin = makePenguin();
      hub = makeHub();
      lines = makeLines();
      const dom = ctx.renderer && ctx.renderer.domElement;
      if (dom) dom.addEventListener('pointermove', onPointerMove);

      // Where to start: a world named by whoever sent us here, or by the page address (once), else the picker.
      let want = ctx.handoff && typeof ctx.handoff === 'object' ? ctx.handoff.world : null;
      if (want) ctx.handoff = null;
      const first = !urlWorldUsed;
      if (!want && first) want = params.get('world');
      if (first) {
        urlWorldUsed = true;
        if (!realAR() && params.get('ar') === '1') state.ar = true;
      }
      if (want && worldById(want)) {
        loadWorld(want, { fadeOut: false });
      } else if (realAR()) {
        // Unity's "AR Worlds": your own room, and a school of clownfish to begin with ("flying fish").
        const fish = creatureById('clownfish');
        if (fish) state.entries = [{ creatureId: fish.id, count: Math.max(1, fish.addCount || 8) }];
        rebuild();
        openPicker(false);
        say(AR_LINE);
        if (fish) say('Here comes the ' + fish.name.toLowerCase() + '!');
      } else {
        rebuild();
        openPicker(true);
      }
      if (first) applyUrlExtras();

      // For checking from a console or an automated browser.
      globalThis.__worlds = {
        state, learned, tab,
        get creatures() { return creatures; },
        get picker() { return picker; }, get info() { return info; }, get fact() { return fact; }, get quiz() { return quiz; },
        open: (id) => loadWorld(id), learn: (id) => { const c = creatures.find(id); return c ? creatures.learn(c) : false; },
        toggleAR, startQuiz, openPicker: () => openPicker(true), back, goHome,
      };
    },

    exit() {
      if (!active) return;
      active = false;
      serial++;
      for (const t of timers) clearTimeout(t);
      timers = [];
      const dom = ctx.renderer && ctx.renderer.domElement;
      if (dom) dom.removeEventListener('pointermove', onPointerMove);

      voice.hush();
      voice.ambient(null);
      voice.dispose();
      creatures.dispose();
      if (shadows) shadows.dispose();
      picker.dispose(); info.dispose(); fact.dispose(); quiz.dispose();
      anchor.remove(picker.root, info.root, quiz.root);
      group.remove(fact.root);

      if (penguin) {
        anchor.remove(penguin.root);
        penguin.root.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
      }
      releaseHub();
      if (hub) {
        group.remove(hub.holder);
        if (hub.snow) {
          group.remove(hub.snow);
          if (hub.snow.geometry) hub.snow.geometry.dispose();
          if (hub.snow.material) hub.snow.material.dispose();
        }
      }
      if (backdrop) { group.remove(backdrop); backdrop.geometry.dispose(); backdrop.material.dispose(); }
      if (lines) { group.remove(lines.left, lines.right); lines.geometry.dispose(); lines.material.dispose(); }

      // Hand the surroundings back: the default, with this world's sky and scenery released.
      overriding = false;
      showEnvironment('none', null);
      if (hasShellEnv && typeof ctx.environment.refresh === 'function') ctx.environment.refresh();
      anchor.position.set(0, 0, 0); anchor.rotation.set(0, 0, 0);
      state.worldId = ''; state.ar = false; state.entries = [];
      kit = voice = shadows = creatures = picker = info = fact = quiz = penguin = backdrop = hub = lines = null;
      if (globalThis.__worlds && globalThis.__worlds.tab === tab) delete globalThis.__worlds;
    },

    update(dt, elapsed) {
      if (!active) return;
      clock += dt;

      // A session started or ended under us: the same world, the other way.
      if (realAR() !== lastAR || immersive() !== lastImmersive) {
        lastAR = realAR(); lastImmersive = immersive();
        if (lastAR) state.ar = false;
        anchorPlaced = false; shownEnv = '';
        rebuild();
      }
      // The real room: wait for the first tracked frame before choosing where everything goes.
      if (lastAR && !anchorPlaced) {
        ctx.viewerPosition(_head);
        if (_head.lengthSq() > 1e-6) { placeAnchor(); anchorPlaced = true; }
      }
      // "In my room" without passthrough: keep the shell's sky, ground and fog out of the way.
      if (overriding) {
        if (ctx.environment.root.visible) ctx.environment.root.visible = false;
        if (ctx.scene.fog) ctx.scene.fog = null;
      }

      updatePointers(dt);
      creatures.update(dt, elapsed);
      fact.update(dt);
      quiz.update(dt);
      voice.update(dt);
      updatePenguin(dt);
      if (hub && hub.snow && hub.snow.visible && typeof hub.snow.update === 'function') hub.snow.update(elapsed);
      if (shadows) shadows.commit();
    },

    /** Trigger: point at a creature and pull to hear its fact. (Buttons are pressed by the shell before this.) */
    onSelectStart(hand) {
      if (!active) return;
      voice.unlock();
      if (!handRay(hand, _origin, _dir) && !handRay('right', _origin, _dir)) return;
      const target = creatures.pick(_origin, _dir);
      if (target) creatures.learn(target);
    },
    onSelectEnd() {},
    onSqueezeStart() {},
    onSqueezeEnd() {},

    /** The Y button in the real room: bring everything back around the viewer. */
    onRecenter() {
      if (!active || !realAR()) return;
      placeAnchor();
      anchorPlaced = true;
    },
  };
  return tab;
}
