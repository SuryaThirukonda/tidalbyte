// Dev check for the Snow Hoops tab, in the REAL shell (/vr/?mode=desktop&autostart=1): opens it in a headless
// browser, plays it, takes pictures and prints the page's console. Needs the site served locally:
//   python -m http.server 8106 --directory public
//
//   node check.mjs <scenario> <out-dir> [--base http://localhost:8106] [--standins 1]
//
// Scenarios:
//   pick      the "Pick your ball" panel; a real mouse click on the first ball; the ball is 0.24 m and centred,
//             the rack's clones share geometry and materials, a scan-sized ball limits the rack; a desktop
//             click-drag-release throw; a scripted hand path through the release-velocity tracker
//   scoring   five ideal shots (4 x 1 + money ball 2 = 6), the move to the next spot, five short ones (0)
//   timer     ?round=12 and no shots: the buzzer, "Time!" and the results card
//   autoplay  ?autoplay=1&round=20: picks a ball and shoots by itself to the end, no console errors
//   again     Play again, then leave and come back three times: nothing leaks
// Set BROWSER to another Chromium if Chrome will not start headless.

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launch, sleep } from '../../../dev/test/cdp.mjs';

const args = process.argv.slice(2);
const scenario = args[0] || 'pick';
const out = args[1] || '.';
const option = (name, fallback) => { const i = args.indexOf('--' + name); return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback; };
const base = option('base', 'http://localhost:8106');
const standins = option('standins', '1') === '1';
const W = 1280, H = 800;
mkdirSync(out, { recursive: true });

const extra = { pick: '', scoring: '&round=600', timer: '&round=12', autoplay: '&autoplay=1&round=20', again: '&round=600' }[scenario];
if (extra === undefined) { console.error('unknown scenario ' + scenario); process.exit(2); }
const url = `${base}/vr/?mode=desktop&tab=hoops&autostart=1&mute=1&stats=1${standins ? '&standins=1' : ''}${extra}`;

const AWAKE = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling',
  '--disable-features=CalculateNativeWinOcclusion'];
const browser = await launch({ width: W, height: H, flags: AWAKE });
try { await browser.send('Emulation.setFocusEmulationEnabled', { enabled: true }); } catch { /* older browsers */ }
const tag = 'hoops-' + scenario + (standins ? '-standins' : '');
let shots = 0;
const shot = async (name) => { const f = join(out, `${tag}-${String(++shots).padStart(2, '0')}-${name}.png`); await browser.screenshot(f); console.log('  saved ' + f); };
const state = () => browser.evaluate('JSON.stringify(window.__hoops.state())').then((s) => JSON.parse(s));
const until = (cond, ms = 30000) => browser.until(`window.__hoops && (() => { const s = window.__hoops.state(); return ${cond}; })()`, ms, 100);
const info = () => browser.evaluate(`(() => { const r = window.wishworld.renderer.info; return { calls: r.render.calls, triangles: r.render.triangles, geometries: r.memory.geometries, textures: r.memory.textures }; })()`);
/** Screen position of an object's origin, through the page's camera. */
const screenOf = (expr) => browser.evaluate(`(() => {
  const ctx = window.wishworld.ctx, o = ${expr}, v = new ctx.THREE.Vector3();
  o.updateWorldMatrix(true, false); o.getWorldPosition(v); ctx.camera.updateMatrixWorld(); v.project(ctx.camera);
  return [Math.round((v.x * 0.5 + 0.5) * innerWidth), Math.round((-v.y * 0.5 + 0.5) * innerHeight)];
})()`);
/** Pick the first ball and wait for "Go!". */
async function pickFirst() {
  await until('s.phase === "pick" && s.picker && s.choices.length > 0', 30000);
  await browser.evaluate('window.__hoops.pick(0)');
  await until('s.contest === "playing"', 20000);
}

let failed = false;
const expect = (ok, what) => { console.log((ok ? '  ok   ' : '  FAIL ') + what); if (!ok) failed = true; };
const near = (a, b, eps) => Math.abs(a - b) <= eps;

