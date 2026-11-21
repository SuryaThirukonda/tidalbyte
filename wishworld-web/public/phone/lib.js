// Small helpers shared by the landing page and the phone tabs. No dependencies.

/** Build an element: h("div", { class: "x", onclick: fn }, child, "text", ...). Strings become text nodes (never HTML). */
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "html") el.innerHTML = v;                 // only ever used with our own static markup (icons)
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, String(v));
    }
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** Replace an element's children, skipping null / false (replaceChildren would print "null"). */
export function fill(el, ...children) {
  el.replaceChildren(...children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false));
  return el;
}

const ICONS = {
  send: '<path d="M12 3l2.2 5.3L20 9l-4.4 3.8L17 19l-5-3.1L7 19l1.4-6.2L4 9l5.8-.7z"/>',
  scan: '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7H8l1.4-2h5.2L16 7h2.5A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="13" r="3.4"/>',
  letter: '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="M4 7l8 6.5L20 7"/>',
  inbox: '<path d="M12 20s-7-4.4-7-9.6A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 2.4C19 15.6 12 20 12 20z"/>',
  ar: '<path d="M12 3l7.5 4.2v9.6L12 21l-7.5-4.2V7.2z"/><path d="M4.5 7.2L12 11.5l7.5-4.3M12 11.5V21"/>',
  camera: '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7H8l1.4-2h5.2L16 7h2.5A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="13" r="3.4"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.7"/><path d="M4 17l5-4.5 3.5 3 3-2.5L20 17"/>',
  mic: '<rect x="9" y="3.5" width="6" height="10.5" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3"/>',
  stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2"/>',
  redo: '<path d="M5 12a7 7 0 1 0 2.3-5.2"/><path d="M5 4.5v4.2h4.2"/>',
  trash: '<path d="M5 7h14M9.5 7V4.5h5V7M7 7l.800 12.5h8.4L17 7"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  warn: '<path d="M12 4l9 15.5H3z"/><path d="M12 10v4.5M12 17.2v.300"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.7v.300"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  shuffle: '<path d="M4 7h3.5l8 10H20M4 17h3.5l2.3-2.9M13.2 9.9L15.5 7H20"/><path d="M17.5 4.5L20 7l-2.5 2.5M17.5 14.5L20 17l-2.5 2.5"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c3 3.2 3 13.8 0 17M12 3.5c-3 3.2-3 13.8 0 17"/>',
  book: '<path d="M4.5 5.5h5.5a2 2 0 0 1 2 2V19a2 2 0 0 0-2-1.5H4.5zM19.5 5.5H14a2 2 0 0 0-2 2V19a2 2 0 0 1 2-1.5h5.5z"/>',
  wind: '<path d="M3.5 9.5h10a2.5 2.5 0 1 0-2.5-2.5M3.5 14h14a2.5 2.5 0 1 1-2.5 2.5M3.5 18.5h6"/>',
  map: '<path d="M12 21s6-6 6-10.5a6 6 0 0 0-12 0C6 15 12 21 12 21z"/><circle cx="12" cy="10.5" r="2.2"/>',
  gift: '<rect x="4" y="10" width="16" height="10" rx="1.5"/><path d="M3 7h18v3H3zM12 7v13M12 7s-1-3.5-3.5-3.5S6 7 12 7zm0 0s1-3.5 3.5-3.5S18 7 12 7z"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
  headset: '<path d="M3.5 10.5A2.5 2.5 0 0 1 6 8h12a2.5 2.5 0 0 1 2.5 2.5v4A2.5 2.5 0 0 1 18 17h-2.2a2 2 0 0 1-1.7-.900l-.600-.900a1.8 1.8 0 0 0-3 0l-.600.9a2 2 0 0 1-1.7.900H6a2.5 2.5 0 0 1-2.5-2.5z"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z"/>',
  sound: '<path d="M4.5 9.5v5h3.5l4.5 3.5v-12L8 9.5zM15.5 9a4 4 0 0 1 0 6M17.8 6.5a7.5 7.5 0 0 1 0 11"/>',
  sun: '<circle cx="12" cy="12" r="3.8"/><path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M5.6 18.4l1.6-1.6M16.8 7.2l1.6-1.6"/>',
  one: '<path d="M12 3.5l7 4v9l-7 4-7-4v-9z"/>',
  plain: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 15.5h16"/>',
};

/** Inline SVG markup for a named line icon (our own static strings). */
export function icon(name) {
  const body = ICONS[name] || ICONS.info;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}
export function iconEl(name, cls) {
  const s = h("span", { class: "ico" + (cls ? " " + cls : ""), html: icon(name) });
  return s;
}

