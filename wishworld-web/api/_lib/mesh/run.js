// The background task behind POST /api/scan: asks the free routes for a model, in order, and always
// leaves the gift ready (see job.js for the states a gift goes through).
import { getDeadline } from '../runtime.js';
import { sql } from '../db.js';
import { ROUTES } from './routes.js';
import { storeModel, fallbackToCreature, yawFor } from './job.js';

/** No route is asked for a model later than this after the gift was created (the two-minute rule is at 120 s). */
const GENERATE_MS = 104000;
/** Kept back at the end of an invocation for storing a model or asking Claude for a creature. */
const RESERVE_MS = 8000;
/** Stable Fast 3D answers in seconds; past this it is stuck in a queue. */
const SF3D_MS = 25000;
/** What step 2 (TRELLIS and TripoSR) needs at the very least: TripoSR takes 32 to 45 seconds from Vercel. */
const SECOND_MS = 44000;
/** With less than this left, the first invocation hands step 2 over rather than cut it fine. */
const COMFORTABLE_MS = 60000;

/**
 * When the platform will stop the function invocation we are running in. Call it at the start of a request.
 * Vercel and the Netlify adapter report the real limit; if neither does, assume 60 seconds (the Netlify limit
 * for a synchronous function, and what vercel.json gives every function).
 */
export function invocationEnd() {
  try {
    const deadline = getDeadline();
    if (deadline && deadline.getTime() > Date.now() + 1000) return deadline.getTime();
  } catch {
    /* not running on Vercel */
  }
  return Date.now() + 60000;
}

function setStage(id, name) {
  return sql`update gifts set job_id = ${'gen:' + name} where id = ${id} and status = 'pending' and job_id like 'gen:%'`.catch(() => {});
}

/** Asks one route for a model and stores it. Resolves once the gift is finished (by this route, or already). */
async function attempt(name, label, id, image, mime, deadline) {
  // (for trellism, `image` is the array of photos, front first)

  const started = Date.now();
  try {
    const raw = await ROUTES[name](image, mime, { deadline, onStatus: () => {} });
    console.log(`[scan ${id}] ${name}: model received after ${Date.now() - started} ms (${raw.length} bytes)`);
    await storeModel(id, raw, label, { yaw: yawFor(name) });
  } catch (err) {
    console.warn(`[scan ${id}] ${name} failed after ${Date.now() - started} ms: ${err && err.message}`);
    throw err;
  }
}

/**
 * Tries the free routes in order and always leaves the gift ready: as a mesh if one of them worked,
 * otherwise as a library creature.
 *
 *   1. Stable Fast 3D (seconds, textured) on its own.
 *   2. If that fails: TRELLIS and TripoSR together. TRELLIS is used if it succeeds (it looks better),
 *      otherwise TripoSR. TRELLIS is skipped when Hugging Face has just said the GPU allowance is used
 *      up, because it needs more of it than Stable Fast 3D does.
 *   A local worker (tools/mesh-worker) may also upload a model at any point; whoever is first wins.
 *
 * Step 2 can take 45 seconds. If this invocation does not have a comfortable minute left (a function
 * limited to 60 seconds has already spent some on the request and on step 1), the task writes "handoff:<routes>" into
 * job_id and calls `relay`, which makes GET /api/scan-status start step 2 in a fresh invocation. Any
 * status poll that sees the marker does the same, so the hand-over does not depend on that one call.
 *
 * options:
 *   end    invocationEnd(), taken at the start of the request
 *   relay  async (id) => true when another invocation has been asked to carry on
 *   debug  test switches: { mode: 'fail' | 'hang', routes: ['triposr', ...], delayMs }
 */
