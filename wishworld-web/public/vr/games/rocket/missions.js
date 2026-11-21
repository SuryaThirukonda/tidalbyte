// The six Bottle Rocket missions. Data only: add a mission by adding an entry.
// Room coordinates are metres from the pad top, -Z away from the child, +Y up. Sky coordinates are metres from the
// sky pad (see flight.js SKY). Each mission unlocks one more control; the guide says `line` when it starts.
//   rings    flown through in order (see rings.js)
//   landing  optional: after the last ring, land within `radius` of `at` to win
//   arrows   whether the force arrows start switched on

const unit = (x, y, z) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; };
const LOCKED = { pitch: false, yaw: false, roll: false };

export const MISSIONS = [
  {
    id: 'thrust', title: 'Thrust', place: 'room', unlocked: { ...LOCKED }, arrows: true,
    line: 'Thrust pushes your rocket. Push harder than gravity pulls, and up you go!',
    tip: 'Hold the trigger to squirt water out of the bottom. Fly up through the ring!',
    win: 'Liftoff! Thrust beat gravity!',
    rings: [{ at: [0, 0.8, 0], facing: [0, 1, 0], radius: 0.25 }],
  },
  {
    id: 'pitch', title: 'Pitch', place: 'room', unlocked: { pitch: true, yaw: false, roll: false }, arrows: false,
    line: "Tip the nose to point where you want to go. That's pitch!",
    tip: 'Tip your controller forward to tip the nose, then fly through the ring.',
    win: 'Great pitching!',
    rings: [{ at: [0, 0.6, -1.2], facing: [0, 0, -1], radius: 0.28 }],
  },
  {
    id: 'yaw', title: 'Yaw', place: 'room', unlocked: { pitch: true, yaw: true, roll: false }, arrows: false,
    line: "Twist to turn left and right. That's called yaw!",
    tip: 'Twist your controller left or right to turn. Left ring first!',
    win: 'You turned like a pro!',
    rings: [
      { at: [-0.8, 0.6, -1.0], facing: unit(-0.6, 0, -0.8), radius: 0.3 },
      { at: [0.5, 0.7, -2.0], facing: unit(0.6, 0, -0.8), radius: 0.3 },
    ],
  },
  {
    id: 'roll', title: 'Roll', place: 'room', unlocked: { pitch: true, yaw: true, roll: true }, arrows: false,
    line: 'Roll spins your rocket around its nose. Tilt to fit through!',
    tip: 'Rotate your wrist until the big orange fins match the slot.',
    win: 'Perfect fit!',
    rings: [{ at: [0, 0.6, -1.3], facing: [0, 0, -1], radius: 0.35, slot: { width: 0.5, height: 0.16, angle: 60 } }],
  },
  {
    id: 'liftdrag', title: 'Lift and Drag', place: 'sky', unlocked: { pitch: true, yaw: true, roll: true }, arrows: true,
    line: 'Out here you can go fast! Fins make lift so you can steer, and air drag slows you down.',
    tip: 'Fly through both rings, then let go of the trigger to open the parachute over the circle.',
    win: 'Soft landing! Drag slowed you down.',
    rings: [
      { at: [0, 18, -35], facing: unit(0, 0.3, -1), radius: 6 },
      { at: [0, 24, -70], facing: [0, 0, -1], radius: 6 },
    ],
    landing: { at: [0, 0, -105], radius: 20 },
  },
  {
    id: 'course', title: 'Sky Course', place: 'sky', unlocked: { pitch: true, yaw: true, roll: true }, arrows: false,
    line: 'You know it all now. Fly the course and land in the circle!',
    tip: 'Rings, a slot, then let go to land in the circle.',
    win: "You're a rocket scientist!",
    rings: [
      { at: [0, 15, -30], facing: [0, 0, -1], radius: 6 },
      { at: [-12, 22, -60], facing: unit(-0.5, 0, -0.85), radius: 6 },
      { at: [0, 26, -90], facing: [0, 0, -1], radius: 7, slot: { width: 11, height: 3.5, angle: 90 } },
    ],
    landing: { at: [8, 0, -120], radius: 10 },
  },
];

export const FAIL_LINES = {
  far: "Whoa, too far! Let's try again.",
  landed: "Down it came! Try again, you've got this.",
  missed: 'So close! Try to land inside the circle.',
  empty: "Out of water! Let's fill it up and try again.",
};
