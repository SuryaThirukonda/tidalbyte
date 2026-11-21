# Scan a toy into a companion: how the 3D model is made, for free

`POST /api/scan` turns one photo into a small `.glb` the headset can show. No paid service is used.
This folder holds the test script, sample photos, and an optional worker that builds models on this laptop.

## How a scan runs

1. The phone posts the photo to `POST /api/scan`. The function tidies it (upright, at most 1024 px, JPEG,
   camera metadata removed), stores it in Vercel Blob, asks Claude Haiku for the companion's name and first
   line, saves a `pending` gift of kind `mesh` and answers in about 3 seconds.
2. The same function invocation keeps working in the background (`waitUntil`). It tries the free routes
   below in order. The first model that arrives is simplified to at most 20,000 triangles with one
   1024 px JPEG texture (or vertex colours), turned to face +Z, stored in Blob as a plain `.glb`, and the
   gift becomes `ready`.
3. If nothing works, or two minutes pass, the gift becomes a library creature instead (kind `creature`,
   chosen by Claude Haiku from the photo). A scan always produces something.

The phone polls `GET /api/scan-status?id=` every 2 to 3 seconds; the headset simply sees the gift in
`GET /api/gifts` once it is `ready`. Nothing depends on the phone staying on the page.

| Order | Route | Where it runs | Look | Time measured | Limit |
|---|---|---|---|---|---|
| 1 | Stable Fast 3D (`stabilityai/stable-fast-3d`) | Hugging Face Space, shared free GPU ("ZeroGPU") | textured | 4 to 14 s from photo to ready | Hugging Face gives each caller a daily GPU allowance: 2 minutes without a token, 5 minutes with a free account's token. Each scan asks for 60 s twice and uses a few seconds. When the allowance is gone the Space refuses at once and the next route is used. |
| 2a | TRELLIS (`trellis-community/TRELLIS`) | Hugging Face Space, ZeroGPU | textured, best looking | 30 to 60 s (not reached in testing) | Asks for 120 s of allowance in one go, so it is refused without a token on anything but a fresh allowance. Skipped when route 1 was refused for lack of allowance. |
| 2b | TripoSR (`WeReCooking2/Dust3R-TripoSR`) | Hugging Face Space, free CPU | vertex colours, softer | 47 to 50 s from photo to ready (85 s when its queue was busy) | No allowance to run out. One job at a time; a community Space that sleeps after 48 hours without use and could be removed by its owner. |
| any time | Local worker (this folder) | this laptop | vertex colours | 14 s a model on this laptop's CPU | Only while `worker.py` is running, and only once `MESH_WORKER_KEY` is set. |
| last | Library creature | Claude Haiku | the game's own creature | 3 s | none |

2a and 2b start together; TRELLIS is used if it succeeds, otherwise TripoSR.

### The 60-second function limit (one line in `vercel.json` would remove it)

`vercel.json` gives every function 60 seconds, and that setting wins over the `maxDuration: 300` export
in `api/scan.js` (measured: a background task that needed 90 seconds was stopped). Step 1 fits easily.
Step 2 does not always fit after the request and step 1 have used part of the minute, so the task hands
step 2 over to a second invocation: it writes `handoff:<routes>` into the gift's `job_id` and calls
`GET /api/scan-status?id=`, which carries on in the background with a fresh 60 seconds (any status poll
that sees the marker does the same). Gifts finished that way have `job_id` `done:triposr@2`.

That works (measured: 50 s and 85 s scans), but leaves TripoSR only about 52 seconds, which is tight when
its Space is busy. To give scans the full two minutes in one invocation, put these two entries ahead of
the catch-all one in `vercel.json` (Hobby projects may go up to 300):

```json
"functions": {
  "api/scan.js": { "maxDuration": 300 },
  "api/scan-status.js": { "maxDuration": 300 },
  "api/**/*.js": { "maxDuration": 60 }
}
```

Nothing else needs to change: the code asks Vercel how long it has and only hands over when it is short.

Optional settings on Vercel (names only; none is required):

- `HF_TOKEN`: a free Hugging Face access token (read scope). Raises the daily GPU allowance and ties it to
  your account instead of to the address Vercel happens to call from.
- `MESH_TRIPOSR_SPACE`: address of your own copy of the TripoSR Space, for example
  `https://yourname-dust3r-triposr.hf.space`. Open the Space on huggingface.co, choose "Duplicate this
  Space", keep the free CPU hardware. Your copy has its own queue and cannot be removed by someone else.