export async function runScan(row, image, mime, { end = Date.now() + 60000, relay = null, debug = null, views = null } = {}) {
  const id = Number(row.id);
  const scanEnd = new Date(row.created_at).getTime() + GENERATE_MS;
  // The latest moment a route may still be working in this invocation.
  const routesEnd = Math.min(scanEnd, end - RESERVE_MS);
  try {
    const handedOver = String(row.job_id || '').startsWith('handoff:');
    let second;
    let why = 'no route worked';

    if (handedOver) {
      const claimed = await sql`update gifts set job_id = 'gen:second' where id = ${id} and status = 'pending' and job_id = ${row.job_id} returning id`;
      if (!claimed.length) return;
      second = row.job_id.slice('handoff:'.length).split('+').filter((name) => ROUTES[name]);
    } else {
      const claimed = await sql`update gifts set job_id = 'gen:start' where id = ${id} and status = 'pending' and job_id = 'queued' returning id`;
      if (!claimed.length) return;
      if (debug && debug.mode === 'hang') return; // leave it pending: the status route's two-minute rule takes over
      if (debug && debug.delayMs) await new Promise((resolve) => setTimeout(resolve, debug.delayMs));
      if (debug && debug.mode === 'fail') {
        await fallbackToCreature(id, 'forced by debug');
        return;
      }
      const allowed = (name) => ROUTES[name] && (!debug || !Array.isArray(debug.routes) || debug.routes.includes(name));
      let quotaGone = false;
      // Several photos: TRELLIS's multi-image mode first, leaving time for Stable Fast 3D on the front photo.
      if (Array.isArray(views) && views.length > 1 && allowed('trellism') && routesEnd - Date.now() > 30000) {
        await setStage(id, 'trellism');
        try {
          await attempt('trellism', 'trellism', id, views, mime, routesEnd - 9000);
          return;
        } catch (err) {
          quotaGone = Boolean(err && err.quota);
        }
      }
      // The team's GPU first, when it is running (TRELLIS, about 20 s, no allowance to run out).
      if (process.env.BREV_3D_URL && allowed('brev') && routesEnd - Date.now() > 30000) {
        await setStage(id, 'brev');
        try {
          await attempt('brev', 'brev', id, image, mime, Math.min(routesEnd - 9000, Date.now() + 60000));
          return;
        } catch { /* on to the free routes */ }
      }
      if (allowed('sf3d') && routesEnd - Date.now() > 8000) {
        await setStage(id, 'sf3d');
        try {
          await attempt('sf3d', 'sf3d', id, image, mime, Math.min(routesEnd, Date.now() + SF3D_MS));
          return;
        } catch (err) {
          quotaGone = Boolean(err && err.quota);
        }
      }
      second = ['trellis', 'triposr'].filter((name) => allowed(name) && !(name === 'trellis' && quotaGone));
    }

    if (second.length) {
      const now = Date.now();
      const canHandOver = !handedOver && relay && scanEnd - now >= SECOND_MS + 6000;
      if (routesEnd - now >= (canHandOver ? COMFORTABLE_MS : SECOND_MS)) {
        await setStage(id, second.join('+'));
        const runs = second.map((name) =>
          attempt(name, handedOver ? `${name}@2` : name, id, image, mime, name === 'trellis' ? Math.min(routesEnd, now + 70000) : routesEnd).then(
            () => true,
            () => false,
          ),
        );
        for (const run of runs) if (await run) return;
        if (Date.now() >= routesEnd) why = 'out of time';
      } else if (canHandOver) {
        // Not enough of this invocation left for step 2: pass it to a fresh one.
        const marker = 'handoff:' + second.join('+');
        await sql`update gifts set job_id = ${marker} where id = ${id} and status = 'pending' and job_id like 'gen:%'`;
        const passed = await relay(id).catch(() => false);
        if (passed) return;
        // The call did not get through. Take the gift back, unless a status poll has picked it up meanwhile.
        const back = await sql`update gifts set job_id = 'gen:second' where id = ${id} and status = 'pending' and job_id = ${marker} returning id`;
        if (!back.length) return;
        why = 'could not hand over';
      } else {
        why = 'out of time';
      }
    }
    await fallbackToCreature(id, why);
  } catch (err) {
    console.error(`[scan ${id}] background task failed:`, err);
    try {
      await fallbackToCreature(id, 'error');
    } catch (again) {
      console.error(`[scan ${id}] fallback failed too:`, again);
    }
  }
}