/** localStorage that never throws (private mode, blocked storage). */
export const store = {
  get(key, fallback = null) {
    try { const v = localStorage.getItem(key); return v === null ? fallback : v; } catch { return fallback; }
  },
  set(key, value) {
    try { if (value === null || value === undefined) localStorage.removeItem(key); else localStorage.setItem(key, String(value)); } catch { /* ignored */ }
  },
  getJSON(key, fallback = null) {
    try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  setJSON(key, value) { this.set(key, value === null || value === undefined ? null : JSON.stringify(value)); },
};

export function cleanRoomCode(raw) {
  return String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

/** "just now", "5 minutes ago", "yesterday", "3 days ago". */
export function timeAgo(value, now = Date.now()) {
  const t = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 2) return "a minute ago";
  if (m < 60) return `${m} minutes ago`;
  const hrs = Math.round(m / 60);
  if (hrs < 2) return "an hour ago";
  if (hrs < 24) return `${hrs} hours ago`;
  const d = Math.round(hrs / 24);
  if (d < 2) return "yesterday";
  if (d < 14) return `${d} days ago`;
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function clock(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function errorText(err, fallback = "Something went wrong.") {
  const msg = err && typeof err.message === "string" ? err.message.trim() : "";
  if (!msg) return fallback;
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) return "We could not reach WishWorld. Check the connection.";
  return msg.length > 160 ? msg.slice(0, 157) + "..." : msg;
}

/**
 * A scanned companion's name and what it is. The server stores them in the gift's `wish` as "<name>, <what>",
 * for example "Honey, a golden teddy bear". Either part is "" when it is missing.
 */
export function companion(gift) {
  const raw = gift && typeof gift.wish === "string" ? gift.wish.trim() : "";
  const cut = raw.indexOf(", ");
  const name = (cut > 0 ? raw.slice(0, cut) : raw).trim();
  const what = cut > 0 ? raw.slice(cut + 2).trim() : "";
  return {
    name: name && name.length <= 28 ? name : "",
    what: what.length <= 60 ? what : "",                                   // "a golden teddy bear"
    bare: what.length <= 60 ? what.replace(/^(a|an|the)\s+/i, "") : "",    // "golden teddy bear"
  };
}
export function companionName(gift) { return companion(gift).name; }

/** Load /shared/api.js; if it is missing or broken, use the small contract client in this folder so the app still works. */
let apiPromise = null;
export function loadApi() {
  if (!apiPromise) {
    apiPromise = import("/shared/api.js")
      .then((m) => {
        if (!m || !m.api) throw new Error("no api export");
        return m.api;
      })
      .catch(async (err) => {
        console.warn("[phone] /shared/api.js could not be loaded, using the built-in client:", err && err.message);
        const m = await import("/phone/api-fallback.js");
        return m.api;
      });
  }
  return apiPromise;
}

// ---------------------------------------------------------------------------------------------------- creatures

// Used only for what /shared/creatures.js does not provide (emoji, tint) or when that file is missing.
const LOCAL = {
  astronaut: ["Astronaut", "🧑‍🚀", "#dfe6ee", "Astronauts in orbit float because they are falling around the Earth all the time."],
  balloon: ["Hot-Air Balloon", "🎈", "#ffd3c2", "Hot air is lighter than cool air. That is what lifts a hot-air balloon."],
  bird: ["Bird", "🐦", "#cfe5f7", "Many birds have hollow bones, which helps them fly."],
  butterfly: ["Butterfly", "🦋", "#d9e4ff", "Butterflies taste with their feet."],
  chicken: ["Chicken", "🐔", "#fff0d2", "Chickens are living relatives of the dinosaurs."],
  clownfish: ["Clownfish", "🐠", "#ffd9bd", "Clownfish live safely among the stinging arms of sea anemones."],
  comet: ["Comet", "☄️", "#dbe7f5", "A comet is a ball of ice and dust. Its tail always points away from the Sun."],
  cow: ["Cow", "🐮", "#efe9e2", "A cow's stomach has four parts."],
  earth: ["Earth", "🌍", "#cfe8f3", "More than two thirds of the Earth is covered by ocean."],
  elephant: ["Elephant", "🐘", "#dfe3ea", "An elephant's trunk has no bones in it. It is all muscle."],
  flamingo: ["Flamingo", "🦩", "#ffd6e2", "Flamingos are pink because of the food they eat."],
  frog: ["Tree Frog", "🐸", "#d6f0d0", "Some frogs wear bright colours to warn that they are poisonous."],
  giraffe: ["Giraffe", "🦒", "#ffe9bf", "A giraffe's long neck has seven bones, the same number as your neck."],
  horse: ["Horse", "🐴", "#ecdccb", "Horses can sleep standing up."],
  jellyfish: ["Jellyfish", "🪼", "#ecd9f7", "Jellyfish have no brain, no heart and no bones."],
  kite: ["Kite", "🪁", "#ffe0d0", "Kites were invented in China more than two thousand years ago."],
  lion: ["Lion", "🦁", "#ffe6b8", "A lion's roar can be heard from several kilometres away."],
  monkey: ["Monkey", "🐒", "#ecdccb", "Some monkeys can hang from a branch by their tails."],
  parrot: ["Parrot", "🦜", "#d5f0d6", "Parrots can copy sounds, even human words."],
  penguin: ["Penguin", "🐧", "#d6e3f2", "Penguins live in the south and polar bears in the north, so they never meet."],
  pig: ["Pig", "🐷", "#ffdfe3", "Pigs roll in mud to cool down, because they can hardly sweat."],
  plane: ["Plane", "✈️", "#dbe7f5", "A plane's wings are shaped so that the air rushing past pushes them up."],
  polarbear: ["Polar Bear", "🐻‍❄️", "#eef4fa", "Under its white fur, a polar bear's skin is black."],
  pterosaur: ["Pterosaur", "🦅", "#e5dccd", "Pterosaurs were flying reptiles. They were not dinosaurs."],
  ray: ["Ray", "🐟", "#cfe0f2", "Rays swim by flapping their wide fins like wings."],
  rocket: ["Rocket", "🚀", "#ffd9d0", "To stay in orbit, a rocket has to reach about 28,000 kilometres an hour."],
  satellite: ["Satellite", "🛰️", "#dfe6ee", "Satellites circle the Earth. Some help phones and maps know where you are."],
  saturn: ["Saturn", "🪐", "#f6e7c6", "Saturn's rings are made mostly of pieces of ice."],
  seal: ["Seal", "🦭", "#dfe6ee", "Seals have a thick layer of fat called blubber that keeps them warm."],
  shark: ["Shark", "🦈", "#cfdcec", "A shark has no bones. Its skeleton is made of bendy cartilage."],
  sheep: ["Sheep", "🐑", "#f3efe8", "A sheep's wool never stops growing."],
  sloth: ["Sloth", "🦥", "#e8dccb", "Sloths move so slowly that green algae grows in their fur."],
  snowyowl: ["Snowy Owl", "🦉", "#f1f4f8", "Unlike most owls, snowy owls often hunt in the daytime."],
  stegosaurus: ["Stegosaurus", "🦕", "#d9ecd0", "Stegosaurus had two rows of bony plates along its back."],
  trex: ["T. rex", "🦖", "#d9ecd0", "T. rex lived closer in time to you than to Stegosaurus."],
  triceratops: ["Triceratops", "🦏", "#e6e0d2", "The name Triceratops means three-horned face."],
  turtle: ["Sea Turtle", "🐢", "#cfeeda", "Sea turtles swim back to the beach where they hatched to lay their own eggs."],
  venus: ["Venus", "🌕", "#f9e6c0", "A day on Venus is longer than its year."],
  whale: ["Blue Whale", "🐳", "#cfe0f5", "The blue whale is the largest animal that has ever lived."],
  zebra: ["Zebra", "🦓", "#eceff3", "Every zebra has its own stripe pattern. No two are the same."],
};

let shared = null;           // { byId: Map, list: [], theme, worlds }
let sharedPromise = null;

function toCssColor(c) {
  if (typeof c === "number" && Number.isFinite(c)) return "#" + (c & 0xffffff).toString(16).padStart(6, "0");
  if (typeof c === "string" && c) return c;
  if (Array.isArray(c) && c.length >= 3) {
    const f = c.every((x) => x <= 1) ? 255 : 1;
    return `rgb(${Math.round(c[0] * f)}, ${Math.round(c[1] * f)}, ${Math.round(c[2] * f)})`;
  }
  return null;
}

/** Load /shared/creatures.js once (tolerates it being absent). Resolves to { list, theme, worlds }. */
export function loadCreatures() {
  if (!sharedPromise) {
    sharedPromise = import("/shared/creatures.js")
      .then((m) => {
        const raw = m.CREATURES || {};
        const arr = Array.isArray(raw) ? raw : Object.entries(raw).map(([id, c]) => ({ id, ...c }));
        const byId = new Map();
        for (const c of arr) if (c && c.id) byId.set(String(c.id), c);
        const worldsRaw = m.WORLDS || [];
        const worlds = Array.isArray(worldsRaw) ? worldsRaw : Object.entries(worldsRaw).map(([id, w]) => ({ id, ...w }));
        shared = { byId, list: arr, theme: m.THEME || null, worlds };
        return shared;
      })
      .catch((err) => {
        console.warn("[phone] /shared/creatures.js could not be loaded, using the built-in list:", err && err.message);
        shared = { byId: new Map(), list: [], theme: null, worlds: [] };
        return shared;
      });
  }
  return sharedPromise;
}

/** Everything the phone needs to show a creature. Works for unknown ids too. */
export function creatureInfo(id) {
  const key = String(id || "").toLowerCase();
  const s = shared && shared.byId.get(key);
  const l = LOCAL[key];
  const pretty = key ? key.charAt(0).toUpperCase() + key.slice(1) : "Friend";
  return {
    id: key,
    known: Boolean(s || l),
    raw: s || null,
    name: (s && (s.name || s.displayName || s.label)) || (l && l[0]) || pretty,
    emoji: (s && s.emoji) || (l && l[1]) || "✨",
    tint: (l && l[2]) || "#dce8f5",
    color: (s && toCssColor(s.color || s.colour || s.tint)) || null,
    fact: (s && s.fact) || (l && l[3]) || "",
    size: s && Number(s.size) > 0 ? Number(s.size) : null,
  };
}

const PROPER = new Set(["saturn", "venus", "earth", "trex"]);     // names that keep their capital letter mid-sentence
const NO_ARTICLE = new Set(["saturn", "venus", "earth"]);

/** A creature's name for the middle of a sentence: "sea turtle", "T. rex", "Saturn". */
export function plainName(info) {
  return PROPER.has(info.id) ? info.name : String(info.name || "friend").toLowerCase();
}
/** The same with "the" where English wants it: "the sea turtle", "Saturn". */
export function theName(info) {
  return NO_ARTICLE.has(info.id) ? info.name : "the " + plainName(info);
}

export function allCreatureIds() {
  if (shared && shared.list.length) return shared.list.map((c) => String(c.id));
  return Object.keys(LOCAL);
}

export function worldName(id) {
  const key = String(id || "");
  const w = shared && shared.worlds.find((x) => String(x.id) === key);
  if (w && (w.name || w.displayName || w.title)) return w.name || w.displayName || w.title;
  if (!key) return "";
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/** Round picture for a creature: /models/thumbs/<id>.png, falling back to its emoji on a tinted circle. */
export function thumb(id, size = 96) {
  const info = creatureInfo(id);
  const wrap = h("span", { class: "thumb", role: "img", "aria-label": info.name });
  wrap.style.setProperty("--size", size + "px");
  wrap.style.setProperty("--tint", info.tint);
  const emoji = h("span", { class: "emoji", "aria-hidden": "true" }, info.emoji);
  wrap.append(emoji);
  if (info.id && /^[a-z0-9_-]+$/.test(info.id)) {
    const img = new Image();
    img.alt = "";
    img.decoding = "async";
    img.onload = () => { if (img.naturalWidth > 0) { emoji.remove(); wrap.append(img); } };
    img.onerror = () => { /* keep the emoji */ };
    img.src = `/models/thumbs/${info.id}.png`;
  }
  return wrap;
}

/** Copy theme colours from /shared/creatures.js THEME onto the CSS variables, when they are plain colour strings. */
export function applyTheme(theme) {
  if (!theme || typeof theme !== "object") return;
  const root = document.documentElement;
  const colors = theme.colors && typeof theme.colors === "object" ? theme.colors : theme;
  for (const key of ["sky", "snow", "slate", "peach", "panel", "button", "ice", "ribbon", "shade"]) {
    const v = toCssColor(colors[key]);
    if (v && /^(#[0-9a-f]{3,8}|rgb)/i.test(v)) root.style.setProperty("--" + key, v);
  }
}

/** Shrink a photo to at most maxSide px on the long side and return a JPEG blob (kept well under 1 MB). */
export async function shrinkToJpeg(fileOrBlob, maxSide = 1024, quality = 0.85) {
  const url = URL.createObjectURL(fileOrBlob);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error("That photo could not be read. Try taking a new one."));
      img.src = url;
    });
    const w0 = img.naturalWidth, h0 = img.naturalHeight;
    if (!w0 || !h0) throw new Error("That photo could not be read. Try taking a new one.");
    let side = maxSide, q = quality, blob = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      const scale = Math.min(1, side / Math.max(w0, h0));
      const w = Math.max(1, Math.round(w0 * scale)), hh = Math.max(1, Math.round(h0 * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = hh;
      const g = canvas.getContext("2d");
      g.fillStyle = "#fff";                      // transparent PNGs get a white background
      g.fillRect(0, 0, w, hh);
      g.drawImage(img, 0, 0, w, hh);
      blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", q));
      if (!blob) throw new Error("That photo could not be prepared. Try a different one.");
      if (blob.size <= 900 * 1024) return { blob, width: w, height: hh };
      side = Math.round(side * 0.8); q = Math.max(0.6, q - 0.1);
    }
    return { blob, width: 0, height: 0 };
  } finally {
    URL.revokeObjectURL(url);
  }
}
