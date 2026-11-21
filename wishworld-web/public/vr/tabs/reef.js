// The reef: Unity's "AR Worlds" and "Wish" modes (Scripts/Worlds/WorldController.cs, Creature.cs,
// Spawner.cs, Wish/WishVoice.cs) and section 7 of the web spec.
//
//   - Fish from the creature library swim around the viewer: in AR in the real room, in VR and the desktop
//     preview inside the Unity aquarium world. They move, school and shy from a hand as in Unity.
//   - Trigger: fish near where you point dart away, with a short vibration. Point at one and pull the
//     trigger, touch it, or look at it for two seconds, and its fact card plays.
//   - Gifts from the phone arrive in front of the viewer as a present with a card ("From Grandma") and a
//     chime; opening it shows and speaks the message, and the creature joins the reef.
//   - Scanned companions (.glb from a photo) float beside the viewer, bob, face them, follow, and hop. They are
//     kept by the shell (/vr/core/companions.js): saved for the room and following in every tab, not only here.
//   - Spoken wish: hold A (V on a keyboard) or press "Make a wish", say it, let go.
//   - "Scan a toy" (the button, or saying it): Unity's toy scan (feat/newparts) with the phone's real photo-to-3D
//     behind it. See /vr/core/toyscan.js.

import * as THREE from 'three';
import { loadCreature, loadModelUrl, loadGLB, loadManifest, setGlow, MeshBuilder, lighting } from '/shared/models.js';
import { createSchool } from '/vr/core/school.js';
import { createMover, seededRandom } from '/shared/movement.js';
import { createShadowPool } from '/vr/core/fx.js';
import { colors } from '/vr/core/theme.js';
import { createToyScan, isScanCommand } from '/vr/core/toyscan.js';
import { watchWish, wishCreature } from '/vr/core/wishmodels.js';

export const meta = { id: 'reef', label: 'Reef', order: 1 };

const WORLD = 'aquarium';                       // the Unity sea world ("reef" is one of its keywords)
// Who is here before anyone sends anything: Unity's "flying fish" school, and a few friends from the aquarium.
const RESIDENTS = [['clownfish', 8], ['turtle', 1], ['jellyfish', 2], ['ray', 1]];
const MAX_GIFT_CREATURES = 12, MAX_COMPANIONS = 3, MAX_CEREMONIES = 3;
const GAZE_SECONDS = 2, SCATTER_RANGE = 0.4;
const DEG = Math.PI / 180;

const LINE_AR = 'This is your room. Say or pick what should visit!';
const LINE_WISH = 'What do you wish for? Say it, or pick from the menu.';
const LINE_REEF = 'Welcome to the aquarium! Touch a creature to learn about it.';

const _v = new THREE.Vector3(), _head = new THREE.Vector3(), _fwd = new THREE.Vector3(), _p = new THREE.Vector3();

