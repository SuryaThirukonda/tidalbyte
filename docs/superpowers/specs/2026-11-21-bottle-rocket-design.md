# Bottle Rocket: design

A new game for the WishWorld web build (`wishworld-web`). The child scans a water bottle from their room with the
existing phone scan, it becomes a bottle rocket, and they pilot it through missions that each teach one idea:
thrust, pitch, yaw, roll, then lift and drag.

## Decisions

| Question | Choice |
|---|---|
| Platform | Web build first (`wishworld-web/public/vr`). Unity is not in scope. |
| Core loop | The child pilots the rocket live (not set-up-and-launch). |
| Setting | Starts in the real room (AR / passthrough), then a "Go outside" moment opens a VR sky field. |
| Bottle | The existing phone photo-to-3D scan, reused unchanged. No new scan feature. |
| Lesson depth | Ages about 6 to 12: feel it, then name it. One-sentence guide lines and labelled force arrows, no numbers or formulas. |
| Flight model | Our own simple force model, not a physics engine and not on rails. |

## Player experience

1. The child opens **Bottle Rocket** from the tab menu.
2. **Scan your bottle.** This runs the existing toy-scan flow (phone Scan tab -> 3D model). The returned model
   becomes the rocket body with a nose cone, four fins (two big peach side fins that must line up with slots, two small ones) and a nozzle attached. **Use a practice bottle** skips the
   scan, and the built-in bottle also stands in while the model is being made, or if the scan fails or times out.
3. The rocket stands on a launch pad in front of the child, and the missions begin.

### Controls (work seated)

| Input | Headset | Laptop / play mode |
|---|---|---|
| Pitch (nose up or down) | Tip the right controller forward or back | Mouse up / down (or W / S) |
| Yaw (nose left or right) | Twist the controller left or right | Mouse left / right (or A / D) |
| Roll (spin about the nose) | Rotate the wrist | Q / E |
| Thrust | Hold the trigger | Hold the left mouse button |
| Force arrows on or off | Grip, or the Force arrows button | G, or the button |

(A is push-to-talk, B and X open the menu, and Space and F are taken by the shell's play and desktop modes, so the
game does not use them.)

The controller's orientation relative to its orientation at launch is the target attitude. The rocket turns toward
it smoothly, at a limited turn rate. Controls that are not unlocked yet are ignored.

Thrust uses water from a tank (a gauge on the HUD). When the tank is empty, thrust stops. Gravity and drag take over.
Whenever the rocket falls while not firing, a parachute opens so it drifts down slowly, and firing again closes it.
The rocket cannot steer under the parachute. Landing on any surface (floor or pad) ends the flight. The tank refills
on the pad.

### Missions

Each mission unlocks one more control, opens with one guide line (`ctx.say`), and is won by passing through its
rings in order. A failed flight (water gone, rings missed, or landed) shows **Try again**. Both rings and the pad
reset.

| # | Where | Idea | Unlocked | Goal | Guide line (draft) |
|---|---|---|---|---|---|
| 1 | Room | Thrust vs weight | Thrust | Rise straight up through one ring about 1.2 m above the pad | "Thrust pushes your rocket. Push harder than gravity pulls, and up you go!" |
| 2 | Room | Pitch | + pitch | Ring about 1.5 m ahead at head height | "Tip the nose to point where you want to go. That's pitch!" |
| 3 | Room | Yaw | + yaw | Two rings, one off to each side | "Twist to turn left and right. That's called yaw!" |
| 4 | Room | Roll | + roll | A tilted slot ring that only fits when rolled to match | "Roll spins your rocket around its nose. Tilt to fit through!" |
| 5 | Sky | Lift and drag | all | Long glide course: fly fast through the rings, then run dry and parachute onto a target | "Out here you can go fast! Fins make lift so you can steer, and air drag slows you down." |
| 6 | Sky | All together | all | Ring course, then land on the pad | "You know it all now. Fly the course and land on the pad!" |

