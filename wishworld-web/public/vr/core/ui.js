// The WishWorld UI kit: the Unity game's snowy cards, pill buttons, ribbons and caption bubbles
// (Scripts/Core/WWUI.cs, WWUI.Styles.cs, WWButton.cs, PopIn.cs), drawn to canvas textures.
//
// Unity builds every panel from flat vertex-coloured shapes; here the same shapes are painted, in the
// same order and with the same measurements, onto a canvas that becomes one textured quad (one draw call
// per panel, text included). Panels are unlit, unfogged and double sided like Unity's UI material.
// All sizes are metres. A panel faces +Z (towards a viewer who looks down -Z at it).

import * as THREE from 'three';
import { colors, fonts, rgb, mix, css, fontCss } from './theme.js';
import { seededRandom } from '/shared/movement.js';

const DEFAULT_PPM = 1200;          // canvas pixels per metre: crisp at arm's length, small enough to upload fast
const MAX_CANVAS = 2048;
const WHITE = [1, 1, 1], BLACK = [0, 0, 0];

// ------------------------------------------------------------------------------------------ painting

function roundedPath(g, w, h, r, ox = 0, oy = 0) {
  r = Math.max(0.0005, Math.min(r, Math.min(w, h) * 0.5));
  const x0 = ox - w / 2, x1 = ox + w / 2, y0 = oy - h / 2, y1 = oy + h / 2;
  g.beginPath();
  g.moveTo(x0 + r, y0);
  g.lineTo(x1 - r, y0); g.arcTo(x1, y0, x1, y0 + r, r);
  g.lineTo(x1, y1 - r); g.arcTo(x1, y1, x1 - r, y1, r);
  g.lineTo(x0 + r, y1); g.arcTo(x0, y1, x0, y1 - r, r);
  g.lineTo(x0, y0 + r); g.arcTo(x0, y0, x0 + r, y0, r);
  g.closePath();
}

const lin = (x) => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));
const srgb = (x) => (x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);

// Top-to-bottom shading. Unity blends vertex colours in linear light, so the middle stop is worked out
// there; a plain canvas gradient would come out a little darker halfway down.
function shadeStyle(g, top, bottom, yTop, yBottom) {
  if (!bottom) return css(top);
  const grad = g.createLinearGradient(0, yTop, 0, yBottom);
  grad.addColorStop(0, css(top));
  grad.addColorStop(0.5, css([0, 1, 2].map((i) => srgb((lin(top[i]) + lin(bottom[i])) / 2))));
  grad.addColorStop(1, css(bottom));
  return grad;
}

function rounded(g, w, h, r, top, bottom = null, ox = 0, oy = 0) {
  if (w <= 0 || h <= 0) return;
  roundedPath(g, w, h, r, ox, oy);
  g.fillStyle = shadeStyle(g, top, bottom, oy + h / 2, oy - h / 2);
  g.fill();
}

function poly(g, pts, color) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
  g.fillStyle = typeof color === 'string' || color instanceof CanvasGradient ? color : css(color);
  g.fill();
}

function line(g, a, b, thickness, color) {
  g.beginPath();
  g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]);
  g.lineWidth = thickness; g.lineCap = 'square'; g.strokeStyle = css(color);
  g.stroke();
}

function ellipse(g, cx, cy, rx, ry, color) {
  g.beginPath();
  g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  g.fillStyle = css(color);
  g.fill();
}

function snowflake(g, cx, cy, radius, color) {
  const th = radius * 0.13;
  for (let i = 0; i < 6; i++) {
    const a = (i * 60 + 30) * Math.PI / 180;
    const dx = Math.cos(a), dy = Math.sin(a);
    line(g, [cx, cy], [cx + dx * radius, cy + dy * radius], th, color);
    const kx = cx + dx * radius * 0.58, ky = cy + dy * radius * 0.58;
    for (const s of [-1, 1]) {
      const b = a + s * 55 * Math.PI / 180;
      line(g, [kx, ky], [kx + Math.cos(b) * radius * 0.34, ky + Math.sin(b) * radius * 0.34], th, color);
    }
  }
  ellipse(g, cx, cy, th * 1.2, th * 1.2, color);
}

function icicles(g, w, h, r, tip, rand) {
  let x = -w / 2 + r * 0.8;
  const x1 = w / 2 - r * 0.8, y = -h / 2 + 0.004;
  while (x < x1) {
    const half = rand(0.006, 0.011);
    if (rand(0, 1) > 0.3) {
      const len = rand(0.016, 0.05);
      const grad = g.createLinearGradient(0, y, 0, y - len);
      grad.addColorStop(0, css(colors.snowWhite)); grad.addColorStop(1, css(tip));
      poly(g, [[x - half, y], [x + half, y], [x + rand(-0.003, 0.003), y - len]], grad);
    }
    x += half * 2 + rand(0.004, 0.03);
  }
}

