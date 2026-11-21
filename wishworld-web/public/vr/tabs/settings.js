// Settings: the chosen child profile's buddies and preferences, saved to the profile as they change and applied
// at once (the shell's ctx.profile does the saving and applying; see /vr/main.js).
//
//   Buddies          this profile's saved companions and the gifts that could be buddies, each with a
//                    "follows me" toggle. At most three follow at once, so the frame rate holds on a Quest 2.
//                    "Edit" gives a buddy a new name (pick one, or type one outside the headset) or lets it go.
//   Sound            volume, and the guide's voice on or off (captions stay).
//   Calm microphone  how easily the Calm tab hears a breath.
//   Profiles         switch to another child in this room.
//
// A second page, "Scans" (button at the top right): every scanned or generated model and Bubby, each with
//   Shown / Hidden   hidden ones stay out of the games (Snow Hoops balls, Frost Slice fruit) and stop following
//   Fruit yes / no   Frost Slice throws the ones marked fruit, between its own fruit
//   Delete           (two taps) the scan is gone from the room for this child

import * as THREE from 'three';
import { colors } from '/vr/core/theme.js';
import { loadModelUrl, loadCreature } from '/shared/models.js';
import { buildBubby } from '/shared/toys.js';

export const meta = { id: 'settings', label: 'Settings', order: 8 };

