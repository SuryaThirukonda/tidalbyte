// POST /api/letter { room, sender, text, audio?, audioType? } -> { gift }   (audio = base64, up to 2 MB)
// A short note for the child's mailbox, with an optional voice recording. The note goes through Claude
// Haiku once: fine notes pass unchanged, a note with something unsuitable in it is softened, and a note
// with nothing suitable in it is replaced by a friendly default. The recording is stored in Blob as it is
// (it is the sender's own voice and is not transcribed or checked here).
import { route, send, body, text, roomCode, base64Bytes, UserError } from './_lib/http.js';
import { ensureRoom, insertGift, giftJson } from './_lib/db.js';
import { resolveProfile } from './_lib/profiles.js';
import { checkLetter } from './_lib/haiku.js';
import { checkSafety } from './_lib/nemotron.js';
import { record } from './_lib/metrics.js';
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
  const [checked, audioUrl, nemo] = await Promise.all([
    checkLetter(note, sender, { hasAudio: Boolean(audio) }),
    audio ? save(`letters/${room}/${randomName()}.${kind.ext}`, audio, kind.type) : null,
    ensureRoom(room),
    checkSafety(note, 'family letter'),
  ]);
  // Nemotron's check (the team's GPU) must agree too: a note it flags is replaced by a gentle line.
  if (nemo && nemo.verdict === 'unsafe') checked.text = `${checked.sender} sent you a letter full of love. A grown-up can read it with you.`;
  await record(room, 'safety', { by: 'claude', verdict: checked.ok ? 'safe' : 'unsafe', what: 'letter' });
  if (nemo) await record(room, 'safety', { by: 'nemotron', verdict: nemo.verdict, categories: nemo.categories, ms: nemo.ms, what: 'letter' });

  const profile = await resolveProfile(room, b.profile_id);   // who the gift is for (the default if not said)
  const row = await insertGift({
    profile_id: profile.id,
    room_code: room,
    sender: checked.sender,
    kind: 'letter',
    message: checked.text,
    audio_url: audioUrl,
    status: 'ready',
  });
  send(res, 200, { gift: giftJson(row) });
});
