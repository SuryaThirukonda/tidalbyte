// Cutting a fruit out of its photo, on the phone, with no download and no server: the photo never leaves it.
//
// The edge of the photo is taken to be background. Its colours are grouped into a few clusters (in Lab, with
// brightness counting for less, so a shadow on the table still reads as table), and the background is grown
// inward from the edge over pixels close to those colours. What it cannot reach is the fruit. The largest
// such piece is kept, holes in it are filled, its rim is pulled in by a pixel and softened.
// This works for one fruit on a plain-ish surface. For a busy photo the phone asks for a box around the fruit
// and runs the same thing inside the box (the box's edge is then the background), or, last of all, crops an
// oval (which keeps some background and is labelled as a crop, not a cut-out).

const WORK = 360;        // long side of the mask, px: about 15 ms of work on a phone
const OUT = 768;         // long side of the cut-out sent, px (the server makes it 512)
const SOURCE = 1600;     // long side the photo is kept at while the page works with it
const L_WEIGHT = 0.5;    // brightness counts half as much as colour
const K = 5;             // background colour clusters

const LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) { const c = i / 255; LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);

function canvasOf(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  return c;
}

/** A photo File or Blob -> a canvas at most 1600 px on the long side (upright: browsers apply the camera's rotation). */
export async function readPhoto(fileOrBlob) {
  if (!fileOrBlob) throw new Error('Choose a photo first.');
  if (fileOrBlob.type && !/^image\//.test(fileOrBlob.type)) throw new Error('That file is not a picture. Please choose a photo.');
  const url = URL.createObjectURL(fileOrBlob);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('That photo could not be read. Try taking a new one.'));
      img.src = url;
    });
    const w0 = img.naturalWidth, h0 = img.naturalHeight;
    if (!w0 || !h0) throw new Error('That photo could not be read. Try taking a new one.');
    if (Math.min(w0, h0) < 48) throw new Error('That photo is too small. Try taking a new one.');
    const s = Math.min(1, SOURCE / Math.max(w0, h0));
    const c = canvasOf(w0 * s, h0 * s);
    const g = c.getContext('2d');
    g.fillStyle = '#fff';                  // a see-through PNG gets white behind it, like a plain sheet
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Lab (brightness weighted) of every pixel of an RGBA buffer. */
function toLab(data, n) {
  const lab = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = LIN[data[i * 4]], g = LIN[data[i * 4 + 1]], b = LIN[data[i * 4 + 2]];
    const fx = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
    const fy = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
    const fz = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
    lab[i * 3] = (116 * fy - 16) * L_WEIGHT;
    lab[i * 3 + 1] = 500 * (fx - fy);
    lab[i * 3 + 2] = 200 * (fy - fz);
  }
  return lab;
}

const dist = (lab, i, c) => Math.hypot(lab[i * 3] - c[0], lab[i * 3 + 1] - c[1], lab[i * 3 + 2] - c[2]);

/** Groups the border's colours. -> { centers, spread } with small clusters (a fruit touching the edge) dropped. */
function borderColours(lab, w, h) {
  const ring = Math.max(2, Math.round(Math.min(w, h) * 0.02));
  const idx = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x < ring || y < ring || x >= w - ring || y >= h - ring) idx.push(y * w + x);
    }
  }
  let centers = [];
  for (let k = 0; k < K; k++) {
    const i = idx[Math.floor((k + 0.5) * idx.length / K)];
    centers.push([lab[i * 3], lab[i * 3 + 1], lab[i * 3 + 2]]);
  }
  const owner = new Int32Array(idx.length);
  for (let iter = 0; iter < 8; iter++) {
    const sum = centers.map(() => [0, 0, 0, 0]);
    for (let j = 0; j < idx.length; j++) {
      let best = 0, bd = Infinity;
      for (let k = 0; k < centers.length; k++) { const d = dist(lab, idx[j], centers[k]); if (d < bd) { bd = d; best = k; } }
      owner[j] = best;
      const s = sum[best], i = idx[j];
      s[0] += lab[i * 3]; s[1] += lab[i * 3 + 1]; s[2] += lab[i * 3 + 2]; s[3]++;
    }
    centers = centers.map((c, k) => (sum[k][3] ? [sum[k][0] / sum[k][3], sum[k][1] / sum[k][3], sum[k][2] / sum[k][3]] : c));
  }
  const counts = new Array(centers.length).fill(0);
  let spread = 0;
  for (let j = 0; j < idx.length; j++) { counts[owner[j]]++; spread += dist(lab, idx[j], centers[owner[j]]); }
  spread /= idx.length;
  const kept = centers.filter((_, k) => counts[k] >= idx.length * 0.06);
  return { centers: kept.length ? kept : centers, spread };
}

