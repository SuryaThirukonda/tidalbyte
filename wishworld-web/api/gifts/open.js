// POST /api/gifts/open { room, id } -> { gift }
// Marks a gift as opened by the child and logs a `gift_opened` event, so the parent sees it in Inbox.
// Opening the same gift again keeps the first time and does not log a second event.
import { route, send, body, roomCode, UserError } from '../_lib/http.js';
import { sql, giftJson, logEvent } from '../_lib/db.js';

export default route('POST', async (req, res) => {
  const b = body(req);
  const room = roomCode(b.room);
  const id = Number(b.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new UserError('That gift id does not look right.');

  // Only the first open sets the time; `first_open` says whether this call was it.
  const rows = await sql`
    with before as (select opened_at from gifts where id = ${id} and room_code = ${room})
    update gifts set opened_at = coalesce(gifts.opened_at, now())
    where id = ${id} and room_code = ${room}
    returning gifts.*, (select opened_at is null from before) as first_open`;
  if (!rows.length) throw new UserError('That gift is not in this room.', 404);

  const gift = giftJson(rows[0]);
  if (rows[0].first_open) {
    await logEvent(room, 'gift_opened', {
      gift_id: gift.id,
      kind: gift.kind,
      sender: gift.sender,
      option_id: gift.option_id,
    }, gift.profile_id);
  }
  send(res, 200, { gift });
});
