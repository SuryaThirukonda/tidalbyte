// Frost Slice panels: the menu card, the score panel, the score pop-ups and (when the shell has no guide)
// the caption bubble. All in the Unity card style (FrostSliceGame.BuildUi, WWUI, PopIn, TextBackdrop).
//
// Three ways to draw them, best first:
//   1. the shell's UI kit (ctx.ui.makePanel ...): the real headset shell;
//   2. our own instance of the same kit (/vr/core/ui.js), with a small pointer of our own, when the shell
//      gives only the contract's two calls (the dev harness);
//   3. the contract's ctx.ui.makeTextPanel / makeButton alone, if that kit cannot be loaded.
// The pop-ups are drawn here in every case: they are pooled, and fade in a way the kit's panels do not.
//
// Everything under `stageRoot` is in the stage frame (rules.js): panels face -Z there, toward the player.

import * as THREE from 'three';
import { RULES, LAYOUT, COLORS, TEXT } from './rules.js';

const css = (c, a = 1) => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const WHITE = [1, 1, 1];

function isLive(object, top) {
  for (let o = object; o; o = o.parent) {
    if (!o.visible) return false;
    if (o === top || o.isScene) return true;
  }
  return false;
}

// ------------------------------------------------------------------------------------------ a small pointer
// Stands in for the shell's input when we run our own copy of the UI kit: rectangles that a ray can hover
// and click (the kit registers its buttons here through addTarget).

function createPointer(top) {
  const targets = [];
  const hover = { left: null, right: null };
  const _inv = new THREE.Matrix4(), _lo = new THREE.Vector3();

  function pick(origin, dir) {
    let best = null, bestT = 10;
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      if (!isLive(t.object, top)) continue;
      t.object.updateWorldMatrix(true, false);
      _inv.copy(t.object.matrixWorld).invert();
      _lo.copy(origin).applyMatrix4(_inv);
      const e = _inv.elements;
      const sx = dir.x * e[0] + dir.y * e[4] + dir.z * e[8];
      const sy = dir.x * e[1] + dir.y * e[5] + dir.z * e[9];
      const sz = dir.x * e[2] + dir.y * e[6] + dir.z * e[10];
      if (Math.abs(sz) < 1e-6) continue;
      const dist = -_lo.z / sz;
      if (dist <= 0 || dist >= bestT) continue;
      if (Math.abs(_lo.x + sx * dist) > t.width / 2 || Math.abs(_lo.y + sy * dist) > t.height / 2) continue;
      bestT = dist; best = t;
    }
    return best;
  }

  function setHover(hand, t) {
    const old = hover[hand];
    if (old === t) return;
    hover[hand] = t;
    if (old && --old.hovers === 0 && old.onHover) old.onHover(false, hand, old.object);
    if (t && ++t.hovers === 1 && t.onHover) t.onHover(true, hand, t.object);
  }

  return {
    addTarget(object, spec = {}) {
      targets.push({ object, width: spec.width || 0, height: spec.height || 0, onClick: spec.onClick || null, onHover: spec.onHover || null, hovers: 0 });
    },
    removeTarget(object) {
      const i = targets.findIndex((t) => t.object === object);
      if (i < 0) return;
      for (const hand of ['left', 'right']) if (hover[hand] === targets[i]) setHover(hand, null);
      targets.splice(i, 1);
    },
    /** Each frame, for each hand that has a ray (origin and direction in world space), or null for none. */
    point(hand, origin, dir) { setHover(hand, origin ? pick(origin, dir) : null); },
    /** The trigger: clicks what that hand is on. True when something took the click. */
    press(hand) {
      const t = hover[hand];
      if (!t || !t.onClick) return false;
      t.onClick(hand, t.object);
      return true;
    },
    clear() { setHover('left', null); setHover('right', null); },
  };
}

// ------------------------------------------------------------------------------------------ pop-ups

const POPUP_PPM = 1000;          // canvas pixels per metre
const POPUP_POOL = 8;

function roundRect(g, x, y, w, h, r) {
  r = Math.max(0.5, Math.min(r, w / 2, h / 2));
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.arcTo(x + w, y, x + w, y + r, r);
  g.lineTo(x + w, y + h - r); g.arcTo(x + w, y + h, x + w - r, y + h, r);
  g.lineTo(x + r, y + h); g.arcTo(x, y + h, x, y + h - r, r);
  g.lineTo(x, y + r); g.arcTo(x, y, x + r, y, r);
  g.closePath();
}

