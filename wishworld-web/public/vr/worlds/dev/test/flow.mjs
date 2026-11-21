// Drives the worlds tab in the headset shell's desktop preview and checks what Unity's World scene does:
// a mouse click on a creature plays its fact, the counter and the events, the quiz, the picker from inside
// a world, "In my room", and that switching worlds and leaving the tab does not leak.
//
//   node flow.mjs [outDir]            (site served on http://localhost:8104)
// Exit code 1 if a check fails or the tab logs an error.

import { launch, sleep } from '../../../dev/test/cdp.mjs';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2] || '.';
mkdirSync(out, { recursive: true });
const base = process.env.WW_BASE || 'http://localhost:8104';
// A small window: the software renderer of a headless browser is slow, and the shell caps a frame at 0.05 s
// of game time, so everything below waits for a state rather than for a number of seconds.
const browser = await launch({ width: 800, height: 500 });
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); if (!ok) failed++; };
const ev = (js) => browser.evaluate(js);
const mem = () => ev(`(() => { const r = window.wishworld.renderer.info; return { geometries: r.memory.geometries, textures: r.memory.textures, calls: r.render.calls, triangles: r.render.triangles }; })()`);
const settled = (id) => `window.__worlds.state.worldId === '${id}' && window.__worlds.creatures.count > 0 && window.wishworld.ctx.rig.fadeAlpha < 0.01`;

