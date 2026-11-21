# WishWorld web build: phone app, WebXR, image-to-mesh, lidar explore

This document is both the spec and the instructions for Claude Code. Build everything here as one web project, create the database tables on Neon through the Neon connector, and deploy to Vercel. The existing Unity app stays as it is and reads the same data over HTTPS.

## 0. Instructions for Claude

Work through the build order in section 11 without waiting for approval between steps. Stop only if something blocks all progress (a connector is unavailable, a required key is missing).

**Database.** Use the Neon connector to create one project and the tables in section 3. Only create things. Do not drop, reset, or delete any existing Neon project, branch, or table; if a name is taken, pick a new one and say so.

**Deploy.** Deploy the project to Vercel (connector or CLI) and redeploy after each working step. Set the environment variables in section 2. I will paste secret values when you ask; never print a secret in chat, commit one, or put one in client code.

**Verify what you can.** After each step, call the API routes and load each page in a desktop browser, and confirm rows appear in Neon. You cannot test on a headset or a phone camera; list those checks for me at the end and do not report them as working.

**External services.** Before writing code against fal.ai or the Anthropic API, read their current docs for the exact endpoint names, model ids, and request shapes. The names in this document are starting points, not verified values.

## 1. Stack

| Layer | Choice | Notes |
|---|---|---|
| Hosting, functions | Vercel | Static pages plus `/api` serverless functions |
| Database | Neon Postgres | Reached only from functions, through Neon's serverless driver |
| File storage | Vercel Blob | Photos, voice clips, generated `.glb` models (Neon stores no files) |
| Live updates | Polling | Neon has no push channel; every client asks every 2 to 3 seconds |
| 3D | three.js with WebXR | Headset passthrough and VR, phone camera view |
| Language model | Claude Haiku | Wish and photo interpretation, child-safe messages |
| Image to 3D | fal.ai | Tripo or Hunyuan3D image-to-3D, GLB output |
| Lidar | USGS 3DEP public data | Preprocessed once into small static files |

No page ever talks to the database or to an AI service directly. Everything goes through `/api`.

## 2. Environment variables

| Name | Secret | Used for |
|---|---|---|
| `DATABASE_URL` | Yes | Neon connection string (pooled) |
| `ANTHROPIC_API_KEY` | Yes | Haiku |
| `FAL_KEY` | Yes | Image-to-3D |
| `BLOB_READ_WRITE_TOKEN` | Yes | Vercel Blob |

## 3. Database (create with the Neon connector)

```sql
create table rooms (
  code        text primary key,           -- short join code, e.g. FISH
  child_name  text,
  created_at  timestamptz default now()
);

create table gifts (
  id          bigserial primary key,
  room_code   text references rooms(code),
  created_at  timestamptz default now(),
  sender      text,
  kind        text not null,              -- creature | mesh | letter
  wish        text,                       -- typed text or what the photo showed
  option_id   text,                       -- library creature, for kind = creature
  message     text,                       -- shown and spoken on arrival
  image_url   text,
  audio_url   text,
  model_url   text,                       -- generated .glb, for kind = mesh
  job_id      text,                       -- image-to-3D job
  status      text default 'ready',       -- pending | ready | failed
  opened_at   timestamptz                 -- when the child opened it
);
create index on gifts (room_code, id);

create table events (
  id          bigserial primary key,
  room_code   text references rooms(code),
  created_at  timestamptz default now(),
  type        text not null,              -- world_visited | creature_learned | breath_session | explore_visited | gift_opened
  detail      jsonb
);
create index on events (room_code, id);
```

## 4. API routes

| Route | Does |
|---|---|
| `POST /api/rooms` | Creates a room and returns its code |
| `POST /api/wish` | `{room, sender, text}` → Haiku picks a library creature and writes a message → gift row |
| `POST /api/letter` | `{room, sender, text, audio?}` → stores audio in Blob → gift row of kind `letter` |
| `POST /api/scan` | `{room, sender, image}` → stores photo → submits image-to-3D job → gift row `pending` |
| `GET /api/scan-status?id=` | Checks the job; when done, copies the `.glb` to Blob and marks the row `ready` |
| `GET /api/gifts?room=&after=` | Ready gifts with id above `after` (headset, Unity, phone AR) |
| `POST /api/gifts/open` | Marks a gift opened and logs an event |
| `POST /api/events` | Logs activity from the headset |
| `GET /api/inbox?room=` | Parent view: recent events and which gifts were opened |

