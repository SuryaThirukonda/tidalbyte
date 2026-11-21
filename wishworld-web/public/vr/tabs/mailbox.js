// The mailbox (web spec section 7): a small snowy mailbox whose flag rises when a letter from the phone is
// waiting. Opening it shows the note on a card and plays the sender's voice clip, or speaks the note when
// there is no clip, and tells the server it was opened so the parent sees it in Inbox. Letters queue.
//
// There is no mailbox in the Unity game, so it is built in the game's style: the same blocky vertex-coloured
// shapes, the hub's snow, and the game's cards and buttons.

import * as THREE from 'three';
import { MeshBuilder } from '/shared/models.js';
import { createSnowfall, createShadowPool } from '/vr/core/fx.js';
import { colors } from '/vr/core/theme.js';

export const meta = { id: 'mailbox', label: 'Mailbox', order: 7 };

const DEG = Math.PI / 180;
const _head = new THREE.Vector3(), _fwd = new THREE.Vector3(), _right = new THREE.Vector3();

function buildMailbox() {
  const wood = [0.42, 0.33, 0.28], red = [0.90, 0.25, 0.22];
  const body = new MeshBuilder()
    .sphere([0, 0.0, 0], [0.62, 0.2, 0.62], colors.snow, null, 9)                       // a drift of snow at the foot
    .cylinder([0, 0.5, 0], [0.075, 1.0, 0.075], wood)                                    // post
    .cube([0, 0.985, 0], [0.16, 0.03, 0.3], wood)                                        // shelf
    .cube([0, 1.09, 0], [0.26, 0.18, 0.42], colors.ribbon)                               // box
    .taperBox([0, 1.215, 0], [0.26, 0.07, 0.42], colors.ribbon, null, 0.55, 1)           // rounded top
    .cube([0, 1.095, 0.212], [0.2, 0.15, 0.012], colors.snowWhite)                       // door
    .cube([0, 1.12, 0.22], [0.13, 0.018, 0.008], colors.slate)                           // letter slot
    .cube([0, 1.06, 0.222], [0.03, 0.03, 0.012], colors.peach)                           // knob
    .taperBox([0, 1.265, 0], [0.17, 0.045, 0.4], colors.snowWhite, null, 0.6, 0.94)      // snow on top
    .mesh({ mirror: 'x' });
  body.name = 'MailboxBody';
  const flag = new MeshBuilder()
    .cube([0, 0, 0.12], [0.02, 0.026, 0.26], colors.slate)                               // arm, lying forward when down
    .cube([0, 0.06, 0.19], [0.02, 0.12, 0.13], red)                                      // the flag itself
    .mesh({ mirror: 'x' });
  flag.name = 'MailboxFlag';
  const pivot = new THREE.Group();
  pivot.name = 'FlagPivot';
  pivot.position.set(-0.14, 1.09, -0.08);
  pivot.add(flag);
  const root = new THREE.Group();
  root.name = 'Mailbox';
  root.add(body, pivot);
  return { root, pivot };
}

