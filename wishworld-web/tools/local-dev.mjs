// Local WishWorld server for testing features that are not on production yet (e.g. Frost Slice fruit).
// Serves public/, handles fruit on /api/scan, and proxies every other /api call to production.
//
//   node tools/local-dev.mjs          (http://localhost:4173)
//   node tools/local-dev.mjs 5180
//
// Fruit pictures are kept under public/fruit-dev/ and remembered per room in memory.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tidyFruit, MAX_FRUIT_BYTES, FRUIT_EVENT } from '../api/_lib/fruit.js';
import { UserError } from '../api/_lib/http.js';
import { randomName } from '../api/_lib/store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const FRUIT_DIR = path.join(PUBLIC, 'fruit-dev');
const PRODUCTION = 'https://wishworld-web.netlify.app';
const PORT = Number(process.argv[2]) || 4173;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

/** room -> fruit JSON or null (cleared) */
const fruitByRoom = new Map();
fs.mkdirSync(FRUIT_DIR, { recursive: true });

function sendJson(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
  });
  res.end(JSON.stringify(body));
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let n = 0;
    req.on('data', (c) => {
      n += c.length;
      if (n > limit) {
        reject(new UserError('That request is too large.', 413));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function roomCode(value) {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!/^[A-Z0-9]{3,8}$/.test(code)) throw new UserError('A room code is 3 to 8 letters or numbers.');
  return code;
}

function base64Bytes(value, max) {
  if (typeof value !== 'string' || !value) return null;
  const raw = value.includes(',') ? value.split(',').pop() : value;
  let buf;
  try {
    buf = Buffer.from(raw, 'base64');
  } catch {
    return null;
  }
  if (!buf.length || buf.length > max) return null;
  return buf;
}

function forgetFile(assetUrl) {
  try {
    const name = path.basename(new URL(assetUrl, 'http://local').pathname);
    if (!/^[a-f0-9]+\.png$/i.test(name)) return;
    fs.unlinkSync(path.join(FRUIT_DIR, name));
  } catch {
    /* ignore */
  }
}

async function fruitGet(res, url) {
  if (url.searchParams.get('kind') !== 'fruit') throw new UserError('Ask for ?kind=fruit.');
  const room = roomCode(url.searchParams.get('room'));
  return sendJson(res, 200, { fruit: fruitByRoom.has(room) ? fruitByRoom.get(room) : null });
}

async function fruitPost(res, body) {
  const room = roomCode(body.room);
  if (body.action === 'clear') {
    const prev = fruitByRoom.get(room);
    fruitByRoom.set(room, null);
    if (prev?.assetUrl) forgetFile(prev.assetUrl);
    return sendJson(res, 200, { fruit: null });
  }
  const bytes = base64Bytes(body.image, MAX_FRUIT_BYTES);
  if (!bytes) throw new UserError('Take a photo of a fruit first.');
  const method = ['auto', 'box', 'oval'].includes(body.method) ? body.method : 'auto';
  const { png, width, height } = await tidyFruit(bytes);
  const name = `${randomName()}.png`;
  fs.writeFileSync(path.join(FRUIT_DIR, name), png);
  const prev = fruitByRoom.get(room);
  if (prev?.assetUrl) forgetFile(prev.assetUrl);
  const fruit = {
    id: Date.now(),
    room,
    type: FRUIT_EVENT,
    assetUrl: `/fruit-dev/${name}`,
    width,
    height,
    method,
    createdAt: new Date().toISOString(),
  };
  fruitByRoom.set(room, fruit);
  return sendJson(res, 200, { fruit });
}

async function proxyApi(req, res, url, bodyBuf) {
  const target = PRODUCTION + url.pathname + url.search;
  const headers = { accept: req.headers.accept || 'application/json' };
  if (req.headers['content-type']) headers['content-type'] = req.headers['content-type'];
  const init = { method: req.method, headers };
  if (bodyBuf && req.method !== 'GET' && req.method !== 'HEAD') init.body = bodyBuf;
  let upstream;
  try {
    upstream = await fetch(target, init);
  } catch {
    return sendJson(res, 502, { error: 'Could not reach WishWorld. Check the connection and try again.' });
  }
  const buf = Buffer.from(await upstream.arrayBuffer());
  const out = { 'cache-control': 'no-store', 'access-control-allow-origin': '*' };
  const ct = upstream.headers.get('content-type');
  if (ct) out['content-type'] = ct;
  res.writeHead(upstream.status, out);
  res.end(buf);
}

function safePublicPath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const rel = decoded === '/' ? '/index.html' : decoded;
  const full = path.normalize(path.join(PUBLIC, rel));
  if (!full.startsWith(PUBLIC)) return null;
  return full;
}

function serveStatic(req, res, url) {
  let file = safePublicPath(url.pathname);
  if (!file) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404);
    return res.end('Not found');
  }
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, {
    'content-type': TYPES[ext] || 'application/octet-stream',
    'cache-control': ext === '.html' || ext === '.js' || ext === '.css' ? 'no-store' : 'public, max-age=60',
  });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,POST,OPTIONS',
        'access-control-allow-headers': 'content-type',
      });
      return res.end();
    }

    if (url.pathname === '/api/scan' || url.pathname === '/api/scan/') {
      if (req.method === 'GET') return fruitGet(res, url);
      const raw = await readBody(req, Math.max(MAX_FRUIT_BYTES * 2, 6 * 1024 * 1024));
      let body;
      try {
        body = JSON.parse(raw.toString('utf8') || '{}');
      } catch {
        throw new UserError('That request could not be read.');
      }
      if (body.kind === 'fruit') return fruitPost(res, body);
      return proxyApi(req, res, url, raw);
    }

    if (url.pathname.startsWith('/api/')) {
      const raw = req.method === 'GET' || req.method === 'HEAD' ? null : await readBody(req, 6 * 1024 * 1024);
      return proxyApi(req, res, url, raw);
    }

    return serveStatic(req, res, url);
  } catch (err) {
    const status = err && err.status ? err.status : 500;
    const message = err instanceof UserError ? err.message : 'Something went wrong. Please try again.';
    if (!(err instanceof UserError)) console.error('[local-dev]', err);
    sendJson(res, status, { error: message });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`WishWorld local-dev at http://localhost:${PORT}`);
  console.log(`Fruit API is local; other /api calls go to ${PRODUCTION}`);
  console.log(`Phone fruit: http://localhost:${PORT}/phone/?room=TEST&scan=fruit`);
  console.log(`Frost Slice:  http://localhost:${PORT}/vr/?room=TEST&tab=frostslice&mode=desktop`);
});