Rules for every function: validate input, cap text length, make at most one slow external call, and return quickly. Image-to-3D must be submit-then-poll, because generation can outlast a function's time limit.

Every piece of text bound for a child goes through Haiku with an instruction to reject or soften anything unsuitable. On rejection, send a friendly default.

## 5. Project layout

```
wishworld-web/
├─ index.html            landing: links and a QR code for /phone
├─ vr/index.html         headset game view (tabs: Reef, Explore, Calm, Mailbox)
├─ phone/index.html      phone app (tabs: Send, Scan, Letter, Inbox, AR)
├─ shared/               api client, creature table, movement, polling
├─ public/models/        library .glb files exported from Unity
├─ public/lidar/         preprocessed point files (section 9)
├─ api/                  serverless functions
└─ tools/lidar/          one-time preprocessing script
```

## 6. Phone app (`/phone`)

Opens from a QR code with the room code pre-filled. No accounts. Portrait, one hand, large buttons.

| Tab | What it does |
|---|---|
| **Send** | Name, a wish, three one-tap suggestions. Confirms with the creature's picture: "Your turtle is swimming over." |
| **Scan** | Photograph a toy or object. It becomes a 3D companion in the child's world (section 8). Shows progress while the model is built. |
| **Letter** | A short written note and an optional 10-second voice recording. It arrives in the child's mailbox. |
| **Inbox** | The parent check-in. A simple feed: worlds visited, creatures learned, calm sessions done, which gifts and letters were opened and when. Read-only. |
| **AR** | The room's creatures through the phone camera. Android Chrome uses WebXR; iPhone uses the camera as a background with tilt to look around. |

Who uses it: a family member anywhere (Send, Scan, Letter), a parent or nurse in the room (Inbox), a second judge at the table (Send, AR).

Failure handling: if a send fails, say so and keep what was typed.

## 7. Headset game view (`/vr`): WebXR migration

What moves to the web and what stays in Unity:

| Feature | Where |
|---|---|
| AR fish, gifts arriving, companions, mailbox, calm mode, lidar explore | Web (`/vr`) |
| VR worlds, fruit slicing, racing | Unity over Link, unchanged |

Assets carry over by exporting the library models from Unity as `.glb`. Scripts do not carry over; movement is rewritten in JavaScript.

Entry: one large "Enter" button (the browser requires a press). Request an AR session for passthrough; fall back to VR if AR is unavailable. One unit is one meter. Keep 72 frames per second: low-polygon models, no real-time shadows.

A floating menu inside the session switches between four tabs:

**Reef (default).** Fish swim in the real room in a ring 1 to 3 m from the viewer. Controllers are visible; the trigger scatters nearby fish with a short vibration. New gifts arrive in front of the viewer with a card ("From Grandma") and a chime. Scanned companions float beside the viewer, bob, turn to face them, and follow at arm's length.

**Explore.** Real places built from lidar (section 9).

**Calm.** The breathing feature (section 10).

**Mailbox.** A small mailbox object with a flag that rises when a letter is waiting. Opening it shows the note and plays the voice clip, then logs `gift_opened` so the parent sees it in Inbox.

Unity integration: Unity polls `GET /api/gifts` every 2 to 3 seconds over HTTPS and feeds creature gifts into its existing spawn path. Mesh companions and the mailbox are web-only for now.

## 8. Image to mesh (scan a toy into a companion)

Flow:

1. Phone shrinks the photo and posts it to `/api/scan`.
2. The function stores it in Blob, asks Haiku for a name and a first line for the companion, submits the image-to-3D job on fal.ai, and saves a `pending` gift.
3. The phone polls `/api/scan-status`. When the job finishes, the function copies the `.glb` into Blob and marks the gift `ready`.
4. The headset picks it up on its next poll, loads the `.glb`, scales it to about 30 cm, and spawns it as a companion.

Requirements:

- Request a low face count (target about 20,000 triangles or fewer) and standard textures. Default exports are far too heavy for a Quest 2.
- Try a Tripo image-to-3D endpoint first, with a Hunyuan3D rapid endpoint as the alternative. Confirm current ids and parameters in fal's docs.
- No rigging. Life comes from code: float, bob, face the child, follow, hop when spoken to.
- Fallback: if the job fails or takes over two minutes, Haiku picks the closest library creature from the photo and that is sent instead. The scan must always produce something.
- Phone copy: "Building your bear... about a minute." Tips on the Scan tab: one object, plain background, good light.

