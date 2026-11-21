# WishWorld headset view: the shell and `ctx`

`/vr/` is one page. `main.js` (the shell) owns the renderer, the WebXR session, the player, input, sound, the UI kit
and the surroundings. Everything a child sees is a **tab**: a module in `/vr/tabs/` that the shell loads from
`/vr/tabs/tabs.json` and hands one object, `ctx`. This file documents `ctx`.

```
vr/
├─ index.html      start page (one Enter button), import map, desktop HUD
├─ main.js         the shell: session, ctx, frame loop
├─ core/
│  ├─ rig.js          the player (Unity XRRig): camera + controllers under one group, recentre, white fade
│  ├─ input.js        controllers, pointer rays, hover, click, poke, buttons, haptics, desktop mouse and keys
│  ├─ ui.js           the Unity cards, buttons, ribbons and bubbles, drawn to canvas textures
│  ├─ audio.js        effects, the recorded voice bank, text-to-speech, one voice channel
│  ├─ environment.js  sky, fog, light, ground and scenery of a Unity world
│  ├─ guide.js        the guide's caption bubble (GuideVoice.Say)
│  ├─ menu.js         the floating tab menu
│  ├─ tabs.js         the tab registry and tab switching
│  ├─ gifts.js        one shared watcher over api.pollGifts
│  ├─ fx.js           snowfall, blob shadows, the soft dot
│  └─ theme.js        the Unity palette and fonts
└─ tabs/           tabs.json + one module per tab
```

## Writing a tab

```js
// /vr/tabs/example.js, and add "example" to /vr/tabs/tabs.json
import * as THREE from 'three';
export const meta = { id: 'example', label: 'Example', order: 9 };     // hidden: true keeps it out of the menus

export function createTab(ctx) {
  const group = new THREE.Group();                       // the shell adds it to the scene and shows it only while active
  const sign = ctx.ui.makeTextPanel('Hello!', { width: 0.5 });
  sign.position.set(0, 1.4, -1.2);                       // 1.2 m in front of the viewer, who starts at the origin facing -Z
  group.add(sign);
  const button = ctx.ui.makeButton('Home', () => ctx.switchTab('hub'), { width: 0.24, height: 0.11 });
  button.position.set(0, 1.15, -1.2);
  group.add(button);
  return {
    name: 'Example', group,
    enter() { ctx.setEnvironment('farm'); ctx.say('Welcome to the farm. Say hello to the animals!'); },
    exit() {},
    update(dt, elapsed) {},
    onSelectStart(hand, controller) { ctx.haptic(hand, 0.5, 60); },   // trigger
    onSelectEnd(hand, controller) {},
    onSqueezeStart(hand, controller) {}, onSqueezeEnd(hand, controller) {},   // grip
  };
}
```

`createTab` runs once, at load. A module that is missing, has no `createTab`, returns no `group`, or throws is
skipped with a console warning. An exception in `enter`, `exit`, `update` or a handler is caught and logged once.

