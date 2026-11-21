// The game's voice. Two routes share this function, because the Vercel Hobby plan allows 12 functions
// per deployment; vercel.json rewrites them here with ?do=tts or ?do=stt:
//
//   POST /api/tts { text }                      -> { url, cached }   an MP3 in the game's ElevenLabs voice
//   POST /api/stt { audio (base64), audioType } -> { text }          ElevenLabs speech-to-text
//
// Text to speech. Each line is generated once: the MP3 is stored in Blob under a hash of (voice, model,
// format, words), the way the Unity game keeps its voice bank, so asking again for the same line is a
// lookup and costs no ElevenLabs characters. The text must already be child-safe: it comes from our own
// routes or from fixed lines in the pages. Capped at 400 characters.
//
// Speech to text. The headset records the child's spoken wish with MediaRecorder (webm/opus, or mp4 on
// Safari), at most 2 MB. `text` is '' when nothing was heard. The words reach nobody until they have
// been through /api/wish or /api/guide, which do the child-safety check.
import { route, send, body, text, base64Bytes, UserError } from './_lib/http.js';
import { speak, transcribe, voiceId, ttsModel, TTS_FORMAT } from './_lib/eleven.js';
import { save, find, sha256, audioType } from './_lib/store.js';

const MAX_TEXT = 400;
const MAX_AUDIO = 2 * 1024 * 1024;

/** Same idea as the Unity VoiceBank key: case and spacing do not make a new recording. */
function lineKey(line) {
  return line.toLowerCase().split(/\s+/).filter(Boolean).join(' ');
}

/** Cap at 400 characters without stopping in the middle of a word. */
function cap(value) {
  const all = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  if (all.length <= MAX_TEXT) return all;
  const cut = all.slice(0, MAX_TEXT);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  if (stop > MAX_TEXT / 2) return cut.slice(0, stop + 1);
  const space = cut.lastIndexOf(' ');
  return space > MAX_TEXT / 2 ? cut.slice(0, space) : cut;
}

const tts = route('POST', async (req, res) => {
  const line = cap(text(body(req).text, 4000));
  if (!line || !/[\p{L}\p{N}]/u.test(line)) throw new UserError('There is nothing to say.');

  const voice = voiceId();
  const model = ttsModel();
  const path = `tts/${voice}/${model}/${sha256(voice, model, TTS_FORMAT, lineKey(line)).slice(0, 40)}.mp3`;

  const cached = await find(path);
  if (cached) return send(res, 200, { url: cached, cached: true });

  const mp3 = await speak(line); // the one slow call
  const url = await save(path, mp3, 'audio/mpeg');
  send(res, 200, { url, cached: false });
});

const stt = route('POST', async (req, res) => {
  const b = body(req);
  const bytes = base64Bytes(b.audio, MAX_AUDIO);
  if (!bytes) throw new UserError('No recording was sent.');
  if (bytes.length < 1000) throw new UserError('That was too short to hear.');
  const { type, ext } = audioType(b.audioType);

  const heard = await transcribe(bytes, type, `speech.${ext}`); // the one slow call
  send(res, 200, { text: heard.slice(0, 500) });
});

export default function handler(req, res) {
  return ((req.query || {}).do === 'stt' ? stt : tts)(req, res);
}
