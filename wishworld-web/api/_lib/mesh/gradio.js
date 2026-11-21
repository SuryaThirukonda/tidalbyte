// A very small client for Hugging Face Spaces that run Gradio 4, 5 or 6 (the "sse_v3" queue protocol).
// It does only what the scan routes need: read the Space's config, upload a file, run one function and
// wait for its result, download a result file. Everything takes a deadline so a stuck Space cannot hold
// a scan past its two-minute budget.
//
//   const space = await openSpace('https://owner-name.hf.space', { deadline });
//   const file  = await space.upload(bytes, 'photo.jpg', 'image/jpeg');
//   const out   = await space.call('generate', [file, 256]);   // -> array of outputs
//   const glb   = await space.download(out[0]);
import { randomBytes } from 'node:crypto';

/** An error from a Space. `quota` is true when Hugging Face refused the job for lack of free GPU time. */
export class SpaceError extends Error {
  constructor(message, { quota = false, timeout = false } = {}) {
    super(message);
    this.name = 'SpaceError';
    this.quota = quota;
    this.timeout = timeout;
  }
}

function authHeaders() {
  return process.env.HF_TOKEN ? { Authorization: `Bearer ${process.env.HF_TOKEN}` } : {};
}

/** Milliseconds left before `deadline` (a Date.now() value), never less than 1. */
function left(deadline) {
  return Math.max(1, deadline - Date.now());
}

async function fetchWithDeadline(url, init, deadline, what) {
  if (Date.now() >= deadline) throw new SpaceError(`${what}: out of time`, { timeout: true });
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(left(deadline)) });
  } catch (err) {
    const timeout = err && (err.name === 'TimeoutError' || err.name === 'AbortError');
    throw new SpaceError(`${what}: ${timeout ? 'timed out' : err.message}`, { timeout });
  }
}

/**
 * Connects to a Space. `root` is its direct address (https://owner-name.hf.space).
 * `deadline` is a Date.now() value after which every call gives up.
 */
