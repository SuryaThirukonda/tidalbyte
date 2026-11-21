// Sound: Web Audio. Effects are the Unity game's own (exported to /audio/sfx, or rebuilt from the same
// formulas in Scripts/Core/Sfx.cs when a file is missing); speech is the game's recorded voice bank when the
// line is in /audio/audio.json, the same ElevenLabs voice through /api/tts when it is not (one request per
// line per session; the server caches by text too), and the browser's own voice if that fails.
//
// One voice channel: two spoken lines never overlap (Scripts/Core/GuideVoice.cs). Effects are positional
// where a position is given; the voice is not, as in Unity. Nothing here throws: a missing file, a blocked
// AudioContext or a failed request means silence and a resolved promise.

import * as THREE from 'three';

const AUDIO_ROOT = '/audio/';
const RATE = 22050;

/** Same line, same key, whatever the spacing or capitals (VoiceBank.Key). */
export function voiceKey(text) {
  return typeof text === 'string' ? text.trim().toLowerCase().split(/\s+/).filter(Boolean).join(' ') : '';
}

// ---- Unity's synthesised effects, for when /audio/sfx is not there ---------------------------------

function env(t, length) {
  if (t < 0 || t > length) return 0;
  const attack = Math.min(0.008, length * 0.2);
  return t < attack ? t / attack : 1 - (t - attack) / (length - attack);
}
const TAU = 6.283;
const lerp = (a, b, t) => a + (b - a) * t;
const SYNTH = {
  hover: [0.04, (t) => Math.sin(t * 1300 * TAU) * env(t, 0.04) * 0.4],
  click: [0.08, (t) => Math.sin(t * lerp(650, 980, t / 0.08) * TAU) * env(t, 0.08) * 0.6],
  pop: [0.14, (t) => Math.sin(t * lerp(300, 90, t / 0.14) * TAU) * env(t, 0.14)],
  chime: [0.5, (t) => (Math.sin(t * 660 * TAU) * env(t, 0.5) + (t > 0.12 ? Math.sin(t * 990 * TAU) * env(t - 0.12, 0.38) : 0)) * 0.45],
  buzz: [0.3, (t) => Math.sign(Math.sin(t * 140 * TAU)) * env(t, 0.3) * 0.35],
  success: [0.7, (t) => {
    const f = t < 0.15 ? 523 : t < 0.3 ? 659 : t < 0.45 ? 784 : 1047;
    return Math.sin(t * f * TAU) * env(t % 0.15, t < 0.45 ? 0.15 : 0.25) * 0.45;
  }],
  slice: [0.18, (t) => ((Math.random() * 2 - 1) * 0.5 + Math.sin(t * lerp(1800, 500, t / 0.18) * TAU) * 0.4) * env(t, 0.18)],
};
function chirpSynth(pitch) {
  const p = Math.round(Math.min(3, Math.max(0.3, pitch)) * 20);
  return [0.22, (t) => Math.sin(t * 440 * (p / 20) * (1 + t * 2) * TAU) * env(t, 0.22) * 0.5];
}

