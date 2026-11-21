// Checks api/_lib/fruit.js tidyFruit (no database or Blob needed):  node tools/fruit.test.mjs
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { tidyFruit } from '../api/_lib/fruit.js';

const W = 1000, H = 600;
const circle = (fill) => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><ellipse cx="500" cy="300" rx="220" ry="140" fill="${fill}"/></svg>`);

async function rejects(bytes, pattern, what) {
  await assert.rejects(() => tidyFruit(bytes), (err) => err.status === 400 && pattern.test(err.message), what);
  console.log('ok   rejects ' + what);
}

// A cut-out banana-ish shape on a see-through background: kept, trimmed to the shape, at most 512 px.
const good = await sharp(circle('#f2c94c')).png().toBuffer();
const out = await tidyFruit(good);
const meta = await sharp(out.png).metadata();
assert.equal(meta.format, 'png');
assert.equal(meta.hasAlpha, true);
assert.ok(Math.max(out.width, out.height) <= 512, 'long side at most 512');
assert.ok(Math.abs(out.width / out.height - 440 / 280) < 0.05, 'trimmed to the fruit, aspect kept: ' + out.width + 'x' + out.height);
console.log(`ok   cut-out kept: ${out.width}x${out.height}, ${out.png.length} bytes`);

// A tall one stays tall.
const tall = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="900"><rect x="100" y="50" width="80" height="700" fill="#d33"/></svg>`)).png().toBuffer();
const t = await tidyFruit(tall);
assert.ok(t.height > t.width * 5, 'tall aspect kept');
console.log(`ok   tall cut-out: ${t.width}x${t.height}`);

await rejects(await sharp(circle('#f2c94c')).flatten({ background: '#fff' }).jpeg().toBuffer(), /PNG/, 'a JPEG');
await rejects(await sharp(circle('#f2c94c')).flatten({ background: '#fff' }).png().toBuffer(), /background was not removed/, 'a PNG with no alpha');
await rejects(await sharp({ create: { width: 400, height: 400, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer(), /could not find the fruit/, 'an empty picture');
await rejects(await sharp({ create: { width: 400, height: 400, channels: 4, background: { r: 200, g: 0, b: 0, alpha: 1 } } }).png().toBuffer(), /background was not removed/, 'a fully solid picture');
await rejects(Buffer.concat([Buffer.from('\x89PNG\r\n\x1a\n', 'latin1'), Buffer.from('not really a png')]), /could not be read/, 'a broken PNG');
await rejects(Buffer.from('<svg/>'), /PNG/, 'an SVG');
console.log('all fruit checks passed');