/** 4-connected pieces of `on`: keeps only the biggest. Returns its size. */
function keepLargest(mask, w, h) {
  const label = new Int32Array(w * h);
  const queue = new Int32Array(w * h);
  let best = 0, bestSize = 0, next = 0;
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || label[s]) continue;
    next++;
    let head = 0, tail = 0, size = 0;
    queue[tail++] = s; label[s] = next;
    while (head < tail) {
      const i = queue[head++]; size++;
      const x = i % w, y = (i - x) / w;
      if (x > 0 && mask[i - 1] && !label[i - 1]) { label[i - 1] = next; queue[tail++] = i - 1; }
      if (x < w - 1 && mask[i + 1] && !label[i + 1]) { label[i + 1] = next; queue[tail++] = i + 1; }
      if (y > 0 && mask[i - w] && !label[i - w]) { label[i - w] = next; queue[tail++] = i - w; }
      if (y < h - 1 && mask[i + w] && !label[i + w]) { label[i + w] = next; queue[tail++] = i + w; }
    }
    if (size > bestSize) { bestSize = size; best = next; }
  }
  for (let i = 0; i < w * h; i++) mask[i] = label[i] === best ? 1 : 0;
  return bestSize;
}

/** Everything the outside cannot reach becomes part of the fruit (a pale spot on an apple is not a hole). */
function fillHoles(mask, w, h) {
  const outside = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let tail = 0;
  const push = (i) => { if (!mask[i] && !outside[i]) { outside[i] = 1; queue[tail++] = i; } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  for (let head = 0; head < tail; head++) {
    const i = queue[head], x = i % w, y = (i - x) / w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (y > 0) push(i - w);
    if (y < h - 1) push(i + w);
  }
  for (let i = 0; i < w * h; i++) if (!outside[i]) mask[i] = 1;
}

function erode(mask, w, h) {
  const out = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      out[i] = mask[i] && mask[i - 1] && mask[i + 1] && mask[i - w] && mask[i + w] ? 1 : 0;
    }
  }
  return out;
}

function dilate(mask, w, h) {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      out[i] = mask[i] || (x > 0 && mask[i - 1]) || (x < w - 1 && mask[i + 1]) || (y > 0 && mask[i - w]) || (y < h - 1 && mask[i + w]) ? 1 : 0;
    }
  }
  return out;
}

/** A 0..255 alpha with a soft rim: two 3x3 box blurs. */
function soften(mask, w, h) {
  let a = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) a[i] = mask[i];
  for (let pass = 0; pass < 2; pass++) {
    const b = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) { const xx = x + dx; if (xx < 0 || xx >= w) continue; s += a[yy * w + xx]; n++; }
        }
        b[y * w + x] = s / n;
      }
    }
    a = b;
  }
  const out = new Uint8ClampedArray(w * h);
  for (let i = 0; i < w * h; i++) out[i] = Math.round(Math.min(1, a[i] * 1.25) * 255);    // keep the inside fully solid
  return out;
}

