// Snow Hoops contest rules, the Wii-style 3-point contest: 5 racks of 5 balls at 5 spots, the 5th ball of each
// rack is the money ball (2 points instead of 1), one round clock. Plain state, no three.js: tested in Node.
//
//   const c = createContest(CONTEST, 60);
//   c.start();                          // phase 'ready' (the guide talks), then c.go() -> 'playing'
//   const ball = c.take();              // a ball off the rack (null when the rack is empty)
//   c.putBack(ball);                    // let go gently by the rack: not a shot
//   c.throwBall(ball);                  // it is a shot now
//   c.resolve(ball, made);              // it landed -> points it scored
//   c.rackDone()                        // every ball of this rack thrown and landed (or the wait ran out)
//   c.beginMove() / c.arrived()         // the fade to the next spot (the clock keeps running)
//   c.tick(dt)                          // -> 'buzzer' when the clock runs out, 'over' when the grace after it ends
//                                       //    (read c.phase: it can be 'over' straight after 'buzzer')
//
// Phases: 'idle' -> 'ready' -> 'playing' <-> 'moving' -> ('buzzer' ->) 'over'.

export function createContest(rules, roundSeconds = rules.roundSeconds) {
  const { racks, perRack } = rules;
  const moneyIndex = perRack - 1;
  let phase = 'idle';
  let rack = 0, taken = 0, thrown = 0, landed = 0, rackDoneAt = -1;
  let score = 0, makes = 0, moneyMakes = 0, shots = 0, timeLeft = roundSeconds, grace = 0, endedBy = null;
  let inAir = 0;
  // per rack, per ball: 0 waiting, 1 in hand, 2 in the air, 3 made, 4 missed
  const balls = [];
  for (let r = 0; r < racks; r++) balls.push(new Array(perRack).fill(0));

  const max = racks * ((perRack - 1) * rules.points.normal + rules.points.money);

  function finish(why) {
    phase = 'over';
    endedBy = why;
    return 'over';
  }

  return {
    get phase() { return phase; },
    get rack() { return rack; },
    get score() { return score; },
    get timeLeft() { return timeLeft; },
    get max() { return max; },

    start() {
      phase = 'ready';
      rack = 0; taken = 0; thrown = 0; landed = 0; rackDoneAt = -1;
      score = 0; makes = 0; moneyMakes = 0; shots = 0; timeLeft = roundSeconds; grace = 0; endedBy = null; inAir = 0;
      for (const row of balls) row.fill(0);
    },
    go() { if (phase === 'ready') phase = 'playing'; },

    /** The next ball off the current rack, or null. { rack, index, money, points } */
    take() {
      if (phase !== 'playing' || taken >= perRack) return null;
      const index = taken++;
      balls[rack][index] = 1;
      const money = index === moneyIndex;
      return { rack, index, money, points: money ? rules.points.money : rules.points.normal, thrown: false, done: false };
    },
    /** A ball let go gently by the rack goes back on it (it must be the last one taken). */
    putBack(ball) {
      if (!ball || ball.thrown || ball.done || ball.rack !== rack || ball.index !== taken - 1) return false;
      taken--;
      balls[rack][ball.index] = 0;
      ball.done = true;
      return true;
    },
    throwBall(ball, clock = 0) {
      if (!ball || ball.thrown || ball.done) return false;
      ball.thrown = true;
      balls[ball.rack][ball.index] = 2;
      shots++; inAir++;
      if (ball.rack === rack) { thrown++; if (thrown >= perRack) rackDoneAt = clock; }
      return true;
    },
    /** It landed. Points only for a ball thrown before the buzzer (it may land after). */
    resolve(ball, made) {
      if (!ball || ball.done) return 0;
      ball.done = true;
      if (ball.thrown) inAir = Math.max(0, inAir - 1);
      if (ball.rack === rack) landed++;
      balls[ball.rack][ball.index] = made ? 3 : 4;
      if (!made || !ball.thrown) return 0;
      makes++;
      if (ball.money) moneyMakes++;
      score += ball.points;
      return ball.points;
    },
    /** A ball still in a hand when the round ends: it was never a shot. */
    drop(ball) { if (ball && !ball.done) { ball.done = true; balls[ball.rack][ball.index] = 0; } },

    /** Every ball of the current rack has been thrown and has landed, or the rack's wait has run out. */
    rackDone(clock = 0) {
      if (phase !== 'playing' || thrown < perRack) return false;
      return landed >= perRack || clock - rackDoneAt >= rules.rackAdvanceAfter;
    },
    get lastRack() { return rack >= racks - 1; },
    /** Leave the finished rack. The last rack ends the round. */
    beginMove() {
      if (phase !== 'playing') return phase;
      if (rack >= racks - 1) return finish('all');
      phase = 'moving';
      return phase;
    },
    arrived() {
      if (phase !== 'moving') return false;
      rack++; taken = 0; thrown = 0; landed = 0; rackDoneAt = -1;
      phase = 'playing';
      return true;
    },

    /** The round clock. Runs while playing and while moving between spots. */
    tick(dt) {
      if (phase === 'playing' || phase === 'moving') {
        timeLeft -= dt;
        if (timeLeft <= 0) {
          timeLeft = 0;
          phase = 'buzzer';
          grace = rules.buzzerGrace;
          if (inAir === 0) finish('time');      // nothing in the air: the round is over at once
          return 'buzzer';
        }
      } else if (phase === 'buzzer') {
        grace -= dt;
        if (inAir === 0 || grace <= 0) return finish('time');
      }
      return null;
    },
    setTimeLeft(s) { timeLeft = s; },
    /** End now (leaving the tab). */
    stop() { if (phase !== 'idle') finish('stopped'); },

    state() {
      return {
        phase, rack, taken, thrown, landed, score, makes, moneyMakes, shots, timeLeft, inAir, endedBy, max,
        ballsLeft: perRack - taken, balls: balls.map((row) => row.slice()),
      };
    },
  };
}
