// Snow Hoops checks that need no browser: scoring (normal vs money ball), rack progression, the clock ending the
// round, the hand-velocity tracker, the ball physics and aim assist, and that any model (a scan of ~19,000
// triangles, lopsided and off-centre) is made ball-sized with its pivot in the middle.
//
//   node --import ./three-loader.mjs rules.test.mjs        (from this folder; the loader maps 'three' to /vendor)
//
// Exit code 0 when everything passes.

import { COURT, BALL, PHYSICS, THROW, CONTEST } from '../rules.js';
import { makeCourt, makeBall, launchBall, advance, isSettled, idealVelocity, assistThrow, yawVelocity, HIT } from '../physics.js';
import { createContest } from '../contest.js';
import { createTracker } from '../tracker.js';

let failed = 0;
const expect = (ok, what) => { console.log((ok ? '  ok   ' : '  FAIL ') + what); if (!ok) failed++; };
const near = (a, b, eps) => Math.abs(a - b) <= eps;

const court = makeCourt(COURT, BALL, PHYSICS);
const HAND_Y = 1.35;

/** Fly one ball to the end; -> { made, hits } */
function fly(x, y, z, v) {
  const b = launchBall(makeBall(), x, y, z, v.x, v.y, v.z);
  let hits = 0;
  for (let i = 0; i < 2000 && !isSettled(b, court); i++) hits |= advance(b, court, 1 / 72);
  return { made: b.made, hits, ball: b };
}

// ------------------------------------------------------------------------------------------------ physics
console.log('physics');
{
  const v = { x: 0, y: 0, z: 0 };
  court.spots.forEach((s, i) => {
    idealVelocity(court, s.x, HAND_Y, s.z, v, THROW.idealElevation);
    const r = fly(s.x, HAND_Y, s.z, v);
    expect(r.made && !(r.hits & HIT.RIM), `${COURT.spotNames[i]}: the ideal arc (${Math.hypot(v.x, v.y, v.z).toFixed(2)} m/s) is a swish`);
  });
  const top = court.spots[2];
  idealVelocity(court, top.x, HAND_Y, top.z, v, THROW.idealElevation);
  const short = fly(top.x, HAND_Y, top.z, { x: v.x * 0.8, y: v.y * 0.8, z: v.z * 0.8 });
  expect(!short.made, 'a throw at 80% of the ideal speed falls short');
  const long = fly(top.x, HAND_Y, top.z, { x: v.x * 1.15, y: v.y * 1.15, z: v.z * 1.15 });
  expect(!long.made, 'a throw at 115% goes long' + (long.hits & HIT.BOARD ? ' (off the board)' : long.hits & HIT.RIM ? ' (off the rim)' : ' (over the board)'));
  const bank = fly(top.x, HAND_Y, top.z, { x: v.x * 1.04, y: v.y * 1.04, z: v.z * 1.04 });
  expect(Boolean(bank.hits & (HIT.BOARD | HIT.RIM)), 'a throw at 104% touches the rim or the board' + (bank.made ? ' and still goes in' : ''));
  // a ball dropped straight down through the middle counts; one rising up through it from below does not
  const drop = fly(court.rim.x, court.rim.y + 0.6, court.rim.z, { x: 0, y: 0, z: 0 });
  expect(drop.made, 'a ball dropped through the middle of the hoop is a basket');
  const up = launchBall(makeBall(), court.rim.x, court.rim.y - 0.8, court.rim.z, 0, 3.2, 0);
  let made = false;
  for (let i = 0; i < 40 && up.vy > 0; i++) { advance(up, court, 1 / 72); made = made || up.made; }
  expect(!made, 'a ball going UP through the hoop is not a basket');
  // a ball dropped onto the rim bounces off it
  const onRim = fly(court.rim.x + court.rimRadius, court.rim.y + 0.5, court.rim.z, { x: 0, y: 0, z: 0 });
  expect(Boolean(onRim.hits & HIT.RIM) && onRim.ball.rimHits > 0, 'a ball dropped on the rim hits it');
  // straight at the board
  const board = fly(court.rim.x, court.board.y0 + 0.4, court.rim.z + 2, { x: 0, y: 2.5, z: -6 });
  expect(Boolean(board.hits & HIT.BOARD), 'a flat throw at the backboard bounces off it');
  expect(board.ball.bounces >= PHYSICS.settleBounces || board.ball.t > PHYSICS.maxLife, 'and settles on the floor');
}