function snowCap(g, w, h, r, rand) {
  const x0 = -w / 2 + r * 0.45, x1 = w / 2 - r * 0.45, y = h / 2;
  if (x1 - x0 < 0.08) return;
  const mounds = [];
  let x = x0 + 0.01;
  while (x < x1 - 0.02) {
    const bw = Math.min(rand(0.05, 0.10), x1 - x);
    const ry = rand(0.011, 0.021);
    mounds.push([x + bw * 0.5, y - 0.002, bw * 0.58, ry]);
    x += bw * rand(0.72, 0.95);
  }
  rounded(g, x1 - x0, 0.016, 0.008, colors.snowUnder, null, 0, y - 0.006);
  for (const m of mounds) ellipse(g, m[0], m[1] - 0.005, m[2], m[3], colors.snowUnder);
  rounded(g, x1 - x0, 0.016, 0.008, colors.snowWhite, null, 0, y - 0.001);
  for (const m of mounds) ellipse(g, m[0], m[1], m[2], m[3], colors.snowWhite);
}

/** How far each style paints outside its w x h rectangle: [left, right, top, bottom] in metres. */
function margins(style, w, h, border) {
  switch (style) {
    case 'frame': return [0.004, 0.014, 0.028, 0.054];
    case 'pill': return [0.003, 0.003, 0.003, 0.012];
    case 'ribbon': return [h * 0.62 + 0.008, h * 0.62 + 0.008, 0.003, h * 0.2 + 0.008];
    case 'bubble': return [0.004, 0.012, 0.004, 0.075 + Math.max(border, 0.006) * 1.6 + 0.006];
    case 'plate': return [0.004, 0.016, 0.004, 0.02];
    case 'none': return [0, 0, 0, 0];
    default: return [0.003, 0.003, 0.003, 0.003];
  }
}

/** Paint one panel background, centred on the origin, y up, units metres. A port of WWUI.StyledMesh. */
function paintPanel(g, style, w, h, r, border, fill, tail) {
  const { slate, ice, shade, snowWhite, frostBlue } = colors;
  const rand = seededRandom(Math.round(w * 1000) * 31 + Math.round(h * 1000));
  switch (style) {
    case 'none': break;
    case 'plain':
      rounded(g, w, h, r, slate);
      if (border > 0 && w > border * 2 && h > border * 2) rounded(g, w - border * 2, h - border * 2, Math.max(0.001, r - border), fill);
      else rounded(g, w, h, r, fill);
      break;
    case 'frame': {
      const b = Math.max(border, 0.006);
      rounded(g, w, h, r, shade, null, 0.010, -0.013);                     // drop shadow
      rounded(g, w, h, r, slate);                                           // outer line
      icicles(g, w, h, r, ice, rand);
      rounded(g, w - b * 2, h - b * 2, r - b, snowWhite);                   // white band
      const i2 = b + 0.009;
      rounded(g, w - i2 * 2, h - i2 * 2, r - i2, ice);                      // thin inner line
      const i3 = i2 + 0.0028;
      rounded(g, w - i3 * 2, h - i3 * 2, r - i3, mix(fill, WHITE, 0.4), mix(fill, frostBlue, 0.3));
      if (Math.min(w, h) >= 0.3) {                                          // corner snowflakes
        const flake = mix(ice, fill, 0.45), inset = i3 + 0.036, rad = 0.021;
        for (const sx of [-1, 1]) {
          for (let sy = h >= 0.4 ? -1 : 1; sy <= 1; sy += 2) {
            snowflake(g, sx * (w / 2 - inset), sy * (h / 2 - inset), sy > 0 ? rad : rad * 0.8, flake);
          }
        }
      }
      snowCap(g, w, h, r, rand);
      break;
    }
    case 'pill': {
      rounded(g, w, h, r, mix(slate, fill, 0.42), null, 0, -0.008);        // raised edge below
      rounded(g, w, h, r, slate);
      rounded(g, w - border * 2, h - border * 2, r - border, mix(fill, WHITE, 0.5), fill);
      const sh = Math.min(h * 0.11, 0.012), sw = w - border * 2 - r * 1.3;
      if (sw > 0.02) rounded(g, sw, sh, sh * 0.5, mix(fill, WHITE, 0.85), null, 0, h / 2 - border - sh * 1.25);
      break;
    }
    case 'ribbon': {
      const dark = mix(fill, BLACK, 0.22), fold = mix(fill, BLACK, 0.5);
      const drop = h * 0.2, tailLen = h * 0.62, notch = h * 0.3, tuck = 0.03, lw = 0.005;
      for (const s of [-1, 1]) {
        const x0 = s * (w / 2 - tuck), x1 = s * (w / 2 + tailLen);
        const top = h / 2 - drop, bot = -h / 2 - drop, mid = (top + bot) / 2;
        const a = [x0, top], b = [x1, top], n = [x1 - s * notch, mid], d = [x1, bot], e = [x0, bot];
        poly(g, [a, b, n, d, e], dark);
        line(g, a, b, lw, slate); line(g, b, n, lw, slate); line(g, n, d, lw, slate); line(g, d, e, lw, slate);
        poly(g, [[s * w / 2, -h / 2 + 0.002], [x0, -h / 2 + 0.002], [x0, bot]], fold);
      }
      rounded(g, w, h, r, slate);
      rounded(g, w - border * 2, h - border * 2, Math.max(0.001, r - border), mix(fill, WHITE, 0.22), fill);
      const stitch = mix(fill, WHITE, 0.5);
      const sy0 = h / 2 - border - 0.008, sx0 = w / 2 - border - 0.012;
      for (const s of [-1, 1]) {
        for (let x = -sx0; x < sx0 - 0.012; x += 0.026) line(g, [x, s * sy0], [x + 0.012, s * sy0], 0.0022, stitch);
      }
      break;
    }
    case 'bubble': {
      const b = Math.max(border, 0.006);
      rounded(g, w, h, r, shade, null, 0.008, -0.011);
      rounded(g, w, h, r, slate);
      const tx = w * tail, dir = tail < 0 ? -1 : 1, by = -h / 2;
      const p0 = [tx - 0.035, by + b], p1 = [tx + 0.035, by + b], tip = [tx + dir * 0.06, by - 0.075];
      poly(g, [[p0[0] - b * 1.3, p0[1]], [p1[0] + b * 1.3, p1[1]], [tip[0] + dir * b * 0.8, tip[1] - b * 1.6]], slate);
      const low = mix(fill, frostBlue, 0.5);
      rounded(g, w - b * 2, h - b * 2, r - b, snowWhite, low);
      poly(g, [[p0[0], p0[1] + 0.004], [p1[0], p1[1] + 0.004], tip], low);
      const i2 = b + 0.008, lx = w / 2 - i2 - r * 0.6;
      line(g, [-lx, h / 2 - i2], [lx, h / 2 - i2], 0.0025, mix(ice, snowWhite, 0.45));
      break;
    }
    case 'plate': {
      const pr = Math.min(h * 0.42, 0.09), b = Math.min(0.012, Math.max(0.004, h * 0.05));
      rounded(g, w, h, pr, shade, null, b, -b * 1.3);
      rounded(g, w, h, pr, slate);
      rounded(g, w - b * 2, h - b * 2, pr - b, snowWhite);
      rounded(g, w - b * 3.6, h - b * 3.6, pr - b * 1.8, ice);
      rounded(g, w - b * 4.4, h - b * 4.4, pr - b * 2.2, mix(fill, WHITE, 0.55), mix(fill, frostBlue, 0.65));
      break;
    }
    default: rounded(g, w, h, r, fill);
  }
}

