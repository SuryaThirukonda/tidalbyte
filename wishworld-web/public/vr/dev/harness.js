// Dev-only stand-in for the headset shell (public/vr/main.js). It builds the `ctx` object described in
// docs/CONTRACT.md, loads one tab module and runs it on a desktop, so a tab can be built and tested on its own.
//
//   /vr/dev/harness.html?tab=explore        or  ?tab=calm
//   &ar=1            pretend to be in AR passthrough (isAR() is true, dark "room" backdrop)
//   &cam=x,y,z       camera position            &look=x,y,z   point the camera looks at
//   &lidar=dev       Explore reads /vr/dev/lidar/ (the labelled synthetic test cloud) instead of /lidar/
//   &hud=0           hide the help text         &hands=1      always show the pretend controllers
//
// Mouse:  left click = right trigger (a ray from the cursor); it presses buttons made with ctx.ui.makeButton.
//         right drag = look around, wheel = move in and out, middle drag = slide.
// Keys:   H = hold the right grip (the right hand follows the cursor, about half a metre out)
//         G = hold the left grip, T = hold the left trigger
//         J L = left hand left/right, I K = away/closer, U O = up/down
//         X = leave the tab (exit) and come back (enter)
//
// Tests drive it through window.__harness (see the bottom of this file and dev/test/).

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const query = new URLSearchParams(location.search);
const tabId = (query.get('tab') || 'explore').replace(/[^a-z0-9_-]/gi, '');
const simulateAR = query.get('ar') === '1';
const showHud = query.get('hud') !== '0';
const showHands = query.get('hands') === '1';   // otherwise a hand only shows while it grips

function triple(text, fallback) {
  const parts = (text || '').split(',').map(Number);
  return parts.length === 3 && parts.every(Number.isFinite) ? parts : fallback;
}

// Colours from the Unity game (WWTheme.cs).
const THEME = {
  sky: '#b8cce0', snow: '#f5f7fa', slate: '#334052', peach: '#ffc79e', panel: '#edf2f7',
  button: '#d1e0f0', ice: '#8fb0d4', ribbon: '#456190', shade: '#788ca8', snowWhite: '#fbfdff', frost: '#ccdef2',
};
const BODY_FONT = 'Georgia, "Times New Roman", serif';

// ---------- renderer, scene, camera ----------

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.05, 200);
const camStart = triple(query.get('cam'), [0, 1.6, 0]);
const lookStart = triple(query.get('look'), tabId === 'calm' ? [0, 1.45, -1.3] : [0, 1.2, -0.8]);
camera.position.fromArray(camStart);

const orbit = new OrbitControls(camera, canvas);
orbit.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
orbit.target.fromArray(lookStart);
orbit.update();
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

scene.add(new THREE.HemisphereLight(0xffffff, 0x8a9bb0, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(2, 4, 3);
scene.add(sun);

if (simulateAR) {
  // A dim room, to check that everything reads without a backdrop of its own.
  scene.background = new THREE.Color('#3b4048');
  const grid = new THREE.GridHelper(8, 16, 0x6c7480, 0x555c66);
  scene.add(grid);
} else {
  scene.background = new THREE.Color(THEME.sky);
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(30, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: THEME.snow }),
  );
  scene.add(ground);
}

// ---------- ui: canvas-texture cards and buttons in the Unity card style ----------

const PIXELS_PER_METRE = 900;
const unitPlane = new THREE.PlaneGeometry(1, 1);
const clickables = [];

function wrapLines(g, text, maxWidth) {
  const lines = [];
  for (const paragraph of String(text).split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      const trial = line ? line + ' ' + word : word;
      if (line && g.measureText(trial).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = trial;
      }
    }
    lines.push(line);
  }
  return lines;
}

function rounded(g, x, y, w, h, r, fill) {
  g.beginPath();
  g.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)));
  g.fillStyle = fill;
  g.fill();
}

/** The Unity "Frame" panel: drop shadow, slate line, white band, thin ice line, pale fill. */
function drawFrame(g, w, h, fill) {
  const shadow = 7, b = 5, r = Math.min(26, h * 0.4);
  const W = w - shadow, H = h - shadow;
  g.clearRect(0, 0, w, h);
  rounded(g, shadow, shadow, W, H, r, 'rgba(120,140,168,0.75)');
  rounded(g, 0, 0, W, H, r, THEME.slate);
  rounded(g, b, b, W - b * 2, H - b * 2, r - b, THEME.snowWhite);
  rounded(g, b + 7, b + 7, W - (b + 7) * 2, H - (b + 7) * 2, r - b - 7, THEME.ice);
  const inner = b + 9;
  const grad = g.createLinearGradient(0, inner, 0, H - inner);
  grad.addColorStop(0, fill);
  grad.addColorStop(1, fill);
  rounded(g, inner, inner, W - inner * 2, H - inner * 2, r - inner, grad);
  return { W, H };
}