try {
  await browser.goto(url);
  console.log(`${tag}: ${url}`);
  await browser.until('document.body', 15000);
  // Headless Chromium slows a page whose picture does not change; a flickering dot keeps it at full speed (test only).
  await browser.evaluate(`(() => { const d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;z-index:99999;pointer-events:none';
    document.body.appendChild(d); let n = 0; const t = () => { d.style.background = (n++ & 1) ? '#b8cce0' : '#b9cde1'; requestAnimationFrame(t); }; t(); })()`);

  if (scenario === 'pick') {
    await until('s.phase === "pick" && s.picker && s.choices.length > 0');
    await sleep(2500);
    await shot('picker');
    let s = await state();
    expect(s.choices.includes('Bubby') && (!standins || s.choices[0] === 'Test scan'), 'choices: ' + s.choices.join(', '));
    // a real mouse click on the first choice's button
    const [bx, by] = await screenOf("window.wishworld.tabs.get('hoops').tab.group.getObjectByName('HoopsPicker').children.find((o) => o.userData.choiceKey)");
    await browser.mouse('mouseMoved', bx, by); await sleep(500);
    await browser.click(bx, by);
    await until('s.contest === "playing"', 20000);
    expect(true, 'a mouse click on the first ball started the round');
    await sleep(600);
    await shot('first-spot');
    const m = await browser.evaluate('window.__hoops.measure()');
    s = await state();
    console.log('  ball: ' + JSON.stringify(m));
    expect(near(m.largest, 0.24, 1e-3), `the ball is ${m.largest.toFixed(4)} m at its largest (0.24)`);
    expect(m.centre.every((c) => Math.abs(c) < 1e-3), 'its pivot is at its centre: ' + m.centre.map((c) => c.toFixed(4)).join(', '));
    expect(m.geometries === m.meshes && m.materials === m.meshes * 2, `5 rack balls share ${m.geometries} geometr${m.geometries === 1 ? 'y' : 'ies'} and ${m.materials} materials (regular + one gold set)`);
    if (standins) expect(m.triangles === 19220 && s.visibleOnRack === 3, `a 19,220-triangle scan shows ${s.visibleOnRack} balls on the rack at once`);
    expect(s.spot === 0 && s.rack === 0 && s.board, 'the player is at the left corner, scoreboard up');
    expect(s.shown === s.visibleOnRack, `${s.shown} balls shown on the rack`);
    // desktop throw: press, drag up an eighth of the screen (100 px), let go: that should go in
    const before = s.shots;
    await browser.mouse('mousePressed', W / 2, H / 2, { button: 'left', clickCount: 1 });
    for (let k = 1; k <= 10; k++) { await browser.mouse('mouseMoved', W / 2, H / 2 - k * 10, { button: 'left' }); await sleep(30); }
    await sleep(200);
    await shot('desktop-aim');
    s = await state();
    expect(s.held.desk, 'pressing the mouse picks up the front ball; dragging shows the aim line');
    await browser.mouse('mouseReleased', W / 2, H / 2 - 100, { button: 'left', clickCount: 1 });
    await sleep(300);
    s = await state();
    expect(s.shots === before + 1 && !s.held.desk, 'letting go throws it: ' + s.shots + ' shot(s)');
    await sleep(2500);
    s = await state();
    expect(s.makes === 1, 'a short 100 px drag is enough to score: ' + s.makes + ' basket(s)');
    // a hand path at a known speed through the real tracker: the release velocity is measured, then assisted
    const r = await browser.evaluate('window.__hoops.scriptedThrow(4.6, 4.2, 0.4)');   // toward the hoop, up, a little right
    console.log('  scripted: ' + JSON.stringify(r));
    expect(r && r.measured.every((m, i) => near(m, r.given[i], 0.01)), 'the release velocity is the hand\'s own over the last 90 ms');
    expect(r && r.result === 'assisted', 'a throw roughly at the hoop gets the aim assist');
  }

  if (scenario === 'scoring') {
    await pickFirst();
    for (let i = 0; i < 5; i++) { await browser.evaluate('window.__hoops.shoot(1, 0)'); await sleep(350); }
    await sleep(1200);
    await shot('rack-1-balls-in-air');
    await until('s.spot === 1 && !s.moving', 15000);
    let s = await state();
    console.log('  after rack 1: ' + JSON.stringify({ score: s.score, makes: s.makes, money: s.moneyMakes, rack1: s.balls[0] }));
    expect(s.score === 6 && s.makes === 5 && s.moneyMakes === 1, `5 of 5 with the money ball: score ${s.score} (4 x 1 + 2)`);
    expect(s.spoken.includes('Ooh, gold!'), 'the guide says "Ooh, gold!" at the money ball');
    expect(s.rack === 1 && s.spot === 1 && s.taken === 0, 'moved to the left wing with a full rack');
    expect((s.sounds.swish || 0) >= 5 && (s.sounds.chime || 0) >= 1, 'a swish for every basket, a chime for the money ball: ' + JSON.stringify(s.sounds));
    await sleep(500);
    await shot('left-wing');
    for (let i = 0; i < 5; i++) { await browser.evaluate('window.__hoops.shoot(0.7, 0)'); await sleep(350); }
    await until('s.spot === 2 && !s.moving', 15000);
    s = await state();
    expect(s.score === 6 && s.balls[1].every((b) => b === 4), 'five short throws score nothing: ' + JSON.stringify(s.balls[1]));
    expect(s.rack === 2, 'then on to the top of the key (rack 3)');
  }

  if (scenario === 'timer') {
    await pickFirst();
    const t0 = Date.now();
    await shot('playing');
    await until('s.phase === "results"', 40000);
    const s = await state();
    const took = (Date.now() - t0) / 1000;
    await sleep(800);
    await shot('time-up');
    expect(s.endedBy === 'time' && s.timeLeft === 0, `the 12 s clock ended the round (after ${took.toFixed(1)} s of real time)`);
    expect((s.sounds.buzz || 0) === 1, 'the buzzer sounded once');
    expect(s.results && s.spoken.includes('Time! Great shooting!'), 'results card up; the end is read out');
    expect(s.spoken[0] === 'Snow Hoops! Grab a ball and shoot it into the hoop.' && s.spoken.includes('Go!'), 'intro and "Go!" at the start: ' + JSON.stringify(s.spoken));
  }

  if (scenario === 'autoplay') {
    await until('s.contest === "playing"', 30000);
    await sleep(2000);
    await shot('first-person');
    // look from the side to see the arcs
    await browser.evaluate(`(() => { const d = window.wishworld.ctx.input.desk; d.pos.set(d.pos.x + 2.6, 1.9, d.pos.z - 1.2); d.yaw += 1.0; d.pitch = 0.05; })()`);
    await sleep(900);
    await shot('side-view');
    console.log('  ' + JSON.stringify(await info()));
    await until('s.phase === "results"', 120000);
    await sleep(1200);
    await shot('results');
    const s = await state();
    console.log('  state: ' + JSON.stringify({ score: s.score, makes: s.makes, shots: s.shots, money: s.moneyMakes, rack: s.rack, endedBy: s.endedBy, peak: s.peak }));
    expect(s.shots >= 10 && s.makes >= 3, `autoplay took ${s.shots} shots and made ${s.makes} (score ${s.score})`);
    expect(s.sparkles > 0 && (s.sounds.clank || 0) + (s.sounds.swish || 0) > 0, 'sparkles and sounds: ' + JSON.stringify(s.sounds));
    expect(s.crowd.penguins === 15 && s.crowd.cheers === s.makes, `${s.crowd.penguins} penguins watching; they cheered ${s.crowd.cheers} times for ${s.makes} baskets`);
    expect(s.peak.calls < 60 && s.peak.triangles < 100000, `peak ${s.peak.calls} draw calls, ${s.peak.triangles} triangles (budget 60 / 100,000)`);
  }

  if (scenario === 'again') {
    await pickFirst();
    await browser.evaluate('window.__hoops.setTimeLeft(1)');
    await until('s.phase === "results"', 20000);
    await sleep(900);                                     // let the card finish popping in
    const [ax, ay] = await screenOf("window.wishworld.tabs.get('hoops').tab.group.getObjectByName('HoopsResults').children[1]");
    await browser.mouse('mouseMoved', ax, ay); await sleep(500);
    await browser.click(ax, ay);
    await until('s.contest === "playing"', 15000);
    expect(true, 'a click on Play again started a new round with the same ball');
    await browser.evaluate('window.wishworld.tabs.leave()');
    await sleep(500);
    let s = await state();
    const shell = await browser.evaluate('(() => { const st = window.wishworld.ctx.input.state; return { pointers: st.pointersEnabled, look: st.desktopLookEnabled, companions: window.wishworld.ctx.companions.group.children.every((o) => o.visible) }; })()');
    expect(s.phase === 'off' && !s.board && !s.picker && s.slots.every((x) => x === 'gone'), 'leaving clears the game');
    expect(shell.pointers && shell.look && shell.companions, 'the shell has its pointers, mouse look and companions back: ' + JSON.stringify(shell));
    const held = [];
    for (let i = 0; i < 3; i++) {
      await browser.evaluate("window.wishworld.tabs.switchTo('hoops', { fade: false }).then(() => true)");
      await until('s.phase === "pick" && s.picker', 15000);
      await sleep(1200);
      await browser.evaluate('window.wishworld.tabs.leave()');
      await sleep(300);
      held.push(await info());
    }
    expect(held[2].geometries === held[0].geometries && held[2].textures === held[0].textures,
      `leaving and returning leaks nothing: geometries ${held.map((h) => h.geometries).join(', ')}; textures ${held.map((h) => h.textures).join(', ')}`);
  }

  console.log('  draw: ' + JSON.stringify(await info()));
} catch (err) {
  failed = true;
  console.log('  FAIL ' + err.message);
  try { await shot('failure'); } catch { /* no picture */ }
} finally {
  for (const line of browser.lines) if (line.level === 'error' || line.level === 'warn' || /\[hoops\]/.test(line.text)) console.log(`  [${line.level}] ${line.text.slice(0, 400)}`);
  // The shell's own autostart (no Enter press) cannot start audio: that warning is expected and not ours.
  const errors = browser.errors().length, warnings = browser.warnings().length;
  console.log(`${tag}: ${errors} console errors, ${warnings} warnings${failed ? ', CHECKS FAILED' : ', all checks passed'}`);
  process.exitCode = errors || failed ? 1 : 0;
  await browser.close();
}
