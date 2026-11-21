// Explore: real places, built from USGS lidar, shown as a tabletop model about one metre across.
//
// The model floats in front of the child at chest height. They lean in and walk around it; nothing ever
// moves the viewer. Squeezing the grips on both controllers and pulling scales and turns the model; one grip
// drags it. The points come from /lidar/<place>.json + .bin (format in docs/CONTRACT.md) and are drawn as a
// single THREE.Points, one draw call, with only one place in memory at a time.
//
// If a place's files are missing or broken the card says so. Nothing is ever drawn in their place.
//
// "Walk around it" makes the place life-size and puts the child on the ground near the landmark, facing it. The
// child stays where they are and the place moves under them (left thumbstick, or W A S D, the on-screen stick or
// a game controller; the right thumbstick turns in steps). A ground grid made from the dots keeps their feet on
// the ground. "Back to the table" brings the tabletop model back.

export const meta = { id: 'explore', label: 'Explore', order: 6 };

// `slab` is the colour of the dark base under the points (the same as /lidar/preview.html). The base is not
// lidar data: still water and upright walls send nothing back to the plane, so the base shows through there
// as deep water or shadow instead of the room behind.
const PLACES = [
  { id: 'liberty', label: 'Statue of Liberty', slab: '#13222e' },
  { id: 'niagara', label: 'Niagara Falls', slab: '#0b3a41' },
  { id: 'goldengate', label: 'Golden Gate', slab: '#12303f' },
  { id: 'gateway', label: 'Gateway Arch', slab: '#25332f' },
  { id: 'washington', label: 'Washington Mon.', slab: '#1d2f2a' },
  { id: 'devilstower', label: 'Devils Tower', slab: '#2a2b22' },
  { id: 'grandcanyon', label: 'Grand Canyon', slab: '#3a2a20' },
];

// Walking: life-size metres a second (faster in big places, so the far side is not minutes away), the step
// the right thumbstick turns by, and the size of the ground grid cells.
const WALK_SPEED = 4;
const SNAP_TURN = Math.PI / 6;
const GROUND_CELL = 2;

// Colours of the Unity game (WWTheme.cs). /shared/creatures.js THEME replaces these when it loads.
const FALLBACK_THEME = {
  slate: '#334052', panel: '#edf2f7', ice: '#8fb0d4', ribbon: '#45618c', snow: '#f2f7fc', peach: '#ffb88c',
};

const MIN_WIDTH = 0.3;          // metres across, smallest and largest the child can make the model
const MAX_WIDTH = 3.0;
const HOME_AHEAD = 0.8;         // metres in front of the viewer
const HOME_BELOW_EYES = 0.5;    // metres under eye height: about chest height, so the child looks down into it
const FADE_OUT = 0.25;          // seconds
const FADE_IN = 0.6;
const MAX_POINTS = 1500000;     // refuse anything larger than the format is meant to carry
const PLINTH_THICKNESS = 0.03;

const INFO_TEXT =
  'How was this made?\n' +
  'A plane flew over and measured the land with laser light. Every dot is a spot the light touched.\n' +
  'The plane sees roofs, treetops and the ground well. It sees the sides of tall things poorly, ' +
  'so walls and statues look thin and have gaps.';

function cssColour(value, fallback) {
  if (typeof value === 'string' && value) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return '#' + (value >>> 0).toString(16).padStart(6, '0').slice(-6);
  if (value && typeof value.getHexString === 'function') return '#' + value.getHexString();
  if (Array.isArray(value) && value.length >= 3) {
    const part = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
    return '#' + part(value[0]) + part(value[1]) + part(value[2]);
  }
  return fallback;
}

