// Dev check for the Frost Slice tab: opens it in a headless browser, plays it, takes pictures and prints the
// page's console. Needs the site served locally (python -m http.server 8106 --directory public).
//
//   node check.mjs <scenario> <out-dir> [--base http://localhost:8106] [--shell] [--ar 1] [--standins 1] [--plainui 1]
//
// Scenarios:
//   menu      the start card; presses Start with a real mouse click, then swings the mouse blade through fruit
//   autoplay  ?autoplay=1 with a short round: slicing, scoring, combos, "Time!" and the end card
//   ice       ?autoplay=ice with ice blocks thrown on purpose: "Ouch!", lives, "Out of lives"
//   again     leaves the tab and comes back (cleanup), then plays a second round
// --shell runs the scenario in the real shell (/vr/?mode=desktop&autostart=1) instead of the dev harness.
// Set BROWSER to another Chromium (for example Edge) if Chrome will not start headless on this machine.

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launch, sleep } from '../../../dev/test/cdp.mjs';

const args = process.argv.slice(2);
const scenario = args[0] || 'menu';
const out = args[1] || '.';
const option = (name, fallback) => { const i = args.indexOf('--' + name); return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback; };
const shell = args.includes('--shell');
const base = option('base', 'http://localhost:8106');
const W = 1280, H = 800;
mkdirSync(out, { recursive: true });

const more = (option('standins', '') === '1' ? '&standins=1' : '') + (option('plainui', '') === '1' ? '&plainui=1' : '');
const extra = { menu: '', autoplay: '&autoplay=1&round=16', ice: '&autoplay=ice&round=600', again: '&autoplay=1&round=8' }[scenario] + more;
if (!['menu', 'autoplay', 'ice', 'again'].includes(scenario)) { console.error('unknown scenario ' + scenario); process.exit(2); }
const url = shell
  ? `${base}/vr/?mode=desktop&tab=frostslice&autostart=1&mute=1&stats=1${option('ar', '') === '1' ? '&ar=1' : ''}${extra}`
  : `${base}/vr/dev/harness.html?tab=frostslice&hud=0&cam=0,1.6,0&look=0,1.52,-2${option('ar', '') === '1' ? '&ar=1' : ''}${extra}`;

const PAGE = '(window.__harness ? window.__harness.ctx : window.wishworld.ctx)';
const TAB = "(window.__harness ? window.__harness.tab : window.wishworld.tabs.get('frostslice').tab)";

// A headless window can be judged "hidden" a few seconds in, which stops its frames: keep it awake.
const AWAKE = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling',
  '--disable-features=CalculateNativeWinOcclusion'];
const browser = await launch({ width: W, height: H, flags: AWAKE });
try { await browser.send('Emulation.setFocusEmulationEnabled', { enabled: true }); } catch { /* older browsers */ }
const tag = (shell ? 'shell-' : 'harness-') + scenario + (option('ar', '') === '1' ? '-ar' : '') + (more ? more.replace(/[&=1]/g, '').replace(/^/, '-') : '');
let shots = 0;
const shot = async (name) => { const f = join(out, `${tag}-${String(++shots).padStart(2, '0')}-${name}.png`); await browser.screenshot(f); console.log('  saved ' + f); };
const state = () => browser.evaluate('window.__frostslice ? JSON.stringify(window.__frostslice.state()) : null').then((s) => (s ? JSON.parse(s) : null));
const phase = (p, ms = 60000) => browser.until(`window.__frostslice && window.__frostslice.state().phase === '${p}'`, ms, 100);
// Where a stage-frame point lands on the screen, through the page's own camera.
const project = (x, y, z) => browser.evaluate(`(() => {
  const ctx = ${PAGE}, stage = ${TAB}.group.children[0];
  stage.updateWorldMatrix(true, false); ctx.camera.updateMatrixWorld();
  const v = new ctx.THREE.Vector3(${x}, ${y}, ${z}).applyMatrix4(stage.matrixWorld).project(ctx.camera);
  return [Math.round((v.x * 0.5 + 0.5) * innerWidth), Math.round((-v.y * 0.5 + 0.5) * innerHeight)];
})()`);
const fruitInAir = () => browser.evaluate(`(() => {
  const f = ${TAB}.group.children[0].children.find((o) => o.name === 'Fruit' && o.visible);
  return f ? [f.position.x, f.position.y, f.position.z] : null;
})()`);
const info = () => browser.evaluate(`(() => { const r = ${PAGE}.renderer.info; return { calls: r.render.calls, triangles: r.render.triangles, geometries: r.memory.geometries, textures: r.memory.textures }; })()`);

