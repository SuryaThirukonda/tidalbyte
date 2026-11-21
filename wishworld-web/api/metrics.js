// GET  /api/metrics?room=        -> the Judge view's numbers for a room (no wish text, no letters, no names)
// POST /api/metrics { room, fps } -> { ok }   the headset's frame rate, every few seconds (core/perf.js)
//
// GET returns:
//   firstModel      { last, median, count }        ms from a wish arriving to its library creature being stored
//   generatedModel  { last, median, count, routes } ms from a wish arriving to its own generated model
//   cache           { hits, misses, rate }
//   safety          { checks, unsafe, byChecker: { nemotron: {safe, unsafe}, claude: {...}, words: {...} }, recent }
//   triangles       { recent: [{ before, after, what }], medianAfter }
//   fps             { last, recent: [{ fps, ms, scale, target, device, at }] }
//   updatedAt
import { route, send, body, roomCode, UserError } from './_lib/http.js';
import { record, recent } from './_lib/metrics.js';

const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null; };
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

export default route(['GET', 'POST'], async (req, res) => {
  if (req.method === 'POST') {
    const b = body(req);
    const room = roomCode(b.room);
    const fps = num(b.fps, 0, 240);
    if (fps === null) throw new UserError('"fps" must be a number.');
    await record(room, 'headset_fps', {
      fps, ms: num(b.ms, 0, 5000), scale: num(b.scale, 0.1, 2), target: num(b.target, 0, 240),
      device: String(b.device || 'other').replace(/[^a-z0-9]/gi, '').slice(0, 12), xr: Boolean(b.xr),
    });
    return send(res, 200, { ok: true });
  }

  const room = roomCode((req.query || {}).room);
  const rows = await recent(room, { limit: 500 });
  const of = (kind) => rows.filter((r) => r.kind === kind);
  const ms = (kind) => of(kind).map((r) => Number(r.value.ms)).filter(Number.isFinite);

  const first = ms('wish_first_ms');
  const gen = of('wish_model_ms');
  const genMs = gen.map((r) => Number(r.value.ms)).filter(Number.isFinite);
  const routes = {};
  for (const r of gen) routes[r.value.route || '?'] = (routes[r.value.route || '?'] || 0) + 1;

  const cacheRows = of('wish_cache');
  const hits = cacheRows.filter((r) => r.value.hit).length;

  const safetyRows = of('safety');
  const byChecker = {};
  for (const r of safetyRows) {
    const by = r.value.by || '?';
    byChecker[by] = byChecker[by] || { safe: 0, unsafe: 0 };
    byChecker[by][r.value.verdict === 'unsafe' ? 'unsafe' : 'safe']++;
  }

  const tris = of('model_triangles').slice(0, 12).map((r) => ({ before: r.value.before, after: r.value.after, what: r.value.what, at: r.created_at }));
  const fps = of('headset_fps').slice(0, 60).map((r) => ({ ...r.value, at: r.created_at }));

  send(res, 200, {
    room,
    firstModel: { last: first[0] ?? null, median: median(first), count: first.length },
    generatedModel: { last: genMs[0] ?? null, median: median(genMs), count: genMs.length, routes },
    cache: { hits, misses: cacheRows.length - hits, rate: cacheRows.length ? hits / cacheRows.length : null },
    safety: {
      checks: safetyRows.length,
      unsafe: safetyRows.filter((r) => r.value.verdict === 'unsafe').length,
      byChecker,
      recent: safetyRows.slice(0, 10).map((r) => ({ by: r.value.by, verdict: r.value.verdict, what: r.value.what, categories: r.value.categories || '', ms: r.value.ms ?? null, at: r.created_at })),
    },
    triangles: { recent: tris, medianAfter: median(tris.map((t) => Number(t.after)).filter(Number.isFinite)) },
    fps: { last: fps[0] || null, recent: fps },
    routeFailures: of('wish_route_failed').slice(0, 6).map((r) => ({ route: r.value.route, at: r.created_at })),
    updatedAt: new Date().toISOString(),
  });
});