console.log('aim assist');
{
  const top = court.spots[2], ideal = { x: 0, y: 0, z: 0 }, out = { x: 0, y: 0, z: 0 };
  idealVelocity(court, top.x, HAND_Y, top.z, ideal, THROW.idealElevation);
  const opts = { amount: THROW.assist, cone: THROW.assistCone, minSpeed: THROW.assistMinSpeed, elevation: THROW.idealElevation };
  // 10% short and 8 degrees off: misses alone, better with assist
  const raw = yawVelocity({ x: ideal.x * 0.9, y: ideal.y * 0.9, z: ideal.z * 0.9 }, 8);
  const helped = assistThrow(court, top.x, HAND_Y, top.z, raw.x, raw.y, raw.z, out, opts);
  expect(helped, 'a throw roughly at the hoop is helped');
  const errRaw = Math.hypot(raw.x - ideal.x, raw.y - ideal.y, raw.z - ideal.z), errOut = Math.hypot(out.x - ideal.x, out.y - ideal.y, out.z - ideal.z);
  expect(near(errOut, errRaw * (1 - THROW.assist), 1e-6), `it moves ${Math.round(THROW.assist * 100)}% of the way to the ideal arc (error ${errRaw.toFixed(2)} -> ${errOut.toFixed(2)} m/s), not all of it`);
  const side = yawVelocity({ x: ideal.x, y: ideal.y, z: ideal.z }, 60);
  expect(!assistThrow(court, top.x, HAND_Y, top.z, side.x, side.y, side.z, out, opts) && out.x === side.x, 'a throw 60 degrees off to the side is left alone');
  expect(!assistThrow(court, top.x, HAND_Y, top.z, ideal.x, -1, ideal.z, out, opts), 'a throw downward is left alone');
  expect(!assistThrow(court, top.x, HAND_Y, top.z, 0.3, 0.6, -0.5, out, opts), 'a gentle drop is left alone');
  expect(!assistThrow(court, top.x, HAND_Y, top.z, raw.x, raw.y, raw.z, out, { ...opts, amount: 0 }), 'assist 0 turns it off');
  // a child's throw: 5.4 m/s at the ideal angle, 2 degrees off line (the ideal arc needs ~7.6 m/s)
  court.spots.forEach((s, i) => {
    idealVelocity(court, s.x, HAND_Y, s.z, ideal, THROW.idealElevation);
    const k = 5.4 / Math.hypot(ideal.x, ideal.y, ideal.z);
    const kid = yawVelocity({ x: ideal.x * k, y: ideal.y * k, z: ideal.z * k }, 2);
    const alone = fly(s.x, HAND_Y, s.z, kid);
    assistThrow(court, s.x, HAND_Y, s.z, kid.x * THROW.boost, kid.y * THROW.boost, kid.z * THROW.boost, out, opts);
    const helpedKid = fly(s.x, HAND_Y, s.z, out);
    expect(!alone.made && helpedKid.made, `${COURT.spotNames[i]}: a 5.4 m/s throw 2 degrees off misses alone, goes in with the x${THROW.boost} boost and ${Math.round(THROW.assist * 100)}% assist`);
  });
}

// ------------------------------------------------------------------------------------------------ tracker
console.log('release velocity');
{
  const tr = createTracker(THROW.trackSamples), v = { x: 0, y: 0, z: 0 };
  // a hand still for 0.3 s, then a swing at (1, 4, -5) m/s for the last 0.1 s, sampled at 72 Hz
  let t = 0;
  for (; t < 0.3; t += 1 / 72) tr.push(t, 0.3, 1.2, 0);
  const t0 = t;
  for (; t < 0.4; t += 1 / 72) tr.push(t, 0.3 + (t - t0) * 1, 1.2 + (t - t0) * 4, -(t - t0) * 5);
  const last = t - 1 / 72;
  tr.velocity(last, THROW.velocityWindow, v);
  expect(near(v.x, 1, 0.05) && near(v.y, 4, 0.05) && near(v.z, -5, 0.05), `the last ${THROW.velocityWindow * 1000} ms of a swing give its speed: (${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`);
  tr.clear(); tr.push(0, 0, 0, 0); tr.velocity(0, 0.09, v);
  expect(v.x === 0 && v.y === 0 && v.z === 0, 'one sample gives no velocity');
}