export function createAudio({ api = null, camera = null } = {}) {
  let ctx = null;
  let master = null, sfxBus = null, voiceBus = null, loopBus = null;
  let index = null;                           // audio.json, once loaded
  let indexPromise = null;
  const voiceByKey = new Map();               // key -> { file, seconds }
  const buffers = new Map();                  // url -> Promise<AudioBuffer|null>
  const ttsUrls = new Map();                  // key -> Promise<url|null>
  const synthBuffers = new Map();
  let muted = false;
  let volume = 1;                // the profile's sound volume, 0..1 (Settings)
  let voiceOn = true;            // the guide's voice; captions still show when it is off (Settings)

  // voice channel
  let token = 0;                              // bumps whenever the voice is taken over or hushed
  let current = null;                         // { source | element, finish }
  let chain = Promise.resolve();              // queued lines
  let speaking = false;
  let lastSpoken = '';
  const listeners = new Set();                // told (text, seconds) when a line starts

  // ambient loop
  let loopName = null, loopSource = null, loopGain = null;

  function ensureContext() {
    if (ctx) return ctx;
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC({ latencyHint: 'interactive' });
      master = ctx.createGain(); master.gain.value = muted ? 0 : volume; master.connect(ctx.destination);
      sfxBus = ctx.createGain(); sfxBus.connect(master);
      voiceBus = ctx.createGain(); voiceBus.connect(master);
      loopBus = ctx.createGain(); loopBus.connect(master);
    } catch (err) {
      console.warn('[wishworld] no audio on this device', err && err.message);
      ctx = null;
    }
    return ctx;
  }

  /** Call from a button press: browsers only start audio after one. Safe to call again. */
  function unlock() {
    const c = ensureContext();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
    // Have the everyday effects decoded before the first hover, so they play without a gap.
    loadIndex().then((data) => {
      if (!ctx || !data || !data.sfx) return;
      for (const name of ['hover', 'click', 'chime', 'pop']) if (data.sfx[name]) fetchBuffer(AUDIO_ROOT + data.sfx[name]);
    });
    return Boolean(c);
  }

  function loadIndex() {
    if (!indexPromise) {
      indexPromise = fetch(AUDIO_ROOT + 'audio.json', { cache: 'no-cache' })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          index = data || {};
          for (const line of (index.voice || [])) {
            if (!line || !line.file) continue;
            voiceByKey.set(line.key || voiceKey(line.text), line);
          }
          return index;
        })
        .catch(() => { index = {}; return index; });
    }
    return indexPromise;
  }

  function fetchBuffer(url) {
    let p = buffers.get(url);
    if (!p) {
      p = (async () => {
        const c = ensureContext();
        if (!c) return null;
        try {
          const res = await fetch(url);
          if (!res.ok) return null;
          const data = await res.arrayBuffer();
          return await c.decodeAudioData(data);
        } catch { return null; }
      })();
      buffers.set(url, p);
      p.then((b) => { if (!b) buffers.delete(url); });
    }
    return p;
  }

  function synth(name, spec) {
    let b = synthBuffers.get(name);
    if (b || !ctx) return b || null;
    const [seconds, fn] = spec;
    const n = Math.max(1, Math.floor(seconds * RATE));
    b = ctx.createBuffer(1, n, RATE);
    const data = b.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = Math.max(-1, Math.min(1, fn(i / RATE)));
    synthBuffers.set(name, b);
    return b;
  }

  const _pos = new THREE.Vector3();
  function playBuffer(buffer, volume, at, bus) {
    if (!buffer || !ctx || ctx.state !== 'running') return null;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    src.connect(gain);
    let tail = gain;
    if (at) {
      // A cheap equal-power panner: effects come from where they happen, as with Unity's PlayClipAtPoint.
      const position = at.isObject3D ? at.getWorldPosition(_pos) : at;
      const pan = ctx.createPanner();
      pan.panningModel = 'equalpower'; pan.distanceModel = 'inverse';
      pan.refDistance = 1.2; pan.rolloffFactor = 0.8; pan.maxDistance = 30;
      if (pan.positionX) { pan.positionX.value = position.x; pan.positionY.value = position.y; pan.positionZ.value = position.z; }
      else pan.setPosition(position.x, position.y, position.z);
      gain.connect(pan);
      tail = pan;
    }
    tail.connect(bus || sfxBus);
    src.start();
    return src;
  }

  /**
   * Play one of the game's effects by name: hover, click, pop, chime, buzz, success, slice.
   * `at` is an optional THREE.Vector3 or Object3D to place the sound in the room.
   */
  function sfx(name, volume = 1, at = null) {
    if (!ctx || ctx.state !== 'running') return;
    const file = index && index.sfx ? index.sfx[name] : null;
    if (file) {
      fetchBuffer(AUDIO_ROOT + file).then((b) => {
        if (b) playBuffer(b, volume, at);
        else if (SYNTH[name]) playBuffer(synth(name, SYNTH[name]), volume, at);
      });
      return;
    }
    if (SYNTH[name]) playBuffer(synth(name, SYNTH[name]), volume, at);
  }

  /** A creature's own chirp (its voicePitch in the Unity library). */
  function chirp(creature, volume = 0.8, at = null) {
    if (!ctx || ctx.state !== 'running') return;
    const id = creature && typeof creature === 'object' ? creature.id : creature;
    const pitch = creature && typeof creature === 'object' ? Number(creature.voicePitch ?? creature.pitch) || 1 : 1;
    const file = index && index.chirps ? index.chirps[id] : null;
    const fallback = () => playBuffer(synth('chirp' + Math.round(pitch * 20), chirpSynth(pitch)), volume, at);
    if (file) fetchBuffer(AUDIO_ROOT + file).then((b) => (b ? playBuffer(b, volume, at) : fallback()));
    else fallback();
  }

  // ---- the voice ---------------------------------------------------------------------------------------

  function stopCurrent() {
    const c = current;
    current = null;
    if (!c) return;
    try { if (c.source) { c.source.onended = null; c.source.stop(); } } catch { /* already stopped */ }
    try { if (c.element) { c.element.onended = null; c.element.onerror = null; c.element.pause(); } } catch { /* fine */ }
    try { if (c.utterance && globalThis.speechSynthesis) globalThis.speechSynthesis.cancel(); } catch { /* fine */ }
    c.finish();
  }

  // The last resort when the recorded bank has no such line and /api/tts cannot make one (monthly quota,
  // no network): the browser's own voice, so the child still hears the words. Resolves when it has finished.
  function browserSpeak(text, mine) {
    return new Promise((resolve) => {
      const synth = globalThis.speechSynthesis;
      if (!synth || typeof globalThis.SpeechSynthesisUtterance !== 'function' || muted || mine !== token) { resolve(); return; }
      let done = false, timer = null;
      const finish = () => { if (done) return; done = true; clearTimeout(timer); if (current && current.finish === finish) current = null; speaking = Boolean(current); resolve(); };
      try {
        const u = new globalThis.SpeechSynthesisUtterance(text);
        u.rate = 0.95; u.pitch = 1.15; u.volume = 1;
        u.onend = finish; u.onerror = finish;
        stopCurrent();
        current = { utterance: u, finish }; speaking = true;
        synth.speak(u);
        for (const fn of listeners) { try { fn(text, 0); } catch { /* listener's problem */ } }
        timer = setTimeout(finish, Math.min(20000, 2500 + text.length * 90));   // some browsers never report the end
      } catch { finish(); }
    });
  }

  // Play a decoded buffer or, failing that, the URL through an <audio> element, on the voice channel.
  function playVoice(url, mine, text) {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => { if (done) return; done = true; if (current && current.finish === finish) current = null; speaking = Boolean(current); resolve(); };
      const startElement = () => {
        if (mine !== token) { finish(); return; }
        try {
          const el = new Audio(url);
          el.crossOrigin = 'anonymous';
          el.volume = muted ? 0 : volume;
          el.onended = finish; el.onerror = finish;
          stopCurrent();
          current = { element: el, finish }; speaking = true;
          const p = el.play();
          if (p && p.catch) p.catch(finish);
          for (const fn of listeners) { try { fn(text, 0); } catch { /* listener's problem */ } }
          setTimeout(finish, 30000);
        } catch { finish(); }
      };
      if (!ensureContext() || ctx.state !== 'running') {
        // No Web Audio (not unlocked yet): an <audio> element may still be allowed; otherwise stay silent.
        if (ctx) { finish(); return; }
        startElement();
        return;
      }
      fetchBuffer(url).then((buffer) => {
        if (mine !== token) { finish(); return; }            // something newer took over while this was loading
        if (!buffer) { startElement(); return; }
        stopCurrent();
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(voiceBus);
        src.onended = finish;
        current = { source: src, finish }; speaking = true;
        try { src.start(); } catch { finish(); return; }
        for (const fn of listeners) { try { fn(text, buffer.duration); } catch { /* listener's problem */ } }
      });
    });
  }

  async function urlFor(text) {
    await loadIndex();
    const key = voiceKey(text);
    const line = voiceByKey.get(key);
    if (line) return AUDIO_ROOT + line.file;                 // recorded in the Unity voice bank
    if (!api || typeof api.tts !== 'function') return null;
    let p = ttsUrls.get(key);
    if (!p) {
      p = Promise.resolve().then(() => api.tts(text)).then((url) => url || null).catch(() => null);
      ttsUrls.set(key, p);
      p.then((url) => { if (!url) ttsUrls.delete(key); });
    }
    return p;
  }

  /**
   * Say a line in the game's voice. Resolves when it has finished (or could not be played).
   * By default a new line takes over from whatever is being said (GuideVoice.SayNow / ReadNow);
   * { queue: true } waits its turn instead (GuideVoice.Say / Read).
   */
  function speak(text, { queue = false } = {}) {
    if (typeof text !== 'string' || !text.trim()) return Promise.resolve();
    if (!voiceOn) { lastSpoken = text; return Promise.resolve(); }   // voice off: the caption is enough
    const run = async (mine) => {
      try {
        lastSpoken = text;
        const url = await urlFor(text);
        if (mine !== token) return;
        if (!url) { await browserSpeak(text, mine); return; }
        await playVoice(url, mine, text);
      } catch { /* silence */ }
    };
    if (queue) {
      const mine = token;
      chain = chain.then(() => (mine === token ? run(mine) : undefined));
      return chain;
    }
    const mine = ++token;
    stopCurrent();
    chain = run(mine);
    return chain;
  }

  /** Name the thing being pointed at: only a recorded line, and only when nothing else is being said. */
  function hint(text) {
    if (!text || speaking || !index) return;
    const line = voiceByKey.get(voiceKey(String(text).replace(/\s*\d.*$/, '')));
    if (!line) return;
    const mine = token;
    playVoice(AUDIO_ROOT + line.file, mine, text);
  }

  /** True when the line is in the recorded voice bank (plays at once, no network call). */
  function hasLine(text) { return voiceByKey.has(voiceKey(text)); }
  function lineSeconds(text) { const l = voiceByKey.get(voiceKey(text)); return l ? Number(l.seconds) || 0 : 0; }

  /** Play a sound file (a letter's voice clip) on the voice channel. Resolves when it ends. */
  function playUrl(url, { queue = false } = {}) {
    if (!url || typeof url !== 'string') return Promise.resolve();
    if (queue) {
      const mine = token;
      chain = chain.then(() => (mine === token ? playVoice(url, mine, '') : undefined)).catch(() => {});
      return chain;
    }
    const mine = ++token;
    stopCurrent();
    chain = playVoice(url, mine, '').catch(() => {});
    return chain;
  }

  /** Stop talking and forget what was waiting (GuideVoice.Hush). Effects that are already ringing finish. */
  function stop() {
    token++;
    stopCurrent();
    speaking = false;
    chain = Promise.resolve();
  }

  /** The looping background bed of a world: 'amb_water' | 'amb_wind' | 'amb_hum' | 'amb_outdoor' | null. */
  function setAmbient(name, volume = 0.22) {
    if (name === loopName) return;
    loopName = name || null;
    if (loopSource) {
      const old = loopSource, g = loopGain;
      loopSource = null; loopGain = null;
      try { g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4); old.stop(ctx.currentTime + 0.45); } catch { /* gone */ }
    }
    if (!loopName || !ctx) return;
    const file = index && index.sfx ? index.sfx[loopName] : null;
    if (!file) return;
    const wanted = loopName;
    fetchBuffer(AUDIO_ROOT + file).then((b) => {
      if (!b || wanted !== loopName || loopSource || !ctx) return;
      loopSource = ctx.createBufferSource();
      loopSource.buffer = b; loopSource.loop = true;
      loopGain = ctx.createGain();
      loopGain.gain.value = 0;
      loopGain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.8);
      loopSource.connect(loopGain); loopGain.connect(loopBus);
      try { loopSource.start(); } catch { loopSource = null; }
    });
  }

  const _fwd = new THREE.Vector3(), _up = new THREE.Vector3(), _at = new THREE.Vector3();
  /** Keep the listener on the head so positional effects stay put as the viewer turns. */
  function update() {
    if (!ctx || !camera || ctx.state !== 'running') return;
    const l = ctx.listener;
    _at.setFromMatrixPosition(camera.matrixWorld);
    _fwd.setFromMatrixColumn(camera.matrixWorld, 2).negate();
    _up.setFromMatrixColumn(camera.matrixWorld, 1);
    if (l.positionX) {
      l.positionX.value = _at.x; l.positionY.value = _at.y; l.positionZ.value = _at.z;
      l.forwardX.value = _fwd.x; l.forwardY.value = _fwd.y; l.forwardZ.value = _fwd.z;
      l.upX.value = _up.x; l.upY.value = _up.y; l.upZ.value = _up.z;
    } else if (l.setPosition) {
      l.setPosition(_at.x, _at.y, _at.z);
      l.setOrientation(_fwd.x, _fwd.y, _fwd.z, _up.x, _up.y, _up.z);
    }
  }

  /** Quiet everything while the headset is taken off or the page is hidden, and bring it back after. */
  function setPaused(paused) {
    if (!ctx) return;
    if (paused && ctx.state === 'running') ctx.suspend().catch(() => {});
    if (!paused && ctx.state === 'suspended') ctx.resume().catch(() => {});
    if (current && current.element) { try { if (paused) current.element.pause(); else current.element.play().catch(() => {}); } catch { /* fine */ } }
  }

  function setMuted(on) { muted = Boolean(on); if (master) master.gain.value = muted ? 0 : volume; }
  /** Overall volume, 0..1 (the profile's setting). */
  function setVolume(v) { volume = Math.min(1, Math.max(0, Number(v))); if (!Number.isFinite(volume)) volume = 1; if (master) master.gain.value = muted ? 0 : volume; }
  /** The guide's voice on or off. Off stops what is being said now and skips lines until it is on again. */
  function setVoiceEnabled(on) { voiceOn = on !== false; if (!voiceOn) stop(); }

  return {
    // the contract
    chime(at = null) { sfx('chime', 0.5, at); },
    pop(at = null) { sfx('pop', 0.35, at); },
    speak, playUrl, stop,
    // extras
    unlock, sfx, chirp, hint, hasLine, lineSeconds, setAmbient, update, setPaused, setMuted, setVolume, setVoiceEnabled, loadIndex,
    get volume() { return volume; },
    get voiceEnabled() { return voiceOn; },
    /** Resolves when everything said or queued so far has finished. */
    whenIdle() { return chain.catch(() => {}); },
    onLine(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    get speaking() { return speaking; },
    get lastSpoken() { return lastSpoken; },
    get context() { return ctx; },
    /** A MediaStream destination is not needed by anything yet; the context is exposed for tabs that analyse the microphone. */
    ensureContext,
  };
}
