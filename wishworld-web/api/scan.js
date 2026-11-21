// POST /api/scan { room, sender, image, imageType? } -> { gift, companion: { name, what } }
// POST /api/scan { room, sender, images: [front, back, side, ...] }   (2 to 4 photos of the same object)
// Several photos let TRELLIS build the back and sides from real views instead of guessing them (see run.js).
// Someone photographs a toy. This stores the photo, asks Claude Haiku for the companion's name and first
// line (the one slow call of the request), saves a `pending` gift of kind "mesh" and answers. Turning the
// photo into a 3D model then carries on in the background (waitUntil), so the model does not depend on
// the phone staying on the page: the headset sees the gift through GET /api/gifts once it is `ready`.
// A scan always ends `ready`, as a mesh or, if nothing worked within two minutes, as a library creature.
// See api/_lib/mesh/job.js for the order of attempts and GET /api/scan-status for the poll.
import { waitUntil } from './_lib/runtime.js';
import sharp from 'sharp';
import { route, send, body, text, roomCode, base64Bytes, UserError } from './_lib/http.js';
import { ensureRoom, insertGift, giftJson } from './_lib/db.js';
import { resolveProfile } from './_lib/profiles.js';
import { save, randomName } from './_lib/store.js';
import { safeSender } from './_lib/safety.js';
import { nameCompanion, companionOf } from './_lib/mesh/job.js';
import { runScan, invocationEnd } from './_lib/mesh/run.js';

// Generation runs after the response, inside this invocation, so it wants a long limit (the task stops
// by itself after about two minutes). NOTE: vercel.json currently sets 60 s for every function and that
// wins over this export; until vercel.json has  "api/scan.js": { "maxDuration": 300 }  (and the same for
// api/scan-status.js) ahead of its catch-all entry, run.js hands the slow routes over to a second invocation.
export const config = { maxDuration: 300 };

const MAX_PHOTO_BYTES = 4 * 1024 * 1024; // Vercel caps a request body at 4.5 MB; the phone sends far less
const MAX_VIEWS = 4;                      // photos of one object; the phone shrinks each to 1024 px (about 200 KB)
const MAX_TOTAL_BYTES = 5 * 1024 * 1024;  // Netlify takes 6 MB per request, base64 included

function kindOf(bytes) {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (bytes.length > 8 && bytes.subarray(0, 8).toString('latin1') === '\x89PNG\r\n\x1a\n') return 'png';
  if (bytes.length > 12 && bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}

/** Upright, at most 1024 px on the long side, JPEG, no camera metadata (which can hold a location). */
async function tidyPhoto(bytes) {
  if (!kindOf(bytes)) throw new UserError('That does not look like a photo. Please send a JPEG or PNG.');
  let flat = false;
  try {
    // A photo of nothing (lens covered, blank wall) would still come back as a shapeless lump: say so instead.
    const stats = await sharp(bytes).rotate().stats();
    flat = stats.channels.every((c) => c.stdev < 5);
  } catch {
    flat = false; // unreadable photos are reported below
  }
  if (flat) throw new UserError('We could not see a toy in that photo. Try again with more light.');
  try {
    const image = sharp(bytes, { failOn: 'error' }).rotate();
    const meta = await image.metadata();
    if (!meta.width || !meta.height || Math.min(meta.width, meta.height) < 32) throw new Error('too small');
    return await image
      .flatten({ background: '#ffffff' })
      .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 86 })
      .toBuffer();
  } catch {
    throw new UserError('That photo could not be read. Please take it again.');
  }
}

/** Test switches ({ mode: 'fail' | 'hang', routes: [...], delayMs }). Honoured only in room TEST or when MESH_DEBUG is 1. */
function debugOptions(b, room) {
  if (!b.debug || typeof b.debug !== 'object') return null;
  if (room !== 'TEST' && process.env.MESH_DEBUG !== '1') return null;
  const mode = b.debug.mode === 'fail' || b.debug.mode === 'hang' ? b.debug.mode : null;
  const routes = Array.isArray(b.debug.routes) ? b.debug.routes.filter((r) => typeof r === 'string').slice(0, 5) : null;
  const delayMs = Math.min(60000, Math.max(0, Number(b.debug.delayMs) || 0));
  return mode || routes || delayMs ? { mode, routes, delayMs } : null;
}

/** Asks GET /api/scan-status to carry the scan on in a fresh invocation (see runScan). */
function relayThrough(req) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return async (id) => {
    if (!host) return false;
    const scheme = /^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? 'http' : 'https';
    const res = await fetch(`${scheme}://${host}/api/scan-status?id=${id}&carry=1`, { signal: AbortSignal.timeout(8000) });
    return res.ok;
  };
}

export default route('POST', async (req, res) => {
  const end = invocationEnd();
  const b = body(req);
  const room = roomCode(b.room);
  const given = Array.isArray(b.images) && b.images.length ? b.images : [b.image];
  if (given.length > MAX_VIEWS) throw new UserError(`Please send at most ${MAX_VIEWS} photos.`);
  const raws = given.map((value) => base64Bytes(value, MAX_PHOTO_BYTES));
  if (!raws[0] || raws.some((r) => !r)) throw new UserError('Take a photo first.');
  if (raws.reduce((n, r) => n + r.length, 0) > MAX_TOTAL_BYTES) throw new UserError('Those photos are too large together. Try fewer.');
  const sender = safeSender(text(b.sender, 40));
  const views = [];
  for (let i = 0; i < raws.length; i++) {
    try {
      views.push(await tidyPhoto(raws[i]));
    } catch (err) {
      if (raws.length > 1 && err instanceof UserError) throw new UserError(`Photo ${i + 1}: ${err.message}`);
      throw err;
    }
  }
  const photo = views[0];

  // Storing the photo is quick; naming is the one slow call (it never throws and has a friendly default).
  const [imageUrl, companion] = await Promise.all([
    save(`scans/photo-${randomName()}.jpg`, photo, 'image/jpeg'),
    nameCompanion(photo, 'image/jpeg'),
    ensureRoom(room),
  ]);

  const profile = await resolveProfile(room, b.profile_id);   // who the gift is for (the default if not said)
  const row = await insertGift({
    profile_id: profile.id,
    room_code: room,
    sender,
    kind: 'mesh',
    wish: `${companion.name}, ${companion.what}`.slice(0, 120),
    message: companion.line,
    image_url: imageUrl,
    job_id: 'queued',
    status: 'pending',
  });

  waitUntil(runScan(row, photo, 'image/jpeg', { end, relay: relayThrough(req), debug: debugOptions(b, room), views }));

  send(res, 200, { gift: giftJson(row), companion: companionOf(row) });
});
