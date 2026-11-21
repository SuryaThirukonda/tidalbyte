// POST /api/letter { room, sender, text, audio?, audioType? } -> { gift }   (audio = base64, up to 2 MB)
// A short note for the child's mailbox, with an optional voice recording. The note goes through Claude
// Haiku once: fine notes pass unchanged, a note with something unsuitable in it is softened, and a note
// with nothing suitable in it is replaced by a friendly default. The recording is stored in Blob as it is
// (it is the sender's own voice and is not transcribed or checked here).
import { route, send, body, text, roomCode, base64Bytes, UserError } from './_lib/http.js';
import { ensureRoom, insertGift, giftJson } from './_lib/db.js';
import { checkLetter } from './_lib/haiku.js';
import { save, audioType, randomName } from './_lib/store.js';

const MAX_AUDIO = 2 * 1024 * 1024;

export default route('POST', async (req, res) => {
  const b = body(req);
  const room = roomCode(b.room);
  const note = text(b.text, 600);
  const sender = text(b.sender, 40);
  const audio = base64Bytes(b.audio, MAX_AUDIO);
  if (!note && !audio) throw new UserError('Write a note or record a message first.');
  const kind = audio ? audioType(b.audioType) : null;

  // Haiku is the one slow call (it never throws). The upload and the room check run beside it.
  const [checked, audioUrl] = await Promise.all([
    checkLetter(note, sender, { hasAudio: Boolean(audio) }),
    audio ? save(`letters/${room}/${randomName()}.${kind.ext}`, audio, kind.type) : null,
    ensureRoom(room),
  ]);

  const row = await insertGift({
    room_code: room,
    sender: checked.sender,
    kind: 'letter',
    message: checked.text,
    audio_url: audioUrl,
    status: 'ready',
  });
  send(res, 200, { gift: giftJson(row) });
});