function makeTextPanel(text, options = {}) {
  const width = options.width ?? 0.6;
  const fontSize = options.fontSize ?? 0.04;
  const color = options.color ?? THEME.slate;
  const background = options.background ?? THEME.panel;

  const cv = document.createElement('canvas');
  const g = cv.getContext('2d');
  const texture = new THREE.CanvasTexture(cv);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const mesh = new THREE.Mesh(unitPlane, new THREE.MeshBasicMaterial({ map: texture, transparent: true }));
  mesh.name = 'TextPanel';

  function draw(value) {
    const w = Math.round(width * PIXELS_PER_METRE);
    const fontPx = Math.round(fontSize * PIXELS_PER_METRE);
    const pad = Math.round(fontPx * 0.85) + 10;
    const lineHeight = Math.round(fontPx * 1.32);
    g.font = `${fontPx}px ${BODY_FONT}`;
    const lines = wrapLines(g, value, w - pad * 2 - 7);
    const h = lines.length * lineHeight + pad * 2 + 7;
    if (cv.width !== w || cv.height !== h) {
      cv.width = w;
      cv.height = h;
      texture.dispose(); // the size changed: let three make a new GPU texture
    }
    const { W, H } = drawFrame(g, w, h, background);
    g.font = `${fontPx}px ${BODY_FONT}`;
    g.fillStyle = color;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const top = (H - lines.length * lineHeight) / 2;
    lines.forEach((line, i) => g.fillText(line, W / 2, top + lineHeight * (i + 0.5)));
    texture.needsUpdate = true;
    mesh.scale.set(width, h / PIXELS_PER_METRE, 1);
    mesh.userData.text = String(value);
  }

  mesh.setText = (value) => { if (mesh.userData.text !== String(value)) draw(value); };
  draw(text);
  return mesh;
}

function makeButton(label, onClick, options = {}) {
  const width = options.width ?? 0.3;
  const height = options.height ?? 0.09;
  const cv = document.createElement('canvas');
  cv.width = Math.round(width * PIXELS_PER_METRE);
  cv.height = Math.round(height * PIXELS_PER_METRE);
  const g = cv.getContext('2d');
  const texture = new THREE.CanvasTexture(cv);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const mesh = new THREE.Mesh(unitPlane, new THREE.MeshBasicMaterial({ map: texture, transparent: true }));
  mesh.scale.set(width, height, 1);
  mesh.name = 'Button:' + label;

  function draw(hot) {
    const w = cv.width, h = cv.height, lip = 7, b = 5;
    g.clearRect(0, 0, w, h);
    rounded(g, 0, lip, w, h - lip, h, '#8a8f99');          // raised edge below
    rounded(g, 0, 0, w, h - lip, h, THEME.slate);
    const grad = g.createLinearGradient(0, b, 0, h - lip - b);
    grad.addColorStop(0, hot ? '#fff1e4' : '#ffe3cf');
    grad.addColorStop(1, hot ? '#ffd6b8' : THEME.peach);
    rounded(g, b, b, w - b * 2, h - lip - b * 2, h, grad);
    const fontPx = Math.min((h - lip) * 0.46, (w * 1.7) / Math.max(4, label.length));
    g.font = `bold ${Math.round(fontPx)}px ${BODY_FONT}`;
    g.fillStyle = THEME.slate;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(label, w / 2, (h - lip) / 2 + 2);
    texture.needsUpdate = true;
  }
  draw(false);

  mesh.userData.button = { label, onClick, setHot: draw, hot: false };
  clickables.push(mesh);
  return mesh;
}

// ---------- audio, haptics, logging (all pretend: they print what the real shell would do) ----------

const logs = [];        // ctx.log calls: { type, detail, at }
const said = [];        // ctx.audio.speak texts
const sounds = [];      // chime / pop / playUrl / stop / haptic, in order
let speaking = null;    // { finish } while a pretend voice line is playing

