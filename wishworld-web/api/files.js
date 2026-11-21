// GET /api/files/<path> -> the file, from the Netlify Blobs store "files" (see _lib/store.js).
// Public and immutable: every path holds one file for good (names are random or content hashes).
import { route, UserError } from './_lib/http.js';
import { netlifyFiles } from './_lib/store.js';

export default route('GET', async (req, res) => {
  const key = String((req.query || {}).key || '');
  if (!key || key.length > 300 || key.includes('..') || !/^[A-Za-z0-9._\-/]+$/.test(key)) throw new UserError('No such file.', 404);
  const files = netlifyFiles();
  if (!files) throw new UserError('File storage is not available here.', 404);
  const found = await files.getWithMetadata(key, { type: 'arrayBuffer' });
  if (!found || !found.data) throw new UserError('No such file.', 404);
  res.setHeader('Content-Type', (found.metadata && found.metadata.contentType) || 'application/octet-stream');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.status(200).end(new Uint8Array(found.data));
});
