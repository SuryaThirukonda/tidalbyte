// "Scan a toy" in the headset: the Unity moment (Scripts/Worlds/ToyScan.cs on branch feat/newparts) with the
// web build's real photo-to-3D behind it.
//
// A Quest browser cannot read the headset cameras, so the photo comes from the phone (Scan tab, POST /api/scan),
// which turns it into a 3D model. The headset shows the scan while that happens:
//
//   fade to the room -> a viewfinder sweeps (at least 4 s; longer while the phone's photo is still being made
//   into a model) -> white flash -> the child's own toy pops in at chest height in sparkles, says hello by name,
//   and drifts to the viewer's side as a companion.
//
// The toy is the newest scanned gift that has not been opened yet (one from the last ten minutes counts), or the
// next one to arrive while the viewfinder is up. If none arrives within WAIT_SECONDS, or the child presses the
// button again ("Bring Bubby"), Bubby, the team's prepared toy (/shared/toys.js), comes instead, so the moment
// always ends with a friend. Nothing is captured or recorded by the headset.

import * as THREE from 'three';
import { loadModelUrl, loadCreature } from '/shared/models.js';
import { BUBBY, buildBubby } from '/shared/toys.js';
import { dotTexture } from '/vr/core/fx.js';
import { colors } from '/vr/core/theme.js';

