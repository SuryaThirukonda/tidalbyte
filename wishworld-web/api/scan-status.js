// GET /api/scan-status?id=  -> { gift, companion }
// The phone polls this every 2 to 3 seconds after POST /api/scan. The gift is `pending` until its model is
// stored (kind "mesh", status "ready", model_url a light .glb), or until it has been turned into a library
// creature (kind "creature", status "ready") because nothing worked or two minutes passed. The poll is
// only a window on the work, which runs in the background of POST /api/scan; it steps in for two cases:
// the two-minute rule, and a background task that never started.
//
// For the optional local worker (tools/mesh-worker), protected by the MESH_WORKER_KEY secret sent in an
// "x-mesh-key" header:
//   GET  /api/scan-status?pending=1          -> { jobs: [{ id, image_url, age_ms, ms_left }] }
//   POST /api/scan-status { id, model }      -> { gift, used }   (model = base64 .glb, at most 3 MB)
import { waitUntil } from './_lib/runtime.js';
import { timingSafeEqual } from 'node:crypto';
import { route, send, body, base64Bytes, UserError } from './_lib/http.js';
import { sql, giftJson } from './_lib/db.js';
import { TIMEOUT_MS, fallbackToCreature, storeModel, companionOf, yawFor } from './_lib/mesh/job.js';
import { runScan, invocationEnd } from './_lib/mesh/run.js';

// A status call can end up running the two-minute fallback (one Claude call) or carrying a scan on in the
// background: when POST /api/scan ran short of function time and handed over, or never started its task.
// (vercel.json's 60 s for every function currently wins over this export; see the note in api/scan.js.)
export const config = { maxDuration: 300 };

const MAX_MODEL_BYTES = 3 * 1024 * 1024;
const NEVER_STARTED_MS = 15000;

function requireWorker(req) {
  const expected = process.env.MESH_WORKER_KEY || '';
  if (!expected) throw new UserError('The local worker is not set up on this site (MESH_WORKER_KEY is missing).', 403);
  const auth = String(req.headers['authorization'] || '');
  const given = String(req.headers['x-mesh-key'] || (auth.startsWith('Bearer ') ? auth.slice(7) : ''));
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UserError('That worker key is not right.', 401);
}

function giftId(value) {
  const raw = String(value ?? '');
  if (!/^\d{1,15}$/.test(raw)) throw new UserError('"id" must be a gift id.');
  return Number(raw);
}

async function findScan(id) {
  const rows = await sql`select *, (extract(epoch from (now() - created_at)) * 1000)::bigint as age_ms from gifts where id = ${id}`;
  return rows[0] || null;
}

/** Carries a scan on in this invocation: fetch the photo again and run the task from where the row says it is. */
async function resume(row, end) {
  const res = await fetch(row.image_url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`photo: HTTP ${res.status}`);
  await runScan(row, Buffer.from(await res.arrayBuffer()), 'image/jpeg', { end });
}

export default route(['GET', 'POST'], async (req, res) => {
  const end = invocationEnd();
  // ----- the local worker hands in a model -----
  if (req.method === 'POST') {
    requireWorker(req);
    const b = body(req);
    const id = giftId(b.id);
    const model = base64Bytes(b.model, MAX_MODEL_BYTES);
    if (!model || model.subarray(0, 4).toString('latin1') !== 'glTF') throw new UserError('"model" must be a base64 .glb file.');
    const row = await findScan(id);
    if (!row) throw new UserError('No such gift.', 404);
    if (row.kind !== 'mesh' || row.status !== 'pending') return send(res, 200, { gift: giftJson(row), used: false });
    let stored;
    try {
      stored = await storeModel(id, model, 'worker', { yaw: b.facing === '+z' ? 0 : yawFor('worker') });
    } catch (err) {
      throw new UserError(`That model could not be used: ${err && err.message}`, 422);
    }
    return send(res, 200, { gift: giftJson(stored || (await findScan(id))), used: Boolean(stored) });
  }

  const q = req.query || {};

  // ----- the local worker asks for work -----
  if (q.pending !== undefined) {
    requireWorker(req);
    const rows = await sql`
      select id, image_url, job_id, (extract(epoch from (now() - created_at)) * 1000)::bigint as age_ms
      from gifts
      where kind = 'mesh' and status = 'pending' and created_at > now() - interval '110 seconds'
      order by id asc limit 5`;
    return send(res, 200, {
      jobs: rows.map((r) => ({ id: Number(r.id), image_url: r.image_url, stage: r.job_id, age_ms: Number(r.age_ms), ms_left: Math.max(0, TIMEOUT_MS - Number(r.age_ms)) })),
    });
  }

  // ----- the phone's poll -----
  const id = giftId(q.id);
  let row = await findScan(id);
  if (!row) throw new UserError('No such gift.', 404);

  if (row.kind === 'mesh' && row.status === 'pending') {
    const age = Number(row.age_ms);
    if (age >= TIMEOUT_MS) {
      row = await fallbackToCreature(id, 'two minutes passed');
    } else if (String(row.job_id).startsWith('handoff:') || (row.job_id === 'queued' && age > NEVER_STARTED_MS)) {
      // Handed over by POST /api/scan, or its background task never started: carry on here.
      waitUntil(resume(row, end).catch((err) => console.error(`[scan ${id}] resume failed:`, err)));
    }
  }

  send(res, 200, { gift: giftJson(row), companion: companionOf(row) });
});
