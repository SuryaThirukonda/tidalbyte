// Browser check for the Bottle Rocket tab in the real shell (/vr/?mode=desktop&autostart=1), headless.
// Needs the site served locally:  python -m http.server 8106 --directory public   (from wishworld-web/)
//
//   node check.mjs <scenario> <out-dir> [--base http://localhost:8106]
//     start     the choose screen, then the practice bottle on the pad
//     autoplay  ?autoplay=1: the autopilot flies all six missions; one picture per mission in flight
// Exits 1 on a failure, including any console error from the page.
// Set BROWSER to another Chromium (for example Edge) if Chrome will not start headless.

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launch, sleep } from '../../../dev/test/cdp.mjs';

const args = process.argv.slice(2);
const scenario = args[0] || 'start';
const out = args[1] || '.';
const option = (name, fallback) => { const i = args.indexOf('--' + name); return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback; };
const base = option('base', 'http://localhost:8106');
if (!['start', 'autoplay'].includes(scenario)) { console.error('unknown scenario ' + scenario); process.exit(2); }
mkdirSync(out, { recursive: true });

const url = `${base}/vr/?mode=desktop&tab=rocket&autostart=1&mute=1${scenario === 'autoplay' ? '&autoplay=1' : ''}`;
const AWAKE = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling',
  '--disable-features=CalculateNativeWinOcclusion'];
const browser = await launch({ width: 1280, height: 800, flags: AWAKE });
try { await browser.send('Emulation.setFocusEmulationEnabled', { enabled: true }); } catch { /* older browsers */ }

let shots = 0, failed = false;
const shot = async (name) => { const f = join(out, `${scenario}-${String(++shots).padStart(2, '0')}-${name}.png`); await browser.screenshot(f); console.log('  saved ' + f); };
const state = async () => JSON.parse(await browser.evaluate('JSON.stringify(window.__rocket ? window.__rocket.state() : null)'));
const check = (ok, what) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}`); if (!ok) failed = true; };
const calls = () => browser.evaluate('window.wishworld.renderer.info.render.calls');

try {
  await browser.goto(url);
  await browser.until('window.__rocket', 30000, 200);
  if (scenario === 'start') {
    await sleep(1500);
    await shot('choose');
    await browser.evaluate('window.__rocket.practice()');
    await sleep(1500);
    const s = await state();
    check(s.phase === 'ready' && s.body === 'practice' && s.mission === 0, `practice bottle on the pad (${JSON.stringify(s)})`);
    await shot('pad');
  } else {
    for (let i = 0; i < 6; i++) {
      await browser.until(`window.__rocket.state().mission === ${i} && window.__rocket.state().phase === 'flying'`, 60000, 100);
      await sleep(i < 4 ? 1500 : 3000);
      await shot(`mission-${i + 1}`);
      if (i === 0) { const c = await calls(); check(c < 60, `draw calls in flight: ${c}`); }
      await browser.until(`['won', 'failed', 'done'].includes(window.__rocket.state().phase)`, 90000, 100);
      const s = await state();
      check(s.phase === 'won' || s.phase === 'done', `mission ${i + 1} ${s.phase}${s.reason ? ' (' + s.reason + ')' : ''}`);
      if (s.phase === 'failed') break;
    }
    if (!failed) { await sleep(1000); await shot('done'); check((await state()).phase === 'done', 'all six missions done'); }
  }
} catch (err) {
  check(false, String(err && err.message ? err.message : err));
} finally {
  const errors = browser.errors();
  check(errors.length === 0, `no console errors (${errors.length})`);
  for (const e of errors) console.log('  [console error] ' + e.text);
  await browser.close();
}
process.exit(failed ? 1 : 0);
