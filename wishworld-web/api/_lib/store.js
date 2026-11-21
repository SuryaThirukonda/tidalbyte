// File storage (Vercel Blob, public store). Neon stores no files, only the URLs returned here.
import { put, head } from '@vercel/blob';
import { createHash, randomBytes } from 'node:crypto';
import { UserError } from './http.js';

/** Audio types a browser's MediaRecorder (or a file picker) can hand us, and the extension to store them under. */
const AUDIO_TYPES = {
  'audio/webm': 'webm',
  'video/webm': 'webm',
  'audio/mp4': 'm4a',
  'video/mp4': 'mp4',
  'audio/x-m4a': 'm4a',
  'audio/m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
};

/** "audio/webm;codecs=opus" -> { type: "audio/webm", ext: "webm" }. Throws a UserError for anything that is not audio we know. */
export function audioType(value, fallback = 'audio/webm') {
  const raw = typeof value === 'string' && value.trim() ? value : fallback;
  const type = raw.split(';')[0].trim().toLowerCase();
  const ext = AUDIO_TYPES[type];
  if (!ext) throw new UserError('That kind of recording is not supported.');
  return { type, ext };
}

export function sha256(...parts) {
  const h = createHash('sha256');
  for (const p of parts) h.update(p).update('|');
  return h.digest('hex');
}

/** A short unguessable name for an upload. */
export function randomName() {
  return randomBytes(12).toString('hex');
}

/** Stores bytes at an exact path and returns the public URL. */
export async function save(pathname, bytes, contentType) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new UserError('File storage is not set up yet.', 503);
  const blob = await put(pathname, bytes, {
    access: 'public',
    contentType,
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60 * 60 * 24 * 365,
  });
  return blob.url;
}

/** The public URL of a stored file, or null if it is not there (or storage cannot be asked). */
export async function find(pathname) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
  try {
    const blob = await head(pathname);
    return blob && blob.url ? blob.url : null;
  } catch {
    return null;
  }
}
