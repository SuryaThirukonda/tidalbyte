// Dev only: checks the controls of Snow Circuit in the real shell, in headless Chrome.
//   1. desktop preview: the Start button is pressed with the mouse; W accelerates, D and A steer, S brakes
//   2. headset path: two pretend controllers held like a wheel (the page is told it is immersive)
//   3. options: raceview=room, rivals=0 (ghost car), nomodels=1 (stand-in shapes), lite=1 (headset valley)
//   python -m http.server 8107 --directory public
//   node public/vr/games/snowcircuit/dev/input.test.mjs [--out <folder>] [--base http://localhost:8107]

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launch, sleep } from '../../../dev/test/cdp.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf('--' + name); return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback; };
const out = option('out', 'snowcircuit-shots');
const base = option('base', 'http://localhost:8107');
mkdirSync(out, { recursive: true });

let failed = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) failed++; };
const S = 'window.__snowcircuit.state()';
const page = (q) => `${base}/vr/?mode=desktop&tab=snowcircuit&autostart=1&racelog=1&mute=1&stats=1${q ? '&' + q : ''}`;
const VK = { KeyW: 87, KeyA: 65, KeyS: 83, KeyD: 68 };

const browser = await launch({ width: 1280, height: 800 });

const get = async (expr) => JSON.parse(await browser.evaluate(`JSON.stringify(${expr})`));
const key = (type, code) => browser.send('Input.dispatchKeyEvent', { type, code, key: code.slice(3).toLowerCase(), windowsVirtualKeyCode: VK[code] });
// Pictures are read from the WebGL canvas right after a frame is drawn: a DevTools screenshot makes headless
// Chrome on this machine drop to one frame a second afterwards (in any tab), which would stall the timed checks.
const shot = async (name) => {
  const f = join(out, name + '.png');
  const data = await browser.evaluate(`new Promise((resolve) => { const r = window.wishworld.renderer; const orig = r.render;
    r.render = function (s, c) { orig.call(this, s, c); r.render = orig; resolve(r.domElement.toDataURL('image/png')); }; })`);
  writeFileSync(f, Buffer.from(data.split(',')[1], 'base64'));
  console.log('picture', f);
};
const open = async (q) => {
  await browser.goto(page(q));
  await browser.until(`(() => { const s = window.__snowcircuit && ${S}; return s && s.modelsReady && s.menu; })()`, 60000);
  await sleep(500);
};
const stats = () => get('({ calls: window.wishworld.stats.calls, triangles: window.wishworld.stats.triangles, textures: window.wishworld.stats.textures, geometries: window.wishworld.stats.geometries })');

