// Snow Hoops: every number and string of the game in one place. Tune here.
//
// World frame (the shell's): one unit is one metre, the floor is y = 0. The hoop stands over HOOP (on the floor),
// its backboard on the far side (-Z), and the five spots lie on an arc in front of it (+Z). Spot 2, the top of
// the key, is the shell's origin, so the player starts each visit already facing the hoop.

export const COURT = {
  hoop: [0, 0, -4.2],            // the floor point under the rim's centre
  rimHeight: 2.6,                // a real hoop is 3.05 m; lowered for children (agreed in the plan)
  rimRadius: 0.2385,             // centre of the rim's tube (a real rim: 0.4572 m inside, 0.02 m tube)
  rimTube: 0.01,
  rimSegments: 24,               // the torus is these many straight segments for collisions
  board: { offset: 0.15, width: 1.2, height: 0.8, below: 0.15, thickness: 0.04 },   // rim to board, size, how far below the rim it starts
  arcRadius: 4.2,                // spots, from the floor point under the rim (the NBA's line is 6.75 m)
  spotAngles: [-75, -40, 0, 40, 75],   // degrees from straight out; negative is the player's left as they face the hoop
  spotNames: ['Left corner', 'Left wing', 'Top', 'Right wing', 'Right corner'],
};

export const BALL = {
  size: 0.24,                    // largest bounding dimension of the visual (a basketball is 0.24 m)
  radius: 0.12,                  // the physics sphere, whatever the mesh's shape
  rackTriangleBudget: 70000,     // the rack shows only as many balls at once as fit in this (scans are ~19k)
  spinRevsPerSecond: 2.2,        // backspin in flight (visual only)
};

export const PHYSICS = {
  gravity: 9.81,
  drag: 0.05,                    // per second: v *= 1 - drag * dt
  substep: 1 / 240,
  maxFrame: 1 / 30,              // a long frame is clamped, never simulated in one leap
  rimRestitution: 0.55, rimFriction: 0.85,
  boardRestitution: 0.6, boardFriction: 0.9,
  floorRestitution: 0.55, floorFriction: 0.8,
  settleBounces: 2,              // a ball is done after this many floor bounces...
  maxLife: 4.5,                  // ...or this many seconds
};

export const THROW = {
  velocityWindow: 0.09,          // s: the release velocity is the hand's average over this much tracked motion
  trackSamples: 24,
  idealElevation: 55,            // degrees: the arc the aim assist blends toward
  assist: 0.35,                  // 0 = off, 1 = every throw toward the hoop is perfect
  assistCone: 35,                // degrees: only a throw this close to the hoop's direction (seen from above) is helped
  assistMinSpeed: 2.0,           // m/s: slower than this is a drop, not a throw, and is not helped
  putBackSpeed: 0.6,             // m/s: a ball let go this gently near the rack goes back on it
  putBackDistance: 0.35,
  grabRadius: 0.25,              // m from the hand to the front ball
  holdOffset: [0, -0.02, -0.06], // the ball's centre in the grip's frame
  desktop: {                     // mouse: press to pick up, drag up for power and sideways to aim, let go to shoot
    restPower: 0.6, powerPerScreen: 1.2, minPower: 0.4, maxPower: 1.4,   // 1.0 is the ideal arc's speed
    yawPerScreen: 40,            // degrees across the whole width
    previewSeconds: 0.45,        // the dotted aim line shows this much of the flight
  },
};

export const CONTEST = {
  racks: 5,
  perRack: 5,
  roundSeconds: 60,
  points: { normal: 1, money: 2 },   // the 5th ball of each rack is the money ball: max 5 * (4 + 2) = 30
  buzzerGrace: 3,                // s after the buzzer for balls already in the air to land
  rackAdvanceAfter: 2.5,         // s after the rack's last throw, move on even if a ball is still rolling
  readySeconds: 1.6,             // between arriving at the first spot and "Go!"
  fadeOut: 0.18, fadeIn: 0.25,   // the white fade between spots
  bestKey: 'SnowHoopsBest',
};

export const HAPTIC = {                  // strength 0..1, milliseconds
  grab: [0.5, 40],
  release: [0.7, 60],
  swish: [1.0, 120],
  rim: [0.6, 50],
};

export const VOLUME = { swish: 0.7, clank: 0.6, buzzer: 0.8, grab: 0.35, money: 0.6, end: 0.6, board: 0.4 };

export const LAYOUT = {
  rack: { side: 0.32, ahead: 0.22, spacing: 0.27, rise: 0.03, waistOfHead: 0.55, waistMin: 0.7, waistMax: 1.05 },
  picker: { distance: 1.3, y: 1.42 },
  results: { distance: 1.25, y: 1.55 },
  scoreboard: { above: 0.32, size: [1.3, 0.5] },   // its centre this far above the top of the backboard
};

export const COLORS = {
  rim: [0.98, 0.45, 0.16],
  board: [0.97, 0.98, 1.0],
  boardLine: [0.98, 0.45, 0.16],
  pole: [0.20, 0.25, 0.32],
  base: [0.45, 0.55, 0.66],
  net: [0.98, 0.99, 1.0],
  spot: [0.56, 0.69, 0.83],
  spotNext: [1.00, 0.72, 0.55],
  arc: [0.74, 0.86, 0.97],
  gold: [1.0, 0.78, 0.22],
  ice: [0.80, 0.93, 1.0],
  made: [0.40, 0.75, 0.45],
  missed: [0.62, 0.67, 0.74],
};

export const TEXT = {
  title: 'Snow Hoops',
  pick: 'Pick your ball',
  scan: 'Scan something new',
  bringBubby: 'Bring Bubby',
  home: 'Home',
  again: 'Play again',
  timeUp: 'Time!',
  allDone: 'All 25 shot!',
  // Lines for the guide. "Ooh, gold!" and "Go!" are in the recorded voice bank; the two others are short and fixed,
  // so text-to-speech is asked once each per session at most.
  intro: 'Snow Hoops! Grab a ball and shoot it into the hoop.',
  go: 'Go!',
  money: 'Ooh, gold!',
  end: 'Time! Great shooting!',
  score: (s) => 'Score ' + s,
  time: (t) => Math.ceil(Math.max(0, t)) + 's',
  rack: (r, n) => 'Rack ' + (r + 1) + '/' + n,
  result: (score, max, made, shots, best, isNew) => `Score ${score} of ${max}\nBaskets ${made} of ${shots}\nBest ${best}${isNew ? '  (new best!)' : ''}`,
};
