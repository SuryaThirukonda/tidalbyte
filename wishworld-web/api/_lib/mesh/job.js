// The life of one scan after its gift row exists.
//
//   pending, job_id "queued"        row inserted by POST /api/scan
//   pending, job_id "gen:<route>"   the background task (run.js) is asking <route> for a model
//   pending, job_id "handoff:<routes>" the task ran short of function time; the next status call carries on
//   ready,   job_id "done:<route>"  kind "mesh", model_url is a light .glb in Blob ("@2" = made after a hand-over)
//   ready,   job_id "creature:<why>" kind "creature": nothing worked (or two minutes passed), so the closest
//                                   library creature was sent instead. A scan always produces something.
//
// Every write is conditional on status = 'pending', so the background task, a status poll, and a local
// worker can all race safely: the first one to finish wins and the others become no-ops.
import { sql, getGift } from '../db.js';
import { save, randomName } from '../store.js';
import { optimizeGlb } from './optimize.js';

/** A scan that is still pending this long after its row was created becomes a library creature. */
export const TIMEOUT_MS = 120000;

const DEFAULT_CREATURE = { option_id: 'turtle', message: 'A sea turtle has come to play with you!', what: 'a surprise' };
const DEFAULT_COMPANION = { name: 'Buddy', line: 'Hi! I am Buddy. I am so happy to meet you!', what: 'a new friend' };

// ---------- words (Claude Haiku, through the shared helper when it is there) ----------

async function haiku() {
  try {
    return await import('../haiku.js');
  } catch (err) {
    console.warn('[scan] haiku.js could not be loaded:', err && err.message);
    return null;
  }
}

/** { name, line, what } for a photographed toy. Never throws. */
export async function nameCompanion(image, mime) {
  try {
    const h = await haiku();
    if (h && typeof h.nameCompanion === 'function') {
      const c = await h.nameCompanion(image, mime);
      if (c && c.name && c.line) {
        const name = String(c.name);
        // The first line must say the same name the card shows.
        const line = String(c.line).toLowerCase().includes(name.toLowerCase()) ? String(c.line) : `Hi! I am ${name}. I am so happy to meet you!`;
        return { name, line, what: String(c.what || DEFAULT_COMPANION.what) };
      }
    }
  } catch (err) {
    console.warn('[scan] naming failed:', err && err.message);
  }
  return { ...DEFAULT_COMPANION };
}

/** { option_id, message, what }: the library creature closest to the photo. Never throws. */
async function creatureFromPhoto(image, mime) {
  try {
    const h = await haiku();
    if (h && image && typeof h.pickCreatureFromPhoto === 'function') {
      const c = await h.pickCreatureFromPhoto(image, mime);
      if (c && c.option_id && c.message) return c;
    }
  } catch (err) {
    console.warn('[scan] creature pick failed:', err && err.message);
  }
  // No Claude: any creature from the shared table, else the turtle.
  try {
    const { CREATURES } = await import('../../../public/shared/creatures.js');
    const list = Array.isArray(CREATURES) ? CREATURES : Object.entries(CREATURES || {}).map(([id, c]) => ({ id, ...c }));
    const usable = list.filter((c) => c && typeof c.id === 'string' && c.giftable !== false);
    const turtle = usable.find((c) => c.id === DEFAULT_CREATURE.option_id) || usable[0];
    if (turtle) {
      const name = String(turtle.name || turtle.id).toLowerCase();
      return { option_id: turtle.id, message: `${/^[aeiou]/.test(name) ? 'An' : 'A'} ${name} has come to play with you!`, what: 'a surprise' };
    }
  } catch {
    /* the shared table is not there: use the built-in default */
  }
  return { ...DEFAULT_CREATURE };
}

/** The companion's name and what the photo showed, as stored in the gift's `wish` ("Biscuit, a teddy bear"). */
export function companionOf(row) {
  if (!row || row.kind !== 'mesh' || typeof row.wish !== 'string') return null;
  const cut = row.wish.indexOf(', ');
  return cut > 0 ? { name: row.wish.slice(0, cut), what: row.wish.slice(cut + 2) } : { name: row.wish, what: '' };
}

// ---------- storing a finished model ----------

/**
 * Optimises a generated .glb, stores it in Blob and marks the gift ready.
 * Returns the updated row, or null if the gift was no longer pending (someone else finished it first).
 * Throws if the file cannot be read or simplified.
 */
export async function storeModel(id, rawGlb, route, { yaw = 0 } = {}) {
  const { glb, before, after } = await optimizeGlb(rawGlb, { yaw });
  const url = await save(`scans/model-${id}-${randomName()}.glb`, glb, 'model/gltf-binary');
  const rows = await sql`
    update gifts set model_url = ${url}, status = 'ready', job_id = ${'done:' + route}
    where id = ${id} and status = 'pending' and kind = 'mesh'
    returning *`;
  console.log(`[scan ${id}] ${route}: ${before.triangles} -> ${after.triangles} triangles, ${after.bytes} bytes${rows.length ? '' : ' (not used: the gift was already finished)'}`);
  return rows[0] || null;
}

// ---------- the fallback ----------

/**
 * Turns a pending scan into a library creature (kind "creature", status "ready").
 * Safe to call from several places at once: one caller does the work, the rest get the current row.
 */
export async function fallbackToCreature(id, why) {
  const now = Date.now();
  // Claim it, unless another caller claimed it in the last 25 seconds (it is busy asking Claude).
  const claimed = await sql`
    update gifts set job_id = ${'fallback:' + now}
    where id = ${id} and status = 'pending' and kind = 'mesh'
      and (job_id is null or job_id not like 'fallback:%' or split_part(job_id, ':', 2)::bigint < ${now - 25000})
    returning *`;
  if (!claimed.length) return getGift(id);
  const row = claimed[0];

  let image = null;
  let mime = 'image/jpeg';
  try {
    const res = await fetch(row.image_url, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      image = Buffer.from(await res.arrayBuffer());
      mime = (res.headers.get('content-type') || mime).split(';')[0];
    }
  } catch {
    image = null;
  }
  const pick = await creatureFromPhoto(image, mime);

  const rows = await sql`
    update gifts set kind = 'creature', option_id = ${pick.option_id}, message = ${pick.message},
      wish = ${pick.what || row.wish}, status = 'ready', job_id = ${('creature:' + why).slice(0, 120)}
    where id = ${id} and status = 'pending'
    returning *`;
  console.log(`[scan ${id}] fallback (${why}): ${rows.length ? pick.option_id : 'not needed, the gift was already finished'}`);
  return rows[0] || getGift(id);
}

// ---------- generation ----------

// Both Stable Fast 3D and TripoSR build the model with its face towards -Z; the headset expects +Z.
const YAW = { sf3d: Math.PI, triposr: Math.PI, trellis: 0, trellism: 0, worker: Math.PI };
export const yawFor = (route) => YAW[route] ?? 0;