export function createTab(ctx) {
  const { ui, audio, rig, input } = ctx;
  const group = new THREE.Group();
  group.name = 'MailboxTab';

  const { root: mailbox, pivot: flagPivot } = buildMailbox();
  group.add(mailbox);
  input.addTarget(mailbox, { radius: 0.28, ui: false, offset: new THREE.Vector3(0, 1.1, 0), onHover: (on) => { hovered = on; }, onClick: () => openNext() });
  const shadows = createShadowPool(1);
  group.add(shadows.mesh);
  const snow = createSnowfall({ count: 200, area: [9, 0.1, 9] });
  group.add(snow);

  // The sign over the mailbox: how many letters are waiting, and the button that opens the next one.
  const sign = new THREE.Group();
  sign.name = 'MailboxSign';
  const signPanel = ui.makePanel({
    width: 0.5, height: 0.13, style: 'plate', fill: colors.panel,
    labels: [{ text: '', size: 0.04, font: 'heading', w: 0.44, h: 0.09 }],
  });
  const openButton = ui.makeButton('Open', () => openNext(), { width: 0.26, height: 0.1, textHeight: 0.042, fill: colors.peach });
  openButton.position.set(0, -0.14, 0.004);
  sign.add(signPanel, openButton);
  group.add(sign);
  ui.popIn(sign, { bob: 0.006 });

  // The letter.
  const letter = new THREE.Group();
  letter.name = 'Letter';
  letter.visible = false;
  const page = ui.makePanel({
    width: 0.8, height: 0.52, style: 'frame', fill: colors.panel, radius: 0.045, border: 0.008,
    labels: [
      { text: '', size: 0.036, font: 'body', w: 0.68, h: 0.36, y: -0.01 },
      { text: '', size: 0.024, font: 'body', w: 0.4, h: 0.04, x: 0.17, y: -0.225, align: 'right' },
    ],
  });
  const from = ui.makeRibbon('', { width: 0.5, height: 0.09, textHeight: 0.05, fill: colors.peach, color: colors.slate });
  from.position.set(0, 0.258, 0.008);
  const nextButton = ui.makeButton('Close', () => closeLetter(true), { width: 0.28, height: 0.1, textHeight: 0.04, fill: colors.peach });
  nextButton.position.set(0.16, -0.325, 0.006);
  const againButton = ui.makeButton('Hear it again', () => { if (showing) play(showing); }, { width: 0.3, height: 0.1, textHeight: 0.036 });
  againButton.position.set(-0.16, -0.325, 0.006);
  letter.add(page, from, nextButton, againButton);
  group.add(letter);
  ui.popIn(letter, { bob: 0.006 });

  const pageOpened = Date.now();
  const waiting = [];              // unopened letters, oldest first
  const read = [];                 // letters opened before, newest last
  const seen = new Set();
  let showing = null, hovered = false, active = false, epoch = 0, unsubscribe = null;
  let flagAngle = 0, flagSpeed = 0, clock = 0, rereadIndex = -1, wobble = 0;

  function refresh() {
    const n = waiting.length;
    signPanel.setText(n === 0 ? (read.length ? 'No new letters' : 'No letters yet') : n === 1 ? 'A letter for you!' : `${n} letters for you!`);
    openButton.setLabel(n > 0 ? 'Open' : 'Read again');
    openButton.visible = n > 0 || read.length > 0;
    if (showing) nextButton.setLabel(n > 0 ? 'Next letter' : 'Close');
  }

  function onGift(gift, replayed) {
    if (!gift || gift.kind !== 'letter' || seen.has(gift.id)) return;
    seen.add(gift.id);
    if (gift.opened_at) { read.push(gift); refresh(); return; }
    waiting.push(gift);
    waiting.sort((a, b) => Number(a.id) - Number(b.id));
    refresh();
    const sent = Date.parse(gift.created_at || '');
    const fresh = !Number.isFinite(sent) || sent > pageOpened - 30000;
    if (!replayed && active && fresh) {
      // A letter just landed: the flag goes up with a chime.
      audio.chime(mailbox);
      ctx.haptic('both', 0.3, 60);
      wobble = 1;
    }
  }

  function play(gift) {
    const mine = epoch;
    const note = (gift.message || gift.wish || '').trim();
    // The sender's own voice when they recorded one; otherwise the guide reads the note out.
    const done = gift.audio_url ? audio.playUrl(gift.audio_url) : (note ? audio.speak(note) : Promise.resolve());
    return done.then(() => mine === epoch);
  }

  function show(gift, firstTime) {
    showing = gift;
    const note = (gift.message || gift.wish || '').trim() || 'Thinking of you!';
    from.setText('From ' + ((gift.sender || '').trim() || 'a friend'));
    page.setText(note, 0);
    page.setText(gift.audio_url ? 'with a voice message' : '', 1);
    page.typeOn(Math.min(5, Math.max(1, note.length * 0.03)), 0);
    nextButton.setLabel(waiting.length > 0 ? 'Next letter' : 'Close');
    if (letter.visible) ui.replay(letter); else letter.visible = true;
    audio.pop(mailbox);
    wobble = 1;
    play(gift);
    if (firstTime) {
      // Opened: the API marks it and logs gift_opened, which is what the parent's Inbox shows.
      if (ctx.gifts) ctx.gifts.open(gift); else ctx.api.openGift(gift.id).catch(() => {});
      gift.opened_at = gift.opened_at || new Date().toISOString();
      read.push(gift);
    }
    refresh();
  }

  function openNext() {
    if (waiting.length) { rereadIndex = -1; show(waiting.shift(), true); return; }
    if (!read.length) { wobble = 1; audio.sfx('hover', 0.4, mailbox); return; }
    // Nothing new: go back through the letters already read, newest first.
    rereadIndex = rereadIndex < 0 ? read.length - 1 : (rereadIndex - 1 + read.length) % read.length;
    show(read[rereadIndex], false);
  }

  function closeLetter(next) {
    audio.stop();
    if (next && waiting.length) { show(waiting.shift(), true); return; }
    showing = null;
    ui.close(letter);
    refresh();
  }

  function place() {
    // A step ahead and a little to the left; the letter opens beside it, at reading height.
    rig.viewerPosition(_head); rig.viewerForwardFlat(_fwd);
    if (!ctx.isAR()) { _head.set(0, _head.y, 0); _fwd.set(0, 0, -1); }
    _right.set(-_fwd.z, 0, _fwd.x);
    const floor = rig.floorY();
    mailbox.position.set(_head.x + _fwd.x * 1.25 - _right.x * 0.5, floor, _head.z + _fwd.z * 1.25 - _right.z * 0.5);
    mailbox.rotation.y = Math.atan2(_head.x - mailbox.position.x, _head.z - mailbox.position.z);
    sign.position.set(mailbox.position.x, floor + 1.62, mailbox.position.z);
    sign.rotation.y = mailbox.rotation.y;
    letter.position.set(_head.x + _fwd.x * 1.1 + _right.x * 0.28, floor + 1.45, _head.z + _fwd.z * 1.1 + _right.z * 0.28);
    letter.rotation.set(-6 * DEG, Math.atan2(_head.x - letter.position.x, _head.z - letter.position.z), 0, 'YXZ');
    snow.position.set(_head.x + _fwd.x * 2, floor + 4.5, _head.z + _fwd.z * 2);
  }

  let placed = false;

  return {
    name: 'Mailbox',
    group,

    enter() {
      active = true; epoch++;
      snow.visible = !ctx.isAR();
      shadows.mesh.visible = true;
      placed = false;
      place();
      placed = !ctx.isAR();
      letter.visible = false; showing = null; rereadIndex = -1;
      refresh();
      if (ctx.gifts) unsubscribe = ctx.gifts.subscribe(onGift);
      refresh();
    },

    exit() {
      active = false; epoch++;
      if (unsubscribe) { unsubscribe(); unsubscribe = null; }
      letter.visible = false; showing = null;
    },

    onRecenter() { place(); },

    update(dt, elapsed) {
      clock = elapsed;
      if (!placed) { rig.viewerPosition(_head); if (_head.lengthSq() > 1e-6) { place(); placed = true; } }
      if (snow.visible) snow.update(elapsed);
      // The flag: up while a letter waits, on a spring so it bounces as it lands.
      const target = waiting.length > 0 ? -92 * DEG : 0;
      flagSpeed += (target - flagAngle) * 90 * dt;
      flagSpeed *= Math.exp(-7 * dt);
      flagAngle += flagSpeed * dt;
      flagPivot.rotation.x = flagAngle;
      // A little shake when it is opened or pointed at.
      if (wobble > 0) wobble = Math.max(0, wobble - dt * 2.2);
      const sway = Math.sin(elapsed * 18) * 0.05 * wobble + (hovered ? Math.sin(elapsed * 5) * 0.012 : 0);
      mailbox.rotation.z = sway;
      shadows.place(0, mailbox.position, 0.34, rig.floorY(), 2);
      shadows.commit();
    },

    /** Trigger on nothing in particular also opens the mailbox when a letter is waiting and none is showing. */
    onSelectStart() { if (!showing && waiting.length) openNext(); },
    onSelectEnd() {}, onSqueezeStart() {}, onSqueezeEnd() {},
  };
}