Between missions 4 and 5, a **Go outside** button fades to white and switches to the sky field: an opaque sky
sphere, a snowy ground and clouds that the game draws itself, so it covers the room in AR passthrough as well. In the
sky the numbers are half real scale, the rocket is drawn 8 times bigger, and the course fits inside about 120 m. The
viewer stays on a fixed spot behind the pad (no chase camera, for comfort in bed). In the room the child watches from
where they sit.

Progress (which missions are done) is kept for the session only. Saving between visits is out of scope.

### Force arrows

A toggle shows four labelled, coloured arrows on the rocket: **thrust** (along the nose, only while firing),
**weight** (straight down), **lift** (from the fins, sideways to the motion) and **drag** (against the motion).
Arrow length follows the force from `flight.js`, clamped so the arrows stay readable. They are on by default in
missions 1 and 5, where those forces are the lesson.

## Architecture

The layout follows Frost Slice: a thin tab module and a game folder.

```
wishworld-web/public/vr/tabs/rocket.js     meta { id: 'rocket', label: 'Bottle Rocket' }; returns createRocketGame(ctx)
wishworld-web/public/vr/tabs/tabs.json     add "rocket"
wishworld-web/public/vr/games/rocket/
  game.js       the tab object (enter, exit, update, input handlers); mission flow; room <-> sky switch
  flight.js     pure flight model (no scene, no DOM): createState(), step(state, input, dt, params) -> state
  controls.js   headset pose / laptop keys -> { pitch, yaw, roll, thrust } target, with smoothing and unlock mask
  missions.js   the six missions as data: place, unlocked controls, ring layout, guide line, win test, arrows default
  course.js     builds the rings, slots and pad for a mission; detects pass-through in order
  rocket.js     assembles the rocket: body (scanned model or built-in bottle) + nose cone, fins, nozzle, spray, parachute
  forces.js     the four force arrows, fed by the forces flight.js reports each step
  hud.js        water gauge, mission card, buttons (Scan your bottle, Use a practice bottle, Try again, Go outside)
  dev/check.mjs Node checks (see Testing)
```

### Units and boundaries

- **flight.js** is the only place physics lives. State: position, velocity, orientation (quaternion), water left,
  parachute open, landed. Input: target attitude and thrust on or off. Each step: turn toward the target (limited
  turn rate, more authority at higher speed, which is the lesson of mission 5), then sum the forces: thrust along
  the nose while water remains, weight, drag opposite velocity (much larger with the parachute open), and fin lift
  that pulls the velocity toward the nose direction. Integrate, then report the four forces for `forces.js`.
  `params` sets the scale (room or sky), so one model serves both. It imports only three.js math types.
- **controls.js** knows about controllers and keys, not about physics.
- **missions.js** is data. Adding a mission means adding an entry, not code.
- **game.js** wires them together and talks to `ctx` (environment, say, haptics, switchTab).

### Reusing the scan

Nothing in the scan pipeline (phone Scan tab, `/api/scan`, gifts, TRELLIS) changes. `game.js` calls the existing
`createToyScan` from `/vr/core/toyscan.js`, as `reef.js` does, and passes a `takeToy(model, gift)` callback that
hands the model to `rocket.js` instead of making it a companion. `rocket.js` then:

1. measures the model's bounding box and turns it so the longest axis is the rocket's nose axis (+Y on the pad),
2. scales it to bottle length (about 0.30 m in the room),
3. adds the nose cone on top and the fins and nozzle at the bottom of the box.

`createToyScan` gets two optional options, `words` (what the scan says and shows) and `fallbackToy` (used
instead of Bubby). Their defaults are the current text and Bubby, so the Reef is unchanged. The rocket passes
bottle wording ("Hold your bottle up in front of me!") and the practice bottle as its fallback.

### Room placement

In AR nothing is recentred, so the pad, rings and rocket are placed from `ctx.viewerPosition()` and
`ctx.viewerForward()` when the tab is entered and again in `onRecenter()`: the pad about 0.8 m ahead of the viewer
and 0.3 m below eye height, so it suits someone sitting in bed.

