// A fruit photographed on the phone (phone Scan tab, "Scan Fruit for Frost Slice"), as Frost Slice's fruit.
//
// The phone sends a cut-out PNG; GET /api/scan?kind=fruit says which one is the room's. While the tab is open
// this asks every few seconds. A new picture is fetched and decoded in the background (createImageBitmap, so
// the headset does not stall) and then waits in `pending` until the game says it is a safe moment (between
// rounds) to swap it in. One texture, one material and three small planes (whole, left half, right half) are
// shared by every copy in the air; the old ones are freed when a new fruit takes over.
//
// Dev only (localhost or the dev harness): ?fruit=<url> uses that picture and does not ask the server.

import * as THREE from 'three';

const POLL_MS = 5000;
const LONG_SIDE = 0.2;                 // metres across the picture's long side
const POINTS = 10;
const MAX_PIXELS = 1024;

/**
 * Only pictures this site stored are loaded: served by this page's site or the API it talks to
 * (Netlify Blobs at /api/files/...), or on Vercel Blob.
 */
function allowed(url, apiBase) {
  try {
    const u = new URL(url, location.href);
    if (u.origin === location.origin) return true;
    if (apiBase && u.origin === new URL(apiBase, location.href).origin && u.pathname.startsWith('/api/files/')) return true;
    return u.protocol === 'https:' && u.hostname.endsWith('.public.blob.vercel-storage.com');
  } catch {
    return false;
  }
}

/** The average colour of the solid pixels, for the juice burst. sRGB 0..1. */
function averageColour(source) {
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(source, 0, 0, 16, 16);
    const d = g.getImageData(0, 0, 16, 16).data;
    let r = 0, gg = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128) continue;
      r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++;
    }
    if (n) return [r / n / 255, gg / n / 255, b / n / 255];
  } catch { /* fall through */ }
  return [0.95, 0.75, 0.35];
}

