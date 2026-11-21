// Settings: the chosen child profile's buddies and preferences, saved to the profile as they change and applied
// at once (the shell's ctx.profile does the saving and applying; see /vr/main.js).
//
//   Buddies          this profile's saved companions and the gifts that could be buddies, each with a
//                    "follows me" toggle. At most three follow at once, so the frame rate holds on a Quest 2.
//                    "Edit" gives a buddy a new name (pick one, or type one outside the headset) or lets it go.
//   Sound            volume, and the guide's voice on or off (captions stay).
//   Calm microphone  how easily the Calm tab hears a breath.
//   Profiles         switch to another child in this room.

import * as THREE from 'three';
import { colors } from '/vr/core/theme.js';

export const meta = { id: 'settings', label: 'Settings', order: 8 };

const MAX_FOLLOWING = 3;
const MAX_ROWS = 7;
// Names a child can pick in the headset, where there is no keyboard. Shown six at a time.
const NAMES = [
  'Sunny', 'Pip', 'Bubbles', 'Biscuit', 'Ziggy', 'Coco', 'Pebble', 'Maple', 'Nugget', 'Waffles', 'Juniper', 'Sprout',
  'Doodle', 'Comet', 'Peanut', 'Mochi', 'Pickles', 'Button', 'Noodle', 'Twinkle', 'Marshmallow', 'Rocket', 'Clover', 'Jelly',
];
const _head = new THREE.Vector3(), _fwd = new THREE.Vector3();

