// WishWorld headset view: the shell. It owns the renderer, the WebXR session (passthrough AR, VR, or a
// desktop preview), the player rig, input, sound, the UI kit, the surroundings and the tab registry, and
// hands every tab the same `ctx` (documented in /vr/core/README.md).
//
// URL parameters:
//   mode=ar|vr|desktop   which way to enter (default: AR if the device has it, else VR, else the preview)
//   tab=<id>             tab to open first (default: hub)
//   room=CODE            room code (handled by /shared/api.js)
//   autostart=1          enter the desktop preview without pressing Enter (screenshots, demos)
//   stats=1              show draw calls and triangles
//   ar=1                 desktop preview only: show the AR version of each tab against plain grey
//   lite=1               desktop preview only: load the headset's lighter scene files
//   mute=1               start silent

import * as THREE from 'three';
import * as models from '/shared/models.js';
import * as movement from '/shared/movement.js';
import * as theme from './core/theme.js';
import { createRig } from './core/rig.js';
import { createInput } from './core/input.js';
import { createAudio } from './core/audio.js';
import { createUI } from './core/ui.js';
import { createEnvironment } from './core/environment.js';
import { createGuide } from './core/guide.js';
import { createMenu } from './core/menu.js';
import { createTabs } from './core/tabs.js';
import { createGifts } from './core/gifts.js';
import { createCompanions } from './core/companions.js';

const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------------------------------------ optional modules

/** /shared/api.js, or a stand-in that fails politely so the view still runs if the client is missing. */
async function loadApi() {
  try {
    const m = await import('/shared/api.js');
    if (m && m.api) return m.api;
    throw new Error('no api export');
  } catch (err) {
    console.warn('[wishworld] /shared/api.js is not available; running without the server.', err && err.message);
    const offline = () => Promise.reject(new Error('Could not reach WishWorld. Check the connection and try again.'));
    const code = (params.get('room') || 'WISH').toUpperCase();
    return {
      base: '', room: () => code, setRoom: () => code,
      createRoom: offline, sendWish: offline, sendLetter: offline, startScan: offline, scanStatus: offline,
      getGifts: offline, openGift: offline, getInbox: offline, tts: offline, stt: offline, guide: offline, health: offline,
      logEvent: async () => ({ ok: false, id: null }),
      pollGifts: () => () => {},
    };
  }
}

async function loadLibrary() {
  try { return await import('/shared/creatures.js'); } catch (err) {
    console.warn('[wishworld] /shared/creatures.js is not available; using built-in defaults.', err && err.message);
    return {};
  }
}

// ------------------------------------------------------------------------------------------ boot

