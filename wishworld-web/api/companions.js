// Saved companions ("buddies"): the toys that follow the child around the headset view, kept per room and per
// child profile, so they are there in every tab and world, and again the next time the room is opened.
// Every call takes an optional profile_id (or ?profile=); without it, the room's default profile. Rows from before
// profiles existed (profile_id null) belong to the default profile.
//
//   GET  /api/companions?room=&profile=&all=1         -> also { gifts: [...] }: this profile's ready gifts that
//                                                         could be buddies (creatures and scanned toys) but are not
//
//   GET  /api/companions?room=                     -> { companions: [companion] }   oldest first
//   POST /api/companions { room, gift_id }         -> { companion }   save a scanned toy (a "mesh" gift, or the
//                                                                      library creature a failed scan became)
//   POST /api/companions { room, toy: "bubby" }    -> { companion }   save the prepared toy
//   POST /api/companions { room, id, remove: true }-> { removed }     let one go (hidden, so a gift does not come
//                                                                      back as a candidate; saving it again restores it)
//   POST /api/companions { room, id, name }        -> { companion }   rename one
//   POST /api/companions { room, gift_id, forget: true } -> { removed }  delete a scan (the gift and any buddy made
//                                                                      from it are hidden; nothing is erased)
//
// companion: { id, name, toy, gift_id, kind ("mesh" | "creature" | "toy"), model_url, option_id, created_at }
// Saving the same toy twice returns the saved one. The table is created on first use.
import { route, send, body, text, roomCode, UserError } from './_lib/http.js';
import { sql, ensureRoom } from './_lib/db.js';
import { resolveProfile } from './_lib/profiles.js';

const TOYS = { bubby: 'Bubby' };
const MAX_PER_ROOM = 60;

let ready = null;
function ensureTable() {
  if (!ready) {
    ready = sql`
      create table if not exists companions (
        id bigserial primary key,
        room_code text not null,
        gift_id bigint,
        toy text,
        name text not null,
        created_at timestamptz not null default now(),
        unique (room_code, gift_id),
        unique (room_code, toy)
      )`
      .then(() => sql`alter table companions add column if not exists hidden boolean not null default false`)
      .catch((err) => { ready = null; throw err; });
  }
  return ready;
}

function json(row) {
  return {
    id: Number(row.id),
    name: row.name,
    toy: row.toy ? String(row.toy).split('@')[0] : null,
    profile_id: row.profile_id === null || row.profile_id === undefined ? null : Number(row.profile_id),
    gift_id: row.gift_id === null || row.gift_id === undefined ? null : Number(row.gift_id),
    kind: row.toy ? 'toy' : row.kind,
    model_url: row.model_url || null,
    option_id: row.option_id || null,
    created_at: row.created_at,
  };
}

/** A profile's companions, oldest first. */
async function list(room, profile) {
  const rows = await sql`
    select c.*, g.kind, g.model_url, g.option_id
    from companions c left join gifts g on g.id = c.gift_id
    where c.room_code = ${room} and (c.profile_id = ${profile.id} or (${profile.isDefault} and c.profile_id is null))
      and not c.hidden
    order by c.created_at asc, c.id asc`;
  return rows.map(json);
}

/** The room's unique key for a prepared toy: the toy's id for the default profile, "<toy>@<profile id>" otherwise
 *  (the table's (room_code, toy) key stays as it is; each profile can still have its own Bubby). */
const toyKey = (toy, profile) => (profile.isDefault ? toy : `${toy}@${profile.id}`);

/** "Honey, a golden teddy bear" -> "Honey". */
function nameOf(gift) {
  const first = String(gift.wish || '').split(',')[0].trim();
  return text(first, 40) || 'Friend';
}

