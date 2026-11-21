// Two routes share this function, because the Vercel Hobby plan allows 12 functions per deployment:
//
//   POST /api/events { room, type, detail } -> { ok: true, id }      activity from the headset
//   GET  /api/inbox?room=                   -> { room, child_name, events, gifts }   the parent check-in
//
// vercel.json rewrites /api/inbox to this file; the method decides which one runs.
import { route, send, body, roomCode, UserError } from './_lib/http.js';
import { sql, ensureRoom, logEvent, giftJson } from './_lib/db.js';
import { resolveProfile, listProfiles, profileJson } from './_lib/profiles.js';

// The contract's types are world_visited, creature_learned, breath_session, explore_visited and gift_opened.
// Any other lower_snake_case type is stored too, so a new tab can log something new without a change
// here; the Inbox decides what it knows how to show.
const MAX_DETAIL = 2000;

const log = route('POST', async (req, res) => {
  const b = body(req);
  const room = roomCode(b.room);
  const type = typeof b.type === 'string' ? b.type.trim() : '';
  if (!/^[a-z][a-z0-9_]{2,39}$/.test(type)) throw new UserError('That event type does not look right.');

  let detail = b.detail;
  if (detail === undefined || detail === null) detail = {};
  if (typeof detail !== 'object' || Array.isArray(detail)) throw new UserError('"detail" must be an object.');
  if (JSON.stringify(detail).length > MAX_DETAIL) throw new UserError('"detail" is too large.');

  await ensureRoom(room);
  const profile = b.profile_id !== undefined ? await resolveProfile(room, b.profile_id) : null;
  const id = await logEvent(room, type, detail, profile ? profile.id : null);
  send(res, 200, { ok: true, id });
});

// The 50 newest events and the 50 newest gifts (any status), newest first.
const inbox = route('GET', async (req, res) => {
  const room = roomCode((req.query || {}).room);
  const profiles = await listProfiles(room);
  const [rooms, events, gifts] = await Promise.all([
    sql`select child_name from rooms where code = ${room}`,
    sql`select id, room_code, created_at, type, detail, profile_id from events where room_code = ${room} order by id desc limit 50`,
    sql`select * from gifts where room_code = ${room} order by id desc limit 50`,
  ]);
  const defaultId = Number(profiles[0].id);
  send(res, 200, {
    room,
    child_name: rooms.length ? rooms[0].child_name : null,
    events: events.map((e) => ({
      id: Number(e.id),
      room_code: e.room_code,
      created_at: e.created_at,
      type: e.type,
      detail: e.detail || {},
      profile_id: e.profile_id === null ? defaultId : Number(e.profile_id),
    })),
    gifts: gifts.map((g) => ({ ...giftJson(g), profile_id: g.profile_id === null ? defaultId : Number(g.profile_id) })),
    profiles: profiles.map((p) => profileJson(p, defaultId)),
  });
});

export default function handler(req, res) {
  return (req.method === 'GET' ? inbox : log)(req, res);
}
