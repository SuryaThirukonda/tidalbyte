// Child profiles in a room (see _lib/profiles.js).
//
//   GET  /api/profiles?room=                              -> { profiles: [profile] }   oldest (the default) first
//   POST /api/profiles { room, name, icon }               -> { profile }   add one (no passwords)
//   POST /api/profiles { room, id, settings }             -> { profile }   merge settings (saved as they change)
//   POST /api/profiles { room, id, name?, icon? }         -> { profile }   rename or change the icon
//
// profile: { id, room_code, name, icon, settings: { volume, guideVoice, micSensitivity, following }, is_default }
// following: companion ids that follow the child (at most 3), or null for "the newest ones".
import { route, send, body, text, roomCode, UserError } from './_lib/http.js';
import { sql, ensureRoom } from './_lib/db.js';
import { listProfiles, profileJson, cleanIcon, cleanSettings, MAX_PROFILES } from './_lib/profiles.js';

export default route(['GET', 'POST'], async (req, res) => {
  if (req.method === 'GET') {
    const room = roomCode((req.query || {}).room);
    const rows = await listProfiles(room);
    return send(res, 200, { profiles: rows.map((r) => profileJson(r, rows[0].id)) });
  }

  const b = body(req);
  const room = roomCode(b.room);
  const rows = await listProfiles(room);
  const defaultId = rows[0].id;

  if (b.id === undefined || b.id === null) {
    const name = text(b.name, 24);
    if (!name) throw new UserError('Type a name for the profile.');
    if (rows.length >= MAX_PROFILES) throw new UserError(`A room can have ${MAX_PROFILES} profiles.`, 409);
    await ensureRoom(room);
    const made = await sql`insert into profiles (room_code, name, icon) values (${room}, ${name}, ${cleanIcon(b.icon)}) returning *`;
    return send(res, 200, { profile: profileJson(made[0], defaultId) });
  }

  const id = Number(b.id);
  const mine = rows.find((r) => Number(r.id) === id);
  if (!mine) throw new UserError('That profile is not in this room.', 404);
  if (b.settings !== undefined) {
    const patch = cleanSettings(b.settings);
    const saved = await sql`
      update profiles set settings = settings || ${JSON.stringify(patch)}::jsonb
      where id = ${id} and room_code = ${room} returning *`;
    return send(res, 200, { profile: profileJson(saved[0], defaultId) });
  }
  const name = b.name !== undefined ? text(b.name, 24) : mine.name;
  if (!name) throw new UserError('Type a name for the profile.');
  const icon = b.icon !== undefined ? cleanIcon(b.icon, mine.icon) : mine.icon;
  const saved = await sql`update profiles set name = ${name}, icon = ${icon} where id = ${id} and room_code = ${room} returning *`;
  send(res, 200, { profile: profileJson(saved[0], defaultId) });
});
