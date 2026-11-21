// The panels of the worlds tab, laid out as Unity lays them out:
//   the world picker   HubController's Worlds menu (ribbon, one pill per world, Back)
//   the info panel     WorldController.BuildHud (title, "N of M found", Home, Finish)
//   the fact card      FactCardPanel (name ribbon, the fact typed out, a "New!" badge)
//   the quiz           QuizPanel (up to three questions from the world's facts)
// They are drawn with the shell's UI kit (ctx.ui: Unity's snowy frames, pills and ribbons). On a host that
// only has the contract's makeTextPanel / makeButton, a small stand-in kit keeps everything usable.

import * as THREE from 'three';
import { THEME } from '/shared/creatures.js';

const C = THEME.colors;
const DEG = Math.PI / 180;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// ---------------------------------------------------------------------------------------------- kit

function standInKit(ctx) {
  const ui = ctx.ui || {};
  const text = (value, o) => (typeof ui.makeTextPanel === 'function' ? ui.makeTextPanel(value || ' ', o) : new THREE.Group());
  function makePanel(o = {}) {
    const labels = (o.labels || []).map((l) => l.text || '');
    const join = () => labels.filter(Boolean).join('\n') || ' ';
    const mesh = text(join(), { width: o.width ?? 0.6, fontSize: (o.labels && o.labels[0] && o.labels[0].size) || 0.036, background: o.fill });
    const holder = new THREE.Group();
    holder.add(mesh);
    holder.setText = (value, index = 0) => { labels[index] = value || ''; if (mesh.setText) mesh.setText(join()); return holder; };
    holder.getText = (index = 0) => labels[index] || '';
    holder.typeOn = () => holder;
    holder.retime = () => {};
    holder.dispose = () => {
      if (mesh.dispose) mesh.dispose();
      else { if (mesh.material && mesh.material.map) mesh.material.map.dispose(); if (mesh.material) mesh.material.dispose(); }
      if (holder.parent) holder.parent.remove(holder);
    };
    return holder;
  }
  function makeButton(label, onClick, o = {}) {
    const holder = new THREE.Group();
    let inner = null, handler = onClick, enabled = true;
    const build = (value) => {
      if (inner) holder.remove(inner);
      inner = typeof ui.makeButton === 'function'
        ? ui.makeButton(String(value), () => { if (enabled && handler) handler(); }, { width: o.width ?? 0.3, height: o.height ?? 0.11 })
        : new THREE.Group();
      holder.add(inner);
    };
    build(label);
    holder.setLabel = (value) => { build(value); return holder; };
    holder.setEnabled = (on) => { enabled = Boolean(on); return holder; };
    holder.setSelected = () => holder;
    holder.bounce = () => {};
    holder.shake = () => {};
    holder.dispose = () => { if (holder.parent) holder.parent.remove(holder); };
    return holder;
  }
  return {
    standIn: true,
    makePanel, makeButton,
    makeRibbon: (value, o = {}) => makePanel({ width: o.width, fill: o.fill, labels: [{ text: value, size: o.textHeight }] }),
    makeLabel: (value, o = {}) => makePanel({ width: o.width, labels: [{ text: value, size: o.size }] }),
    popIn: (object) => object,
    replay: (object) => { object.visible = true; },
    close: (object) => { if (object) object.visible = false; },
    kick: () => {},
    forget: () => {},
  };
}

/** The shell's UI kit when the host has it, else the stand-in. */
export function pickKit(ctx) {
  const ui = ctx.ui;
  if (ui && typeof ui.makePanel === 'function' && typeof ui.makeRibbon === 'function' && typeof ui.makeLabel === 'function') return ui;
  return standInKit(ctx);
}

/**
 * Loose text over a panel (the counter, a fact, a quiz question). The kit cuts bare text out with an alpha
 * test, which breaks thin letters up at a distance; blended over the panel behind it, it stays smooth.
 */
function softText(label) {
  const m = label && label.material;
  if (m && m.isMeshBasicMaterial) {
    m.alphaTest = 0; m.alphaToCoverage = false; m.transparent = true; m.depthWrite = false;
    m.needsUpdate = true;
    label.renderOrder = 12;
  }
  return label;
}

