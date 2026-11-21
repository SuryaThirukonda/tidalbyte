// Fruit for Frost Slice, photographed on the phone. The phone cuts the fruit out of its photo and sends only
// that cut-out (a PNG with a see-through background); the photo itself never leaves the phone.
//
// Nothing new in the database: each scan is a row in `events` (type frostslice_fruit) whose detail holds the
// stored picture's address. The newest row of a room is that room's fruit; a row without assetUrl means
// "back to the normal fruit". Only the newest picture is kept: the one before it is deleted from storage.
import sharp from 'sharp';
import { del } from '@vercel/blob';
import { UserError } from './http.js';
import { sql, ensureRoom, logEvent } from './db.js';
import { save, randomName, netlifyFiles } from './store.js';

export const FRUIT_EVENT = 'frostslice_fruit';
export const MAX_FRUIT_BYTES = 3 * 1024 * 1024;
const SIDE = 512;                    // the game draws it about 20 cm across; 512 px is plenty and light on the Quest
const METHODS = new Set(['auto', 'box', 'oval']);
const SOLID = 24;                    // alpha above this counts as fruit

function isPng(bytes) {
  return bytes.length > 8 && bytes.subarray(0, 8).toString('latin1') === '\x89PNG\r\n\x1a\n';
}

/**
 * Checks the phone's cut-out and makes it small: trimmed to the fruit, at most 512 px on the long side,
 * PNG with alpha, no metadata. Throws a UserError that can be shown on the phone.
 */
export async function tidyFruit(bytes) {
  if (!isPng(bytes)) throw new UserError('The fruit picture must be a PNG with a see-through background.');
  let meta;
  try {
    meta = await sharp(bytes, { failOn: 'error' }).metadata();
  } catch {
    throw new UserError('That fruit picture could not be read. Please try again.');
  }
  if (!meta.width || !meta.height || Math.min(meta.width, meta.height) < 16) throw new UserError('That fruit picture is too small.');
  if (meta.width * meta.height > 4096 * 4096) throw new UserError('That fruit picture is too large.');
  if (!meta.hasAlpha) throw new UserError('The background was not removed from that picture. Please try again.');

  let raw;
  try {
    raw = await sharp(bytes, { failOn: 'error' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  } catch {
    throw new UserError('That fruit picture could not be read. Please try again.');
  }
  const { data, info } = raw;
  const { width: w, height: h, channels } = info;
  let minX = w, minY = h, maxX = -1, maxY = -1, solid = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * channels + channels - 1] <= SOLID) continue;
      solid++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const share = solid / (w * h);
  if (maxX < 0 || share < 0.005 || maxX - minX < 12 || maxY - minY < 12) {
    throw new UserError('We could not find the fruit in that picture. Try again with the fruit filling more of the photo.');
  }
  if (share > 0.995) throw new UserError('The background was not removed from that picture. Please try again.');

  const pad = 2;
  const left = Math.max(0, minX - pad), top = Math.max(0, minY - pad);
  const region = { left, top, width: Math.min(w, maxX + pad + 1) - left, height: Math.min(h, maxY + pad + 1) - top };
  const out = await sharp(bytes)
    .extract(region)
    .resize(SIDE, SIDE, { fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toBuffer({ resolveWithObject: true });
  return { png: out.data, width: out.info.width, height: out.info.height };
}

function fruitJson(row, room) {
  const d = row.detail || {};
  if (typeof d.assetUrl !== 'string' || !d.assetUrl) return null;
  return {
    id: Number(row.id),
    room,
    type: FRUIT_EVENT,
    assetUrl: d.assetUrl,
    width: Number(d.width) || null,
    height: Number(d.height) || null,
    method: METHODS.has(d.method) ? d.method : 'auto',
    createdAt: new Date(row.created_at).toISOString(),
  };
}

/** The room's current fruit, or null (none scanned, or put back to the normal fruit). */
export async function currentFruit(room) {
  const rows = await sql`
    select id, created_at, detail from events
    where room_code = ${room} and type = ${FRUIT_EVENT}
    order by id desc limit 1`;
  return rows.length ? fruitJson(rows[0], room) : null;
}

/**
 * Deletes a picture this file stored: a Netlify Blobs file served at /api/files/fruit/..., or a Vercel Blob
 * under /fruit/. Anything else is left alone; failures are only logged.
 */
async function forget(url) {
  try {
    const u = new URL(url);
    const served = u.pathname.match(/^\/api\/files\/(fruit\/[A-Za-z0-9._-]+)$/);
    if (served) {
      const files = netlifyFiles();
      if (files) await files.delete(decodeURIComponent(served[1]));
      return;
    }
    if (!u.hostname.endsWith('.blob.vercel-storage.com') || !u.pathname.startsWith('/fruit/')) return;
    if (process.env.BLOB_READ_WRITE_TOKEN) await del(url);
  } catch (err) {
    console.warn('[fruit] could not delete the old picture', err && err.message);
  }
}

/** Stores a new fruit for the room and makes it the current one. -> fruit */
export async function saveFruit(room, bytes, { sender = '', method = 'auto' } = {}) {
  const { png, width, height } = await tidyFruit(bytes);
  const [assetUrl, previous] = await Promise.all([
    save(`fruit/${randomName()}.png`, png, 'image/png'),
    currentFruit(room).catch(() => null),
    ensureRoom(room),
  ]);
  const detail = { assetUrl, width, height, method: METHODS.has(method) ? method : 'auto' };
  if (sender) detail.sender = sender;
  const id = await logEvent(room, FRUIT_EVENT, detail);
  if (previous && previous.assetUrl !== assetUrl) await forget(previous.assetUrl);
  return { id, room, type: FRUIT_EVENT, assetUrl, width, height, method: detail.method, createdAt: new Date().toISOString() };
}

/** Puts the room back to the normal fruit and deletes its scanned picture. */
export async function clearFruit(room) {
  const previous = await currentFruit(room).catch(() => null);
  await ensureRoom(room);
  await logEvent(room, FRUIT_EVENT, { cleared: true });
  if (previous) await forget(previous.assetUrl);
}