function note(kind, detail) {
  sounds.push({ kind, detail, at: performance.now() });
  console.info(`[harness] ${kind}${detail !== undefined ? ' ' + JSON.stringify(detail) : ''}`);
}

const audio = {
  chime() { note('chime'); },
  pop() { note('pop'); },
  speak(text) {
    audio.stop(true);
    said.push(String(text));
    note('speak', String(text));
    return new Promise((resolve) => {
      const timer = setTimeout(() => { speaking = null; resolve(); }, Math.min(4000, 35 * String(text).length));
      speaking = { finish() { clearTimeout(timer); speaking = null; resolve(); } };
    });
  },
  playUrl(url) { note('playUrl', url); return Promise.resolve(); },
  stop(quiet) {
    if (speaking) speaking.finish();
    if (!quiet) note('stop');
  },
};

// ---------- pretend controllers ----------

function makeController(colour, withRay) {
  const grip = new THREE.Group();
  const ray = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.09), new THREE.MeshBasicMaterial({ color: colour }));
  grip.add(body);
  if (withRay) {
    const points = [new THREE.Vector3(), new THREE.Vector3(0, 0, -2)];
    ray.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity: 0.4 })));
  }
  scene.add(grip, ray);
  return { grip, ray, connected: true, gamepad: null, body };
}

const controllers = { left: makeController(0x456190, true), right: makeController(0xffb88c, false) };
const manual = { left: false, right: false };      // true once a test has placed the hand itself
const squeezing = { left: false, right: false };
const selecting = { left: false, right: false };
let rightReach = 0.55;                              // how far out the right hand floats along the cursor ray
const leftOffset = new THREE.Vector3(-0.22, -0.32, -0.55); // left hand, relative to the camera (yaw only)

const pointer = new THREE.Vector2(0, 0);
const raycaster = new THREE.Raycaster();
const keys = new Set();
const tmpV = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler(0, 0, 0, 'YXZ');

function updateControllers(dt) {
  camera.updateMatrixWorld();
  if (!manual.right) {
    raycaster.setFromCamera(pointer, camera);
    const { origin, direction } = raycaster.ray;
    controllers.right.ray.position.copy(origin);
    tmpV.copy(origin).add(direction);
    controllers.right.ray.lookAt(tmpV);
    controllers.right.grip.position.copy(origin).addScaledVector(direction, rightReach);
    controllers.right.grip.quaternion.copy(controllers.right.ray.quaternion);
  }
  if (!manual.left) {
    const step = 0.5 * dt;
    if (keys.has('j')) leftOffset.x -= step;
    if (keys.has('l')) leftOffset.x += step;
    if (keys.has('i')) leftOffset.z -= step;
    if (keys.has('k')) leftOffset.z += step;
    if (keys.has('u')) leftOffset.y += step;
    if (keys.has('o')) leftOffset.y -= step;
    tmpE.setFromQuaternion(camera.quaternion);
    tmpE.x = 0; tmpE.z = 0;
    tmpQ.setFromEuler(tmpE);
    tmpV.copy(leftOffset).applyQuaternion(tmpQ).add(camera.position);
    controllers.left.grip.position.copy(tmpV);
    controllers.left.grip.quaternion.copy(tmpQ);
    controllers.left.ray.position.copy(tmpV);
    controllers.left.ray.quaternion.copy(tmpQ);
  }
  for (const hand of ['left', 'right']) {
    const c = controllers[hand];
    c.grip.visible = showHands || squeezing[hand];
    c.ray.visible = showHands || selecting[hand];
    c.body.scale.setScalar(squeezing[hand] ? 1.4 : 1);
  }
}

// ---------- the ctx object, exactly as the contract lists it ----------

const ctx = {
  THREE, scene, camera, renderer,
  api: {
    base: '', room: () => 'WISH',
    logEvent: async (type, detail) => { console.info('[harness] api.logEvent', type, JSON.stringify(detail)); return { ok: true, id: 0 }; },
  },
  isImmersive: () => false,
  isAR: () => simulateAR,
  viewerPosition: (out) => camera.getWorldPosition(out),
  viewerForward: (out) => camera.getWorldDirection(out),
  controllers,
  ui: { makeTextPanel, makeButton },
  audio,
  haptic(hand, strength, ms) { note('haptic', { hand, strength, ms }); },
  log(type, detail) {
    logs.push({ type, detail, at: performance.now() });
    console.info(`[harness] log ${type} ${JSON.stringify(detail)}`);
  },
  switchTab(id) { note('switchTab', id); },
  setEnvironment(world) { note('setEnvironment', world); },
  // Not in the contract: hints a tab may read when (and only when) it runs in this harness.
  dev: {
    harness: true,
    lidarBase: query.get('lidar') === 'dev' ? '/vr/dev/lidar/' : null,
    verbose: query.get('quiet') !== '1',
  },
};