// ------------------------------------------------------------------------------------------------ contest
console.log('contest');
{
  const c = createContest(CONTEST, 60);
  c.start();
  expect(c.phase === 'ready' && c.take() === null, 'no ball before "Go!"');
  c.go();
  const balls = [];
  for (let i = 0; i < 5; i++) balls.push(c.take());
  expect(c.take() === null, 'a rack holds 5 balls');
  expect(balls.map((b) => b.money).join() === 'false,false,false,false,true', 'only the 5th ball is the money ball');
  for (const b of balls) c.throwBall(b, 0);
  expect(c.resolve(balls[0], true) === 1, 'a regular ball scores 1');
  expect(c.resolve(balls[0], true) === 0, 'a ball is only counted once');
  expect(c.resolve(balls[1], false) === 0, 'a miss scores 0');
  c.resolve(balls[2], true); c.resolve(balls[3], false);
  expect(!c.rackDone(0.5), 'the rack is not done while a ball is in the air');
  expect(c.resolve(balls[4], true) === 2, 'the money ball scores 2');
  expect(c.score === 4 && c.rackDone(0.5), 'score 4 after 3 of 5 with the money ball; rack done');
  expect(c.beginMove() === 'moving' && c.take() === null, 'moving to the next spot: no balls meanwhile');
  c.tick(0.4);
  expect(near(c.timeLeft, 59.6, 1e-9), 'the clock runs while moving');
  c.arrived();
  expect(c.rack === 1 && c.phase === 'playing' && c.state().ballsLeft === 5, 'arrived at rack 2 with a full rack');

  // put back
  const p = c.take();
  expect(c.putBack(p) && c.state().ballsLeft === 5, 'a ball let go by the rack goes back on it');

  // a rack whose last ball is still rolling moves on after the wait
  const r2 = [];
  for (let i = 0; i < 5; i++) { const b = c.take(); c.throwBall(b, 10); r2.push(b); }
  for (let i = 0; i < 4; i++) c.resolve(r2[i], false);
  expect(!c.rackDone(10 + CONTEST.rackAdvanceAfter - 0.1) && c.rackDone(10 + CONTEST.rackAdvanceAfter), `a rack moves on ${CONTEST.rackAdvanceAfter} s after its last throw even if a ball is still rolling`);
  c.beginMove(); c.arrived();
  expect(c.resolve(r2[4], true) === 2 && c.score === 6, 'that ball (the money ball) still scores 2 if it goes in after the move');

  // a perfect round is 30
  const perfect = createContest(CONTEST, 600);
  perfect.start(); perfect.go();
  for (let r = 0; r < CONTEST.racks; r++) {
    for (let i = 0; i < CONTEST.perRack; i++) { const b = perfect.take(); perfect.throwBall(b, 0); perfect.resolve(b, true); }
    expect(perfect.rackDone(0), `rack ${r + 1} done`);
    const next = perfect.beginMove();
    if (r < CONTEST.racks - 1) { expect(next === 'moving', 'move to spot ' + (r + 2)); perfect.arrived(); }
    else expect(next === 'over' && perfect.state().endedBy === 'all', 'the last rack ends the round');
  }
  expect(perfect.score === 30 && perfect.max === 30, 'every ball in: 30 of 30');

  // the clock ends the round; a ball in the air at the buzzer still counts
  const timed = createContest(CONTEST, 12);
  timed.start(); timed.go();
  const late = timed.take(); timed.throwBall(late, 0);
  const held = timed.take();
  let ev = null;
  for (let i = 0; i < 12 * 72 + 2 && ev !== 'buzzer'; i++) ev = timed.tick(1 / 72);
  expect(ev === 'buzzer' && timed.phase === 'buzzer' && timed.timeLeft === 0, 'a 12 s round sounds the buzzer at 0 s');
  expect(timed.take() === null, 'no new ball after the buzzer');
  expect(timed.resolve(late, true) === 1, 'a ball in the air at the buzzer still counts when it goes in');
  timed.drop(held);
  timed.tick(1 / 72);
  expect(timed.phase === 'over' && timed.state().endedBy === 'time', 'then the round is over');
  const empty = createContest(CONTEST, 1);
  empty.start(); empty.go();
  for (let i = 0; i < 80 && empty.phase !== 'over'; i++) empty.tick(1 / 72);
  expect(empty.phase === 'over', 'with nothing in the air the round ends at the buzzer');
  const grace = createContest(CONTEST, 1);
  grace.start(); grace.go();
  grace.throwBall(grace.take(), 0);
  for (let i = 0; i < (1 + CONTEST.buzzerGrace) * 72 + 4; i++) grace.tick(1 / 72);
  expect(grace.phase === 'over', `a ball that never lands cannot hold the round open past the ${CONTEST.buzzerGrace} s grace`);
}

