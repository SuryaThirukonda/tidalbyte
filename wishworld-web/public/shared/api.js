// WishWorld browser client. Every page talks to the server through this file and nothing else.
//
//   import { api } from '/shared/api.js';
//   const gift = await api.sendWish({ sender: 'Grandma', text: 'a sea turtle' });
//   const stop = api.pollGifts((gift) => showGift(gift));
//
// All methods use the current room. A failed call rejects with an Error whose message is safe to show to
// the person using the app. logEvent never rejects. No secrets live here: keys stay on the server.

const PRODUCTION = 'https://wishworld-web.netlify.app';
const ROOM_KEY = 'wishworld.room';
const DEFAULT_ROOM = 'WISH';
const OFFLINE = 'Could not reach WishWorld. Check the connection and try again.';
const BROKEN = 'Something went wrong. Please try again.';

/**
 * "" = same origin. On localhost / LAN use `node tools/local-dev.mjs` (fruit is handled locally; other
 * /api routes are proxied to production). file: URLs still use the deployed API.
 */
function findBase() {
  try {
    const loc = globalThis.location;
    if (!loc || !loc.hostname || loc.protocol === 'file:') return PRODUCTION;
    return '';
  } catch {
    return PRODUCTION;
  }
}

const base = findBase();

// ---------- room ----------

function cleanRoom(value) {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return /^[A-Z0-9]{3,8}$/.test(code) ? code : '';
}

function stored(key) {
  try {
    return globalThis.localStorage ? globalThis.localStorage.getItem(key) : null;
  } catch {
    return null; // private mode, or storage blocked
  }
}

function store(key, value) {
  try {
    if (globalThis.localStorage) globalThis.localStorage.setItem(key, value);
  } catch {
    /* not being able to remember the room is not an error */
  }
}

let currentRoom = '';

function room() {
  if (currentRoom) return currentRoom;
  let fromUrl = '';
  try {
    fromUrl = cleanRoom(new URLSearchParams(globalThis.location ? globalThis.location.search : '').get('room') || '');
  } catch {
    fromUrl = '';
  }
  currentRoom = fromUrl || cleanRoom(stored(ROOM_KEY) || '') || DEFAULT_ROOM;
  if (fromUrl) store(ROOM_KEY, fromUrl);
  return currentRoom;
}

function setRoom(code) {
  const clean = cleanRoom(code);
  if (!clean) throw new Error('A room code is 3 to 8 letters or numbers.');
  currentRoom = clean;
  store(ROOM_KEY, clean);
  // Keep ?room= in step, so a reload (or a shared link) lands in the same room.
  try {
    const url = new URL(globalThis.location.href);
    if (url.searchParams.has('room') && url.searchParams.get('room') !== clean) {
      url.searchParams.set('room', clean);
      globalThis.history.replaceState(globalThis.history.state, '', url);
    }
  } catch {
    /* no address bar to update */
  }
  return clean;
}

// ---------- profiles ----------
// A room can hold several children. The chosen one is remembered per room on this device; null means "the
// room's default profile" (the server decides which that is). Everything sent or asked for carries it.

const profileKey = () => 'wishworld.profile.' + room();

function profile() {
  const v = Number(stored(profileKey()));
  return Number.isSafeInteger(v) && v > 0 ? v : null;
}

function setProfile(id) {
  const v = Number(id);
  store(profileKey(), Number.isSafeInteger(v) && v > 0 ? String(v) : '');
  return profile();
}

// ---------- requests ----------

async function request(method, path, payload, { timeoutMs = 30000 } = {}) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  let res;
  try {
    res = await fetch(base + path, {
      method,
      headers: payload === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: controller ? controller.signal : undefined,
      cache: 'no-store',
    });
  } catch {
    throw new Error(OFFLINE);
  } finally {
    if (timer) clearTimeout(timer);
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    if (res.status === 413) throw new Error('That file is too large to send.');
    throw new Error(data && typeof data.error === 'string' && data.error ? data.error : BROKEN);
  }
  if (data === null || typeof data !== 'object') throw new Error(BROKEN);
  return data;
}

const get = (path, options) => request('GET', path, undefined, options);
const post = (path, payload, options) => request('POST', path, payload, options);
const query = (params) =>
  Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

/** A Blob (photo, recording) as base64 text, which is how files travel to the API. */
async function blobToBase64(blob) {
  if (!blob || typeof blob.arrayBuffer !== 'function') throw new Error('There is no file to send.');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
  return btoa(binary);
}

