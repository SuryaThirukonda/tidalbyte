// Which balls the child can pick, and loading them. The choices are the room's saved companions (scanned toys,
// library creatures a failed scan became, Bubby), newest first, plus Bubby always. A companion that is already
// following is cloned from the live object (no download); others load through /shared/models.js, whose cache
// hands out clones that share geometry and materials. "Scan something new" goes through /vr/core/toyscan.js.
//
// ?standins=1 (dev): no server; Bubby and a lumpy 19,220-triangle stand-in for a scan.

import * as THREE from 'three';
import { loadModelUrl, loadCreature, createVertexLitMaterial } from '/shared/models.js';
import { buildBubby, BUBBY } from '/shared/toys.js';
import { normalizeBall, makeGold } from './ballshape.js';

const MAX_LISTED = 5;                // saved companions shown, plus Bubby

const keyOf = (record) => (record.toy ? 'toy:' + record.toy : 'gift:' + record.gift_id);

/** -> [{ key, label, kind: 'bubby' | 'mesh' | 'creature' | 'standin' | 'scan', record }] */
export async function listChoices(ctx, { standIns = false } = {}) {
  const bubby = { key: 'toy:bubby', label: BUBBY.name, kind: 'bubby', record: null };
  if (standIns) return [{ key: 'standin:scan', label: 'Test scan', kind: 'standin', record: null }, bubby];
  let records = [];
  try { if (ctx.api && typeof ctx.api.getCompanions === 'function') records = await ctx.api.getCompanions(); } catch (err) {
    console.warn('[hoops] saved companions are not available:', err && err.message);
  }
  const out = [], seen = new Set();
  // Scans hidden in Settings stay out of the ball picker ("g<gift id>", "bubby").
  const settings = (ctx.profile && ctx.profile.current && ctx.profile.current.settings) || {};
  const hidden = Array.isArray(settings.hiddenScans) ? settings.hiddenScans : [];
  const isHidden = (r) => hidden.includes(r.toy === 'bubby' ? 'bubby' : 'g' + r.gift_id);
  for (let i = (records || []).length - 1; i >= 0 && out.length < MAX_LISTED; i--) {
    const r = records[i];
    if (!r || isHidden(r)) continue;
    const key = keyOf(r);
    if (seen.has(key)) continue;
    // A generated wish is a creature gift with its own model: it is thrown as that model.
    const kind = r.toy === 'bubby' ? 'bubby' : r.model_url ? 'mesh' : r.kind === 'creature' && r.option_id ? 'creature' : null;
    if (!kind) continue;
    seen.add(key);
    out.push({ key, label: String(r.name || 'My toy').split(',')[0].slice(0, 18), kind, record: r });
  }
  if (!seen.has(bubby.key) && !hidden.includes('bubby')) out.push(bubby);
  if (!out.length) out.push(bubby);      // never an empty picker
  return out;
}

/** A lumpy, off-centre, stretched ball of about 19,000 triangles: what a phone scan looks like to the game. */
function standInScan() {
  const g = new THREE.IcosahedronGeometry(1, 30);           // 20 * 31^2 = 19,220 triangles
  const p = g.attributes.position, colors = new Float32Array(p.count * 3), v = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const bump = 1 + 0.12 * Math.sin(v.x * 5) * Math.sin(v.y * 4 + 1) + 0.08 * Math.sin(v.z * 7);
    v.multiplyScalar(bump);
    p.setXYZ(i, v.x * 1.4 + 3, v.y * 0.9 + 1, v.z * 0.8 - 2);   // stretched and far from its origin, as scans are
    c.setHSL(0.07 + 0.04 * Math.sin(v.y * 3), 0.75, 0.55 + 0.1 * Math.sin(v.x * 6));
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, createVertexLitMaterial({ flat: false }));
  const holder = new THREE.Group();
  holder.add(mesh);
  holder.scale.setScalar(0.1);
  return holder;
}

/**
 * Balls by key, made once per visit to the page and kept: { ball (0.24 m, centred), gold, triangles, label }.
 * Nothing is ever disposed but the gold copies: the geometry belongs to the shared model cache.
 */
export function createBallCache(ctx, { size }) {
  const made = new Map();
  let bubbyModel = null, standIn = null;

  async function rawModel(choice) {
    if (choice.model) return choice.model;                              // handed in by a scan
    const live = ctx.companions && typeof ctx.companions.list === 'function' ? ctx.companions.list().find((p) => p.key === choice.key) : null;
    if (live && live.object) return live.object;
    if (choice.kind === 'bubby') return bubbyModel || (bubbyModel = buildBubby(0.3));
    if (choice.kind === 'standin') return standIn || (standIn = standInScan());
    if (choice.kind === 'mesh') return loadModelUrl(choice.record.model_url, 0.3);
    if (choice.kind === 'creature') return loadCreature(choice.record.option_id);
    throw new Error('nothing to load for ' + choice.key);
  }

  return {
    has: (key) => made.has(key),
    /** -> Promise of the ball for a choice. A model that cannot be loaded becomes Bubby (with a warning). */
    async get(choice) {
      if (made.has(choice.key)) return made.get(choice.key);
      let model, label = choice.label;
      try { model = await rawModel(choice); } catch (err) {
        console.warn('[hoops] that ball could not be loaded, Bubby comes instead:', err && err.message);
        model = bubbyModel || (bubbyModel = buildBubby(0.3));
        label = BUBBY.name;
      }
      const ball = normalizeBall(model, size);
      const entry = { key: choice.key, ball, gold: makeGold(ball, THREE), triangles: ball.userData.triangles, label };
      made.set(choice.key, entry);
      return entry;
    },
    dispose() { for (const e of made.values()) e.gold.dispose(); made.clear(); },
  };
}