let failed = false;
const expect = (ok, what) => { console.log((ok ? '  ok   ' : '  FAIL ') + what); if (!ok) failed = true; };

try {
  await browser.goto(url);
  console.log(`${tag}: ${url}`);
  // Headless Chromium drops a page whose picture is not changing to one frame a second, which slows the game's
  // clock ten-fold. A dot that flickers every frame keeps it at full speed. (Test only: nothing in the game.)
  await browser.until('document.body', 15000);
  await browser.evaluate(`(() => { const d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;z-index:99999;pointer-events:none';
    document.body.appendChild(d); let n = 0; const t = () => { d.style.background = (n++ & 1) ? '#b8cce0' : '#b9cde1'; requestAnimationFrame(t); }; t(); })()`);
  await phase(scenario === 'menu' ? 'ready' : 'playing');

  if (scenario === 'menu') {
    await sleep(1500);
    await shot('menu');
    let s = await state();
    expect(s.menu && !s.hud && s.blades.every((b) => !b), 'the menu is up; the score panel and the blades are hidden');
    expect(Boolean(s.spoken[0]) && s.spoken[0].startsWith('Frost Slice. Swing'), 'the intro is read: ' + JSON.stringify(s.spoken));
    expect(option('standins', '') === '1' ? s.standIns.length === 15 : s.standIns.length === 0, 'models: ' + (s.standIns.length ? s.standIns.length + ' stand-ins' : 'every one is the Unity export'));
    console.log('  panels: ' + s.panels + '; menu draw: ' + JSON.stringify(await info()));
    // Start is 0.2 m to the left of the card's centre and 0.17 m below it. (Stage +X is the player's left.)
    const [bx, by] = await project(0.2, 1.4 - 0.17, 1.35);
    await browser.mouse('mouseMoved', bx, by);
    await sleep(700);
    await shot('start-hover');
    await browser.click(bx, by);
    await phase('playing', 5000);
    expect(true, 'a mouse click on Start began the round');
    await browser.evaluate('window.__frostslice.noWaves = true; window.__frostslice.setTimeLeft(3000)');   // a slow machine must not run out of round
    await sleep(900);
    await shot('round-begins');
    // Throw one fruit and swing the mouse-driven blade through it near its peak.
    for (let attempt = 0; attempt < 6; attempt++) {
      const before = (await state()).sliced;
      await browser.evaluate('window.__frostslice.launch(false)');
      await sleep(1000);
      const p = await fruitInAir();
      if (!p) continue;
      const [fx, fy] = await project(p[0], p[1], p[2]);
      for (let k = -6; k <= 6; k++) { await browser.mouse('mouseMoved', fx + k * 45, fy + 6); await sleep(16); }
      await sleep(250);
      if (attempt === 0) await shot('mouse-swing');
      const after = (await state()).sliced;
      console.log(`  swing ${attempt + 1}: sliced ${before} -> ${after}`);
      if (after > before && attempt >= 1) break;
      await sleep(1200);
    }
    s = await state();
    expect(s.sliced > 0 && s.score > 0, `the mouse blade cuts fruit: sliced ${s.sliced}, score ${s.score}`);
    // A blade that is not moving must not cut, even with fruit passing through it.
    await sleep(1500);
    const [hx, hy] = await project(0, 1.32, 0.55);
    for (let k = 0; k < 12; k++) { await browser.mouse('mouseMoved', hx - 60 + k * 5, hy); await sleep(30); }   // arrive slowly
    await sleep(300);
    const before = (await state()).sliced;
    await browser.evaluate(`(() => { window.__still = null; (async () => {
      const ctx = ${PAGE}, stage = ${TAB}.group.children[0], T = ctx.THREE;
      const blade = stage.children.find((o) => o.name === 'RightBlade');
      const a = new T.Vector3(), b = new T.Vector3(), p = new T.Vector3(), line = new T.Line3();
      let touches = 0, last = 0;
      for (let n = 0; n < 540; n++) {
        if (n % 16 === 0 && n < 440) window.__frostslice.launch(false);
        a.setFromMatrixPosition(blade.matrix); b.set(0, 0, -0.64).applyMatrix4(blade.matrix);
        line.set(a, b);
        let near = 0;
        for (const o of stage.children) if (o.name === 'Fruit' && o.visible && line.closestPointToPoint(o.position, true, p).distanceTo(o.position) < 0.07) near++;
        if (near > last) touches += near - last;
        last = near;
        await new Promise((r) => requestAnimationFrame(r));
      }
      window.__still = { touches };
    })(); })()`);
    await browser.until('window.__still', 240000, 250);       // counted in frames, so a slow machine only takes longer
    const touches = await browser.evaluate('window.__still.touches');
    s = await state();
    expect(touches > 0 && s.sliced === before, `a still blade does not cut: ${touches} fruit passed through it, sliced stayed ${s.sliced}`);
    await shot('after-swings');
    console.log('  sounds: ' + JSON.stringify(s.soundSources) + ' (' + s.sounds + ' played)');
  }

  if (scenario === 'autoplay') {
    await sleep(1500);
    await shot('first-person');
    // Step out to the player's right and look back at the stage, to see the arcs, the halves and the pop-ups.
    await browser.evaluate(shell
      ? `(() => { const d = window.wishworld.ctx.input.desk; d.pos.set(1.7, 1.75, -0.2); d.yaw = 1.02; d.pitch = -0.2; })()`
      : `window.__harness.setCamera([1.7, 1.75, -0.2], [0, 1.25, -1.15])`);
    // Catch a cut: wait for the count to go up, then take the picture at once.
    for (const name of ['cut-a', 'cut-b', 'cut-c', 'cut-d']) {
      const n = (await state()).sliced;
      try { await browser.until(`window.__frostslice.state().sliced > ${n}`, 6000, 30); } catch { /* no cut in time: take the picture anyway */ }
      await sleep(name === 'cut-b' ? 250 : 90);
      await shot(name);
      console.log('  ' + JSON.stringify(await info()));
      await sleep(900);
    }
    await phase('over', 240000);
    await sleep(1200);
    await shot('time-up');
    const s = await state();
    console.log('  state: ' + JSON.stringify(s));
    expect(s.sliced >= 3 && s.score >= 30, `autoplay sliced ${s.sliced} for ${s.score} points (max combo ${s.maxCombo})`);
    expect(s.popups >= s.sliced && s.juice >= s.sliced * 14, `a pop-up and a 14-dot burst for every cut (${s.popups} pop-ups, ${s.juice} dots)`);
    expect(s.menu && !s.hud && s.blades.every((b) => !b), 'end card up; score panel and blades hidden');
    expect(s.best >= s.score, 'best score kept: ' + s.best);
    expect(s.spoken.some((t) => t.startsWith('Time! Score ')), 'the end is read out: ' + JSON.stringify(s.spoken.slice(-2)));
  }

  if (scenario === 'ice') {
    await browser.evaluate('window.__frostslice.noWaves = true');
    await sleep(600);
    for (let i = 0; i < 3; i++) {
      await browser.evaluate('window.__frostslice.launch(true)');
      await sleep(1500);
      if (i === 0) await shot('ouch');
      await sleep(600);
      const s = await state();
      console.log(`  ice block ${i + 1}: lives ${s.lives}, phase ${s.phase}`);
    }
    await phase('over', 90000);
    await sleep(1000);
    await shot('out-of-lives');
    const s = await state();
    expect(s.hazardsHit === 3 && s.lives === 0, `three ice blocks cost three lives (lives ${s.lives})`);
    expect(s.spoken.some((t) => t.startsWith('Out of lives Score ')), 'ends with "Out of lives": ' + JSON.stringify(s.spoken.slice(-2)));
  }

  if (scenario === 'again') {
    await sleep(2500);
    const before = await info();
    if (shell) {
      const during = await browser.evaluate(`(() => { const c = window.wishworld.ctx, a = c.models.lighting.ambient.value, s = c.input.state;
        return { ambient: [a.r, a.g, a.b].map((v) => +v.toFixed(2)), pointers: s.pointersEnabled, pointerMode: s.desktopPointerMode }; })()`);
      expect(!during.pointers && !during.pointerMode && during.ambient.join() === '0.72,0.72,0.74', 'during a round: the scene\'s own light, pointer rays off: ' + JSON.stringify(during));
    }
    await browser.evaluate(shell ? 'window.wishworld.tabs.leave()' : 'window.__harness.exit()');
    await sleep(500);
    let s = await state();
    expect(s.phase === 'off' && s.flying === 0 && !s.menu && !s.hud && s.blades.every((b) => !b), 'leaving the tab clears the game (phase ' + s.phase + ')');
    await shot('left');
    if (shell) {
      // What the game changed in the shell must be put back: the light, the pointer rays, the desktop hand.
      const back = await browser.evaluate(`(() => { const c = window.wishworld.ctx, a = c.models.lighting.ambient.value, s = c.input.state;
        return { ambient: [a.r, a.g, a.b].map((v) => +v.toFixed(2)), pointers: s.pointersEnabled, pointerMode: s.desktopPointerMode }; })()`);
      expect(back.pointers && back.pointerMode && back.ambient.join() !== '0.72,0.72,0.74', 'the shell has its own light and pointers back: ' + JSON.stringify(back));
    }
    await browser.evaluate(shell ? "window.wishworld.tabs.switchTo('frostslice', { fade: false }).then(() => true)" : 'window.__harness.enter()');
    await phase('ready', 10000);
    await sleep(800);
    await shot('back-at-menu');
    await browser.evaluate('window.__frostslice.start()');
    await phase('playing', 5000);
    await phase('over', 120000);
    await sleep(1000);
    await shot('second-round-over');
    s = await state();
    const after = await info();
    expect(s.phase === 'over' && s.menu, 'a second round runs to its end after coming back: score ' + s.score);
    // Leave and come back a few more times: what the renderer holds must not keep growing.
    const held = [];
    for (let i = 0; i < 3; i++) {
      await browser.evaluate(shell ? 'window.wishworld.tabs.leave()' : 'window.__harness.exit()');
      await sleep(300);
      await browser.evaluate(shell ? "window.wishworld.tabs.switchTo('frostslice', { fade: false }).then(() => true)" : 'window.__harness.enter()');
      await phase('ready', 10000);
      await sleep(500);
      held.push(await info());
    }
    expect(held[2].geometries === held[0].geometries && held[2].textures === held[0].textures,
      `leaving and returning leaks nothing: geometries ${before.geometries} -> ${after.geometries} -> ${held.map((h) => h.geometries).join(', ')}; textures ${held.map((h) => h.textures).join(', ')}`);
  }

  console.log('  draw: ' + JSON.stringify(await info()));
} catch (err) {
  failed = true;
  console.log('  FAIL ' + err.message);
  try { await shot('failure'); } catch { /* no picture */ }
} finally {
  for (const line of browser.lines) if (line.level === 'error' || line.level === 'warn' || /\[frostslice\]/.test(line.text)) console.log(`  [${line.level}] ${line.text}`);
  const errors = browser.errors().length, warnings = browser.warnings().length;
  console.log(`${tag}: ${errors} console errors, ${warnings} warnings${failed ? ', CHECKS FAILED' : ', all checks passed'}`);
  process.exitCode = errors || failed ? 1 : 0;
  await browser.close();
}