export default route(['GET', 'POST'], async (req, res) => {
  await ensureTable();
  if (req.method === 'GET') {
    const q = req.query || {};
    const room = roomCode(q.room);
    const profile = await resolveProfile(room, q.profile);
    const companions = await list(room, profile);
    if (q.all !== '1') return send(res, 200, { companions });
    // Gifts already kept as buddies, including ones let go (those stay out of the candidates).
    const taken = (await sql`select gift_id from companions where room_code = ${room} and gift_id is not null`)
      .map((r) => Number(r.gift_id));
    const gifts = await sql`
      select id, kind, wish, option_id, model_url, created_at from gifts
      where room_code = ${room} and status = 'ready'
        and ((kind = 'mesh' and model_url is not null) or (kind = 'creature' and option_id is not null))
        and (profile_id = ${profile.id} or (${profile.isDefault} and profile_id is null))
        and not (id = any(${taken}::bigint[]))
      order by id desc limit 30`;
    return send(res, 200, {
      companions,
      gifts: gifts.map((g) => ({ id: Number(g.id), kind: g.kind, name: nameOf(g), option_id: g.option_id, model_url: g.model_url })),
    });
  }

  const b = body(req);
  const room = roomCode(b.room);
  const profile = await resolveProfile(room, b.profile_id);

  if (b.forget) {
    const giftId = Number(b.gift_id);
    if (!Number.isSafeInteger(giftId) || giftId <= 0) throw new UserError('"gift_id" must be a gift id.');
    const gone = await sql`update gifts set status = 'removed' where id = ${giftId} and room_code = ${room}
      and kind in ('mesh', 'creature') and (profile_id = ${profile.id} or (${profile.isDefault} and profile_id is null)) returning id`;
    await sql`update companions set hidden = true where gift_id = ${giftId} and room_code = ${room}`;
    return send(res, 200, { removed: gone.length > 0 });
  }

  if (b.remove || b.name !== undefined) {
    const id = Number(b.id);
    if (!Number.isSafeInteger(id) || id <= 0) throw new UserError('That companion id does not look right.');
    if (b.remove) {
      const gone = await sql`update companions set hidden = true where id = ${id} and room_code = ${room}
        and (profile_id = ${profile.id} or (${profile.isDefault} and profile_id is null)) returning id`;
      return send(res, 200, { removed: gone.length > 0 });
    }
    const name = text(b.name, 24);
    if (!name) throw new UserError('A buddy needs a name.');
    const done = await sql`update companions set name = ${name} where id = ${id} and room_code = ${room}
      and (profile_id = ${profile.id} or (${profile.isDefault} and profile_id is null)) and not hidden returning id`;
    if (!done.length) throw new UserError('That buddy is not here.', 404);
    const rows = await list(room, profile);
    return send(res, 200, { companion: rows.find((c) => c.id === id) || null });
  }

  const count = await sql`select count(*)::int as n from companions where room_code = ${room} and not hidden`;
  if (count[0].n >= MAX_PER_ROOM) throw new UserError(`A room can keep ${MAX_PER_ROOM} companions. Let one go first.`, 409);

  if (b.toy !== undefined) {
    const toy = String(b.toy || '').toLowerCase();
    if (!TOYS[toy]) throw new UserError('That toy is not known.');
    await ensureRoom(room);
    await sql`insert into companions (room_code, toy, name, profile_id) values (${room}, ${toyKey(toy, profile)}, ${TOYS[toy]}, ${profile.id})
              on conflict (room_code, toy) do update set hidden = false`;
  } else {
    const giftId = Number(b.gift_id);
    if (!Number.isSafeInteger(giftId) || giftId <= 0) throw new UserError('"gift_id" must be a gift id.');
    const gifts = await sql`select * from gifts where id = ${giftId} and room_code = ${room}`;
    const gift = gifts[0];
    if (!gift) throw new UserError('That gift is not in this room.', 404);
    const usable = gift.status === 'ready' && ((gift.kind === 'mesh' && gift.model_url) || (gift.kind === 'creature' && gift.option_id));
    if (!usable) throw new UserError('That gift is not a companion yet.', 409);
    await sql`insert into companions (room_code, gift_id, name, profile_id) values (${room}, ${giftId}, ${nameOf(gift)}, ${profile.id})
              on conflict (room_code, gift_id) do update set hidden = false`;
  }
  const rows = await list(room, profile);
  const saved = b.toy !== undefined
    ? rows.find((c) => c.toy === String(b.toy).toLowerCase())
    : rows.find((c) => c.gift_id === Number(b.gift_id));
  send(res, 200, { companion: saved || null });
});