export function createTab(ctx) {
  const { THREE } = ctx;

  const group = new THREE.Group();
  group.name = 'Explore';
  const root = new THREE.Group();     // sits at the viewer's feet, turned the way they face when they arrive
  root.name = 'ExploreRoot';
  group.add(root);
  const pivot = new THREE.Group();    // the model on its base: this is what the grips move, turn and scale
  pivot.name = 'Diorama';
  root.add(pivot);

  // ---------- theme ----------

  const theme = { ...FALLBACK_THEME };
  const themeReady = import('/shared/creatures.js')
    .then((shared) => {
      const t = shared && shared.THEME;
      if (!t) return;
      const palette = t.colors || t.colours || t;
      for (const key of Object.keys(FALLBACK_THEME)) theme[key] = cssColour(palette[key], theme[key]);
    })
    .catch(() => { /* the shared theme is optional: keep the Unity colours above */ });

  // ---------- the point cloud ----------

  const material = new THREE.PointsMaterial({ size: 0.004, sizeAttenuation: true, vertexColors: true });
  material.toneMapped = false;
  material.fog = false;
  let coloursAreSrgb = true;
  // Dots never shrink below 1.5 px (no sparkle from far away) and never grow past 56 px (leaning right in
  // would otherwise fill the whole view with a few huge squares, which is slow on a headset).
  // While walking at life size the cap is lower: dots right by the feet would otherwise be huge squares.
  const maxDotPx = { value: 56 };
  const clampDots = (shader) => {
    shader.uniforms.uMaxDotPx = maxDotPx;
    shader.vertexShader = 'uniform float uMaxDotPx;\n' + shader.vertexShader.replace(
      '#include <fog_vertex>',
      'gl_PointSize = clamp( gl_PointSize, 1.5, uMaxDotPx );\n\t#include <fog_vertex>',
    );
  };
  const decodeSrgb = (shader) => {
    // The file's colours are sRGB bytes. three treats vertex colours as linear, so decode them once per
    // vertex; the renderer then encodes the frame as usual and the colours come out as they were made.
    shader.vertexShader = shader.vertexShader.replace(
      '#include <color_vertex>',
      '#include <color_vertex>\n' +
      '#ifdef USE_COLOR\n' +
      '\tvColor.rgb = mix( pow( vColor.rgb * 0.9478672986 + 0.0521327014, vec3( 2.4 ) ), vColor.rgb * 0.0773993808, ' +
      'vec3( lessThanEqual( vColor.rgb, vec3( 0.04045 ) ) ) );\n' +
      '#endif',
    );
    clampDots(shader);
  };
  const keepColours = (shader) => clampDots(shader);
  material.onBeforeCompile = decodeSrgb;

  const points = new THREE.Points(new THREE.BufferGeometry(), material);
  points.name = 'LidarPoints';
  points.frustumCulled = true;
  points.visible = false;
  pivot.add(points);

  const plinthSide = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: FALLBACK_THEME.slate }));
  const plinthTop = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: PLACES[0].slab }));
  const plinthRim = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: FALLBACK_THEME.ice }));
  plinthSide.name = 'Plinth';
  for (const mesh of [plinthSide, plinthTop, plinthRim]) {
    mesh.material.toneMapped = false;
    mesh.material.fog = false;
    pivot.add(mesh);
  }
  let footprintX = 1;   // size of the model on its base, metres at scale 1
  let footprintZ = 1;

  function sizePlinth() {
    const w = footprintX + 0.05, d = footprintZ + 0.05;
    plinthSide.scale.set(w, PLINTH_THICKNESS, d);
    plinthSide.position.set(0, -PLINTH_THICKNESS / 2 - 0.0015, 0);
    plinthRim.scale.set(w - 0.012, 1, d - 0.012);
    plinthRim.position.set(0, -0.0012, 0);
    plinthTop.scale.set(w - 0.03, 1, d - 0.03);
    plinthTop.position.set(0, -0.0008, 0);
    if (namePlate) {
      namePlate.position.set(0, -0.012 - plateSize.y * 0.5 * Math.sin(PLATE_TILT), d / 2 + 0.006 + plateSize.y * 0.5 * Math.cos(PLATE_TILT));
    }
  }

  // ---------- state ----------

  let entered = false;
  let built = false;            // the cards and buttons exist
  let session = 0;              // goes up on every enter and exit, so late promises can tell they are stale
  let currentId = PLACES[0].id; // remembered between visits
  // ?place=<id> (for example /vr/?tab=explore&place=goldengate) opens on that place.
  const askedPlace = ctx.params && typeof ctx.params.get === 'function' ? ctx.params.get('place') : null;
  if (askedPlace && PLACES.some((p) => p.id === askedPlace)) currentId = askedPlace;
  let loadToken = 0;
  let abort = null;
  let loaded = null;            // { id, name, count, worldSize, fit, spawn } for the cloud now in memory
  let loaded_spawn = null;
  let pending = null;           // a fetched place waiting for the fade-out to finish
  let fade = 0;                 // 0 hidden .. 1 shown
  let fadeDir = 0;              // -1 fading out, +1 fading in
  let budget = 1;               // fraction of the points being drawn (drops if the headset cannot keep up)
  let slowFor = 0;
  let frameAvg = 1 / 72;

  // Where the model is and where it is heading (eased when a button moves it, direct while gripped).
  let scale = 1, yaw = 0;
  let targetScale = 1, targetYaw = 0;
  const home = new THREE.Vector3();
  const targetPos = new THREE.Vector3();
  let placedEyeY = 0;
  let placedAt = 0;
  let userMoved = false;
  let clock = 0;

  // Walking around a place at life size.
  let walking = false;
  let ground = null;            // { cells, n, cell, minX, minZ } heights in metres, from the dots
  let walkUi = null, walkTitle = null, walkBack = null, walkHelp = null;
  let snapReady = true;
  let walkY = 0;                // the place's height under the feet, eased

  // Grips.
  const held = { left: null, right: null };
  const grab = {
    count: 0, scale: 1, yaw: 0, pos: new THREE.Vector3(),
    mid: new THREE.Vector3(), dist: 1, angle: 0, hand: new THREE.Vector3(), handYaw: 0,
  };

  // Scratch objects: nothing is allocated per frame.
  const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3(), vD = new THREE.Vector3();
  const qA = new THREE.Quaternion();
  const box = new THREE.Box3(), partBox = new THREE.Box3();
  const mA = new THREE.Matrix4(), mB = new THREE.Matrix4();

  // ---------- cards and buttons (made once, with the shell's ui so they match every other tab) ----------

  let titlePanel = null, factPanel = null, infoPanel = null, helpPanel = null, pickTitle = null, namePlate = null;
  const centre = new THREE.Group(), leftColumn = new THREE.Group(), rightColumn = new THREE.Group();
  const pickButtons = [];
  let toolButtons = [];
  let resetButton = null;
  let walkButton = null;
  const plateSize = new THREE.Vector3(0.3, 0.07, 0);
  const PLATE_TILT = THREE.MathUtils.degToRad(38);
  const sizeOut = new THREE.Vector3();

  /** Width and height of a card or button in its parent's space (it may be a Mesh or a Group). */
  function sizeOf(object) {
    const known = object.userData.exploreSize;   // buttons: their size animates as they pop in, so use the real one
    if (known) return sizeOut.set(known[0], known[1], 0);
    object.updateWorldMatrix(true, true);
    mA.copy(object.matrixWorld).invert();
    box.makeEmpty();
    object.traverse((o) => {
      if (!o.geometry) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      mB.multiplyMatrices(mA, o.matrixWorld);
      partBox.copy(o.geometry.boundingBox).applyMatrix4(mB);
      box.union(partBox);
    });
    if (box.isEmpty()) return sizeOut.set(0, 0, 0);
    box.getSize(sizeOut);
    sizeOut.multiply(object.scale);
    return sizeOut;
  }

  /** Stack cards downwards from `top` in a column, centred, with a gap between them. Returns the new bottom. */
  function stack(items, top, gap) {
    let y = top;
    for (const item of items) {
      if (!item) continue;
      const h = Array.isArray(item) ? sizeOf(item[0]).y : sizeOf(item).y;
      if (Array.isArray(item)) {
        // A row of equal buttons.
        const w = sizeOf(item[0]).x;
        const total = w * item.length + 0.02 * (item.length - 1);
        item.forEach((child, i) => child.position.set(-total / 2 + w / 2 + i * (w + 0.02), y - h / 2, 0));
      } else {
        item.position.set(0, y - h / 2, 0);
      }
      y -= h + gap;
    }
    return y;
  }

  function makeButton(label, onClick, width, height) {
    const button = ctx.ui.makeButton(label, onClick, { width, height });
    button.userData.exploreSize = [width, height];
    return button;
  }

  function buildCards() {
    if (built) return;
    built = true;
    const ui = ctx.ui;
    // `padding` is understood by the shell's card (room for its corner snowflakes); others ignore it.
    const text = { color: theme.slate, background: theme.panel, padding: 0.05 };

    plinthSide.material.color.set(theme.slate);
    plinthRim.material.color.set(theme.ice);

    // Straight ahead, behind the model: the place's name and what the guide says about it.
    // The name goes on a title ribbon when the shell's kit has one (Unity's titles are ribbons).
    titlePanel = typeof ui.makeRibbon === 'function'
      ? ui.makeRibbon('Explore', { width: 0.66, height: 0.12 })
      : ui.makeTextPanel('Explore', { width: 0.62, fontSize: 0.05, color: theme.snow, background: theme.ribbon });
    factPanel = ui.makeTextPanel('Pick a place to look at.', { width: 0.92, fontSize: 0.036, ...text });
    centre.add(titlePanel, factPanel);
    root.add(centre);

    // To the left: the picker.
    pickTitle = ui.makeTextPanel('Pick a place', { width: 0.44, fontSize: 0.04, ...text });
    leftColumn.add(pickTitle);
    for (const place of PLACES) {
      const button = makeButton(place.label, () => choose(place.id), 0.215, 0.085);
      button.userData.placeId = place.id;
      pickButtons.push(button);
      leftColumn.add(button);
    }
    helpPanel = ui.makeTextPanel(helpText(), { width: 0.44, fontSize: 0.028, ...text });
    leftColumn.add(helpPanel);
    root.add(leftColumn);

    // To the right: how the model was made (and what it cannot show), and the size and turn buttons.
    infoPanel = ui.makeTextPanel(INFO_TEXT, { width: 0.52, fontSize: 0.027, ...text });
    rightColumn.add(infoPanel);
    toolButtons = [
      makeButton('Turn', () => nudge(0, Math.PI / 4), 0.17, 0.085),
      makeButton('Bigger', () => nudge(1.3, 0), 0.17, 0.085),
      makeButton('Smaller', () => nudge(1 / 1.3, 0), 0.17, 0.085),
    ];
    resetButton = makeButton('Put it back', resetModel, 0.36, 0.085);
    walkButton = makeButton('Walk around it', () => startWalking(), 0.36, 0.095);
    rightColumn.add(...toolButtons, resetButton, walkButton);
    root.add(rightColumn);

    // While walking: one small panel by the child, with the place's name and the way back to the table.
    walkUi = new THREE.Group();
    walkUi.name = 'WalkPanel';
    walkTitle = ui.makeTextPanel('Explore', { width: 0.42, fontSize: 0.036, color: theme.slate, background: theme.panel });
    walkHelp = ui.makeTextPanel(walkHelpText(), { width: 0.42, fontSize: 0.024, ...text });
    walkBack = makeButton('Back to the table', () => stopWalking(), 0.42, 0.09);
    walkUi.add(walkTitle, walkHelp, walkBack);
    walkUi.visible = false;
    root.add(walkUi);

    // On the front edge of the base: the name plate. It belongs to the model, so it turns and grows with it.
    namePlate = ui.makeTextPanel(PLACES[0].label, { width: 0.34, fontSize: 0.032, color: theme.slate, background: theme.panel });
    namePlate.rotation.x = -PLATE_TILT;
    namePlate.visible = false;
    pivot.add(namePlate);
    plateSize.copy(sizeOf(namePlate));
  }

  function helpText() {
    return ctx.isImmersive()
      ? 'Squeeze the side buttons on both controllers. Pull your hands apart to make it bigger. Turn your hands to spin it.'
      : 'Use Turn, Bigger and Smaller to look around the model.';
  }

  function layoutCards() {
    if (!built) return;
    const eye = placedEyeY;
    // Centre: far enough back to sit behind the model, high enough to clear its tallest part.
    centre.position.set(0, 0, -1.6);
    stack([titlePanel, factPanel], eye + 0.37, 0.03);
    // Left and right: on a circle around the viewer, each turned to face them.
    // Close enough to the middle to be seen without turning the head (and to fit a desktop preview).
    const angle = THREE.MathUtils.degToRad(31), radius = 1.3;
    leftColumn.position.set(-Math.sin(angle) * radius, 0, -Math.cos(angle) * radius);
    leftColumn.rotation.y = angle;
    rightColumn.position.set(Math.sin(angle) * radius, 0, -Math.cos(angle) * radius);
    rightColumn.rotation.y = -angle;
    const pairs = [];
    for (let i = 0; i < pickButtons.length; i += 2) pairs.push(pickButtons.slice(i, i + 2));
    stack([pickTitle, ...pairs, helpPanel], eye + 0.22, 0.025);
    stack([infoPanel, toolButtons, resetButton, walkButton], eye + 0.22, 0.03);
  }

  function setFacts(text) {
    if (!factPanel) return;
    factPanel.setText(text);
    layoutCards();
  }

  // ---------- placing the model in front of the viewer ----------

  function place() {
    ctx.viewerPosition(vA);
    ctx.viewerForward(vB);
    vB.y = 0;
    if (vB.lengthSq() < 1e-4) vB.set(0, 0, -1);
    vB.normalize();
    group.updateWorldMatrix(true, false);
    // The shell may have moved the tab's group; work in the group's own space.
    group.worldToLocal(vC.copy(vA));
    vD.copy(vA).add(vB);
    group.worldToLocal(vD).sub(vC);
    root.position.set(vC.x, 0, vC.z);
    root.rotation.set(0, Math.atan2(-vD.x, -vD.z), 0);
    root.updateMatrixWorld(true);
    placedEyeY = vC.y;
    placedAt = clock;
    home.set(0, placedEyeY - HOME_BELOW_EYES, -HOME_AHEAD);
    if (!userMoved) {
      targetPos.copy(home);
      pivot.position.copy(home);
    }
    layoutCards();
  }

  function resetModel() {
    targetScale = 1;
    targetYaw = 0;
    targetPos.copy(home);
    userMoved = false;
  }

  function nudge(factor, turn) {
    if (factor) targetScale = THREE.MathUtils.clamp(targetScale * factor, MIN_WIDTH, MAX_WIDTH);
    if (turn) targetYaw += turn;
  }

  // ---------- loading a place ----------

  function choose(id) {
    if (!entered) return;
    if (walking) stopWalking();
    if (loaded && loaded.id === id && !pending) {
      sayFacts(loaded);   // the same place again: just hear the facts again
      return;
    }
    showPlace(id);
  }

  async function fetchPlace(id, signal) {
    const base = (ctx.dev && ctx.dev.lidarBase) || '/lidar/';
    const infoResponse = await fetch(`${base}${id}.json`, { signal });
    if (!infoResponse.ok) throw new Error(`${id}.json: HTTP ${infoResponse.status}`);
    const info = await infoResponse.json();
    const count = info && info.count;
    const okBounds = info && info.bounds && Array.isArray(info.bounds.min) && Array.isArray(info.bounds.max) &&
      info.bounds.min.length === 3 && info.bounds.max.length === 3 &&
      [...info.bounds.min, ...info.bounds.max].every(Number.isFinite);
    if (!Number.isInteger(count) || count <= 0 || count > MAX_POINTS || !(info.scale > 0) || !okBounds) {
      throw new Error(`${id}.json does not describe a point cloud`);
    }
    const dataResponse = await fetch(`${base}${id}.bin`, { signal });
    if (!dataResponse.ok) throw new Error(`${id}.bin: HTTP ${dataResponse.status}`);
    const buffer = await dataResponse.arrayBuffer();
    if (buffer.byteLength < count * 9) throw new Error(`${id}.bin is too short for ${count} points`);
    return { id, info, buffer };
  }

  function showPlace(id) {
    const place = PLACES.find((p) => p.id === id) || PLACES[0];
    currentId = place.id;
    const token = ++loadToken;
    if (abort) abort.abort();
    abort = typeof AbortController === 'function' ? new AbortController() : null;
    ctx.audio.stop();
    pending = null;
    if (titlePanel) titlePanel.setText(place.label);
    for (const button of pickButtons) {
      if (typeof button.setSelected === 'function') button.setSelected(button.userData.placeId === place.id);
    }
    setFacts(`Getting the ${place.label} ready...`);
    if (points.visible) fadeDir = -1;

    fetchPlace(place.id, abort ? abort.signal : undefined).then(
      (result) => {
        if (token !== loadToken || !entered) return;
        pending = result;       // update() swaps it in once the old cloud has faded out
      },
      (err) => {
        if (token !== loadToken || !entered || (err && err.name === 'AbortError')) return;
        console.warn(`[explore] could not load "${place.id}":`, err && err.message ? err.message : err);
        pending = { id: place.id, failed: true };
      },
    );
  }

  function freeCloud() {
    points.visible = false;
    if (namePlate) namePlate.visible = false;
    points.geometry.dispose();
    points.geometry = new THREE.BufferGeometry();
    loaded = null;
  }

  /** Mix the points once, so drawing only the first N still shows the whole place evenly. */
  function shuffle(positions, colours, count) {
    let seed = 0x9e3779b9;
    for (let i = count - 1; i > 0; i--) {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      const j = (seed >>> 0) % (i + 1);
      const a = i * 3, b = j * 3;
      let t = positions[a]; positions[a] = positions[b]; positions[b] = t;
      t = positions[a + 1]; positions[a + 1] = positions[b + 1]; positions[b + 1] = t;
      t = positions[a + 2]; positions[a + 2] = positions[b + 2]; positions[b + 2] = t;
      t = colours[a]; colours[a] = colours[b]; colours[b] = t;
      t = colours[a + 1]; colours[a + 1] = colours[b + 1]; colours[b + 1] = t;
      t = colours[a + 2]; colours[a + 2] = colours[b + 2]; colours[b + 2] = t;
    }
  }

  function swapIn(result) {
    freeCloud();
    const place = PLACES.find((p) => p.id === result.id) || PLACES[0];
    if (result.failed) {
      setFacts(`Oh no. The ${place.label} is not here right now.\nWe could not load its scan, so there is nothing to show yet.`);
      if (infoPanel) infoPanel.setText(INFO_TEXT);
      layoutCards();
      return;
    }

    const { info, buffer } = result;
    const count = info.count;
    const positions = new Int16Array(buffer, 0, count * 3);
    const colours = new Uint8Array(buffer, count * 6, count * 3);
    if (!(typeof info.order === 'string' && /^random/i.test(info.order))) shuffle(positions, colours, count);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3, false));
    geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3, true));
    // Bounds come from the file (in metres); the attribute is in int16 units.
    const min = info.bounds.min, max = info.bounds.max, k = 1 / info.scale;
    geometry.boundingBox = new THREE.Box3(new THREE.Vector3(min[0] * k, min[1] * k, min[2] * k), new THREE.Vector3(max[0] * k, max[1] * k, max[2] * k));
    geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new THREE.Sphere());
    points.geometry.dispose();
    points.geometry = geometry;

    // Fit the longer side of the place to one metre, and stand it on the base.
    const sizeX = max[0] - min[0], sizeZ = max[2] - min[2];
    const fit = 1 / Math.max(sizeX, sizeZ, 1e-6);
    footprintX = sizeX * fit;
    footprintZ = sizeZ * fit;
    points.scale.setScalar(info.scale * fit);
    points.position.set(-(min[0] + max[0]) * 0.5 * fit, -min[1] * fit + 0.0005, -(min[2] + max[2]) * 0.5 * fit);

    // Dot size: a little wider than the average gap between dots, so the ground reads as solid up close.
    const gap = Math.sqrt((footprintX * footprintZ) / count);
    const worldSize = THREE.MathUtils.clamp(gap * 1.9, 0.0012, 0.008);
    const needsDecode = info.colorSpace !== 'linear';
    if (needsDecode !== coloursAreSrgb) {
      coloursAreSrgb = needsDecode;
      material.onBeforeCompile = needsDecode ? decodeSrgb : keepColours;
      material.needsUpdate = true;
    }

    ground = buildGround(positions, count, info.scale, min, max);
    loaded_spawn = spawnPoint(info, min, max);

    const name = typeof info.name === 'string' && info.name ? info.name : place.label;
    const facts = Array.isArray(info.facts) ? info.facts.filter((f) => typeof f === 'string' && f.trim()).slice(0, 2) : [];
    loaded = { id: place.id, name, count, worldSize, facts, fit, sizeX, sizeZ, spawn: loaded_spawn };
    if (walkTitle) walkTitle.setText(name);
    budget = 1;
    slowFor = 0;
    geometry.setDrawRange(0, count);

    if (titlePanel) titlePanel.setText(name);
    if (namePlate) {
      namePlate.setText(name);
      plateSize.copy(sizeOf(namePlate));
      namePlate.visible = true;
    }
    plinthTop.material.color.set(place.slab);
    sizePlinth();
    if (infoPanel) {
      const source = typeof info.source === 'string' ? info.source.split(/\.\s/)[0].slice(0, 110) : '';
      infoPanel.setText(`${INFO_TEXT}\n${count.toLocaleString('en-US')} dots.${source ? ' Scan: ' + source + '.' : ''}`);
    }
    setFacts(facts.length ? facts.join('\n') : `This is the ${name}.`);

    material.opacity = 0;
    material.transparent = true;
    fade = 0;
    fadeDir = 1;
    points.visible = true;

    ctx.log('explore_visited', { place: name, id: place.id });
    sayFacts(loaded);
  }

  /** The guide reads the place's facts, one after the other. Stops if the child leaves or picks again. */
  async function sayFacts(place) {
    const mine = session, token = loadToken;
    ctx.audio.stop();
    for (const fact of place.facts) {
      if (mine !== session || token !== loadToken) return;
      try {
        await ctx.audio.speak(fact);
      } catch {
        return; // no voice: the facts are still on the card
      }
    }
  }

  // ---------- grips: two hands scale and turn, one hand drags ----------

  function gripOf(hand, controller) {
    if (controller && controller.grip && controller.grip.isObject3D) return controller.grip;
    if (controller && controller.isObject3D) return controller;
    const known = ctx.controllers && ctx.controllers[hand];
    return known && known.grip && known.grip.isObject3D ? known.grip : null;
  }

  function handPosition(object, out) {
    object.getWorldPosition(out);
    return root.worldToLocal(out);
  }

  function handYaw(object) {
    vD.set(0, 0, -1).applyQuaternion(object.getWorldQuaternion(qA));
    return Math.atan2(vD.x, vD.z);
  }

  function beginGrab() {
    grab.count = (held.left ? 1 : 0) + (held.right ? 1 : 0);
    grab.scale = scale;
    grab.yaw = yaw;
    grab.pos.copy(pivot.position);
    if (grab.count === 2) {
      handPosition(held.left, vA);
      handPosition(held.right, vB);
      grab.mid.addVectors(vA, vB).multiplyScalar(0.5);
      grab.dist = Math.max(0.05, vA.distanceTo(vB));
      grab.angle = Math.atan2(vB.z - vA.z, vB.x - vA.x);
    } else if (grab.count === 1) {
      const object = held.left || held.right;
      handPosition(object, grab.hand);
      grab.handYaw = handYaw(object);
    }
  }

  function wrapAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  function applyGrab() {
    if (grab.count === 2) {
      handPosition(held.left, vA);
      handPosition(held.right, vB);
      const dist = Math.max(0.05, vA.distanceTo(vB));
      const newScale = THREE.MathUtils.clamp(grab.scale * (dist / grab.dist), MIN_WIDTH, MAX_WIDTH);
      const turn = -wrapAngle(Math.atan2(vB.z - vA.z, vB.x - vA.x) - grab.angle);
      const k = newScale / grab.scale;
      // Keep the spot of the model that was between the hands between the hands.
      vC.subVectors(grab.pos, grab.mid);
      const c = Math.cos(turn), s = Math.sin(turn);
      const x = vC.x * c + vC.z * s, z = -vC.x * s + vC.z * c;
      vD.addVectors(vA, vB).multiplyScalar(0.5);
      pivot.position.set(vD.x + x * k, vD.y + vC.y * k, vD.z + z * k);
      scale = newScale;
      yaw = grab.yaw + turn;
    } else if (grab.count === 1) {
      const object = held.left || held.right;
      handPosition(object, vA);
      pivot.position.copy(grab.pos).add(vA).sub(grab.hand);
      yaw = grab.yaw + wrapAngle(handYaw(object) - grab.handYaw);
    }
    // Never let the model get lost: keep it within reach of where it started.
    vC.subVectors(pivot.position, home);
    const flat = Math.hypot(vC.x, vC.z);
    if (flat > 1.5) { vC.x *= 1.5 / flat; vC.z *= 1.5 / flat; }
    vC.y = THREE.MathUtils.clamp(vC.y, -0.7, 0.9);
    pivot.position.addVectors(home, vC);
    targetScale = scale;
    targetYaw = yaw;
    targetPos.copy(pivot.position);
    userMoved = true;
  }

  function onSqueezeStart(hand, controller) {
    if (walking) return;
    if (!entered || (hand !== 'left' && hand !== 'right')) return;
    const object = gripOf(hand, controller);
    if (!object) return;
    held[hand] = object;
    beginGrab();
    if (ctx.haptic) ctx.haptic(hand, 0.4, 30);
  }

  function onSqueezeEnd(hand) {
    if (hand !== 'left' && hand !== 'right') return;
    if (!held[hand]) return;
    held[hand] = null;
    beginGrab();
  }

  // ---------- frame ----------

  function activeProjection() {
    const xr = ctx.renderer && ctx.renderer.xr;
    if (xr && xr.isPresenting) {
      const rig = xr.getCamera();
      const eye = rig && rig.cameras && rig.cameras[0];
      if (eye) return eye.projectionMatrix.elements[5];
    }
    return ctx.camera.projectionMatrix.elements[5];
  }

  function update(dt, elapsed) {
    if (!entered) return;
    clock += dt;

    // The headset's pose can arrive a moment after the tab opens. If the eyes turn out to be somewhere else
    // and the child has not touched the model yet, put everything where it should have been.
    if (!userMoved && clock - placedAt < 1.2 && grab.count === 0) {
      ctx.viewerPosition(vA);
      group.worldToLocal(vA);
      if (Math.abs(vA.y - placedEyeY) > 0.25 || Math.hypot(vA.x - root.position.x, vA.z - root.position.z) > 0.6) {
        const keep = placedAt;
        place();
        placedAt = keep;
      }
    }

    if (walking) {
      walk(dt);
    } else if (grab.count > 0) {
      applyGrab();
    } else {
      const ease = 1 - Math.exp(-dt * 9);
      scale += (targetScale - scale) * ease;
      yaw += (targetYaw - yaw) * ease;
      pivot.position.lerp(targetPos, ease);
    }
    pivot.scale.setScalar(scale);
    pivot.rotation.y = yaw;

    // Fade between places.
    if (fadeDir < 0) {
      fade = Math.max(0, fade - dt / FADE_OUT);
      if (fade === 0) fadeDir = 0;
    } else if (fadeDir > 0) {
      fade = Math.min(1, fade + dt / FADE_IN);
      if (fade === 1) {
        fadeDir = 0;
        material.transparent = false;   // back to the cheap opaque pass
      }
    }
    if (pending && fadeDir <= 0 && (fade === 0 || !points.visible)) {
      const next = pending;
      pending = null;
      swapIn(next);
    }
    if (fadeDir < 0 && !material.transparent) material.transparent = true;
    material.opacity = fade;

    if (loaded && points.visible) {
      // In the headset, if frames start to take too long, draw fewer dots (they are in random order, so the
      // place thins evenly) and make each a little bigger to cover the gaps.
      frameAvg += (dt - frameAvg) * 0.05;
      if (ctx.isImmersive() && frameAvg > 1 / 62 && budget > 0.4) {
        slowFor += dt;
        if (slowFor > 1.5) {
          budget = Math.max(0.4, budget * 0.8);
          slowFor = 0;
          points.geometry.setDrawRange(0, Math.floor(loaded.count * budget));
        }
      } else {
        slowFor = 0;
      }
      material.size = (loaded.worldSize / Math.sqrt(budget)) * scale * activeProjection() * (walking ? 0.6 : 1);
      maxDotPx.value = walking ? 22 : 56;
    }
  }

  // ---------- walking around a place at life size ----------

  function walkHelpText() {
    if (ctx.isImmersive()) return 'Left stick: walk. Right stick: turn.';
    if (ctx.input && ctx.input.state && ctx.input.state.play && window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
      return 'Stick on the left: walk. Drag: look.';
    }
    return 'W A S D: walk. Mouse or arrows: look.';
  }

  /** Lowest dot in every 2 m cell (the ground, the water, a roof seen from above), gaps filled from neighbours. */
  function buildGround(positions, count, k, min, max) {
    const cell = GROUND_CELL;
    const nx = Math.max(1, Math.ceil((max[0] - min[0]) / cell) + 1);
    const nz = Math.max(1, Math.ceil((max[2] - min[2]) / cell) + 1);
    const cells = new Float32Array(nx * nz).fill(Infinity);
    for (let i = 0; i < count; i++) {
      const x = positions[i * 3] * k, y = positions[i * 3 + 1] * k, z = positions[i * 3 + 2] * k;
      const c = Math.floor((z - min[2]) / cell) * nx + Math.floor((x - min[0]) / cell);
      if (y < cells[c]) cells[c] = y;
    }
    // Fill empty cells (calm water, shadowed ground) from filled neighbours, a few rings at a time.
    for (let pass = 0; pass < 40; pass++) {
      let empty = 0;
      const next = cells.slice();
      for (let zi = 0; zi < nz; zi++) {
        for (let xi = 0; xi < nx; xi++) {
          const c = zi * nx + xi;
          if (cells[c] !== Infinity) continue;
          let sum = 0, n = 0;
          for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
              const x2 = xi + dx, z2 = zi + dz;
              if (x2 < 0 || z2 < 0 || x2 >= nx || z2 >= nz) continue;
              const v = cells[z2 * nx + x2];
              if (v !== Infinity) { sum += v; n++; }
            }
          }
          if (n) next[c] = sum / n; else empty++;
        }
      }
      cells.set(next);
      if (!empty) break;
    }
    for (let c = 0; c < cells.length; c++) if (cells[c] === Infinity) cells[c] = 0;
    return { cells, nx, nz, cell, minX: min[0], minZ: min[2], maxX: max[0], maxZ: max[2] };
  }

  /** Ground height in metres at (x, z) in the place's metres (bilinear between cells). */
  function groundAt(x, z) {
    if (!ground) return 0;
    const g = ground;
    const fx = THREE.MathUtils.clamp((x - g.minX) / g.cell - 0.5, 0, g.nx - 1), fz = THREE.MathUtils.clamp((z - g.minZ) / g.cell - 0.5, 0, g.nz - 1);
    const x0 = Math.floor(fx), z0 = Math.floor(fz), x1 = Math.min(x0 + 1, g.nx - 1), z1 = Math.min(z0 + 1, g.nz - 1);
    const tx = fx - x0, tz = fz - z0;
    const a = g.cells[z0 * g.nx + x0], b = g.cells[z0 * g.nx + x1], c = g.cells[z1 * g.nx + x0], d = g.cells[z1 * g.nx + x1];
    return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * tz;
  }

  /**
   * Where walking starts and what the child faces: a spot on land (above the water level) some way from the
   * landmark, south of it if possible, turned towards it. Without a landmark: the middle, facing north.
   */
  function spawnPoint(info, min, max) {
    const mark = info.statue || info.landmark;
    const size = Math.max(max[0] - min[0], max[2] - min[2]);
    const inside = (x, z) => x > min[0] + 5 && x < max[0] - 5 && z > min[2] + 5 && z < max[2] - 5;
    if (mark && typeof mark.x === 'number' && typeof mark.z === 'number') {
      for (const share of [0.3, 0.22, 0.15, 0.4]) {
        const back = THREE.MathUtils.clamp(size * share, 60, 320);
        for (let k = 0; k < 12; k++) {
          const a = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 6);   // south first, then either side
          const x = mark.x + Math.sin(a) * back, z = mark.z + Math.cos(a) * back;
          if (inside(x, z) && groundAt(x, z) > 1.5) return { x, z, lookX: mark.x, lookZ: mark.z };
        }
      }
      return { x: mark.x, z: Math.min(mark.z + 60, max[2] - 5), lookX: mark.x, lookZ: mark.z };
    }
    const cx = (min[0] + max[0]) / 2, cz = (min[2] + max[2]) / 2;
    return { x: cx, z: cz, lookX: cx, lookZ: cz - 100 };
  }

  function viewerInRoot(out) {
    ctx.viewerPosition(out);
    return root.worldToLocal(out);
  }

  function startWalking() {
    if (!entered || !loaded || walking || pending) return;
    walking = true;
    held.left = held.right = null;
    grab.count = 0;
    const life = 1 / loaded.fit;                     // pivot scale at which one metre of the place is one metre
    scale = targetScale = life;
    const sp = loaded.spawn;
    // Turn the place so the way from the spawn to the landmark points straight ahead (-Z of the root, the way
    // the child faced when the tab opened): rotating by yaw adds yaw to atan2(x, z), and ahead is atan2(0, -1).
    yaw = targetYaw = Math.PI - Math.atan2(sp.lookX - sp.x, sp.lookZ - sp.z);
    pivot.scale.setScalar(scale);
    pivot.rotation.y = yaw;
    // Put the spawn point under the viewer's feet: its place in the pivot's own space, turned and scaled.
    viewerInRoot(vA);
    const sx = (points.position.x + sp.x * loaded.fit) * scale, sz = (points.position.z + sp.z * loaded.fit) * scale;
    const c = Math.cos(yaw), s_ = Math.sin(yaw);
    pivot.position.x = vA.x - (sx * c + sz * s_);
    pivot.position.z = vA.z - (-sx * s_ + sz * c);
    walkY = groundAt(sp.x, sp.z);
    pivot.position.y = -(points.position.y + walkY * loaded.fit) * scale;
    targetPos.copy(pivot.position);
    userMoved = true;
    setColumnsVisible(false);
    placeWalkUi();
    if (walkHelp) walkHelp.setText(walkHelpText());
    walkUi.visible = true;
    ctx.ui.popIn(walkUi);
    if (ctx.input && ctx.input.state) ctx.input.state.desktopMoveEnabled = false;
    if (ctx.setEnvironment) ctx.setEnvironment(null, { ground: false });   // the place is the ground now
    ctx.log('explore_walked', { id: loaded.id, place: loaded.name });
    if (ctx.say) ctx.say(`Welcome to the ${loaded.name}! Walk around and take a look.`);
  }

  function stopWalking(quiet = false) {
    if (!walking) return;
    walking = false;
    if (walkUi) walkUi.visible = false;
    setColumnsVisible(true);
    if (ctx.input && ctx.input.state) ctx.input.state.desktopMoveEnabled = true;
    if (ctx.setEnvironment && !quiet) ctx.setEnvironment(null);
    scale = targetScale = 1;
    yaw = targetYaw = 0;
    userMoved = false;
    if (!quiet) place();
    targetPos.copy(home);
    pivot.position.copy(home);
  }

  function setColumnsVisible(on) {
    centre.visible = on; leftColumn.visible = on; rightColumn.visible = on;
    plinthSide.visible = on; plinthRim.visible = on;
    if (namePlate) namePlate.visible = on && Boolean(loaded);
  }

  /** The walking panel: low and a little to the left of where the child looks now. */
  function placeWalkUi() {
    if (!walkUi) return;
    viewerInRoot(vA);
    ctx.viewerForward(vB);
    vB.y = 0;
    if (vB.lengthSq() < 1e-4) vB.set(0, 0, -1);
    vB.normalize();
    // the forward direction in root space
    qA.copy(root.quaternion).invert();
    vB.applyQuaternion(qA);
    vC.set(-vB.z, 0, vB.x);                          // to the right
    walkUi.position.set(vA.x + vB.x * 0.85 - vC.x * 0.45, vA.y - 0.35, vA.z + vB.z * 0.85 - vC.z * 0.45);
    walkUi.rotation.set(0, Math.atan2(vA.x - walkUi.position.x, vA.z - walkUi.position.z), 0);
    stack([walkTitle, walkHelp, walkBack], 0.12, 0.02);
  }

  /** One frame of walking: read the sticks or keys, move the place under the child, keep their feet on the ground. */
  function walk(dt) {
    let mx = 0, mz = 0, turn = 0;
    const cs = ctx.controllers || {};
    if (ctx.isImmersive()) {
      const l = cs.left, r = cs.right;
      if (l && l.stick) { mx = l.stick.x || 0; mz = l.stick.y || 0; }
      const rx = r && r.stick ? r.stick.x || 0 : 0;
      if (Math.abs(rx) > 0.7 && snapReady) { turn = rx > 0 ? -SNAP_TURN : SNAP_TURN; snapReady = false; }
      if (Math.abs(rx) < 0.3) snapReady = true;
    } else {
      const st = ctx.input && ctx.input.state, desk = ctx.input && ctx.input.desk;
      const k = st ? st.keys : new Set();
      if (k.has('KeyW')) mz -= 1;
      if (k.has('KeyS')) mz += 1;
      if (k.has('KeyD')) mx += 1;
      if (k.has('KeyA')) mx -= 1;
      if (desk) {
        if (desk.joy) { mx += desk.joy.x || 0; mz += desk.joy.y || 0; }
        if (desk.pad) { mx += desk.pad.lx || 0; mz += desk.pad.ly || 0; }
      }
    }
    if (Math.abs(mx) < 0.12) mx = 0;
    if (Math.abs(mz) < 0.12) mz = 0;
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }

    viewerInRoot(vA);
    if (turn) {
      // Turn the place about the child.
      const c = Math.cos(turn), s_ = Math.sin(turn);
      const dx = pivot.position.x - vA.x, dz = pivot.position.z - vA.z;
      pivot.position.x = vA.x + dx * c + dz * s_;
      pivot.position.z = vA.z - dx * s_ + dz * c;
      yaw += turn; targetYaw = yaw;
      pivot.rotation.y = yaw;
      if (ctx.haptic) ctx.haptic('right', 0.2, 20);
    }
    if (mx || mz) {
      // Forward is where the child looks, flattened; the place slides the other way.
      ctx.viewerForward(vB);
      vB.y = 0;
      if (vB.lengthSq() < 1e-4) vB.set(0, 0, -1);
      vB.normalize();
      qA.copy(root.quaternion).invert();
      vB.applyQuaternion(qA);
      vC.set(-vB.z, 0, vB.x);
      const speed = Math.max(WALK_SPEED, Math.max(loaded.sizeX, loaded.sizeZ) / 120);
      const fx = (vB.x * -mz + vC.x * mx) * speed * dt, fz = (vB.z * -mz + vC.z * mx) * speed * dt;
      pivot.position.x -= fx;
      pivot.position.z -= fz;
    }
    // The place's metres under the child: undo the pivot (position, yaw, scale), then the points' offset.
    const px = vA.x - pivot.position.x, pz = vA.z - pivot.position.z;
    const c = Math.cos(-yaw), s_ = Math.sin(-yaw);
    let lx = (px * c + pz * s_) / scale, lz = (-px * s_ + pz * c) / scale;
    let mxM = (lx - points.position.x) / loaded.fit, mzM = (lz - points.position.z) / loaded.fit;
    // Stay inside the scanned box.
    const g = ground;
    if (g) {
      const cx = THREE.MathUtils.clamp(mxM, g.minX + 2, g.maxX - 2), cz = THREE.MathUtils.clamp(mzM, g.minZ + 2, g.maxZ - 2);
      if (cx !== mxM || cz !== mzM) {
        // push the place back so the child stays on the edge
        const ddx = (cx - mxM) * loaded.fit * scale, ddz = (cz - mzM) * loaded.fit * scale;
        const c2 = Math.cos(yaw), s2 = Math.sin(yaw);
        pivot.position.x -= ddx * c2 + ddz * s2;
        pivot.position.z -= -ddx * s2 + ddz * c2;
        mxM = cx; mzM = cz;
      }
    }
    const want = groundAt(mxM, mzM);
    walkY += (want - walkY) * (1 - Math.exp(-dt * 6));
    pivot.position.y = -(points.position.y + walkY * loaded.fit) * scale;
    targetPos.copy(pivot.position);
  }

  // ---------- enter / exit ----------

  function enter() {
    entered = true;
    const mine = ++session;
    clock = 0;
    userMoved = false;
    scale = targetScale = 1;
    yaw = targetYaw = 0;
    held.left = held.right = null;
    grab.count = 0;
    themeReady.then(() => {
      if (mine !== session || !entered) return;
      buildCards();
      if (helpPanel) helpPanel.setText(helpText());
      // Desktop preview only: tip the preview's head down towards the model, as a child would look at it.
      const desk = !ctx.isImmersive() && ctx.input && ctx.input.desk;
      if (desk && typeof desk.pitch === 'number') desk.pitch = -0.36;
      place();
      sizePlinth();
      showPlace(currentId);
    });
  }

  function exit() {
    entered = false;
    session++;
    loadToken++;
    if (abort) abort.abort();
    abort = null;
    pending = null;
    ctx.audio.stop();
    held.left = held.right = null;
    grab.count = 0;
    if (walking) stopWalking(true);
    fade = 0;
    fadeDir = 0;
    freeCloud();   // give the memory back: the points are fetched again (from the browser cache) next time
  }

  /** The shell's recentre button: bring the model and its cards back in front of the viewer. */
  function onRecenter() {
    if (!entered || !built) return;
    if (walking) { placeWalkUi(); return; }
    held.left = held.right = null;
    grab.count = 0;
    userMoved = false;
    scale = targetScale = 1;
    yaw = targetYaw = 0;
    place();
  }

  return {
    name: 'Explore',
    group,
    enter,
    exit,
    update,
    onRecenter,
    onSelectStart() {},
    onSelectEnd() {},
    onSqueezeStart,
    onSqueezeEnd,
  };
}
