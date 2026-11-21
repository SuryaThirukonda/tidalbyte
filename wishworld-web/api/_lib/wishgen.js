// Real wish generation: a typed or spoken wish becomes its own 3D model.
//
// POST /api/wish answers at once with a library creature (the child sees something immediately) and starts
// this task in the background. It tries, in order:
//
//   cache    a model already made for the same wish (wish_models table): instant
//   brev     the team's own GPU (BREV_3D_URL): an open text-to-3D model, when the instance is running
//   hf       free Hugging Face Spaces: FLUX.1-schnell draws the wish, then Stable Fast 3D (or TripoSR) builds it
//   fal      fal.ai (FAL_KEY): FLUX schnell, then TRELLIS
//   library  nothing worked: the library creature simply stays
//
// Every model goes through optimizeGlb (triangle and texture budget for a Quest 2) before it is stored, and is
// cached under the wish's key. The gift keeps kind "creature" and its option_id (the library stand-in), and
// gains model_url when the generated model is ready. job_id tracks the work:
//
//   wish:queued -> wish:gen:<route> -> wish:done:<route>      generated (or wish:done:cache)
//                                   -> wish:retry               ran out of function time; a status poll restarts it
//                                   -> wish:library             nothing worked; the library creature stays
import { sql } from './db.js';
import { save, randomName } from './store.js';
import { optimizeGlb } from './mesh/optimize.js';
import { openSpace, findFile } from './mesh/gradio.js';
import { ROUTES } from './mesh/routes.js';
import { record } from './metrics.js';

/** A wish still not generated this long after it was made keeps its library creature. */
export const WISH_TIMEOUT_MS = 150000;
const RESERVE_MS = 7000;
const FLUX_SPACE = () => process.env.WISH_IMAGE_SPACE || 'https://black-forest-labs-flux-1-schnell.hf.space';

// ---------- the cache ----------

let ready = null;
function ensureTable() {
  if (!ready) {
    ready = sql`
      create table if not exists wish_models (
        key text primary key,
        prompt text not null,
        model_url text not null,
        route text,
        triangles int,
        ms int,
        hits int not null default 0,
        created_at timestamptz not null default now()
      )`.catch((err) => { ready = null; throw err; });
  }
  return ready;
}

const STOP = new Set(('a an the i my me we our you your to for of and with some please wish want would like could can ' +
  'get have give send be is are it its that this one little big very really so much more make made').split(' '));

/** "I wish for a big blue Turtles!" -> "blue turtle". The same wish in other words still matches. */
export function wishKey(text) {
  const words = String(text || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/)
    .filter((w) => w && !STOP.has(w))
    .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));
  return [...new Set(words)].sort().join(' ').slice(0, 120);
}

/** What the picture generator is asked for: one friendly, whole object a 3D model can be built from. */
export function imagePrompt(subject) {
  return `${subject}, a cute friendly toy figure for a young child, one single object, whole body in view, centered, ` +
    'soft bright colors, plain pure white background, soft studio light, 3D render';
}

export async function cached(key) {
  if (!key) return null;
  await ensureTable();
  // Models made on a developer's machine (netlify dev) live only there: never hand them to the real site.
  const local = Boolean(process.env.NETLIFY_DEV);
  const rows = await sql`update wish_models set hits = hits + 1
    where key = ${key} and (${local} or (model_url not like 'http://localhost%' and model_url not like 'http://127.%'))
    returning *`;
  return rows[0] || null;
}

// ---------- routes: each returns the raw .glb bytes for a wish ----------

async function fetchBytes(url, deadline, init = {}) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(Math.max(1000, deadline - Date.now())) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  return Buffer.from(await res.arrayBuffer());
}

/** The team's GPU on Brev: POST { prompt } -> model/gltf-binary. */
async function brev(subject, deadline) {
  const base = process.env.BREV_3D_URL;
  if (!base) throw Object.assign(new Error('BREV_3D_URL is not set'), { skip: true });
  return fetchBytes(base.replace(/\/$/, '') + '/generate', deadline, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-key': process.env.BREV_3D_KEY || '' },
    body: JSON.stringify({ prompt: subject, image_prompt: imagePrompt(subject) }),
  });
}

/** Free: FLUX.1-schnell draws it, then the scan routes build it (Stable Fast 3D first, TripoSR if that is refused). */
async function drawWish(subject, deadline) {
  try {
    const space = await openSpace(FLUX_SPACE(), { deadline: Math.min(deadline, Date.now() + 25000) });
    // infer(prompt, seed, randomize seed, width, height, steps) -> [image, seed]
    const out = await space.call('infer', [imagePrompt(subject), 0, true, 768, 768, 4], { onStatus: () => {} });
    return { bytes: await space.download(findFile(out)), mime: 'image/webp' };
  } catch (err) {
    // Out of free GPU time (no HF_TOKEN, or it is used up): a free picture service with no key instead.
    console.warn('[wish] FLUX Space refused, drawing with Pollinations:', err && err.message);
    const url = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(imagePrompt(subject)) + '?width=768&height=768&nologo=true&model=flux';
    return { bytes: await fetchBytes(url, Math.min(deadline, Date.now() + 30000)), mime: 'image/jpeg' };
  }
}