async function decode(url) {
  const res = await fetch(url, { mode: 'cors', cache: 'force-cache' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const blob = await res.blob();
  if (!/^image\//.test(blob.type || 'image/png')) throw new Error('not a picture');
  if (typeof createImageBitmap === 'function') {
    const probe = await createImageBitmap(blob);
    const s = Math.min(1, MAX_PIXELS / Math.max(probe.width, probe.height));
    const width = probe.width, height = probe.height;
    probe.close();
    const bitmap = await createImageBitmap(blob, {
      imageOrientation: 'flipY', premultiplyAlpha: 'none',
      resizeWidth: Math.max(1, Math.round(width * s)), resizeHeight: Math.max(1, Math.round(height * s)), resizeQuality: 'high',
    });
    return { image: bitmap, width: bitmap.width, height: bitmap.height, flipped: true };
  }
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = URL.createObjectURL(blob);
  try { await img.decode(); } finally { URL.revokeObjectURL(img.src); }
  return { image: img, width: img.naturalWidth, height: img.naturalHeight, flipped: false };
}

function halfPlane(w, h, side) {
  const g = new THREE.PlaneGeometry(w / 2, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, side < 0 ? uv.getX(i) * 0.5 : 0.5 + uv.getX(i) * 0.5);
  uv.needsUpdate = true;
  g.translate(side * w / 4, 0, 0);
  return g;
}

/** Turns a decoded picture into what the game draws. */
function build(decoded, info) {
  const texture = new THREE.Texture(decoded.image);
  texture.flipY = !decoded.flipped;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  const material = new THREE.MeshBasicMaterial({
    name: 'ScannedFruit', map: texture, side: THREE.DoubleSide, alphaTest: 0.5, alphaToCoverage: true, fog: false, toneMapped: false,
  });
  const aspect = decoded.width / Math.max(1, decoded.height);
  const w = aspect >= 1 ? LONG_SIDE : LONG_SIDE * aspect;
  const h = aspect >= 1 ? LONG_SIDE / aspect : LONG_SIDE;
  const whole = new THREE.PlaneGeometry(w, h);
  const halves = [halfPlane(w, h, -1), halfPlane(w, h, 1)];
  return {
    id: info.id, url: info.url, material, texture, whole, halves, width: w, height: h,
    radius: Math.min(0.1, Math.max(0.06, 0.42 * Math.max(w, h))),
    kind: { name: 'Scanned fruit', points: POINTS, juice: averageColour(decoded.image), radius: Math.min(0.1, Math.max(0.06, 0.42 * Math.max(w, h))) },
    image: decoded.image,
  };
}

function free(f) {
  if (!f) return;
  f.whole.dispose(); f.halves[0].dispose(); f.halves[1].dispose();
  f.texture.dispose(); f.material.dispose();
  if (f.image && typeof f.image.close === 'function') f.image.close();
}

export function createCustomFruit(ctx, { dev = false, query = new URLSearchParams(), log = null } = {}) {
  const say = (what, detail) => { if (log) log('custom fruit ' + what, detail); };
  const fixed = dev && query.get('fruit') ? query.get('fruit') : null;

  let active = null;          // what launches now
  let pending;                // undefined = nothing waiting; null = go back to the normal fruit; object = a new fruit
  let wanted = null;          // { id, url } the server's latest, so each one is fetched once
  let loading = null;
  let timer = null, running = false;
  let failures = 0;
  let status = 'none';        // for checks: none | loading | ready | failed | normal

  async function fetchFruit(info) {
    if (!allowed(info.url, ctx.api && ctx.api.base)) { say('ignored', 'not one of our pictures: ' + info.url); status = 'failed'; return; }
    status = 'loading';
    say('loading', info.url);
    try {
      const decoded = await decode(info.url);
      if (!wanted || wanted.url !== info.url) { if (decoded.image.close) decoded.image.close(); return; }   // overtaken
      const next = build(decoded, info);
      if (pending && pending !== active) free(pending);
      pending = next;
      status = 'ready';
      say('ready', `${decoded.width}x${decoded.height}`);
    } catch (err) {
      // Deleted, expired or offline: keep whatever fruit the game has now, and try again on a later check.
      status = 'failed';
      if (wanted && wanted.url === info.url) wanted = null;
      console.warn('[frostslice] the scanned fruit could not be loaded; keeping the current fruit.', err && err.message);
    }
  }

  async function check() {
    if (!running) return;
    try {
      let info = null;
      if (fixed) info = { id: 'dev', url: fixed };
      else if (ctx.api && typeof ctx.api.getFruit === 'function') {
        const f = await ctx.api.getFruit();
        info = f && f.assetUrl ? { id: f.id, url: f.assetUrl } : null;
      } else return;                                         // no server (dev harness): the normal fruit
      failures = 0;
      if (!info) {
        if (wanted || active) { wanted = null; if (pending && pending !== active) free(pending); pending = null; status = 'normal'; say('cleared'); }
        return;
      }
      if (wanted && wanted.url === info.url) return;
      wanted = info;
      loading = fetchFruit(info);
      await loading;
    } catch {
      failures++;                                            // offline or the server hiccupped: try again later
    } finally {
      if (running && !fixed) timer = setTimeout(check, failures ? Math.min(30000, POLL_MS * 2 ** failures) : POLL_MS);
    }
  }

  return {
    /** The fruit to launch now, or null for the normal fruit. */
    get active() { return active; },
    get hasPending() { return pending !== undefined; },
    get status() { return status; },

    start() {
      if (running) return;
      running = true;
      check();
    },
    stop() {
      running = false;
      clearTimeout(timer); timer = null;
    },

    /**
     * Swap in whatever is waiting. Call only when no scanned fruit is in the air (the game clears them first).
     * -> 'new' (a scanned fruit took over), 'normal' (back to the normal fruit) or null (nothing changed).
     */
    takePending() {
      if (pending === undefined) return null;
      const next = pending;
      pending = undefined;
      if (next === active) return null;
      const old = active;
      active = next;
      free(old);
      return active ? 'new' : 'normal';
    },

    dispose() {
      this.stop();
      if (pending && pending !== active) free(pending);
      free(active);
      active = null; pending = undefined;
    },
  };
}
