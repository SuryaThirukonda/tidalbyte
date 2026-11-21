// Small helpers shared by every function: CORS, JSON replies, body parsing, input checks.

export function cors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true; // handled
  }
  return false;
}

export function send(res, status, body) {
  res.status(status).json(body);
}

export function fail(res, status, message) {
  res.status(status).json({ error: message });
}

/** Wraps a handler: CORS, method check, and a safe 500 on anything thrown. */
export function route(methods, handler) {
  const allowed = Array.isArray(methods) ? methods : [methods];
  return async function wrapped(req, res) {
    if (cors(req, res)) return;
    if (!allowed.includes(req.method)) return fail(res, 405, 'Method not allowed');
    try {
      await handler(req, res);
    } catch (err) {
      const status = err && err.status ? err.status : 500;
      if (status >= 500) console.error('[api]', req.url, err);
      fail(res, status, status >= 500 ? 'Something went wrong. Please try again.' : err.message);
    }
  };
}

/** An error that is safe to show to the person using the app. */
export class UserError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Vercel parses JSON bodies for us; tolerate a string body too. */
export function body(req) {
  let b;
  try {
    b = req.body; // Vercel parses on first read, and throws if the JSON is broken
  } catch {
    throw new UserError('The request was not valid JSON.');
  }
  if (b && typeof b === 'object') return b;
  if (typeof b === 'string' && b.length) {
    try {
      return JSON.parse(b);
    } catch {
      throw new UserError('The request was not valid JSON.');
    }
  }
  return {};
}

/** Trimmed, length-capped text. Returns '' when missing. */
export function text(value, max) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
}

/** Room codes are 3 to 8 letters or digits, stored upper case. */
export function roomCode(value) {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!/^[A-Z0-9]{3,8}$/.test(code)) throw new UserError('That room code does not look right.');
  return code;
}

/** Decodes a base64 payload (optionally a data: URL) with a size cap in bytes. */
export function base64Bytes(value, maxBytes) {
  if (typeof value !== 'string' || !value.length) return null;
  const comma = value.startsWith('data:') ? value.indexOf(',') : -1;
  const raw = comma >= 0 ? value.slice(comma + 1) : value;
  const buf = Buffer.from(raw, 'base64');
  if (!buf.length) throw new UserError('The file was empty.');
  if (buf.length > maxBytes) throw new UserError('That file is too large.');
  return buf;
}
