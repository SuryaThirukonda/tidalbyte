// POST /api/guide { room, question, topic? } -> { reply, audio_url }
// The guide's short spoken-style answer to something the child asked (Claude Haiku, one call). `topic`
// says what the child is looking at ("the reef", "a sea turtle", "the Statue of Liberty"), the way the
// Unity game tells its guide what is on screen. If Claude cannot be reached the guide still answers with
// a fixed, gentle line. `audio_url` is always null here (one slow call per function): pass `reply` to
// /api/tts to hear it in the guide's voice.
import { route, send, body, text, roomCode, UserError } from './_lib/http.js';
import { guideAnswer } from './_lib/haiku.js';

export default route('POST', async (req, res) => {
  const b = body(req);
  if (b.room !== undefined && b.room !== null && b.room !== '') roomCode(b.room); // checked, not needed for the answer
  const question = text(b.question, 300);
  if (!question) throw new UserError('Ask a question first.');
  const topic = text(b.topic, 200);

  const reply = await guideAnswer(question, topic); // never throws
  send(res, 200, { reply, audio_url: null });
});