try {
  // ---------------------------------------------------------------- 1. desktop preview, keyboard and mouse
  console.log('-- desktop preview');
  await open('');
  const start = await get(`(() => { const T = window.wishworld.ctx.THREE, g = window.__snowcircuit.game; const v = new T.Vector3(-0.21, -0.17, 0.01);
    g.hud.menu.localToWorld(v); v.project(window.wishworld.ctx.camera); return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight]; })()`);
  await browser.click(Math.round(start[0]), Math.round(start[1]));
  await sleep(300);
  let s = await get(S);
  check(s.phase === 'Countdown' && !s.menu, 'a mouse click on Start begins the countdown and takes the menu down');
  check((await get('window.wishworld.ctx.input.state.pointersEnabled')) === false, 'pointers are off while driving');
  await browser.until(`${S}.phase === 'Racing'`, 10000, 50);
  const head0 = await get('window.wishworld.ctx.viewerPosition(new window.wishworld.ctx.THREE.Vector3()).toArray()');
  await key('keyDown', 'KeyW');
  await sleep(2500);
  s = await get(S);
  check(s.speed > 5, `W accelerates (${(s.speed * 3.6).toFixed(0)} km/h after 2.5 s)`);
  const yaw0 = s.car[2];
  await key('keyDown', 'KeyD');
  await sleep(900);
  s = await get(S);
  const wheelZ = await get('window.__snowcircuit.game.scene.wheel.rotation.z');
  check(s.steer > 0.5 && s.car[2] > yaw0 + 3, `D steers right (steer ${s.steer.toFixed(2)}, heading ${yaw0.toFixed(1)} -> ${s.car[2].toFixed(1)} degrees)`);
  check(wheelZ < -0.5, `the wheel turns clockwise for the driver (${(wheelZ * 180 / Math.PI).toFixed(0)} degrees about its axis)`);
  await shot('desktop-steer-right');
  await key('keyUp', 'KeyD');
  await key('keyDown', 'KeyA');
  await sleep(1200);
  s = await get(S);
  const yaw1 = s.car[2];
  check(s.steer < -0.5, `A steers left (steer ${s.steer.toFixed(2)})`);
  await key('keyUp', 'KeyA');
  await key('keyUp', 'KeyW');
  const v0 = s.speed;
  await key('keyDown', 'KeyS');
  await sleep(600);
  s = await get(S);
  check(s.speed < v0 - 3 || s.speed === 0, `S brakes (${(v0 * 3.6).toFixed(0)} -> ${(s.speed * 3.6).toFixed(0)} km/h in 0.6 s)`);
  await key('keyUp', 'KeyS');
  const head1 = await get('window.wishworld.ctx.viewerPosition(new window.wishworld.ctx.THREE.Vector3()).toArray()');
  check(Math.hypot(head1[0] - head0[0], head1[1] - head0[1], head1[2] - head0[2]) < 1e-6, 'W A S D do not walk the head about while this tab is open');
  const seatEye = await get(`(() => { const T = window.wishworld.ctx.THREE; const v = window.wishworld.ctx.viewerPosition(new T.Vector3()); window.__snowcircuit.game.scene.seat.worldToLocal(v); return v.toArray(); })()`);
  check(Math.abs(seatEye[0]) < 1e-6 && Math.abs(seatEye[1] - 1.05) < 1e-6 && Math.abs(seatEye[2]) < 1e-6, `the head is 1.05 m above the car's origin (${seatEye.map((v) => v.toFixed(3)).join(', ')})`);
  void yaw1;

  // ---------------------------------------------------------------- 2. the headset path, with pretend controllers
  console.log('-- headset path (pretend controllers)');
  await browser.evaluate(`(() => {
    const w = window.wishworld, T = w.ctx.THREE, g = window.__snowcircuit.game;
    const make = () => { const o = new T.Object3D(); w.ctx.scene.add(o); return { grip: o, ray: o, tracked: true, connected: true, trigger: 0, stick: { x: 0, y: 0 }, gamepad: null }; };
    const fake = { left: make(), right: make() };
    window.__fake = { fake, real: w.ctx.controllers, immersive: w.ctx.isImmersive, haptics: [] };
    w.ctx.controllers = fake;
    w.ctx.isImmersive = () => true;
    const realHaptic = w.ctx.haptic; window.__fake.haptic = realHaptic;
    w.ctx.haptic = (hand, strength, ms) => { window.__fake.haptics.push([hand, strength, ms]); };
    // hands on the wheel, in the car's frame: x to the right, y up, -z ahead
    window.__hands = (lx, ly, rx, ry) => {
      const seat = window.__snowcircuit.game.scene.seat;
      fake.left.grip.position.copy(seat.localToWorld(new T.Vector3(lx, ly, -0.42)));
      fake.right.grip.position.copy(seat.localToWorld(new T.Vector3(rx, ry, -0.42)));
      fake.left.grip.updateMatrixWorld(true); fake.right.grip.updateMatrixWorld(true);
    };
    window.__hands(-0.17, 0.95, 0.17, 0.95);
    return true; })()`);
  await browser.evaluate('window.__fake.fake.right.trigger = 1; true');
  await sleep(1500);
  s = await get(S);
  check(s.speed > 3 && Math.abs(s.steer) < 0.01, `right trigger accelerates, level hands steer straight (${(s.speed * 3.6).toFixed(0)} km/h, steer ${s.steer.toFixed(2)})`);
  let yaw = s.car[2];
  await browser.evaluate('window.__hands(-0.17, 1.0, 0.17, 0.9); true');       // right hand 10 cm lower: atan(0.1 / 0.34) = 16.4 degrees
  await sleep(800);
  s = await get(S);
  check(Math.abs(s.steer - 16.39 / 45) < 0.02 && s.car[2] > yaw, `right hand lower turns right: 16.4 degrees of tilt gives steer ${s.steer.toFixed(3)} (expected ${(16.39 / 45).toFixed(3)})`);
  await browser.evaluate('window.__hands(-0.17, 0.78, 0.17, 1.12); true');      // 45 degrees the other way
  await sleep(800);
  s = await get(S);
  yaw = s.car[2];
  check(Math.abs(s.steer + 1) < 0.02, `45 degrees of tilt is full lock left (steer ${s.steer.toFixed(3)})`);
  await browser.evaluate('window.__hands(-0.17, 0.95, 0.17, 0.955); true');     // under 3 degrees: the dead zone
  await sleep(500);
  s = await get(S);
  check(Math.abs(s.steer) < 0.01, 'a tilt under 3 degrees is ignored');
  await browser.evaluate('window.__hands(-0.02, 0.95, 0.02, 0.6); window.__fake.fake.right.stick.x = 1; true');   // hands 4 cm apart: thumbstick instead
  await sleep(500);
  s = await get(S);
  check(Math.abs(s.steer - 1) < 0.02, 'hands not held like a wheel: the right thumbstick steers');
  await browser.evaluate('window.__fake.fake.right.stick.x = 0; window.__fake.fake.right.trigger = 0; window.__fake.fake.left.trigger = 1; window.__hands(-0.17, 0.95, 0.17, 0.95); true');
  await sleep(700);
  s = await get(S);
  check(s.speed < 1, `left trigger brakes (${(s.speed * 3.6).toFixed(0)} km/h)`);
  await browser.evaluate(`(() => { const w = window.wishworld; w.ctx.controllers = window.__fake.real; w.ctx.isImmersive = window.__fake.immersive; w.ctx.haptic = window.__fake.haptic; return true; })()`);

  // ---------------------------------------------------------------- 3. options
  console.log('-- raceview=room (grey backdrop on a desktop), 5 rivals');
  await open('raceview=room&rivals=5');
  s = await get(S);
  let st = await stats();
  check(s.view === 'backdrop' && s.racers === 6 && s.loaded.surroundings === false, `no valley, 5 rivals (${st.calls} draws, ${st.triangles} triangles)`);
  check((await get('window.wishworld.ctx.scene.fog')) === null, 'fog is off in the room view');
  await shot('option-room');

  console.log('-- rivals=0: the ghost car');
  await open('rivals=0&autodrive=1&speed=6');
  await browser.until(`${S}.lap >= 2`, 120000, 200);
  await sleep(1500);
  s = await get(S);
  const ghost = await get('(() => { const g = window.__snowcircuit.game; return { visible: g.scene.ghost.visible, children: g.scene.ghost.children.length, active: g.sim.ghost.active }; })()');
  check(s.racers === 1 && s.dash[0] === 'Lap 2/3' && ghost.visible && ghost.children === 1, `no rivals: dashboard reads "${s.dash[0]}", the ghost of the best lap is on the road`);
  await shot('option-ghost');

  console.log('-- nomodels=1: stand-in shapes only');
  await open('nomodels=1');
  s = await get(S);
  st = await stats();
  check(!s.loaded.cockpit && !s.loaded.track && s.loaded.rivals === 0 && s.menu, `runs with no model files (${st.calls} draws, ${st.triangles} triangles)`);
  await shot('option-nomodels');

  console.log('-- lite=1: the valley as the headset loads it');
  await open('lite=1');
  st = await stats();
  console.log('     at the menu: ' + JSON.stringify(st));
  await shot('option-lite-menu');
  await browser.evaluate('window.__snowcircuit.game.sim.startRace(); true');
  await browser.until(`${S}.phase === 'Racing'`, 10000, 50);
  await key('keyDown', 'KeyW');
  await sleep(4000);
  st = await stats();
  console.log('     racing: ' + JSON.stringify(st));
  check(st.triangles < 70000 && st.calls <= 20, `headset load while racing: ${st.calls} draw calls, ${st.triangles} triangles`);
  await key('keyUp', 'KeyW');
  await shot('option-lite-racing');
} catch (err) {
  failed++;
  console.error('FAILED:', err.message);
  try { await shot('input-failed'); } catch { /* the page is gone */ }
} finally {
  for (const line of browser.lines) if (line.level === 'error' || line.level === 'warn') console.log(`[${line.level}] ${line.text}`);
  console.log(`${browser.errors().length} errors, ${browser.warnings().length} warnings`);
  if (browser.errors().length) failed++;
  await browser.close();
}
console.log(failed ? `${failed} check(s) FAILED` : 'all checks passed');
process.exit(failed ? 1 : 0);