On every tab switch the shell fades through white (VR and desktop), calls the old tab's `exit()`, and then **resets**:
the voice is hushed, the surroundings go back to the default, pointers are on, and the player is recentred at the
origin facing -Z (Unity recentres on every scene's anchor). Then it calls `enter()`. Do everything that should happen
on arrival in `enter()`, not in `createTab`.

Optional handlers, called if the tab has them: `onButtonDown(hand, name)` / `onButtonUp(hand, name)` with name
`'a' | 'b'` (right), `'x' | 'y'` (left) or `'stick'`; `onRecenter()` after the player recentres (in AR: re-place your
content in front of the viewer).

## The world frame

- One unit is one metre. The floor is y = 0. The viewer starts each tab at the origin **looking down -Z**
  (+X to their right). A Unity position `(x, y, z)` from `docs/UNITY_PARITY.md` is `(x, y, -z)` here; a Unity yaw of
  `a` degrees is `rotation.y = -a` degrees.
- The exported `.glb` files and `/models/layouts.json` are mirrored the other way (Unity x negated, +Z forward).
  Put them in a group with `rotation.y = Math.PI` and they land in this frame; inside that group use the numbers
  from `layouts.json` as they are. Creatures face +Z in their files, which is what `/shared/movement.js` expects.
- In AR nothing is recentred: the real room is the frame. Place content from `ctx.viewerPosition()` /
  `ctx.viewerForward()` when the tab is entered.

## `ctx`: the contract

| Member | What it is |
|---|---|
| `THREE` | the three.js module (same instance the shell uses) |
| `scene`, `camera`, `renderer` | the shell's; add your own objects to your `group`, not to the scene |
| `api` | `/shared/api.js` (`api.room()`, `api.sendWish`, `api.tts`, ...) |
| `isImmersive()` | true in a WebXR session (VR or AR), false in the desktop preview |
| `isAR()` | true in passthrough: draw no sky and no ground, the room is real |
| `viewerPosition(out)` | head position in world space (a `THREE.Vector3`; pass one to avoid allocating) |
| `viewerForward(out)` | unit vector the head looks along |
| `controllers.left` / `.right` | `{ grip, ray, connected, gamepad }` plus the extras below. Always the same two objects |
| `ui.makeTextPanel(text, { width, fontSize, color, background })` | a Mesh with `.setText(text)` |
| `ui.makeButton(label, onClick, { width, height })` | an Object3D that pointers can click and controllers can poke |
| `audio.chime()`, `audio.pop()` | the Unity effects |
| `audio.speak(text)` | a Promise that resolves when the line has been spoken |
| `audio.playUrl(url)` | plays a sound file on the voice channel; Promise resolves at the end |
| `audio.stop()` | stops the voice |
| `haptic(hand, strength, ms)` | `hand`: `'left' | 'right' | 'both'`; strength 0 to 1 |
| `log(type, detail)` | `api.logEvent`; never throws. Types: `world_visited`, `creature_learned`, `breath_session`, `explore_visited` |
| `switchTab(id)` | go to another tab (Promise of true when it is showing) |
| `setEnvironment(worldIdOrNull, options)` | sky, fog, light and ground of a Unity world; ignored in AR |

### Controllers

`ctx.controllers.right.grip` and `.ray` are `THREE.Group`s that exist from the start and never change identity, so
you can parent things to them (a blade on `grip`). `ray` looks down its -Z: the pointer direction. In the desktop
preview both are driven by the mouse and `connected` is true.

Extras on each controller: `tracked`, `origin` and `direction` (world-space pointer ray, updated every frame),
`hit` (where the pointer meets what it is on), `trigger` and `squeeze` (0 to 1), `primary` (A or X), `secondary`
(B or Y), `stick` (`{ x, y }`), `selecting`, `squeezing`. `gamepad` is the WebXR gamepad (`xr-standard` mapping); the
desktop preview provides a stand-in with the same `buttons` and `axes` so polling code works on a laptop.

Unity's mapping is kept: trigger clicks what the ray is on; **A (hold) is push-to-talk**; **Y recentres**. B and X,
unused in Unity, open the tab menu. A trigger press reaches the tab (`onSelectStart` / `onSelectEnd`) only when the
pointer was not on a button or another pointer target with an `onClick` (that gets the click instead); grip presses
always reach the tab.

```js
update(dt) {
  const hand = ctx.controllers.right;
  if (hand.tracked && hand.trigger > 0.55) accelerate(dt);       // Unity's press threshold
  blade.visible = hand.tracked;                                   // blade is a child of hand.grip
}
```

### Pointer targets (extras)

Buttons from `ctx.ui` register themselves. For anything else:

```js
ctx.input.addTarget(fish, {
  radius: 0.15,                       // a sphere around the object's origin (object units); or { width, height } for a flat panel
  onHover(on, hand) { glow = on; },
  onClick(hand) { showFact(); },
});
ctx.input.removeTarget(fish);         // when it leaves
```

Only targets that are in the scene and visible are tested. Rectangles are UI and are tested first ("menus win over
creatures"); pass `ui: false` for a flat world object. While a ray is on a target a peach line is drawn to it, as in
Unity. `ctx.input.state.pointersEnabled = false` switches pointers off (Unity does during a round of Frost Slice);
the shell switches them back on at the next tab switch.

### UI kit

Everything is the Unity look (`WWUI.cs`, `WWUI.Styles.cs`, `WWButton.cs`): sizes in metres, panels face +Z, fonts are
the game's (Mountains of Christmas for titles, Berkshire Swash for headings and buttons, Almendra for body text).

```js
const panel = ctx.ui.makeTextPanel('Breathe in...', { width: 0.6, fontSize: 0.04 });   // height follows the text
panel.setText('Breathe out...');      // redraws one canvas: fine for words that change, not for every frame

const b = ctx.ui.makeButton('Start', start, { width: 0.3, height: 0.11, fill: ctx.theme.colors.peach });
b.setLabel('Again'); b.setEnabled(false); b.setSelected(true); b.bounce(); b.shake(); b.dispose();

const card = ctx.ui.makeCard('Frost Slice', 'Slice the flying fruit', open);            // a hub card, 0.44 x 0.32
const banner = ctx.ui.makeRibbon('Games', { width: 0.6, height: 0.14, textHeight: 0.09 });
const frame = ctx.ui.makePanel({ width: 0.74, height: 0.36, style: 'frame',            // 'plain' | 'frame' | 'pill' | 'ribbon' | 'bubble' | 'plate' | 'none'
  labels: [{ text: 'Sea Turtle', size: 0.052, font: 'title', y: 0.12, h: 0.08 }, { text: fact, size: 0.036, y: -0.03, h: 0.2 }] });
frame.setText(newFact, 1); frame.typeOn(2.5, 1);                                         // type it out, as the game does

ctx.ui.popIn(frame, { bob: 0.008 });   // pops in whenever it becomes visible; ctx.ui.close(frame) shrinks it away
ctx.ui.kick(frame);                    // a quick bump, for a number that just changed
ctx.ui.faceViewer(frame, ctx.viewerPosition(v));
```

`makeTextPanel` options: `width` (m, default 0.6); `fontSize` (letter height: metres when below 1, otherwise
millimetres; default 0.036); `color`; `background` (a colour, or `null` for bare text); also `height`, `style`,
`font` (`'body' | 'heading' | 'title' | 'plain'`), `align`, `padding`. `makeButton` options: `width`, `height`
(default 0.3 x 0.11), `fill`, `textHeight`, `style` (`'pill' | 'frame'`), `subtitle`, `spoken`. Buttons behave as in
Unity: staggered pop-in, a spring to 1.06 and a warm halo when pointed at, a dip and a click sound when pressed, and
after 0.45 s the guide reads the label if the voice bank has it. Colours can be `'#rrggbb'`, `0xrrggbb`,
`[r, g, b]` in 0..1, a `THREE.Color`, or a theme name (`'peach'`).

Each panel is one canvas and one draw call. Keep text that changes every frame out of them (use a number that
changes a few times a second at most), and `dispose()` panels you create and throw away.

### Audio

```js
ctx.audio.chime(position);                      // optional Vector3 or Object3D: effects are positional
ctx.audio.sfx('success', 0.6, button);          // hover, click, pop, chime, buzz, success, slice
ctx.audio.chirp(creature, 0.8, fish);           // the creature's own chirp
await ctx.audio.speak('Welcome to the farm. Say hello to the animals!');
await ctx.audio.speak(line, { queue: true });   // wait for what is being said instead of taking over
await ctx.say(line);                            // the same with the guide's caption bubble (GuideVoice.Say)
ctx.audio.setAmbient('amb_wind');               // a world's background loop; setEnvironment does this for you
```

`speak` plays the recorded Unity line when the text matches one of the 354 in `/audio/audio.json` (case and spacing
do not matter), otherwise asks `/api/tts` once per text per session, otherwise falls back to the browser's voice.
**The text-to-speech allowance is small: prefer the recorded lines** (`ctx.audio.hasLine(text)` tells you), and keep
anything generated short. There is one voice channel: a new `speak` or `playUrl` takes over from the current one
(whose promise resolves at once), so lines never overlap. Nothing in `ctx.audio` throws or rejects.

Audio needs the Enter press; before it (and with `?autostart=1`) everything is silent and promises resolve at once.

### Surroundings

```js
ctx.setEnvironment('aquarium');                         // sky, fog, light, ground colour, background loop
ctx.setEnvironment('aquarium', { scenery: true });      // and the world's exported surroundings (the lite cut on a headset)
ctx.setEnvironment('zoo', { ground: false });           // you bring your own ground
ctx.setEnvironment(null);                               // the default: the hub's sky and a plain of snow
```

Ids are the Unity world ids in `WORLDS` (`aquarium`, `zoo`, `space`, `dinosaurs`, `arctic`, `rainforest`, `farm`,
`sky`, `blank`) plus `'hub'`. The shell resets to the default on every tab switch, so call it in `enter()`. In AR it
does nothing. Lighting is not three.js lights: models from `/shared/models.js` (and anything using
`createVertexLitMaterial`) are lit by the world's sun and ambient through shared uniforms, exactly as Unity's
`VertexColorLit` shader does. A stock three.js material in your tab will be unlit unless you add your own lights.

## `ctx`: extras

| Member | What it is |
|---|---|
| `mode()` | `'desktop' | 'vr' | 'ar'` |
| `preferLite()` | true when the lighter scene files should be loaded (always on a headset) |
| `say(text, { queue, caption })` | caption bubble + voice; `ctx.guide.hush()` stops it |
| `rig` | `recenter(floorPoint, forward, matchHeight, eyeHeight)`, `setHome(...)` (remembered: Y repeats it), `viewerForwardFlat(out)`, `floorY()`, `fadeTo(alpha, seconds)`, `object` (the rig group) |
| `input` | `addTarget`, `removeTarget`, `haptic`, `state` (`pointersEnabled`, `desktopPointerMode`, `desktopMoveEnabled`, `reach`, `keys`) |
| `gifts` | the shared gift watcher: `subscribe((gift, replayed) => {}, { replay })` returns unsubscribe; `open(gift)`; `add(gift)`; `waitingLetters()` |
| `environment` | `world(id)` returns the WORLDS row; `set`, `refresh` |
| `models`, `movement` | `/shared/models.js` and `/shared/movement.js` (also importable directly) |
| `theme` | `colors` (the Unity palette as sRGB `[r, g, b]`), `fonts`, `css()`, `hex()` |
| `library` | `/shared/creatures.js` (`CREATURES`, `WORLDS`, `THEME`, ...) |
| `hasTab(id)` | whether a tab loaded |
| `handoff` | a note for the next tab (`ctx.handoff = { wish: true }` before `switchTab('reef')`); the reader clears it |
| `openMenu()` | show the tab menu |
| `elapsed` | seconds since the session started (the same clock `update` gets) |
| `params` | the page's `URLSearchParams` |

Seated or steering games: `ctx.rig.setHome(point, forward, true, 1.15)` puts the head at a fixed eye height, as
Unity's racer does. Blades and reaching in the desktop preview: `ctx.input.state.desktopPointerMode = false` makes the
mouse-driven controller float on the cursor ray at `state.reach` metres instead of aiming from the hip;
`state.desktopMoveEnabled = false` frees W A S D for your own use (read `state.keys`, a Set of `KeyboardEvent.code`).

Shared effects, importable from `/vr/core/fx.js`: `createSnowfall()` (the hub's snow, one draw call, no per-frame
work), `createShadowPool(n)` (Unity's blob shadows as one instanced mesh), `dotTexture()`.

## The desktop preview

No headset: the same scene in a normal canvas. Left-drag (on empty space) or right-drag looks; W A S D moves, Q and E
go down and up, arrow keys turn; the mouse aims the right controller (hold left Shift for the left); **click =
trigger**, right click or G = grip, V or F = A (push-to-talk), C = B, X = X, R = Y (recentre), I J K L = thumbstick,
M or Tab = the tab menu, 1 to 9 = tabs, H = hub. The tab bar along the top is always there.

URL parameters: `mode=ar|vr|desktop`, `tab=<id>`, `room=CODE`, `autostart=1` (enter the preview without the button:
for screenshots; silent), `stats=1` (frames per second, draw calls, triangles), `ar=1` (preview the AR version of each
tab against grey), `lite=1` (load the headset's lighter scenes), `mute=1`.
`window.wishworld` exposes `{ ctx, tabs, renderer, stats }` for checks from a console.

## Performance rules (Quest 2, 72 fps)

- No real-time shadows, no post-processing, no three.js lights needed. Use the shared vertex-lit material: one
  material means few state changes. `ctx.models.sharedVertexLit()` or anything `loadCreature` / `loadGLB` returns.
- Count draw calls (`?stats=1`): the hub is 17, the reef 14 with twelve creatures, both about 41,000 triangles with
  the lite scenes. Stay under roughly 60 draws and 100,000 triangles. Merge static shapes into one geometry
  (`ctx.models.MeshBuilder`), instance repeated ones.
- No allocation in `update`: keep module-level `Vector3`s and pass them as `out` arguments.
- Do not redraw UI panels every frame, and do not load models in `update`.
- Pool objects that come and go; hide rather than destroy.
