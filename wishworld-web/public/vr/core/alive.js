// Living creatures and touch: makes any model feel alive without rigged animations, and lets a child poke and
// pet things with their bare hands.
//
//   alive.add(holder, { motion, size, creature })   holder = the Object3D something else moves around (a reef
//        swimmer, a follower). Its contents go into an inner pivot, and only the pivot is animated, so movers
//        and followers keep full control of where the holder is.
//   alive.update(dt, t)                              once a frame (main.js)
//
// What every living thing does:
//   idle      bob, sway and a slow breath (squash and stretch), styled by its motion: swim, fly, hop, walk,
//             float or wiggle (the Nemotron plan's "motion" for generated wishes)
//   attention turns, within limits, to look at the child's head when they are near
//   hands     leans toward a hand that comes close; a fingertip poke makes it hop and chirp; a slow open palm
//             over it (petting) makes it squash happily and coo. Works with tracked hands (index fingertip, palm)
//             and with controllers (the grip).
//   voice     now and then a soft chirp from where it is (positional audio), so buddies are heard around you
//
// Hand tracking: the two XR hands are drawn as small spheres (three's primitive hand model, no downloads).
// Pinching already works as "select" everywhere, because the browser reports a pinch as a trigger pull.
import * as THREE from 'three';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';

const MAX_LIVING = 40;
const _head = new THREE.Vector3(), _pos = new THREE.Vector3(), _to = new THREE.Vector3(), _q = new THREE.Quaternion();
const _parentQ = new THREE.Quaternion();

const STYLES = {
  swim:   { bob: 0.012, bobHz: 0.7, sway: 0.10, swayHz: 1.4, roll: 0.06, breath: 0.03 },
  fly:    { bob: 0.025, bobHz: 1.6, sway: 0.05, swayHz: 3.2, roll: 0.10, breath: 0.02 },
  hop:    { bob: 0.0,   bobHz: 0.0, sway: 0.03, swayHz: 0.8, roll: 0.02, breath: 0.04, hopEvery: 2.6 },
  walk:   { bob: 0.006, bobHz: 2.0, sway: 0.02, swayHz: 1.0, roll: 0.09, breath: 0.03 },
  float:  { bob: 0.018, bobHz: 0.45, sway: 0.04, swayHz: 0.5, roll: 0.03, breath: 0.025 },
  wiggle: { bob: 0.008, bobHz: 1.1, sway: 0.08, swayHz: 2.4, roll: 0.05, breath: 0.07 },
};

