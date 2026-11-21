// POST /api/wish { room, sender, text } -> { gift }
// Someone types a wish on their phone. Claude Haiku picks the library creature that comes closest, checks
// that the words are fit for a young child and writes the line shown and spoken when the creature
// arrives: all in ONE call. If Claude cannot be reached, a keyword match and a fixed line are used
// instead, so a wish always becomes a gift. The headset fetches the spoken version itself from /api/tts.
import { route, send, body, text, roomCode, UserError } from './_lib/http.js';
import { ensureRoom, insertGift, giftJson } from './_lib/db.js';
import { resolveProfile } from './_lib/profiles.js';
import { pickCreature } from './_lib/haiku.js';

export default route('POST', async (req, res) => {
  const b = body(req);
  const room = roomCode(b.room);
  const wish = text(b.text, 200);
  if (!wish) throw new UserError('Type a wish first.');
  const sender = text(b.sender, 40);

  // The one slow call (it never throws), alongside making sure the room exists.
  const [picked] = await Promise.all([pickCreature(wish, sender), ensureRoom(room)]);

  const profile = await resolveProfile(room, b.profile_id);   // who the gift is for (the default if not said)
  const row = await insertGift({
    profile_id: profile.id,
    room_code: room,
    sender: picked.sender,
    kind: 'creature',
    wish: picked.wish, // the typed words if they were fine; otherwise only the name of what is coming
    option_id: picked.option_id,
    message: picked.message,
    status: 'ready',
  });
  send(res, 200, { gift: giftJson(row) });
});
