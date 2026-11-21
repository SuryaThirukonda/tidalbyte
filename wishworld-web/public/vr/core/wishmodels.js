// A wish's own 3D model, swapped in for its library stand-in when the server has built it.
//
// POST /api/wish gives a gift at once: a library creature (option_id) the child can see straight away, and a
// job (job_id "wish:...") that generates the real model in the background. watchWish(gift, holder) waits for
// that model and, when it lands, replaces what is inside `holder` (the object already in the scene) with it,
// keeping the holder's place, turn and scale, so whatever moves the creature keeps moving it.
import { loadModelUrl } from '/shared/models.js';

const POLL_MS = 3000;
const GIVE_UP_MS = 170000;

/** True for a wish whose own model is still being made. */
export function wishPending(gift) {
  const job = String((gift && gift.job_id) || '');
  return job.startsWith('wish:') && !job.startsWith('wish:done:') && job !== 'wish:library';
}

/** True for a gift that already has its generated model. */
export function wishReady(gift) {
  return Boolean(gift && gift.kind === 'creature' && gift.model_url && String(gift.job_id || '').startsWith('wish:done:'));
}

/**
 * Waits for the generated model and puts it inside `holder` in place of what is there.
 * options: api, size (the stand-in's size, metres), onSwap(model, gift), isAlive() (stop when false).
 * Returns stop().
 */
export function watchWish(gift, holder, { api, size = 0.3, onSwap = null, isAlive = () => true } = {}) {
  let stopped = false, timer = null;
  const started = Date.now();
  const stop = () => { stopped = true; clearTimeout(timer); };

  async function swap(latest) {
    const model = await loadModelUrl(latest.model_url, size);
    if (stopped || !isAlive()) return;
    while (holder.children.length) holder.remove(holder.children[0]);
    holder.add(model);
    holder.userData.generated = true;
    holder.userData.triangles = model.userData.triangles;
    if (onSwap) { try { onSwap(model, latest); } catch (err) { console.warn(err); } }
  }

  async function tick() {
    if (stopped || !isAlive()) return;
    try {
      const latest = await api.getWish(gift.id);
      if (stopped || !isAlive()) return;
      if (latest && latest.model_url && String(latest.job_id || '').startsWith('wish:done:')) { await swap(latest); return; }
      if (!wishPending(latest) || Date.now() - started > GIVE_UP_MS) return;   // the library creature stays
    } catch (err) {
      console.warn('[wishworld] wish model check failed', err && err.message);
    }
    timer = setTimeout(tick, POLL_MS);
  }

  if (!api || typeof api.getWish !== 'function') return stop;
  if (wishReady(gift)) swap(gift).catch((err) => console.warn('[wishworld] wish model could not load', err && err.message));
  else if (wishPending(gift)) timer = setTimeout(tick, 1500);
  return stop;
}