export function createAlive({ scene, renderer, rig, audio, input, haptic = () => {} }) {
  const living = [];   // { holder, pivot, style, size, creature, seed, lookYaw, lean, hop, squash, pokedAt, pettedAt, nextVoice }

  // ---------- hands ----------
  const factory = new XRHandModelFactory();
  const hands = [0, 1].map((i) => {
    const hand = renderer.xr.getHand(i);
    try { hand.add(factory.createHandModel(hand, 'spheres')); } catch (err) { console.warn('[wishworld] hand model', err && err.message); }
    (rig.object || scene).add(hand);
    return hand;
  });
  const _tip = [new THREE.Vector3(), new THREE.Vector3()];
  const _palm = [new THREE.Vector3(), new THREE.Vector3()];
  const _palmLast = [new THREE.Vector3(), new THREE.Vector3()];
  const touch = [{ tip: null, palm: null, speed: 0, side: 'left' }, { tip: null, palm: null, speed: 0, side: 'right' }];

  /** Fingertips and palms of tracked hands, or the grips of controllers. */
  function readTouch(dt) {
    for (let i = 0; i < 2; i++) {
      const t = touch[i];
      t.tip = null; t.palm = null;
      const joints = hands[i].joints || {};
      const tipJ = joints['index-finger-tip'], palmJ = joints['middle-finger-metacarpal'];
      if (renderer.xr.isPresenting && tipJ && tipJ.visible && palmJ && palmJ.visible) {
        tipJ.getWorldPosition(_tip[i]); palmJ.getWorldPosition(_palm[i]);
        t.tip = _tip[i]; t.palm = _palm[i];
      } else if (input && input.controllers) {
        const side = i === 0 ? 'left' : 'right';
        const h = input.controllers[side];
        if (h && h.tracked && h.grip) { h.grip.getWorldPosition(_tip[i]); t.tip = _tip[i]; t.palm = _tip[i]; }
      }
      t.side = hands[i].userData.handedness || (i === 0 ? 'left' : 'right');
      if (t.palm) { t.speed = dt > 0 ? _palmLast[i].distanceTo(t.palm) / dt : 0; _palmLast[i].copy(t.palm); }
    }
  }
  hands.forEach((hand) => hand.addEventListener('connected', (e) => { hand.userData.handedness = e.data && e.data.handedness; }));

  // ---------- living things ----------
  function add(holder, { motion = 'float', size = 0.3, creature = null, speaker = false } = {}) {
    if (!holder) return null;
    remove(holder);
    const pivot = new THREE.Group();
    pivot.name = 'AlivePivot';
    while (holder.children.length) pivot.add(holder.children[0]);
    holder.add(pivot);
    const entry = {
      holder, pivot, size: Math.max(0.08, size), creature, speaker,
      style: STYLES[motion] || STYLES.float,
      seed: Math.random() * 100, lookYaw: 0, lean: new THREE.Vector3(), hop: 0, squash: 0,
      pokedAt: -10, pettedAt: -10, nextVoice: 6 + Math.random() * 14,
    };
    // (never in userData: three.js clones userData through JSON, and the entry points back at the holder)
    living.push(entry);
    while (living.length > MAX_LIVING) unwrap(living.shift());
    return entry;
  }

  function unwrap(entry) {
    const { holder, pivot } = entry;
    if (pivot.parent === holder) {
      while (pivot.children.length) holder.add(pivot.children[0]);
      holder.remove(pivot);
    }
  }

  function remove(holder) {
    const i = living.findIndex((e) => e.holder === holder);
    if (i >= 0) unwrap(living.splice(i, 1)[0]);
  }

  function poke(e, t, side) {
    e.pokedAt = t; e.hop = 1;
    if (audio && audio.chirp) audio.chirp(e.creature, 0.7, e.holder);
    haptic(side, 0.4, 50);
  }

  let clock = 0;
  function update(dt, t) {
    clock = t;
    readTouch(dt);
    if (!living.length) return;
    rig.viewerPosition(_head);
    // The guide's voice moves the first following buddy: it is the one "speaking".
    const voice = (audio && audio.voiceLevel) || 0;
    const speakerEntry = living.find((x) => x.speaker && x.holder.visible && x.holder.parent) || null;
    for (let k = living.length - 1; k >= 0; k--) {
      const e = living[k];
      if (!e.holder.parent) { living.splice(k, 1); continue; }   // left the scene
      if (!e.holder.visible) continue;
      const s = e.style, ph = t + e.seed, size = e.size;
      e.holder.getWorldPosition(_pos);

      // hands: nearest point, poke, pet
      let nearest = Infinity, nearHand = null;
      for (const h of touch) {
        if (!h.tip) continue;
        const d = h.tip.distanceTo(_pos);
        if (d < nearest) { nearest = d; nearHand = h; }
        // poke: a fingertip right at it
        if (d < size * 0.45 + 0.03 && t - e.pokedAt > 0.8) poke(e, t, h.side);
        // pet: a slow palm just above it
        if (h.palm && h.palm.y > _pos.y && h.palm.distanceTo(_pos) < size * 0.8 + 0.06 && h.speed > 0.05 && h.speed < 0.6 && t - e.pettedAt > 1.5) {
          e.pettedAt = t; e.squash = 1;
          if (audio && audio.sfx) audio.sfx('chime', 0.25, e.holder);
          haptic(h.side, 0.15, 40);
        }
      }

      // lean toward a near hand (in the holder's own frame), relax otherwise
      const reach = size * 2.2 + 0.15;
      if (nearHand && nearest < reach) {
        _to.copy(nearHand.tip).sub(_pos).normalize().multiplyScalar(size * 0.12 * (1 - nearest / reach));
        e.holder.getWorldQuaternion(_parentQ).invert();
        _to.applyQuaternion(_parentQ);
        e.lean.lerp(_to, Math.min(1, dt * 6));
      } else e.lean.multiplyScalar(Math.max(0, 1 - dt * 3));

      // look at the child when they are close: a limited turn of the pivot toward the head
      const headDist = _head.distanceTo(_pos);
      let wantYaw = 0;
      if (headDist < 2.2) {
        e.holder.getWorldQuaternion(_q);
        _to.copy(_head).sub(_pos);
        _to.applyQuaternion(_q.clone().invert());
        wantYaw = THREE.MathUtils.clamp(Math.atan2(_to.x, _to.z), -1.0, 1.0) * (1 - headDist / 2.2) * 1.4;
      }
      e.lookYaw += (wantYaw - e.lookYaw) * Math.min(1, dt * 3);

      // reactions decay
      e.hop = Math.max(0, e.hop - dt * 2.2);
      e.squash = Math.max(0, e.squash - dt * 1.6);

      // idle style
      let y = Math.sin(ph * s.bobHz * Math.PI * 2) * s.bob * (size / 0.3);
      if (s.hopEvery) { const c = (ph % s.hopEvery) / s.hopEvery; y += c < 0.18 ? Math.sin((c / 0.18) * Math.PI) * size * 0.25 : 0; }
      y += Math.sin((1 - e.hop) * Math.PI) * e.hop * size * 0.5;                       // poked: a happy hop
      const breath = Math.sin(ph * 1.3) * s.breath + e.squash * 0.18 * Math.sin(t * 18) + e.hop * 0.1;
      e.pivot.position.set(e.lean.x, y + e.lean.y, e.lean.z);
      e.pivot.rotation.set(
        Math.sin(ph * s.swayHz * 0.7) * s.sway * 0.4,
        e.lookYaw + Math.sin(ph * s.swayHz * Math.PI) * s.sway,
        Math.sin(ph * s.swayHz * 1.1 + 1) * s.roll,
      );
      e.pivot.scale.set(1 - breath * 0.5, 1 + breath, 1 - breath * 0.5);
      if (e === speakerEntry && voice > 0.02) {
        // Talking: a stretch on each syllable, a little nod and lift, as if the words come from it.
        e.pivot.scale.y *= 1 + voice * 0.22;
        e.pivot.scale.x *= 1 - voice * 0.06; e.pivot.scale.z *= 1 - voice * 0.06;
        e.pivot.rotation.x += voice * 0.18;
        e.pivot.position.y += voice * size * 0.06;
      }

      // now and then a soft call from where it is
      e.nextVoice -= dt;
      if (e.nextVoice <= 0) {
        e.nextVoice = 10 + Math.random() * 20;
        if (headDist < 6 && audio && audio.chirp) audio.chirp(e.creature, 0.25, e.holder);
      }
    }
  }

  return {
    add, remove, update, hands,
    /** Where the fingertips (or controller grips) are this frame: [left, right], null when not tracked. */
    tips() { return touch.map((h) => h.tip); },
    get count() { return living.length; },
    /** Debug and tests: pretend a fingertip is here this frame. */
    pokeAt(point) { for (const e of living) { e.holder.getWorldPosition(_pos); if (_pos.distanceTo(point) < e.size * 0.45 + 0.03) poke(e, clock, 'right'); } },
  };
}