// ---------- the client ----------

export const api = {
  /** "" on the deployed site and on local-dev; production URL only for file: pages. */
  base,

  /** The current room code: ?room= in the address, else the one remembered, else "WISH". */
  room,

  /** Switch rooms (and remember it). Throws if the code is not 3 to 8 letters or numbers. */
  setRoom,

  /** The chosen child profile's id in this room, or null for the room's default. */
  profile,

  /** Choose a profile (remembered per room on this device). -> the id */
  setProfile,

  /** The room's profiles, the default first. -> [{ id, name, icon, settings, is_default }] */
  async getProfiles() {
    return (await get('/api/profiles?' + query({ room: room() }))).profiles || [];
  },

  /** Add a profile. icon: "color:#rrggbb" or "animal:fox" (fox owl bear cat whale turtle penguin rabbit dog unicorn). */
  async createProfile({ name, icon } = {}) {
    return (await post('/api/profiles', { room: room(), name, icon })).profile;
  },

  /** Save some of a profile's settings (merged with what is there). -> profile */
  async saveProfileSettings(id, settings) {
    return (await post('/api/profiles', { room: room(), id, settings }, { timeoutMs: 15000 })).profile;
  },

  /** Make a new room and switch to it. -> { code, child_name } */
  async createRoom(childName) {
    const made = await post('/api/rooms', { childName: childName || undefined });
    setRoom(made.code);
    return made;
  },

  /** Send a wish. -> gift (kind "creature": option_id is a creature id, message is safe to show and speak) */
  async sendWish({ sender, text } = {}) {
    return (await post('/api/wish', { room: room(), sender, text, profile_id: profile() ?? undefined })).gift;
  },

  /** A wish gift's latest state; model_url appears once its own 3D model is generated. -> gift */
  async getWish(id) {
    return (await get('/api/wish?' + query({ id }), { timeoutMs: 15000 })).gift;
  },

  /** Send a note, with an optional voice recording (a Blob from MediaRecorder). -> gift (kind "letter") */
  async sendLetter({ sender, text, audioBlob } = {}) {
    const payload = { room: room(), sender, text, profile_id: profile() ?? undefined };
    if (audioBlob) {
      payload.audio = await blobToBase64(audioBlob);
      payload.audioType = audioBlob.type || 'audio/webm';
    }
    return (await post('/api/letter', payload, { timeoutMs: 60000 })).gift;
  },

  /**
   * Send a photo of a toy to be turned into a 3D companion (shrink it first). -> gift (kind "mesh", pending)
   * imageBlobs: 2 to 4 photos of the same toy, front first (back, sides), for a model that is right all round.
   */
  async startScan({ sender, imageBlob, imageBlobs } = {}) {
    const blobs = Array.isArray(imageBlobs) && imageBlobs.length ? imageBlobs : [imageBlob];
    const payload = {
      room: room(),
      sender,
      profile_id: profile() ?? undefined,
      image: await blobToBase64(blobs[0]),
      imageType: (blobs[0] && blobs[0].type) || 'image/jpeg',
    };
    if (blobs.length > 1) payload.images = await Promise.all(blobs.map((b) => blobToBase64(b)));
    return (await post('/api/scan', payload, { timeoutMs: 60000 })).gift;
  },

  /**
   * Send a fruit for Frost Slice: a PNG Blob with a see-through background, cut out on the phone.
   * method: "auto" | "box" | "oval" (how it was cut out). -> { id, room, type, assetUrl, width, height, method, createdAt }
   */
  async sendFruit({ sender, pngBlob, method } = {}) {
    const payload = { room: room(), kind: 'fruit', sender, method, image: await blobToBase64(pngBlob) };
    return (await post('/api/scan', payload, { timeoutMs: 60000 })).fruit;
  },

  /** The room's current Frost Slice fruit, or null for the normal fruit. */
  async getFruit() {
    return (await get('/api/scan?' + query({ room: room(), kind: 'fruit' }), { timeoutMs: 15000 })).fruit || null;
  },

  /** Put Frost Slice back to the normal fruit (the scanned picture is deleted). */
  async clearFruit() {
    await post('/api/scan', { room: room(), kind: 'fruit', action: 'clear' });
    return null;
  },

  /** How a scan is getting on. -> gift (status "pending", then "ready") */
  async scanStatus(id) {
    return (await get('/api/scan-status?' + query({ id }), { timeoutMs: 60000 })).gift;
  },

  /** Ready gifts with id above `after`, oldest first, 50 at most. -> { gifts, latest, pending } (pending = ids still being built) */
  async getGifts(after = 0) {
    return get('/api/gifts?' + query({ room: room(), after: Number(after) || 0, profile: profile() ?? undefined }));
  },

  /** Mark a gift as opened by the child (the parent sees it in Inbox). -> gift */
  async openGift(id) {
    return (await post('/api/gifts/open', { room: room(), id })).gift;
  },

  /**
   * Speak a line, streamed: resolves to the fetch Response, either audio/mpeg arriving as it is made or JSON
   * { url } when the line is already kept. Rejects when the network fails.
   */
  async ttsStream(text) {
    return fetch(base + '/api/tts-stream', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
  },

  /** The headset's measured frame rate, for the Judge view (core/perf.js). Resolves even on failure. */
  async reportFps(sample) {
    try { await post('/api/metrics', { room: room(), ...sample }, { timeoutMs: 8000 }); } catch { /* a missed sample is fine */ }
  },

  /** The Judge view's numbers for this room (/judge/). */
  async getMetrics() {
    return get('/api/metrics?' + query({ room: room() }), { timeoutMs: 10000 });
  },

  /** Log activity for the parent's Inbox. Never throws: on failure it resolves to { ok: false }. */
  async logEvent(type, detail) {
    try {
      const done = await post('/api/events', { room: room(), type, detail: detail || {}, profile_id: profile() ?? undefined }, { timeoutMs: 15000 });
      return { ok: true, id: done.id };
    } catch {
      return { ok: false, id: null };
    }
  },

  /** The chosen profile's saved companions (they follow the child in every tab). -> [companion] oldest first */
  async getCompanions() {
    return (await get('/api/companions?' + query({ room: room(), profile: profile() ?? undefined }))).companions || [];
  },

  /** Buddies for the Settings tab: saved companions and this profile's gifts that could be. -> { companions, gifts } */
  async getBuddies() {
    return get('/api/companions?' + query({ room: room(), profile: profile() ?? undefined, all: 1 }));
  },

  /** Keep a companion: { giftId } for a scanned toy, or { toy: 'bubby' }. -> companion */
  async saveCompanion({ giftId, toy } = {}) {
    const payload = toy ? { room: room(), toy } : { room: room(), gift_id: giftId };
    if (profile()) payload.profile_id = profile();
    return (await post('/api/companions', payload, { timeoutMs: 15000 })).companion;
  },

  /** Let a saved companion go. -> true if it was removed */
  async removeCompanion(id) {
    const payload = { room: room(), id, remove: true };
    if (profile()) payload.profile_id = profile();
    return (await post('/api/companions', payload, { timeoutMs: 15000 })).removed;
  },

  /** Give a saved companion a new name. -> companion */
  async renameCompanion(id, name) {
    const payload = { room: room(), id, name };
    if (profile()) payload.profile_id = profile();
    return (await post('/api/companions', payload, { timeoutMs: 15000 })).companion;
  },

  /** The parent check-in. -> { room, child_name, events, gifts } newest first */
  async getInbox() {
    return get('/api/inbox?' + query({ room: room() }));
  },

  /** A line spoken in the game's voice. -> the URL of an MP3 (the same line is only ever generated once) */
  async tts(text) {
    return (await post('/api/tts', { text }, { timeoutMs: 45000 })).url;
  },

  /** What was said in a recording (a Blob from MediaRecorder, up to 2 MB). -> text ('' if nothing was heard) */
  async stt(audioBlob) {
    const payload = { audio: await blobToBase64(audioBlob), audioType: (audioBlob && audioBlob.type) || 'audio/webm' };
    return (await post('/api/stt', payload, { timeoutMs: 45000 })).text || '';
  },

  /** Ask the guide a question. -> { reply, audio_url } (audio_url is null: pass reply to tts() to hear it) */
  async guide(question, topic) {
    const answer = await post('/api/guide', { room: room(), question, topic: topic || undefined });
    return { reply: answer.reply, audio_url: answer.audio_url || null };
  },

  /** -> { ok, db, has: { anthropic, elevenlabs, fal, blob } } */
  async health() {
    return get('/api/health', { timeoutMs: 15000 });
  },

  /**
   * Calls onGift(gift) once for each ready gift in the current room, oldest first, and keeps watching.
   * Returns stop(). Options:
   *   intervalMs  time between checks (default 2500)
   *   after       only gifts with an id above this (default 0 = everything so far);
   *               'latest' = only gifts that arrive from now on
   * It keeps going through network errors (backing off to at most 15 s), slows down while the tab is
   * hidden and checks at once when it is shown again, follows api.setRoom(), never calls onGift twice for
   * the same gift, and also delivers scanned companions that finish building after newer gifts arrived.
   */
  pollGifts(onGift, { intervalMs = 2500, after = 0 } = {}) {
    const every = Math.max(500, Number(intervalMs) || 2500);
    const doc = globalThis.document;
    const fromNow = after === 'latest';
    const seen = new Set(); // ids already handed to onGift
    const awaited = new Set(); // ids seen while still being built (scans): delivered whenever they finish
    let cursor = fromNow ? null : Math.max(0, Number(after) || 0); // highest id dealt with; null = not known yet
    let floor = cursor || 0; // ids at or below this were there before we started
    let lookback = null; // while a scan is being built: ask again from just below it
    const watchKey = () => room() + '|' + (profile() ?? '');
    let watching = watchKey();
    let stopped = false;
    let busy = false;
    let timer = null;
    let failures = 0;

    const hidden = () => Boolean(doc && doc.visibilityState === 'hidden');

    function schedule(delay) {
      if (stopped) return;
      clearTimeout(timer);
      timer = setTimeout(tick, delay);
    }

    function deliver(data) {
      const gifts = Array.isArray(data.gifts) ? data.gifts : [];
      for (const gift of gifts) {
        if (stopped) break;
        if (!gift || typeof gift.id !== 'number') continue;
        if (gift.id > cursor) cursor = gift.id;
        if (seen.has(gift.id) || (gift.id <= floor && !awaited.has(gift.id))) continue;
        seen.add(gift.id);
        try {
          onGift(gift);
        } catch (err) {
          console.error('[wishworld] onGift failed', err);
        }
      }
      const pending = Array.isArray(data.pending) ? data.pending.filter((id) => typeof id === 'number') : [];
      for (const id of pending) awaited.add(id);
      lookback = pending.length ? Math.min(...pending) - 1 : null;
      return gifts.length >= 50; // a full page: there may be more waiting
    }

    async function tick() {
      if (stopped || busy) return;
      busy = true;
      let more = false;
      try {
        if (watchKey() !== watching) {
          // The page switched rooms or profiles: start again.
          watching = watchKey();
          seen.clear();
          awaited.clear();
          cursor = fromNow ? null : 0;
          floor = 0;
          lookback = null;
        }
        const asked = watching;
        const askedRoom = room(), askedProfile = profile() ?? undefined;
        const ask = (from) => get('/api/gifts?' + query({ room: askedRoom, after: from, profile: askedProfile }));
        const current = () => !stopped && watchKey() === asked;

        if (cursor === null) {
          const now = await ask(999999999999); // nothing comes back; we only want `latest`
          if (!current()) return;
          cursor = floor = Number(now.latest) || 0;
          deliver(now);
        }
        const from = lookback !== null ? Math.min(cursor, lookback) : cursor;
        const lookedBack = from < cursor;
        more = deliver(await ask(from));
        if (!current()) return;
        if (lookedBack && more) more = deliver(await ask(cursor)); // the look back filled the page: also look ahead
        failures = 0;
      } catch {
        failures += 1; // offline, or the server hiccupped: try again, a little later each time
      } finally {
        busy = false;
        if (!stopped) {
          const wait = failures ? Math.min(15000, every * 2 ** Math.min(failures, 4)) : more ? 250 : every;
          schedule(hidden() ? Math.max(wait, 10000) : wait);
        }
      }
    }

    function onVisible() {
      if (!stopped && !hidden()) schedule(0);
    }

    if (doc && doc.addEventListener) doc.addEventListener('visibilitychange', onVisible);
    if (globalThis.addEventListener) globalThis.addEventListener('online', onVisible);
    schedule(0);

    return function stop() {
      stopped = true;
      clearTimeout(timer);
      if (doc && doc.removeEventListener) doc.removeEventListener('visibilitychange', onVisible);
      if (globalThis.removeEventListener) globalThis.removeEventListener('online', onVisible);
    };
  },
};

export default api;