// ---------- pointer: buttons first, otherwise the tab's trigger handlers ----------

let tab = null;
let active = false;
let hovered = null;
let pressed = null;

function shown(object) {
  for (let o = object; o; o = o.parent) {
    if (!o.visible) return false;
    if (o === scene) return true;
  }
  return false;
}

function buttonUnderPointer() {
  raycaster.setFromCamera(pointer, camera);
  const live = clickables.filter(shown);
  const hit = raycaster.intersectObjects(live, false)[0];
  return hit ? hit.object : null;
}

function setPointer(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function call(name, hand) {
  if (!tab || !active || typeof tab[name] !== 'function') return;
  try {
    tab[name](hand, controllers[hand]);
  } catch (err) {
    console.error(`[harness] ${name} threw`, err);
  }
}

function setSelect(hand, down) {
  if (selecting[hand] === down) return;
  selecting[hand] = down;
  call(down ? 'onSelectStart' : 'onSelectEnd', hand);
}

function setSqueeze(hand, down) {
  if (squeezing[hand] === down) return;
  squeezing[hand] = down;
  call(down ? 'onSqueezeStart' : 'onSqueezeEnd', hand);
}

canvas.addEventListener('pointermove', (event) => {
  setPointer(event);
  const now = buttonUnderPointer();
  if (now !== hovered) {
    if (hovered) hovered.userData.button.setHot(false);
    if (now) now.userData.button.setHot(true);
    hovered = now;
    canvas.style.cursor = now ? 'pointer' : 'default';
  }
});

canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  setPointer(event);
  updateControllers(0);
  pressed = buttonUnderPointer();
  if (!pressed) setSelect('right', true);
});

window.addEventListener('pointerup', (event) => {
  if (event.button !== 0) return;
  if (pressed) {
    const still = buttonUnderPointer() === pressed;
    const button = pressed.userData.button;
    pressed = null;
    if (still) {
      try { button.onClick(); } catch (err) { console.error('[harness] button threw', err); }
    }
  } else {
    setSelect('right', false);
  }
});

canvas.addEventListener('wheel', (event) => {
  if (event.shiftKey) rightReach = THREE.MathUtils.clamp(rightReach - Math.sign(event.deltaY) * 0.05, 0.2, 1.2);
}, { passive: true });

window.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  const key = event.key.toLowerCase();
  keys.add(key);
  if (key === 'g') setSqueeze('left', true);
  if (key === 'h') setSqueeze('right', true);
  if (key === 't') setSelect('left', true);
  if (key === 'x') (active ? leave : arrive)();
});

window.addEventListener('keyup', (event) => {
  const key = event.key.toLowerCase();
  keys.delete(key);
  if (key === 'g') setSqueeze('left', false);
  if (key === 'h') setSqueeze('right', false);
  if (key === 't') setSelect('left', false);
});

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

// ---------- tab lifecycle ----------

function arrive() {
  if (!tab || active) return;
  tab.group.visible = true;
  active = true;
  try { if (tab.enter) tab.enter(); } catch (err) { console.error('[harness] enter threw', err); }
}

function leave() {
  if (!tab || !active) return;
  setSelect('left', false); setSelect('right', false);
  setSqueeze('left', false); setSqueeze('right', false);
  try { if (tab.exit) tab.exit(); } catch (err) { console.error('[harness] exit threw', err); }
  active = false;
  tab.group.visible = false;
}

// ---------- frame loop ----------

const hud = document.getElementById('hud');
hud.style.display = showHud ? 'block' : 'none';
let lastFrame = performance.now();
let elapsed = 0;
let frameMs = 16.7;
let hudTimer = 0;
let lastInfo = { calls: 0, points: 0, triangles: 0 };
let frameCount = 0;

