# WishWorld web

The web build of WishWorld: a phone app for family, and a WebXR headset view that replaces the Unity game on a
Meta Quest 2 without Link, developer mode or an installed app. Spec: [`../WishWorld_Web_Build.md`](../WishWorld_Web_Build.md).
Decisions and file formats: [`docs/CONTRACT.md`](docs/CONTRACT.md). What the Unity game looks and sounds like:
[`docs/UNITY_PARITY.md`](docs/UNITY_PARITY.md).

| | Address |
|---|---|
| Landing page (room code, QR) | https://wishworld-web.netlify.app/ |
| Phone app | https://wishworld-web.netlify.app/phone/?room=WISH |
| Headset view | https://wishworld-web.netlify.app/vr/?room=WISH |

## Using it

- **Headset:** open the Meta Quest Browser, type the headset address, press **Enter**. It asks for passthrough (AR)
  first and falls back to VR. B or X opens the tab menu; hold A to speak a wish.
- **Laptop:** the same address, then **Preview**. Drag to look, W A S D to move, click = trigger, G = grip,
  hold V = speak a wish, M = menu, 1 to 9 = tabs. Useful parameters: `?mode=desktop|vr|ar`, `&tab=<id>`,
  `&autostart=1`, `&ar=1` (AR look on a grey backdrop), `&stats=1`.
- **Phone:** scan the QR code on the landing page.
- **No headset (Play in browser):** the landing page's "Play in the browser", or `/vr/?room=WISH&mode=play` (the
  default on the start page when there is no headset). Full screen, the same worlds as a first-person game:
  - mouse and keyboard: the mouse looks (it is captured; Esc pauses), W A S D walk, click uses what the crosshair is on,
    right click or G grabs, hold Space to talk, M opens the menu, 1 to 9 switch tabs;
  - touch screens: a stick in the lower left walks, drag looks, tap uses, and Talk, Grab and Menu buttons;
  - a game controller: left stick walks, right stick looks, right trigger uses, left trigger or right bumper grabs,
    A talks, X or Start opens the menu.
  `mode=desktop` ("Preview") is still there for checking pages: drag to look, the cursor is the controller.
- **Switching room inside the game:** the floating menu (B or X on a headset, M on a keyboard, Menu on a phone) has a
  room row: the room code, rooms used on this device, and New room. On a laptop or phone the "Room" chip in the top
  left also takes a typed code (the pause card has a Room button). Gifts, letters and companions reload for the new
  room; the current tab starts again.
- **Scan a toy (headset, Reef tab):** press **Scan a toy** or say "scan my toy", then take the toy's picture in the
  phone's Scan tab. The headset shows the scan and the toy's 3D model arrives as a companion; with no photo, Bubby
  (the team's prepared toy) comes instead. See `public/vr/core/toyscan.js`.
- **Several photos of one toy (phone, Scan tab):** add the back and sides (up to four photos: Front, Back, Left side,
  Right side). They go to TRELLIS's multi-image mode, so the back of the model comes from a real photo instead of a
  guess. If that is refused or fails, the front photo goes through the usual single-photo routes.
- **Companions everywhere (headset):** every scanned toy that joins (and Bubby) is saved for the room and follows the
  child in every tab and world, and again next time the room is opened. The newest four follow; poke one to make it
  hop. See `public/vr/core/companions.js` and `api/companions.js`.

Headset tabs: `hub`, `reef`, `worlds`, `frostslice`, `snowcircuit`, `explore`, `calm`, `mailbox`

**Explore** shows real places scanned by USGS lidar: the Statue of Liberty, Niagara Falls, the Golden Gate Bridge,
the Gateway Arch, the Washington Monument, Devils Tower and the Grand Canyon. Each starts as a tabletop model;
**Walk around it** makes it life-size and puts you on the ground near the landmark, facing it. Walk with the left
thumbstick (W A S D, the on-screen stick or a game controller off the headset) and turn with the right thumbstick;
**Back to the table** returns. `&place=<id>` opens Explore on one place (for example `&tab=explore&place=goldengate`).
(listed in `public/vr/tabs/tabs.json`; the shell is documented in `public/vr/core/README.md`).

## Layout

```
api/            the route handlers (Vercel (req, res) shape); helpers in api/_lib
netlify/        functions/api.mjs: the one Netlify function that serves every /api route with the handlers in api/
public/         everything static: index.html, phone/, vr/, shared/, models/, textures/, audio/, fonts/, lidar/, vendor/
tools/          deploy-netlify.ps1, deploy.ps1 (Vercel), set-env.ps1 (Vercel), vc.ps1, lidar/ (preprocessing), mesh-worker/ (optional local photo-to-3D)
docs/           the contract and the Unity parity reference
```

No build step: plain ES modules, three.js vendored under `public/vendor`.

## Services

| What | Where | Notes |
|---|---|---|
| Hosting and functions | Netlify project `wishworld-web` | Deploy with `pwsh -File tools/deploy-netlify.ps1`. Config in `netlify.toml`. The earlier Vercel project still works (`tools/deploy.ps1`, `vercel.json`) |
| Database | Neon project `wishworld` | Tables `rooms`, `gifts`, `events` (spec section 3), and `companions` (saved companions per room; `api/companions.js` creates it on first use) |
| Files | Vercel Blob store `wishworld-files` | Photos, voice clips, generated models, cached speech. Still used from Netlify through `BLOB_READ_WRITE_TOKEN`, so existing file URLs keep working |
| Language model | Claude Haiku (`claude-haiku-5-5`) | Wish and photo interpretation, child-safe text, the guide |
| Voice | ElevenLabs | Same voice and models as the Unity game; the 354 recorded Unity lines are reused first |
| Photo to 3D | Free Hugging Face Spaces (Stable Fast 3D, then TripoSR) | Optional local worker in `tools/mesh-worker`; a library creature is the last resort |
| Lidar | USGS 3DEP (public domain) | Preprocessed once by `tools/lidar/preprocess.py` |

Environment variables on Netlify (`netlify env:list`; copied from the Vercel project, where `tools/set-env.ps1` set them): `DATABASE_URL`,
`BLOB_READ_WRITE_TOKEN`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`.
Optional: `HF_TOKEN` (raises the free image-to-3D allowance), `MESH_WORKER_KEY` (lets a local worker upload models).

## Unity

- `Assets/WishWorld/Editor/WebExporter.cs`: **WishWorld > Web > Export Everything** rewrites `public/models`.
- `Assets/WishWorld/Scripts/Web/WebGiftPoller.cs`: with `WISHWORLD_WEB_URL` and `WISHWORLD_ROOM` in the Unity `.env`,
  the Unity game spawns creature gifts sent from the phone.

## Not checked on real devices

Everything was verified in a desktop browser and with direct API calls. Still to check on hardware: passthrough,
controllers and frame rate in the Quest browser; the microphone inside an immersive session; the phone camera, tilt
and WebXR; a real toy scan from a phone; iPhone voice recording.
