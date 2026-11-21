// Open the headset shell's desktop preview on the worlds tab in a headless browser, optionally run some
// JavaScript, save a picture and print the console and the renderer's numbers.
//
//   node shot.mjs "<query after /vr/?>" <out.png> [--ms 4000] [--run "<js>"] [--after 800] [--size 1280x800] [--page /vr/]
//
// Example: node shot.mjs "world=zoo&yaw=30" zoo.png
// Needs the site served on http://localhost:8104 (python -m http.server 8104 --directory public).
// Exit code 1 if the page logged an error.

import { launch, sleep } from '../../../dev/test/cdp.mjs';

const args = process.argv.slice(2);
const query = args[0] || '';
const out = args[1];
if (!out) { console.error('usage: node shot.mjs "<query>" <out.png> [--ms n] [--run js] [--after n] [--size WxH] [--page /vr/]'); process.exit(2); }
const option = (name, fallback) => { const i = args.indexOf('--' + name); return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback; };
const [width, height] = option('size', '1280x800').split('x').map(Number);
const page = option('page', '/vr/');
const base = process.env.WW_BASE || 'http://localhost:8104';
const url = `${base}${page}?mode=desktop&tab=worlds&autostart=1&mute=1${query ? '&' + query : ''}`;

const browser = await launch({ width, height });
try {
  await browser.goto(url);
  await browser.until(option('wait', 'window.__worlds && (window.wishworld || window.__harness) ? true : false'), 60000);
  await sleep(Number(option('ms', 4000)));
  const run = option('run', '');
  if (run) {
    const value = await browser.evaluate(run);
    if (value !== undefined) console.log('run ->', JSON.stringify(value));
    await sleep(Number(option('after', 800)));
  }
  const info = await browser.evaluate(`(() => { const w = window.wishworld || window.__harness; const r = w.renderer; const s = window.__worlds.state;
    return { world: s.worldId, ar: s.ar, creatures: window.__worlds.creatures.count, calls: r.info.render.calls, triangles: r.info.render.triangles,
      geometries: r.info.memory.geometries, textures: r.info.memory.textures, title: window.__worlds.info.title, counter: window.__worlds.info.counter }; })()`);
  console.log('info', JSON.stringify(info));
  await browser.screenshot(out);
  for (const line of browser.lines) if (line.level === 'error' || line.level === 'warn' || option('verbose', '') === '1') console.log(`[${line.level}] ${line.text}`);
  console.log(`saved ${out}; ${browser.errors().length} errors, ${browser.warnings().length} warnings`);
  process.exitCode = browser.errors().length ? 1 : 0;
} finally {
  await browser.close();
}
