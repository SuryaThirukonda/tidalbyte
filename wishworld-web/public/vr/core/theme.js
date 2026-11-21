// The WishWorld look: the Unity theme's colours and fonts (Assets/WishWorld/Resources/WWTheme.asset,
// docs/UNITY_PARITY.md section 4). /shared/creatures.js may carry the same values as THEME; when it
// does they win, so the two builds cannot drift apart.

/** Colours as sRGB [r, g, b] in 0..1, exactly the Unity inspector numbers. */
export const colors = {
  sky: [0.72, 0.80, 0.88],
  snow: [0.95, 0.97, 0.99],
  slate: [0.20, 0.25, 0.32],
  peach: [1.00, 0.72, 0.55],
  panel: [0.93, 0.95, 0.97],
  button: [0.82, 0.88, 0.94],
  ice: [0.56, 0.69, 0.83],
  ribbon: [0.27, 0.38, 0.55],
  shade: [0.47, 0.55, 0.66],
  // fixed colours from WWUI.Styles.cs and the builder
  snowWhite: [0.985, 0.99, 1.0],
  snowUnder: [0.76, 0.84, 0.93],
  frostBlue: [0.80, 0.87, 0.95],
  halo: [1.0, 0.93, 0.70],
  white: [0.98, 0.98, 0.98],
  black: [0.08, 0.08, 0.10],
  snowShade: [0.84, 0.89, 0.95],
  shadowSnow: [0.72, 0.79, 0.90],
  navy: [0.22, 0.29, 0.40],
};

/** The four font roles of the Unity UI (WWFont). `scale` is how much larger Unity draws that face. */
export const fonts = {
  title: { family: 'WW Title', file: '/fonts/MountainsofChristmas-Bold.ttf', weight: '700', scale: 1.22, fallback: 'Georgia, "Times New Roman", serif' },
  heading: { family: 'WW Heading', file: '/fonts/BerkshireSwash-Regular.ttf', weight: '400', scale: 1.0, fallback: 'Georgia, "Times New Roman", serif' },
  body: { family: 'WW Body', file: '/fonts/Almendra-Regular.ttf', weight: '400', scale: 1.08, fallback: 'Georgia, "Times New Roman", serif' },
  plain: { family: 'WW Plain', file: '/fonts/LiberationSans.ttf', weight: '400', scale: 1.0, fallback: 'Arial, Helvetica, sans-serif' },
};

/** Any colour description -> sRGB [r, g, b] in 0..1. */
export function rgb(c, fallback = colors.slate) {
  if (Array.isArray(c) && c.length >= 3) return c;
  if (typeof c === 'number') return [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
  if (typeof c === 'string') {
    const named = colors[c];
    if (named) return named;
    let m = /^#([0-9a-f]{6})$/i.exec(c.trim());
    if (m) return rgb(parseInt(m[1], 16));
    m = /^#([0-9a-f]{3})$/i.exec(c.trim());
    if (m) return m[1].split('').map((h) => parseInt(h + h, 16) / 255);
    m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(c.trim());
    if (m) return [Number(m[1]) / 255, Number(m[2]) / 255, Number(m[3]) / 255];
    return fallback;
  }
  if (c && typeof c === 'object') {
    if (c.isColor) {
      // THREE.Color holds linear values: back to sRGB.
      const f = (x) => (x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
      return [f(c.r), f(c.g), f(c.b)];
    }
    if ('r' in c && 'g' in c && 'b' in c) return [c.r, c.g, c.b];
  }
  return fallback;
}

export function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

export function css(c, alpha = 1) {
  const v = rgb(c);
  const n = (x) => Math.max(0, Math.min(255, Math.round(x * 255)));
  return alpha >= 1 ? `rgb(${n(v[0])},${n(v[1])},${n(v[2])})` : `rgba(${n(v[0])},${n(v[1])},${n(v[2])},${alpha})`;
}

/** sRGB [r,g,b] -> 0xRRGGBB. */
export function hex(c) {
  const v = rgb(c);
  const n = (x) => Math.max(0, Math.min(255, Math.round(x * 255)));
  return (n(v[0]) << 16) | (n(v[1]) << 8) | n(v[2]);
}

/** Take over colours and font files from /shared/creatures.js THEME, whatever shape it has. */
export function adoptTheme(theme) {
  if (!theme || typeof theme !== 'object') return;
  const palette = theme.colors || theme.colours || theme.palette || theme;
  for (const key of Object.keys(colors)) {
    const v = palette[key];
    if (v !== undefined && v !== null && typeof v !== 'object' || Array.isArray(v)) colors[key] = rgb(v, colors[key]);
  }
  const extra = theme.extra;
  if (extra && typeof extra === 'object') {
    for (const key of Object.keys(extra)) {
      const mine = key === 'hoverGlow' ? 'halo' : key;
      if (colors[mine] && typeof extra[key] === 'string') colors[mine] = rgb(extra[key], colors[mine]);
    }
  }
  const f = theme.fonts;
  if (f && typeof f === 'object') {
    for (const role of Object.keys(fonts)) {
      const entry = f[role];
      if (!entry) continue;
      if (typeof entry === 'string') { if (/\.(ttf|otf|woff2?)$/i.test(entry)) fonts[role].file = entry; }
      else if (typeof entry === 'object') {
        const file = entry.file || entry.url || entry.src;
        if (file) fonts[role].file = file;
        if (entry.weight) fonts[role].weight = String(entry.weight);
        if (Number(entry.scale) > 0) fonts[role].scale = Number(entry.scale);
      }
    }
  }
}

let fontsReady = null;
/**
 * Load the game's three fonts with FontFace so canvases can draw with them. Resolves when every font has
 * loaded or failed; a font that fails simply falls back to a serif face. Never rejects.
 */
export function loadFonts(timeoutMs = 4000) {
  if (fontsReady) return fontsReady;
  const jobs = [];
  if (typeof FontFace === 'function' && typeof document !== 'undefined' && document.fonts) {
    for (const role of Object.keys(fonts)) {
      const f = fonts[role];
      if (!f.file) continue;
      const face = new FontFace(f.family, `url(${f.file})`, { weight: f.weight, style: 'normal' });
      jobs.push(face.load().then((loaded) => { document.fonts.add(loaded); f.loaded = true; })
        .catch(() => { f.loaded = false; console.warn('[wishworld] font not available, using a fallback:', f.file); }));
    }
  }
  const all = Promise.all(jobs).then(() => true);
  fontsReady = Promise.race([all, new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs))]);
  return fontsReady;
}

/** The CSS font string for a role at a pixel size. */
export function fontCss(role, px) {
  const f = fonts[role] || fonts.body;
  const family = f.loaded ? `"${f.family}", ${f.fallback}` : f.fallback;
  return `${f.loaded ? f.weight : (role === 'title' ? '700' : '400')} ${Math.max(4, px).toFixed(1)}px ${family}`;
}
