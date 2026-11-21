// GET /api/gifts?room=&after= -> { gifts, latest, pending }
// Ready gifts for a room with id above `after`, oldest first (at most 50 per call). Polled every 2 to 3
// seconds by the headset, the Unity game and the phone's AR tab, so it only reads.
//
//   latest   the highest ready gift id in the room (0 if none)
//   pending  ids of gifts still being built (scanned toys from the last 15 minutes), lowest first.
//            A pending gift becomes ready later with an id BELOW gifts already delivered, so a poller
//            that only ever moves `after` forward would miss it. While this list is not empty, ask from
//            just below its first id and skip ids already shown. pollGifts in /shared/api.js does this.
import { route, send, roomCode, UserError } from './_lib/http.js';
import { sql, giftJson } from './_lib/db.js';

const LIMIT = 50;

export default route('GET', async (req, res) => {
  const q = req.query || {};
  const room = roomCode(q.room);
  const raw = q.after === undefined || q.after === '' ? '0' : String(q.after);
  if (!/^\d{1,15}$/.test(raw)) throw new UserError('"after" must be a gift id.');
  const after = Number(raw);

  const [rows, top, building] = await Promise.all([
    sql`select * from gifts
        where room_code = ${room} and status = 'ready' and id > ${after}
        order by id asc limit ${LIMIT}`,
    sql`select coalesce(max(id), 0) as latest from gifts where room_code = ${room} and status = 'ready'`,
    sql`select id from gifts
        where room_code = ${room} and status = 'pending' and created_at > now() - interval '15 minutes'
        order by id asc limit 20`,
  ]);

  send(res, 200, {
    gifts: rows.map(giftJson),
    latest: Number(top[0].latest),
    pending: building.map((r) => Number(r.id)),
  });
});
