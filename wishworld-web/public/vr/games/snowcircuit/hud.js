// Snow Circuit: what is written in front of the driver. Everything rides with the car, as in Unity
// (SnowCircuitGame.BuildUi and the Dash built by Builder.Games.cs), so positions are Unity's car-local
// numbers with z negated (the seat's frame: -Z forward).
//
//   menu       the 1.0 x 0.56 snowy panel above the nose: title, two lines, [Start | Race again] and [Hub]
//   big text   "3", "2", "1", "Go!" on a plate, 2.6 m ahead, each landing with a thump (PopIn.Kick)
//   dashboard  three white read-outs on the hood above the wheel: "L1/3  P4/5", "42 km/h", "0:12.3"
//
// With the shell's UI kit (ctx.ui.makePanel) the panels are the game's own styles. With only the two calls
// the contract promises (the dev harness) the same things are shown with makeTextPanel and makeButton.

import * as THREE from 'three';
import { Phase, STRINGS, formatTime } from './sim.js';
import { DEG2RAD } from './track.js';

const PANEL = [0.93, 0.95, 0.97], PEACH = [1.00, 0.72, 0.55];
const PLAIN_FONT = 'WWRace Plain';
const PLAIN_STACK = `"${PLAIN_FONT}", "Liberation Sans", Arial, Helvetica, sans-serif`;

/** Scripts/Core/PopIn.cs: grow from 0.55 with a little overshoot when shown; Kick() bumps the size briefly. */
class Pop {
  constructor(object) { this.o = object; this.t = 0; this.state = 0; this.kick = 0; this.kickSize = 0; }
  open() { this.o.visible = true; this.t = 0; this.state = 1; this.o.scale.setScalar(0.55); }
  hide() { this.o.visible = false; this.state = 0; this.kick = 0; this.o.scale.setScalar(1); }
  kickIt(size = 0.3) { this.kick = 1; this.kickSize = size; }
  update(dt) {
    if (!this.o.visible) return;
    let s = 1;
    if (this.state === 1) {
      this.t += dt;
      const x = Math.min(1, Math.max(0, this.t / 0.34));
      const c1 = 1.70158, c3 = c1 + 1, y = x - 1;
      s = 0.55 + (1 - 0.55) * (1 + c3 * y * y * y + c1 * y * y);
      if (x >= 1) this.state = 0;
    }
    if (this.kick > 0) { this.kick = Math.max(0, this.kick - dt * 4.5); s *= 1 + this.kickSize * this.kick * this.kick; }
    this.o.scale.setScalar(s);
  }
}

// Mathf.RoundToInt rounds halves to the even number.
function roundToInt(v) {
  const f = Math.floor(v), d = v - f;
  if (d < 0.5) return f;
  if (d > 0.5) return f + 1;
  return f % 2 === 0 ? f : f + 1;
}

let plainFont = null;
function loadPlainFont() {
  if (plainFont) return plainFont;
  plainFont = Promise.resolve(false);
  try {
    if (typeof FontFace === 'function' && document.fonts) {
      plainFont = new FontFace(PLAIN_FONT, 'url(/fonts/LiberationSans.ttf)').load()
        .then((face) => { document.fonts.add(face); return true; }, () => false);
    }
  } catch { /* the fallback fonts are metric twins of this one */ }
  return plainFont;
}

/**
 * ctx: the shell's (or the harness's) ctx. seat: the car's frame. handlers: { start(), hub() }.
 */
