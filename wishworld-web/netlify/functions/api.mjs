// Netlify entry point for every /api route. The handlers in ../../api are written for Vercel's Node
// (req, res) shape; this turns a web Request into that shape, runs the handler with Netlify's context
// (so waitUntil and the invocation deadline work, see api/_lib/runtime.js) and returns a web Response.
// The rewrites vercel.json had (/api/inbox, /api/tts, /api/stt) are the ALIASES below.
// netlify.toml redirects /api/* here (status 200, a rewrite), so the request may arrive as /api/<name> or as
// /.netlify/functions/api/<name>; both are understood. /api/files/<path> serves a stored file (api/files.js).
import { withPlatform } from '../../api/_lib/runtime.js';
import companions from '../../api/companions.js';
import files from '../../api/files.js';
import profiles from '../../api/profiles.js';
import events from '../../api/events.js';
import gifts from '../../api/gifts.js';
import giftsOpen from '../../api/gifts/open.js';
import guide from '../../api/guide.js';
import health from '../../api/health.js';
import letter from '../../api/letter.js';
import rooms from '../../api/rooms.js';
import scanStatus from '../../api/scan-status.js';
import scan from '../../api/scan.js';
import voice from '../../api/voice.js';
import wish from '../../api/wish.js';
import metrics from '../../api/metrics.js';
import { ttsStream } from '../../api/_lib/ttsstream.js';

const HANDLERS = {
  companions,
  events,
  gifts,
  'gifts/open': giftsOpen,
  profiles,
  guide,
  health,
  letter,
  rooms,
  'scan-status': scanStatus,
  scan,
  voice,
  wish,
  metrics,
};

/** Same as vercel.json's rewrites: name -> [handler name, extra query]. */
const ALIASES = {
  inbox: ['events', {}],
  tts: ['voice', { do: 'tts' }],
  stt: ['voice', { do: 'stt' }],
};

/** A synchronous Netlify function is stopped after 60 seconds. */
const LIMIT_MS = 60000;

function notFound() {
  return new Response(JSON.stringify({ error: 'Not found' }), {
    status: 404,
    headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' },
  });
}

/** A Vercel-style request: method, url, lower-case headers, query, and a body parsed like Vercel does. */
async function toNodeRequest(request, url, extraQuery) {
  const headers = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });
  const query = Object.fromEntries(url.searchParams);
  Object.assign(query, extraQuery);
  const raw = request.method === 'GET' || request.method === 'HEAD' ? '' : await request.text();
  const req = { method: request.method, url: url.pathname + url.search, headers, query };
  const type = String(headers['content-type'] || '').toLowerCase();
  let parsed;
  let done = false;
  Object.defineProperty(req, 'body', {
    enumerable: true,
    get() {
      // Like Vercel: JSON is parsed on first read and a broken body throws; anything else is a string.
      if (!done) {
        done = true;
        if (!raw) parsed = undefined;
        else if (type.includes('application/json')) parsed = JSON.parse(raw);
        else if (type.includes('application/x-www-form-urlencoded')) parsed = Object.fromEntries(new URLSearchParams(raw));
        else parsed = raw;
      }
      return parsed;
    },
  });
  return req;
}

/** A Vercel-style response that collects status, headers and body. */
function nodeResponse() {
  const res = {
    statusCode: 200,
    headers: new Headers(),
    body: null,
    finished: false,
    setHeader(name, value) {
      res.headers.set(name, Array.isArray(value) ? value.join(', ') : String(value));
      return res;
    },
    getHeader(name) {
      return res.headers.get(name) ?? undefined;
    },
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(value) {
      if (!res.headers.has('content-type')) res.headers.set('content-type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify(value));
    },
    send(value) {
      if (value !== null && typeof value === 'object' && !(value instanceof Uint8Array)) return res.json(value);
      return res.end(value);
    },
    end(value) {
      if (value !== undefined && value !== null) res.body = value;
      res.finished = true;
      return res;
    },
  };
  return res;
}

export default async (request, context) => {
  const started = Date.now();
  const url = new URL(request.url);
  const name = url.pathname.replace(/^\/(?:\.netlify\/functions\/api|api)\/?/, '').replace(/\/+$/, '').replace(/\.js$/, '');
  let [target, extraQuery] = ALIASES[name] || [name, {}];
  if (name.startsWith('files/')) { target = 'files'; extraQuery = { key: decodeURIComponent(name.slice(6)) }; }
  if (name === 'tts-stream') {
    // Streams its body, so it returns a web Response itself instead of going through the (req, res) adapter.
    const platform = { netlify: true, siteUrl: (context.site && context.site.url) || url.origin, deadline: started + LIMIT_MS, waitUntil: (p) => context.waitUntil(Promise.resolve(p)) };
    try { return await withPlatform(platform, () => ttsStream(request)); }
    catch (err) { console.error('[tts-stream]', err); return new Response(JSON.stringify({ error: 'The voice could not start.' }), { status: 500, headers: { 'content-type': 'application/json' } }); }
  }
  const handler = target === 'files' ? files : HANDLERS[target];
  if (!handler) return notFound();

  const req = await toNodeRequest(request, url, extraQuery);
  const res = nodeResponse();
  const platform = {
    netlify: true,
    siteUrl: (context.site && context.site.url) || url.origin,
    deadline: started + LIMIT_MS,
    waitUntil: (promise) => context.waitUntil(Promise.resolve(promise)),
  };
  await withPlatform(platform, () => handler(req, res));

  const empty = res.statusCode === 204 || res.statusCode === 304 || request.method === 'HEAD';
  return new Response(empty ? null : res.body, { status: res.statusCode, headers: res.headers });
};

// No `path` here: netlify.toml's redirect sends /api/* to /.netlify/functions/api/*.