export async function openSpace(root, { deadline }) {
  const base = root.replace(/\/+$/, '');
  const res = await fetchWithDeadline(`${base}/config`, { headers: authHeaders() }, Math.min(deadline, Date.now() + 15000), 'config');
  if (!res.ok) throw new SpaceError(`config: HTTP ${res.status}`);
  let config;
  try {
    config = await res.json();
  } catch {
    throw new SpaceError('config: the Space is not answering (asleep, building or broken)');
  }
  if (!config || !Array.isArray(config.dependencies)) throw new SpaceError('config: not a Gradio app');
  const prefix = base + (config.api_prefix || '');
  const session = randomBytes(8).toString('hex');

  function dependency(apiName) {
    const index = config.dependencies.findIndex((d) => d.api_name === apiName);
    if (index < 0) throw new SpaceError(`the Space has no function called ${apiName} (its app has changed)`);
    const dep = config.dependencies[index];
    return { fnIndex: dep.id ?? index, inputs: dep.inputs.length };
  }

  /** Uploads bytes and returns the value Gradio expects for a file or image input. */
  async function upload(bytes, filename, mime) {
    const form = new FormData();
    form.append('files', new Blob([bytes], { type: mime }), filename);
    const r = await fetchWithDeadline(`${prefix}/upload`, { method: 'POST', body: form, headers: authHeaders() }, deadline, 'upload');
    if (!r.ok) throw new SpaceError(`upload: HTTP ${r.status}`);
    const paths = await r.json();
    if (!Array.isArray(paths) || !paths[0]) throw new SpaceError('upload: no path returned');
    return { path: paths[0], orig_name: filename, mime_type: mime, meta: { _type: 'gradio.FileData' } };
  }

  /**
   * Runs one function (by its api name) and resolves with its outputs.
   * `onStatus(text)` is told about queue position and progress.
   */
  async function call(apiName, data, { onStatus, callDeadline } = {}) {
    const until = Math.min(deadline, callDeadline || deadline);
    const dep = dependency(apiName);
    if (data.length !== dep.inputs) {
      throw new SpaceError(`${apiName} now takes ${dep.inputs} inputs, not ${data.length} (the Space's app has changed)`);
    }
    const join = await fetchWithDeadline(
      `${prefix}/queue/join`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ data, event_data: null, fn_index: dep.fnIndex, trigger_id: null, session_hash: session }),
      },
      until,
      `${apiName} join`,
    );
    if (!join.ok) {
      const detail = (await join.text().catch(() => '')).slice(0, 200);
      throw new SpaceError(`${apiName} join: HTTP ${join.status} ${detail}`, { quota: /quota/i.test(detail) });
    }
    const { event_id: eventId } = await join.json();

    const stream = await fetchWithDeadline(
      `${prefix}/queue/data?session_hash=${session}`,
      { headers: { Accept: 'text/event-stream', ...authHeaders() } },
      until,
      `${apiName} stream`,
    );
    if (!stream.ok || !stream.body) throw new SpaceError(`${apiName} stream: HTTP ${stream.status}`);

    const reader = stream.body.getReader();
    const decoder = new TextDecoder();
    let buffered = '';
    try {
      for (;;) {
        let chunk;
        try {
          chunk = await reader.read();
        } catch (err) {
          const timeout = err && (err.name === 'TimeoutError' || err.name === 'AbortError');
          throw new SpaceError(`${apiName}: ${timeout ? 'timed out' : err.message}`, { timeout });
        }
        if (chunk.done) throw new SpaceError(`${apiName}: the Space closed the connection early`);
        buffered += decoder.decode(chunk.value, { stream: true });
        let cut;
        while ((cut = buffered.indexOf('\n\n')) >= 0) {
          const block = buffered.slice(0, cut);
          buffered = buffered.slice(cut + 2);
          const line = block.split('\n').find((l) => l.startsWith('data:'));
          if (!line) continue;
          let msg;
          try {
            msg = JSON.parse(line.slice(5));
          } catch {
            continue;
          }
          if (msg.event_id && msg.event_id !== eventId) continue;
          if (msg.msg === 'estimation' && onStatus) {
            onStatus(`queued ${msg.rank ?? '?'}/${msg.queue_size ?? '?'}`);
          } else if (msg.msg === 'process_starts' && onStatus) {
            onStatus('running');
          } else if (msg.msg === 'process_completed') {
            if (msg.success === false || !msg.output || msg.output.error !== undefined) {
              const raw = msg.output && msg.output.error;
              const text = String(typeof raw === 'string' && raw ? raw : msg.title || 'the Space reported an error').slice(0, 300);
              throw new SpaceError(`${apiName}: ${text}`, { quota: /quota/i.test(text) });
            }
            return msg.output.data || [];
          } else if (msg.msg === 'unexpected_error' || msg.msg === 'server_stopped') {
            const text = String(msg.message || msg.msg).slice(0, 300);
            throw new SpaceError(`${apiName}: ${text}`, { quota: /quota/i.test(text) });
          } else if (msg.msg === 'close_stream') {
            throw new SpaceError(`${apiName}: the Space closed the stream without a result`);
          }
        }
      }
    } finally {
      reader.cancel().catch(() => {});
    }
  }

  /** Downloads a file that a function returned. Accepts a Gradio file value or anything that wraps one. */
  async function download(value, { maxBytes = 60 * 1024 * 1024 } = {}) {
    const file = findFile(value);
    if (!file) throw new SpaceError('download: the Space returned no file');
    const url = file.url || `${prefix}/file=${file.path}`;
    const r = await fetchWithDeadline(url, { headers: authHeaders() }, deadline, 'download');
    if (!r.ok) throw new SpaceError(`download: HTTP ${r.status}`);
    const declared = Number(r.headers.get('content-length') || 0);
    if (declared > maxBytes) throw new SpaceError('download: the model file is too large');
    let bytes;
    try {
      bytes = Buffer.from(await r.arrayBuffer());
    } catch (err) {
      const timeout = err && (err.name === 'TimeoutError' || err.name === 'AbortError');
      throw new SpaceError(`download: ${timeout ? 'timed out' : err.message}`, { timeout });
    }
    if (bytes.length > maxBytes) throw new SpaceError('download: the model file is too large');
    return bytes;
  }

  return { config, session, upload, call, download };
}

/** Finds the first Gradio file value ({ path, url }) inside an output, however it is wrapped. */
export function findFile(value, wanted = null) {
  if (!value || typeof value !== 'object') return null;
  if (typeof value.path === 'string' && (!wanted || wanted.test(value.path) || wanted.test(value.url || ''))) return value;
  for (const v of Array.isArray(value) ? value : Object.values(value)) {
    const found = findFile(v, wanted);
    if (found) return found;
  }
  return null;
}
