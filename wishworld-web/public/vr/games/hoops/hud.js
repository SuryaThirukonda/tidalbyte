// Snow Hoops panels, all from the shell's UI kit (ctx.ui, /vr/core/ui.js) in the theme's colours and fonts:
//   picker      "Pick your ball": one button per choice with the ball turning above it, "Scan something new", Home
//   scoreboard  over the backboard: score, time left, rack, and a dot for each ball of the rack (gold: money)
//   results     the end card: score, baskets, best, Play again and Home
// Panels are redrawn only when what they show changes (a few times a second at most).

import * as THREE from 'three';
import { TEXT, LAYOUT, COLORS, CONTEST } from './rules.js';

const PREVIEW_SIZE = 0.15;
const PREVIEW_TRIANGLES = 80000;     // the picker shows no more turning balls than this many triangles

export function createHud(ctx, { parent, onPick, onScan, onHome, onAgain }) {
  const ui = ctx.ui, theme = ctx.theme && ctx.theme.colors ? ctx.theme.colors : {};
  const peach = theme.peach || [1, 0.72, 0.55];
  const slate = theme.slate || [0.2, 0.25, 0.32];

  // ------------------------------------------------------------------------------------------ picker
  const picker = new THREE.Group();
  picker.name = 'HoopsPicker';
  picker.visible = false;
  parent.add(picker);
  const ribbon = ui.makeRibbon(TEXT.pick, { width: 0.62, height: 0.13, textHeight: 0.08 });
  ribbon.position.set(0, 0.34, 0);
  picker.add(ribbon);
  ui.popIn(ribbon, { bob: 0.006, bobSpeed: 0.9 });
  const scanButton = ui.makeButton(TEXT.scan, () => onScan(), { width: 0.44, height: 0.11, textHeight: 0.04, fill: peach });
  scanButton.position.set(0, -0.17, 0);
  const homeButton = ui.makeButton(TEXT.home, () => onHome(), { width: 0.24, height: 0.09, textHeight: 0.036 });
  homeButton.position.set(0, -0.3, 0);
  const status = ui.makeLabel('', { width: 0.8, height: 0.06, size: 0.03, color: theme.snow || [0.95, 0.97, 0.99] });
  status.position.set(0, -0.4, 0);
  picker.add(scanButton, homeButton, status);
  let choiceButtons = [], previews = [];

  function clearChoices() {
    for (const b of choiceButtons) { picker.remove(b); if (b.dispose) b.dispose(); }
    for (const p of previews) picker.remove(p);
    choiceButtons = []; previews = []; previewTris = 0;
  }

  /** choices: [{ key, label }]. */
  function setChoices(choices) {
    clearChoices();
    const n = choices.length, gap = 0.27, x0 = -(n - 1) * gap / 2;
    choices.forEach((choice, i) => {
      const b = ui.makeButton(choice.label, () => onPick(choice), { width: 0.25, height: 0.1, textHeight: 0.034 });
      b.position.set(x0 + i * gap, 0.02, 0);
      b.userData.choiceKey = choice.key;
      picker.add(b);
      choiceButtons.push(b);
    });
  }
  let previewTris = 0;
  /** Show the ball for choice `key` turning above its button. */
  function setPreview(key, ball) {
    const b = choiceButtons.find((x) => x.userData.choiceKey === key);
    if (!b || previews.some((p) => p.userData.choiceKey === key)) return false;
    if (previewTris + ball.userData.triangles > PREVIEW_TRIANGLES) return false;
    previewTris += ball.userData.triangles;
    const p = ball.clone(true);
    p.scale.setScalar(PREVIEW_SIZE / ball.userData.size);
    p.position.set(b.position.x, 0.17, 0.02);
    p.userData.choiceKey = key;
    picker.add(p);
    previews.push(p);
    return true;
  }

  // ------------------------------------------------------------------------------------------ scoreboard
  const S = LAYOUT.scoreboard;
  let dots = new Array(CONTEST.perRack).fill(0);         // 0 waiting, 1 in hand, 2 in the air, 3 made, 4 missed
  const rgbCss = (c) => `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;
  const board = ui.makePanel({
    name: 'HoopsScoreboard', width: S.size[0], height: S.size[1], style: 'frame', radius: 0.05, border: 0.01,
    labels: [
      { text: TEXT.score(0), size: 0.11, font: 'title', x: -0.3, y: 0.09, w: 0.62, h: 0.16, align: 'left' },
      { text: '60s', size: 0.11, font: 'title', x: 0.34, y: 0.09, w: 0.5, h: 0.16, align: 'right', color: slate },
      { text: TEXT.rack(0, CONTEST.racks), size: 0.065, font: 'heading', x: -0.3, y: -0.12, w: 0.62, h: 0.1, align: 'left' },
    ],
    paint(g) {
      // the rack's balls as dots, right of the rack number; the last is the money ball
      const r = 0.032, gap = 0.085, x0 = 0.6 - (dots.length - 1) * gap - r - 0.02, y = -0.12;
      dots.forEach((d, i) => {
        const money = i === dots.length - 1;
        g.beginPath(); g.arc(x0 + i * gap, y, r, 0, Math.PI * 2);
        g.fillStyle = d === 0 || d === 1 ? rgbCss(money ? COLORS.gold : COLORS.ice) : d === 3 ? rgbCss(COLORS.made) : d === 2 ? 'rgba(255,255,255,0.7)' : rgbCss(COLORS.missed);
        g.fill();
        g.lineWidth = 0.008; g.strokeStyle = rgbCss(money ? [0.75, 0.52, 0.08] : slate); g.stroke();
      });
    },
  });
  board.visible = false;
  parent.add(board);
  ui.popIn(board);
  let shown = { score: '', time: '', rack: '', dots: '' };

  function setBoard(score, timeLeft, rack, rackDots) {
    const s = TEXT.score(score), t = TEXT.time(timeLeft), r = TEXT.rack(rack, CONTEST.racks), d = rackDots.join('');
    if (s === shown.score && t === shown.time && r === shown.rack && d === shown.dots) return false;
    const kick = shown.score && s !== shown.score;
    dots = rackDots.slice();
    board.labels[0].text = s; board.labels[1].text = t; board.labels[2].text = r;
    board.labels[1].color = timeLeft <= 10 ? [0.85, 0.25, 0.2] : slate;
    board.redraw();
    shown = { score: s, time: t, rack: r, dots: d };
    if (kick) ui.kick(board, 0.12);
    return true;
  }

  // ------------------------------------------------------------------------------------------ results
  const results = new THREE.Group();
  results.name = 'HoopsResults';
  results.visible = false;
  parent.add(results);
  const card = ui.makePanel({
    name: 'HoopsResultsCard', width: 0.74, height: 0.42, style: 'frame', radius: 0.05,
    labels: [
      { text: TEXT.timeUp, size: 0.075, font: 'title', y: 0.12, h: 0.1 },
      { text: '', size: 0.04, font: 'body', y: -0.06, h: 0.22 },
    ],
  });
  results.add(card);
  const again = ui.makeButton(TEXT.again, () => onAgain(), { width: 0.3, height: 0.11, textHeight: 0.042, fill: peach });
  again.position.set(-0.17, -0.29, 0.01);
  const home2 = ui.makeButton(TEXT.home, () => onHome(), { width: 0.3, height: 0.11, textHeight: 0.042 });
  home2.position.set(0.17, -0.3, 0.01);
  results.add(again, home2);
  ui.popIn(results);

  const _head = new THREE.Vector3(), _fwd = new THREE.Vector3();
  /** Put a panel group in front of the viewer, facing them. */
  function inFront(object, distance, y) {
    ctx.viewerPosition(_head);
    if (ctx.rig && ctx.rig.viewerForwardFlat) ctx.rig.viewerForwardFlat(_fwd); else { ctx.viewerForward(_fwd); _fwd.y = 0; }
    if (_fwd.lengthSq() < 1e-4) _fwd.set(0, 0, -1);
    _fwd.normalize();
    object.position.set(_head.x + _fwd.x * distance, y, _head.z + _fwd.z * distance);
    object.rotation.set(0, Math.atan2(-_fwd.x, -_fwd.z), 0);
  }

  return {
    picker, board, results,
    get buttons() { return { scan: scanButton, home: homeButton, again, home2, choices: choiceButtons.slice() }; },
    setChoices, setPreview,
    setStatus(text) { status.setText(text || ''); },
    setScanLabel(text) { scanButton.setLabel(text); },
    showPicker() {
      results.visible = false;
      inFront(picker, LAYOUT.picker.distance, LAYOUT.picker.y);
      picker.visible = true;
    },
    hidePicker() { picker.visible = false; },
    setPickerVisible(on) { picker.visible = on; },
    /** The scoreboard over the backboard, turned to face the spot the player is at. */
    showBoard(position, faceFrom) {
      board.position.copy(position);
      board.rotation.set(0, Math.atan2(faceFrom.x - position.x, faceFrom.z - position.z), 0);
      board.visible = true;
    },
    faceBoard(faceFrom) { board.rotation.set(0, Math.atan2(faceFrom.x - board.position.x, faceFrom.z - board.position.z), 0); },
    hideBoard() { board.visible = false; },
    setBoard,
    showResults(title, body) {
      card.setText(title, 0); card.setText(body, 1);
      inFront(results, LAYOUT.results.distance, LAYOUT.results.y);
      results.visible = true;
    },
    hideResults() { results.visible = false; },
    get pickerVisible() { return picker.visible; },
    get resultsVisible() { return results.visible; },
    get boardVisible() { return board.visible; },
    update(dt) { for (const p of previews) p.rotation.y += dt * 0.9; },
    hideAll() { picker.visible = false; board.visible = false; results.visible = false; },
  };
}
