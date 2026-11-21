// POST /api/wish { room, sender, text, profile_id? } -> { gift }
// GET  /api/wish?id=                                  -> { gift }   the headset polls this until the model is in
//
// Someone types (or says) a wish. Claude Haiku picks the library creature that comes closest, checks that the
// words are fit for a young child and writes the arrival line, all in ONE call; that creature is the gift's
// instant stand-in. If the words were fine, the wish's own 3D model is then generated in the background
// (api/_lib/wishgen.js: cache, the team's GPU, free Spaces, fal.ai) and lands on the same gift as model_url.
// If Claude cannot be reached, a keyword match and a fixed line are used instead, so a wish always becomes a gift.
//
// Beside Claude, the Nemotron layer (api/_lib/nemotron.js, the team's own GPU) runs on every wish: its safety
// check must agree before anything is built, and its planner turns the words into a scene plan (subject,
// colours, size, motion, place) that names what is built, keys the cache and tells the headset how it moves.
import { route, send, body, text, roomCode, UserError } from './_lib/http.js';
import { ensureRoom, insertGift, giftJson, sql } from './_lib/db.js';
import { resolveProfile } from './_lib/profiles.js';
import { pickCreature, matchCreature } from './_lib/haiku.js';
import { planWish, checkSafety } from './_lib/nemotron.js';
import { waitUntil } from './_lib/runtime.js';
import { invocationEnd } from './_lib/mesh/run.js';
import { runWishGen, WISH_TIMEOUT_MS } from './_lib/wishgen.js';
import { record } from './_lib/metrics.js';

export const config = { maxDuration: 300 };

let planColumn = null;
/** gifts.plan holds the Nemotron scene plan (added once; nothing is dropped). */
function ensurePlanColumn() {
  if (!planColumn) planColumn = sql`alter table gifts add column if not exists plan jsonb`.catch((err) => { planColumn = null; console.warn(err && err.message); });
  return planColumn;
}

/** Test switch for the route order, only for the TEST room: { routes: ['hf'] }. */
function debugRoutes(b, room) {
  return room === 'TEST' && b && Array.isArray(b.routes) ? b.routes.map(String) : null;
}

export default route(['GET', 'POST'], async (req, res) => {
  const end = invocationEnd();

  if (req.method === 'GET') {
    const raw = String((req.query || {}).id ?? '');
    if (!/^\d{1,15}$/.test(raw)) throw new UserError('"id" must be a gift id.');
    const rows = await sql`select *, (extract(epoch from (now() - created_at)) * 1000)::bigint as age_ms from gifts where id = ${Number(raw)}`;
    const row = rows[0];
    if (!row) throw new UserError('That gift is not here.', 404);
    const job = String(row.job_id || '');
    const age = Number(row.age_ms);
    // Too old: the library creature stays. Stalled or handed back: carry on in this invocation.
    if (job.startsWith('wish:') && !job.startsWith('wish:done:') && job !== 'wish:library' && age > WISH_TIMEOUT_MS) {
      await sql`update gifts set job_id = 'wish:library' where id = ${row.id} and job_id = ${job}`;
      row.job_id = 'wish:library';
    } else if (job === 'wish:retry' || (job === 'wish:queued' && age > 15000)) {
      waitUntil(runWishGen(row, (row.plan && row.plan.subject) || row.wish, { end }));
    }
    return send(res, 200, { gift: giftJson(row) });
  }

  const started = Date.now();
  const b = body(req);
  const room = roomCode(b.room);
  const wish = text(b.text, 200);
  if (!wish) throw new UserError('Type a wish first.');
  const sender = text(b.sender, 40);

  // The slow calls (none of them throws) side by side, with making sure the room exists.
  const [picked, plan, nemo] = await Promise.all([pickCreature(wish, sender), planWish(wish), checkSafety(wish, 'wish'), ensureRoom(room), ensurePlanColumn()]);
  // Built only when every check that answered agrees: Claude (or its word list) kept the words, and Nemotron said safe.
  const safe = picked.wish === wish && (!nemo || nemo.verdict === 'safe');
  // With Claude down the stand-in came from keywords; the planner's idea of the creature is usually closer.
  let optionId = picked.option_id;
  if (picked.source !== 'haiku' && plan && safe) {
    const better = matchCreature(`${plan.creature} ${plan.subject}`);
    if (better) optionId = better.id;
  }
  const subject = safe ? (plan && plan.subject) || picked.wish : null;
  // The library creature only stands in while the real thing is built, so the words name the wish itself.
  const message = safe
    ? `${picked.sender || 'Someone'} wished for ${subject.replace(/[.!?]+$/, '')}, made just for you!`
    : picked.message;

  const profile = await resolveProfile(room, b.profile_id);   // who the gift is for (the default if not said)
  const row = await insertGift({
    profile_id: profile.id,
    room_code: room,
    sender: picked.sender,
    kind: 'creature',
    wish: picked.wish, // the typed words if they were fine; otherwise only the name of what is coming
    option_id: optionId,
    message,
    status: 'ready',
    job_id: safe ? 'wish:queued' : 'wish:library',
  });
  if (plan && safe) {
    await sql`update gifts set plan = ${JSON.stringify(plan)}::jsonb where id = ${row.id}`;
    row.plan = plan;
  }
  await record(room, 'wish_first_ms', { ms: Date.now() - started });
  await record(room, 'safety', { by: picked.source === 'haiku' ? 'claude' : 'words', verdict: picked.wish === wish ? 'safe' : 'unsafe', what: 'wish' });
  if (nemo) await record(room, 'safety', { by: 'nemotron', verdict: nemo.verdict, categories: nemo.categories, ms: nemo.ms, what: 'wish' });
  if (plan) await record(room, 'wish_plan', { ms: plan.ms, motion: plan.motion, size: plan.size });
  if (safe) waitUntil(runWishGen(row, subject, { end, routes: debugRoutes(b, room) }));
  send(res, 200, { gift: giftJson(row) });
});