function disposeAll(list) {
  for (const o of list) { if (o && typeof o.dispose === 'function') o.dispose(); else if (o && o.parent) o.parent.remove(o); }
  list.length = 0;
}

// ---------------------------------------------------------------------------------------------- picker

/**
 * The Worlds menu. Lives at Unity's menu root, (0, 1.38, 1.8) in front of the player.
 *   worlds        the menu worlds, in Unity's order
 *   onPick(id), onBack()
 */
export function createPicker(kit, parent, { worlds, onPick, onBack }) {
  const root = new THREE.Group();
  root.name = 'WorldsMenu';
  root.position.set(0, 1.38, -1.8);
  root.visible = false;
  parent.add(root);
  const made = [];
  let built = false;

  function build() {
    if (built) return;
    built = true;
    const ribbon = kit.makeRibbon('Worlds', { width: 0.6, height: 0.14, textHeight: 0.09 });
    ribbon.position.set(0, 0.43, 0);
    root.add(ribbon);
    kit.popIn(ribbon, { bob: 0.006, bobSpeed: 0.9 });
    made.push(ribbon);
    worlds.forEach((w, n) => {
      // One pill per menu world, four to a row (HubController.BuildMenus).
      const b = kit.makeButton(w.name, () => onPick(w.id), { width: 0.4, height: 0.17, textHeight: 0.05 });
      b.position.set((n % 4 - 1.5) * 0.43, 0.16 - Math.floor(n / 4) * 0.2, 0);
      root.add(b);
      made.push(b);
    });
    const back = kit.makeButton('Back', () => onBack(), { width: 0.3, height: 0.11, textHeight: 0.045 });
    back.position.set(0, -0.3, 0);
    root.add(back);
    made.push(back);
  }

  return {
    root,
    get isOpen() { return root.visible; },
    open() { build(); root.visible = true; },
    close() { root.visible = false; },
    dispose() {
      for (const o of made) kit.forget(o);
      disposeAll(made);
      built = false;
      root.visible = false;
    },
  };
}

// ---------------------------------------------------------------------------------------------- info panel

/**
 * The info panel to the player's left: the world's name, the found counter, Home and Finish. Under it sit
 * two buttons Unity keeps on its wish menu instead: "Worlds" (the picker again) and "In my room" /
 * "Take me there" (the AR switch).
 */
