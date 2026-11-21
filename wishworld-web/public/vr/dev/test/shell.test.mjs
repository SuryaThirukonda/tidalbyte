// Runs Explore and Calm inside the REAL shell (/vr/?mode=desktop&autostart=1), not the harness, to catch any
// mismatch with its ctx: real cards and buttons, real pointer, real audio object.
//
//   node shell.test.mjs <out folder> [base url, default http://localhost:8103]
//
// Buttons are pressed with real mouse clicks at the place they appear on screen. Console errors that are
// only "404" for tabs other engineers have not written yet are listed but not counted as failures.

import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launch, sleep } from './cdp.mjs';
import { makeWavs } from './make-wavs.mjs';

const outDir = resolve(process.argv[2] || 'shell-test-out');
const base = process.argv[3] || 'http://localhost:8103';
mkdirSync(outDir, { recursive: true });
const wavs = makeWavs(outDir);
const failures = [];
const check = (ok, what) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}`);
  if (!ok) failures.push(what);
};

// Helpers that run in the page.
const PAGE = `
window.__t = {
  tab(id) { return window.wishworld.tabs.get(id).tab; },
  screenOf(object, dx = 0, dy = 0) {
    const w = window.wishworld, v = new w.ctx.THREE.Vector3(dx, dy, 0);
    object.updateWorldMatrix(true, false);
    v.applyMatrix4(object.matrixWorld).project(w.ctx.camera);
    return { x: Math.round((v.x * 0.5 + 0.5) * innerWidth), y: Math.round((-v.y * 0.5 + 0.5) * innerHeight), front: v.z < 1 };
  },
  shown(o) { for (; o; o = o.parent) { if (!o.visible) return false; if (o.isScene) return true; } return false; },
  button(id, label) {
    let found = null;
    this.tab(id).group.traverse((o) => { if (!found && o.userData && o.userData.button && o.userData.button.label === label && this.shown(o)) found = o; });
    return found ? this.screenOf(found) : null;
  },
  named(id, name, dx, dy) { const o = this.tab(id).group.getObjectByName(name); return o ? this.screenOf(o, dx, dy) : null; },
  cloud(id) {
    let n = 0, count = 0;
    window.wishworld.ctx.scene.traverse((o) => { if (o.isPoints && this.shown(o) && o.geometry.getAttribute('position')) { n++; count = o.geometry.getAttribute('position').count; } });
    return { clouds: n, count };
  },
  texts(id) { const out = []; this.tab(id).group.traverse((o) => { if (typeof o.getText === 'function' && this.shown(o)) out.push(o.getText()); }); return out; },
};`;

const notOurs = (line) => /404/.test(line.text) && /\/vr\/tabs\/(reef|worlds|frostslice|snowcircuit|mailbox|hub)\.js/.test(line.text);
function reportErrors(browser) {
  const errors = browser.errors();
  const ours = errors.filter((e) => !notOurs(e));
  for (const e of errors) { e.shown = true; }
  const others = errors.length - ours.length;
  if (others) console.log(`  (${others} "404" errors for tabs that are not written yet: not ours)`);
  check(ours.length === 0, `no console errors from Explore, Calm or the shell (${ours.map((e) => e.text).join(' | ') || 'none'})`);
  const warnings = browser.warnings().filter((w) => /explore|calm/i.test(w.text));
  check(warnings.length === 0, `no warnings about Explore or Calm (${warnings.map((w) => w.text).join(' | ') || 'none'})`);
}

async function open(tab, flags = []) {
  const browser = await launch({ flags });
  await browser.goto(`${base}/vr/?mode=desktop&tab=${tab}&autostart=1&mute=1&calmdebug=1`);
  await browser.until(`window.wishworld && window.wishworld.tabs.activeId === '${tab}'`, 60000);
  await browser.evaluate(PAGE);
  return browser;
}

async function pressButton(browser, tab, label) {
  const at = await browser.evaluate(`window.__t.button('${tab}', ${JSON.stringify(label)})`);
  if (!at) throw new Error(`no visible button "${label}" in ${tab}`);
  await browser.click(at.x, at.y);
  return at;
}

async function explore() {
  console.log('\n=== Explore in the real shell');
  const browser = await open('explore');
  try {
    await browser.until('window.__t.cloud().clouds === 1', 60000);
    await sleep(3000);
    let c = await browser.evaluate('window.__t.cloud()');
    check(c.clouds === 1 && c.count > 400000, `Statue of Liberty: ${c.count} points in one THREE.Points`);
    let texts = await browser.evaluate("window.__t.texts('explore')");
    check(texts.some((t) => /France|copper/i.test(t)), 'the facts are on the shell\'s card');
    check(texts.some((t) => /sides of tall things poorly/i.test(t)), 'the limits of the scan are on a card');
    const stats = await browser.evaluate('window.wishworld.stats');
    console.log(`  ${stats.calls} draw calls, ${stats.fps} fps in headless Chrome (not a headset number)`);
    await browser.screenshot(join(outDir, 'shell-explore-liberty.png'));

    await pressButton(browser, 'explore', 'Bigger');
    await pressButton(browser, 'explore', 'Turn');
    await browser.until("(() => { const p = window.__t.tab('explore').group.getObjectByName('Diorama'); return Math.abs(p.scale.x - 1.3) < 0.01 && Math.abs(p.rotation.y - Math.PI / 4) < 0.01; })()", 30000).catch(() => {});
    const pivot = await browser.evaluate("(() => { const p = window.__t.tab('explore').group.getObjectByName('Diorama'); return { s: p.scale.x, yaw: p.rotation.y }; })()");
    check(Math.abs(pivot.s - 1.3) < 0.02 && Math.abs(pivot.yaw - Math.PI / 4) < 0.02, `real mouse clicks on Bigger and Turn work (scale ${pivot.s.toFixed(2)}, ${(pivot.yaw * 180 / Math.PI).toFixed(0)} degrees)`);
    await pressButton(browser, 'explore', 'Put it back');

    await pressButton(browser, 'explore', 'Niagara Falls');
    await browser.until("window.__t.texts('explore').some((t) => /Great Lakes|waterfalls/i.test(t))", 60000);
    await sleep(2500);
    c = await browser.evaluate('window.__t.cloud()');
    check(c.clouds === 1 && c.count > 400000, `Niagara Falls after a click on the picker: ${c.count} points, one cloud`);
    await browser.screenshot(join(outDir, 'shell-explore-niagara.png'));

    // Right mouse button = grip in the shell's desktop preview: one-hand drag must not throw.
    await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 640, y: 500, button: 'none' });
    await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 640, y: 500, button: 'right', buttons: 2, clickCount: 1 });
    await sleep(300);
    await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 700, y: 500, button: 'right', buttons: 2 });
    await sleep(300);
    await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 700, y: 500, button: 'right', buttons: 0, clickCount: 1 });
    await sleep(300);

    // Leaving for another tab frees the cloud.
    await browser.evaluate("window.wishworld.tabs.switchTo('calm')");
    await browser.until("window.wishworld.tabs.activeId === 'calm'", 20000);
    await sleep(800);
    c = await browser.evaluate('window.__t.cloud()');
    check(c.clouds === 0, 'switching to another tab leaves no point cloud behind');
    reportErrors(browser);
  } finally {
    await browser.close();
  }
}

async function calm() {
  console.log('\n=== Calm in the real shell, with the breaths sound file as the microphone');
  const browser = await open('calm', [
    '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
    `--use-file-for-fake-audio-capture=${wavs.breaths.file}%noloop`,
  ]);
  const debug = () => browser.evaluate("window.__t.tab('calm').debug()");
  try {
    await browser.until("window.__t.button('calm', \"I'm ready\")", 20000);
    await sleep(1500);
    await browser.screenshot(join(outDir, 'shell-calm-intro.png'));
    await pressButton(browser, 'calm', "I'm ready");
    const t0 = Date.now();
    await browser.until("window.__t.tab('calm').debug().state === 'running'", 30000);
    let d = await debug();
    console.log(`  running ${((Date.now() - t0) / 1000).toFixed(1)} s after the press; listening through the shell's audio context: ${d.sharedContext}`);

    // The slider, with the real pointer: click near its right end, then drag back to the left.
    const before = d.sensitivity;
    const right = await browser.evaluate("window.__t.named('calm', 'CalmSlider', 0.13, 0)");
    const left = await browser.evaluate("window.__t.named('calm', 'CalmSlider', -0.1, 0)");
    await browser.click(right.x, right.y);
    await sleep(300);
    d = await debug();
    check(d.sensitivity > before + 0.2, `a click on the slider sets it (${before.toFixed(2)} -> ${d.sensitivity.toFixed(2)})`);
    await browser.mouse('mouseMoved', right.x, right.y);
    await browser.mouse('mousePressed', right.x, right.y);
    await sleep(150);
    await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: left.x, y: left.y, button: 'left', buttons: 1 });
    await sleep(300);
    await browser.until("window.__t.tab('calm').debug().sensitivity < 0.35", 15000).catch(() => {});
    await browser.mouse('mouseReleased', left.x, left.y);
    await sleep(200);
    d = await debug();
    check(d.sensitivity < 0.35, `dragging the knob moves it (now ${d.sensitivity.toFixed(2)})`);
    await pressButton(browser, 'calm', '+');
    await pressButton(browser, 'calm', '+');
    await sleep(200);
    d = await debug();
    console.log(`  after two presses of +: sensitivity ${d.sensitivity.toFixed(2)}`);

    while (Date.now() - t0 < 10800) await sleep(100);
    await browser.screenshot(join(outDir, 'shell-calm-breath.png'));
    while (Date.now() - t0 < 19500) await sleep(100);
    d = await debug();
    check(d.count === 2, `two long breaths in the sound file so far: ${d.count} counted`);
    await browser.screenshot(join(outDir, 'shell-calm-two-breaths.png'));
    while (Date.now() - t0 < 30000) await sleep(100);
    d = await debug();
    check(d.count === 2, `claps, a held voice and a shout added nothing: still ${d.count}`);

    // Leaving the tab releases the microphone and logs the session.
    await browser.evaluate("window.wishworld.tabs.switchTo('explore')");
    await browser.until("window.wishworld.tabs.activeId === 'explore'", 20000);
    d = await debug();
    check(d.micOpen === false && d.listening === false, 'leaving the tab releases the microphone');
    for (const line of browser.lines) if (line.text.startsWith('[calm]')) console.log(`  ${((line.at - t0) / 1000).toFixed(2).padStart(7)} s  ${line.text}`);
    reportErrors(browser);
  } finally {
    await browser.close();
  }
}

for (const test of [explore, calm]) {
  try {
    await test();
  } catch (err) {
    console.log(`  FAIL  ${test.name} threw: ${err.message}`);
    failures.push(`${test.name}: ${err.message}`);
  }
}
console.log(failures.length ? `\n${failures.length} FAILED:\n  ${failures.join('\n  ')}` : '\nAll shell checks passed.');
process.exitCode = failures.length ? 1 : 0;