function frame() {
  const now = performance.now();
  const dt = Math.min((now - lastFrame) / 1000, 0.1);
  lastFrame = now;
  frameCount++;
  elapsed += dt;
  frameMs += (dt * 1000 - frameMs) * 0.05;
  orbit.update();
  updateControllers(dt);
  if (tab && active && tab.update) {
    try { tab.update(dt, elapsed); } catch (err) { console.error('[harness] update threw', err); active = false; }
  }
  renderer.render(scene, camera);
  lastInfo = { calls: renderer.info.render.calls, points: renderer.info.render.points, triangles: renderer.info.render.triangles };

  hudTimer -= dt;
  if (showHud && hudTimer <= 0) {
    hudTimer = 0.5;
    const last = logs.slice(-3).map((l) => `log ${l.type} ${JSON.stringify(l.detail)}`).join('\n');
    hud.innerHTML =
      `<b>harness</b> tab=${tabId}${simulateAR ? ' (pretend AR)' : ''}  ${(1000 / frameMs).toFixed(0)} fps  ` +
      `${lastInfo.calls} draws  ${lastInfo.points} points\n` +
      'click = right trigger   right-drag = look   wheel = in/out\n' +
      'H = right grip   G = left grip   T = left trigger   JL IK UO = move left hand   X = exit/enter' +
      (last ? '\n' + last : '');
  }
}

renderer.setAnimationLoop(frame);
// A hidden or headless window can stop getting animation frames. Tests still need the tab's clock to move,
// so if no frame has come for a while, a timer steps one.
setInterval(() => { if (performance.now() - lastFrame > 60) frame(); }, 30);

// ---------- what tests use ----------

const harness = {
  ready: false,
  error: null,
  ctx, logs, said, sounds,
  get tab() { return tab; },
  get active() { return active; },
  /** Every button made with ctx.ui.makeButton: label, whether it can be seen, and where it is on screen (CSS px). */
  buttons() {
    camera.updateMatrixWorld();
    return clickables.map((mesh) => {
      mesh.updateWorldMatrix(true, false);
      const p = mesh.getWorldPosition(new THREE.Vector3()).project(camera);
      return {
        label: mesh.userData.button.label,
        visible: shown(mesh),
        x: Math.round((p.x * 0.5 + 0.5) * window.innerWidth),
        y: Math.round((-p.y * 0.5 + 0.5) * window.innerHeight),
        inFront: p.z < 1,
      };
    });
  },
  /** Press a button by its label, as the pointer would. Returns false if no visible button has that label. */
  click(label) {
    const mesh = clickables.find((m) => m.userData.button.label === label && shown(m));
    if (!mesh) return false;
    mesh.userData.button.onClick();
    return true;
  },
  /** Put a hand somewhere in the world (metres). From then on that hand stops following the mouse or keys. */
  setHand(hand, position, yawRadians = 0) {
    manual[hand] = true;
    const c = controllers[hand];
    c.grip.position.fromArray(position);
    c.grip.rotation.set(0, yawRadians, 0);
    c.ray.position.copy(c.grip.position);
    c.ray.quaternion.copy(c.grip.quaternion);
  },
  /** Aim a hand's pointer ray from a point towards another point. */
  aimHand(hand, from, at) {
    manual[hand] = true;
    const c = controllers[hand];
    c.ray.position.fromArray(from);
    c.ray.lookAt(tmpV.fromArray(at));
    c.grip.position.copy(c.ray.position);
    c.grip.quaternion.copy(c.ray.quaternion);
  },
  squeeze: setSqueeze,
  select: setSelect,
  setCamera(position, look) {
    camera.position.fromArray(position);
    if (look) orbit.target.fromArray(look);
    orbit.update();
  },
  exit: leave,
  enter: arrive,
  info() { return { ...lastInfo, frames: frameCount, fps: 1000 / frameMs, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures }; },
};
window.__harness = harness;

try {
  const module = await import(`/vr/tabs/${tabId}.js`);
  if (!module.meta || typeof module.createTab !== 'function') throw new Error('the module must export meta and createTab(ctx)');
  tab = module.createTab(ctx);
  if (!tab || !tab.group || !tab.group.isObject3D) throw new Error('createTab(ctx) must return an object with a THREE.Group in .group');
  console.info(`[harness] loaded tab "${module.meta.id}" (${module.meta.label})`);
  scene.add(tab.group);
  arrive();
  harness.ready = true;
} catch (err) {
  harness.error = String(err && err.stack ? err.stack : err);
  console.error('[harness] could not load the tab', err);
  hud.style.display = 'block';
  hud.textContent = `Could not load /vr/tabs/${tabId}.js\n${harness.error}`;
}