export function createInfoPanel(kit, parent, { onHome, onFinish, onWorlds, onToggleAR }) {
  const root = new THREE.Group();
  root.name = 'InfoPanel';
  // Floor + Forward * 1.15 - Right * 0.95 + up * 1.12, turned to the head at 1.5 m, tilted back 12 degrees.
  root.position.set(-0.95, 1.12, -1.15);
  root.rotation.set(-12 * DEG, Math.atan2(0.95, 1.15), 0, 'YXZ');
  root.visible = false;
  parent.add(root);
  const made = [];
  let panel = null, counter = null, arButton = null, built = false;
  let title = '', count = '', arOn = false, arShown = true;

  function build() {
    if (built) return;
    built = true;
    panel = kit.makePanel({
      name: 'InfoPanel', width: 0.62, height: 0.4, fill: C.panel, radius: 0.045, border: 0.008,
      labels: [{ text: title, size: 0.06, font: 'title', w: 0.5, h: 0.085, y: 0.125 }],
    });
    root.add(panel);
    counter = softText(kit.makeLabel(count, { width: 0.56, height: 0.07, size: 0.04 }));
    counter.position.set(0, 0.04, 0.004);
    root.add(counter);
    kit.popIn(counter);
    const home = kit.makeButton('Home', () => onHome(), { width: 0.24, height: 0.11, textHeight: 0.042 });
    home.position.set(-0.14, -0.105, 0.006);
    const finish = kit.makeButton('Finish', () => onFinish(), { width: 0.24, height: 0.11, textHeight: 0.042, fill: C.peach });
    finish.position.set(0.14, -0.105, 0.006);
    const worlds = kit.makeButton('Worlds', () => onWorlds(), { width: 0.26, height: 0.1, textHeight: 0.04 });
    worlds.position.set(-0.15, -0.325, 0.006);
    arButton = kit.makeButton(arOn ? 'Take me there' : 'In my room', () => onToggleAR(), { width: 0.3, height: 0.1, textHeight: 0.036 });
    arButton.position.set(0.15, -0.325, 0.006);
    arButton.visible = arShown;
    root.add(home, finish, worlds, arButton);
    made.push(panel, counter, home, finish, worlds, arButton);
    kit.popIn(root);
  }

  return {
    root,
    show() { build(); root.visible = true; },
    hide() { root.visible = false; },
    setTitle(text) { title = text; if (panel) panel.setText(text, 0); },
    /** `kick`: the count jumps when it goes up. */
    setCounter(text, kick = false) {
      const changed = text !== count;
      count = text;
      if (counter && changed) counter.setText(text);
      if (counter && kick) kit.kick(counter, 0.35);
    },
    /** The AR switch: which way it points, and whether it is offered at all (not in a real AR session). */
    setAR(on, shown = true) {
      arShown = shown;
      if (arButton) {
        if (on !== arOn) arButton.setLabel(on ? 'Take me there' : 'In my room');
        arButton.visible = shown;
      }
      arOn = on;
    },
    get title() { return title; },
    get counter() { return count; },
    dispose() {
      kit.forget(root);
      if (counter) kit.forget(counter);
      disposeAll(made);
      panel = counter = arButton = null;
      built = false;
      root.visible = false;
    },
  };
}

// ---------------------------------------------------------------------------------------------- fact card

const _head = new THREE.Vector3(), _to = new THREE.Vector3();

/** The fact card: 0.74 x 0.36, between the player and the creature, a little to the side and below eye level. */
export function createFactCard(kit, parent, ctx) {
  const root = new THREE.Group();
  root.name = 'FactCard';
  root.visible = false;
  root.renderOrder = 10;
  parent.add(root);
  const made = [];
  let ribbon = null, body = null, badge = null, built = false;
  let hideAt = 0, clock = 0, isNew = false, current = null;

  function build() {
    if (built) return;
    built = true;
    const panel = kit.makePanel({ name: 'Card', width: 0.74, height: 0.36, fill: C.panel, radius: 0.045, border: 0.008 });
    root.add(panel);
    // The name sits on a ribbon across the top edge of the card, like a storybook page heading.
    ribbon = kit.makeRibbon('', { width: 0.46, height: 0.09, textHeight: 0.052, fill: C.peach, color: C.slate });
    ribbon.position.set(0, 0.175, 0.008);
    body = softText(kit.makeLabel('', { width: 0.64, height: 0.2, size: 0.036 }));
    body.position.set(0, -0.012, 0.005);
    badge = softText(kit.makeLabel('New!', { width: 0.3, height: 0.04, size: 0.024, align: 'right' }));
    badge.position.set(0.17, -0.155, 0.005);
    root.add(ribbon, body, badge);
    made.push(panel, ribbon, body, badge);
    kit.popIn(root, { bob: 0.008 });
  }

  return {
    root,
    get current() { return current; },
    get visible() { return root.visible; },
    /** FactCardPanel.Display. `at` is the creature's world position (or null: straight ahead). */
    show(def, at, fresh) {
      build();
      current = def;
      ctx.viewerPosition(_head);
      if (at) _to.copy(at).sub(_head); else ctx.viewerForward(_to);
      _to.y = 0;
      if (_to.lengthSq() < 0.01) { ctx.viewerForward(_to); _to.y = 0; }
      if (_to.lengthSq() < 1e-6) _to.set(0, 0, -1);
      _to.normalize();
      // Slightly to the side of the line of sight (the player's right) so it does not cover the creature.
      const px = _head.x + _to.x * 1.15 - _to.z * 0.22;
      const pz = _head.z + _to.z * 1.15 + _to.x * 0.22;
      const py = _head.y - 0.18;
      const flat = Math.hypot(px - _head.x, pz - _head.z);
      // The offset from the anchor's frame: `parent` may be turned (the real room), so place in its space.
      root.position.set(px, py, pz);
      if (root.parent) root.parent.worldToLocal(root.position);
      root.rotation.set(-Math.atan2(0.18, flat), Math.atan2(_head.x - px, _head.z - pz), 0, 'YXZ');
      if (root.parent) root.rotation.y -= parentYaw(root.parent);
      ribbon.setText(def.name);
      body.setText(def.fact);
      isNew = Boolean(fresh);
      badge.visible = isNew;
      badge.scale.setScalar(1);
      if (root.visible) kit.replay(root); else root.visible = true;
      body.typeOn(clamp(def.fact.length * 0.045, 1.2, 5));         // the words appear at about the pace they are read
      hideAt = clock + clamp(3.5 + def.fact.length * 0.05, 5, 10);
    },
    hide() { if (root.visible) kit.close(root); },
    update(dt) {
      clock += dt;
      if (!root.visible) return;
      if (clock >= hideAt) { kit.close(root); return; }
      // the "New!" badge beats like a little heart
      if (isNew && badge) badge.scale.setScalar(1 + 0.1 * Math.abs(Math.sin(clock * 4)));
    },
    dispose() {
      kit.forget(root);
      disposeAll(made);
      ribbon = body = badge = null;
      built = false; current = null;
      root.visible = false;
    },
  };
}

