// End-to-end check of the scan route against the deployed site (or any site).
//
//   node tools/mesh-worker/scan-test.mjs tools/mesh-worker/samples/teddy-bear.jpg
//   node tools/mesh-worker/scan-test.mjs <photo> --routes triposr        only try the named route(s)
//   node tools/mesh-worker/scan-test.mjs <photo> --mode fail             force the creature fallback at once
//   node tools/mesh-worker/scan-test.mjs <photo> --mode hang             let the two-minute rule fire
//   node tools/mesh-worker/scan-test.mjs <photo> --routes triposr --delay 40   wait 40 s first (proves the
//                                                                        background task may run past 60 s)
//   node tools/mesh-worker/scan-test.mjs <photo> --site http://localhost:3000 --room TEST
//
// The --routes and --mode switches are test switches the server only honours in room TEST (or when its
// MESH_DEBUG env is 1). The script posts the photo, polls /api/scan-status until the gift is ready,
// downloads the .glb into the system temp folder (wishworld-scan-test/) and reports its size and triangle count.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inspectGlb } from '../../api/_lib/mesh/optimize.js';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args.splice(i, 2)[1] : fallback;
};
const site = flag('site', 'https://wishworld-web.vercel.app').replace(/\/+$/, '');
const room = flag('room', 'TEST');
const routes = flag('routes', '');
const mode = flag('mode', '');
const delay = Number(flag('delay', '0'));
const photoPath = args[0];
if (!photoPath) {
  console.error('usage: node tools/mesh-worker/scan-test.mjs <photo.jpg> [--routes a,b] [--mode fail|hang] [--site URL] [--room CODE]');
  process.exit(2);
}

const started = Date.now();
const at = () => ((Date.now() - started) / 1000).toFixed(1).padStart(6) + 's';
const debug = routes || mode || delay ? { ...(mode ? { mode } : {}), ...(routes ? { routes: routes.split(',') } : {}), ...(delay ? { delayMs: delay * 1000 } : {}) } : undefined;

const photo = fs.readFileSync(photoPath);
const post = await fetch(`${site}/api/scan`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ room, sender: 'Scan test', image: photo.toString('base64'), imageType: 'image/jpeg', debug }),
});
const first = await post.json();
if (!post.ok) {
  console.error(at(), 'POST /api/scan failed:', post.status, first);
  process.exit(1);
}
let gift = first.gift;
console.log(at(), `POST /api/scan -> gift ${gift.id}, kind ${gift.kind}, status ${gift.status}`);
console.log('        companion:', JSON.stringify(first.companion), '| first line:', JSON.stringify(gift.message));

let lastStage = '';
while (gift.status === 'pending' && Date.now() - started < 200000) {
  await new Promise((r) => setTimeout(r, 2500));
  const res = await fetch(`${site}/api/scan-status?id=${gift.id}`);
  const data = await res.json();
  if (!res.ok) {
    console.error(at(), 'scan-status failed:', res.status, data);
    continue;
  }
  gift = data.gift;
  const stage = `${gift.status} ${gift.kind} ${gift.job_id}`;
  if (stage !== lastStage) console.log(at(), stage);
  lastStage = stage;
}

console.log(at(), `finished: kind ${gift.kind}, status ${gift.status}, option_id ${gift.option_id}, job ${gift.job_id}`);
console.log('        message:', JSON.stringify(gift.message), '| wish:', JSON.stringify(gift.wish));
if (gift.kind === 'mesh' && gift.model_url) {
  const res = await fetch(gift.model_url);
  const glb = Buffer.from(await res.arrayBuffer());
  const out = path.join(os.tmpdir(), 'wishworld-scan-test');
  fs.mkdirSync(out, { recursive: true });
  const file = path.join(out, `gift-${gift.id}-${String(gift.job_id).replace(/[^a-z0-9]+/gi, '-')}.glb`);
  fs.writeFileSync(file, glb);
  const info = await inspectGlb(glb);
  console.log(at(), `model: HTTP ${res.status}, ${res.headers.get('content-type')}, ${(glb.length / 1024).toFixed(0)} KB, ${info.triangles} triangles, ${info.vertices} vertices,`,
    `textures ${JSON.stringify(info.textures.map((t) => `${t.type} ${t.size && t.size.join('x')}`))}, vertex colours ${info.vertexColors}, extensions ${JSON.stringify(info.extensions)}`);
  console.log('        saved', file);
  console.log('        ' + gift.model_url);
}
const ok = gift.status === 'ready' && (gift.kind === 'creature' ? Boolean(gift.option_id) : Boolean(gift.model_url));
console.log(ok ? 'OK' : 'NOT OK');
process.exit(ok ? 0 : 1);