function createPopups(parent, fontFor) {
  const P = RULES.popup;
  const unit = new THREE.PlaneGeometry(1, 1);
  const texts = new Map();           // text|colour -> { texture, w, h, plate }
  const plates = new Map();          // "w|h" -> { material, w, h, ox, oy }
  const measure = document.createElement('canvas').getContext('2d');
  const options = { transparent: true, depthWrite: false, fog: false, toneMapped: false };

  function texture(canvas) {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  }

  // WWUI.PlateMesh: a snowy pill with a drop shadow, a slate line, a white band, a thin ice line and a shaded face.
  function plateFor(w, h) {
    const key = w.toFixed(2) + '|' + h.toFixed(2);
    let p = plates.get(key);
    if (p) return p;
    const ppm = POPUP_PPM, b = Math.min(0.012, Math.max(0.004, h * 0.05)), r = Math.min(h * 0.42, 0.09);
    const padL = 0.004, padR = 0.016, padT = 0.004, padB = 0.02;
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil((w + padL + padR) * ppm); canvas.height = Math.ceil((h + padT + padB) * ppm);
    const g = canvas.getContext('2d');
    const x0 = padL * ppm, y0 = padT * ppm, W = w * ppm, H = h * ppm, B = b * ppm, R = r * ppm;
    const fill = COLORS.panel;
    g.fillStyle = css(COLORS.shade); roundRect(g, x0 + B, y0 + B * 1.3, W, H, R); g.fill();
    g.fillStyle = css(COLORS.slate); roundRect(g, x0, y0, W, H, R); g.fill();
    g.fillStyle = css(COLORS.snowWhite); roundRect(g, x0 + B, y0 + B, W - B * 2, H - B * 2, R - B); g.fill();
    g.fillStyle = css(COLORS.iceLine); roundRect(g, x0 + B * 1.8, y0 + B * 1.8, W - B * 3.6, H - B * 3.6, R - B * 1.8); g.fill();
    const grad = g.createLinearGradient(0, y0 + B * 2.2, 0, y0 + H - B * 2.2);
    grad.addColorStop(0, css(mix(fill, WHITE, 0.55))); grad.addColorStop(1, css(mix(fill, COLORS.frostBlue, 0.65)));
    g.fillStyle = grad; roundRect(g, x0 + B * 2.2, y0 + B * 2.2, W - B * 4.4, H - B * 4.4, R - B * 2.2); g.fill();
    p = {
      material: new THREE.MeshBasicMaterial({ map: texture(canvas), ...options }),
      w: canvas.width / ppm, h: canvas.height / ppm,
      ox: (padR - padL) / 2, oy: (padT - padB) / 2,       // the quad's centre relative to the plate's
    };
    plates.set(key, p);
    return p;
  }

  function textFor(text, rgb) {
    const key = text + '|' + rgb.join(',');
    let t = texts.get(key);
    if (t) return t;
    const ppm = POPUP_PPM, px = P.textHeight * ppm, font = fontFor('heading', px);
    measure.font = font;
    const m = measure.measureText(text);
    const asc = m.actualBoundingBoxAscent || px * 0.75, desc = m.actualBoundingBoxDescent || px * 0.05;
    const tw = Math.max(1, m.width), th = asc + desc, pad = 6;
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(tw + pad * 2); canvas.height = Math.ceil(th + pad * 2);
    const g = canvas.getContext('2d');
    g.font = font; g.textBaseline = 'alphabetic'; g.textAlign = 'center';
    g.fillStyle = css(rgb);
    g.fillText(text, canvas.width / 2, pad + asc);
    // TextBackdrop: the text's bounds plus padding, rounded up to whole centimetres.
    const pw = Math.ceil((tw / ppm + P.padding * 2) * 100) / 100, ph = Math.ceil((th / ppm + P.padding * 1.3) * 100) / 100;
    t = { texture: texture(canvas), w: canvas.width / ppm, h: canvas.height / ppm, plate: plateFor(pw, ph) };
    texts.set(key, t);
    return t;
  }

  const pool = [];
  for (let i = 0; i < POPUP_POOL; i++) {
    const holder = new THREE.Group();
    holder.name = 'Popup';
    holder.visible = false;
    const plate = new THREE.Mesh(unit, null);
    plate.renderOrder = 8;
    const label = new THREE.Mesh(unit, new THREE.MeshBasicMaterial({ ...options }));
    label.renderOrder = 9;
    holder.add(plate, label);
    parent.add(holder);
    pool.push({ holder, plate, label, life: 0, pw: 1, ph: 1, born: 0 });
  }
  let serial = 0, shown = 0;
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _z = new THREE.Vector3(0, 0, 1), _up = new THREE.Vector3(0, 1, 0);

  return {
    /** A new pop-up at a stage-frame point, facing `head` (also in the stage frame). */
    add(x, y, z, text, rgb, head) {
      let p = null;
      for (const c of pool) { if (c.life <= 0) { p = c; break; } if (!p || c.born < p.born) p = c; }   // a free one, else the oldest
      const t = textFor(text, rgb);
      p.label.material.map = t.texture;
      p.label.material.opacity = 1;
      p.label.material.needsUpdate = p.label.material.version === 0;
      p.label.scale.set(t.w, t.h, 1);
      p.plate.material = t.plate.material;
      p.pw = t.plate.w; p.ph = t.plate.h;
      p.plate.position.set(t.plate.ox, t.plate.oy, -0.005);
      p.plate.scale.set(p.pw, p.ph, 1);
      p.plate.visible = true;
      p.holder.position.set(x, y + P.lift, z);
      // Facing the head, then each one at its own tilt.
      _m.lookAt(head, p.holder.position, _up);
      p.holder.quaternion.setFromRotationMatrix(_m).multiply(_q.setFromAxisAngle(_z, (Math.random() * 2 - 1) * P.tilt * Math.PI / 180));
      p.holder.scale.setScalar(0.3);
      p.holder.visible = true;
      p.life = P.life; p.born = ++serial;
      shown++;
    },
    update(dt) {
      for (let i = 0; i < pool.length; i++) {
        const p = pool[i];
        if (p.life <= 0) continue;
        p.life -= dt;
        if (p.life <= 0) { p.holder.visible = false; continue; }
        const age = P.life - p.life;
        // pops up past full size, settles, then drifts up and fades
        const size = age < 0.16 ? 0.3 + (1.25 - 0.3) * Math.min(1, age / 0.16) : 1.25 + (1 - 1.25) * Math.min(1, (age - 0.16) / 0.12);
        p.holder.scale.setScalar(size);
        p.holder.position.y += (age < 0.28 ? 0.08 : 0.3) * dt;
        const alpha = Math.min(1, Math.max(0, p.life / 0.35));
        p.label.material.opacity = alpha;
        const k = 0.5 + 0.5 * alpha;                       // the plate shrinks away as the text fades
        p.plate.visible = alpha > 0.02;
        p.plate.scale.set(p.pw * k, p.ph * k, 1);
      }
    },
    clear() { for (const p of pool) { p.life = 0; p.holder.visible = false; } },
    get shown() { return shown; },
    dispose() {
      for (const p of pool) { p.label.material.dispose(); if (p.holder.parent) p.holder.parent.remove(p.holder); }
      for (const t of texts.values()) t.texture.dispose();
      for (const p of plates.values()) { p.material.map.dispose(); p.material.dispose(); }
      unit.dispose();
    },
  };
}