// ------------------------------------------------------------------------------------------ text

const measureCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
const measure = measureCanvas ? measureCanvas.getContext('2d') : null;

function wrapLines(g, text, maxWidth, wrap) {
  const out = [];
  for (const para of String(text).split('\n')) {
    if (!wrap) { out.push(para); continue; }
    const words = para.split(/\s+/).filter(Boolean);
    let cur = '';
    for (const word of words) {
      const next = cur ? cur + ' ' + word : word;
      if (cur && g.measureText(next).width > maxWidth) { out.push(cur); cur = word; } else cur = next;
    }
    out.push(cur);
  }
  return out;
}

/**
 * Fit text into a box the way TextMesh Pro does in the game: wrap, shrink down to half size if it does
 * not fit, then cut off what still overflows. Sizes in pixels. -> { lines, px, lineHeight, width }
 */
function layoutText(g, text, role, px, boxW, boxH, { autoSize = true, wrap = true } = {}) {
  const LINE = 1.16;
  let size = px, lines = [], widest = 0;
  for (let step = 0; step <= 10; step++) {
    size = px * (1 - step * 0.05);
    g.font = fontCss(role, size);
    lines = wrapLines(g, text, boxW, wrap);
    widest = 0;
    for (const l of lines) widest = Math.max(widest, g.measureText(l).width);
    if (!autoSize || (widest <= boxW + 0.5 && lines.length * size * LINE <= boxH + 0.5)) break;
  }
  const fit = Math.max(1, Math.floor((boxH + 0.5) / (size * LINE)));
  if (lines.length > fit && boxH > 0) lines = lines.slice(0, fit);
  return { lines, px: size, lineHeight: size * LINE, width: widest };
}

