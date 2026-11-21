// Tests the Explore tab in the harness with headless Chrome.
//
//   node explore.test.mjs <out folder> [base url, default http://localhost:8103]
//
// Checks: both real places load into one THREE.Points; the smooth surface is the default view and "Show dots"
// switches to every measured dot; the facts are shown, spoken and logged; two-hand
// grip scales and turns (and clamps), one-hand grip drags, the buttons work; switching frees the old cloud;
// a place with no files shows the "could not load" card and no geometry; exit() frees the points.
// Saves pictures of each state. Exits 1 on a failure.

import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launch, sleep } from './cdp.mjs';

const outDir = resolve(process.argv[2] || 'explore-test-out');
const base = process.argv[3] || 'http://localhost:8103';
mkdirSync(outDir, { recursive: true });
const failures = [];
const check = (ok, what) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}`);
  if (!ok) failures.push(what);
};
const near = (a, b, tolerance) => Math.abs(a - b) <= tolerance;

// What the page reports about the diorama. Runs in the page.
const STATE = `(() => {
  const h = window.__harness, g = h.tab.group;
  const pivot = g.getObjectByName('Diorama'), points = g.getObjectByName('LidarPoints'), surface = g.getObjectByName('LidarSurface');
  const attr = points.geometry.getAttribute('position');
  const cards = [];
  g.traverse((o) => { if (o.userData && typeof o.userData.text === 'string' && o.visible) cards.push(o.userData.text); });
  let clouds = 0;
  h.ctx.scene.traverse((o) => { if (o.isPoints && o.visible && o.geometry.getAttribute('position')) clouds++; });
  return {
    scale: pivot.scale.x, yaw: pivot.rotation.y, pos: pivot.position.toArray(),
    visible: points.visible, count: attr ? attr.count : 0, drawn: points.geometry.drawRange.count,
    opacity: points.material.opacity, transparent: points.material.transparent, size: points.material.size,
    int16: attr ? attr.array.constructor.name : '', cards, clouds,
    surfaceVisible: Boolean(surface && surface.visible),
    surfaceTriangles: surface && surface.geometry.index ? surface.geometry.index.count / 3 : 0,
    info: h.info(), logs: h.logs.map((l) => l.type + ':' + JSON.stringify(l.detail)), said: h.said.length,
  };
})()`;

const state = (browser) => browser.evaluate(STATE);
const frames = () => sleep(350);

async function open(query) {
  const browser = await launch({});
  await browser.goto(`${base}/vr/dev/harness.html?tab=explore&hud=0${query || ''}`);
  await browser.until('window.__harness && (window.__harness.ready || window.__harness.error)', 60000);
  return browser;
}

async function real() {
  console.log('\n=== the real places (/lidar/)');
  const browser = await open('');
  try {
    await browser.until("window.__harness.logs.some((l) => l.type === 'explore_visited')", 60000);
    await sleep(2500);   // past the fade-in, and past the moment the tab may still re-place itself for a late head pose
    let s = await state(browser);
    console.log(`  liberty: ${s.count} points as ${s.int16}, ${s.info.calls} draw calls, ${s.info.fps.toFixed(0)} fps in headless Chrome`);
    check(s.visible && s.count > 400000 && s.count < 800000, `Statue of Liberty loaded: ${s.count} points`);
    check(s.clouds === 1, `one THREE.Points in the scene (${s.clouds})`);
    check(s.int16 === 'Int16Array', 'positions stay Int16 (6 bytes a point)');
    check(s.opacity === 1 && s.transparent === false, 'the fade-in finished and the cloud is drawn opaque');
    check(s.logs.some((l) => l.startsWith('explore_visited') && l.includes('liberty')), `explore_visited logged: ${s.logs.join(' ')}`);
    check(s.said >= 1, `the guide spoke (${s.said} line so far)`);
    check(s.cards.some((c) => /gift|copper|France/i.test(c)), 'the place\'s facts are on a card');
    check(s.cards.some((c) => /plane/i.test(c) && /sides of tall things poorly/i.test(c)), 'the limits of the scan are stated on a card');
    check(s.surfaceVisible && s.surfaceTriangles > 100000, `the smooth surface is shown by default (${s.surfaceTriangles} triangles)`);
    check(s.drawn > 0 && s.drawn < 20000, `only the statue's hanging dots are drawn on it (${s.drawn})`);
    await browser.screenshot(join(outDir, 'explore-liberty-smooth.png'));
    check(await browser.evaluate("window.__harness.click('Show dots')"), 'the Show dots button is there');
    await frames();
    s = await state(browser);
    check(!s.surfaceVisible && s.drawn > 400000, `Show dots draws every measured dot instead (${s.drawn})`);
    await browser.screenshot(join(outDir, 'explore-liberty-dots.png'));
    // The same button again (the shell relabels it "Show smooth"; the harness's buttons keep their first label).
    check(await browser.evaluate("window.__harness.click('Show dots')"), 'pressing it again brings the surface back');
    await frames();
    s = await state(browser);
    check(s.surfaceVisible, 'the surface is back');
    await browser.screenshot(join(outDir, 'explore-liberty.png'));

    // The whole layout, from a step back.
    await browser.evaluate('window.__harness.setCamera([0, 1.75, 1.1], [0, 1.25, -1.0])');
    await frames();
    await browser.screenshot(join(outDir, 'explore-layout.png'));
    // Leaning in over the statue.
    await browser.evaluate('window.__harness.setCamera([0.22, 1.42, -0.42], [0.06, 1.18, -0.74])');
    await frames();
    await browser.screenshot(join(outDir, 'explore-liberty-close.png'));
    await browser.evaluate('window.__harness.setCamera([0, 1.6, 0], [0, 1.2, -0.8])');

    // --- two hands: pull apart to scale ---
    const home = (await state(browser)).pos;
    await browser.evaluate(`(() => { const h = window.__harness;
      h.setHand('left', [-0.2, 1.1, -0.6]); h.setHand('right', [0.2, 1.1, -0.6]);
      h.squeeze('left', true); h.squeeze('right', true); })()`);
    await frames();
    await browser.evaluate("window.__harness.setHand('left', [-0.4, 1.1, -0.6]); window.__harness.setHand('right', [0.4, 1.1, -0.6]);");
    await frames();
    s = await state(browser);
    check(near(s.scale, 2, 0.02), `hands twice as far apart: the model is twice as big (scale ${s.scale.toFixed(3)})`);
    check(near(s.yaw, 0, 0.01), 'and has not turned');
    await browser.screenshot(join(outDir, 'explore-two-hand-bigger.png'));

    // --- two hands: turn a quarter circle about the point between them ---
    await browser.evaluate("window.__harness.setHand('left', [0, 1.1, -0.2]); window.__harness.setHand('right', [0, 1.1, -1.0]);");
    await frames();
    s = await state(browser);
    check(near(Math.abs(s.yaw), Math.PI / 2, 0.02), `hands turned a quarter circle: the model turned ${(s.yaw * 180 / Math.PI).toFixed(1)} degrees`);
    check(near(s.scale, 2, 0.02), 'and kept its size');
    await browser.screenshot(join(outDir, 'explore-two-hand-turned.png'));

    // --- clamps ---
    await browser.evaluate("window.__harness.setHand('left', [0, 1.1, 1.6]); window.__harness.setHand('right', [0, 1.1, -2.8]);");
    await frames();
    s = await state(browser);
    check(near(s.scale, 3, 0.001), `pulled far apart: stops at 3 m across (scale ${s.scale.toFixed(3)})`);
    await browser.evaluate("window.__harness.setHand('left', [0, 1.1, -0.59]); window.__harness.setHand('right', [0, 1.1, -0.61]);");
    await frames();
    s = await state(browser);
    check(near(s.scale, 0.3, 0.001), `pushed together: stops at 0.3 m across (scale ${s.scale.toFixed(3)})`);
    await browser.evaluate("window.__harness.squeeze('left', false); window.__harness.squeeze('right', false);");

    // --- reset ---
    check(await browser.evaluate("window.__harness.click('Put it back')"), 'the reset button is there');
    await sleep(1200);
    s = await state(browser);
    check(near(s.scale, 1, 0.01) && near(s.yaw, 0, 0.01) && near(s.pos[0], home[0], 0.01) && near(s.pos[1], home[1], 0.01) && near(s.pos[2], home[2], 0.01),
      `reset puts it back (scale ${s.scale.toFixed(2)}, yaw ${s.yaw.toFixed(2)})`);

    // --- one hand: drag ---
    await browser.evaluate("window.__harness.setHand('right', [0.2, 1.1, -0.6]); window.__harness.squeeze('right', true);");
    await frames();
    await browser.evaluate("window.__harness.setHand('right', [0.5, 1.3, -0.6]);");
    await frames();
    s = await state(browser);
    check(near(s.pos[0] - home[0], 0.3, 0.01) && near(s.pos[1] - home[1], 0.2, 0.01), `one grip drags the model with the hand (moved ${(s.pos[0] - home[0]).toFixed(2)}, ${(s.pos[1] - home[1]).toFixed(2)})`);
    await browser.evaluate("window.__harness.squeeze('right', false); window.__harness.click('Put it back');");
    await sleep(900);

    // --- buttons ---
    await browser.evaluate("window.__harness.click('Bigger'); window.__harness.click('Turn');");
    await sleep(1000);
    s = await state(browser);
    check(near(s.scale, 1.3, 0.02) && near(s.yaw, Math.PI / 4, 0.02), `Bigger and Turn work (scale ${s.scale.toFixed(2)}, yaw ${(s.yaw * 180 / Math.PI).toFixed(0)} degrees)`);
    await browser.evaluate("window.__harness.click('Put it back')");

    // --- the other place ---
    const before = s.info.geometries;
    check(await browser.evaluate("window.__harness.click('Niagara Falls')"), 'the picker has a Niagara Falls button');
    await browser.until("window.__harness.logs.some((l) => l.type === 'explore_visited' && /niagara/i.test(JSON.stringify(l.detail)))", 60000);
    await sleep(1500);
    s = await state(browser);
    check(s.visible && s.count > 400000 && s.clouds === 1, `Niagara Falls loaded: ${s.count} points, still one cloud`);
    check(s.info.geometries <= before, `the old cloud was freed (geometries ${before} -> ${s.info.geometries})`);
    check(s.cards.some((c) => /waterfalls|Great Lakes/i.test(c)), 'Niagara\'s facts are on the card');
    await browser.screenshot(join(outDir, 'explore-niagara.png'));
    await browser.evaluate('window.__harness.setCamera([0.05, 1.36, -0.46], [-0.02, 1.14, -0.82])');
    await frames();
    await browser.screenshot(join(outDir, 'explore-niagara-close.png'));
    await browser.evaluate('window.__harness.setCamera([0, 1.6, 0], [0, 1.2, -0.8])');

    // --- leaving frees the points; coming back loads them again ---
    const loaded = s.info.geometries;
    await browser.evaluate('window.__harness.exit()');
    await frames();
    s = await state(browser);
    check(!s.visible && s.count === 0, 'exit() frees the point cloud');
    console.log(`  geometries on the GPU: ${loaded} while showing, ${s.info.geometries} after exit`);
    await browser.evaluate('window.__harness.enter()');
    await browser.until("window.__harness.logs.filter((l) => l.type === 'explore_visited').length >= 3", 60000);
    await sleep(1200);
    s = await state(browser);
    check(s.visible && s.count > 400000 && s.cards.some((c) => /waterfalls|Great Lakes/i.test(c)), 'coming back shows the place that was last picked');

    for (const line of browser.lines) if (line.level !== 'info') console.log(`  [${line.level}] ${line.text}`);
    check(browser.errors().length === 0, `no console errors (${browser.errors().map((e) => e.text).join(' | ') || 'none'})`);
  } finally {
    await browser.close();
  }
}

