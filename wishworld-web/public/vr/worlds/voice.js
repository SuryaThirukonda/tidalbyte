// The guide's voice and the sound effects for the worlds tab, on whatever the host gives us.
//
// With the headset shell this is a thin layer over ctx.guide (Unity's GuideVoice: caption bubble and one
// voice channel) and ctx.audio (the recorded voice bank first, live speech otherwise; the game's own
// effects). On a host that only has the contract's audio { chime, pop, speak, playUrl, stop } it does the
// same job itself: it looks lines up in /audio/audio.json, shows its own caption, and loops the world's
// background sound with Web Audio.

import * as THREE from 'three';

const AUDIO_ROOT = '/audio/';
const voiceKey = (text) => String(text || '').trim().toLowerCase().split(/\s+/).filter(Boolean).join(' ');

const _head = new THREE.Vector3(), _fwd = new THREE.Vector3();

export function createVoice(ctx, group) {
  const audio = ctx.audio || {};
  const guide = ctx.guide && typeof ctx.guide.say === 'function' ? ctx.guide : null;
  const shellAudio = typeof audio.hasLine === 'function';      // the shell's audio knows the voice bank itself

  // ---- the recorded lines, for hosts whose speak() does not know them -----------------------------------
  let bank = null, bankPromise = null;
  function loadBank() {
    if (!bankPromise) {
      bankPromise = fetch(AUDIO_ROOT + 'audio.json').then((r) => (r.ok ? r.json() : null)).then((data) => {
        bank = new Map();
        for (const line of (data && data.voice) || []) if (line && line.file) bank.set(line.key || voiceKey(line.text), line);
        return bank;
      }).catch(() => { bank = new Map(); return bank; });
    }
    return bankPromise;
  }

  let token = 0, chain = Promise.resolve();
  async function speakPlain(text) {
    // The recorded Unity line when there is one, the host's own voice when there is not.
    const lines = await loadBank();
    const line = lines.get(voiceKey(text));
    if (line && typeof audio.playUrl === 'function') return audio.playUrl(AUDIO_ROOT + line.file);
    if (typeof audio.speak === 'function') return audio.speak(text);
    return undefined;
  }

  // ---- a caption of our own, when the host has no guide ---------------------------------------------------
  let caption = null, captionUntil = 0, clock = 0;
  function showCaption(text) {
    if (!ctx.ui || typeof ctx.ui.makeTextPanel !== 'function') return;
    if (!caption) {
      caption = ctx.ui.makeTextPanel(text, { width: 1.0, fontSize: 0.042 });
      caption.name = 'WorldsCaption';
      caption.renderOrder = 20;
      group.add(caption);
    } else caption.setText(text);
    // GuideVoice.Speak: 1.1 m in front of where the player is facing, 0.5 m below eye level, tilted back 24 degrees.
    ctx.viewerPosition(_head);
    ctx.viewerForward(_fwd);
    _fwd.y = 0;
    if (_fwd.lengthSq() < 1e-4) _fwd.set(0, 0, -1);
    _fwd.normalize();
    caption.position.set(_head.x + _fwd.x * 1.1, _head.y - 0.5, _head.z + _fwd.z * 1.1);
    caption.rotation.set(-24 * Math.PI / 180, Math.atan2(-_fwd.x, -_fwd.z), 0, 'YXZ');
    caption.visible = true;
    captionUntil = clock + Math.min(8, Math.max(2.5, 1.8 + text.length * 0.055));
  }

  function run(text, withCaption, now) {
    if (typeof text !== 'string' || !text.trim()) return Promise.resolve();
    if (now) {
      // SayNow / ReadNow: whatever was waiting is dropped.
      token++;
      if (guide) chain = Promise.resolve(guide.say(text, { queue: false, caption: withCaption })).catch(() => {});
      else {
        if (typeof audio.stop === 'function') audio.stop();
        if (withCaption) showCaption(text);
        chain = Promise.resolve(shellAudio ? audio.speak(text) : speakPlain(text)).catch(() => {});
      }
      return chain;
    }
    // Say: after the line being spoken, so its caption comes up when its turn does.
    const mine = token;
    chain = chain.then(() => {
      if (mine !== token) return undefined;
      if (guide) return guide.say(text, { queue: true, caption: withCaption });
      if (withCaption) showCaption(text);
      return shellAudio ? audio.speak(text, { queue: true }) : speakPlain(text);
    }).catch(() => {});
    return chain;
  }

  // ---- the world's background loop, when the host's audio has none ----------------------------------------
  // Sfx.Ambient: four seconds of filtered noise (or a hum), played at volume 0.22.
  let loopCtx = null, loopSource = null, loopGain = null, loopName = null;
  const loopBuffers = new Map();

  function synthLoop(context, name) {
    const rate = 22050, n = rate * 4;
    const buffer = context.createBuffer(1, n, rate);
    const data = buffer.getChannelData(0);
    const kind = name === 'amb_water' ? 0 : name === 'amb_wind' ? 1 : name === 'amb_hum' ? 2 : 3;
    let low = 0, seed = 12345;
    const noise = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x3fffffff - 1; };
    for (let i = 0; i < n; i++) {
      const t = i / rate;
      let v;
      if (kind === 2) v = (Math.sin(t * 55 * 6.283) + Math.sin(t * 82.5 * 6.283) * 0.6) * 0.25 * (0.8 + 0.2 * Math.sin(t * 1.57));
      else {
        const alpha = kind === 0 ? 0.02 : kind === 1 ? 0.06 : 0.12;
        low += (noise() - low) * alpha;
        v = kind === 0 ? low * (0.8 + 0.2 * Math.sin(t * 1.57)) * 6
          : kind === 1 ? low * (0.6 + 0.4 * Math.sin(t * 1.57)) * 2.5
            : low * (0.5 + 0.2 * Math.sin(t * 3.14)) * 2.5;
      }
      data[i] = Math.max(-1, Math.min(1, v));
    }
    // Blend the first tenth of a second into the end so the loop repeats cleanly.
    const fade = Math.floor(rate * 0.1);
    for (let i = 0; i < fade; i++) { const k = i / fade; data[n - fade + i] = data[n - fade + i] * (1 - k) + data[i] * k; }
    return buffer;
  }

  function stopLoop() {
    if (loopSource) {
      try { loopGain.gain.setTargetAtTime(0, loopCtx.currentTime, 0.12); loopSource.stop(loopCtx.currentTime + 0.5); } catch { /* already stopped */ }
      loopSource = null; loopGain = null;
    }
  }

  async function ownAmbient(name) {
    if (name === loopName) return;
    loopName = name || null;
    stopLoop();
    if (!loopName) return;
    try {
      if (!loopCtx) {
        const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AC) return;
        loopCtx = (typeof audio.ensureContext === 'function' && audio.ensureContext()) || new AC();
      }
      if (loopCtx.state === 'suspended') loopCtx.resume().catch(() => {});
      const wanted = loopName;
      let buffer = loopBuffers.get(wanted);
      if (!buffer) {
        try {
          const res = await fetch(AUDIO_ROOT + 'sfx/' + wanted + '.wav');
          if (res.ok) buffer = await loopCtx.decodeAudioData(await res.arrayBuffer());
        } catch { buffer = null; }
        if (!buffer) buffer = synthLoop(loopCtx, wanted);
        loopBuffers.set(wanted, buffer);
      }
      if (wanted !== loopName || loopSource) return;
      loopSource = loopCtx.createBufferSource();
      loopSource.buffer = buffer; loopSource.loop = true;
      loopGain = loopCtx.createGain();
      loopGain.gain.value = 0;
      loopGain.gain.setTargetAtTime(0.22, loopCtx.currentTime, 0.3);
      loopSource.connect(loopGain); loopGain.connect(loopCtx.destination);
      loopSource.start();
    } catch (err) {
      console.warn('[wishworld] worlds: no background sound', err && err.message);
    }
  }

  return {
    /** GuideVoice.Say: caption and voice, after anything already being said. */
    say(text) { return run(text, true, false); },
    /** GuideVoice.SayNow: drop what was waiting and say this, with a caption. */
    sayNow(text) { return run(text, true, true); },
    /** GuideVoice.ReadNow: voice only, now, for words that are already on a panel. */
    read(text) { return run(text, false, true); },
    /** GuideVoice.Hush. */
    hush() {
      token++;
      chain = Promise.resolve();
      if (guide && typeof guide.hush === 'function') guide.hush();
      else if (typeof audio.stop === 'function') audio.stop();
      if (caption) caption.visible = false;
    },
    /** A creature's chirp (0.8) and the chime (0.5), where the creature is: Creature.Learn. */
    learned(creature, at) {
      if (typeof audio.chirp === 'function') audio.chirp(creature, 0.8, at);
      if (typeof audio.sfx === 'function') audio.sfx('chime', 0.5, at);
      else if (typeof audio.chime === 'function') audio.chime();
    },
    /** Quiz verdict: Sfx.Success at 0.6 or Sfx.Buzz at 0.4. */
    verdict(right, at) {
      if (typeof audio.sfx === 'function') audio.sfx(right ? 'success' : 'buzz', right ? 0.6 : 0.4, at);
      else if (right && typeof audio.chime === 'function') audio.chime();
      else if (!right && typeof audio.pop === 'function') audio.pop();
    },
    /**
     * The world's background loop ('amb_water' | 'amb_wind' | 'amb_hum' | 'amb_outdoor' | null), at Unity's 0.22.
     * `shellDoesIt` says the shell's environment already started the right one.
     */
    ambient(name, shellDoesIt = false) {
      if (typeof audio.setAmbient === 'function') { if (!shellDoesIt) audio.setAmbient(name || null); return; }
      ownAmbient(name || null);
    },
    /** Call from a trigger pull: browsers only start sound after one. */
    unlock() { if (loopCtx && loopCtx.state === 'suspended') loopCtx.resume().catch(() => {}); },
    update(dt) {
      clock += dt;
      if (caption && caption.visible && clock >= captionUntil) caption.visible = false;
    },
    dispose() {
      token++;
      ownAmbient(null);
      if (caption) { if (caption.dispose) caption.dispose(); else group.remove(caption); caption = null; }
    },
  };
}
