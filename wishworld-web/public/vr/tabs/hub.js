// The snow hub: Unity's Hub scene (Editor/Builder.Hub.cs, Scripts/Hub/HubController.cs, PenguinGuide.cs).
// The start screen and the way to every other tab.
//
// In VR and the desktop preview it is the place itself: the snowy plain with its hills, pines, lanterns,
// the winter camp and the reindeer, drifting clouds, falling snow, the penguin guide who waves when she
// speaks, the "WishWorld" banner and the cards. In AR it is only the banner and the cards, floating in the
// real room.
//
// Unity's four cards map onto the web tabs: Games opens the games menu (Frost Slice, Snow Hoops, Snow Circuit); Worlds
// opens the worlds tab; AR Worlds and Wish both open the reef (the fish in your room; Wish goes straight
// to the spoken wish). Explore, Calm and Mailbox are new cards in the same style.

import * as THREE from 'three';
import { MeshBuilder, loadGLB, loadManifest } from '/shared/models.js';
import { createSnowfall, createShadowPool } from '/vr/core/fx.js';
import { colors } from '/vr/core/theme.js';

export const meta = { id: 'hub', label: 'Hub', order: 0 };

const MENU_DISTANCE = 1.8;       // HubController.MenuDistance
const MENU_HEIGHT = 1.52;        // a little above Unity's 1.38, so the guide's caption fits under the bottom row
const DEG = Math.PI / 180;

const WELCOME = 'Welcome to WishWorld! Pick a card to begin.';
const GAMES_LINE = 'Games. Slice fruit, or race a car.';

// Unity's PenguinGuide when the export is missing (Builder.Core.cs BuildPenguin), in the export's own axes.
function buildPenguin() {
  const { navy, white, peach, black } = colors;
  const root = new THREE.Group();
  const body = new MeshBuilder()
    .taperBox([0, 0.34, 0], [0.48, 0.62, 0.42], navy, null, 0.78, 0.8)
    .taperBox([0, 0.32, 0.09], [0.34, 0.5, 0.28], white, null, 0.75, 0.8)
    .taperBox([0, 0.80, 0], [0.38, 0.30, 0.36], navy, null, 0.84, 0.84)
    .cube([0, 0.78, 0.15], [0.27, 0.18, 0.08], white)
    .taperBox([0, 0.75, 0.26], [0.11, 0.15, 0.075], peach, [90, 0, 0], 0.3, 0.4)
    .cube([-0.075, 0.835, 0.19], [0.045, 0.045, 0.045], black)
    .cube([0.075, 0.835, 0.19], [0.045, 0.045, 0.045], black)
    .taperBox([0, 0.655, 0.01], [0.43, 0.08, 0.41], peach, null, 0.92, 0.92)
    .taperBox([0.13, 0.56, 0.2], [0.08, 0.2, 0.04], peach, [0, 0, -10], 0.8, 1)
    .taperBox([0, 0.98, 0], [0.2, 0.07, 0.2], peach, null, 0.5, 0.5)
    .cube([0, 1.03, 0], [0.06, 0.06, 0.06], white)
    .cube([-0.11, 0.025, 0.09], [0.16, 0.05, 0.24], peach)
    .cube([0.11, 0.025, 0.09], [0.16, 0.05, 0.24], peach)
    .mesh({ mirror: 'x' });
  body.name = 'Body';
  const wingGeometry = new MeshBuilder().taperBox([0, -0.18, 0], [0.07, 0.38, 0.2], navy, [180, 0, 0], 0.6, 0.5).build({ mirror: 'x' });
  const left = new THREE.Mesh(wingGeometry, body.material); left.name = 'LeftWing';
  left.position.set(0.25, 0.6, 0); left.rotation.z = 14 * DEG;
  const right = new THREE.Mesh(wingGeometry, body.material); right.name = 'RightWing';
  right.position.set(-0.25, 0.6, 0); right.rotation.z = -14 * DEG;
  root.add(body, left, right);
  return root;
}

