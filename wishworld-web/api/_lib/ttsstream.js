// POST /api/tts-stream { text } -> the line's MP3, streamed as it is made (or { url } when it is already kept).
//
// The guide starts speaking almost at once: instead of waiting for the whole MP3 (/api/tts), the headset
// plays the first chunks while ElevenLabs is still making the rest. The finished file is kept under the same
// key /api/tts uses, so the next time this line is a plain cached file. Same rules as /api/tts: the text must
// already be child-safe (it comes from our own routes), at most 400 characters.
import { save, find } from './store.js';
import { speakStream } from './eleven.js';
import { cap, ttsPath } from '../voice.js';
import { waitUntil } from './runtime.js';

const json = (status, data) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export async function ttsStream(request) {
  if (request.method !== 'POST') return json(405, { error: 'Use POST.' });
  let line = '';
  try { line = cap(String((await request.json()).text || '').slice(0, 4000)); } catch { /* not JSON */ }
  if (!line || !/[\p{L}\p{N}]/u.test(line)) return json(400, { error: 'There is nothing to say.' });
  const path = ttsPath(line);
  const cached = await find(path);
  if (cached) return json(200, { url: cached, cached: true });

  let upstream;
  try {
    upstream = await speakStream(line);
  } catch (err) {
    return json(err && err.status ? err.status : 502, { error: (err && err.message) || 'The voice service could not do that.' });
  }
  // One copy goes to the headset as it arrives; the other is collected and kept for next time.
  const [toClient, toStore] = upstream.body.tee();
  waitUntil((async () => {
    const chunks = [];
    const reader = toStore.getReader();
    for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); }
    await save(path, Buffer.concat(chunks.map((c) => Buffer.from(c))), 'audio/mpeg');
  })().catch((err) => console.warn('[tts-stream] could not keep the line:', err && err.message)));
  return new Response(toClient, { status: 200, headers: { 'content-type': 'audio/mpeg', 'cache-control': 'no-store' } });
}