- `MESH_SF3D_SPACE`, `MESH_TRELLIS_SPACE`: the same for the other two.
- `MESH_WORKER_KEY`: a long random secret shared with the local worker (below). Without it the worker
  routes answer 403.
- `MESH_DEBUG=1`: allows the test switches outside room `TEST`.

## Checking it

```
node tools/mesh-worker/scan-test.mjs tools/mesh-worker/samples/teddy-bear.jpg
node tools/mesh-worker/scan-test.mjs tools/mesh-worker/samples/rubber-duck.jpg --routes triposr
node tools/mesh-worker/scan-test.mjs tools/mesh-worker/samples/teddy-bear.jpg --mode fail
node tools/mesh-worker/scan-test.mjs tools/mesh-worker/samples/teddy-bear.jpg --mode hang
```

The script posts the photo to the deployed site in room `TEST`, polls until the gift is ready, downloads
the `.glb` to the system temp folder and prints its size and triangle count. `--routes`, `--mode` and
`--delay` are test switches the server honours only in room `TEST`: `fail` forces the creature fallback,
`hang` leaves the gift pending so the two-minute rule fires.

Sample photos (Wikimedia Commons): `teddy-bear.jpg` is "Teddy bear early 1900s - Smithsonian Museum of
Natural History", `rubber-duck.jpg` is "Duck Donuts Rubber Duck"; both shrunk to 1024 px. `blank.jpg` is
a white square.

## The local worker (optional)

`worker.py` runs TripoSR (MIT licence) on this computer's CPU. While it runs it asks the site for scans
that are still waiting, builds a model for each and uploads it; the site does the final simplification.
It races the hosted routes, so it matters most when Hugging Face is busy or down.

Measured on this laptop (8-core CPU, no NVIDIA GPU): 18 s to load the model once the files are cached,
then 14 s for each photo at resolution 160. The very first start took about 4 minutes, almost all of it
downloads.

Setup (Windows, PowerShell, Python 3.12; about 2.5 GB of downloads the first time: PyTorch and the other
packages, 1.7 GB of TripoSR weights, a 170 MB background-removal model):

```
# 1. A Python environment outside the project (so it is never uploaded to Vercel)
python -m venv $HOME\.wishworld\mesh-worker\venv
$py = "$HOME\.wishworld\mesh-worker\venv\Scripts\python.exe"

# 2. Packages (CPU build of PyTorch)
& $py -m pip install --upgrade pip
& $py -m pip install torch --index-url https://download.pytorch.org/whl/cpu
& $py -m pip install -r tools\mesh-worker\requirements.txt

# 3. TripoSR source (only its "tsr" folder is used; the weights download themselves on first run)
git clone --depth 1 https://github.com/VAST-AI-Research/TripoSR $HOME\.wishworld\mesh-worker\TripoSR
$env:TRIPOSR_DIR = "$HOME\.wishworld\mesh-worker\TripoSR"

# 4. Try it on one photo (writes teddy-bear.glb to the temp folder)
& $py tools\mesh-worker\worker.py --once tools\mesh-worker\samples\teddy-bear.jpg --out $env:TEMP\teddy-bear.glb

# 5. Run it against the site
$env:MESH_WORKER_KEY = "<the same value as on Vercel>"
& $py tools\mesh-worker\worker.py
```

TripoSR normally needs the `torchmcubes` package, which has to be compiled with CMake and a C++ compiler.
`shim/torchmcubes.py` replaces it with scikit-image, so nothing is compiled.

To let the worker talk to the site, create a secret once and set it in both places:

```
# any long random string will do
$key = -join ((1..40) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
vercel env add MESH_WORKER_KEY production --value $key --yes      # then redeploy: pwsh -File tools/deploy.ps1
Set-Content tools\mesh-worker\.env "MESH_WORKER_KEY=$key"         # .env files are ignored by git and by Vercel
```

`TRIPOSR_DIR` and `WISHWORLD_SITE` can go in the same `.env` file.

Worker routes (header `x-mesh-key: <MESH_WORKER_KEY>`):

- `GET /api/scan-status?pending=1` returns `{ jobs: [{ id, image_url, stage, age_ms, ms_left }] }`: scans
  still pending and younger than 110 seconds.
- `POST /api/scan-status` with `{ id, model }` (`model` = base64 `.glb`, at most 3 MB) returns
  `{ gift, used }`. `used` is false when the gift was already finished by someone else.