// ------------------------------------------------------------------------------------------ the panels

/**
 * Build the panels. Resolves to the object the game drives. `root` is the tab's group (world frame, for the
 * caption); `stageRoot` is the stage. onStart / onHub are the two menu buttons.
 */
export async function createHud(ctx, { root, stageRoot, sfx, onStart, onHub, plain = false }) {
  // ---- which kit ----
  let kit = null, ownKit = false, pointer = null, theme = ctx.theme || null;
  const u = ctx.ui || {};
  if (plain) {
    kit = null;                                            // dev: as if no kit could be had
  } else if (typeof u.makePanel === 'function' && typeof u.makeButton === 'function' && typeof u.makeLabel === 'function' && typeof u.popIn === 'function') {
    kit = u;
  } else {
    try {
      const [uiModule, themeModule] = await Promise.all([import('/vr/core/ui.js'), import('/vr/core/theme.js')]);
      await themeModule.loadFonts();
      theme = themeModule;
      pointer = createPointer(root);
      const _at = new THREE.Vector3();
      const sounds = { sfx(name, volume, at) { sfx.play(name, volume, at && at.isObject3D ? at.getWorldPosition(_at) : at || null); } };
      kit = uiModule.createUI({ input: pointer, audio: sounds, renderer: ctx.renderer });
      ownKit = true;
    } catch (err) {
      console.warn('[frostslice] the UI kit is not available; using plain panels.', err && err.message);
      kit = null; pointer = null;
    }
  }
  const fontFor = theme && typeof theme.fontCss === 'function'
    ? (role, px) => theme.fontCss(role, px)
    : (role, px) => `${px.toFixed(1)}px Georgia, "Times New Roman", serif`;

  const M = LAYOUT.menu, H = LAYOUT.hud;

  // ---- menu: a 0.9 x 0.56 frame with a title, two lines and two buttons, 1.35 m ahead at 1.4 m ----
  const menu = new THREE.Group();
  menu.name = 'Menu';
  menu.position.fromArray(M.position);
  menu.rotation.y = Math.PI;                               // panels face +Z; turn to face the player
  menu.visible = false;
  stageRoot.add(menu);

  // ---- score panel: 1.1 x 0.3, above and behind where the fruit comes from, tipped 12 degrees toward the player ----
  const hud = new THREE.Group();
  hud.name = 'Score';
  hud.position.fromArray(H.position);
  hud.rotation.set(H.tiltDegrees * Math.PI / 180, Math.PI, 0, 'YXZ');
  hud.visible = false;
  stageRoot.add(hud);

  let setMenu, setScore, setTime, setLives, kickScore, disposePanels;

  if (kit) {
    const c = kit.colors || COLORS;
    const menuPanel = kit.makePanel({
      name: 'MenuPanel', width: M.size[0], height: M.size[1], style: 'frame', fill: c.panel, radius: 0.05, border: 0.008,
      labels: [
        { text: '', size: 0.085, font: 'title', color: c.slate, w: 0.7, h: 0.12, y: 0.185 },
        { text: '', size: 0.05, font: 'body', color: c.slate, w: 0.82, h: 0.18, y: 0.03 },
      ],
    });
    const startButton = kit.makeButton(TEXT.start, () => onStart(), { width: 0.34, height: 0.13, textHeight: 0.05, fill: c.peach });
    startButton.position.set(-0.2, -0.17, 0.006);
    const hubButton = kit.makeButton(TEXT.hub, () => onHub(), { width: 0.34, height: 0.13, textHeight: 0.05 });
    hubButton.position.set(0.2, -0.17, 0.006);
    menu.add(menuPanel, startButton, hubButton);
    kit.popIn(menu);

    const ppm = 600;                                       // read from 2.5 m away: a small canvas is plenty
    // Loose numbers seen from far off: blend their edges (the kit cuts them out, which thins small text).
    const soften = (label) => {
      const m = label.material;
      m.transparent = true; m.alphaTest = 0; m.alphaToCoverage = false; m.depthWrite = false; m.needsUpdate = true;
      label.renderOrder = 4;
      return label;
    };
    const hudPanel = kit.makePanel({ name: 'ScorePanel', width: H.size[0], height: H.size[1], style: 'frame', fill: c.panel, radius: 0.05, border: 0.008, ppm });
    const score = kit.makeLabel('0', { width: 0.4, height: 0.2, size: 0.1, font: 'plain', color: c.slate, ppm });
    score.position.set(0, 0, 0.004);
    const time = kit.makeLabel('', { width: 0.3, height: 0.2, size: 0.06, font: 'plain', color: c.slate, align: 'left', ppm });
    time.position.set(-0.36, 0, 0.004);
    const lives = kit.makeLabel('', { width: 0.3, height: 0.2, size: 0.06, font: 'plain', color: c.slate, align: 'right', ppm });
    lives.position.set(0.36, 0, 0.004);
    soften(score); soften(time); soften(lives);
    hud.add(hudPanel, score, time, lives);
    kit.popIn(hud);

    setMenu = (title, info, button) => {
      menuPanel.labels[0].text = title; menuPanel.labels[1].text = info;
      menuPanel.redraw();
      startButton.setLabel(button);
    };
    setScore = (text) => score.setText(text);
    setTime = (text) => time.setText(text);
    setLives = (text) => lives.setText(text);
    kickScore = () => kit.kick(score, RULES.popup.kick);
    disposePanels = () => {
      for (const o of [menu, hud, score]) if (kit.forget) kit.forget(o);
      for (const o of [menuPanel, startButton, hubButton, hudPanel, score, time, lives]) o.dispose();
    };
  } else {
    // The contract's two calls only: the same words on plain cards.
    const text = u.makeTextPanel('', { width: M.size[0], fontSize: 0.05 });
    text.position.set(0, 0.06, 0);
    const start = u.makeButton(TEXT.start, () => onStart(), { width: 0.34, height: 0.13 });
    const again = u.makeButton(TEXT.again, () => onStart(), { width: 0.34, height: 0.13 });
    const hubButton = u.makeButton(TEXT.hub, () => onHub(), { width: 0.34, height: 0.13 });
    start.position.set(-0.2, -0.26, 0.006); again.position.copy(start.position); hubButton.position.set(0.2, -0.26, 0.006);
    menu.add(text, start, again, hubButton);
    const line = u.makeTextPanel('', { width: H.size[0], fontSize: 0.08 });
    hud.add(line);
    const parts = ['', '0', ''];
    const refresh = () => line.setText(parts[0] + '     ' + parts[1] + '     ' + parts[2]);
    setMenu = (title, info, button) => { text.setText(title + '\n' + info); start.visible = button === TEXT.start; again.visible = !start.visible; };
    setTime = (t) => { parts[0] = t; refresh(); };
    setScore = (t) => { parts[1] = t; refresh(); };
    setLives = (t) => { parts[2] = t; refresh(); };
    kickScore = () => {};
    disposePanels = () => {
      for (const o of [text, start, again, hubButton, line]) {
        if (typeof o.dispose === 'function') o.dispose();
        else { if (o.parent) o.parent.remove(o); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }
      }
    };
  }

  const popups = createPopups(stageRoot, fontFor);

  // ---- caption: only when the shell has no guide of its own (ctx.say) ----
  let caption = null;
  if (typeof ctx.say !== 'function') {
    const holder = new THREE.Group();
    holder.name = 'FrostSliceCaption';
    holder.visible = false;
    root.add(holder);
    let bubble;
    if (kit) {
      bubble = kit.makePanel({
        name: 'Caption', width: 1.0, height: 0.2, style: 'bubble', fill: (kit.colors || COLORS).panel, radius: 0.06, border: 0.007,
        labels: [{ text: '', size: 0.042, font: 'body', color: (kit.colors || COLORS).slate, w: 0.92, h: 0.16 }],
      });
      kit.popIn(holder, { bob: 0.006 });
    } else bubble = u.makeTextPanel('', { width: 1.0, fontSize: 0.042 });
    holder.add(bubble);
    const _head = new THREE.Vector3(), _fwd = new THREE.Vector3();
    let hideIn = 0;
    caption = {
      /** GuideVoice.Speak: parked 1.1 m ahead, half a metre below the eyes, tilted back 24 degrees, typed out. */
      show(text, clipSeconds = 0) {
        ctx.viewerPosition(_head);
        ctx.viewerForward(_fwd); _fwd.y = 0;
        if (_fwd.lengthSq() < 1e-4) _fwd.set(0, 0, -1);
        _fwd.normalize();
        holder.position.set(_head.x + _fwd.x * 1.1, _head.y - 0.5, _head.z + _fwd.z * 1.1);
        holder.rotation.set(-24 * Math.PI / 180, Math.atan2(-_fwd.x, -_fwd.z), 0, 'YXZ');
        const guess = Math.min(8, Math.max(2.5, 1.8 + text.length * 0.055));
        bubble.setText(text);
        if (kit) {
          bubble.typeOn(clipSeconds > 0 ? clipSeconds * 0.9 : Math.min(guess * 0.5, 0.3 + text.length * 0.035));
          if (holder.visible) kit.replay(holder);
        }
        holder.visible = true;
        hideIn = clipSeconds > 0 ? Math.max(guess, clipSeconds + 0.7) : guess;
      },
      hide() { hideIn = 0; holder.visible = false; },
      update(dt) {
        if (hideIn <= 0) return;
        hideIn -= dt;
        if (hideIn <= 0) { if (kit) kit.close(holder); else holder.visible = false; }
      },
      dispose() {
        if (kit && kit.forget) kit.forget(holder);
        if (typeof bubble.dispose === 'function') bubble.dispose();
        if (holder.parent) holder.parent.remove(holder);
      },
    };
  }

  return {
    kind: kit ? (ownKit ? 'own kit' : 'shell kit') : 'plain',
    caption, popups, pointer,
    get menuVisible() { return menu.visible; },
    get hudVisible() { return hud.visible; },
    showMenu(title, info, button) { setMenu(title, info, button); menu.visible = true; },
    hideMenu() { menu.visible = false; if (pointer) pointer.clear(); },
    showHud() { hud.visible = true; },
    hideHud() { hud.visible = false; },
    setScore, setTime, setLives, kickScore,
    /** Per frame. Only our own kit needs driving; the shell updates its own. */
    update(dt) {
      if (ownKit) kit.update(dt);
      if (caption) caption.update(dt);
      popups.update(dt);
    },
    hideAll() {
      menu.visible = false; hud.visible = false;
      popups.clear();
      if (caption) caption.hide();
      if (pointer) pointer.clear();
    },
    dispose() {
      popups.dispose();
      if (caption) caption.dispose();
      disposePanels();
      if (menu.parent) menu.parent.remove(menu);
      if (hud.parent) hud.parent.remove(hud);
    },
  };
}
