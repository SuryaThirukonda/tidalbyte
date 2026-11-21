# WishWorld web: build contract

Everyone building a part of this project works from this file, `../../WishWorld_Web_Build.md` (the spec) and
`UNITY_PARITY.md` (what the Unity game looks and sounds like). If the spec and this file disagree, this file wins,
because it records decisions made to fit Vercel.

## Layout (Vercel: static files from `public/`, functions from `api/`)

```
wishworld-web/
├─ package.json            "type": "module"; owned by the API builder
├─ vercel.json
├─ api/                    serverless functions (Node runtime, ESM). `api/_lib/` holds helpers (not routes)
├─ public/
│  ├─ index.html           landing: create/join a room, links, QR code for /phone
│  ├─ phone/               phone app (tabs: Send, Scan, Letter, Inbox, AR)
│  ├─ vr/                  headset view (tabs: Reef, Explore, Calm, Mailbox)
│  ├─ shared/              api.js, creatures.js, models.js, movement.js
│  ├─ models/              <id>.glb exported from Unity, plus manifest.json
│  ├─ textures/ audio/     skies, sounds, baked voice lines exported from Unity
│  ├─ lidar/               liberty.bin/.json, niagara.bin/.json
│  └─ vendor/              three.js (pinned, vendored), qrcode generator
├─ tools/lidar/            one-time preprocessing
└─ docs/
```

URLs: `/` landing, `/phone/`, `/vr/`, `/api/...`. Static assets are addressed from the site root, e.g.
`/models/turtle.glb`, `/shared/api.js`, `/vendor/three/build/three.module.js`.

## Front-end rules

- No build step, no framework, no CDN at runtime. Plain ES modules. Every page uses this import map:
  ```html
  <script type="importmap">{ "imports": {
    "three": "/vendor/three/build/three.module.js",
    "three/addons/": "/vendor/three/examples/jsm/" } }</script>
  ```
- Target browsers: Meta Quest Browser (Quest 2), Android Chrome, iOS Safari, desktop Chrome.
- One unit is one meter. Quest 2 budget: 72 fps, low-polygon, no real-time shadows, few draw calls, no post-processing.
- Match the Unity game's look (colors, fonts, card style, creatures) using `UNITY_PARITY.md` and
  `/shared/creatures.js` (`CREATURES`, `WORLDS`, `THEME`, `creatureById`).
- Nothing may assume a model file exists. Missing `.glb` → fall back to a simple low-poly shape in the creature's color.
- Room code comes from `?room=CODE` (default `WISH`), remembered in `localStorage`.
- Never put a secret in anything under `public/`.

## API (all JSON; errors are `{ "error": "..." }` with a 4xx/5xx status; CORS is open)

Gift object = the `gifts` row as JSON:
`{ id, room_code, created_at, sender, kind ("creature"|"mesh"|"letter"), wish, option_id, message, image_url, audio_url, model_url, job_id, status ("pending"|"ready"|"failed"), opened_at }`

| Route | Request | Response |
|---|---|---|
| `POST /api/rooms` | `{ childName? }` | `{ code, child_name }` |
| `POST /api/wish` | `{ room, sender, text }` | `{ gift }` (kind `creature`, `option_id` from `CREATURES`, child-safe `message`) |
| `POST /api/letter` | `{ room, sender, text, audio?, audioType? }` (`audio` = base64) | `{ gift }` (kind `letter`) |
| `POST /api/scan` | `{ room, sender, image, imageType? }` (`image` = base64 JPEG, shrunk by the phone) | `{ gift }` (kind `mesh`, status `pending`) |
| `POST /api/scan` (fruit) | `{ room, kind: "fruit", sender?, method?, image }` (`image` = base64 PNG with transparency, cut out on the phone) | `{ fruit }`; the server re-encodes it (trimmed, at most 512 px, no metadata) and deletes the room's previous fruit |
| `POST /api/scan` (fruit) | `{ room, kind: "fruit", action: "clear" }` | `{ fruit: null }` Frost Slice goes back to the normal fruit |
| `GET /api/scan?room=&kind=fruit` | | `{ fruit }` or `{ fruit: null }`; fruit = `{ id, room, type: "frostslice_fruit", assetUrl, width, height, method ("auto"\|"box"\|"oval"), createdAt }` |
| `GET /api/scan-status?id=` | | `{ gift }` (becomes `ready`; on failure or after 2 minutes becomes a `creature` gift) |
| `GET /api/gifts?room=&after=` | | `{ gifts: [...], latest }` ready gifts with id > after, oldest first |
| `POST /api/gifts/open` | `{ room, id }` | `{ gift }` and logs a `gift_opened` event |
| `POST /api/events` | `{ room, type, detail }` | `{ ok: true, id }` |
| `GET /api/inbox?room=` | | `{ room, events: [...], gifts: [...] }` newest first, 50 each |
| `POST /api/tts` | `{ text }` | `{ url }` MP3 spoken by the game's ElevenLabs voice, cached |
| `POST /api/stt` | `{ audio, audioType }` (base64) | `{ text }` ElevenLabs speech-to-text |
| `POST /api/guide` | `{ room, question, topic? }` | `{ reply, audio_url? }` the guide's short child-safe answer (Haiku) |
| `GET /api/health` | | `{ ok, db, has: { anthropic, elevenlabs, fal, blob } }` booleans only |

