// The tab registry: reads /vr/tabs/tabs.json (tab ids in menu order), imports /vr/tabs/<id>.js for each,
// and runs one tab at a time. A module that is missing, broken, or throws while being created is skipped
// with a console warning, so a tab is added by dropping in a file and listing its id.

const VALID_ID = /^[a-z0-9][a-z0-9_-]*$/i;
const FALLBACK_IDS = ['hub', 'reef', 'worlds', 'frostslice', 'snowcircuit', 'explore', 'calm', 'mailbox'];

export function createTabs({ scene, ctx, hooks }) {
  const tabs = [];                 // { id, meta, tab }
  const byId = new Map();
  let active = null;
  let switching = false, pending = null;
  const warned = new Set();

  function guard(id, what, fn) {
    try { return fn(); } catch (err) {
      const key = id + ':' + what;
      if (!warned.has(key)) { warned.add(key); console.error(`[wishworld] tab "${id}" failed in ${what}:`, err); }
      return undefined;
    }
  }

  async function load() {
    let ids = FALLBACK_IDS;
    try {
      const res = await fetch('/vr/tabs/tabs.json', { cache: 'no-cache' });
      const list = res.ok ? await res.json() : null;
      if (Array.isArray(list) && list.length) ids = list;
      else console.warn('[wishworld] /vr/tabs/tabs.json is missing or empty; using the built-in tab list');
    } catch (err) {
      console.warn('[wishworld] could not read /vr/tabs/tabs.json; using the built-in tab list.', err && err.message);
    }
    ids = ids.filter((id, i) => typeof id === 'string' && VALID_ID.test(id) && ids.indexOf(id) === i);

    const modules = await Promise.all(ids.map((id) => import(`/vr/tabs/${id}.js`).then((m) => ({ id, m }), (err) => ({ id, err }))));
    modules.forEach(({ id, m, err }, index) => {
      if (err || !m) { console.warn(`[wishworld] tab "${id}" skipped: its module could not be loaded.`, err && err.message); return; }
      try {
        if (typeof m.createTab !== 'function') throw new Error('it does not export createTab(ctx)');
        const tab = m.createTab(ctx);
        if (!tab || typeof tab !== 'object') throw new Error('createTab(ctx) returned nothing');
        if (!tab.group || !tab.group.isObject3D) throw new Error('the tab has no `group` (a THREE.Group)');
        const meta = { id, label: tab.name || id, order: index, hidden: false, ...(m.meta || {}) };
        meta.id = id;
        if (!meta.label) meta.label = tab.name || id;
        tab.group.visible = false;
        scene.add(tab.group);
        const entry = { id, meta, tab, index };
        tabs.push(entry);
        byId.set(id, entry);
      } catch (e) {
        console.warn(`[wishworld] tab "${id}" skipped: ${e && e.message ? e.message : e}`);
      }
    });
    tabs.sort((a, b) => (Number(a.meta.order) - Number(b.meta.order)) || (a.index - b.index));
    return tabs;
  }

  /** Leave the current tab and enter another. Resolves true when the new tab is showing. */
  async function switchTo(id, { fade = true } = {}) {
    const next = byId.get(id);
    if (!next) { console.warn(`[wishworld] there is no tab called "${id}"`); return false; }
    if (switching) { pending = id; return false; }
    if (active === next) return true;
    switching = true;
    try {
      if (fade && active) await hooks.fadeOut();
      if (active) {
        const old = active;
        guard(old.id, 'exit()', () => old.tab.exit && old.tab.exit());
        old.tab.group.visible = false;
      }
      hooks.reset(next.id);                       // voice hushed, default surroundings, pointers on, player recentred
      active = next;
      next.tab.group.visible = true;
      guard(next.id, 'enter()', () => next.tab.enter && next.tab.enter());
      hooks.changed(next.id);
      if (fade) await hooks.fadeIn();
    } finally {
      switching = false;
    }
    if (pending && pending !== id) { const p = pending; pending = null; return switchTo(p, { fade }); }
    pending = null;
    return true;
  }

  function call(name, a, b) {
    if (!active || switching) return;
    const fn = active.tab[name];
    if (typeof fn === 'function') guard(active.id, name + '()', () => fn.call(active.tab, a, b));
  }

  return {
    load, switchTo, call,
    list: () => tabs,
    get: (id) => byId.get(id) || null,
    get activeId() { return active ? active.id : null; },
    get active() { return active; },
    update(dt, elapsed) {
      if (active && !switching && typeof active.tab.update === 'function') guard(active.id, 'update()', () => active.tab.update(dt, elapsed));
    },
    /** Leave the active tab without entering another (the session ended). */
    leave() {
      if (!active) return;
      const old = active;
      active = null;
      guard(old.id, 'exit()', () => old.tab.exit && old.tab.exit());
      old.tab.group.visible = false;
    },
  };
}