/** Copies a region of the photo through an alpha mask into a canvas trimmed to the fruit. */
function compose(source, region, alpha, w, h, box) {
  // box: the fruit's bounds in mask pixels
  const sx = region.w / w, sy = region.h / h;
  const srcX = region.x + box.x0 * sx, srcY = region.y + box.y0 * sy;
  const srcW = (box.x1 - box.x0 + 1) * sx, srcH = (box.y1 - box.y0 + 1) * sy;
  const scale = Math.min(1, OUT / Math.max(srcW, srcH));
  const out = canvasOf(srcW * scale, srcH * scale);
  const g = out.getContext('2d');
  g.drawImage(source, srcX, srcY, srcW, srcH, 0, 0, out.width, out.height);

  const mw = box.x1 - box.x0 + 1, mh = box.y1 - box.y0 + 1;
  const m = canvasOf(mw, mh);
  const mg = m.getContext('2d');
  const img = mg.createImageData(mw, mh);
  for (let y = 0; y < mh; y++) {
    for (let x = 0; x < mw; x++) {
      const o = (y * mw + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
      img.data[o + 3] = alpha[(y + box.y0) * w + (x + box.x0)];
    }
  }
  mg.putImageData(img, 0, 0);
  g.globalCompositeOperation = 'destination-in';
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(m, 0, 0, out.width, out.height);
  g.globalCompositeOperation = 'source-over';
  return out;
}

/**
 * Cuts the fruit out of `source` (a canvas from readPhoto), or out of the part of it inside `rect`
 * ({ x, y, w, h } in source pixels). `looseness` 0.6 (tighter) to 1.6 (looser) scales how different from
 * the background a colour must be to count as fruit.
 * -> { ok: true, canvas, share, warning? } or { ok: false, reason }
 */
export function cutOut(source, { rect = null, looseness = 1 } = {}) {
  const region = rect
    ? { x: Math.max(0, rect.x), y: Math.max(0, rect.y), w: Math.min(rect.w, source.width - rect.x), h: Math.min(rect.h, source.height - rect.y) }
    : { x: 0, y: 0, w: source.width, h: source.height };
  if (region.w < 24 || region.h < 24) return { ok: false, reason: 'That box is too small. Draw it around the whole fruit.' };

  const s = WORK / Math.max(region.w, region.h);
  const w = Math.max(16, Math.round(region.w * s)), h = Math.max(16, Math.round(region.h * s));
  const small = canvasOf(w, h);
  const sg = small.getContext('2d', { willReadFrequently: true });
  sg.imageSmoothingQuality = 'high';
  sg.drawImage(source, region.x, region.y, region.w, region.h, 0, 0, w, h);
  const n = w * h;
  const lab = toLab(sg.getImageData(0, 0, w, h).data, n);

  const { centers, spread } = borderColours(lab, w, h);
  const T = Math.min(42, Math.max(9, 7 + 2.2 * spread)) * Math.min(1.6, Math.max(0.6, looseness));
  // A gentle change from a background neighbour is still background (shading across a table). Inside a box
  // drawn by hand the background is only a thin rim, and following gradients there leaks into round fruit.
  const STEP = rect ? 0 : T * 0.32;
  const near = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let d = Infinity;
    for (let k = 0; k < centers.length; k++) { const e = dist(lab, i, centers[k]); if (e < d) d = e; }
    near[i] = d;
  }

  const bg = new Uint8Array(n);
  const queue = new Int32Array(n);
  let tail = 0;
  const seed = (i) => { if (!bg[i] && near[i] < T) { bg[i] = 1; queue[tail++] = i; } };
  for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
  const step = (from, to) => {
    if (bg[to]) return;
    const d = near[to];
    if (d < T || (d < T * 2 && Math.hypot(lab[to * 3] - lab[from * 3], lab[to * 3 + 1] - lab[from * 3 + 1], lab[to * 3 + 2] - lab[from * 3 + 2]) < STEP)) {
      bg[to] = 1; queue[tail++] = to;
    }
  };
  for (let head = 0; head < tail; head++) {
    const i = queue[head], x = i % w, y = (i - x) / w;
    if (x > 0) step(i, i - 1);
    if (x < w - 1) step(i, i + 1);
    if (y > 0) step(i, i - w);
    if (y < h - 1) step(i, i + w);
  }

  let mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) mask[i] = bg[i] ? 0 : 1;
  mask = dilate(erode(mask, w, h), w, h);                  // drop specks and hair-thin bridges
  const size = keepLargest(mask, w, h);
  if (size < n * 0.01) return { ok: false, reason: 'We could not find the fruit. Try a plain background, or draw a box around the fruit.' };
  fillHoles(mask, w, h);

  let fruit = 0, edge = 0, edgeAll = 0;
  const box = { x0: w, y0: h, x1: -1, y1: -1 };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const onEdge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      if (onEdge) edgeAll++;
      if (!mask[i]) continue;
      fruit++;
      if (onEdge) edge++;
      if (x < box.x0) box.x0 = x;
      if (x > box.x1) box.x1 = x;
      if (y < box.y0) box.y0 = y;
      if (y > box.y1) box.y1 = y;
    }
  }
  const share = fruit / n;
  if (share > 0.9) return { ok: false, reason: 'The fruit and the background look too alike. Try a plainer background, or draw a box around the fruit.' };

  const alpha = soften(erode(mask, w, h), w, h);
  const canvas = compose(source, region, alpha, w, h, box);
  const warning = edge > edgeAll * 0.2
    ? 'Some of the fruit may have been cut off at the edge. If it looks wrong, draw a box around the fruit.'
    : share > 0.7 ? 'Some background may still be there. If it looks wrong, try "Tighter" or draw a box.' : '';
  return { ok: true, canvas, share, warning };
}

/** The last resort: an oval inside `rect` (source pixels). Keeps whatever background is inside the oval. */
export function ovalCrop(source, rect) {
  const x = Math.max(0, rect.x), y = Math.max(0, rect.y);
  const w = Math.min(rect.w, source.width - x), h = Math.min(rect.h, source.height - y);
  if (w < 24 || h < 24) return { ok: false, reason: 'That box is too small. Draw it around the whole fruit.' };
  const scale = Math.min(1, OUT / Math.max(w, h));
  const out = canvasOf(w * scale, h * scale);
  const g = out.getContext('2d');
  g.beginPath();
  g.ellipse(out.width / 2, out.height / 2, out.width / 2 - 1, out.height / 2 - 1, 0, 0, Math.PI * 2);
  g.clip();
  g.drawImage(source, x, y, w, h, 0, 0, out.width, out.height);
  return { ok: true, canvas: out, share: Math.PI / 4 };
}

/** A canvas -> PNG Blob, made smaller until it is comfortably under the upload limit. */
export async function toPng(canvas, maxBytes = 2.2 * 1024 * 1024) {
  let c = canvas;
  for (let attempt = 0; attempt < 4; attempt++) {
    const blob = await new Promise((resolve) => c.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('The fruit picture could not be prepared. Try again.');
    if (blob.size <= maxBytes) return blob;
    const smaller = canvasOf(c.width * 0.75, c.height * 0.75);
    const g = smaller.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(c, 0, 0, smaller.width, smaller.height);
    c = smaller;
  }
  throw new Error('The fruit picture is too large to send. Try a new photo.');
}