function hash(s) { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// A wrapped present when the exported one is missing: a peach box with a slate-blue ribbon and a bow.
function buildPresent() {
  const b = new MeshBuilder()
    .cube([0, 0.11, 0], [0.24, 0.22, 0.24], colors.peach)
    .cube([0, 0.11, 0], [0.25, 0.225, 0.06], colors.ribbon)
    .cube([0, 0.11, 0], [0.06, 0.225, 0.25], colors.ribbon)
    .taperBox([-0.05, 0.25, 0], [0.09, 0.06, 0.06], colors.ribbon, [0, 0, 25], 0.5, 0.8)
    .taperBox([0.05, 0.25, 0], [0.09, 0.06, 0.06], colors.ribbon, [0, 0, -25], 0.5, 0.8);
  return b.mesh({ mirror: 'x' });
}

export function createTab(ctx) {
  const { ui, audio, guide, rig, input } = ctx;
  const group = new THREE.Group();
  group.name = 'Reef';

  const swimmers = new THREE.Group(); swimmers.name = 'Creatures';
  // A school of small fish all around, drawn as two instanced meshes (two draw calls for every fish).
  const school = createSchool({ count: ctx.preferLite ? 90 : 180 });
  group.add(school.group);
  const _schoolHead = new THREE.Vector3();
  group.add(swimmers);
  const shadows = createShadowPool(40);
  group.add(shadows.mesh);

  const creatures = [];            // everything that swims, flies or walks here
  const learned = new Set();       // creature ids whose fact has been heard this session
  const center = new THREE.Vector3();          // the floor point the rings go around
  const forward = new THREE.Vector3(0, 0, -1); // which way the place faces
  let active = false, epoch = 0, clock = 0, residentsReady = false;
  let unsubscribe = null;

  // ------------------------------------------------------------------------------------ placing creatures

  /** Unity's Spawner rules for one kind: where its members go, how big and how fast they are. */
  function plan(creature, count) {
    const ar = ctx.isAR();
    const rand = seededRandom(hash(creature.id) + 17);
    const ring = creature.ring || [1.5, 3], heights = creature.height || [0.8, 1.6];
    const scale = ar ? (creature.arScale ?? 1) : 1;
    const size = (creature.size || 0.3) * scale;
    const base = Math.atan2(-forward.z, forward.x);          // the angle of "straight ahead" on Unity's ring
    const school = Boolean(creature.schooling);
    const schoolRadius = rand(ring[0], ring[1]), schoolHeight = rand(heights[0], heights[1]);
    const schoolDir = rand() < 0.5 ? 1 : -1;
    const start = base + (school ? rand(-0.7, 0.1) : rand(-1.2, 1.2));
    const out = [];
    for (let i = 0; i < count; i++) {
      let radius, height, angle, direction;
      if (school) {
        radius = schoolRadius + rand(-0.35, 0.35); height = schoolHeight + rand(-0.3, 0.3);
        angle = start + i * 0.16 + rand(-0.05, 0.05); direction = schoolDir;
      } else {
        radius = rand(ring[0], ring[1]); height = rand(heights[0], heights[1]);
        angle = start + i * (Math.PI * 2 / Math.max(count, 3)) + rand(-0.3, 0.3); direction = rand() < 0.5 ? 1 : -1;
      }
      if (ar) { radius = clamp(radius * 0.45, 0.9, 2.4); height = clamp(height * 0.8, 0, 1.9); }
      // Bigger creatures stand further back so they never crowd the head; in the room everyone stays within 3 m.
      radius = clamp(Math.max(radius, 1 + 0.4 * (size - 1)), 1, ar ? 3 : 6);
      out.push({
        radius, height, angle, direction, scale,
        phase: rand(0, Math.PI * 2),
        speed: (creature.speed || 0.35) * rand(0.8, 1.2) * (ar ? (scale + 1) / 2 : 1),
        bob: (creature.move === 'fly' ? 0.25 : 0.15) * (ar ? 0.5 : 1),
      });
    }
    return out;
  }

  /** Put one loaded creature into the reef. `from` (a position) makes it glide to its ring from there. */
  function addCreature(object, creature, spot, { gift = null, from = null } = {}) {
    const fromScale = from ? object.scale.x : spot.scale;
    object.scale.setScalar(spot.scale);
    swimmers.add(object);
    const mover = createMover(object, creature, {
      center, radius: spot.radius, height: spot.height, angle: spot.angle, direction: spot.direction,
      phase: spot.phase, speed: spot.speed, bob: spot.bob, follow: ctx.isAR(),
    });
    const radius = Math.max(0.09, (object.userData.radius || 0.15) * 0.8 * spot.scale);
    const c = {
      object, creature, mover, gift, baseScale: spot.scale, hitRadius: radius,
      size: (creature.size || 0.3) * spot.scale,
      glow: 0, lit: 0, cooldown: 0, hovered: false, gaze: 0, gazeUsed: false,
      grow: from ? 1 : 0, from: from ? from.clone() : null, blend: from ? 0 : 1, fromScale,
      shies: (creature.addCount || 1) > 1 && creature.move !== 'walk',
      walker: creature.move === 'walk',
    };
    input.addTarget(object, {
      radius: radius / spot.scale, ui: false,
      offset: c.walker ? new THREE.Vector3(0, (object.userData.height || 0.2) * 0.5, 0) : null,
      onHover: (on) => { c.hovered = on; },
      onClick: () => learn(c),
    });
    object.scale.setScalar(from ? fromScale : 0.001);
    creatures.push(c);
    return c;
  }

  function removeCreature(c) {
    const i = creatures.indexOf(c);
    if (i >= 0) creatures.splice(i, 1);
    input.removeTarget(c.object);
    c.mover.dispose();
    swimmers.remove(c.object);
  }

  async function spawnKind(id, count, options) {
    const mine = epoch;
    const objects = await Promise.all(Array.from({ length: count }, () => loadCreature(id)));
    if (mine !== epoch || !active) return [];
    const standIn = objects[0].userData.creature;
    const spots = plan(standIn, count);
    const creature = options && options.gift ? wishCreature(options.gift, standIn) : standIn;
    // A wish's own generated model replaces the library stand-in once it is built (or straight away if it is).
    if (options && options.gift) for (const o of objects) wishSwap(options.gift, o, creature);
    return objects.map((o, i) => addCreature(o, creature, spots[i], options));
  }

  function wishSwap(gift, holder, creature) {
    const mine = epoch;
    watchWish(gift, holder, {
      api: ctx.api, size: (creature && creature.size) || 0.3,
      isAlive: () => mine === epoch && active,
      onSwap: (model, latest) => {
        if (ctx.alive) ctx.alive.add(holder, { motion: (latest.plan && latest.plan.motion) || 'swim', size: (creature && creature.size) || 0.3, creature });
        setGlow(holder, 1);
        setTimeout(() => setGlow(holder, 0), 900);
        audio.chime(holder.getWorldPosition(new THREE.Vector3()));
        if (ctx.companions) ctx.companions.hopAll();
      },
    });
  }

  function trimGiftCreatures() {
    const mine = creatures.filter((c) => c.gift);
    while (mine.length > MAX_GIFT_CREATURES) removeCreature(mine.shift());
  }

  // ------------------------------------------------------------------------------------ the fact card

  const factCard = new THREE.Group();
  factCard.name = 'FactCard';
  factCard.visible = false;
  const factPanel = ui.makePanel({
    width: 0.74, height: 0.36, style: 'frame', fill: colors.panel, radius: 0.045, border: 0.008,
    labels: [
      { text: '', size: 0.036, font: 'body', w: 0.64, h: 0.2, y: -0.012 },
      { text: '', size: 0.024, font: 'body', w: 0.3, h: 0.04, x: 0.17, y: -0.155, align: 'right' },
    ],
  });
  // The name sits on a ribbon across the top edge of the card, like a storybook page heading.
  const factTitle = ui.makeRibbon('', { width: 0.46, height: 0.09, textHeight: 0.052, fill: colors.peach, color: colors.slate });
  factTitle.position.set(0, 0.175, 0.008);
  factCard.add(factPanel, factTitle);
  group.add(factCard);
  ui.popIn(factCard, { bob: 0.008 });
  let factHideAt = 0;

  function showFact(c, isNew) {
    const creature = c.creature;
    rig.viewerPosition(_head);
    _v.copy(c.object.position).sub(_head); _v.y = 0;
    if (_v.lengthSq() < 0.01) rig.viewerForwardFlat(_v);
    _v.normalize();
    // Slightly to the side of the line of sight so it does not cover the creature.
    _p.set(-_v.z, 0, _v.x);
    factCard.position.set(_head.x + _v.x * 1.15 - _p.x * 0.22, _head.y - 0.18, _head.z + _v.z * 1.15 - _p.z * 0.22);
    factCard.rotation.set(0, Math.atan2(_head.x - factCard.position.x, _head.z - factCard.position.z), 0);
    factTitle.setText(creature.name);
    factPanel.setText(creature.fact || '', 0);
    factPanel.setText(isNew ? 'New!' : '', 1);
    factPanel.typeOn(clamp((creature.fact || '').length * 0.045, 1.2, 5), 0);
    if (factCard.visible) ui.replay(factCard); else factCard.visible = true;
    factHideAt = clock + clamp(3.5 + (creature.fact || '').length * 0.05, 5, 10);
  }

  /** Touch, gaze or trigger: the creature glows, makes its sound, and its fact card plays. */
  function learn(c) {
    if (clock < c.cooldown || !c.creature.fact || ceremony) return;
    c.cooldown = clock + 4;
    c.lit = clock + 5;
    audio.chirp(c.creature, 0.8, c.object);
    audio.sfx('chime', 0.5, c.object);
    const isNew = !learned.has(c.creature.id);
    learned.add(c.creature.id);
    showFact(c, isNew);
    updateCounter(isNew);
    const mine = epoch;
    audio.speak(c.creature.fact).then(() => {
      // The fact has been heard: tell the parent's Inbox, once per creature.
      if (isNew && mine === epoch) ctx.log('creature_learned', { id: c.creature.id, name: c.creature.name, world: WORLD, gift: c.gift ? c.gift.id : undefined });
    });
  }

  // ------------------------------------------------------------------------------------ the info panel

  const info = new THREE.Group();
  info.name = 'ReefInfo';
  const infoPanel = ui.makePanel({
    width: 0.62, height: 0.46, style: 'frame', fill: colors.panel, radius: 0.045, border: 0.008,
    labels: [
      { text: 'Reef', size: 0.06, font: 'title', w: 0.5, h: 0.085, y: 0.155 },
      { text: '', size: 0.04, font: 'body', w: 0.56, h: 0.07, y: 0.075 },
    ],
  });
  const status = ui.makeLabel('', { width: 0.56, height: 0.075, size: 0.03 });
  status.position.set(0, 0, 0.004);
  const home = ui.makeButton('Home', () => ctx.switchTab('hub'), { width: 0.24, height: 0.11, textHeight: 0.042 });
  home.position.set(-0.14, -0.135, 0.006);
  const wishButton = ui.makeButton('Make a wish', () => toggleWish(), { width: 0.27, height: 0.11, textHeight: 0.036, fill: colors.peach });
  wishButton.position.set(0.145, -0.135, 0.006);
  const scanButton = ui.makeButton('Scan a toy', () => toyScan.start(), { width: 0.3, height: 0.1, textHeight: 0.034 });
  scanButton.position.set(0, -0.29, 0.006);
  info.add(infoPanel, status, home, wishButton, scanButton);
  group.add(info);
  ui.popIn(info);
  ui.popIn(status);

  let statusText = '', statusShown = '';
  function setStatus(text) {
    statusText = text || '';
    if (!statusText.endsWith('...')) { status.setText(statusText); statusShown = statusText; }
    ui.kick(status, 0.2);
  }
  // "Scan a toy": the viewfinder, then the child's own scanned toy (or Bubby) joins the companions.
  const toyScan = createToyScan({
    ctx, ui, audio, rig, parent: group, setStatus,
    takeToy(model, gift, at) { const pal = addCompanion(model, gift, at, gift ? null : 'bubby'); if (pal) pal.follower.hop(); },
    setScanView(on) { swimmers.visible = !on; shadows.mesh.visible = !on; if (ctx.companions) ctx.companions.setVisible(!on); },
    onBusy(busy, waiting) { scanButton.setLabel(busy ? (waiting ? 'Bring Bubby' : 'Scanning...') : 'Scan a toy'); if (!busy) setTimeout(() => { if (active && !recording && !busy) setStatus(idleStatus()); }, 6000); },
  });

  function idleStatus() { return ctx.isImmersive() ? 'Hold A and speak, or press the button' : 'Hold V and speak, or press the button'; }

  function updateCounter(bump) {
    const kinds = new Set(creatures.map((c) => c.creature.id));
    let found = 0;
    for (const id of kinds) if (learned.has(id)) found++;
    infoPanel.setText(kinds.size === 0 ? 'Nothing here yet' : `${found} of ${kinds.size} found`, 1);
    if (bump) ui.kick(info, 0.06);
  }

  function placeInfo() {
    // Unity: floor + forward * 1.15 - right * 0.95 + up * 1.12, facing the head, tilted back 12 degrees.
    _p.set(-forward.z, 0, forward.x);                              // right of forward
    info.position.set(center.x + forward.x * 1.15 - _p.x * 0.95, center.y + 1.12, center.z + forward.z * 1.15 - _p.z * 0.95);
    info.rotation.set(-12 * DEG, Math.atan2(center.x - info.position.x, center.z - info.position.z), 0, 'YXZ');
  }

  // ------------------------------------------------------------------------------------ gifts

  const giftCard = new THREE.Group();
  giftCard.name = 'GiftCard';
  giftCard.visible = false;
  const giftPanel = ui.makePanel({
    width: 0.64, height: 0.3, style: 'frame', fill: colors.panel, radius: 0.045, border: 0.008,
    labels: [{ text: '', size: 0.036, font: 'body', w: 0.55, h: 0.18, y: -0.012 }],
  });
  const giftTitle = ui.makeRibbon('', { width: 0.46, height: 0.09, textHeight: 0.05, fill: colors.peach, color: colors.slate });
  giftTitle.position.set(0, 0.148, 0.008);
  const giftButton = ui.makeButton('Open', () => { if (ceremony) (ceremony.opened ? finishCeremony() : openGift()); }, { width: 0.26, height: 0.1, textHeight: 0.042, fill: colors.peach });
  giftButton.position.set(0, -0.215, 0.006);
  giftCard.add(giftPanel, giftTitle, giftButton);
  group.add(giftCard);
  ui.popIn(giftCard, { bob: 0.006 });

  const present = new THREE.Group();
  present.name = 'Present';
  present.visible = false;
  present.add(buildPresent());
  group.add(present);
  input.addTarget(present, { radius: 0.2, ui: false, offset: new THREE.Vector3(0, 0.11, 0), onClick: () => { if (ceremony && !ceremony.opened) openGift(); } });
  loadManifest().then((manifest) => {
    const entry = manifest.get('present_a');
    if (!entry) return;
    loadGLB('/models/' + entry.file).then((model) => {
      model.scale.setScalar(0.62);                                 // the hub's present, hand sized
      present.remove(present.children[0]);
      present.add(model);
    }).catch(() => {});
  });

  const waiting = [];              // gifts due an arrival, oldest first
  let ceremony = null;             // the one arriving now
  const seen = new Set();
  let backlog = null;              // gifts from before this visit, gathered while the watcher replays them

  function onGift(gift) {
    if (!gift || seen.has(gift.id) || gift.kind === 'letter') return;
    if (gift.kind !== 'creature' && gift.kind !== 'mesh') return;
    seen.add(gift.id);
    if (toyScan.offer(gift)) return;           // the headset is scanning: this is the toy it was waiting for
    if (backlog) { backlog.push(gift); return; }
    // The watcher's first answer also brings everything sent before the headset went on: treat that as backlog too.
    const sent = Date.parse(gift.created_at || '');
    if (Number.isFinite(sent) && sent < pageOpened - 30000) { late.push(gift); lateAt = clock; return; }
    if (gift.opened_at) joinQuietly(gift); else waiting.push(gift);
  }
  const pageOpened = Date.now();
  const late = [];
  let lateAt = 0;

  /** Everything sent before this visit: the newest unopened few get their arrival, the rest are simply here. */
  function settleBacklog(list) {
    const fresh = list.filter((g) => !g.opened_at);
    const arrivals = fresh.slice(-MAX_CEREMONIES);
    const quiet = list.filter((g) => !arrivals.includes(g));
    for (const g of quiet.filter((x) => x.kind === 'creature').slice(-(MAX_GIFT_CREATURES - arrivals.length))) joinQuietly(g);
    for (const g of quiet.filter((x) => x.kind === 'mesh').slice(-MAX_COMPANIONS)) joinQuietly(g);
    for (const g of arrivals) waiting.push(g);
  }

  /** A gift that was opened before (or is too old to make a fuss over) is simply here. */
  function joinQuietly(gift) {
    if (gift.kind === 'creature' && gift.option_id) {
      spawnKind(gift.option_id, 1, { gift }).then(() => { trimGiftCreatures(); updateCounter(false); });
    } else if (gift.kind === 'mesh' && gift.model_url) {
      if (ctx.companions && ctx.companions.has(gift)) return;
      const mine = epoch;
      loadModelUrl(gift.model_url, 0.3).then((model) => { if (mine === epoch && active) addCompanion(model, gift); })
        .catch((err) => console.warn('[wishworld] reef: a companion could not be loaded.', err && err.message));
    }
  }

  /** A scanned toy (or Bubby) joins the child's companions: saved for the room and following in every tab. */
  function addCompanion(model, gift, from = null, toy = null) {
    if (!ctx.companions) return null;
    return ctx.companions.add(model, { gift, toy, from });
  }

  async function beginCeremony(gift) {
    const mine = epoch;
    const c = { gift, opened: false, model: null, creature: null, t: 0, openedAt: 0, spoken: false, done: false };
    ceremony = c;
    // In front of the viewer: the present a little to the left, its card beside it.
    rig.viewerPosition(_head); rig.viewerForwardFlat(_fwd);
    _p.set(-_fwd.z, 0, _fwd.x);                                    // the viewer's right
    c.spot = new THREE.Vector3(_head.x + _fwd.x * 0.9 - _p.x * 0.27, _head.y - 0.3, _head.z + _fwd.z * 0.9 - _p.z * 0.27);
    present.position.copy(c.spot);
    present.rotation.set(0, Math.atan2(-_fwd.x, -_fwd.z) + 0.5, 0);
    present.scale.setScalar(0.001);
    present.visible = true;
    giftCard.position.set(_head.x + _fwd.x * 1.0 + _p.x * 0.2, _head.y - 0.12, _head.z + _fwd.z * 1.0 + _p.z * 0.2);
    giftCard.rotation.set(0, Math.atan2(_head.x - giftCard.position.x, _head.z - giftCard.position.z), 0);
    const sender = (gift.sender || 'A friend').trim() || 'A friend';
    const own = sender === 'Me';                                   // the child's own spoken wish coming true
    giftTitle.setText(own ? 'Your wish!' : 'From ' + sender);
    giftPanel.setText(own ? 'Your wish came true! Open it to see what is inside.' : 'A gift for you! Open it to see what is inside.');
    giftButton.setLabel('Open');
    if (giftCard.visible) ui.replay(giftCard); else giftCard.visible = true;
    // Make the sender's words now, while the present is still wrapped, so they are heard the moment it opens.
    if (audio.prefetch) audio.prefetch((gift.message || '').trim() || 'This is for you!');
    audio.chime(c.spot);
    ctx.haptic('both', 0.3, 60);
    if (ctx.companions) ctx.companions.hopAll();
    // Have what is inside ready before the lid comes off.
    try {
      if (gift.kind === 'mesh') c.model = await loadModelUrl(gift.model_url, 0.3);
      else {
        c.model = await loadCreature(gift.option_id || 'clownfish'); c.creature = wishCreature(gift, c.model.userData.creature);
        wishSwap(gift, c.model, c.creature);
      }
    } catch (err) {
      console.warn('[wishworld] reef: the gift could not be loaded, showing its message only.', err && err.message);
      c.model = null;
    }
    if (mine !== epoch || ceremony !== c) return;
    c.ready = true;
  }

  function openGift() {
    const c = ceremony;
    if (!c || c.opened || !c.ready) { if (c) c.wantOpen = true; return; }
    c.opened = true; c.openedAt = clock;
    audio.pop(c.spot);
    ctx.haptic('both', 0.5, 80);
    if (ctx.gifts) ctx.gifts.open(c.gift); else ctx.api.openGift(c.gift.id).catch(() => {});
    const message = (c.gift.message || '').trim() || 'This is for you!';
    giftPanel.setText(message);
    giftPanel.typeOn(clamp(message.length * 0.04, 1, 4));
    giftButton.setLabel('Thank you!');
    if (c.model) {
      c.model.position.copy(c.spot).y += 0.16;
      c.baseScale = c.creature && ctx.isAR() ? (c.creature.arScale ?? 1) : 1;
      // Never bigger than an armful while it is being unwrapped.
      const longest = c.creature ? (c.creature.size || 0.3) * c.baseScale : 0.3;
      c.showScale = c.baseScale * Math.min(1, 0.45 / longest);
      c.model.scale.setScalar(0.001);
      rig.viewerPosition(_head);
      c.model.rotation.set(0, Math.atan2(_head.x - c.spot.x, _head.z - c.spot.z) + 0.6, 0);
      group.add(c.model);
    }
    const mine = epoch;
    const arrival = c.creature ? `Here comes the ${String(c.creature.name).toLowerCase()}!` : '';
    // The arrival line is in the recorded voice bank; the sender's message is spoken after it.
    const first = arrival && audio.hasLine(arrival) ? audio.speak(arrival) : Promise.resolve();
    first.then(() => (mine === epoch && ceremony === c ? audio.speak(message) : null))
      .then(() => { if (mine === epoch && ceremony === c) { c.spoken = true; c.spokenAt = clock; } });
  }

  function finishCeremony() {
    const c = ceremony;
    if (!c || c.done) return;
    c.done = true;
    ceremony = null;
    ui.close(giftCard);
    present.visible = false;
    if (!c.model) return;
    if (c.gift.kind === 'mesh') {
      group.remove(c.model);
      c.model.scale.setScalar(1);
      const pal = addCompanion(c.model, c.gift);
      if (pal) pal.follower.hop();
    } else {
      group.remove(c.model);
      const spot = plan(c.creature, 1)[0];
      addCreature(c.model, c.creature, spot, { gift: c.gift, from: c.model.position });
      trimGiftCreatures();
      updateCounter(true);
    }
  }

  function updateCeremony(dt) {
    if (!ceremony) {
      while (waiting.length && toyScan.took(waiting[0])) waiting.shift();   // a scan brought this one in already
      if (waiting.length && residentsReady && !recording && !toyScan.busy && clock > nextGiftAt) beginCeremony(waiting.shift());
      return;
    }
    const c = ceremony;
    c.t += dt;
    if (!c.opened) {
      // The present pops in, bobs and turns, and opens by itself if nobody reaches for it.
      const k = Math.min(1, c.t / 0.4);
      const s = 1 + 2.70158 * Math.pow(k - 1, 3) + 1.70158 * Math.pow(k - 1, 2);
      present.scale.setScalar(Math.max(0.001, s));
      present.position.y = c.spot.y + Math.sin(c.t * 2) * 0.012;
      present.rotation.y += dt * 0.6;
      if (c.ready && (c.wantOpen || c.t > 12)) openGift();
      return;
    }
    const since = clock - c.openedAt;
    present.scale.setScalar(Math.max(0.001, 1 - since / 0.2));
    if (since > 0.2) present.visible = false;
    if (c.model) {
      const k = Math.min(1, since / 0.5);
      const s = 1 + 2.70158 * Math.pow(k - 1, 3) + 1.70158 * Math.pow(k - 1, 2);
      c.model.scale.setScalar(Math.max(0.001, c.showScale * s));
      c.model.position.y = c.spot.y + 0.16 + Math.sin(since * 2.2) * 0.02;
      c.model.rotation.y += dt * 0.5;
    }
    // Off it goes once the message has been heard (or after a while, if the voice is off).
    if ((c.spoken && clock - c.spokenAt > 1.6) || since > 16) { nextGiftAt = clock + 1.2; finishCeremony(); }
  }
  let nextGiftAt = 0;

  // ------------------------------------------------------------------------------------ the spoken wish

  let stream = null, recorder = null, chunks = [], recording = false, recordStart = 0, busy = false, micRefused = false, autoStop = 0;

  async function beginWish() {
    if (recording || busy || !active) return;
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function' || typeof MediaRecorder !== 'function') {
      setStatus('This browser cannot listen. Ask on the phone instead.');
      return;
    }
    recording = true;                       // claimed now, so letting go early is noticed
    const mine = epoch;
    if (!stream) setStatus('One moment...');
    try {
      if (!stream) stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
    } catch {
      recording = false; micRefused = true;
      setStatus('I cannot hear you yet. Ask a grown-up to allow the microphone.');
      return;
    }
    if (mine !== epoch) { stopStream(); return; }
    if (!recording) { setStatus('Ready now. ' + idleStatus()); return; }   // let go before the microphone woke up
    try {
      const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find((t) => MediaRecorder.isTypeSupported(t));
      recorder = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 32000 } : undefined);
    } catch {
      recording = false;
      setStatus('This browser cannot listen. Ask on the phone instead.');
      return;
    }
    chunks = [];
    recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    recorder.onstop = () => sendWish(mine);
    recorder.start();
    recordStart = performance.now();
    autoStop = clock + 8;                   // nobody holds a wish longer than that
    audio.stop();                           // the guide stops talking while she listens
    setStatus('Listening...');
    wishButton.setLabel('Send wish');
    if (ctx.companions) ctx.companions.hopAll();
  }

  function endWish() {
    if (!recording) return;
    recording = false;
    wishButton.setLabel('Make a wish');
    if (recorder && recorder.state !== 'inactive') { try { recorder.stop(); } catch { setStatus(idleStatus()); } }
    else if (stream) setStatus(idleStatus());
  }

  function toggleWish() { if (recording) endWish(); else beginWish(); }

  async function sendWish(mine) {
    const type = (recorder && recorder.mimeType) || 'audio/webm';
    const blob = new Blob(chunks, { type });
    chunks = []; recorder = null;
    if (mine !== epoch) return;
    if (performance.now() - recordStart < 350 || blob.size < 800) { setStatus('I did not catch that. Hold the button a little longer.'); return; }
    busy = true;
    setStatus('Thinking...');
    try {
      const heard = ((await ctx.api.stt(blob)) || '').trim();
      if (mine !== epoch) return;
      if (!heard) { setStatus('I did not catch that. Try again?'); return; }
      setStatus('Heard: ' + (heard.length > 60 ? heard.slice(0, 57) + '...' : heard) + ' ');
      if (isScanCommand(heard)) { toyScan.start(); return; }
      const gift = await ctx.api.sendWish({ sender: 'Me', text: heard });
      if (mine !== epoch) return;
      // It arrives like any other gift; no need to wait for the next poll.
      if (gift && ctx.gifts) ctx.gifts.add(gift);
    } catch (err) {
      if (mine === epoch) setStatus((err && err.message) || 'Something went wrong. Please try again.');
    } finally {
      busy = false;
    }
  }

  function stopStream() {
    if (stream) { for (const t of stream.getTracks()) { try { t.stop(); } catch { /* gone */ } } stream = null; }
  }

  // ------------------------------------------------------------------------------------ pointing, touching, scattering

  /** Fish near where a hand points dart away: the trigger's job when it is not on a button or a creature. */
  function nudgeNear(hand) {
    const h = ctx.controllers[hand] || ctx.controllers.right;
    let moved = 0;
    for (const c of creatures) {
      // The nearest point to the creature on the first four metres of the pointer.
      _v.copy(c.object.position).sub(h.origin);
      const t = clamp(_v.dot(h.direction), 0, 4);
      _p.copy(h.origin).addScaledVector(h.direction, t);
      if (_p.distanceTo(c.object.position) < 0.7 + c.hitRadius && c.mover.scatter(_p.lerp(h.origin, 0.15), 1)) moved++;
    }
    if (moved) { audio.pop(h.hit); ctx.haptic(hand, 0.5, 60); } else ctx.haptic(hand, 0.15, 20);
    return moved;
  }

  function updateCreatures(dt) {
    const ar = ctx.isAR(), immersive = ctx.isImmersive();
    rig.viewerPosition(_head); rig.viewerForward(_fwd);
    const left = ctx.controllers.left, right = ctx.controllers.right;
    const floor = center.y;

    // Gaze: the creature nearest the middle of the view, if the head is really on it.
    let gazed = null, gazedAt = Infinity;
    if (!ceremony) {
      for (const c of creatures) {
        _v.copy(c.object.position).sub(_head);
        const d = _v.length();
        if (d < 0.2 || d > 12 || d >= gazedAt) continue;
        if (_v.dot(_fwd) / d > Math.cos(Math.atan2(c.hitRadius, d))) { gazed = c; gazedAt = d; }
      }
    }

    for (let i = 0; i < creatures.length; i++) {
      const c = creatures[i];
      c.mover.update(dt, clock, ar ? _head : null);

      if (c.blend < 1) {                                   // gliding from where it was unwrapped to its ring
        c.blend = Math.min(1, c.blend + dt / 1.6);
        const k = c.blend * c.blend * (3 - 2 * c.blend);
        c.object.position.lerpVectors(c.from, c.object.position, k);
        c.object.scale.setScalar(c.fromScale + (c.baseScale - c.fromScale) * k);
      }
      if (c.grow < 1) {                                    // residents pop in as their models arrive
        c.grow = Math.min(1, c.grow + dt * 2.2);
        const k = c.grow;
        c.object.scale.setScalar(Math.max(0.001, c.baseScale * (1 + 2.70158 * Math.pow(k - 1, 3) + 1.70158 * Math.pow(k - 1, 2))));
      }

      if (immersive) {
        for (let k = 0; k < 2; k++) {
          const h = k === 0 ? left : right;
          if (!h.tracked) continue;
          _p.setFromMatrixPosition(h.grip.matrixWorld);
          const d = _p.distanceTo(c.object.position);
          // Touch: either controller reaching the creature.
          if (d < c.hitRadius + 0.06 && clock >= c.cooldown && !ceremony) { ctx.haptic(h.name, 0.5, 80); learn(c); }
          // In the real room, small schooling creatures dart away from a reaching hand.
          if (ar && c.shies) c.mover.avoid(_p, dt, SCATTER_RANGE);
        }
      }

      // Gaze glow builds while looked at, and fires at two seconds.
      let gazeGlow = 0;
      if (c === gazed) {
        c.gaze += dt;
        gazeGlow = Math.min(1, c.gaze / GAZE_SECONDS) * 0.4;
        if (c.gaze >= GAZE_SECONDS && !c.gazeUsed) { c.gazeUsed = true; learn(c); }
      } else { c.gaze = 0; c.gazeUsed = false; }

      const lit = clock < c.lit;
      const target = lit ? 0.55 + Math.sin(clock * 6) * 0.15 : Math.max(gazeGlow, c.hovered ? 0.25 : 0);
      if (Math.abs(target - c.glow) > 0.002) {
        c.glow += Math.sign(target - c.glow) * Math.min(Math.abs(target - c.glow), dt * 3);
        setGlow(c.object, c.glow);
      }
      // Slows to a crawl while its fact card is showing, so it can be touched.
      const want = lit ? 0.15 : 1;
      c.mover.speedScale += Math.sign(want - c.mover.speedScale) * Math.min(Math.abs(want - c.mover.speedScale), dt * 1.5);

      if (i < 40) shadows.place(i, c.object.position, Math.max(0.05, c.size * 0.35), floor, c.walker ? 2 : 3.5);
    }
    for (let i = creatures.length; i < shadowCount; i++) shadows.hide(i);
    shadowCount = Math.min(40, creatures.length);
    shadows.commit();
  }
  let shadowCount = 0;

  // ------------------------------------------------------------------------------------ the tab

  return {
    name: 'Reef',
    group,

    enter() {
      active = true; epoch++;
      const ar = ctx.isAR();
      const wish = Boolean(ctx.handoff && ctx.handoff.wish);
      ctx.handoff = null;
      if (!ar) ctx.setEnvironment(WORLD, { scenery: true });
      lighting.caustic.value = ar ? 0 : 0.9;        // moving light patterns underwater (not over a real room)

      // The place is wherever the viewer is standing and facing as they arrive.
      rig.viewerPosition(_head); rig.viewerForwardFlat(_fwd);
      school.gather(_schoolHead.set(_head.x, rig.floorY(), _head.z));
      if (ar && _head.lengthSq() > 1e-6) { center.set(_head.x, rig.floorY(), _head.z); forward.copy(_fwd); }
      else { center.set(0, rig.floorY(), 0); forward.set(0, 0, -1); }
      placeInfo();
      infoPanel.setText(ar ? 'My room' : 'Reef', 0);
      info.visible = true;
      setStatus(micRefused ? 'Press the button to make a wish' : idleStatus());
      wishButton.setLabel('Make a wish');
      shadows.mesh.visible = true;

      residentsReady = false;
      const mine = epoch;
      Promise.all(RESIDENTS.map(([id, n]) => spawnKind(id, n))).then(() => {
        if (mine !== epoch) return;
        residentsReady = true;
        updateCounter(false);
        // Gifts so far, then every new one as it lands.
        if (ctx.gifts) {
          backlog = [];
          unsubscribe = ctx.gifts.subscribe(onGift);
          const before = backlog;
          backlog = null;
          settleBacklog(before);
        }
      });
      updateCounter(false);
      nextGiftAt = clock + 2.5;

      ctx.log('world_visited', { world: WORLD, name: 'Reef', mode: ctx.mode ? ctx.mode() : (ar ? 'ar' : 'vr') });
      guide.say(wish ? LINE_WISH : ar ? LINE_AR : LINE_REEF);
    },

    exit() {
      active = false; epoch++;
      lighting.caustic.value = 0;
      if (unsubscribe) { unsubscribe(); unsubscribe = null; }
      if (recording) { recording = false; try { if (recorder && recorder.state !== 'inactive') { recorder.onstop = null; recorder.stop(); } } catch { /* gone */ } }
      recorder = null; chunks = []; busy = false;
      stopStream();
      toyScan.cancel();
      if (ceremony) { if (ceremony.model) group.remove(ceremony.model); ceremony = null; }
      // An unopened gift that was mid-arrival comes back next time.
      waiting.length = 0; late.length = 0; seen.clear();
      present.visible = false; giftCard.visible = false; factCard.visible = false;
      while (creatures.length) removeCreature(creatures[creatures.length - 1]);
      for (let i = 0; i < 40; i++) shadows.hide(i);
      shadows.commit();
      shadowCount = 0;
    },

    update(dt, elapsed) {
      clock = elapsed;
      lighting.time.value = elapsed;
      rig.viewerPosition(_schoolHead);
      school.update(dt, elapsed, { center: center, head: _schoolHead, hands: ctx.alive ? ctx.alive.tips() : [] });
      updateCreatures(dt);
      updateCeremony(dt);
      toyScan.update(dt);
      rig.viewerPosition(_head); rig.viewerForward(_fwd);
      if (factCard.visible && clock >= factHideAt) ui.close(factCard);
      if (recording && clock > autoStop) endWish();
      if (late.length && clock - lateAt > 0.6) settleBacklog(late.splice(0));
      // "Listening..." and "Thinking..." count their dots, so it is plain that something is happening.
      if (statusText.endsWith('...')) {
        const dots = 1 + Math.floor(clock * 3) % 3;
        const shown = statusText.slice(0, -3) + '.'.repeat(dots);
        if (shown !== statusShown) { statusShown = shown; status.setText(shown); }
      }
    },

    /** Trigger on nothing in particular: the fish near where you point dart away. */
    onSelectStart(hand) { nudgeNear(hand); },
    onSelectEnd() {},
    onSqueezeStart() {}, onSqueezeEnd() {},
    /** A on the right controller (V on a keyboard): push-to-talk, as in Unity. */
    onButtonDown(hand, name) { if (name === 'a') beginWish(); },
    onButtonUp(hand, name) { if (name === 'a') endWish(); },
    onRecenter() {
      if (!ctx.isAR()) return;
      rig.viewerPosition(_head); rig.viewerForwardFlat(_fwd);
      center.set(_head.x, rig.floorY(), _head.z); forward.copy(_fwd);
      for (const c of creatures) c.mover.setCenter(center);
      placeInfo();
    },
  };
}
