// One gift watcher for the whole headset view. The reef (creatures, scanned companions) and the mailbox
// (letters) both need to know what has arrived; they share this instead of each polling the API.
// It wraps api.pollGifts (every 2.5 s), remembers everything delivered so far, and replays it to a tab
// that subscribes later.

export function createGifts(api) {
  const all = [];
  const byId = new Map();
  const subscribers = new Set();
  let stop = null;

  function deliver(gift) {
    if (!gift || byId.has(gift.id)) return;
    byId.set(gift.id, gift);
    all.push(gift);
    for (const fn of subscribers) {
      try { fn(gift, false); } catch (err) { console.error('[wishworld] gift handler failed', err); }
    }
  }

  return {
    /** Begin watching the room. Safe to call again. */
    start() {
      if (stop || !api || typeof api.pollGifts !== 'function') return;
      try { stop = api.pollGifts(deliver, { intervalMs: 2500, after: 0 }); } catch (err) { console.warn('[wishworld] gifts are not available', err && err.message); }
    },
    stop() { if (stop) { try { stop(); } catch { /* already stopped */ } stop = null; } },
    /** Forget everything delivered and watch again from the start (the room changed). */
    reset() {
      const watching = Boolean(stop);
      if (stop) { try { stop(); } catch { /* already stopped */ } stop = null; }
      all.length = 0; byId.clear();
      if (watching) this.start();
    },
    /**
     * fn(gift, replayed) for every gift already delivered (replayed = true) and every one that arrives later.
     * Returns unsubscribe().
     */
    subscribe(fn, { replay = true } = {}) {
      if (replay) for (const gift of all) { try { fn(gift, true); } catch (err) { console.error('[wishworld] gift handler failed', err); } }
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
    /** Tell the server the child opened a gift, and remember it here. Never throws. */
    async open(gift) {
      if (!gift) return null;
      const known = byId.get(gift.id) || gift;
      if (!known.opened_at) known.opened_at = new Date().toISOString();
      try { return await api.openGift(gift.id); } catch (err) { console.warn('[wishworld] could not mark the gift as opened:', err && err.message); return null; }
    },
    /** Feed a gift in by hand (a wish the child just made returns its gift at once; tests). */
    add(gift) { deliver(gift); },
    all: () => all,
    get(id) { return byId.get(id) || null; },
    /** How many letters are waiting to be opened. */
    waitingLetters() { let n = 0; for (const g of all) if (g.kind === 'letter' && !g.opened_at) n++; return n; },
  };
}
