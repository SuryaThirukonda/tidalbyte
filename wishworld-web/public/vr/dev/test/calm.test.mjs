// Tests the Calm tab in the harness with headless Chrome and a pretend microphone.
//
//   node calm.test.mjs <out folder> [base url, default http://localhost:8103] [only: breaths|fan|beeps|nomic]
//
// 1. breaths: a sound file with four long breaths, three claps, a held voice, a shout, two sharp puffs and
//             one short breath. Expect 4 slow breaths counted, the claps and the voice ignored.
// 2. fan:     a machine that starts and never stops. Expect it not to be left counted as a breath.
// 3. beeps:   Chrome's built-in pretend microphone (a beep every second). Expect nothing counted.
// 4. nomic:   no microphone at all. Expect the card to say so and the trigger to work instead.
//
// Prints every decision the detector logged, with the time since "I'm ready" was pressed, and exits 1 on a failure.

import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launch, sleep } from './cdp.mjs';
import { makeWavs } from './make-wavs.mjs';

const outDir = resolve(process.argv[2] || 'calm-test-out');
const base = process.argv[3] || 'http://localhost:8103';
const only = process.argv[4] || '';
mkdirSync(outDir, { recursive: true });
const wavs = makeWavs(outDir);
const url = `${base}/vr/dev/harness.html?tab=calm&hud=0`;
const failures = [];
const check = (ok, what) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}`);
  if (!ok) failures.push(what);
};

const debug = (browser) => browser.evaluate('window.__harness.tab.debug()');

async function open(flags) {
  const browser = await launch({ flags });
  await browser.goto(url);
  await browser.until('window.__harness && (window.__harness.ready || window.__harness.error)', 60000);
  await browser.until("window.__harness.buttons().some((b) => b.label === \"I'm ready\" && b.visible)", 20000);
  await sleep(1200);   // let the button finish popping in
  return browser;
}

/** Press a button with a real mouse click, so the page gets a real user gesture. */
async function press(browser, label) {
  const b = (await browser.evaluate('window.__harness.buttons()')).find((x) => x.label === label && x.visible);
  if (!b) throw new Error(`no visible button "${label}"`);
  await browser.click(b.x, b.y);
}

function printConsole(browser, t0, events) {
  const marks = (events || []).map((e) => ({ at: e.at, text: `      (sound file ${e.at.toFixed(1)} s: ${e.label}, ${e.seconds.toFixed(1)} s)` }));
  const lines = browser.lines
    .filter((l) => l.text.startsWith('[calm]') || l.level === 'error' || l.level === 'warn' || /\[harness\] (log|chime|pop)/.test(l.text))
    .map((l) => ({ at: (l.at - t0) / 1000, text: `${((l.at - t0) / 1000).toFixed(2).padStart(7)} s  ${l.level === 'info' ? '' : '[' + l.level + '] '}${l.text}` }));
  for (const entry of [...marks, ...lines].sort((a, b) => a.at - b.at)) console.log(entry.text);
}

async function withSoundFile(name, info, shots) {
  console.log(`\n=== ${name}: ${info.file}`);
  const browser = await open([
    '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
    `--use-file-for-fake-audio-capture=${info.file}%noloop`,
  ]);
  try {
    await press(browser, "I'm ready");
    const t0 = Date.now();   // the sound file starts when the microphone opens, a moment after this
    const end = t0 + (info.seconds + 2) * 1000;
    let lastState = '';
    const seen = { bubbles: 0, closeness: 0, scatter: 0 };   // the most seen so far (frames can stall on a busy machine)
    while (Date.now() < end) {
      const d = await debug(browser);
      seen.bubbles = Math.max(seen.bubbles, d.bubbles);
      seen.closeness = Math.max(seen.closeness, d.closeness);
      seen.scatter = Math.max(seen.scatter, d.scatter);
      if (d.state !== lastState) {
        lastState = d.state;
        console.log(`  state -> ${d.state} at ${((Date.now() - t0) / 1000).toFixed(1)} s`);
      }
      for (const shot of shots) {
        if (!shot.done && Date.now() - t0 >= shot.at * 1000) {
          shot.done = true;
          await browser.screenshot(join(outDir, shot.file));
          const fps = await browser.evaluate('window.__harness.info().fps');
          console.log(`  picture ${shot.file} at ${shot.at} s: bubbles ${d.bubbles}, closeness ${d.closeness.toFixed(2)}, count ${d.count} (${fps.toFixed(0)} fps)`);
          if (shot.check) shot.check(d, seen);
        }
      }
      await sleep(150);
    }
    const final = await debug(browser);
    await browser.evaluate('window.__harness.exit()');
    const after = await debug(browser);
    const logs = await browser.evaluate('window.__harness.logs');
    const sounds = await browser.evaluate('window.__harness.sounds.map((s) => s.kind)');
    console.log('  --- what the detector decided (time since the button; sound-file times in brackets) ---');
    printConsole(browser, t0, info.events);
    return { browser, final, after, logs, sounds };
  } catch (err) {
    await browser.close();
    throw err;
  }
}

async function testBreaths() {
  const shots = [
    { at: 9.6, file: 'calm-breathing-out.png', check: (d, seen) => check(seen.bubbles > 5 && d.exhaling, `bubbles are rising during a long breath (${seen.bubbles})`) },
    { at: 10.6, file: 'calm-slow-breath-glow.png' },
    { at: 17.6, file: 'calm-second-breath.png', check: (d, seen) => check(seen.closeness > 0.5, `the fish have drifted closer after long breaths (${seen.closeness.toFixed(2)})`) },
    { at: 31.9, file: 'calm-sharp-puffs.png', check: (d, seen) => check(seen.scatter > 0.3, 'sharp puffs scattered the fish') },
  ];
  const { browser, final, after, logs, sounds } = await withSoundFile('breaths', wavs.breaths, shots);
  try {
    console.log('  final:', JSON.stringify(final));
    check(final.count === wavs.breaths.expect.slow, `slow breaths counted: ${final.count} (expected ${wavs.breaths.expect.slow})`);
    const chimes = sounds.filter((k) => k === 'chime').length, pops = sounds.filter((k) => k === 'pop').length;
    check(chimes === wavs.breaths.expect.slow, `chimes played: ${chimes}`);
    check(pops === wavs.breaths.expect.sharp, `sharp puffs that scattered the fish: ${pops} (expected ${wavs.breaths.expect.sharp})`);
    const sessions = logs.filter((l) => l.type === 'breath_session');
    const total = sessions.reduce((sum, l) => sum + l.detail.breaths, 0);
    check(sessions.length >= 1 && total === final.count, `breath_session logged on leaving: ${JSON.stringify(sessions.map((l) => l.detail))}`);
    check(after.micOpen === false && after.listening === false, 'the microphone is released on exit');
    check(browser.errors().length === 0, `no console errors (${browser.errors().map((e) => e.text).join(' | ') || 'none'})`);
  } finally {
    await browser.close();
  }
}

async function testFan() {
  const { browser, final } = await withSoundFile('fan', wavs.fan, [{ at: 12, file: 'calm-fan.png' }]);
  try {
    console.log('  final:', JSON.stringify(final));
    check(final.count === 0, `a machine that never stops is not left counted as a breath (count ${final.count})`);
    check(final.exhaling === false, 'and it stops making bubbles once the room level is measured again');
    check(browser.errors().length === 0, 'no console errors');
  } finally {
    await browser.close();
  }
}

async function testBeeps() {
  console.log('\n=== beeps: Chrome\'s built-in pretend microphone (a tone that beeps)');
  const browser = await open(['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']);
  try {
    await press(browser, "I'm ready");
    const t0 = Date.now();
    await sleep(16000);
    const d = await debug(browser);
    printConsole(browser, t0);
    console.log('  final:', JSON.stringify(d));
    check(d.state === 'running', `the game is running on the microphone (state ${d.state})`);
    check(d.count === 0, `beeps are not breaths (count ${d.count})`);
    check(browser.errors().length === 0, 'no console errors');
  } finally {
    await browser.close();
  }
}

async function testNoMicrophone() {
  console.log('\n=== nomic: the browser refuses the microphone');
  // No pretend device and the permission question auto-denied: getUserMedia fails.
  const browser = await open(['--deny-permission-prompts']);
  try {
    await press(browser, "I'm ready");
    const t0 = Date.now();
    await browser.until("window.__harness.tab.debug().state === 'nomic'", 20000);
    let d = await debug(browser);
    console.log(`  fell back after ${((Date.now() - t0) / 1000).toFixed(1)} s: "${d.noMicReason}"`);
    check(d.state === 'nomic' && d.noMicReason.length > 0, 'the card explains that there is no microphone');
    await sleep(1500);
    await browser.screenshot(join(outDir, 'calm-no-microphone.png'));

    // Hold the trigger (the mouse button, away from any button) for a long breath.
    await browser.mouse('mouseMoved', 300, 420);
    await browser.mouse('mousePressed', 300, 420);
    await sleep(2000);
    d = await debug(browser);
    check(d.exhaling && d.bubbles > 3, `holding the trigger makes bubbles (${d.bubbles})`);
    await browser.screenshot(join(outDir, 'calm-trigger-breath.png'));
    await sleep(1600);
    await browser.mouse('mouseReleased', 300, 420);
    d = await debug(browser);
    check(d.count === 1, `a held trigger of 3.6 s counts one slow breath (count ${d.count})`);

    // Pressing a button must not count as a breath, and the slider must drag.
    await press(browser, 'Use microphone');
    await browser.until("window.__harness.tab.debug().state === 'nomic'", 20000);
    await sleep(500);

    await browser.evaluate('window.__harness.exit()');
    const logs = await browser.evaluate('window.__harness.logs');
    printConsole(browser, t0);
    check(logs.some((l) => l.type === 'breath_session' && l.detail.breaths === 1 && l.detail.microphone === false),
      `breath_session logged: ${JSON.stringify(logs.map((l) => l.detail))}`);
    check(browser.errors().length === 0, `no console errors (${browser.errors().map((e) => e.text).join(' | ') || 'none'})`);
  } finally {
    await browser.close();
  }
}

const tests = { breaths: testBreaths, fan: testFan, beeps: testBeeps, nomic: testNoMicrophone };
for (const [name, test] of Object.entries(tests)) {
  if (only && only !== name) continue;
  try {
    await test();
  } catch (err) {
    console.log(`  FAIL  ${name} threw: ${err.message}`);
    failures.push(`${name}: ${err.message}`);
  }
}
console.log(failures.length ? `\n${failures.length} FAILED:\n  ${failures.join('\n  ')}` : '\nAll Calm checks passed.');
process.exitCode = failures.length ? 1 : 0;