function drawLabel(g, label, ppm, originX, originY) {
  const text = label.text === undefined || label.text === null ? '' : String(label.text);
  if (!text) return;
  const role = label.font || 'body';
  const scale = (fonts[role] || fonts.body).scale || 1;
  const px = (label.size || 0.036) * scale * ppm;
  const boxW = label.w * ppm, boxH = label.h * ppm;
  const lay = layoutText(g, text, role, px, boxW, boxH, label);
  g.font = fontCss(role, lay.px);
  g.fillStyle = css(label.color || colors.slate);
  g.textBaseline = 'alphabetic';
  const m = g.measureText('Hg');
  const asc = m.fontBoundingBoxAscent || m.actualBoundingBoxAscent || lay.px * 0.8;
  const desc = m.fontBoundingBoxDescent || m.actualBoundingBoxDescent || lay.px * 0.2;
  const blockH = lay.lines.length * lay.lineHeight;
  const cx = originX + (label.x || 0) * ppm, cy = originY - (label.y || 0) * ppm;
  const valign = label.valign || 'middle';
  let top = valign === 'top' ? cy - boxH / 2 : valign === 'bottom' ? cy + boxH / 2 - blockH : cy - blockH / 2;
  const align = label.align || 'center';
  g.textAlign = align;
  const tx = align === 'left' ? cx - boxW / 2 : align === 'right' ? cx + boxW / 2 : cx;
  let budget = label.reveal === undefined ? Infinity : label.reveal;   // typing: how many characters to show
  for (const l of lay.lines) {
    if (budget <= 0) break;
    const shown = budget >= l.length ? l : l.slice(0, Math.max(0, Math.floor(budget)));
    budget -= l.length + 1;
    const base = top + (lay.lineHeight - (asc + desc)) / 2 + asc;
    if (align === 'center' && shown.length < l.length) {
      // keep a half-typed centred line where the finished one will be
      g.textAlign = 'left';
      g.fillText(shown, tx - g.measureText(l).width / 2, base);
      g.textAlign = align;
    } else g.fillText(shown, tx, base);
    top += lay.lineHeight;
  }
}

/** Height in metres that `text` needs at a letter size, wrapped to `width`. */
export function measureTextHeight(text, { size = 0.036, font = 'body', width = 0.5 } = {}) {
  if (!measure) return size * 1.2;
  const ppm = 1000;
  const scale = (fonts[font] || fonts.body).scale || 1;
  const lay = layoutText(measure, text || ' ', font, size * scale * ppm, width * ppm, 1e9, { autoSize: false, wrap: true });
  return (lay.lines.length * lay.lineHeight) / ppm;
}

/** Width in metres of one unwrapped line. */
export function measureTextWidth(text, { size = 0.036, font = 'body' } = {}) {
  if (!measure) return String(text).length * size * 0.5;
  const ppm = 1000;
  const scale = (fonts[font] || fonts.body).scale || 1;
  measure.font = fontCss(font, size * scale * ppm);
  return measure.measureText(String(text)).width / ppm;
}

// ------------------------------------------------------------------------------------------ the kit

function isLive(object) {
  for (let o = object; o; o = o.parent) {
    if (!o.visible) return false;
    if (o.isScene) return true;
  }
  return false;
}

function outBack(x) {
  const c1 = 1.70158, c3 = c1 + 1, y = x - 1;
  return 1 + c3 * y * y * y + c1 * y * y;
}

/**
 * Build the kit. `input` registers pointer targets, `audio` plays the hover and click sounds; both are
 * optional so the kit can be used on a page without them.
 */
