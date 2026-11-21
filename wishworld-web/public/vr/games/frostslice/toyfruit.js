// Scans as Frost Slice fruit: the 3D models the child marked "Fruit: yes" on the Settings board's Scans page
// (profile setting sliceToys: "bubby" or "g<gift id>"). Each is loaded once per visit (shared geometry); the game
// throws a copy now and then in place of a fruit, and when it is sliced, two smaller copies tumble apart.
// Hidden scans (hiddenScans) are never thrown.
import { loadModelUrl } from '/shared/models.js';
import { buildBubby } from '/shared/toys.js';

const SIZE = 0.2;          // metres across, like a big fruit
export const TOY_RADIUS = 0.11;
export const TOY_CHANCE = 0.45;

export function createToyFruit(ctx) {
  let toys = [];             // [{ key, name, template }]
  let loading = null, loadedFor = '';

  const settings = () => (ctx.profile && ctx.profile.current && ctx.profile.current.settings) || {};

  /** Load (again, if the choice changed) the scans marked as fruit. */
  function refresh() {
    const s = settings();
    const hidden = Array.isArray(s.hiddenScans) ? s.hiddenScans : [];
    const wanted = (Array.isArray(s.sliceToys) ? s.sliceToys : []).filter((k) => !hidden.includes(k));
    const sig = wanted.join(',');
    if (sig === loadedFor && loading) return loading;
    loadedFor = sig;
    if (!wanted.length) { toys = []; loading = Promise.resolve(); return loading; }
    loading = (async () => {
      let data = { companions: [], gifts: [] };
      if (wanted.some((k) => k !== 'bubby') && ctx.api && typeof ctx.api.getBuddies === 'function') {
        try { data = await ctx.api.getBuddies(); } catch (err) { console.warn('[frostslice] scans are not available', err && err.message); }
      }
      const urls = new Map();
      for (const c of data.companions || []) if (c.gift_id && c.model_url) urls.set('g' + c.gift_id, { url: c.model_url, name: c.name });
      for (const g of data.gifts || []) if (g.model_url) urls.set('g' + g.id, { url: g.model_url, name: g.name });
      const next = [];
      for (const key of wanted) {
        try {
          if (key === 'bubby') next.push({ key, name: 'Bubby', template: buildBubby(SIZE) });
          else if (urls.has(key)) next.push({ key, name: urls.get(key).name, template: await loadModelUrl(urls.get(key).url, SIZE) });
        } catch (err) { console.warn('[frostslice] a scan could not be loaded as fruit', key, err && err.message); }
      }
      if (loadedFor === sig) toys = next;
    })();
    return loading;
  }

  return {
    refresh,
    get count() { return toys.length; },
    /** A fresh copy of a random chosen scan, or null when none is chosen (or it is not this throw's turn). */
    maybePick() {
      if (!toys.length || Math.random() > TOY_CHANCE) return null;
      const t = toys[Math.floor(Math.random() * toys.length)];
      const copy = t.template.clone(true);
      copy.userData.toyName = t.name;
      copy.userData.toyTemplate = t.template;
      return copy;
    },
  };
}
