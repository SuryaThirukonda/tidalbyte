// Frost Slice: every number and string of the Unity game, in one place.
// Sources: Assets/WishWorld/Scripts/Games/FrostSliceGame.cs and Assets/WishWorld/Editor/Builder.Games.cs.
//
// Coordinates here are the game's own "stage" frame: the player stands at the origin, +Y is up and the
// fruit comes from +Z (ahead). It is the frame of the exported .glb files (Unity with x negated). Every x
// range in the rules is symmetric, so the numbers are Unity's as written.

/** name, skin, flesh (sRGB 0..1), base radius, points, shape: Builder.Games.cs `Fruits`. */
const TABLE = [
  ['Apple', [0.86, 0.16, 0.18], [0.98, 0.95, 0.80], 0.058, 10, [1, 0.92, 1]],
  ['Orange', [0.98, 0.58, 0.12], [1.00, 0.76, 0.36], 0.058, 10, [1, 0.95, 1]],
  ['Watermelon', [0.22, 0.55, 0.25], [0.95, 0.30, 0.35], 0.105, 10, [1, 0.9, 1.25]],
  ['Lemon', [0.98, 0.88, 0.25], [1.00, 0.97, 0.70], 0.052, 15, [0.85, 0.85, 1.3]],
  ['Pear', [0.55, 0.75, 0.30], [0.97, 0.96, 0.78], 0.062, 15, [0.8, 1.2, 0.8]],
  ['Coconut', [0.45, 0.30, 0.20], [0.99, 0.98, 0.94], 0.066, 20, [1, 1, 1]],
];

const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** FrostSliceGame.FruitKind, as BuildFrostSliceSceneImpl fills it in. */
export const FRUITS = TABLE.map(([name, skin, flesh, radius, points, shape]) => ({
  name,
  id: name.toLowerCase(),
  whole: `/models/fruit_${name.toLowerCase()}.glb`,
  half: `/models/fruit_half_${name.toLowerCase()}.glb`,
  skin, flesh, shape,
  size: [shape[0] * radius * 2, shape[1] * radius * 2, shape[2] * radius * 2],
  juice: lerp3(flesh, skin, 0.4),                          // Color.Lerp(flesh, skin, 0.4)
  radius: radius * Math.max(shape[0], shape[2]),           // the hit radius
  points,
}));

export const RULES = {
  roundSeconds: 60,
  startLives: 3,
  minSliceSpeed: 1.6,            // blade tip speed, m/s, needed for a cut
  reachPadding: 0.025,           // a cut lands within fruit radius + this of the blade
  firstWave: 0.8,                // seconds into the round
  waveSpacing: 0.28,             // between two fruit of one wave
  wavePauseStart: 2.6, wavePauseEnd: 1.7,
  hazardAfter: 8,                // seconds before the first ice block can come
  hazardChance: 0.16,
  hazardRadius: 0.075,
  comboWindow: 0.3,              // seconds between cuts of one blade that still count as one swing
  launch: {
    startX: [-0.45, 0.45], startY: 0.35, startZ: [1.5, 2.0],
    targetX: [-0.38, 0.38], targetY: [1.1, 1.55], targetZ: [0.45, 0.62],
    apexTime: [1.0, 1.25],
    spin: 180,                   // degrees per second, each axis
    scannedRoll: [25, 70],       // a scanned (flat) fruit only rolls, degrees per second
    scannedWobble: 14,           // and sways about its upright axis by this many degrees
    floorCutoff: 0.15,           // a falling fruit is removed below this height
  },
  shadow: { radiusScale: 1.3, maxHeight: 2.2, lift: 0.012 },
  debris: { life: 1.3, gravity: 6, swing: 1.3, apart: 0.9, up: 0.5, spin: 300, offset: 0.25, shrinkAt: 0.3, shrinkRate: 3 },
  juice: { count: 14, life: [0.4, 0.7], speed: [0.8, 2.2], size: [0.018, 0.04], gravity: 1.2 * 9.81, radius: 0.03, max: 140 },
  popup: { life: 1.0, lift: 0.08, textHeight: 0.05, padding: 0.022, tilt: 9, kick: 0.22 },
  haptic: { fruit: [0.6, 60], hazard: [1.0, 250] },        // strength, milliseconds
  volume: { pop: 0.35, slice: 0.8, buzz: 0.7, success: 0.6 },
  blade: { length: 0.64, trailTime: 0.16, trailWidth: 0.04, trailMinStep: 0.01 },
  bestKey: 'FrostSliceBest',
};

/** Scene layout, stage frame (BuildUi and BuildFrostSliceSceneImpl). */
export const LAYOUT = {
  menu: { position: [0, 1.4, 1.35], size: [0.9, 0.56] },
  hud: { position: [0, 2.05, 2.5], size: [1.1, 0.3], tiltDegrees: 12 },
  successSound: [0, 1.4, 0],
  // Sun at Euler(50, -30, 0), white, intensity 1; flat ambient (0.72, 0.72, 0.74); no fog; sky: the hub's.
  toSun: [-0.32139, 0.76604, -0.55667],
  ambient: [0.72, 0.72, 0.74],
  // Desktop stand-in (DesktopInputSource): the active hand rides the cursor ray, the other rests low.
  desktopReach: 0.5,
  desktopRest: { side: 0.24, down: 0.38, ahead: 0.32, pitchUpDegrees: 20 },
};

export const COLORS = {
  ice: [0.74, 0.90, 1.00],            // blades, trail, the ice-block burst is a touch greyer:
  iceBurst: [0.75, 0.9, 1.0],
  ouch: [0.85, 0.2, 0.2],
  slate: [0.20, 0.25, 0.32],
  peach: [1.00, 0.72, 0.55],
  panel: [0.93, 0.95, 0.97],
  button: [0.82, 0.88, 0.94],
  iceLine: [0.56, 0.69, 0.83],
  shade: [0.47, 0.55, 0.66],
  snow: [0.95, 0.97, 0.99],
  snowShade: [0.84, 0.89, 0.95],
  snowWhite: [0.985, 0.99, 1.0],
  frostBlue: [0.80, 0.87, 0.95],
  shadow: [0x0a / 255, 0x0f / 255, 0x1f / 255],
  shadowAlpha: 0.46,
};

export const TEXT = {
  title: 'Frost Slice',
  info: 'Swing the controllers to slice the fruit.\nLeave the ice blocks alone!',
  infoScanned: 'Swing the controllers to slice your fruit.\nLeave the ice blocks alone!',
  fruitReady: 'Your scanned fruit is ready!',
  fruitNext: 'Your scanned fruit is ready! Next round.',
  start: 'Start',
  again: 'Play again',
  hub: 'Hub',
  intro: 'Frost Slice. Swing the controllers to slice the fruit. Leave the ice blocks alone!',
  go: 'Slice the fruit! Leave the ice alone.',
  combo3: 'What a swing!',
  newBest: 'A new best score! Amazing slicing.',
  niceRound: 'Nice slicing! Want another go?',
  timeUp: 'Time!',
  outOfLives: 'Out of lives',
  ouch: 'Ouch!',
  score: (score, best, isNew) => 'Score ' + score + '\nBest ' + best + (isNew ? '  (new best!)' : ''),
  readOut: (title, score, best) => title + ' Score ' + score + '. Best ' + best + '.',
  popup: (combo, gained) => (combo > 1 ? 'Combo x' + combo + '  +' + gained : '+' + gained),
  lives: (n) => 'Lives ' + Math.max(0, n),
  time: (seconds) => Math.ceil(seconds) + 's',
};
