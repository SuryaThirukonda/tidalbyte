// Bubby's model (public/models/bubby.glb) from photos of the plush: node tools/bubby-model.mjs <photo folder> [view]
// The folder holds 1.jpg (back) .. 5.jpg (front). With view "all" it asks TRELLIS's multi-image mode for one model
// from every side (needs free GPU time: set HF_TOKEN); otherwise Stable Fast 3D or TripoSR from one photo
// (default 1 = the three-quarter front). Single-photo models face -Z and are turned to face +Z.
import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { ROUTES } from '../../api/_lib/mesh/routes.js';
import { optimizeGlb } from '../../api/_lib/mesh/optimize.js';
const dir = process.argv[2];
const order = ['5.jpg', '4.jpg', '3.jpg', '2.jpg', '1.jpg'];
const views = await Promise.all(order.map((f) => sharp(readFileSync(dir + '/' + f)).rotate().resize(1024, 1024, { fit: 'inside' }).jpeg({ quality: 90 }).toBuffer()));
const all = process.argv[3] === 'all';
const pick = all ? 0 : Number(process.argv[3] || 1);
const tries = all ? [['trellism', views]] : [['sf3d', views[pick]], ['triposr', views[pick]]];
for (const [name, input] of tries) {
  const t0 = Date.now();
  try {
    const raw = await ROUTES[name](input, 'image/jpeg', { deadline: Date.now() + 240000, onStatus: (s) => {} });
    const { glb, before, after } = await optimizeGlb(raw, { yaw: name === 'trellism' ? 0 : Math.PI });
    writeFileSync('public/models/bubby.glb', glb);
    console.log(`${name}: ${before.triangles} -> ${after.triangles} triangles, ${glb.length} bytes, ${Date.now() - t0} ms`);
    process.exit(0);
  } catch (err) { console.log(`${name} failed after ${Date.now() - t0} ms: ${err.message}`); }
}
process.exit(1);