export function createHud(ctx, seat, handlers) {
  const ui = ctx.ui || {};
  const kit = typeof ui.makePanel === 'function';
  const colors = ui.colors || {};
  const panelFill = colors.panel || PANEL, peach = colors.peach || PEACH;
  const disposables = [];

  // ---- menu: rides with the car, above the nose --------------------------------------------------------------
  const menu = new THREE.Group(); menu.name = 'Menu';
  menu.position.set(0, 1.3, -1.7);
  menu.visible = false;
  seat.add(menu);
  const menuPop = new Pop(menu);
  let panel = null, startButton = null, againButton = null, hubButton = null;
  const BW = 0.36, BH = 0.13;

  const button = (label, onClick, extra) => {
    const b = ui.makeButton(label, onClick, { width: BW, height: BH, ...(kit ? { textHeight: 0.05, ...extra } : {}) });
    disposables.push(b);
    return b;
  };

  if (kit) {
    panel = ui.makePanel({
      name: 'MenuPanel', width: 1.0, height: 0.56, fill: panelFill, radius: 0.05, border: 0.008,
      labels: [
        { text: '', size: 0.085, font: 'title', w: 0.78, h: 0.16, y: 0.185, autoSize: false },
        { text: '', size: 0.05, font: 'body', w: 0.92, h: 0.2, y: 0.03, autoSize: false },
      ],
    });
  } else if (typeof ui.makeTextPanel === 'function') {
    panel = ui.makeTextPanel(' ', { width: 1.0, fontSize: 0.05 });
  }
  if (panel) { menu.add(panel); disposables.push(panel); }
  if (typeof ui.makeButton === 'function') {
    startButton = button(STRINGS.start, () => handlers.start(), { fill: peach });
    againButton = button(STRINGS.again, () => handlers.start(), { fill: peach });
    hubButton = button(STRINGS.hub, () => handlers.hub());
    startButton.position.set(-0.21, -0.17, 0.006);
    againButton.position.set(-0.21, -0.17, 0.006);
    hubButton.position.set(0.21, -0.17, 0.006);
    againButton.visible = false;
    menu.add(startButton, againButton, hubButton);
  }

  function showMenu(title, info, buttonLabel) {
    if (panel) {
      if (kit) {
        panel.labels[0].text = title; panel.labels[0].size = fitSize(title, 'title', 0.085, 0.78, 0.12);
        panel.labels[1].text = info; panel.labels[1].size = fitSize(info, 'body', 0.05, 0.92, 0.18);
        panel.redraw();
      }
      else {
        panel.setText(title + '\n' + info);
        // the harness panel grows with its words: keep the buttons under it
        const y = -(panel.scale.y / 2 + BH / 2 + 0.03);
        for (const b of [startButton, againButton, hubButton]) if (b) b.position.y = y;
      }
    }
    const again = buttonLabel === STRINGS.again;
    if (startButton) startButton.visible = !again;
    if (againButton) againButton.visible = again;
    menuPop.open();
  }
  function hideMenu() { menuPop.hide(); }

  // ---- the countdown ---------------------------------------------------------------------------------------------
  const big = new THREE.Group(); big.name = 'BigText';
  big.position.set(0, 1.45, -2.6);
  big.visible = false;
  seat.add(big);
  const bigPop = new Pop(big);
  const plates = new Map();          // text -> panel (kit), one per countdown word so nothing is redrawn while racing
  let bigPanel = null;               // harness: one panel whose words change

  // ---- TextMesh Pro's measures, taken from the same font files with a canvas ---------------------------------
  const measure = document.createElement('canvas').getContext('2d');
  const MPX = 200;
  const fontScale = (role) => (ui.fonts && ui.fonts[role] && ui.fonts[role].scale) || (role === 'title' ? 1.22 : role === 'body' ? 1.08 : 1);
  function setMeasureFont(role) {
    measure.font = ctx.theme && typeof ctx.theme.fontCss === 'function' ? ctx.theme.fontCss(role, MPX) : `${role === 'title' ? '700 ' : ''}${MPX}px Georgia, serif`;
  }
  /** Width of a line and height of the face's line (ascender to descender), in metres, at a letter size `em`. */
  function lineSize(text, role, em) {
    setMeasureFont(role);
    const m = measure.measureText(text);
    const asc = m.fontBoundingBoxAscent || MPX * 1.0, desc = m.fontBoundingBoxDescent || MPX * 0.3;
    return [m.width / MPX * em, (asc + desc) / MPX * em];
  }
  /**
   * WWUI.Label with auto-sizing: TextMesh Pro shrinks the letters (down to half) until the wrapped text fits
   * its box in width and in height, where a line is as tall as the face (ascender to descender), not as its
   * capitals. That is why the menu title, 0.085 in a box 0.12 high, is drawn smaller than its stated size.
   */
  function fitSize(text, role, size, boxW, boxH) {
    setMeasureFont(role);
    const m = measure.measureText('Hg');
    const lineEm = ((m.fontBoundingBoxAscent || MPX) + (m.fontBoundingBoxDescent || MPX * 0.3)) / MPX;
    const full = size * fontScale(role);
    for (let k = 1; k > 0.5; k -= 0.01) {
      const em = full * k, limit = boxW / em * MPX;
      let lines = 0, fits = true;
      for (const para of String(text).split('\n')) {
        let cur = '';
        for (const word of para.split(/\s+/).filter(Boolean)) {
          const next = cur ? cur + ' ' + word : word;
          if (cur && measure.measureText(next).width > limit) { lines++; cur = word; } else cur = next;
          if (measure.measureText(cur).width > limit) fits = false;
        }
        lines++;
      }
      if (fits && lines * lineEm * em <= boxH + 1e-6) return size * k;
    }
    return size * 0.5;
  }

  if (kit) {
    const em = 0.26 * 1.22;          // WWUI.Label draws the title face 1.22 x its stated height
    for (const text of STRINGS.countdown) {
      // TextBackdrop: the plate is the text's bounds (advance width, face height) plus padding, to whole centimetres
      const [tw, th] = lineSize(text, 'title', em);
      const w = Math.ceil((tw + 0.09 * 2) * 100) / 100, h = Math.ceil((th + 0.09 * 1.3) * 100) / 100;
      const p = ui.makePanel({
        name: 'Count ' + text, width: w, height: h, style: 'plate', fill: panelFill,
        labels: [{ text, size: 0.26, font: 'title', w: w + 0.2, h: h + 0.1, autoSize: false, wrap: false }],
      });
      p.visible = false;
      big.add(p);
      plates.set(text, p);
      disposables.push(p);
    }
  } else if (typeof ui.makeTextPanel === 'function') {
    bigPanel = ui.makeTextPanel(' ', { width: 0.7, fontSize: 0.22 });
    big.add(bigPanel);
    disposables.push(bigPanel);
  }

  function showBig(text, kick) {
    if (kit) for (const [t, p] of plates) p.visible = t === text;
    else if (bigPanel) bigPanel.setText(text);
    if (!big.visible) bigPop.open();
    bigPop.kickIt(kick);
  }
  function hideBig() { bigPop.hide(); }

  // ---- the dashboard: laid on the tilted dash face -----------------------------------------------------------------
  const PPM = 1600, DW = 0.54, DH = 0.09;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(DW * PPM); canvas.height = Math.round(DH * PPM);
  const g = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false; texture.minFilter = THREE.LinearFilter; texture.magFilter = THREE.LinearFilter;
  const dashMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, fog: false, toneMapped: false });
  const dashGeometry = new THREE.PlaneGeometry(DW, DH);
  const dashMesh = new THREE.Mesh(dashGeometry, dashMaterial);
  dashMesh.name = 'DashReadouts';
  dashMesh.position.z = 0.004;                 // the text sits 4 mm proud of its holder
  dashMesh.renderOrder = 3;
  const dash = new THREE.Group(); dash.name = 'Dash';
  dash.position.set(0, 0.893, -0.766);
  dash.rotation.x = -15 * DEG2RAD;
  dash.add(dashMesh);
  seat.add(dash);

  // lap at x = -0.18, speed in the middle, time at x = +0.18; each in a 0.17 x 0.09 box, auto-sized down to half
  const READOUTS = [{ x: -0.18, size: 0.028, text: 'Lap -' }, { x: 0, size: 0.034, text: '0 km/h' }, { x: 0.18, size: 0.028, text: '0:00.0' }];
  let dashDirty = true;
  function drawDash() {
    dashDirty = false;
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = 'rgb(250,250,250)';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i < READOUTS.length; i++) {
      const r = READOUTS[i];
      let px = r.size * PPM;
      g.font = `${px.toFixed(1)}px ${PLAIN_STACK}`;
      const w = g.measureText(r.text).width, box = 0.17 * PPM;
      if (w > box) { px = Math.max(px * 0.5, px * box / w); g.font = `${px.toFixed(1)}px ${PLAIN_STACK}`; }
      g.fillText(r.text, (DW / 2 + r.x) * PPM, canvas.height / 2 + px * 0.04);
    }
    texture.needsUpdate = true;
  }
  loadPlainFont().then((ok) => { if (ok) dashDirty = true; });

  let shownKmh = -1, shownLap = -2, shownTenths = -1;
  /** SnowCircuitGame.UpdateDash. Redraws only when a number changes. */
  function updateDash(sim) {
    const kmh = roundToInt(sim.speed * 3.6);
    if (kmh !== shownKmh) { shownKmh = kmh; READOUTS[1].text = kmh + ' km/h'; dashDirty = true; }
    const lap = Math.min(sim.lap, sim.laps);
    const lapCode = sim.state === Phase.Ready ? -1 : lap * 100 + sim.place * 10 + sim.racers;
    if (lapCode !== shownLap) {
      shownLap = lapCode;
      READOUTS[0].text = sim.state === Phase.Ready ? 'Lap -'
        : sim.rivals ? 'L' + lap + '/' + sim.laps + '  P' + sim.place + '/' + sim.racers
          : 'Lap ' + lap + '/' + sim.laps;
      dashDirty = true;
    }
    const seconds = sim.state === Phase.Racing ? sim.raceTime - sim.lapStart : sim.lastLapTime;
    const tenths = Math.round(seconds * 10);
    if (tenths !== shownTenths) { shownTenths = tenths; READOUTS[2].text = formatTime(seconds); dashDirty = true; }
    if (dashDirty) drawDash();
  }
  drawDash();

  return {
    menu, big, dash,
    showMenu, hideMenu, showBig, hideBig, updateDash,
    get menuVisible() { return menu.visible; },
    get dashText() { return READOUTS.map((r) => r.text); },
    update(dt) { menuPop.update(dt); bigPop.update(dt); },
    dispose() {
      for (const d of disposables) {
        try { if (typeof d.dispose === 'function') d.dispose(); else if (d.parent) d.parent.remove(d); } catch { /* already gone */ }
      }
      texture.dispose(); dashMaterial.dispose(); dashGeometry.dispose();
      seat.remove(menu, big, dash);
    },
  };
}