Event types: `world_visited`, `creature_learned`, `breath_session`, `explore_visited`, `gift_opened`,
`frostslice_fruit` (the room's scanned fruit; the newest row wins, `{ cleared: true }` means normal fruit; only the
cut-out is stored, never the original photo; written only by `/api/scan`, so `POST /api/events` refuses this type).
Unknown room codes are created on first use. Text is capped (wish 200 chars, letter 600, sender 40).

### `/shared/api.js` (browser client, owned by the API builder)

```js
export const api = {
  base,                                   // "" on the deployed site; the production URL when the page runs on localhost
  room(),                                 // current room code (from ?room=, else localStorage, else "WISH")
  setRoom(code),
  createRoom(childName),                  // -> { code, child_name }
  sendWish({ sender, text }),             // -> gift
  sendLetter({ sender, text, audioBlob }),// -> gift
  startScan({ sender, imageBlob }),       // -> gift (pending)
  scanStatus(id),                         // -> gift
  sendFruit({ sender, pngBlob, method }), // -> fruit (Frost Slice cut-out)
  getFruit(),                             // -> fruit or null
  clearFruit(),                           // -> null
  getGifts(after),                        // -> { gifts, latest }
  openGift(id),                           // -> gift
  logEvent(type, detail),                 // -> { ok, id }   (never throws; failures are swallowed)
  getInbox(),                             // -> { room, events, gifts }
  tts(text),                              // -> url
  stt(audioBlob),                         // -> text
  guide(question, topic),                 // -> { reply, audio_url }
  health(),
  pollGifts(onGift, { intervalMs = 2500, after = 0 }) // calls onGift(gift) for each new ready gift; returns stop()
};
```
All methods use the current room. Network failures reject with an `Error` whose message is safe to show.

## Shared 3D helpers (owned by the headset-core builder)

```js
// /shared/models.js
loadCreature(id)                  // -> Promise<THREE.Object3D>, longest side = creature.size, centred, facing +Z; never rejects
loadModelUrl(url, targetSize)     // -> Promise<THREE.Object3D> for scanned companions (.glb); rejects on failure
// /shared/movement.js
createMover(object, creature, { center, minRadius, maxRadius, height })
   // -> { update(dt, elapsed, viewerPosition), scatter(fromPoint), setCenter(vec3), dispose() }
createCompanionFollower(object, { armLength = 0.6 })  // -> { update(dt, elapsed, viewerPosition, viewerForward), hop() }
```

## Headset tab modules (`/vr/tabs/<name>.js`)

```js
export function createTab(ctx) {
  return {
    name: "Reef",
    group,                         // THREE.Group, added to the scene by the shell, visible only while active
    enter() {}, exit() {},
    update(dt, elapsed) {},
    onSelectStart(hand, controller) {}, onSelectEnd(hand, controller) {},     // trigger
    onSqueezeStart(hand, controller) {}, onSqueezeEnd(hand, controller) {},   // grip
  };
}
```
Each tab module also exports `export const meta = { id, label, order, hidden? }`.