// The scenery when scene_hub.glb is missing: the same plain, hills, mounds, pines and lanterns from
// primitives in the right colours (Builder.Hub.cs), written in Unity coordinates.
function buildFallbackScenery() {
  let seed = 11;
  const R = (a, b) => { seed = (seed * 16807) % 2147483647; return a + (seed / 2147483647) * (b - a); };
  const { snow, snowShade, shadowSnow } = colors;
  const b = new MeshBuilder();
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2 + R(-0.1, 0.1), d = R(24, 34);
    b.sphere([Math.cos(a) * d, -1.2, Math.sin(a) * d], [R(14, 22), R(7, 12), R(14, 22)], i % 2 === 0 ? snow : snowShade, null, 12);
  }
  for (let i = 0; i < 9; i++) {
    const a = R(0, Math.PI * 2), d = R(6, 13);
    b.sphere([Math.cos(a) * d, -0.25, Math.sin(a) * d], [R(1.5, 3), R(0.7, 1.1), R(1.5, 3)], snowShade);
  }
  const trunk = [0.42, 0.33, 0.28], green = [0.30, 0.50, 0.47];
  const pine = (p, h) => {
    b.cylinder([p[0], h * 0.1, p[2]], [h * 0.08, h * 0.2, h * 0.08], trunk);
    for (let i = 0; i < 3; i++) {
      const y = h * (0.3 + i * 0.22), w = h * (0.5 - i * 0.12);
      b.cone([p[0], y, p[2]], [w, h * 0.36, w], green);
      b.cone([p[0], y + h * 0.1, p[2]], [w * 0.62, h * 0.2, w * 0.62], snow);
    }
    b.disc([p[0] + 0.12 * h * 0.36, 0.012, p[2] - 0.1 * h * 0.36], [h * 0.72, h * 0.61], shadowSnow, null, 14);
  };
  for (const [a, d, h] of [[0.9, 9, 3.2], [1.25, 12, 4], [2.2, 8, 2.6], [2.5, 13, 3.6], [0.2, 14, 3.8], [-0.5, 10, 3], [-1.2, 15, 4.2],
    [3.6, 11, 3.4], [4.3, 9, 2.8], [1.75, 16, 4.4], [0.55, 6.5, 2.4], [2.75, 6.8, 2.6]]) pine([Math.cos(a) * d, 0, Math.sin(a) * d], h);
  // Two lamp posts either side of the menu.
  for (const x of [-1.75, 1.75]) {
    b.cylinder([x, 0.5, 2.7], [0.07, 1.0, 0.07], colors.slate);
    b.taperBox([x, 1.1, 2.7], [0.24, 0.26, 0.24], [1.0, 0.86, 0.5], null, 0.8, 0.8);
    b.cone([x, 1.3, 2.7], [0.3, 0.14, 0.3], colors.slate);
    b.disc([x + 0.024, 0.012, 2.68], [0.4, 0.34], shadowSnow, null, 14);
  }
  // Rounded clouds.
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2, d = R(28, 46), y = R(11, 19), puffs = 3 + Math.floor(R(0, 3));
    for (let k = 0; k < puffs; k++) {
      const along = (k - puffs * 0.5) * 2.6;
      b.sphere([Math.cos(a) * d - Math.sin(a) * along, y + R(-0.4, 0.6), Math.sin(a) * d + Math.cos(a) * along], [R(3.5, 5.5), R(1.8, 2.6), R(2.6, 3.6)], colors.white);
    }
  }
  const mesh = b.mesh({ mirror: 'z' });
  mesh.name = 'HubSceneryFallback';
  return mesh;
}