const MAX_FOLLOWING = 3;
const MAX_ROWS = 6;               // buddies a page (Prev / Next for the rest)
const PREVIEW = 0.075;            // metres across, the little turning model on each row
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
  // Page one (buddies, sound, microphone, profiles) and page two (scans).
  const mainPage = new THREE.Group();
  const scanPage = new THREE.Group();
  scanPage.visible = false;
  board.add(mainPage, scanPage);
  mainPage.add(volumeLabel, volumeDown, volumeUp, voiceButton, micLabel, micDown, micUp, micHint);

  const profileButtons = new THREE.Group();
  mainPage.add(profileButtons);
  const buddyRows = new THREE.Group();
  mainPage.add(buddyRows);
  const scanRows = new THREE.Group();
  scanPage.add(scanRows);
  let page = 'main';
  const pageButton = ui.makeButton('Scans', () => setPage(page === 'main' ? 'scans' : 'main'), { width: 0.2, height: 0.075, textHeight: 0.03 });
  pageButton.position.set(W / 2 - 0.16, H / 2 - 0.085, 0.006);
  board.add(pageButton);
  const status = ui.makeLabel('', { width: W - 0.12, height: 0.06, size: 0.026 });
  status.position.set(0, -H / 2 + 0.055, 0.006);
  board.add(status);

  let active = false, epoch = 0, placed = false;
  let buddies = [];             // [{ key, name, companionId, giftId }]
  let unlisten = null;
  let editing = null;           // the buddy being renamed or let go, or null for the list
  let confirmGo = false;        // "Let go" asks once more before it happens
  let nameStart = 0;            // which six of NAMES are showing
  let scans = [];               // [{ key: 'bubby' | 'g<gift id>', name, giftId, companionId, rec }]
  let buddyPage = 0;
  let confirmDelete = null;     // the scan whose Delete was tapped once

  // ---------- helpers ----------
  const settings = () => (ctx.profile && ctx.profile.current ? ctx.profile.current.settings : {});
  const save = (patch) => (ctx.profile ? ctx.profile.save(patch) : Promise.resolve());
  function say(text) { status.setText(text || ''); }

  // ---------- previews: a small turning copy of each model, so a row shows what it is ----------
  const previewTemplates = new Map();       // key -> Promise<Object3D | null>
  const spinning = [];
  function templateFor(rec) {
    const key = rec.toy ? 'toy:' + rec.toy : rec.model_url ? 'url:' + rec.model_url : rec.option_id ? 'creature:' + rec.option_id : null;
    if (!key) return Promise.resolve(null);
    if (!previewTemplates.has(key)) {
      const p = (async () => {
        if (rec.toy === 'bubby') return buildBubby(1);
        if (rec.model_url) return loadModelUrl(rec.model_url, 1);
        return loadCreature(rec.option_id);
      })().catch(() => null);
      previewTemplates.set(key, p);
    }
    return previewTemplates.get(key);
  }
  /** Puts a preview of `rec`'s model at (x, y) in `group` once it has loaded. */
  function addPreview(group, rec, x, y) {
    if (!rec) return;
    const slot = new THREE.Group();
    slot.position.set(x, y, 0.05);
    group.add(slot);
    templateFor(rec).then((template) => {
      if (!template || !slot.parent) return;
      const copy = template.clone(true);
      const box = new THREE.Box3().setFromObject(copy), size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
      const k = PREVIEW / (Math.max(size.x, size.y, size.z) || 1);
      copy.scale.multiplyScalar(k);
      copy.position.sub(mid.multiplyScalar(k));
      const turn = new THREE.Group();
      turn.add(copy);
      slot.add(turn);
      spinning.push(turn);
    });
  }

  function clearGroup(g) {
    while (g.children.length) {
      const c = g.children.pop();
      if (typeof ui.forget === 'function') ui.forget(c);
      if (ctx.input && ctx.input.removeTarget) ctx.input.removeTarget(c);   // buttons are pointer targets
      c.removeFromParent();
    }
    for (let i = spinning.length - 1; i >= 0; i--) {
      let o = spinning[i];
      while (o && o !== board) o = o.parent;
      if (!o) spinning.splice(i, 1);
    }
  }

  /** Who follows: the saved list, or (none saved yet) the newest three buddies. */
  function following() {
    const list = settings().following;
    if (Array.isArray(list)) return list.slice(0, MAX_FOLLOWING);
    // Nothing chosen yet: the three newest saved buddies follow (as /vr/core/companions.js does).
    return buddies.filter((b) => b.companionId).map((b) => b.companionId).sort((a, b) => a - b).slice(-MAX_FOLLOWING);
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
    // Who follows first (so they are always in sight), then the newest saved buddies, then gifts that could be.
    const rank = (b) => (b.companionId && follow.includes(b.companionId) ? 0 : b.companionId ? 1 : 2);
    const ordered = buddies.slice().sort((a, b) => rank(a) - rank(b) || (b.companionId || b.giftId || 0) - (a.companionId || a.giftId || 0));
    const pages = Math.max(1, Math.ceil(ordered.length / MAX_ROWS));
    buddyPage = Math.min(buddyPage, pages - 1);
    ordered.slice(buddyPage * MAX_ROWS, buddyPage * MAX_ROWS + MAX_ROWS).forEach((b, i) => {
      const y = 0.235 - i * 0.092;
      const on = b.companionId && follow.includes(b.companionId);
      addPreview(buddyRows, b.rec, -0.6, y);
      const label = ui.makeLabel(b.name, { width: 0.2, height: 0.07, size: 0.029, align: 'left' });
      label.position.set(-0.44, y, 0.006);
      const toggle = ui.makeButton(on ? 'Follows me' : 'Stays here', () => toggleFollow(b), {
        width: 0.2, height: 0.075, textHeight: 0.025, fill: on ? colors.peach : undefined,
      });
      toggle.position.set(-0.215, y, 0.006);
      const edit = ui.makeButton('Edit', () => openEditor(b), { width: 0.09, height: 0.075, textHeight: 0.024 });
      edit.position.set(-0.06, y, 0.006);
      buddyRows.add(label, toggle, edit);
    });
    if (pages > 1) {
      const y = 0.235 - MAX_ROWS * 0.092 - 0.01;
      const prev = ui.makeButton('Prev', () => { buddyPage = (buddyPage + pages - 1) % pages; drawBuddies(); }, { width: 0.14, height: 0.07, textHeight: 0.026 });
      prev.position.set(-0.5, y, 0.006);
      const where = ui.makeLabel(`${buddyPage + 1} of ${pages}`, { width: 0.16, height: 0.05, size: 0.026 });
      where.position.set(-0.33, y, 0.006);
      const next = ui.makeButton('Next', () => { buddyPage = (buddyPage + 1) % pages; drawBuddies(); }, { width: 0.14, height: 0.07, textHeight: 0.026 });
      next.position.set(-0.16, y, 0.006);
      buddyRows.add(prev, where, next);
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

  // ---------- page two: scans ----------
  const keyList = (name) => (Array.isArray(settings()[name]) ? settings()[name] : []);
  const MAX_SCAN_ROWS = 6;

  function drawScans() {
    clearGroup(scanRows);
    const hidden = keyList('hiddenScans'), fruit = keyList('sliceToys');
    scans.slice(0, MAX_SCAN_ROWS).forEach((sc, i) => {
      const y = 0.235 - i * 0.1;
      const isHidden = hidden.includes(sc.key), isFruit = fruit.includes(sc.key);
      addPreview(scanRows, sc.rec, -0.6, y);
      const label = ui.makeLabel(sc.name, { width: 0.3, height: 0.07, size: 0.03, align: 'left' });
      label.position.set(-0.39, y, 0.006);
      const shown = ui.makeButton(isHidden ? 'Hidden' : 'Shown', () => toggleKey('hiddenScans', sc), {
        width: 0.22, height: 0.075, textHeight: 0.027, fill: isHidden ? undefined : colors.peach,
      });
      shown.position.set(-0.08, y, 0.006);
      const asFruit = ui.makeButton(isFruit ? 'Fruit: yes' : 'Fruit: no', () => toggleKey('sliceToys', sc), {
        width: 0.24, height: 0.075, textHeight: 0.027, fill: isFruit ? colors.peach : undefined,
      });
      asFruit.position.set(0.18, y, 0.006);
      scanRows.add(label, shown, asFruit);
      if (sc.giftId) {
        const sure = confirmDelete === sc.key;
        const del = ui.makeButton(sure ? 'Sure?' : 'Delete', () => deleteScan(sc), { width: 0.18, height: 0.075, textHeight: 0.027, fill: sure ? colors.peach : undefined });
        del.position.set(0.43, y, 0.006);
        scanRows.add(del);
      }
    });
    if (scans.length > MAX_SCAN_ROWS) {
      const more = ui.makeLabel(`and ${scans.length - MAX_SCAN_ROWS} more (the newest are shown)`, { width: 0.8, height: 0.05, size: 0.024 });
      more.position.set(-0.05, 0.235 - MAX_SCAN_ROWS * 0.1, 0.006);
      scanRows.add(more);
    }
  }

  function setPage(next) {
    page = next;
    mainPage.visible = page === 'main';
    scanPage.visible = page === 'scans';
    pageButton.setLabel(page === 'main' ? 'Scans' : 'Back');
    confirmDelete = null;
    if (page === 'scans') {
      panel.setText('Scans', 0);
      panel.setText('Hidden ones stay out of the games. Frost Slice throws the ones marked fruit.', 1);
      for (const i of [2, 3, 4]) panel.setText('', i);
      drawScans();
    } else {
      panel.setText('Buddies', 0); panel.setText('Sound', 2); panel.setText('Calm microphone', 3); panel.setText('Who is playing?', 4);
      drawAll();
    }
    say('');
  }

  async function toggleKey(name, sc) {
    const list = keyList(name);
    const on = !list.includes(sc.key);
    const patch = { [name]: on ? [...list, sc.key] : list.filter((k) => k !== sc.key) };
    // A hidden scan stops following too.
    if (name === 'hiddenScans' && on && sc.companionId && following().includes(sc.companionId)) patch.following = following().filter((id) => id !== sc.companionId);
    await save(patch);
    say(name === 'hiddenScans' ? `${sc.name} is ${on ? 'hidden from the games' : 'back in the games'}.` : `${sc.name} ${on ? 'will be thrown in Frost Slice' : 'stays out of Frost Slice'}.`);
    drawScans();
  }

  async function deleteScan(sc) {
    if (confirmDelete !== sc.key) { confirmDelete = sc.key; say(`Tap Sure? to delete ${sc.name}.`); drawScans(); return; }
    confirmDelete = null;
    try {
      await ctx.api.forgetScan(sc.giftId);
    } catch (err) {
      say((err && err.message) || 'That scan could not be deleted just now.');
      return;
    }
    const patch = {
      hiddenScans: keyList('hiddenScans').filter((k) => k !== sc.key),
      sliceToys: keyList('sliceToys').filter((k) => k !== sc.key),
    };
    if (sc.companionId) patch.following = following().filter((id) => id !== sc.companionId);
    scans = scans.filter((x) => x !== sc);
    buddies = buddies.filter((b) => b.giftId !== sc.giftId);
    await save(patch);
    say(`${sc.name} was deleted.`);
    drawScans();
  }

  function drawAll() { drawSound(); drawProfiles(); if (page === 'scans') drawScans(); else drawBuddies(); }

  // ---------- loading ----------
  async function loadBuddies() {
    const mine = epoch;
    try {
      const data = await ctx.api.getBuddies();
      if (mine !== epoch) return;
      const saved = (data.companions || []).map((c) => ({ key: 'c' + c.id, name: c.name, companionId: c.id, giftId: c.gift_id, rec: c }));
      const gifts = (data.gifts || []).map((g) => ({ key: 'g' + g.id, name: g.name, companionId: null, giftId: g.id, rec: g }));
      buddies = [...saved, ...gifts];
      // Scans: Bubby, then every scanned or generated model, newest first.
      const models = [
        ...(data.companions || []).filter((c) => c.model_url && c.gift_id).map((c) => ({ key: 'g' + c.gift_id, name: c.name, giftId: c.gift_id, companionId: c.id, rec: c })),
        ...(data.gifts || []).filter((g) => g.model_url).map((g) => ({ key: 'g' + g.id, name: g.name, giftId: g.id, companionId: null, rec: g })),
      ].sort((a, b) => b.giftId - a.giftId);
      scans = [{ key: 'bubby', name: 'Bubby', giftId: null, companionId: null, rec: { toy: 'bubby' } }, ...models];
    } catch (err) {
      if (mine !== epoch) return;
      buddies = [];
      say('Buddies could not be loaded just now.');
    }
    if (page === 'scans') drawScans(); else drawBuddies();
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
    // At the limit, the buddy that has followed longest stays here instead (no need to turn one off first).
    let swapped = null;
    let next = [...follow, id];
    if (next.length > MAX_FOLLOWING) {
      const out = next.shift();
      swapped = buddies.find((x) => x.companionId === out);
    }
    await save({ following: next });
    say(swapped ? `${b.name} follows you now. ${swapped.name} stays here.` : `${b.name} follows you now.`);
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
      buddies = []; scans = [];
      editing = null; confirmGo = false;
      if (page !== 'main') setPage('main');
      drawAll();
      loadBuddies();
      if (ctx.profile && ctx.profile.onChange) unlisten = ctx.profile.onChange(() => { if (active) drawAll(); });
      ctx.log('settings_opened', {});
    },
    exit() {
      active = false; epoch++;
      if (unlisten) { unlisten(); unlisten = null; }
    },
    update(dt) {
      if (!placed) { rig.viewerPosition(_head); if (_head.lengthSq() > 1e-6) { place(); placed = true; } }
      for (const t of spinning) t.rotation.y += (dt || 0.016) * 0.9;
    },
    onRecenter() { place(); },
    onSelectStart() {}, onSelectEnd() {}, onSqueezeStart() {}, onSqueezeEnd() {},
  };
}