export const SCAN_WORDS = ['scan a toy', 'scan my toy', 'scan the toy', 'scan toy', 'scan it'];
/** True when a spoken sentence asks for the scan ("Scan my toy!"). */
export function isScanCommand(text) {
  const s = ` ${String(text || '').toLowerCase().replace(/[^a-z' ]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
  return SCAN_WORDS.some((w) => s.includes(` ${w} `));
}

const SWEEP_SECONDS = 4;           // the shortest scan, as in Unity: two sweeps up and down
const SETTLE_SECONDS = 0.5;
const WAIT_SECONDS = 150;          // the server gives a scan two minutes, then makes it a library creature
const RECENT_MS = 10 * 60 * 1000;  // an unopened scan this recent is the toy being shown
const FRAME = 0.40, ARM = 0.09, THICK = 0.011, BAR = 0.30;
const LINE_HOLD = 'Hold your toy up in front of me!';
const LINE_PHONE = 'Take a picture of your toy with the phone!';
const LINE_GREETING2 = "I can't wait to learn new things together. Where should we go first?";
const NO_NAME = 'friend';

const _head = new THREE.Vector3(), _fwd = new THREE.Vector3();

/** Rises past 1 and settles: the "back" easing the panels pop in with. */
function outBack(x) { const c1 = 1.70158, c3 = c1 + 1, y = Math.min(1, Math.max(0, x)) - 1; return 1 + c3 * y * y * y + c1 * y * y; }
const pingPong = (t) => { const m = t % 2; return m < 1 ? m : 2 - m; };

/** A gift that came from the phone's Scan tab: a model, or the library creature a failed scan became. */
export function isScanGift(gift) {
  if (!gift) return false;
  if (gift.kind === 'mesh') return Boolean(gift.model_url);
  return gift.kind === 'creature' && Boolean(gift.option_id) && /\/scans\//.test(String(gift.image_url || ''));
}

/** "Honey, a golden teddy bear" -> "Honey". */
function toyName(gift) {
  const first = String((gift && gift.wish) || '').split(',')[0].trim();
  return first && first.length <= 24 ? first : 'your toy';
}

/**
 * options:
 *   ctx, ui, audio, rig       the headset shell's pieces (see vr/core/README.md)
 *   parent                    the Object3D the viewfinder, sparkles and arriving toy are added to
 *   takeToy(model, gift, at)  called with the toy once it has arrived; `at` is where it is now (a Vector3).
 *                             gift is null for Bubby. The caller makes it a companion.
 *   setScanView(on)           hide or show the tab's own things while the viewfinder is up
 *   setStatus(text)           the tab's status line
 *   onBusy(busy, waiting)     the tab relabels its button
 */
export function createToyScan({ ctx, ui, audio, rig, parent, takeToy, setScanView = () => {}, setStatus = () => {}, onBusy = () => {} }) {
  const used = new Set();          // gift ids already brought in by a scan
  let run = null;                  // the scan in progress
  let childName = '';

  // ---------------------------------------------------------------------------------- the viewfinder
  const finder = new THREE.Group();
  finder.name = 'ToyScanViewfinder';
  finder.visible = false;
  const flat = (color) => new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(...color, THREE.SRGBColorSpace), depthTest: false, transparent: true });
  const quad = new THREE.PlaneGeometry(1, 1);
  function bar(x, y, w, h, color, z = 0) {
    const m = new THREE.Mesh(quad, flat(color));
    m.position.set(x, y, z); m.scale.set(w, h, 1); m.renderOrder = 20;
    finder.add(m);
    return m;
  }
  const edge = FRAME / 2;
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      bar(sx * (edge - ARM / 2), sy * (edge - THICK / 2), ARM, THICK, colors.snow);
      bar(sx * (edge - THICK / 2), sy * (edge - ARM / 2), THICK, ARM, colors.snow);
    }
  }
  const sweepGlow = bar(0, 0, FRAME - 0.05, 0.03, [0.36, 0.66, 0.80]);
  sweepGlow.material.opacity = 0.55;
  const sweep = bar(0, 0, FRAME - 0.05, 0.007, [0.80, 0.98, 1.0], 0.001);
  bar(0, -edge - 0.035, BAR + 0.008, 0.02, colors.slate);
  const fill = bar(-BAR / 2, -edge - 0.035, 0.0001, 0.012, colors.peach, 0.001);
  const plate = ui.makePanel({
    width: 0.3, height: 0.062, style: 'plain', fill: colors.panel, radius: 0.028,
    labels: [{ text: 'Scanning...', size: 0.032, font: 'heading', w: 0.27, h: 0.05 }],
  });
  plate.position.set(0, edge + 0.055, 0.002);
  const hint = ui.makeLabel('', { width: 0.5, height: 0.06, size: 0.026, color: colors.snow });
  hint.position.set(0, -edge - 0.085, 0.002);
  finder.add(plate, hint);
  parent.add(finder);

  // ---------------------------------------------------------------------------------- sparkles
  const SPARKS = 28;
  const sparkPos = new Float32Array(SPARKS * 3), sparkVel = new Float32Array(SPARKS * 3);
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparkMat = new THREE.PointsMaterial({ map: dotTexture(), color: new THREE.Color().setRGB(1, 0.9, 0.66, THREE.SRGBColorSpace), size: 0.045, transparent: true, depthWrite: false });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.visible = false; sparks.frustumCulled = false; sparks.renderOrder = 21;
  parent.add(sparks);
  let sparkT = 0;
  function sparkle(at) {
    for (let i = 0; i < SPARKS; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u), speed = 0.5 + Math.random() * 0.9;
      sparkPos[i * 3] = at.x; sparkPos[i * 3 + 1] = at.y; sparkPos[i * 3 + 2] = at.z;
      sparkVel[i * 3] = r * Math.cos(a) * speed; sparkVel[i * 3 + 1] = u * speed + 0.4; sparkVel[i * 3 + 2] = r * Math.sin(a) * speed;
    }
    sparkGeo.attributes.position.needsUpdate = true;
    sparkT = 0; sparkMat.opacity = 1; sparks.visible = true;
  }
  function updateSparks(dt) {
    if (!sparks.visible) return;
    sparkT += dt;
    for (let i = 0; i < SPARKS; i++) {
      sparkVel[i * 3 + 1] -= 9.81 * 0.3 * dt;
      sparkPos[i * 3] += sparkVel[i * 3] * dt; sparkPos[i * 3 + 1] += sparkVel[i * 3 + 1] * dt; sparkPos[i * 3 + 2] += sparkVel[i * 3 + 2] * dt;
    }
    sparkGeo.attributes.position.needsUpdate = true;
    sparkMat.opacity = sparkT < 0.45 ? 1 : Math.max(0, 1 - (sparkT - 0.45) / 0.5);
    if (sparkT > 0.95) sparks.visible = false;
  }

  // ---------------------------------------------------------------------------------- sounds (Unity's Sfx.Scan and Sfx.Flash)
  function tone(seconds) {
    const ac = audio.context;
    if (!ac || ac.state !== 'running') return null;
    const t0 = ac.currentTime, osc = ac.createOscillator(), osc2 = ac.createOscillator(), gain = ac.createGain();
    osc.type = 'sine'; osc2.type = 'sine';
    osc.frequency.setValueAtTime(260, t0); osc.frequency.exponentialRampToValueAtTime(520, t0 + seconds);
    osc2.frequency.setValueAtTime(520, t0); osc2.frequency.exponentialRampToValueAtTime(1040, t0 + seconds);
    const g2 = ac.createGain(); g2.gain.value = 0.3;
    gain.gain.setValueAtTime(0, t0); gain.gain.linearRampToValueAtTime(0.09, t0 + 0.15);
    gain.gain.setValueAtTime(0.09, t0 + Math.max(0.16, seconds - 0.25)); gain.gain.linearRampToValueAtTime(0, t0 + seconds);
    osc.connect(gain); osc2.connect(g2).connect(gain); gain.connect(ac.destination);
    osc.start(t0); osc2.start(t0); osc.stop(t0 + seconds + 0.05); osc2.stop(t0 + seconds + 0.05);
    return { stop() { try { gain.gain.cancelScheduledValues(ac.currentTime); gain.gain.setTargetAtTime(0, ac.currentTime, 0.05); osc.stop(ac.currentTime + 0.3); osc2.stop(ac.currentTime + 0.3); } catch { /* done */ } } };
  }
  function flashSound() {
    const ac = audio.context;
    if (!ac || ac.state !== 'running') return;
    const t0 = ac.currentTime, len = 0.35, buf = ac.createBuffer(1, Math.floor(ac.sampleRate * len), ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const t = i / ac.sampleRate, env = Math.min(1, t / 0.01) * Math.max(0, 1 - t / len);
      d[i] = (Math.random() * 2 - 1) * 0.5 * env + Math.sin(2 * Math.PI * t * (2400 - 1500 * t / len)) * 0.3 * env;
    }
    const src = ac.createBufferSource(), g = ac.createGain();
    g.gain.value = 0.25; src.buffer = buf; src.connect(g).connect(ac.destination); src.start(t0);
  }

  // ---------------------------------------------------------------------------------- choosing the toy
  function recentUnopened() {
    const all = ctx.gifts ? ctx.gifts.all() : [];
    for (let i = all.length - 1; i >= 0; i--) {
      const g = all[i];
      if (used.has(g.id) || g.opened_at || !isScanGift(g)) continue;
      const at = Date.parse(g.created_at || '');
      if (Number.isFinite(at) && Date.now() - at > RECENT_MS) continue;
      return g;
    }
    return null;
  }

  async function loadToy(gift) {
    if (!gift) return { model: buildBubby(0.3), gift: null, name: BUBBY.name, greeting: BUBBY.greeting, greeting2: BUBBY.greeting2 };
    const name = toyName(gift);
    const greeting = `Hi {child}! I'm ${name}! I'm so excited to be on this adventure with you!`;
    try {
      const model = gift.kind === 'mesh' ? await loadModelUrl(gift.model_url, 0.3) : await loadCreature(gift.option_id);
      return { model, gift, name, greeting, greeting2: LINE_GREETING2 };
    } catch (err) {
      console.warn('[wishworld] toy scan: the scanned toy could not be loaded, Bubby comes instead.', err && err.message);
      return { model: buildBubby(0.3), gift: null, name: BUBBY.name, greeting: BUBBY.greeting, greeting2: BUBBY.greeting2 };
    }
  }

  function claim(r, gift) {
    if (r.gift || r.loading) return;
    used.add(gift.id);
    r.gift = gift;
    if (ctx.gifts) ctx.gifts.open(gift);
    settle(r, gift);
  }
  /** The toy is known: load it, and give the viewfinder one full sweep from here (as Unity's scan always has). */
  function settle(r, gift) {
    if (r.tone) r.tone.stop();
    r.sweepFrom = r.scanT; r.tone = null;
    r.loading = loadToy(gift).then((toy) => { if (run === r) r.toy = toy; });
  }
  function bringBubby(r) { if (!r.loading) settle(r, null); }

  // ---------------------------------------------------------------------------------- the sequence
  function start() {
    if (run) {
      // Pressed again while waiting for the phone: stop waiting and bring Bubby.
      if (!run.loading && run.stage === 'scanning') bringBubby(run);
      return;
    }
    const r = { stage: 'starting', t: 0, scanT: 0, sweepFrom: 0, waitShown: 0, gift: null, loading: null, toy: null, model: null, tone: null, pulse: 0, startedAt: performance.now() };
    run = r;
    const ready = recentUnopened();
    if (ready) claim(r, ready);
    onBusy(true, !ready);
    ctx.log('toy_scan_started', { waiting_for_phone: !ready });
    if (ctx.api && typeof ctx.api.getInbox === 'function' && !childName) {
      ctx.api.getInbox().then((inbox) => { if (inbox && inbox.child_name) childName = String(inbox.child_name).trim().slice(0, 24); }).catch(() => {});
    }
    audio.speak(ready ? LINE_HOLD : LINE_PHONE);
    rig.fadeTo(1, 0.22).then(() => {
      if (run !== r) return;
      setScanView(true);
      showFinder(ready);
      r.stage = 'scanning';
      rig.fadeTo(0, 0.28);
    });
  }

  function showFinder(ready) {
    rig.viewerPosition(_head); rig.viewerForwardFlat(_fwd);
    finder.position.set(_head.x + _fwd.x * 0.7, _head.y + 0.04, _head.z + _fwd.z * 0.7);
    finder.rotation.set(0, Math.atan2(_head.x - finder.position.x, _head.z - finder.position.z), 0);
    hint.setText(ready ? '' : 'Take a picture of your toy with the phone');
    finder.visible = true;
    ui.popIn(finder);
    setStatus(ready ? 'Scanning your toy...' : 'Waiting for a picture from the phone...');
  }

  async function arrive(r) {
    r.stage = 'arriving';
    if (r.tone) { r.tone.stop(); r.tone = null; }
    rig.fadeTo(1, 0);
    flashSound();
    ctx.haptic('both', 0.6, 120);
    finder.visible = false;
    setScanView(false);
    const toy = r.toy;
    const model = toy.model;
    rig.viewerPosition(_head); rig.viewerForwardFlat(_fwd);
    // It appears at chest height in front, where it cannot be missed, then drifts to the viewer's side.
    const at = new THREE.Vector3(_head.x + _fwd.x * 0.75, Math.max(rig.floorY() + 0.35, _head.y - 0.45), _head.z + _fwd.z * 0.75);
    r.full = model.scale.clone();
    model.scale.copy(r.full).multiplyScalar(0.001);
    model.position.copy(at);
    model.rotation.set(0, Math.atan2(_head.x - at.x, _head.z - at.z), 0);
    parent.add(model);
    r.model = model; r.at = at; r.t = 0;
    rig.fadeTo(0, 0.3);
    audio.pop(at); audio.chime(at);
    sparkle(at);
    r.stage = 'popping';
  }

  function greet(r) {
    r.stage = 'greeting';
    const toy = r.toy;
    parent.remove(r.model);
    r.model.scale.copy(r.full);
    takeToy(r.model, toy.gift, r.at.clone());
    const child = childName || NO_NAME;
    setStatus(`${toy.name} is here!`);
    ctx.log('toy_scanned', { name: toy.name, gift: toy.gift ? toy.gift.id : undefined, prepared: !toy.gift });
    audio.speak(toy.greeting.replace('{child}', child)).then(() => (run === r || !run ? audio.speak(toy.greeting2) : null));
    run = null;
    onBusy(false, false);
  }

  return {
    start,
    get busy() { return Boolean(run); },
    /** The tab's gift watcher asks first: true when the scan has taken this gift (it must not get a present too). */
    offer(gift) {
      if (!run || run.gift || run.loading || !isScanGift(gift) || used.has(gift.id)) return false;
      const at = Date.parse(gift.created_at || '');
      if (Number.isFinite(at) && Date.now() - at > RECENT_MS) return false;
      claim(run, gift);
      return true;
    },
    /** True for a gift a scan already brought in. */
    took(gift) { return Boolean(gift && used.has(gift.id)); },
    setChildName(name) { childName = String(name || '').trim().slice(0, 24); },

    update(dt) {
      updateSparks(dt);
      const r = run;
      if (!r) return;
      r.t += dt;
      if (r.stage === 'scanning') {
        r.scanT += dt;
        const waitedS = (performance.now() - r.startedAt) / 1000;
        if (!r.loading && waitedS > WAIT_SECONDS) bringBubby(r);
        if (r.loading && r.tone === null) r.tone = tone(SETTLE_SECONDS + SWEEP_SECONDS) || false;
        else if (!r.loading && (r.tone === null || r.scanT % 2.5 < dt)) { if (r.tone) r.tone.stop(); r.tone = tone(2.5) || false; }
        const k = Math.min(1, Math.max(0, (r.scanT - r.sweepFrom - SETTLE_SECONDS) / SWEEP_SECONDS));
        // While waiting for the phone the bar creeps towards 85 %; once the toy is known it fills from there.
        if (!r.loading) r.waitShown = 0.85 * (1 - Math.exp(-r.scanT / 25));
        const shown = r.loading ? r.waitShown + (1 - r.waitShown) * k : r.waitShown;
        const half = FRAME / 2 - 0.03, y = -half + 2 * half * pingPong(r.scanT * 4 / SWEEP_SECONDS);
        sweep.position.y = y; sweepGlow.position.y = y;
        fill.scale.x = Math.max(0.0001, BAR * shown);
        fill.position.x = -BAR / 2 + BAR * shown / 2;
        plate.setText(r.toy || r.loading ? 'Scanning' + '.'.repeat(1 + Math.floor(r.t * 3) % 3) : 'Waiting' + '.'.repeat(1 + Math.floor(r.t * 3) % 3), 0);
        r.pulse -= dt;
        if (r.pulse <= 0) { r.pulse = 0.45; ctx.haptic('both', 0.25, 60); }
        if (r.toy && k >= 1) arrive(r);
      } else if (r.stage === 'popping') {
        const k = r.t / 0.5;
        r.model.scale.copy(r.full).multiplyScalar(Math.max(0.001, outBack(k)));
        r.model.rotation.y += dt * 0.8;
        if (r.t > 1.4) greet(r);
      }
    },

    /** Leaving the tab: drop a scan in progress (a toy that was loading is kept for next time). */
    cancel() {
      const r = run;
      if (!r) return;
      run = null;
      if (r.tone) r.tone.stop();
      if (r.gift && !r.model) used.delete(r.gift.id);
      if (r.model && r.model.parent === parent) parent.remove(r.model);
      finder.visible = false; sparks.visible = false;
      setScanView(false);
      rig.fadeTo(0, 0.15);
      onBusy(false, false);
    },
  };
}
