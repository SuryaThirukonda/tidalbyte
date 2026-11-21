// ElevenLabs: the guide's voice (text to speech) and the child's spoken wish (speech to text).
//
// This mirrors what the Unity game does (Assets/WishWorld/Scripts/Services/RealServices.cs and
// WishWorldServiceConfig.cs), checked against the ElevenLabs API reference:
//   - text to speech:  POST /v1/text-to-speech/{voice_id}?output_format=...   body { text, model_id }
//     Unity speaks live lines with `eleven_flash_v2_5` and recorded its preset lines as mp3_44100_128.
//   - speech to text:  POST /v1/speech-to-text   multipart: model_id=scribe_v2, file
//   - voice: ELEVENLABS_VOICE_ID, else the stock voice "Jessica" that Unity falls back to.
// The Unity game does not use ElevenLabs conversational agents (the agent ids in its .env belong to a
// different app), so there is no agent route here.
import { UserError } from './http.js';

const API = 'https://api.elevenlabs.io';

/** ElevenLabs stock voice "Jessica" (playful, bright, warm): the Unity game's EnvSync.DefaultVoiceId. */
export const DEFAULT_VOICE_ID = 'cgSgspJ2msm6clMCkdW9';
export const TTS_FORMAT = 'mp3_44100_128';
export const STT_MODEL = 'scribe_v2';

export function voiceId() {
  const v = (process.env.ELEVENLABS_VOICE_ID || '').trim();
  return /^[A-Za-z0-9]{10,40}$/.test(v) ? v : DEFAULT_VOICE_ID;
}

export function ttsModel() {
  const m = (process.env.ELEVENLABS_TTS_MODEL || '').trim();
  return /^[a-z0-9_]{3,40}$/.test(m) ? m : 'eleven_flash_v2_5';
}

function key() {
  const k = process.env.ELEVENLABS_API_KEY;
  if (!k) throw new UserError('The voice service is not set up yet.', 503);
  return k;
}

async function problem(res, what) {
  let detail = '';
  try {
    detail = (await res.text()).slice(0, 300);
  } catch {
    /* ignore */
  }
  console.error('[elevenlabs]', what, res.status, detail);
  if (res.status === 401 || res.status === 403) return new UserError('The voice service is not available right now.', 503);
  if (res.status === 429) return new UserError('The voice service is busy. Please try again in a moment.', 503);
  return new UserError('The voice service could not do that. Please try again.', 502);
}

/** Speaks `text` in the game's voice. Returns MP3 bytes. */
export async function speak(text) {
  const url = `${API}/v1/text-to-speech/${voiceId()}?output_format=${TTS_FORMAT}`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'xi-api-key': key(), 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: ttsModel() }),
      signal: AbortSignal.timeout(25000),
    });
  } catch (err) {
    if (err instanceof UserError) throw err;
    console.error('[elevenlabs] text to speech', err && err.name);
    throw new UserError('The voice service did not answer. Please try again.', 504);
  }
  if (!res.ok) throw await problem(res, 'text to speech');
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length < 200) throw new UserError('The voice service sent back nothing. Please try again.', 502);
  return bytes;
}

/** Turns recorded speech into text. Returns '' when nothing was heard. */
export async function transcribe(bytes, mimeType, fileName) {
  const form = new FormData();
  form.append('model_id', STT_MODEL);
  form.append('tag_audio_events', 'false'); // no "(laughter)" in a wish
  form.append('file', new Blob([bytes], { type: mimeType }), fileName);
  let res;
  try {
    res = await fetch(`${API}/v1/speech-to-text`, {
      method: 'POST',
      headers: { 'xi-api-key': key() },
      body: form,
      signal: AbortSignal.timeout(30000),
    });
  } catch (err) {
    if (err instanceof UserError) throw err;
    console.error('[elevenlabs] speech to text', err && err.name);
    throw new UserError('I could not reach the speech service. Please try again.', 504);
  }
  if (!res.ok) throw await problem(res, 'speech to text');
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* fall through */
  }
  return data && typeof data.text === 'string' ? data.text.trim() : '';
}