// ------------------------------------------------------------------------------------------------ the ball's shape
console.log('ball shape');
{
  let THREE, shape;
  try {
    THREE = await import('three');
    shape = await import('../ballshape.js');
  } catch (err) {
    console.log('  FAIL could not load three.js (run with --import ./three-loader.mjs): ' + err.message);
    failed++;
  }
  if (shape) {
    // A stand-in for a scan: 19,200 triangles, 2 x 0.5 x 1 units, far from its own origin, nested and scaled.
    const geometry = new THREE.BoxGeometry(2, 0.5, 1, 40, 40, 40);
    const tris = geometry.index.count / 3;
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    mesh.position.set(5, 3, -2);
    const inner = new THREE.Group(); inner.scale.setScalar(3); inner.rotation.y = 0.4; inner.add(mesh);
    const scan = new THREE.Group(); scan.position.set(-1, 0.5, 2); scan.add(inner);
    const ball = shape.normalizeBall(scan, BALL.size);
    const box = new THREE.Box3().setFromObject(ball, true), size = box.getSize(new THREE.Vector3()), centre = box.getCenter(new THREE.Vector3());
    expect(near(Math.max(size.x, size.y, size.z), BALL.size, 1e-4), `a ${tris}-triangle model comes out ${Math.max(size.x, size.y, size.z).toFixed(4)} m at its largest (${BALL.size})`);
    expect(centre.length() < 1e-4, 'its pivot is at its centre (' + centre.toArray().map((n) => n.toFixed(5)).join(', ') + ')');
    expect(shape.countTriangles(ball) === tris, 'triangles counted: ' + shape.countTriangles(ball));
    expect(scan.position.x === -1 && inner.scale.x === 3, 'the original model is not changed');
    let sharedGeo = true, sharedMat = true;
    const clones = shape.makeRack(ball, 5);
    ball.traverse((o) => { if (!o.isMesh) return; for (const c of clones) c.traverse((k) => { if (k.isMesh) { sharedGeo = sharedGeo && k.geometry === o.geometry; sharedMat = sharedMat && k.material === o.material; } }); });
    expect(clones.length === 5 && sharedGeo && sharedMat, 'a rack of 5 clones shares the geometry and the materials');
    const gold = shape.makeGold(ball, THREE, [1, 0.78, 0.22]);
    const goldA = gold.apply(clones[4].clone(true)), goldB = gold.apply(clones[3].clone(true));
    let mA = null, mB = null;
    goldA.traverse((o) => { if (o.isMesh) mA = o.material; }); goldB.traverse((o) => { if (o.isMesh) mB = o.material; });
    expect(mA && mA === mB && mA !== mesh.material, 'money balls share one gold material, separate from the regular one');
    expect(shape.normalizeBall(new THREE.Group(), BALL.size).children.length >= 0, 'an empty model does not throw');
  }
}

console.log(failed ? `${failed} check(s) FAILED` : 'all checks passed');
process.exitCode = failed ? 1 : 0;