## Error handling

- Scan model fails to load or never arrives: the built-in bottle, with a guide line ("Let's fly this practice
  bottle!"). The game never waits on the scan.
- A scanned model that is very thin, very flat or huge: it is fitted by its bounding box, so it is always bottle-sized.
  If one dimension is under 10% of the longest, the built-in bottle is used.
- The rocket leaves the play area (room: more than 4 m from the pad; sky: past the course bounds): the flight ends
  with "Whoa, too far! Let's try again."
- Frame hitches: `flight.js` steps at a fixed 1/120 s internally, so a long frame does not tunnel through rings.

## Testing

- `games/rocket/dev/check.mjs`, run with Node against `flight.js` and `missions.js`, no browser needed:
  - a full tank with thrust held lifts off (thrust beats weight) and an empty tank does not;
  - pitch, yaw and roll inputs each change the orientation about the right axis, and locked controls do nothing;
  - with the parachute open, the descent speed stays under a small limit;
  - a scripted autopilot flies every mission and passes its rings in order.
- In the browser through the existing dev harness: `/vr/?tab=rocket&autoplay=1` (dev only) flies each mission on
  its own, with a screenshot per mission saved under `Logs/verification/rocket/`. Also `&standins=1` (built-in bottle)
  and one run with a real scanned model.
- By hand on the Quest: the seated controls feel right and the room placement fits a bed.

## Out of scope

- The Unity headset game.
- Saving mission progress between visits.
- Numbers, dashboards and formulas (this could be a later "older kids" mode).
- Any change to how scanning works.

## As built (2026-11-21)

Where the code ended up differing from the design above. The code is the reference.

- **Missions.** Room rings: mission 1 straight up at 0.8 m above the pad; mission 2 at 1.2 m ahead, 0.6 m up; mission 3
  at (-0.8, 0.6, -1.0) then (0.5, 0.7, -2.0), angled; mission 4 a slot turned 60°, 0.5 x 0.16 m. Sky: mission 5 lands
  in a 20 m circle at 105 m, and mission 6 lands in a 10 m circle (not on the pad), with one ring moved to (-12, 22, -60)
  so the turn is flyable. Sky water is 12 s (the autopilot finishes the sky rings with at least 30% left).
- **Fail reasons.** `far` (room 4 m, sky 160 m from the pad), `landed` (down before the last ring), `missed` (outside
  the landing circle) and `empty` (the tank ran dry without the rocket ever leaving the pad). Each has its own line.
- **Pad.** The pad is solid until the rocket has risen 3 cm (room) or 1 m (sky). A short tap leaves the rocket on
  the pad with the rest of its water, and after a moment the buttons come back with "Hold the trigger to fly!".
- **Parachute.** Under the parachute the rocket swings back upright (keeping its heading) but still cannot steer.
  After a win the rocket keeps falling on its parachute instead of freezing in the air.
- **Controls.** Launch needs a fresh trigger press after any button press. If only the left controller is tracked,
  it flies the rocket. B or X brings the pointers back mid-flight.
- **Force arrows** draw on top of everything (they show through the bottle). The button is hidden in flight; the
  grip (G on a laptop) still toggles them.
- **Scan.** `createToyScan` takes `words` and `fallbackToy`. A scan that comes back as a library creature (the
  server's two-minute fallback) or a model too thin to fit uses the practice bottle, with a line saying so.
- **Progress** is kept while the app is open: coming back to the tab resumes at the furthest mission reached.
- **Files beyond the plan's list:** `math.js`, `attitude.js`, `rings.js`, `run.js`, `autopilot.js` and `sky.js`. The
  Node checks are `dev/sim.test.mjs`; `dev/check.mjs start|autoplay <out-dir>` is the headless browser check.
  `&standins=1` is not implemented: the practice bottle already plays without any model file.