**Tab registry.** The shell reads `/vr/tabs/tabs.json`, an array of tab ids in menu order, and dynamically imports
`/vr/tabs/<id>.js` for each. A module that is missing or throws while loading is skipped with a console warning, so
tabs can be added by dropping in a file and adding its id to `tabs.json`. Full list (the Unity migration is complete
only when all of these exist):

| id | What | From |
|---|---|---|
| `hub` | The snow hub from Unity: banner, cards, penguin and reindeer, falling snow. Start screen and tab menu. | Unity Hub scene |
| `reef` | Fish in the room (AR) or in the reef world (VR); gifts arrive; companions; spoken wishes | Spec section 7 + Unity Wish mode |
| `worlds` | Visit each Unity world (sky, scenery, creatures, facts); AR variant puts the creatures in the room | Unity World scene |
| `frostslice` | Port of the Frost Slice game | Unity Game_FrostSlice |
| `snowcircuit` | Port of the Snow Circuit racing game | Unity Game_SnowCircuit |
| `explore` | Lidar dioramas | Spec section 9 |
| `calm` | Breathing game | Spec section 10 |
| `mailbox` | Letters | Spec section 7 |

`ctx` also offers `switchTab(id)` and `setEnvironment(worldIdOrNull)` (VR only: sky, fog and ground of a Unity
world from `WORLDS`; `null` restores the default; in AR it is ignored so the real room stays visible).

`ctx` given by the shell: `{ THREE, scene, camera, renderer, api, isImmersive(), isAR(), viewerPosition(out),
viewerForward(out), controllers: { left, right } (each: { grip: Object3D, ray: Object3D, connected, gamepad }),
ui: { makeTextPanel(text, { width, fontSize, color, background }) -> Mesh with .setText(text),
      makeButton(label, onClick, { width, height }) -> Object3D (pointer-clickable) },
audio: { chime(), pop(), speak(text) -> Promise, playUrl(url) -> Promise, stop() },
haptic(hand, strength, ms), log(type, detail) }`.
Tabs must also work in the desktop preview (no controllers: mouse click = right trigger).

## Lidar files (`/lidar/<place>.bin` + `<place>.json`)

`.bin` = `Int16` x,y,z for every point (little-endian, 6 bytes each), followed by `Uint8` r,g,b for every point.
Metres = int16 × `scale`. Y is up, origin at the centre of the box at ground level.
`.json` = `{ name, count, scale, bounds: { min:[x,y,z], max:[x,y,z] } (metres), source, facts: ["...", "..."] }`.

## Models manifest (`/models/manifest.json`, written by the Unity exporter)

`{ "models": [ { "id", "file", "kind": "creature"|"scenery"|"prop", "size": [x,y,z] (metres), "triangles", "vertexColors": true|false } ] }`

## Who owns what

| Area | Files |
|---|---|
| API | `api/**` (except the scan routes), `package.json`, `vercel.json`, `public/shared/api.js` |
| Photo to 3D | `api/scan.js`, `api/scan-status.js`, `api/_lib/mesh/**`, `tools/mesh-worker/**` (free hosted API or free local model; no fal.ai) |
| Phone | `public/phone/**`, `public/index.html` |
| Headset core | `public/vr/index.html`, `public/vr/main.js`, `public/vr/core/**`, `public/vr/tabs/tabs.json`, `public/vr/tabs/hub.js`, `public/vr/tabs/reef.js`, `public/vr/tabs/mailbox.js`, `public/shared/models.js`, `public/shared/movement.js` |
| Headset extras | `public/vr/tabs/explore.js`, `public/vr/tabs/calm.js`, `public/vr/dev/**` |
| Worlds | `public/vr/tabs/worlds.js`, `public/vr/worlds/**` |
| Games | `public/vr/tabs/frostslice.js`, `public/vr/tabs/snowcircuit.js`, `public/vr/games/**` |
| Lidar | `tools/lidar/**`, `public/lidar/**` |
| Unity | `public/models/**`, `public/textures/**`, `public/audio/**`, and Unity-side scripts |

Do not edit files you do not own; if you need a change in someone else's file, say so in your final report.