async function hf(subject, deadline) {
  const { bytes: png, mime } = await drawWish(subject, deadline);
  let lastErr = null;
  for (const name of ['sf3d', 'triposr']) {
    if (deadline - Date.now() < (name === 'sf3d' ? 8000 : 40000)) continue;
    try {
      return await ROUTES[name](png, mime, { deadline: name === 'sf3d' ? Math.min(deadline, Date.now() + 30000) : deadline, onStatus: () => {} });
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('no time left for a 3D route');
}

/** fal.ai: FLUX schnell, then TRELLIS. */
async function fal(subject, deadline) {
  const key = process.env.FAL_KEY;
  if (!key) throw Object.assign(new Error('FAL_KEY is not set'), { skip: true });
  const call = async (model, input) => {
    const res = await fetch(`https://fal.run/${model}`, {
      method: 'POST',
      headers: { authorization: `Key ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(Math.max(1000, deadline - Date.now())),
    });
    if (!res.ok) throw new Error(`fal ${model}: HTTP ${res.status}`);
    return res.json();
  };
  const pic = await call('fal-ai/flux/schnell', { prompt: imagePrompt(subject), image_size: 'square', num_inference_steps: 4 });
  const imageUrl = pic && pic.images && pic.images[0] && pic.images[0].url;
  if (!imageUrl) throw new Error('fal: no picture');
  const mesh = await call('fal-ai/trellis', { image_url: imageUrl, texture_size: 1024, mesh_simplify: 0.9 });
  const glbUrl = mesh && mesh.model_mesh && mesh.model_mesh.url;
  if (!glbUrl) throw new Error('fal: no model');
  return fetchBytes(glbUrl, deadline);
}

const WISH_ROUTES = { brev, hf, fal };
export const WISH_ORDER = ['brev', 'hf', 'fal'];

// ---------- the task ----------

async function finish(id, room, key, subject, raw, route, startedAt) {
  const { glb, before, after } = await optimizeGlb(raw, {});
  const url = await save(`wishes/model-${id}-${randomName()}.glb`, glb, 'model/gltf-binary');
  const ms = Date.now() - startedAt;
  const rows = await sql`
    update gifts set model_url = ${url}, job_id = ${'wish:done:' + route}
    where id = ${id} and job_id like 'wish:%' and job_id not like 'wish:done:%' returning id`;
  await ensureTable();
  await sql`insert into wish_models (key, prompt, model_url, route, triangles, ms) values (${key}, ${subject}, ${url}, ${route}, ${after.triangles}, ${ms})
            on conflict (key) do nothing`;
  await record(room, 'model_triangles', { before: before.triangles, after: after.triangles, bytes: after.bytes, what: 'wish' });
  await record(room, 'wish_model_ms', { ms, route, triangles: after.triangles });
  console.log(`[wish ${id}] ${route}: ${before.triangles} -> ${after.triangles} triangles in ${ms} ms${rows.length ? '' : ' (gift already finished)'}`);
}

/**
 * Generates the model for one wish gift. `row` is the gift; `subject` the safe wish words. Resolves when the gift
 * is finished or this invocation is out of time (then job_id is "wish:retry" and the next status poll carries on).
 * options: end (when this invocation stops), routes (test switch: which routes may run).
 */
export async function runWishGen(row, subject, { end = Date.now() + 60000, routes = null } = {}) {
  const id = Number(row.id);
  const room = row.room_code;
  const createdAt = new Date(row.created_at).getTime();
  const key = wishKey(subject);
  const claimed = await sql`update gifts set job_id = 'wish:gen:start'
    where id = ${id} and job_id in ('wish:queued', 'wish:retry') returning id`;
  if (!claimed.length) return;
  const stop = Math.min(end - RESERVE_MS, createdAt + WISH_TIMEOUT_MS);
  try {
    const hit = await cached(key);
    if (hit) {
      await sql`update gifts set model_url = ${hit.model_url}, job_id = 'wish:done:cache' where id = ${id}`;
      await record(room, 'wish_cache', { hit: true });
      await record(room, 'wish_model_ms', { ms: Date.now() - createdAt, route: 'cache', triangles: hit.triangles });
      return;
    }
    await record(room, 'wish_cache', { hit: false });
    for (const name of WISH_ORDER) {
      if (routes && !routes.includes(name)) continue;
      if (stop - Date.now() < 8000) break;
      await sql`update gifts set job_id = ${'wish:gen:' + name} where id = ${id} and job_id like 'wish:gen:%'`;
      const t0 = Date.now();
      try {
        const raw = await WISH_ROUTES[name](subject, stop);
        await finish(id, room, key, subject, raw, name, createdAt);
        return;
      } catch (err) {
        if (!err.skip) {
          console.warn(`[wish ${id}] ${name} failed after ${Date.now() - t0} ms: ${err && err.message}`);
          await record(room, 'wish_route_failed', { route: name, why: String((err && err.message) || err).slice(0, 120) });
        }
      }
    }
    // Out of routes, or out of this invocation's time with the wish still young: let a poll try again once.
    const young = Date.now() < createdAt + WISH_TIMEOUT_MS - 45000;
    const outOfTime = end - Date.now() < 20000;
    const next = young && outOfTime && !String(row.job_id).startsWith('wish:retry') ? 'wish:retry' : 'wish:library';
    await sql`update gifts set job_id = ${next} where id = ${id} and job_id like 'wish:gen:%'`;
  } catch (err) {
    console.error(`[wish ${id}] task failed:`, err);
    await sql`update gifts set job_id = 'wish:library' where id = ${id} and job_id like 'wish:gen:%'`.catch(() => {});
  }
}