async function boot() {
  const [api, library] = await Promise.all([loadApi(), loadLibrary()]);
  theme.adoptTheme(library.THEME);
  const fontsReady = theme.loadFonts();

  // ---- renderer, scene, camera ----------------------------------------------------------------------
  const canvas = $('view');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance', stencil: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = false;                 // blob shadows only, as in Unity
  renderer.xr.enabled = true;
  renderer.info.autoReset = false;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / Math.max(1, window.innerHeight), 0.05, 800);

  let mode = 'idle';                                   // 'idle' | 'desktop' | 'vr' | 'ar'
  let floorOffset = 0;                                 // metres the rig is raised when the device has no floor reference
  let session = null;
  let paused = false;
  // ?ar=1 with the desktop preview shows what AR shows (no sky, no ground, cards and fish around the viewer)
  // against plain grey, as the Unity editor does without a headset.
  const arPreview = params.get('ar') === '1';
  const isImmersive = () => mode === 'vr' || mode === 'ar';
  const isAR = () => mode === 'ar' || (mode === 'desktop' && arPreview);
  // The lighter cut of each exported scene: always on a headset, on a desktop only when asked (?lite=1).
  const preferLite = () => isImmersive() || params.get('lite') === '1';

  const rig = createRig({ scene, camera, isAR });
  const input = createInput({ renderer, scene, camera, rig, dom: canvas, isImmersive });
  const audio = createAudio({ api, camera });
  if (params.get('mute') === '1') audio.setMuted(true);
  const ui = createUI({ input, audio, renderer });
  const environment = createEnvironment({ scene, isAR, isImmersive, preferLite, audio });
  environment.setWorlds(library.WORLDS);
  const guide = createGuide({ scene, ui, audio, rig });
  const gifts = createGifts(api);
  // Saved companions follow the child in every tab (see core/companions.js).
  const companions = createCompanions({
    scene, rig, input, audio, api, haptic: (hand, strength, ms) => input.haptic(hand, strength, ms),
    onJoined: (record) => companionJoined(record),
  });

  // ---- ctx: what every tab is given -------------------------------------------------------------------
  const ctx = {
    // the contract
    THREE, scene, camera, renderer, api,
    isImmersive, isAR,
    viewerPosition: (out) => rig.viewerPosition(out),
    viewerForward: (out) => rig.viewerForward(out),
    controllers: input.controllers,
    ui,
    audio,
    haptic: (hand, strength, ms) => input.haptic(hand, strength, ms),
    log(type, detail) {
      try { return Promise.resolve(api.logEvent(type, detail || {})).catch(() => ({ ok: false, id: null })); }
      catch { return Promise.resolve({ ok: false, id: null }); }
    },
    switchTab: (id) => tabs.switchTo(id),
    setEnvironment: (worldId, options) => environment.set(worldId, options),
    // extras (see /vr/core/README.md)
    mode: () => mode,
    preferLite,
    params,
    rig, input, guide, gifts, companions, environment, theme, models, movement,
    library,
    say: (text, options) => guide.say(text, options),
    viewerForwardFlat: (out) => rig.viewerForwardFlat(out),
    floorY: () => rig.floorY(),
    openMenu: () => menu.show(),
    /** True when a tab with this id loaded. */
    hasTab: (id) => Boolean(tabs.get(id)),
    /** A note one tab leaves for the next (the hub's Wish card tells the reef to start a wish). Cleared by the reader. */
    handoff: null,
    elapsed: 0,
  };

  const tabs = createTabs({
    scene, ctx,
    hooks: {
      fadeOut: () => (isAR() ? Promise.resolve() : rig.fadeTo(1, 0.3)),
      fadeIn: () => (isAR() ? Promise.resolve() : rig.fadeTo(0, 0.4)),
      // Every tab starts from the same clean state, as every Unity scene does.
      reset() {
        guide.hush();
        environment.set(null);
        input.state.pointersEnabled = true;
        input.state.desktopPointerMode = true;
        input.state.desktopMoveEnabled = true;
        input.state.reach = 0.5;
        if (!isImmersive()) input.resetDesktopHead();
        if (isAR()) rig.reset();
        else rig.setHome(ORIGIN, AHEAD, false);
        if (floorOffset) rig.object.position.y += floorOffset;
        menu.close();
      },
      changed(id) { menu.refresh(); refreshTabBar(id); },
    },
  });
  const ORIGIN = new THREE.Vector3(0, 0, 0), AHEAD = new THREE.Vector3(0, 0, -1);

  const menu = createMenu({
    scene, ui, rig, isImmersive,
    getTabs: () => tabs.list(), getActive: () => tabs.activeId,
    onPick: (id) => tabs.switchTo(id),
    onRecenter: recenter,
    onExit: leave,
    getRoom: () => safeRoom(),
    getRecentRooms: () => recentRooms(),
    onRoom: (code) => switchRoom(code),
    onNewRoom: () => newRoom(),
  });

  // ---- rooms: switch which room this view is joined to, without leaving the game ---------------------------
  // Gifts, letters and companions all belong to a room. Switching sets the code, forgets what the gift watcher
  // had seen, brings the new room's companions and enters the current tab again, so everything is reloaded.
  const ROOMS_KEY = 'wishworld.rooms';
  function recentRooms() {
    let list = [];
    try { list = JSON.parse(localStorage.getItem(ROOMS_KEY) || '[]'); } catch { list = []; }
    return Array.isArray(list) ? list.filter((c) => /^[A-Z0-9]{3,8}$/.test(c)) : [];
  }
  function rememberRoom(code) {
    const list = [code, ...recentRooms().filter((c) => c !== code)].slice(0, 6);
    try { localStorage.setItem(ROOMS_KEY, JSON.stringify(list)); } catch { /* private mode */ }
  }
  let roomSwitching = false;
  async function switchRoom(code, { force = false } = {}) {
    const clean = String(code || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{3,8}$/.test(clean)) throw new Error('A room code is 3 to 8 letters or numbers.');
    if ((clean === safeRoom() && !force) || roomSwitching) return clean;
    roomSwitching = true;
    try {
      await flushProfileSave();
      api.setRoom(clean);
      rememberRoom(clean);
      showRoomCode();
      const current = tabs.activeId;
      if (current) tabs.leave();
      await loadProfiles();
      renderProfilePicker();
      gifts.reset();
      companions.clear();
      companions.reload();
      if (current && mode !== 'idle') await tabs.switchTo(current, { fade: false });
      audio.chime();
      guide.say(`You are in room ${clean.split('').join(' ')} now.`);
      ctx.log('room_joined', { room: clean });
      return clean;
    } finally {
      roomSwitching = false;
    }
  }
  async function newRoom() {
    try {
      const made = await api.createRoom();
      // createRoom has already switched the code; bring the view along.
      if (made && made.code) await switchRoom(made.code, { force: true });
    } catch (err) {
      guide.say((err && err.message) || 'A new room could not be made just now.');
    }
  }
  // ---- child profiles: who is playing, with their own buddies, mailbox and settings -------------------------
  // ctx.profile is what tabs use: current, list, save(patch) (applied at once, saved shortly after), switchTo(id),
  // onChange(fn). Settings: volume, guideVoice, micSensitivity (Calm reads it), following (companion ids).
  const profileState = { list: [], current: null, listeners: new Set(), pending: {}, timer: null, savingFor: null };

  function applyProfileSettings() {
    const s = (profileState.current && profileState.current.settings) || {};
    audio.setVolume(Number.isFinite(s.volume) ? s.volume : 0.8);
    audio.setVoiceEnabled(s.guideVoice !== false);
    companions.setFollowing(Array.isArray(s.following) ? s.following : null);
  }
  function notifyProfile() {
    for (const fn of profileState.listeners) { try { fn(profileState.current); } catch (err) { console.warn(err); } }
  }
  async function loadProfiles() {
    try { profileState.list = await api.getProfiles(); } catch (err) {
      console.warn('[wishworld] profiles are not available:', err && err.message);
      profileState.list = [];
    }
    const wanted = api.profile();
    profileState.current = profileState.list.find((p) => p.id === wanted) || profileState.list[0] || null;
    if (profileState.current && api.profile() !== profileState.current.id) api.setProfile(profileState.current.id);
    applyProfileSettings();
    notifyProfile();
    return profileState.current;
  }
  /** Send what is waiting to be saved now (before switching room or profile). */
  async function flushProfileSave() {
    if (!profileState.timer) return;
    clearTimeout(profileState.timer);
    profileState.timer = null;
    await sendProfileSave();
  }
  async function sendProfileSave() {
    const patch = profileState.pending, id = profileState.savingFor;
    profileState.pending = {};
    if (!id || !Object.keys(patch).length) return;
    try { await api.saveProfileSettings(id, patch); } catch (err) { console.warn('[wishworld] settings not saved:', err && err.message); }
  }
  /** Change some settings: applied at once, saved to the profile a moment later (one request for a burst). */
  function saveProfile(patch, { reloadBuddies = true } = {}) {
    const p = profileState.current;
    if (!p) return Promise.resolve();
    p.settings = { ...p.settings, ...patch };
    applyProfileSettings();
    if (reloadBuddies && Object.prototype.hasOwnProperty.call(patch, 'following')) { companions.clear(); companions.reload(); }
    if (profileState.savingFor !== p.id) { profileState.pending = {}; profileState.savingFor = p.id; }
    Object.assign(profileState.pending, patch);
    clearTimeout(profileState.timer);
    notifyProfile();
    return new Promise((resolve) => {
      profileState.timer = setTimeout(() => { profileState.timer = null; sendProfileSave().then(resolve); }, 350);
    });
  }
  /** A new buddy joined (a scan, an opened gift): it follows, and the oldest of the chosen three steps back. */
  function companionJoined(record) {
    const p = profileState.current;
    if (!p || !record || !Array.isArray(p.settings.following) || p.settings.following.includes(record.id)) return;
    saveProfile({ following: [...p.settings.following, record.id].slice(-companions.maxFollowing) }, { reloadBuddies: false });
  }
  let profileSwitching = false;
  async function switchProfile(id) {
    const next = profileState.list.find((p) => p.id === id);
    if (!next || profileSwitching || (profileState.current && profileState.current.id === id)) return;
    profileSwitching = true;
    try {
      await flushProfileSave();
      api.setProfile(id);
      profileState.current = next;
      applyProfileSettings();
      const current = tabs.activeId;
      if (current) tabs.leave();
      gifts.reset();
      companions.clear();
      companions.reload();
      if (current && mode !== 'idle') await tabs.switchTo(current, { fade: false });
      notifyProfile();
      renderProfilePicker();
      audio.chime();
      guide.say(`Hi ${next.name}!`);
      ctx.log('profile_switched', { name: next.name });
    } finally {
      profileSwitching = false;
    }
  }
  ctx.profile = {
    get current() { return profileState.current; },
    get list() { return profileState.list; },
    save: saveProfile,
    switchTo: switchProfile,
    refresh: loadProfiles,
    onChange(fn) { profileState.listeners.add(fn); return () => profileState.listeners.delete(fn); },
  };

  // The start page's picker: big cards, one per child, and "Add profile" (a name and an icon; no passwords).
  let iconKit = null;
  async function renderProfilePicker() {
    const box = $('profiles');
    if (!box) return;
    try { if (!iconKit) iconKit = await import('/shared/profiles.js'); } catch { box.hidden = true; return; }
    const cards = profileState.list.map((p) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pcard' + (profileState.current && p.id === profileState.current.id ? ' on' : '');
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', profileState.current && p.id === profileState.current.id ? 'true' : 'false');
      b.dataset.profile = String(p.id);
      b.append(iconKit.iconBadge(p.icon, p.name, 64));
      const name = document.createElement('span');
      name.className = 'pcard-name';
      name.textContent = p.name;
      b.append(name);
      b.addEventListener('click', () => {
        if (mode !== 'idle') { switchProfile(p.id); return; }
        api.setProfile(p.id);
        profileState.current = p;
        applyProfileSettings();
        notifyProfile();
        renderProfilePicker();
      });
      return b;
    });
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'pcard add';
    add.innerHTML = '<span class="pf-plus" aria-hidden="true">+</span><span class="pcard-name">Add profile</span>';
    add.addEventListener('click', () => { const f = $('profileAdd'); f.hidden = !f.hidden; if (!f.hidden) $('profileName').focus(); });
    if (profileState.list.length >= 8) add.disabled = true;
    $('profileCards').replaceChildren(...cards, add);
    const icons = $('profileIcons');
    if (!icons.childElementCount) {
      for (const icon of iconKit.allIcons()) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'picon';
        b.dataset.icon = icon;
        b.setAttribute('aria-label', icon.replace(':', ' '));
        b.append(iconKit.iconBadge(icon, '', 40));
        b.addEventListener('click', () => { for (const x of icons.children) x.classList.toggle('on', x === b); });
        icons.append(b);
      }
      icons.firstElementChild.classList.add('on');
    }
    box.hidden = false;
  }
  function setupProfileForm() {
    const form = $('profileAdd');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = $('profileName').value.trim();
      const err = $('profileError');
      err.textContent = '';
      if (!name) { err.textContent = 'Type a name first.'; return; }
      const picked = $('profileIcons').querySelector('.picon.on');
      try {
        const made = await api.createProfile({ name, icon: picked ? picked.dataset.icon : undefined });
        api.setProfile(made.id);
        $('profileName').value = '';
        form.hidden = true;
        await loadProfiles();
        renderProfilePicker();
      } catch (ex) {
        err.textContent = (ex && ex.message) || 'That profile could not be added just now.';
      }
    });
  }
  setupProfileForm();
  const profilesReady = loadProfiles().then(() => renderProfilePicker());

  function showRoomCode() {
    const code = safeRoom();
    $('room').textContent = code;
    if ($('hudroom')) $('hudroom').textContent = code;
  }
  rememberRoom(safeRoom());

  function recenter() {
    if (isAR()) tabs.call('onRecenter');
    else { rig.recenterHome(); tabs.call('onRecenter'); }
  }

  // ---- input to tabs -------------------------------------------------------------------------------------
  const cb = input.callbacks;
  cb.onSelectStart = (hand, controller) => tabs.call('onSelectStart', hand, controller);
  cb.onSelectEnd = (hand, controller) => tabs.call('onSelectEnd', hand, controller);
  cb.onSqueezeStart = (hand, controller) => tabs.call('onSqueezeStart', hand, controller);
  cb.onSqueezeEnd = (hand, controller) => tabs.call('onSqueezeEnd', hand, controller);
  cb.onButtonDown = (hand, name) => {
    // Unity's mapping: Y recentres. B and X are free there, so they summon the menu here.
    if (name === 'y') recenter();
    else if (name === 'b' || name === 'x') menu.toggle();
    tabs.call('onButtonDown', hand, name);
  };
  cb.onButtonUp = (hand, name) => tabs.call('onButtonUp', hand, name);
  cb.onKey = (code) => {
    if (mode !== 'desktop') return false;
    if (code === 'KeyM' || code === 'Tab') { menu.toggle(); return true; }
    if (code === 'Escape') { menu.close(); return true; }
    if (code === 'KeyH') { tabs.switchTo('hub'); return true; }
    const digit = /^Digit([1-9])$/.exec(code);
    if (digit) {
      const visible = tabs.list().filter((t) => !t.meta.hidden);
      const t = visible[Number(digit[1]) - 1];
      if (t) tabs.switchTo(t.id);
      return true;
    }
    return false;
  };

  // ---- start page ---------------------------------------------------------------------------------------
  const caps = { ar: false, vr: false };
  if (navigator.xr && typeof navigator.xr.isSessionSupported === 'function') {
    const ask = (kind) => navigator.xr.isSessionSupported(kind).catch(() => false);
    [caps.ar, caps.vr] = await Promise.all([ask('immersive-ar'), ask('immersive-vr')]);
  }
  const asked = (params.get('mode') || '').toLowerCase();
  // With no headset, the default is "Play in browser": the same worlds as a first-person game on this screen.
  let choice = ['ar', 'vr', 'play', 'desktop'].includes(asked) ? asked : (caps.ar ? 'ar' : caps.vr ? 'vr' : 'play');
  const touchScreen = window.matchMedia ? window.matchMedia('(pointer: coarse)').matches : false;
  let playing = false;

  const startPage = $('start'), hud = $('hud'), statusLine = $('status'), enterButton = $('enter');
  $('room').textContent = safeRoom();
  function safeRoom() { try { return api.room(); } catch { return 'WISH'; } }

  function describeChoice() {
    for (const el of document.querySelectorAll('[data-mode]')) {
      const m = el.getAttribute('data-mode');
      el.classList.toggle('on', m === choice);
      el.classList.toggle('off', (m === 'ar' && !caps.ar) || (m === 'vr' && !caps.vr));
    }
    const lines = {
      ar: caps.ar ? 'Opens in your room, with the fish swimming around you.' : 'Passthrough is not available on this device, so this will open VR or the preview.',
      vr: caps.vr ? 'Opens the snowy hub in VR.' : 'VR is not available on this device, so this will open the preview.',
      play: touchScreen
        ? 'Play on this screen: the stick on the left walks, drag to look, tap to use, and the buttons talk and grab.'
        : 'Play on this screen, full screen: the mouse looks around, W A S D walks, click uses, hold Space to talk. A game controller works too.',
      desktop: 'Preview on this screen: drag to look, W A S D to move, click to use the trigger.',
    };
    statusLine.textContent = lines[choice];
  }
  for (const el of document.querySelectorAll('[data-mode]')) {
    el.addEventListener('click', () => { choice = el.getAttribute('data-mode'); describeChoice(); });
  }
  describeChoice();

  // ---- tabs ---------------------------------------------------------------------------------------------
  await fontsReady;
  await tabs.load();
  input.adoptControllerModel();
  buildTabBar();
  enterButton.disabled = false;
  enterButton.textContent = 'Enter';
  document.body.classList.add('ready');

  function firstTab() {
    const wanted = params.get('tab');
    if (wanted && tabs.get(wanted)) return wanted;
    if (tabs.get('hub')) return 'hub';
    const list = tabs.list();
    return list.length ? list[0].id : null;
  }

  function buildTabBar() {
    const bar = $('tabbar');
    bar.textContent = '';
    tabs.list().filter((t) => !t.meta.hidden).forEach((t, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = t.meta.label;
      b.title = `${t.meta.label} (key ${i + 1})`;
      b.dataset.tab = t.id;
      b.addEventListener('click', () => { tabs.switchTo(t.id); canvas.focus(); });
      bar.appendChild(b);
    });
  }
  function refreshTabBar(id) {
    for (const b of $('tabbar').children) b.classList.toggle('on', b.dataset.tab === id);
  }

  // ---- entering and leaving -----------------------------------------------------------------------------

  async function requestSession(kind) {
    // The floor is the origin, as in Unity (tracking origin = floor). Hands are welcome but not needed.
    try {
      return { session: await navigator.xr.requestSession(kind, { requiredFeatures: ['local-floor'], optionalFeatures: ['bounded-floor', 'hand-tracking'] }), space: 'local-floor' };
    } catch (first) {
      if (first && first.name === 'SecurityError') throw first;
      return { session: await navigator.xr.requestSession(kind, { optionalFeatures: ['hand-tracking'] }), space: 'local' };
    }
  }

  async function startXR(kind) {
    const { session: s, space } = await requestSession(kind);
    renderer.xr.setReferenceSpaceType(space);
    try { await renderer.xr.setSession(s); } catch (err) { try { await s.end(); } catch { /* already over */ } throw err; }
    session = s;
    // A device may accept an AR session and still show an opaque world; treat that as VR.
    const blend = s.environmentBlendMode || renderer.xr.getEnvironmentBlendMode();
    mode = kind === 'immersive-ar' && blend !== 'opaque' ? 'ar' : 'vr';
    floorOffset = space === 'local' ? 1.6 : 0;        // no floor reference: assume a standing eye height
    s.addEventListener('end', onSessionEnd);
    s.addEventListener('visibilitychange', onSessionVisibility);
    input.setDesktop(false);
  }

  let entering = false;

  async function enter(wanted) {
    if (entering || mode !== 'idle') return;
    entering = true;
    audio.unlock();                                     // inside the button press
    let want = wanted;
    try {
      if (want === 'ar') { if (caps.ar) { try { await startXR('immersive-ar'); } catch (err) { console.warn('[wishworld] passthrough did not start:', err && err.message); want = 'vr'; } } else want = 'vr'; }
      if (want === 'vr' && mode === 'idle') { if (caps.vr) { try { await startXR('immersive-vr'); } catch (err) { console.warn('[wishworld] VR did not start:', err && err.message); want = 'desktop'; } } else want = 'desktop'; }
      if (mode === 'idle') { mode = 'desktop'; input.setDesktop(true); input.resetDesktopHead(); }
      playing = mode === 'desktop' && want === 'play';
      input.setPlay(playing);
      document.body.classList.toggle('play', playing);
      document.body.classList.toggle('touch', playing && touchScreen);
      if (playing) {
        // Both need the button press that got us here.
        try { const f = document.documentElement.requestFullscreen && document.documentElement.requestFullscreen({ navigationUI: 'hide' }); if (f && f.catch) f.catch(() => {}); } catch { /* not allowed */ }
        if (!touchScreen) input.lockPointer();
        setPlayHint();
      }

      startPage.hidden = true;
      document.body.classList.add('running');
      document.body.classList.toggle('arpreview', mode === 'desktop' && arPreview);
      hud.hidden = mode !== 'desktop';
      canvas.focus();
      onResize();
      environment.refresh();
      menu.rebuild();
      await profilesReady;
      gifts.start();
      companions.reload();
      rig.setFade(0);
      paused = false;
      const id = firstTab();
      if (id) await tabs.switchTo(id, { fade: false });
    } finally {
      entering = false;
    }
  }

  /** Back to the start page: end the session if there is one. */
  function leave() {
    if (session) { session.end().catch(() => {}); return; }      // onSessionEnd finishes the job
    finishLeave();
  }

  function finishLeave() {
    tabs.leave();
    guide.hush();
    audio.setAmbient(null);
    menu.close();
    input.releaseAll();
    input.setPlay(false);
    playing = false;
    document.body.classList.remove('play', 'touch', 'locked');
    if (document.fullscreenElement) { try { document.exitFullscreen().catch(() => {}); } catch { /* fine */ } }
    input.setDesktop(true);
    mode = 'idle';
    session = null;
    floorOffset = 0;
    rig.reset();
    rig.setFade(0);
    hud.hidden = true;
    startPage.hidden = false;
    document.body.classList.remove('running');
    onResize();
  }

  function onSessionEnd() {
    if (session) {
      session.removeEventListener('end', onSessionEnd);
      session.removeEventListener('visibilitychange', onSessionVisibility);
    }
    finishLeave();
  }

  function setPaused(on) {
    if (paused === on) return;
    paused = on;
    audio.setPaused(on);
    if (on) input.releaseAll();
  }
  // Headset taken off, or the system menu is up: stop the voice and let go of every button.
  function onSessionVisibility() { if (session) setPaused(session.visibilityState !== 'visible'); }
  document.addEventListener('visibilitychange', () => { if (mode === 'desktop') setPaused(document.visibilityState === 'hidden'); });

  enterButton.addEventListener('click', () => enter(choice));

  // ---- play in browser: crosshair, pause card, touch controls ------------------------------------------
  const pauseCard = $('pause'), joyBase = $('joy'), joyKnob = $('joyknob');
  function setPlayHint() {
    $('keys').textContent = touchScreen
      ? 'Left stick: walk · drag: look · tap: use · Talk: hold and speak · Menu: tabs and worlds'
      : 'Mouse: look · W A S D: walk · click: use · right click or G: grab · hold Space: talk · M: menu · 1 to 9: tabs · Esc: pause';
    $('keys').classList.add('show');
    setTimeout(() => $('keys').classList.remove('show'), 9000);
  }
  input.callbacks.onLockChange = (locked) => {
    document.body.classList.toggle('locked', locked);
    if (playing && !touchScreen) pauseCard.hidden = locked;
    if (locked) menu.close();
  };
  input.callbacks.onJoystick = ({ active, x, y, dx = 0, dy = 0 }) => {
    joyBase.hidden = !active;
    if (!active) return;
    joyBase.style.left = x + 'px'; joyBase.style.top = y + 'px';
    joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  };
  // The room chip (laptop and phone): type a code, or pick a room used before.
  const roomForm = $('roomform'), roomInput = $('roominput'), roomError = $('roomerr');
  function drawRecentRooms() {
    const box = $('recentrooms');
    box.textContent = '';
    for (const code of recentRooms().filter((c) => c !== safeRoom())) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = code;
      b.addEventListener('click', () => joinFromChip(code));
      box.appendChild(b);
    }
  }
  async function joinFromChip(code) {
    roomError.textContent = '';
    try { await switchRoom(code); roomForm.hidden = true; canvas.focus(); }
    catch (err) { roomError.textContent = (err && err.message) || 'That room code does not look right.'; }
  }
  $('roomchip').addEventListener('click', () => {
    roomForm.hidden = !roomForm.hidden;
    if (!roomForm.hidden) { roomInput.value = ''; roomError.textContent = ''; drawRecentRooms(); roomInput.focus(); }
  });
  roomForm.addEventListener('submit', (e) => { e.preventDefault(); joinFromChip(roomInput.value); });
  $('roomnew').addEventListener('click', async () => { roomForm.hidden = true; await newRoom(); });
  $('pause-room').addEventListener('click', () => { pauseCard.hidden = true; roomForm.hidden = false; roomInput.value = ''; drawRecentRooms(); roomInput.focus(); });
  showRoomCode();
  $('resume').addEventListener('click', () => { pauseCard.hidden = true; input.lockPointer(); canvas.focus(); });
  $('pause-menu').addEventListener('click', () => { pauseCard.hidden = true; menu.show(); });
  $('pause-leave').addEventListener('click', () => { pauseCard.hidden = true; leave(); });
  for (const b of document.querySelectorAll('[data-press]')) {
    const name = b.getAttribute('data-press');
    const down = (e) => { e.preventDefault(); b.classList.add('down'); if (name === 'menu') menu.toggle(); else input.press(name, true); };
    const up = (e) => { e.preventDefault(); if (!b.classList.contains('down')) return; b.classList.remove('down'); if (name !== 'menu') input.press(name, false); };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('pointerleave', up);
  }

  function onResize() {
    if (renderer.xr.isPresenting) return;
    const w = window.innerWidth, h = Math.max(1, window.innerHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', onResize);

  // ---- frame loop ---------------------------------------------------------------------------------------
  const stats = { calls: 0, triangles: 0, fps: 0, frames: 0, textures: 0, geometries: 0 };
  const statsEl = $('stats');
  const showStats = params.get('stats') === '1';
  if (statsEl) statsEl.hidden = !showStats;
  let last = 0, fpsT = 0, fpsN = 0;

  renderer.setAnimationLoop((time) => {
    const dt = last ? Math.min(0.05, Math.max(0, (time - last) / 1000)) : 0;
    last = time;
    if (mode === 'idle') return;                         // the start page is up: nothing to draw
    if (!paused) {
      ctx.elapsed += dt;
      if (renderer.xr.isPresenting) { try { renderer.xr.updateCamera(camera); } catch { /* next frame */ } }
      input.update(dt);
      rig.update(dt);
      tabs.update(dt, ctx.elapsed);
      companions.update(dt, ctx.elapsed);
      guide.update(dt);
      ui.update(dt);
      audio.update();
    }
    renderer.info.reset();
    renderer.render(scene, camera);
    stats.calls = renderer.info.render.calls;
    stats.triangles = renderer.info.render.triangles;
    stats.textures = renderer.info.memory.textures;
    stats.geometries = renderer.info.memory.geometries;
    stats.frames++;
    fpsT += dt; fpsN++;
    if (fpsT >= 0.5) {
      stats.fps = Math.round(fpsN / fpsT); fpsT = 0; fpsN = 0;
      if (showStats && statsEl) statsEl.textContent = `${stats.fps} fps · ${stats.calls} draws · ${stats.triangles} tris · ${stats.textures} tex`;
    }
  });

  // For checking from a console or an automated browser.
  window.wishworld = { ctx, tabs, renderer, stats, enter, leave, caps, version: 1 };

  if (params.get('autostart') === '1') enter(choice === 'ar' || choice === 'vr' ? 'desktop' : choice);
}

boot().catch((err) => {
  console.error('[wishworld] the headset view could not start', err);
  const status = document.getElementById('status');
  if (status) status.textContent = 'Something went wrong while loading. Please reload the page.';
});