export function createTab(ctx) {
  const { ui, guide, rig } = ctx;
  const group = new THREE.Group();
  group.name = 'Hub';

  // ---- the menu: banner and cards on an arc around the player -------------------------------------------
  const anchor = new THREE.Group();            // the player's spot and heading (the origin in VR; where they stand in AR)
  anchor.name = 'HubAnchor';
  group.add(anchor);

  function menuRoot(name) {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(0, MENU_HEIGHT, -MENU_DISTANCE);
    anchor.add(g);
    return g;
  }
  // Place something on the circle around the player so it faces them at the same distance as its neighbours.
  function onArc(object, degrees, y = 0) {
    const a = degrees * DEG;
    object.position.set(Math.sin(a) * MENU_DISTANCE, y, (1 - Math.cos(a)) * MENU_DISTANCE);
    object.rotation.y = -a;
    return object;
  }
  const has = (id) => (typeof ctx.hasTab === 'function' ? ctx.hasTab(id) : true);
  const go = (id, handoff) => () => { ctx.handoff = handoff || null; ctx.switchTab(id); };

  const main = menuRoot('MainMenu');
  const banner = ui.makeRibbon('WishWorld', { width: 0.95, height: 0.18, textHeight: 0.125 });
  banner.position.set(0, 0.39, 0);
  main.add(banner);
  ui.popIn(banner, { bob: 0.01, bobSpeed: 0.9 });

  const cards = [];
  function card(parent, title, subtitle, action, options = {}) {
    const c = ui.makeCard(title, subtitle, action, options);
    parent.add(c);
    cards.push(c);
    return c;
  }
  // Unity's four, exactly where Unity puts them.
  onArc(card(main, 'Games', 'Slice fruit, race cars', () => show('games')), -22.5);
  const worldsCard = onArc(card(main, 'Worlds', 'Visit far places', go('worlds')), -7.5);
  onArc(card(main, 'AR Worlds', 'Bring them to you', go('reef')), 7.5);
  onArc(card(main, 'Wish', 'Say what you wish for', go('reef', { wish: true }), { fill: colors.peach }), 22.5);
  // The web's own, in a second row.
  const exploreCard = onArc(card(main, 'Explore', 'Real places in 3D', go('explore')), -15, -0.43);
  const calmCard = onArc(card(main, 'Calm', 'Slow, deep breaths', go('calm')), 0, -0.43);
  const mailCard = onArc(card(main, 'Mailbox', 'Letters for you', go('mailbox')), 15, -0.43);

  const games = menuRoot('GamesMenu');
  const gamesBanner = ui.makeRibbon('Games', { width: 0.6, height: 0.14, textHeight: 0.09 });
  gamesBanner.position.set(0, 0.36, 0);
  games.add(gamesBanner);
  ui.popIn(gamesBanner, { bob: 0.006, bobSpeed: 0.9 });
  const frostCard = card(games, 'Frost Slice', 'Slice the flying fruit', go('frostslice'), { width: 0.42 });
  frostCard.position.set(-0.69, 0, 0);
  const hoopsCard = card(games, 'Snow Hoops', 'Shoot your toy!', go('hoops'), { width: 0.42 });
  hoopsCard.position.set(-0.23, 0, 0);
  const snowCard = card(games, 'Snow Circuit', 'Race a snowy track', go('snowcircuit'), { width: 0.42 });
  snowCard.position.set(0.23, 0, 0);
  const rocketCard = card(games, 'Bottle Rocket', 'Fly your own rocket', go('rocket'), { width: 0.42 });
  rocketCard.position.set(0.69, 0, 0);
  const back = ui.makeButton('Back', () => show('main'), { width: 0.3, height: 0.11, textHeight: 0.045 });
  back.position.set(0, -0.3, 0);
  games.add(back);

  let openMenu = 'main';
  function show(menu) {
    if (menu !== openMenu && menu === 'games') ctx.audio.speak(GAMES_LINE);
    openMenu = menu;
    main.visible = menu === 'main';
    games.visible = menu === 'games';
  }

  function refreshCards() {
    worldsCard.setEnabled(has('worlds'));
    exploreCard.setEnabled(has('explore'));
    calmCard.setEnabled(has('calm'));
    mailCard.setEnabled(has('mailbox'));
    frostCard.setEnabled(has('frostslice'));
    hoopsCard.setEnabled(has('hoops'));
    snowCard.setEnabled(has('snowcircuit'));
    rocketCard.setEnabled(has('rocket'));
    const waiting = ctx.gifts ? ctx.gifts.waitingLetters() : 0;
    mailCard.setSubtitle(waiting === 1 ? 'One new letter!' : waiting > 1 ? `${waiting} new letters!` : 'Letters for you');
  }

  // ---- the place (VR and desktop only) -------------------------------------------------------------------------
  const place = new THREE.Group();
  place.name = 'HubPlace';
  group.add(place);

  const exported = new THREE.Group();          // .glb files: Unity x mirrored, +Z forward; half a turn puts them in our frame
  exported.name = 'HubExported';
  exported.rotation.y = Math.PI;
  place.add(exported);

  const snow = createSnowfall();
  snow.position.set(0, 4.5, -2);
  place.add(snow);

  const shadows = createShadowPool(2);
  place.add(shadows.mesh);

  // The penguin guide, at Unity (-1.3, 0, 2.15).
  const penguin = new THREE.Group();
  penguin.name = 'PenguinGuide';
  penguin.position.set(-1.3, 0, -2.15);
  place.add(penguin);
  let wings = null;                            // { left, right, leftRest, rightRest }
  let waveUntil = 0, penguinYaw = Math.atan2(1.3, 2.15), clock = 0;
  const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();
  const Z = new THREE.Vector3(0, 0, 1);
  const _head = new THREE.Vector3(), _fwd = new THREE.Vector3();

  function adoptPenguin(model) {
    while (penguin.children.length) penguin.remove(penguin.children[0]);
    penguin.add(model);
    const left = model.getObjectByName('LeftWing'), right = model.getObjectByName('RightWing');
    wings = left && right ? { left, right, leftRest: left.quaternion.clone(), rightRest: right.quaternion.clone() } : null;
  }
  adoptPenguin(buildPenguin());

  const clouds = [];                           // { pivot, rate } drifting around the scene centre
  let sceneryState = 'none';                   // 'none' | 'loading' | 'exported' | 'fallback'

  async function loadPlace() {
    if (sceneryState !== 'none') return;
    sceneryState = 'loading';
    const manifest = await loadManifest();
    // The guide.
    if (manifest.has('penguin_guide')) {
      try { adoptPenguin(await loadGLB('/models/' + manifest.get('penguin_guide').file)); } catch (err) { console.warn('[wishworld] hub: keeping the built-in penguin.', err && err.message); }
    }
    // The terrain, camp and clouds: the lighter cut on a headset, the full one on a desktop.
    const wantLite = typeof ctx.preferLite === 'function' ? ctx.preferLite() : ctx.isImmersive();
    const entry = (wantLite && manifest.get('scene_hub_lite')) || manifest.get('scene_hub') || manifest.get('scene_hub_lite');
    if (entry) {
      try {
        const model = await loadGLB('/models/' + entry.file);
        let rates = null;
        try {
          const layouts = await (await fetch('/models/layouts.json')).json();
          rates = new Map();
          for (const o of layouts.scenes.Hub.objects) if (o.degreesPerSecond !== undefined) rates.set(o.name, o.degreesPerSecond);
        } catch { rates = null; }
        const found = [];
        model.traverse((o) => { if (/^Cloud\d+$/.test(o.name)) found.push(o); });
        found.forEach((cloud, i) => {
          // Scripts/Hub/Drift.cs: each cloud slowly circles the scene centre at its own speed.
          const pivot = new THREE.Group();
          pivot.name = cloud.name + 'Drift';
          cloud.parent.add(pivot);
          pivot.add(cloud);
          const rate = rates && rates.has(cloud.name) ? rates.get(cloud.name) : -(0.6 + ((i * 37) % 9) / 10);
          clouds.push({ pivot, rate: rate * DEG });
        });
        exported.add(model);
        sceneryState = 'exported';
        if (active) applyEnvironment();
        return;
      } catch (err) {
        console.warn('[wishworld] hub: the exported scene is not available, building it from shapes.', err && err.message);
      }
    }
    // No export: the same place from primitives, plus whichever camp props were exported on their own.
    place.add(buildFallbackScenery());
    const props = [['reindeer', -3.4, 3.6, 1, 166.6], ['snowman', 2.45, 2.9, 1, -139.8], ['tree_decorated', 3.3, 4.4, 1.2, -143.1],
      ['sled', 2.5, 1.3, 1, -47.5], ['bench', -2.7, 0.9, 1, 108.4], ['present_a', 2.15, 1.75, 1, -109.1], ['present_b', 2.6, 2.05, 1, -158.3]];
    for (const [id, x, z, scale, yaw] of props) {
      if (!manifest.has(id)) continue;
      loadGLB('/models/' + manifest.get(id).file).then((m) => {
        m.position.set(-x, 0, z); m.rotation.y = -yaw * DEG; m.scale.setScalar(scale);   // Unity values in the export's axes
        exported.add(m);
      }).catch(() => {});
    }
    sceneryState = 'fallback';
    if (active) applyEnvironment();
  }

  function applyEnvironment() {
    // The exported terrain is its own ground; until it arrives (or without it) the plain snow disc stands in.
    ctx.setEnvironment('hub', { ground: sceneryState !== 'exported' });
  }

  function placeForAR() {
    // In the real room the menu hangs in front of wherever the child is standing and looking.
    rig.viewerPosition(_head);
    rig.viewerForwardFlat(_fwd);
    anchor.position.set(_head.x, rig.floorY(), _head.z);
    anchor.rotation.y = Math.atan2(-_fwd.x, -_fwd.z);
  }

  let active = false, arPlaced = false, unsubscribe = null;
  // Wave again whenever the guide starts a new line (PenguinGuide.cs).
  if (guide && guide.onLine) guide.onLine(() => { waveUntil = clock + 3; });

  return {
    name: 'Hub',
    group,

    enter() {
      active = true;
      const ar = ctx.isAR();
      place.visible = !ar;
      anchor.position.set(0, 0, 0); anchor.rotation.set(0, 0, 0);
      arPlaced = false;
      if (!ar) { applyEnvironment(); loadPlace(); }
      show('main');
      refreshCards();
      if (ctx.gifts) unsubscribe = ctx.gifts.subscribe(() => refreshCards(), { replay: false });
      waveUntil = clock + 3;
      guide.say(WELCOME);
    },

    exit() {
      active = false;
      if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    },

    /** The Y button (R on a keyboard): in AR, bring the menu back in front of the viewer. */
    onRecenter() { if (ctx.isAR()) placeForAR(); },

    update(dt, elapsed) {
      clock = elapsed;
      if (ctx.isAR()) {
        // Wait for the first tracked frame before choosing where the menu hangs.
        if (!arPlaced) { rig.viewerPosition(_head); if (_head.lengthSq() > 1e-6) { placeForAR(); arPlaced = true; } }
        return;
      }
      snow.update(elapsed);
      for (const c of clouds) c.pivot.rotation.y += c.rate * dt;

      // The guide turns to face the player, bobs, and waves whenever she starts a new line.
      rig.viewerPosition(_head);
      const dx = _head.x - penguin.position.x, dz = _head.z - penguin.position.z;
      if (dx * dx + dz * dz > 0.01) {
        const want = Math.atan2(dx, dz);
        let d = want - penguinYaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        penguinYaw += d * Math.min(1, dt * 2);
        penguin.rotation.y = penguinYaw;
      }
      penguin.position.y = Math.abs(Math.sin(elapsed * 2.2)) * 0.015;
      if (wings) {
        const waving = elapsed < waveUntil;
        // Unity raises the right wing 105 degrees about Z and shakes it; the export mirrors X, which turns that the other way.
        _qa.copy(wings.rightRest);
        if (waving) _qa.multiply(_qb.setFromAxisAngle(Z, -(105 + Math.sin(elapsed * 9) * 22) * DEG));
        wings.right.quaternion.slerp(_qa, Math.min(1, dt * 10));
        _qa.copy(wings.leftRest).multiply(_qb.setFromAxisAngle(Z, Math.sin(elapsed * 2.2) * 5 * DEG));
        wings.left.quaternion.slerp(_qa, Math.min(1, dt * 6));
      }
      shadows.place(0, penguin.position, 0.3, 0, 2);
      shadows.commit();
    },

    onSelectStart() {}, onSelectEnd() {}, onSqueezeStart() {}, onSqueezeEnd() {},
  };
}
