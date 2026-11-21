// Stand-in for /shared/api.js, used only when that file cannot be loaded.
// It follows docs/CONTRACT.md route by route so the phone app keeps working on its own.

const PRODUCTION = "https://wishworld-web.netlify.app";
const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || location.protocol === "file:";
const base = isLocal ? PRODUCTION : "";

let currentRoom = null;

function clean(code) {
  const c = String(code || "").trim().toUpperCase();
  return /^[A-Z0-9]{3,8}$/.test(c) ? c : "";
}

function room() {
  if (currentRoom) return currentRoom;
  let code = "";
  try { code = clean(new URLSearchParams(location.search).get("room")); } catch { /* ignored */ }
  if (!code) { try { code = clean(localStorage.getItem("wishworld.room")); } catch { /* ignored */ } }
  currentRoom = code || "WISH";
  try { localStorage.setItem("wishworld.room", currentRoom); } catch { /* ignored */ }
  return currentRoom;
}

function setRoom(code) {
  const c = clean(code);
  if (!c) throw new Error("A room code is 3 to 8 letters or numbers.");
  currentRoom = c;
  try { localStorage.setItem("wishworld.room", currentRoom); } catch { /* ignored */ }
  return currentRoom;
}

async function call(path, { method = "GET", body } = {}) {
  let res;
  try {
    res = await fetch(base + path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("We could not reach WishWorld. Check the connection and try again.");
  }
  let data = null;
  try { data = await res.json(); } catch { /* not JSON */ }
  if (!res.ok) throw new Error((data && data.error) || `WishWorld had a problem (${res.status}). Please try again.`);
  return data || {};
}

function toBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] || "");
    r.onerror = () => reject(new Error("That file could not be read."));
    r.readAsDataURL(blob);
  });
}

const q = (v) => encodeURIComponent(v);

export const api = {
  base,
  room,
  setRoom,
  createRoom: (childName) => call("/api/rooms", { method: "POST", body: { childName } }),
  sendWish: async ({ sender, text }) => (await call("/api/wish", { method: "POST", body: { room: room(), sender, text } })).gift,
  sendLetter: async ({ sender, text, audioBlob }) => {
    const body = { room: room(), sender, text };
    if (audioBlob) { body.audio = await toBase64(audioBlob); body.audioType = audioBlob.type || "audio/webm"; }
    return (await call("/api/letter", { method: "POST", body })).gift;
  },
  startScan: async ({ sender, imageBlob, imageBlobs }) => {
    const blobs = Array.isArray(imageBlobs) && imageBlobs.length ? imageBlobs : [imageBlob];
    const body = { room: room(), sender, image: await toBase64(blobs[0]), imageType: blobs[0].type || "image/jpeg" };
    if (blobs.length > 1) body.images = await Promise.all(blobs.map((b) => toBase64(b)));
    return (await call("/api/scan", { method: "POST", body })).gift;
  },
  scanStatus: async (id) => (await call(`/api/scan-status?id=${q(id)}`)).gift,
  getGifts: (after = 0) => call(`/api/gifts?room=${q(room())}&after=${q(after || 0)}`),
  openGift: async (id) => (await call("/api/gifts/open", { method: "POST", body: { room: room(), id } })).gift,
  logEvent: async (type, detail) => {
    try { return await call("/api/events", { method: "POST", body: { room: room(), type, detail } }); } catch { return { ok: false }; }
  },
  getInbox: () => call(`/api/inbox?room=${q(room())}`),
  tts: async (text) => (await call("/api/tts", { method: "POST", body: { text } })).url,
  stt: async (audioBlob) => (await call("/api/stt", { method: "POST", body: { audio: await toBase64(audioBlob), audioType: audioBlob.type } })).text,
  guide: (question, topic) => call("/api/guide", { method: "POST", body: { room: room(), question, topic } }),
  health: () => call("/api/health"),
  pollGifts(onGift, { intervalMs = 2500, after = 0 } = {}) {
    let last = after || 0, stopped = false, timer = null;
    const tick = async () => {
      if (stopped) return;
      try {
        const { gifts = [], latest } = await api.getGifts(last);
        for (const g of gifts) { if (stopped) return; if (g.id > last) last = g.id; onGift(g); }
        if (latest > last) last = latest;
      } catch { /* try again on the next tick */ }
      if (!stopped) timer = setTimeout(tick, intervalMs);
    };
    tick();
    return () => { stopped = true; clearTimeout(timer); };
  },
};