const _q = new THREE.Quaternion(), _e = new THREE.Euler();
function parentYaw(object) {
  object.getWorldQuaternion(_q);
  return _e.setFromQuaternion(_q, 'YXZ').y;
}

// ---------------------------------------------------------------------------------------------- quiz

/**
 * QuizPanel: "You found N of M!", then up to three questions, each with the right creature and two others
 * from the same world, 2.2 s between questions, then the score.
 *   say { read(text), say(text), hush(), verdict(right, at) }   onHome()
 */
export function createQuiz(kit, parent, { voice, onHome }) {
  const QUESTIONS = 3;
  const root = new THREE.Group();
  root.name = 'QuizPanel';
  root.position.set(0, 1.55, -1.25);              // Floor + Forward * 1.25 + up * 1.55, square to the player
  root.visible = false;
  parent.add(root);
  const made = [], options = [];
  let header = null, question = null, built = false;
  let pool = [], asked = [], index = 0, score = 0, nextAt = -1, finished = false, clock = 0;
  let headerText = '', questionText = '';

  function build() {
    if (built) return;
    built = true;
    const panel = kit.makePanel({ name: 'Quiz', width: 1.0, height: 0.62, fill: C.panel, radius: 0.05, border: 0.008 });
    root.add(panel);
    header = softText(kit.makeLabel('', { width: 0.78, height: 0.065, size: 0.044, font: 'heading' }));
    header.position.set(0, 0.255, 0.004);
    kit.popIn(header);
    question = softText(kit.makeLabel('', { width: 0.9, height: 0.17, size: 0.046 }));
    question.position.set(0, 0.125, 0.004);
    root.add(header, question);
    made.push(panel, header, question);
    for (let i = 0; i < 3; i++) {
      const b = kit.makeButton('', () => answer(i), { width: 0.29, height: 0.13, textHeight: 0.04 });
      b.position.set((i - 1) * 0.31, -0.06, 0.006);
      b.userData.answer = '';
      root.add(b);
      options.push(b);
      made.push(b);
    }
    const close = kit.makeButton('Close', () => { voice.hush(); kit.close(root); }, { width: 0.24, height: 0.09, textHeight: 0.036 });
    close.position.set(-0.14, -0.225, 0.006);
    const home = kit.makeButton('Home', () => onHome(), { width: 0.24, height: 0.09, textHeight: 0.036, fill: C.peach });
    home.position.set(0.14, -0.225, 0.006);
    root.add(close, home);
    made.push(close, home);
    kit.popIn(root);
  }

  function setHeader(text, kick = 0) {
    headerText = text;
    header.setText(text);
    if (kick > 0) kit.kick(header, kick);
  }
  function setQuestion(text, seconds) {
    questionText = text;
    question.setText(text);
    if (seconds > 0) question.typeOn(seconds);
  }

  function begin(creatures, found, total) {
    build();
    pool = creatures.slice();
    asked = creatures.slice();
    // Shuffle, then keep up to three.
    for (let i = asked.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const s = asked[i]; asked[i] = asked[j]; asked[j] = s;
    }
    if (asked.length > QUESTIONS) asked.length = QUESTIONS;
    index = 0; score = 0; finished = false; nextAt = -1;
    if (root.visible) kit.replay(root); else root.visible = true;
    setHeader('You found ' + found + ' of ' + total + '!');
    if (asked.length === 0) { showResult(); return; }
    showQuestion();
  }

  function showQuestion() {
    const q = asked[index];
    setHeader('Question ' + (index + 1) + ' of ' + asked.length, 0.18);
    setQuestion(q.quiz, clamp(q.quiz.length * 0.04, 0.8, 3));
    voice.read(q.quiz);
    // Right answer plus two other creatures from this world.
    const names = [q.name];
    const others = pool.filter((c) => c !== q);
    while (names.length < 3 && others.length > 0) {
      const j = Math.floor(Math.random() * others.length);
      names.push(others[j].name);
      others.splice(j, 1);
    }
    for (let i = names.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const s = names[i]; names[i] = names[j]; names[j] = s;
    }
    for (let i = 0; i < options.length; i++) {
      const used = i < names.length;
      options[i].visible = used;
      options[i].setEnabled(true);
      options[i].setSelected(false);
      if (used) { options[i].userData.answer = names[i]; options[i].setLabel(names[i]); }
    }
  }

  function correctOption() {
    if (finished || index >= asked.length) return -1;
    for (let i = 0; i < options.length; i++) if (options[i].visible && options[i].userData.answer === asked[index].name) return i;
    return -1;
  }

  function answer(option) {
    if (finished || nextAt > 0 || option >= options.length || !options[option].visible) return;
    const q = asked[index];
    const right = options[option].userData.answer === q.name;
    voice.verdict(right, root);
    if (right) { score++; options[option].bounce(); }
    else {
      options[option].shake();
      const correct = correctOption();
      if (correct >= 0) options[correct].bounce();          // the right one hops, so the answer is shown as well as said
    }
    options[option].setSelected(true);
    for (const o of options) o.setEnabled(false);
    setHeader(right ? 'Yes! ' + q.name + '.' : 'It was the ' + q.name + '.', 0.3);
    voice.read(headerText);
    nextAt = clock + 2.2;
  }

  function showResult() {
    finished = true;
    for (const o of options) o.visible = false;
    if (asked.length === 0) {
      setQuestion('Add some creatures and learn their facts, then try the quiz.', 0);
      voice.read(questionText);
      return;
    }
    setHeader('Quiz finished', 0.3);
    setQuestion('You got ' + score + ' of ' + asked.length + ' right!', 0.6);
    voice.read(questionText);
    voice.say(score === asked.length ? 'Perfect score! You are a real explorer.' : 'Nice exploring! Want to look around some more?');
  }

  return {
    root,
    /** True while a quiz is on screen: looking at a creature does not open its card then. */
    get blocking() { return root.visible; },
    get score() { return score; },
    get header() { return headerText; },
    get question() { return questionText; },
    begin, answer, correctOption,
    close() { if (root.visible) kit.close(root); },
    update(dt) {
      clock += dt;
      if (nextAt > 0 && clock >= nextAt) {
        nextAt = -1;
        index++;
        if (index >= asked.length) showResult(); else showQuestion();
      }
    },
    dispose() {
      kit.forget(root);
      if (header) kit.forget(header);
      disposeAll(made);
      options.length = 0;
      header = question = null;
      built = false; nextAt = -1;
      root.visible = false;
    },
  };
}