## 9. Explore: places from USGS lidar

Two places only: the **Statue of Liberty** and **Niagara Falls**. Source: the USGS 3DEP public lidar set indexed at https://usgs.entwine.io/ and stored in the public `usgs-lidar-public` bucket as Entwine Point Tiles.

Do not stream lidar in the headset. Preprocess once and ship small static files.

Preprocessing (`tools/lidar/`, run once on a laptop):

1. Find the dataset covering each place in the USGS index (the New York City area for the statue, western New York for the falls).
2. Read only a box around each target with PDAL's EPT reader: roughly 300 m across for Liberty Island (near 40.6892, -74.0445) and roughly 1.5 km across for the falls (near 43.08, -79.07).
3. Thin to about 500,000 to 1,000,000 points per place.
4. Recenter on the middle of the box, convert to meters, and write a compact binary of positions plus a color per point.
5. Color by height, and tint water and vegetation classes where the data has them. This lidar usually has no photo color.
6. Save to `public/lidar/liberty.bin` and `public/lidar/niagara.bin` with a small JSON file giving point count, bounds, and scale.

In the headset:

- Show each place as a tabletop diorama about 1 m across, floating in the room. The child leans in and walks around it. Nothing moves the viewer, so there is no motion sickness.
- A two-button picker switches places. Grip and pull with both controllers to scale and turn the model.
- The guide says one or two checked facts per place, and an `explore_visited` event is logged.

Known limits, to state plainly in the pitch and the UI:

- The data is scanned from aircraft, so it captures tops and ground well and vertical faces poorly. The statue will read as a recognizable silhouette on its island, not a detailed sculpture. If it looks too sparse, show the whole island and harbor edge so the setting carries it.
- The Canadian side of Niagara may be missing from a US dataset. Center on the American Falls and Goat Island if so.
- Verify coverage for both places before building the viewer. If a place has no usable data, report it and do not substitute invented geometry.

## 10. Calm: breathing with the microphone

Purpose: slow breathing is used to settle children before and during procedures. The child breathes out slowly and the world responds.

- Ask for the microphone on entering the tab (HTTPS and a button press are required).
- Measure loudness from the mic about 30 times a second. A breath out is steady, broadband noise lasting over a second; a shout or a clap is short and sharp. Require a sustained level before counting it.
- While the child breathes out: bubbles rise from in front of them and the fish drift closer. On a long, slow breath: a soft glow and a chime. Fast, sharp breaths scatter the fish.
- A gentle guide ring grows and shrinks to pace the breathing (about four seconds in, six out).
- A sensitivity slider and a calibrate step ("breathe normally for three seconds") to cope with a noisy room.
- Log a `breath_session` event with the number of slow breaths, so it shows in the parent's Inbox.
- Do not make health claims in the UI. Call it a calm game.

Check in the headset that the microphone is available during an immersive session; if not, run Calm as a non-immersive page view with the same visuals.

## 11. Build order

1. Neon tables; `POST /api/rooms`, `POST /api/wish`, `GET /api/gifts`. Deploy.
2. `/phone` Send tab. Confirm a row appears in Neon.
3. `/vr` Reef tab with fish and gift arrival. Unity polling.
4. Letter tab, `/api/letter`, and the Mailbox tab.
5. Events logging and the Inbox tab.
6. Calm tab.
7. Scan tab, `/api/scan`, `/api/scan-status`, companion spawning, and the fallback.
8. Lidar preprocessing and the Explore tab.
9. Phone AR tab.

Each step must leave the deployed site working. If time runs out, everything before the cut is still demoable.

## 12. Hand-back

When finished, report:

1. The deployed addresses for `/phone` and `/vr`.
2. The Neon project and tables created.
3. Each step: done, partial, or not done.
4. What you verified in a desktop browser and with direct API calls.
5. The checks only I can do: passthrough and controllers in the Quest browser, microphone in an immersive session, phone camera and motion permissions, a real toy scan end to end, model weight and frame rate on the headset.
6. Lidar coverage found for each place, with point counts.
7. Any secret I still need to supply, by name only.