async function pretendAR() {
  console.log('\n=== pretend AR passthrough (no backdrop)');
  const browser = await open('&ar=1');
  try {
    await browser.until("window.__harness.logs.some((l) => l.type === 'explore_visited')", 60000);
    await sleep(1500);
    await browser.evaluate('window.__harness.setCamera([0, 1.75, 1.1], [0, 1.25, -1.0])');
    await frames();
    await browser.screenshot(join(outDir, 'explore-ar-layout.png'));
    check(browser.errors().length === 0, 'no console errors');
  } finally {
    await browser.close();
  }
}

async function missing() {
  console.log('\n=== files missing or not in random order (/vr/dev/lidar/: synthetic "liberty" only, no niagara)');
  const browser = await open('&lidar=dev');
  try {
    await browser.until("window.__harness.logs.some((l) => l.type === 'explore_visited')", 60000);
    await sleep(1200);
    let s = await state(browser);
    check(s.visible && s.count === 40000, `the labelled test cloud loaded (${s.count} points)`);
    check(!s.surfaceVisible && s.drawn === 40000, 'a place without a surface file is shown as dots');
    check(s.cards.some((c) => /TEST CLOUD/.test(c)), 'and it is labelled as a test cloud on the cards');
    await browser.screenshot(join(outDir, 'explore-test-cloud.png'));

    await browser.evaluate("window.__harness.click('Niagara Falls')");
    await browser.until("(() => { let t = ''; window.__harness.tab.group.traverse((o) => { if (o.userData && o.userData.text) t += o.userData.text; }); return /could not load/i.test(t); })()", 30000);
    await sleep(800);
    s = await state(browser);
    check(!s.visible && s.count === 0 && s.clouds === 0, 'a place with no files shows no geometry at all');
    check(s.cards.some((c) => /could not load/i.test(c)), 'and the card says it could not be loaded');
    check(!s.logs.some((l) => /niagara/i.test(l)), 'and no explore_visited is logged for it');
    await browser.screenshot(join(outDir, 'explore-missing.png'));

    // The 404s for the missing files are expected here; anything else is a failure.
    const real = browser.errors().filter((e) => !/404/.test(e.text));
    check(real.length === 0, `no console errors other than the expected 404s (${real.map((e) => e.text).join(' | ') || 'none'})`);
  } finally {
    await browser.close();
  }
}

for (const test of [real, pretendAR, missing]) {
  try {
    await test();
  } catch (err) {
    console.log(`  FAIL  ${test.name} threw: ${err.message}`);
    failures.push(`${test.name}: ${err.message}`);
  }
}
console.log(failures.length ? `\n${failures.length} FAILED:\n  ${failures.join('\n  ')}` : '\nAll Explore checks passed.');
process.exitCode = failures.length ? 1 : 0;