try {
  await browser.goto(`${base}/vr/?mode=desktop&tab=worlds&autostart=1&mute=1&world=aquarium`);
  await browser.until('window.__worlds && window.__worlds.creatures && window.__worlds.creatures.count > 0', 60000);
  await sleep(2500);
  // Record what the tab logs.
  await ev(`(() => { window.__events = []; const api = window.wishworld.ctx.api; api.logEvent = (t, d) => { window.__events.push({ t, d }); return Promise.resolve({ ok: true, id: 0 }); }; })()`);

  // 1. Point the head at the shark and click it with the mouse.
  await ev(`(() => { const W = window.wishworld, T = W.ctx.THREE, c = window.__worlds.creatures.find('shark');
    const p = new T.Vector3(); c.object.getWorldPosition(p); const d = W.ctx.input.desk;
    d.yaw = Math.atan2(-(p.x - d.pos.x), -(p.z - d.pos.z)); d.pitch = Math.atan2(p.y - d.pos.y, Math.hypot(p.x - d.pos.x, p.z - d.pos.z)); return true; })()`);
  await sleep(300);
  const at = await ev(`(() => { const W = window.wishworld, c = window.__worlds.creatures.find('shark');
    const p = c.center.clone().applyMatrix4(c.object.matrixWorld).project(W.ctx.camera);
    return { x: Math.round((p.x * 0.5 + 0.5) * innerWidth), y: Math.round((-p.y * 0.5 + 0.5) * innerHeight) }; })()`);
  await browser.mouse('mouseMoved', at.x, at.y);
  await sleep(400);
  const hover = await ev(`(() => { const c = window.__worlds.creatures.find('shark'); return { hovered: c.hovered, glow: c.glow }; })()`);
  check('pointing at a creature makes it glow', hover.hovered && hover.glow > 0.05, JSON.stringify(hover));
  await browser.click(at.x, at.y);
  await sleep(1200);
  const s1 = await ev(`(() => { const w = window.__worlds; const c = w.creatures.find('shark');
    return { fact: w.fact.visible, name: w.fact.current && w.fact.current.id, counter: w.info.counter, glow: c.glow, speed: c.mover.speedScale, clock: w.creatures.clock, until: c.glowUntil, frames: window.wishworld.stats.frames,
      spoken: window.wishworld.ctx.audio.lastSpoken, events: window.__events }; })()`);
  check('a click on the shark shows its fact card', s1.fact && s1.name === 'shark', JSON.stringify({ fact: s1.fact, name: s1.name }));
  check('the counter reads 1 of 5 found', s1.counter === '1 of 5 found', s1.counter);
  check('the fact is read aloud', /^A shark has no bones/.test(s1.spoken || ''), s1.spoken);
  check('creature_learned is logged with creature and world', s1.events.some((e) => e.t === 'creature_learned' && e.d.creature === 'shark' && e.d.world === 'aquarium'), JSON.stringify(s1.events));
  check('the creature glows and slows', s1.glow > 0.3 && s1.speed < 0.9, JSON.stringify({ glow: s1.glow, speed: s1.speed, clock: s1.clock, until: s1.until, frames: s1.frames }));
  await sleep(800);
  await browser.screenshot(join(out, 'flow_fact.png'));
  // Look away (staring at a creature replays its card, as in Unity). A second go inside the 4 s cooldown does
  // nothing; learning it again later is not logged twice.
  await ev(`(() => { const d = window.wishworld.ctx.input.desk; d.yaw = 0; d.pitch = 1.3; })()`);
  await sleep(300);
  await ev(`window.__worlds.learn('shark')`);
  await browser.until(`window.__worlds.creatures.clock >= window.__worlds.creatures.find('shark').cooldownUntil`, 60000);
  await ev(`window.__worlds.learn('shark')`);
  await sleep(300);
  const again = await ev(`window.__events.filter((e) => e.t === 'creature_learned').length`);
  check('a creature is only logged the first time', again === 1, String(again));

  // 2. Learn the rest: "You found them all" then the quiz.
  for (const id of ['clownfish', 'turtle', 'jellyfish', 'ray']) { await ev(`window.__worlds.learn('${id}')`); await sleep(350); }
  await sleep(500);
  const s2 = await ev(`({ counter: window.__worlds.info.counter, events: window.__events.length })`);
  check('all five found', s2.counter === '5 of 5 found' && s2.events === 5, JSON.stringify(s2));
  await ev(`(() => { const d = window.wishworld.ctx.input.desk; d.yaw = 0; d.pitch = 0; window.__worlds.startQuiz(); })()`);
  await sleep(1500);
  const q0 = await ev(`({ open: window.__worlds.quiz.blocking, header: window.__worlds.quiz.header, question: window.__worlds.quiz.question })`);
  check('Finish opens the quiz at question 1 of 3', q0.open && q0.header === 'Question 1 of 3' && q0.question.length > 10, JSON.stringify(q0));
  await browser.screenshot(join(out, 'flow_quiz.png'));
  for (let i = 0; i < 3; i++) {
    await ev(`window.__worlds.quiz.answer(${i === 1 ? '(window.__worlds.quiz.correctOption() + 1) % 3' : 'window.__worlds.quiz.correctOption()'})`);
    await sleep(600);
    if (i === 1) await browser.screenshot(join(out, 'flow_quiz_wrong.png'));
    await browser.until(i < 2 ? `window.__worlds.quiz.header === 'Question ${i + 2} of 3'` : `window.__worlds.quiz.header === 'Quiz finished'`, 60000);
  }
  await sleep(600);
  const q1 = await ev(`({ header: window.__worlds.quiz.header, question: window.__worlds.quiz.question, score: window.__worlds.quiz.score })`);
  check('the quiz finishes with the score', q1.header === 'Quiz finished' && q1.question === 'You got 2 of 3 right!' && q1.score === 2, JSON.stringify(q1));
  await browser.screenshot(join(out, 'flow_quiz_done.png'));

  // 3. The picker from inside the world, then a real click on "Zoo".
  await ev(`window.__worlds.openPicker()`);
  await sleep(1200);
  await browser.screenshot(join(out, 'flow_picker_in_world.png'));
  const zoo = await ev(`(() => { const W = window.wishworld, T = W.ctx.THREE; let b = null;
    window.__worlds.picker.root.traverse((o) => { if (o.name === 'Button Zoo') b = o; });
    const p = new T.Vector3(); b.getWorldPosition(p); p.project(W.ctx.camera);
    return { x: Math.round((p.x * 0.5 + 0.5) * innerWidth), y: Math.round((-p.y * 0.5 + 0.5) * innerHeight) }; })()`);
  await browser.mouse('mouseMoved', zoo.x, zoo.y);
  await sleep(300);
  await browser.click(zoo.x, zoo.y);
  await browser.until(settled('zoo'), 60000);
  await sleep(1500);
  const s3 = await ev(`({ title: window.__worlds.info.title, counter: window.__worlds.info.counter, picker: window.__worlds.picker.isOpen, events: window.__events.filter((e) => e.t === 'world_visited'),
    fade: window.wishworld.ctx.rig.fadeAlpha, said: window.wishworld.ctx.guide.lastLine })`);
  check('clicking Zoo in the picker loads the zoo', s3.title === 'Zoo' && s3.counter === '0 of 5 found' && !s3.picker, JSON.stringify(s3));
  check('world_visited is logged', s3.events.length === 1 && s3.events[0].d.world === 'zoo', JSON.stringify(s3.events));
  check('the guide says the world intro', s3.said === 'Welcome to the savanna. Look how tall the giraffe is!', s3.said);
  check('the white fade has cleared', s3.fade < 0.01, String(s3.fade));

  // 4. "In my room".
  await ev(`window.__worlds.toggleAR()`);
  await browser.until(`window.__worlds.creatures.count === 8 && window.__worlds.creatures.find('elephant').object.scale.x < 0.5`, 30000);
  await sleep(1500);
  const s4 = await ev(`(() => { const w = window.__worlds, W = window.wishworld; const e = w.creatures.find('elephant');
    return { ar: w.state.ar, count: w.creatures.count, envVisible: W.ctx.environment.root.visible, fog: !!W.ctx.scene.fog, scale: e.object.scale.x, radius: e.mover.radius, title: w.info.title, said: W.ctx.guide.lastLine }; })()`);
  check('In my room: no sky, ground or fog; creatures at AR scale and distance', s4.ar && !s4.envVisible && !s4.fog && Math.abs(s4.scale - 0.12) < 1e-6 && s4.radius <= 2.4 && s4.radius >= 1,
    JSON.stringify(s4));
  check('the guide says "Here it is, in your room."', s4.said === 'Here it is, in your room.', s4.said);
  await browser.screenshot(join(out, 'flow_room.png'));
  await ev(`window.__worlds.toggleAR()`);
  await browser.until(`window.__worlds.creatures.count === 8 && window.__worlds.creatures.find('elephant').object.scale.x === 1`, 30000);
  await sleep(1500);
  const s5 = await ev(`(() => { const w = window.__worlds, W = window.wishworld; return { ar: w.state.ar, envVisible: W.ctx.environment.root.visible, fog: !!W.ctx.scene.fog, scale: w.creatures.find('elephant').object.scale.x }; })()`);
  check('Take me there brings the world back', !s5.ar && s5.envVisible && s5.fog && s5.scale === 1, JSON.stringify(s5));

  // 5. Round the worlds three times: memory must not grow from one round to the next.
  const worlds = ['aquarium', 'zoo', 'space', 'dinosaurs', 'arctic', 'rainforest', 'farm', 'sky'];
  const rounds = [];
  for (let round = 0; round < 3; round++) {
    const row = {};
    for (const id of worlds) {
      await ev(`window.__worlds.open('${id}')`);
      await browser.until(settled(id), 90000);
      await sleep(900);
      row[id] = await mem();
    }
    rounds.push(row);
  }
  for (const id of worlds) {
    console.log(`  ${id.padEnd(11)} draws ${String(rounds[2][id].calls).padStart(3)}  triangles ${String(rounds[2][id].triangles).padStart(7)}`
      + `  geometries ${rounds[1][id].geometries} -> ${rounds[2][id].geometries}  textures ${rounds[1][id].textures} -> ${rounds[2][id].textures}`);
  }
  check('no growth in geometries or textures between rounds',
    worlds.every((id) => rounds[2][id].geometries <= rounds[1][id].geometries && rounds[2][id].textures <= rounds[1][id].textures));

  // 6. Leave for another tab and come back, three times.
  const other = await ev(`(window.wishworld.tabs.list().find((t) => t.id !== 'worlds') || {}).id || ''`);
  const trips = [];
  for (let i = 0; i < 3; i++) {
    await ev(`window.wishworld.tabs.switchTo('${other}')`);
    await browser.until(`window.wishworld.tabs.activeId === '${other}' && window.wishworld.ctx.rig.fadeAlpha < 0.01`, 60000);
    await sleep(500);
    const away = await ev(`(() => { const g = window.wishworld.tabs.get('worlds').tab.group; let meshes = 0; g.traverse((o) => { if (o.isMesh) meshes++; }); return { meshes, handle: typeof window.__worlds }; })()`);
    if (i === 0) check('exit leaves nothing behind in the tab group', away.meshes === 0 && away.handle === 'undefined', JSON.stringify(away));
    await ev(`window.wishworld.tabs.switchTo('worlds')`);
    await browser.until(`window.wishworld.tabs.activeId === 'worlds' && window.__worlds && window.__worlds.picker.isOpen && window.wishworld.ctx.rig.fadeAlpha < 0.01`, 60000);
    await ev(`window.__worlds.open('farm')`);
    await browser.until(settled('farm'), 90000);
    await sleep(900);
    trips.push(await mem());
  }
  console.log('  after each return to the farm [geometries, textures]:', JSON.stringify(trips.map((t) => [t.geometries, t.textures])));
  check('leaving and returning does not leak', trips[2].geometries <= trips[1].geometries && trips[2].textures <= trips[1].textures);

  // 7. The headset paths, driven by hand: a controller ray on a creature and the trigger, then a controller touching one.
  const xr = await ev(`(() => { const W = window.wishworld, T = W.ctx.THREE, w = window.__worlds, tab = w.tab;
    const real = W.ctx.isImmersive; W.ctx.isImmersive = () => true;
    const hand = W.ctx.controllers.right, out = {};
    try {
      const pig = w.creatures.find('pig'), cow = w.creatures.find('cow');
      const p = pig.center.clone().applyMatrix4(pig.object.matrixWorld);
      hand.ray.position.set(0.2, 1.2, -0.3); hand.ray.lookAt(p); hand.ray.rotateY(Math.PI); hand.ray.updateMatrixWorld(true);
      hand.hover = null; hand.connected = true; hand.tracked = true;
      tab.onSelectStart('right', hand);
      out.pointed = w.fact.current && w.fact.current.id;
      const q = cow.center.clone().applyMatrix4(cow.object.matrixWorld);
      hand.grip.position.copy(q); hand.grip.updateMatrixWorld(true);
      hand.ray.position.set(0, -5, 0); hand.ray.updateMatrixWorld(true);
      const before = w.learned.has('cow');
      w.creatures.hand(q, 0.016);
      out.touched = !before && w.learned.has('cow') && w.fact.current.id === 'cow';
    } finally { W.ctx.isImmersive = real; }
    return out; })()`);
  check('headset: a controller ray and the trigger teach a creature', xr.pointed === 'pig', JSON.stringify(xr));
  check('headset: touching a creature with a controller teaches it', xr.touched === true, JSON.stringify(xr));

  const mine = browser.errors().filter((l) => !/tabs\/(snowcircuit|frostslice|reef|mailbox)\.js|favicon/.test(l.text));
  for (const line of browser.lines) if (line.level === 'error' || line.level === 'warn') console.log(`[${line.level}] ${line.text}`);
  check('no console errors', mine.length === 0, String(mine.length));
} catch (err) {
  console.error('flow stopped:', err.message);
  for (const line of browser.lines) if (line.level === 'error' || line.level === 'warn') console.log(`[${line.level}] ${line.text}`);
  failed++;
} finally {
  await browser.close();
}
console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
process.exitCode = failed ? 1 : 0;
