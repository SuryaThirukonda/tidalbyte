// Dev only: drives a whole Snow Circuit race in headless Chrome with the autodrive and takes pictures.
//   python -m http.server 8107 --directory public        (in another terminal)
//   node public/vr/games/snowcircuit/dev/race.test.mjs [--out <folder>] [--base http://localhost:8107] [--target shell|harness]
//        [--speed 3] [--query "rivals=5&raceview=room"]
// Exit code 1 if the page logged an error or the race did not finish.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launch, sleep } from '../../../dev/test/cdp.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf('--' + name); return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback; };
const out = option('out', 'snowcircuit-shots');
const base = option('base', 'http://localhost:8107');
const target = option('target', 'shell');
const speed = option('speed', '3');
const extra = option('query', '');
mkdirSync(out, { recursive: true });

const common = `autodrive=1&speed=${speed}&mute=1${extra ? '&' + extra : ''}`;
const url = target === 'harness'
  ? `${base}/vr/dev/harness.html?tab=snowcircuit&hud=0&${common}`
  : `${base}/vr/?mode=desktop&tab=snowcircuit&autostart=1&stats=1&${common}`;
const info = target === 'harness'
  ? 'JSON.stringify(window.__harness.info())'
  : 'JSON.stringify({ calls: window.wishworld.stats.calls, triangles: window.wishworld.stats.triangles, fps: window.wishworld.stats.fps, textures: window.wishworld.stats.textures, geometries: window.wishworld.stats.geometries })';
const state = 'window.__snowcircuit && window.__snowcircuit.state()';
const phase = (p) => `(() => { const s = ${state}; return s && s.phase === '${p}'; })()`;

const browser = await launch({ width: 1280, height: 800 });

let ok = true;

// Pictures are read from the WebGL canvas right after a frame is drawn. (A DevTools screenshot taken a few
// seconds into a page makes headless Chrome and Edge on this machine drop to one frame a second afterwards,
// in any tab; reading the canvas does not.) The tab bar and other page furniture are therefore not in them.
const rendererExpr = target === 'harness' ? 'window.__harness.ctx.renderer' : 'window.wishworld.renderer';
const shot = async (name) => {
  const f = join(out, `${target}-${name}.png`);
  const data = await browser.evaluate(`new Promise((resolve) => { const r = ${rendererExpr}; const orig = r.render;
    r.render = function (s, c) { orig.call(this, s, c); r.render = orig; resolve(r.domElement.toDataURL('image/png')); }; })`);
  writeFileSync(f, Buffer.from(data.split(',')[1], 'base64'));
  console.log('picture', f);
};
try {
  console.log('open', url);
  await browser.goto(url);
  await browser.until(`(() => { const s = ${state}; return s && s.modelsReady && s.menu; })()`, 60000);
  await sleep(600);
  await shot('1-menu');
  console.log('menu', await browser.evaluate(`JSON.stringify((() => { const s = ${state}; return { phase: s.phase, dash: s.dash, loaded: s.loaded, engine: s.engine, view: s.view }; })())`));
  console.log('render', await browser.evaluate(info));

  await browser.until(phase('Countdown'), 30000, 50);
  await sleep(150);
  await shot('2-countdown');
  await browser.until(phase('Racing'), 30000, 50);
  await sleep(250);
  await shot('3-go');
  await browser.until(`(() => { const s = ${state}; return s && s.phase === 'Racing' && s.raceTime > 9; })()`, 60000, 100);
  await shot('4-racing');
  console.log('racing', await browser.evaluate(`JSON.stringify((() => { const s = ${state}; return { lap: s.lap, place: s.place, speed: s.speed, dash: s.dash, rivals: s.rivals.map((r) => r.name + ' ' + r.distance.toFixed(0)) }; })())`));
  console.log('render', await browser.evaluate(info));
  await browser.until(`(() => { const s = ${state}; return s && (s.lap >= 2 || s.phase === 'Finished'); })()`, 240000, 200);
  await sleep(700);
  await shot('5-lap2');
  await browser.until(phase('Finished'), 400000, 250);
  await sleep(1800);
  await shot('6-finish');
  const end = JSON.parse(await browser.evaluate(`JSON.stringify(${state})`));
  console.log('finish', JSON.stringify({ phase: end.phase, result: end.result, dash: end.dash, bumps: end.bumps, menu: end.menu, rivals: end.rivals.map((r) => `${r.name} ${r.distance.toFixed(0)}m${r.finished ? ' home' : ''}`) }));
  console.log('render', await browser.evaluate(info));
  ok = ok && end.phase === 'Finished' && end.menu && end.result && end.result.button === 'Race again';

  // leave the tab and come back: everything must be cleaned up and built again
  if (target === 'shell') {
    await browser.evaluate('window.wishworld.tabs.switchTo("hub").then(() => true)');
    await sleep(500);
    const left = JSON.parse(await browser.evaluate('JSON.stringify({ hook: typeof window.__snowcircuit, children: window.wishworld.tabs.get("snowcircuit").tab.group.children.length, fog: window.wishworld.ctx.scene.fog ? window.wishworld.ctx.scene.fog.far : null, active: window.wishworld.tabs.activeId })'));
    console.log('after leaving', JSON.stringify(left));
    ok = ok && left.hook === 'undefined' && left.children === 0;
    await shot('7-left');
  } else {
    await browser.evaluate('window.__harness.exit()');
    await sleep(300);
    const left = JSON.parse(await browser.evaluate('JSON.stringify({ hook: typeof window.__snowcircuit, children: window.__harness.tab.group.children.length })'));
    console.log('after leaving', JSON.stringify(left));
    ok = ok && left.hook === 'undefined' && left.children === 0;
  }
} catch (err) {
  ok = false;
  console.error('FAILED:', err.message);
  try { console.log('state', await browser.evaluate(`JSON.stringify(${state})`)); } catch { /* the page is gone */ }
} finally {
  for (const line of browser.lines) if (line.level === 'error' || line.level === 'warn' || /\[snowcircuit\]/.test(line.text)) console.log(`[${line.level}] ${line.text}`);
  console.log(`${browser.errors().length} errors, ${browser.warnings().length} warnings`);
  if (browser.errors().length) ok = false;
  await browser.close();
}
console.log(ok ? 'RACE OK' : 'RACE FAILED');
process.exit(ok ? 0 : 1);
