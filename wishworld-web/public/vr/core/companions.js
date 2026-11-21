// Companions that follow the child everywhere in the headset view: every tab, every world, AR and VR.
//
// They are saved per room on the server (/api/companions), so they come back the next time the room is opened.
// A companion is a scanned toy (the .glb a phone photo became, or the library creature a failed scan became), or
// Bubby, the prepared toy. The reef's toy scan and present opening hand new ones in with add(); this file keeps
// them, saves them, and moves them beside the viewer every frame (createCompanionFollower in /shared/movement.js).
//
//   ctx.companions.add(model, { gift, toy, from })   a new companion, already loaded; saved unless it is known
//   ctx.companions.has(gift)                          true if that scanned toy is already a companion
//   ctx.companions.setVisible(on)                     hide them for a moment (the toy scan's viewfinder)
//   ctx.companions.hopAll()                           everybody does a happy hop
//   ctx.companions.reload()                           fetch the room's saved companions again

import * as THREE from 'three';
import { loadModelUrl, loadCreature } from '/shared/models.js';
import { createCompanionFollower } from '/shared/movement.js';
import { buildBubby } from '/shared/toys.js';

/** How many follow at once (a Quest 2 keeps its frame rate with three). The rest stay saved. */
const MAX_FOLLOWING = 3;
const SIZE = 0.3;

const _head = new THREE.Vector3(), _fwd = new THREE.Vector3();

export function createCompanions({ scene, rig, input, audio, api, haptic = () => {}, onJoined = null }) {
  const group = new THREE.Group();
  group.name = 'Companions';
  scene.add(group);

  const pals = [];                 // { key, record, object, follower }, oldest first
  let visible = true, loading = null, epoch = 0;
  // Which saved companions follow: a list of companion ids chosen in Settings, or null for "the newest three".
  let followIds = null;

  const keyOf = ({ gift, toy, record }) => {
    if (record) return record.toy ? 'toy:' + record.toy : 'gift:' + record.gift_id;
    return toy ? 'toy:' + toy : gift ? 'gift:' + gift.id : null;
  };

  /** Each follower takes a place by its order: alternate sides, fanning further round for each pair. */
  function place() {
    while (pals.length > MAX_FOLLOWING) {
      const old = pals.shift();
      input.removeTarget(old.object);
      group.remove(old.object);
    }
    pals.forEach((pal, i) => {
      const side = i % 2 === 0 ? 1 : -1, slot = Math.floor(i / 2);
      if (pal.side !== side || pal.slot !== slot) {
        const from = pal.placed ? pal.object.position.clone() : pal.from;
        pal.object.scale.copy(pal.baseScale);          // a follower reads the model's own size when it is made
        pal.follower = createCompanionFollower(pal.object, { armLength: 0.7, angle: 46, drop: 0.3, side, slot, from });
        pal.side = side; pal.slot = slot;
      }
    });
  }

  function attach(object, { key, record = null, from = null }) {
    const known = key && pals.find((p) => p.key === key);
    if (known) { known.follower.hop(); return known; }
    object.visible = visible;
    group.add(object);
    const pal = { key, record, object, follower: null, from: from || null, placed: false, side: 0, slot: -1, baseScale: object.scale.clone() };
    input.addTarget(object, {
      radius: 0.2, ui: false,
      onClick: (hand) => { pal.follower.hop(); audio.pop(object); haptic(hand, 0.4, 40); },
    });
    pals.push(pal);
    place();
    return pal;
  }

  async function modelFor(record) {
    if (record.toy === 'bubby') return buildBubby(SIZE);
    if (record.kind === 'mesh' && record.model_url) return loadModelUrl(record.model_url, SIZE);
    if (record.kind === 'creature' && record.option_id) {
      const m = await loadCreature(record.option_id);
      // A library creature is shown at companion size, like a scanned toy.
      const box = new THREE.Box3().setFromObject(m), size = box.getSize(new THREE.Vector3());
      const longest = Math.max(size.x, size.y, size.z) || 1;
      m.scale.multiplyScalar(SIZE / longest);
      return m;
    }
    throw new Error('nothing to show');
  }

  /** The room's saved companions, newest few following. Safe to call again. */
  function reload() {
    if (!api || typeof api.getCompanions !== 'function') return Promise.resolve();
    const mine = ++epoch;
    loading = api.getCompanions().then(async (records) => {
      const wanted = Array.isArray(followIds)
        ? records.filter((r) => followIds.includes(r.id)).slice(-MAX_FOLLOWING)
        : records.slice(-MAX_FOLLOWING);
      for (const record of wanted) {
        const key = keyOf({ record });
        if (pals.some((p) => p.key === key)) continue;
        try {
          const model = await modelFor(record);
          if (mine !== epoch) return;
          attach(model, { key, record });
        } catch (err) {
          console.warn('[wishworld] companion could not be loaded:', record.name, err && err.message);
        }
      }
    }).catch((err) => console.warn('[wishworld] saved companions are not available:', err && err.message));
    return loading;
  }

  return {
    group,
    reload,
    get count() { return pals.length; },
    list: () => pals.map((p) => ({ key: p.key, record: p.record, object: p.object })),

    /** True if this scanned toy (or toy id) already follows. */
    has(giftOrToy) {
      const key = typeof giftOrToy === 'string' ? 'toy:' + giftOrToy : giftOrToy && giftOrToy.id ? 'gift:' + giftOrToy.id : null;
      return Boolean(key && pals.some((p) => p.key === key));
    },

    /**
     * A new companion. `model` is already loaded; `from` (a Vector3) is where it is now, so it drifts over to the
     * viewer's side instead of popping in there. It is saved for the room unless save is false.
     */
    add(model, { gift = null, toy = null, from = null, save = true } = {}) {
      const key = keyOf({ gift, toy });
      const pal = attach(model, { key, from });
      if (save && api && typeof api.saveCompanion === 'function' && (gift || toy)) {
        api.saveCompanion(toy ? { toy } : { giftId: gift.id })
          .then((record) => {
            if (!record) return;
            pal.record = record;
            if (onJoined) { try { onJoined(record); } catch (err) { console.warn(err); } }
          })
          .catch((err) => console.warn('[wishworld] companion not saved:', err && err.message));
      }
      return pal;
    },

    setVisible(on) { visible = Boolean(on); for (const p of pals) p.object.visible = visible; },
    /** The companion ids that follow (null: the newest three). Call reload() after to show them. */
    setFollowing(ids) { followIds = Array.isArray(ids) ? ids.slice(0, MAX_FOLLOWING) : null; },
    get maxFollowing() { return MAX_FOLLOWING; },
    /** Let every follower go from view (the room changed); reload() brings the new room's. */
    clear() {
      epoch++;
      while (pals.length) { const p = pals.pop(); input.removeTarget(p.object); group.remove(p.object); }
    },
    hopAll() { for (const p of pals) p.follower.hop(); },

    update(dt, elapsed) {
      if (!pals.length) return;
      rig.viewerPosition(_head); rig.viewerForward(_fwd);
      for (const p of pals) { p.follower.update(dt, elapsed, _head, _fwd); p.placed = true; }
    },
  };
}