export function createUI({ input = null, audio = null, renderer = null } = {}) {
  const buttons = new Set();
  const pops = new Set();
  const typers = new Set();
  const haloCache = new Map();
  const maxAniso = renderer ? Math.min(4, renderer.capabilities.getMaxAnisotropy()) : 1;
  let clock = 0;

  /**
   * A panel: background in one of the Unity styles plus any number of text labels, as one textured quad.
   *   width, height   metres (the logical rectangle; snow caps, icicles, tails and shadows hang outside it)
   *   style           'auto' | 'plain' | 'frame' | 'pill' | 'ribbon' | 'bubble' | 'plate' | 'none'
   *   fill            colour of the face (default: theme panel)
   *   radius, border  metres;  tail: where the bubble's tail sits (-0.5 .. 0.5 of the width)
   *   labels          [{ text, size, font: 'body'|'heading'|'title'|'plain', color, x, y, w, h, align, valign, autoSize, wrap }]
   *   ppm             canvas pixels per metre (default 1200)
   * Returns a Mesh with setText(text, index), setLabel(index, patch), setFill(color), typeOn(seconds, index),
   * redraw() and dispose().
   */
  function makePanel(o = {}) {
    const width = o.width ?? 0.6, height = o.height ?? 0.3;
    let style = (o.style || 'auto').toLowerCase();
    if (style === 'auto') style = Math.min(width, height) >= 0.18 ? 'frame' : 'plain';
    const radius = o.radius ?? 0.03, border = o.border ?? 0.006, tail = o.tail ?? -0.28;
    let fill = rgb(o.fill ?? colors.panel, colors.panel);
    const labels = (o.labels || []).map((l) => ({ w: width - 0.05, h: height - 0.03, ...l }));
    const [ml, mr, mt, mb] = margins(style, width, height, border);
    const totalW = width + ml + mr, totalH = height + mt + mb;
    let ppm = o.ppm ?? DEFAULT_PPM;
    ppm = Math.min(ppm, MAX_CANVAS / totalW, MAX_CANVAS / totalH);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(2, Math.ceil(totalW * ppm));
    canvas.height = Math.max(2, Math.ceil(totalH * ppm));
    const g = canvas.getContext('2d');
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = maxAniso;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    // Panels are cut out (hard edges, like Unity's flat geometry, and no sorting problems). Bare text has no
    // plate behind it, so it is blended instead: a cut-out would chew thin letters.
    const material = style === 'none'
      ? new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false })
      : new THREE.MeshBasicMaterial({ map: texture, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide, fog: false, toneMapped: false });
    const geometry = new THREE.PlaneGeometry(totalW, totalH);
    geometry.translate((mr - ml) / 2, (mt - mb) / 2, 0);
    const mesh = new THREE.Mesh(geometry, material);
    if (style === 'none') mesh.renderOrder = 10;
    mesh.name = o.name || 'Panel';
    mesh.userData.panel = { width, height, style };

    const ox = (ml + width / 2) * ppm, oy = (mt + height / 2) * ppm;
    function redraw() {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, canvas.width, canvas.height);
      g.setTransform(ppm, 0, 0, -ppm, ox, oy);            // metres, y up, origin at the panel centre
      paintPanel(g, style, width, height, radius, border, fill, tail);
      if (o.paint) o.paint(g, { width, height, colors });   // extra decoration, same coordinates
      g.setTransform(1, 0, 0, 1, 0, 0);
      for (const l of labels) drawLabel(g, l, ppm, ox, oy);
      texture.needsUpdate = true;
    }

    mesh.redraw = redraw;
    mesh.labels = labels;
    /** Change the words of a label. Redraws (one texture upload), so do not call it every frame. */
    mesh.setText = (text, index = 0) => {
      const l = labels[index];
      if (!l) return mesh;
      const next = text === undefined || text === null ? '' : String(text);
      if (l.text === next && l.reveal === undefined) return mesh;
      l.text = next; delete l.reveal;
      typers.delete(l);
      redraw();
      return mesh;
    };
    mesh.getText = (index = 0) => (labels[index] ? labels[index].text : '');
    mesh.setLabel = (index, patch) => { if (labels[index]) { Object.assign(labels[index], patch); redraw(); } return mesh; };
    mesh.setFill = (color) => { fill = rgb(color, fill); redraw(); return mesh; };
    /** Reveal a label's words over `seconds`, as the game types out captions and facts. */
    mesh.typeOn = (seconds = 1.5, index = 0) => {
      const l = labels[index];
      if (!l || !l.text) return mesh;
      l.reveal = 0; l.typeT = 0; l.typeDur = Math.max(0.05, seconds); l.typeShown = -1; l.typeMesh = mesh;
      typers.add(l);
      redraw();
      return mesh;
    };
    mesh.retime = (seconds, index = 0) => { const l = labels[index]; if (l && typers.has(l)) l.typeDur = Math.max(l.typeT + 0.05, seconds); };
    mesh.dispose = () => {
      for (const l of labels) typers.delete(l);
      texture.dispose(); material.dispose(); geometry.dispose();
      if (mesh.parent) mesh.parent.remove(mesh);
    };
    redraw();
    return mesh;
  }

  /**
   * A text panel (the contract's ui.makeTextPanel). Height follows the text unless `height` is given.
   *   width       metres (default 0.6)
   *   fontSize    letter height: metres when below 1 (0.036 is body text), otherwise millimetres (36)
   *   color       text colour; background: face colour, or null / 'none' for bare text
   *   also: height, style, font, align, padding, ppm
   * Returns a Mesh with .setText(text).
   */
  function makeTextPanel(text, o = {}) {
    const width = o.width ?? 0.6;
    let size = o.fontSize ?? 0.036;
    if (size >= 1) size /= 1000;
    const font = o.font || 'body';
    const bare = o.background === null || o.background === 'none' || o.background === 'transparent';
    const padding = o.padding ?? (bare ? 0.004 : 0.034);
    const textW = width - padding * 2;
    const autoHeight = !(o.height > 0);
    const heightFor = (t) => Math.max(bare ? size * 1.3 : 0.09, measureTextHeight(t, { size, font, width: textW }) + padding * 2 + (bare ? 0 : 0.012));
    let height = autoHeight ? heightFor(text) : o.height;
    let panel = null;
    const holder = new THREE.Mesh();      // replaced below; kept so the returned object is stable
    function build(t) {
      return makePanel({
        width, height, ppm: o.ppm,
        style: bare ? 'none' : (o.style || 'auto'),
        fill: bare ? colors.panel : (o.background ?? colors.panel),
        radius: o.radius ?? 0.045, border: o.border ?? 0.008,
        labels: [{ text: t, size, font, color: o.color ?? colors.slate, w: textW, h: height - padding * 2 + 0.004,
          y: bare ? 0 : -0.004, align: o.align || 'center', autoSize: !autoHeight }],
      });
    }
    panel = build(text);
    // The Mesh handed back is `holder`; it borrows the panel's geometry and material so that a change of
    // height (longer text) can swap them without the caller's object changing.
    holder.geometry = panel.geometry; holder.material = panel.material;
    holder.name = 'TextPanel';
    holder.userData.panel = { width, height };
    holder.setText = (t) => {
      const next = t === undefined || t === null ? '' : String(t);
      if (next === panel.getText()) return holder;
      const want = autoHeight ? heightFor(next) : height;
      if (Math.abs(want - height) > 0.004) {
        height = want;
        const old = panel;
        panel = build(next);
        holder.geometry = panel.geometry; holder.material = panel.material;
        holder.userData.panel.height = height;
        old.dispose();
      } else panel.setText(next);
      return holder;
    };
    holder.getText = () => panel.getText();
    holder.typeOn = (seconds) => { panel.typeOn(seconds); return holder; };
    holder.retime = (seconds) => panel.retime(seconds);
    holder.dispose = () => { panel.dispose(); if (holder.parent) holder.parent.remove(holder); };
    Object.defineProperty(holder, 'panelHeight', { get: () => height });
    return holder;
  }

  function haloFor(width, height, radius) {
    const key = `${width.toFixed(3)}|${height.toFixed(3)}|${radius.toFixed(3)}`;
    let entry = haloCache.get(key);
    if (!entry) {
      const panel = makePanel({ width, height, style: 'default', fill: colors.halo, radius, ppm: 400 });
      entry = { geometry: panel.geometry, material: panel.material };
      haloCache.set(key, entry);
    }
    return new THREE.Mesh(entry.geometry, entry.material);
  }

  /**
   * A button (the contract's ui.makeButton): point and pull the trigger, click it with the mouse, or poke
   * it with a controller. It pops in, springs when pointed at, dips when pressed, and after a short dwell
   * the guide says its name when a recording exists.
   *   width, height   metres (default 0.3 x 0.11)
   *   also: fill / color, textHeight, style ('pill' | 'frame'), subtitle, spoken, font, enabled
   * Returns an Object3D with setLabel(text), setSelected(bool), setEnabled(bool), bounce(), shake(), dispose().
   */
  function makeButton(label, onClick, o = {}) {
    const width = o.width ?? 0.3, height = o.height ?? 0.11;
    const style = (o.style || 'pill').toLowerCase();
    const pill = style === 'pill';
    const radius = pill ? Math.min(width, height) * 0.3 : 0.05;
    const fill = o.fill ?? o.color ?? colors.button;
    const textHeight = o.textHeight ?? o.fontSize ?? Math.min(0.045, height * 0.42);
    const labels = [];
    if (o.subtitle) {
      labels.push({ text: label, size: o.textHeight ?? 0.066, font: 'heading', w: width - 0.05, h: height * 0.45, y: height * 0.13 });
      labels.push({ text: o.subtitle, size: o.subtitleHeight ?? 0.036, font: 'body', w: width - 0.06, h: height * 0.3, y: -height * 0.24 });
    } else {
      labels.push({ text: label, size: textHeight, font: o.font || 'heading', w: width - 0.04, h: height - 0.02 });
    }
    const root = new THREE.Group();
    root.name = 'Button ' + label;
    const visual = new THREE.Group();
    root.add(visual);
    const bg = makePanel({ width, height, style, fill, radius, border: pill ? 0.006 : 0.008, labels, ppm: o.ppm, paint: o.paint });
    visual.add(bg);
    const s = {
      halo: null,
      root, visual, bg, label: String(label), spoken: o.spoken || (o.subtitle ? `${label}. ${o.subtitle}.` : ''),
      onClick, interactable: o.enabled !== false, selected: false, hovering: false, live: false,
      size: 1, speed: 0, wait: 0, pulse: 0, hoverTime: 0, hinted: false, shake: 0, shakeOffset: 0,
    };

    function apply() {
      if (s.halo) s.halo.visible = s.hovering && s.interactable;
      const v = !s.interactable ? 0.6 : s.hovering ? 1.12 : 1;
      if (s.selected) bg.material.color.setRGB(1.0 * v, 0.86 * v, 0.72 * v, THREE.SRGBColorSpace);
      else bg.material.color.setRGB(v, v, v, THREE.SRGBColorSpace);
    }

    function hover(on) {
      if (s.hovering === on) return;
      s.hovering = on; s.hoverTime = 0; s.hinted = false;
      if (on && s.interactable) {
        if (!s.halo) {
          s.halo = haloFor(width + 0.026, height + 0.026, radius + 0.013);
          s.halo.position.set(0, -0.003, -0.004);
          visual.add(s.halo);
        }
        if (audio) audio.sfx('hover', 0.25, root);
      }
      apply();
    }

    function click(hand) {
      if (!s.interactable) return;
      s.pulse = 1;
      if (audio) audio.sfx('click', 0.6, root);
      if (typeof s.onClick === 'function') {
        try { s.onClick(hand, root); } catch (err) { console.error('[wishworld] button handler failed', err); }
      }
    }

    s.apply = apply;
    root.userData.button = s;
    root.setLabel = (text) => { s.label = String(text); bg.setText(text, 0); return root; };
    root.setSubtitle = (text) => { if (bg.labels[1]) bg.setText(text, 1); return root; };
    root.setSelected = (on) => { s.selected = Boolean(on); apply(); return root; };
    root.setEnabled = (on) => { s.interactable = Boolean(on); apply(); return root; };
    root.setOnClick = (fn) => { s.onClick = fn; return root; };
    /** A happy hop, for a right answer. */
    root.bounce = () => { s.speed += 3.2; };
    /** A quick side-to-side shake, for a wrong answer. */
    root.shake = () => { s.shake = 0.4; };
    root.click = click;
    root.dispose = () => {
      buttons.delete(s);
      if (input) input.removeTarget(root);
      bg.dispose();
      if (root.parent) root.parent.remove(root);
    };

    buttons.add(s);
    if (input) input.addTarget(root, { width, height, ui: true, depth: 0.03, onClick: click, onHover: hover, button: true });
    return root;
  }

  /** A hub-style card: a Frame button with a title and a subtitle (HubController.Card). */
  function makeCard(title, subtitle, onClick, o = {}) {
    return makeButton(title, onClick, { width: 0.44, height: 0.32, style: 'frame', subtitle, ...o });
  }

  /** A swallow-tailed title ribbon (WWUI.Ribbon). The tails reach past `width` on both sides. */
  function makeRibbon(text, o = {}) {
    const width = o.width ?? 0.6, height = o.height ?? 0.14;
    return makePanel({
      name: 'Ribbon ' + text, width, height, style: 'ribbon', fill: o.fill ?? colors.ribbon, radius: 0.006, border: 0.006, ppm: o.ppm,
      labels: [{ text, size: o.textHeight ?? height * 0.66, font: o.font || 'title', color: o.color ?? colors.snow, w: width - 0.05, h: height - 0.012 }],
    });
  }

  /** Bare text with no plate (a status line on a panel). Returns a Mesh with setText. */
  function makeLabel(text, o = {}) {
    const width = o.width ?? 0.5, height = o.height ?? Math.max(0.05, (o.size ?? 0.036) * 1.6);
    return makePanel({
      name: 'Label', width, height, style: 'none', ppm: o.ppm,
      labels: [{ text, size: o.size ?? 0.036, font: o.font || 'body', color: o.color ?? colors.slate, w: width, h: height, align: o.align || 'center' }],
    });
  }

  // ---- PopIn: panels grow in with a little overshoot, may bob, and shrink away when closed -------------

  /**
   * Make `object` pop into view every time it becomes visible, and optionally bob while it is up.
   * options: { duration = 0.34, delay = 0, bob = 0 (metres), bobSpeed = 1.2 }. The object's own scale at the
   * time of this call is its resting scale.
   */
  function popIn(object, o = {}) {
    let p = object.userData.pop;
    if (!p) {
      p = { object, base: object.scale.clone(), state: 0, t: 0, offset: 0, kick: 0, kickSize: 0, pulse: 0, live: false, phase: Math.random() * 6.28 };
      object.userData.pop = p;
      pops.add(p);
    }
    p.duration = o.duration ?? 0.34; p.delay = o.delay ?? 0; p.bob = o.bob ?? 0; p.bobSpeed = o.bobSpeed ?? 1.2;
    return object;
  }
  /** Open again from small, for a panel that stays up while its words change. */
  function replay(object) { const p = object.userData.pop; if (p) { p.t = 0; p.state = 1; } object.visible = true; }
  /** Shrink away, then hide. Safe on objects with no popIn: they are just hidden. */
  function close(object) {
    if (!object || !object.visible) return;
    const p = object.userData.pop;
    if (!p || !p.live) { object.visible = false; return; }
    if (p.state === 2) return;
    p.state = 2; p.t = 0;
  }
  /** A quick bump in size, for a number that just changed. */
  function kick(object, size = 0.3) { const p = object.userData.pop || popIn(object).userData.pop; p.kick = 1; p.kickSize = size; }
  /** 0..1: a soft breathing while the guide speaks. */
  function setPulse(object, amount) { const p = object.userData.pop; if (p) p.pulse = amount; }
  function forget(object) { const p = object.userData.pop; if (p) { pops.delete(p); delete object.userData.pop; } }

  /** Turn an object to face the viewer, upright, as a panel should (WWUI.FaceHead). */
  const _head = new THREE.Vector3(), _pos = new THREE.Vector3();
  function faceViewer(object, headPosition, tiltBack = 0) {
    object.getWorldPosition(_pos);
    _head.copy(headPosition);
    const dx = _head.x - _pos.x, dz = _head.z - _pos.z;
    if (dx * dx + dz * dz < 1e-6) return;
    object.rotation.set(-tiltBack, Math.atan2(dx, dz), 0, 'YXZ');
  }

  function update(dt) {
    dt = Math.min(dt, 0.05);
    clock += dt;

    for (const s of buttons) {
      const live = isLive(s.root);
      if (!live) {
        if (s.live) {
          s.live = false;
          s.visual.scale.setScalar(1);
          s.visual.position.x = 0; s.shake = 0; s.shakeOffset = 0;
          s.hovering = false; s.hoverTime = 0;
          s.apply();
        }
        continue;
      }
      if (!s.live) {
        // Each button on a panel arrives a beat after the one before it.
        s.live = true;
        const index = s.root.parent ? s.root.parent.children.indexOf(s.root) : 0;
        s.wait = Math.min(0.035 * Math.max(0, index), 0.4) + 0.02;
        s.size = 0.01; s.speed = 0;
        s.visual.scale.setScalar(s.size);
      }
      if (s.wait > 0) {
        s.wait -= dt;
        if (s.wait > 0) continue;
        s.size = 0.6; s.speed = 0;
      }
      let target = s.hovering && s.interactable ? 1.06 : 1;
      if (s.pulse > 0) { s.pulse -= dt * 4; target -= 0.08 * Math.max(s.pulse, 0); }
      s.speed += (target - s.size) * 260 * dt;       // a soft spring: it overshoots a little and settles
      s.speed *= Math.exp(-16 * dt);
      s.size += s.speed * dt;
      s.visual.scale.setScalar(Math.max(0.01, s.size));
      if (s.shake > 0 || s.shakeOffset !== 0) {
        s.shake = Math.max(0, s.shake - dt);
        s.shakeOffset = s.shake > 0 ? Math.sin(s.shake * 55) * 0.014 * (s.shake / 0.4) : 0;
        s.visual.position.x = s.shakeOffset;
      }
      if (s.hovering && s.interactable && !s.hinted) {
        s.hoverTime += dt;
        if (s.hoverTime >= 0.45) {
          s.hinted = true;
          if (audio && audio.hint) audio.hint(s.spoken || s.label);
        }
      }
    }

    for (const p of pops) {
      const o = p.object;
      const live = isLive(o);
      if (!live) {
        if (p.live) { p.live = false; o.position.y -= p.offset; p.offset = 0; o.scale.copy(p.base); if (p.state === 2) { o.visible = false; } p.state = 0; }
        continue;
      }
      if (!p.live) { p.live = true; p.t = -p.delay; p.state = 1; }
      let k = 1;
      if (p.state === 1) {
        p.t += dt;
        const x = Math.min(1, Math.max(0, p.t / p.duration));
        k = p.t < 0 ? 0.55 : 0.55 + (1 - 0.55) * outBack(x);
        if (x >= 1) p.state = 0;
      } else if (p.state === 2) {
        p.t += dt;
        const x = Math.min(1, p.t / 0.14);
        k = 1 + (0.4 - 1) * x * x;
        if (x >= 1) { o.visible = false; p.live = false; p.state = 0; o.position.y -= p.offset; p.offset = 0; o.scale.copy(p.base); continue; }
      }
      if (p.kick > 0) { p.kick = Math.max(0, p.kick - dt * 4.5); k *= 1 + p.kickSize * p.kick * p.kick; }
      if (p.pulse > 0.001) k *= 1 + 0.012 * p.pulse * Math.sin(clock * 9);
      o.scale.copy(p.base).multiplyScalar(k);
      if (p.bob > 0) {
        const want = Math.sin(clock * p.bobSpeed + p.phase) * p.bob;
        o.position.y += want - p.offset;
        p.offset = want;
      }
    }

    for (const l of typers) {
      l.typeT += dt;
      const done = l.typeT >= l.typeDur;
      const chars = done ? Infinity : Math.floor(l.text.length * (l.typeT / l.typeDur));
      // Redraw a word at a time, not a letter at a time: each redraw is a texture upload.
      let shown = chars;
      if (!done) { const cut = l.text.lastIndexOf(' ', chars); shown = cut < 0 ? 0 : cut; }
      if (shown !== l.typeShown) {
        l.typeShown = shown;
        if (done) delete l.reveal; else l.reveal = shown;
        if (l.typeMesh) l.typeMesh.redraw();
      }
      if (done) typers.delete(l);
    }
  }

  return {
    makePanel, makeTextPanel, makeButton, makeCard, makeRibbon, makeLabel,
    popIn, replay, close, kick, setPulse, forget, faceViewer, update,
    measureTextHeight, measureTextWidth,
    colors, fonts,
  };
}