export function createTab(ctx) {
  const { ui, rig } = ctx;
  const group = new THREE.Group();
  group.name = 'SettingsTab';
  const board = new THREE.Group();
  board.name = 'SettingsBoard';
  group.add(board);

  const W = 1.34, H = 0.98;
  const panel = ui.makePanel({
    width: W, height: H, style: 'frame', fill: colors.panel, radius: 0.05, border: 0.008,
    labels: [
      { text: 'Buddies', size: 0.042, font: 'heading', w: 0.6, h: 0.06, x: -0.33, y: 0.36 },
      { text: '', size: 0.026, font: 'body', w: 0.6, h: 0.05, x: -0.33, y: 0.305 },
      { text: 'Sound', size: 0.042, font: 'heading', w: 0.56, h: 0.06, x: 0.35, y: 0.36 },
      { text: 'Calm microphone', size: 0.034, font: 'heading', w: 0.56, h: 0.05, x: 0.35, y: 0.045 },
      { text: 'Who is playing?', size: 0.034, font: 'heading', w: 0.56, h: 0.05, x: 0.35, y: -0.175 },
    ],
  });
  board.add(panel);
  const ribbon = ui.makeRibbon('Settings', { width: 0.56, height: 0.1, textHeight: 0.064 });
  ribbon.position.set(0, H / 2 - 0.005, 0.008);
  board.add(ribbon);

  // ---------- right column: sound, microphone, profiles ----------
  const X = 0.35;
  const volumeLabel = ui.makeLabel('80%', { width: 0.2, height: 0.07, size: 0.036, font: 'heading' });
  volumeLabel.position.set(X, 0.27, 0.006);
  const volumeDown = ui.makeButton('-', () => stepVolume(-1), { width: 0.1, height: 0.085, textHeight: 0.05 });
  volumeDown.position.set(X - 0.17, 0.27, 0.006);
  const volumeUp = ui.makeButton('+', () => stepVolume(1), { width: 0.1, height: 0.085, textHeight: 0.05 });
  volumeUp.position.set(X + 0.17, 0.27, 0.006);
  const voiceButton = ui.makeButton('Guide voice: on', () => toggleVoice(), { width: 0.42, height: 0.085, textHeight: 0.032 });
  voiceButton.position.set(X, 0.16, 0.006);
  const micLabel = ui.makeLabel('5 of 10', { width: 0.2, height: 0.07, size: 0.034, font: 'heading' });
  micLabel.position.set(X, -0.04, 0.006);
  const micDown = ui.makeButton('-', () => stepMic(-1), { width: 0.1, height: 0.085, textHeight: 0.05 });
  micDown.position.set(X - 0.17, -0.04, 0.006);
  const micUp = ui.makeButton('+', () => stepMic(1), { width: 0.1, height: 0.085, textHeight: 0.05 });
  micUp.position.set(X + 0.17, -0.04, 0.006);
  const micHint = ui.makeLabel('More = hears softer breaths', { width: 0.5, height: 0.045, size: 0.022 });
  micHint.position.set(X, -0.105, 0.006);
  board.add(volumeLabel, volumeDown, volumeUp, voiceButton, micLabel, micDown, micUp, micHint);

  const profileButtons = new THREE.Group();
  board.add(profileButtons);
  const buddyRows = new THREE.Group();
  board.add(buddyRows);
  const status = ui.makeLabel('', { width: W - 0.12, height: 0.06, size: 0.026 });
  status.position.set(0, -H / 2 + 0.055, 0.006);
  board.add(status);

  let active = false, epoch = 0, placed = false;
  let buddies = [];             // [{ key, name, companionId, giftId }]
  let unlisten = null;
  let editing = null;           // the buddy being renamed or let go, or null for the list
  let confirmGo = false;        // "Let go" asks once more before it happens
  let nameStart = 0;            // which six of NAMES are showing

  // ---------- helpers ----------
  const settings = () => (ctx.profile && ctx.profile.current ? ctx.profile.current.settings : {});
  const save = (patch) => (ctx.profile ? ctx.profile.save(patch) : Promise.resolve());
  function say(text) { status.setText(text || ''); }

  function clearGroup(g) {
    while (g.children.length) {
      const c = g.children.pop();
      if (typeof ui.forget === 'function') ui.forget(c);
      if (ctx.input && ctx.input.removeTarget) ctx.input.removeTarget(c);   // buttons are pointer targets
      c.removeFromParent();
    }
  }

  /** Who follows: the saved list, or (none saved yet) the newest three buddies. */
  function following() {
    const list = settings().following;
    if (Array.isArray(list)) return list.slice(0, MAX_FOLLOWING);
    return buddies.filter((b) => b.companionId).map((b) => b.companionId).slice(-MAX_FOLLOWING);
  }

  // ---------- drawing ----------
  function drawSound() {
    const s = settings();
    volumeLabel.setText(Math.round((s.volume ?? 0.8) * 100) + '%');
    voiceButton.setLabel(s.guideVoice === false ? 'Guide voice: off' : 'Guide voice: on');
    micLabel.setText(Math.round((s.micSensitivity ?? 0.5) * 9) + 1 + ' of 10');
  }

  function drawProfiles() {
    clearGroup(profileButtons);
    const list = ctx.profile ? ctx.profile.list : [];
    const current = ctx.profile && ctx.profile.current;
    list.slice(0, 6).forEach((p, i) => {
      const b = ui.makeButton(p.name, () => switchTo(p), { width: 0.26, height: 0.08, textHeight: 0.03, fill: current && p.id === current.id ? colors.peach : undefined });
      b.position.set(X - 0.14 + (i % 2) * 0.28, -0.25 - Math.floor(i / 2) * 0.095, 0.006);
      profileButtons.add(b);
    });
  }

  function drawBuddies() {
    if (editing) return drawEditor();
    clearGroup(buddyRows);
    const follow = following();
    const name = ctx.profile && ctx.profile.current ? ctx.profile.current.name : '';
    panel.setText(`${name}'s buddies. ${follow.length} of ${MAX_FOLLOWING} follow you.`, 1);
    if (!buddies.length) {
      const empty = ui.makeLabel('No buddies yet. Scan a toy on the phone, or make a wish!', { width: 0.58, height: 0.12, size: 0.028 });
      empty.position.set(-0.33, 0.18, 0.006);
      buddyRows.add(empty);
      return;
    }
    buddies.slice(0, MAX_ROWS).forEach((b, i) => {
      const y = 0.235 - i * 0.092;
      const on = b.companionId && follow.includes(b.companionId);
      const label = ui.makeLabel(b.name, { width: 0.26, height: 0.07, size: 0.03, align: 'left' });
      label.position.set(-0.5, y, 0.006);
      const toggle = ui.makeButton(on ? 'Follows me' : 'Stays here', () => toggleFollow(b), {
        width: 0.22, height: 0.075, textHeight: 0.026, fill: on ? colors.peach : undefined,
      });
      toggle.position.set(-0.245, y, 0.006);
      const edit = ui.makeButton('Edit', () => openEditor(b), { width: 0.1, height: 0.075, textHeight: 0.024 });
      edit.position.set(-0.075, y, 0.006);
      buddyRows.add(label, toggle, edit);
    });
    if (buddies.length > MAX_ROWS) {
      const more = ui.makeLabel(`and ${buddies.length - MAX_ROWS} more`, { width: 0.5, height: 0.05, size: 0.024 });
      more.position.set(-0.33, 0.235 - MAX_ROWS * 0.092, 0.006);
      buddyRows.add(more);
    }
  }

  /** The edit panel for one buddy, in place of the list: six names to pick, more names, type a name (outside the
   *  headset), let it go, back. */
  function drawEditor() {
    clearGroup(buddyRows);
    const b = editing;
    panel.setText(`Pick a new name for ${b.name}.`, 1);
    const names = [];
    for (let i = 0; names.length < 6 && i < NAMES.length; i++) {
      const n = NAMES[(nameStart + i) % NAMES.length];
      if (n !== b.name) names.push(n);
    }
    names.forEach((n, i) => {
      const btn = ui.makeButton(n, () => renameTo(n), { width: 0.26, height: 0.075, textHeight: 0.028 });
      btn.position.set(-0.475 + (i % 2) * 0.28, 0.235 - Math.floor(i / 2) * 0.09, 0.006);
      buddyRows.add(btn);
    });
    const more = ui.makeButton('More names', () => { nameStart = (nameStart + 6) % NAMES.length; drawEditor(); },
      { width: 0.26, height: 0.075, textHeight: 0.026 });
    more.position.set(-0.475, -0.04, 0.006);
    buddyRows.add(more);
    const typing = !ctx.isImmersive() && typeof window.prompt === 'function';
    if (typing) {
      const type = ui.makeButton('Type a name', () => typeName(), { width: 0.26, height: 0.075, textHeight: 0.026 });
      type.position.set(-0.195, -0.04, 0.006);
      buddyRows.add(type);
    }
    const go = ui.makeButton(confirmGo ? `Yes, let ${b.name} go` : `Let ${b.name} go`, () => letGo(), {
      width: 0.54, height: 0.075, textHeight: 0.026, fill: confirmGo ? colors.peach : undefined,
    });
    go.position.set(-0.335, -0.14, 0.006);
    const back = ui.makeButton('Back to buddies', () => closeEditor(), { width: 0.54, height: 0.075, textHeight: 0.026 });
    back.position.set(-0.335, -0.235, 0.006);
    buddyRows.add(go, back);
  }

  function drawAll() { drawSound(); drawProfiles(); drawBuddies(); }

  // ---------- loading ----------
  async function loadBuddies() {
    const mine = epoch;
    try {
      const data = await ctx.api.getBuddies();
      if (mine !== epoch) return;
      const saved = (data.companions || []).map((c) => ({ key: 'c' + c.id, name: c.name, companionId: c.id, giftId: c.gift_id }));
      const gifts = (data.gifts || []).map((g) => ({ key: 'g' + g.id, name: g.name, companionId: null, giftId: g.id }));
      buddies = [...saved, ...gifts];
    } catch (err) {
      if (mine !== epoch) return;
      buddies = [];
      say('Buddies could not be loaded just now.');
    }
    drawBuddies();
  }

  // ---------- changes (each is saved at once) ----------
  function stepVolume(d) {
    const v = Math.round(Math.min(1, Math.max(0, (settings().volume ?? 0.8) + d * 0.1)) * 10) / 10;
    save({ volume: v });
    drawSound();
    if (ctx.audio && ctx.audio.pop) ctx.audio.pop();
  }

  function toggleVoice() {
    save({ guideVoice: settings().guideVoice === false });
    drawSound();
    if (settings().guideVoice !== false) ctx.say('I can talk again!');
  }

  function stepMic(d) {
    const step = Math.round((settings().micSensitivity ?? 0.5) * 9) + d;
    save({ micSensitivity: Math.max(0, Math.min(9, step)) / 9 });
    drawSound();
  }

  async function toggleFollow(b) {
    const follow = following();
    if (b.companionId && follow.includes(b.companionId)) {
      await save({ following: follow.filter((id) => id !== b.companionId) });
      say(`${b.name} will stay here.`);
      drawBuddies();
      return;
    }
    if (follow.length >= MAX_FOLLOWING) {
      say(`${MAX_FOLLOWING} buddies can follow at once. Turn one off first.`);
      return;
    }
    let id = b.companionId;
    if (!id) {
      try {
        const saved = await ctx.api.saveCompanion({ giftId: b.giftId });
        id = saved && saved.id;
      } catch (err) {
        say((err && err.message) || 'That buddy could not join just now.');
        return;
      }
      if (!id) return;
      b.companionId = id;
    }
    await save({ following: [...follow, id] });
    say(`${b.name} follows you now.`);
    drawBuddies();
  }

  // ---------- renaming and letting go ----------
  function openEditor(b) { editing = b; confirmGo = false; say(''); drawBuddies(); }
  function closeEditor() { editing = null; confirmGo = false; drawBuddies(); }

  /** A gift that is not a buddy yet is kept first, so it has a companion to rename. -> companion id or null */
  async function keep(b) {
    if (b.companionId) return b.companionId;
    try {
      const saved = await ctx.api.saveCompanion({ giftId: b.giftId });
      if (saved && saved.id) b.companionId = saved.id;
    } catch (err) {
      say((err && err.message) || 'That buddy could not be changed just now.');
    }
    return b.companionId;
  }

  async function renameTo(name) {
    const b = editing;
    if (!b) return;
    const old = b.name;
    const id = await keep(b);
    if (!id) return;
    try {
      const saved = await ctx.api.renameCompanion(id, name);
      b.name = (saved && saved.name) || name;
    } catch (err) {
      say((err && err.message) || 'That name could not be saved just now.');
      return;
    }
    if (editing === b) { editing = null; confirmGo = false; }
    say(`${old} is now called ${b.name}!`);
    drawBuddies();
  }

  function typeName() {
    const b = editing;
    if (!b) return;
    const typed = window.prompt(`A new name for ${b.name}:`, b.name);
    const name = String(typed || '').trim().slice(0, 24);
    if (name && name !== b.name) renameTo(name);
  }

  async function letGo() {
    const b = editing;
    if (!b) return;
    if (!confirmGo) { confirmGo = true; say(`Tap again to let ${b.name} go. Their gift stays in the mailbox.`); drawEditor(); return; }
    if (b.companionId) {
      try {
        await ctx.api.removeCompanion(b.companionId);
      } catch (err) {
        say((err && err.message) || 'That buddy could not be let go just now.');
        return;
      }
      const follow = following();
      if (follow.includes(b.companionId)) await save({ following: follow.filter((id) => id !== b.companionId) });
    }
    buddies = buddies.filter((x) => x !== b);
    editing = null; confirmGo = false;
    say(`Bye bye, ${b.name}!`);
    drawBuddies();
  }

  async function switchTo(p) {
    if (!ctx.profile || (ctx.profile.current && p.id === ctx.profile.current.id)) return;
    say(`Switching to ${p.name}...`);
    await ctx.profile.switchTo(p.id);   // the shell enters this tab again for the new profile
  }

  // ---------- placing ----------
  function place() {
    rig.viewerPosition(_head); rig.viewerForwardFlat(_fwd);
    if (!ctx.isAR()) { _head.set(0, _head.y, 0); _fwd.set(0, 0, -1); }
    const floor = rig.floorY();
    board.position.set(_head.x + _fwd.x * 1.25, floor + 1.25, _head.z + _fwd.z * 1.25);
    board.rotation.set(-6 * Math.PI / 180, Math.atan2(_head.x - board.position.x, _head.z - board.position.z), 0, 'YXZ');
  }

  return {
    name: 'Settings',
    group,
    enter() {
      active = true; epoch++;
      place();
      placed = !ctx.isAR();
      say('');
      buddies = [];
      editing = null; confirmGo = false;
      drawAll();
      loadBuddies();
      if (ctx.profile && ctx.profile.onChange) unlisten = ctx.profile.onChange(() => { if (active) drawAll(); });
      ctx.log('settings_opened', {});
    },
    exit() {
      active = false; epoch++;
      if (unlisten) { unlisten(); unlisten = null; }
    },
    update() {
      if (!placed) { rig.viewerPosition(_head); if (_head.lengthSq() > 1e-6) { place(); placed = true; } }
    },
    onRecenter() { place(); },
    onSelectStart() {}, onSelectEnd() {}, onSqueezeStart() {}, onSqueezeEnd() {},
  };
}
