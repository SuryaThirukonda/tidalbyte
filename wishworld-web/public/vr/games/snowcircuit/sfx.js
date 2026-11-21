// Snow Circuit sound. The Unity game makes its effects in code (Assets/WishWorld/Scripts/Core/Sfx.cs); the web
// export holds those very clips as WAV files (/audio/sfx, listed in /audio/audio.json), so they are played when
// they load, and the same recipes, rebuilt sample by sample at Unity's 22,050 Hz, stand in when they do not.
//
//   engine   a one-second loop of two saws (70 and 105 Hz) and a little noise; SnowCircuitGame.Update plays it
//            at pitch 0.6 + speed / topSpeed * 1.3, volume 0.22 while racing, easing to 0.06 otherwise
//   click    countdown "3", "2", "1" (0.7) and bumping a rival (0.8)
//   chime    "Go!" and every lap (0.7)
//   success  the finish (0.7)
//
// Unity plays the one-shots at the car, one metre up: 5 cm from the driver's ears, so they are not panned here.
// Nothing in this file throws: no Web Audio, or a context the browser has not unlocked yet, means silence.

const RATE = 22050;
const TAU = 6.283;                                   // Unity writes 6.283f, not 2 * PI
const lerp = (a, b, t) => a + (b - a) * t;

/** Sfx.Env: a linear attack over min(0.008, 20% of the length), then a straight decay to zero. */
function env(t, length) {
  if (t < 0 || t > length) return 0;
  const attack = Math.min(0.008, length * 0.2);
  return t < attack ? t / attack : 1 - (t - attack) / (length - attack);
}
const saw = (phase) => 2 * (phase - Math.floor(phase + 0.5));

// Unity's noise is System.Random(7); any fixed-seed white noise sounds the same.
function makeNoise(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = Math.imul(s ^ (s >>> 15), 1 | s);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return (((x ^ (x >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
}

/** name -> [seconds, sample(t), loop] exactly as in Sfx.cs. */
function recipes() {
  const noise = makeNoise(7);
  return {
    click: [0.08, (t) => Math.sin(t * lerp(650, 980, t / 0.08) * TAU) * env(t, 0.08) * 0.6, false],
    chime: [0.5, (t) => (Math.sin(t * 660 * TAU) * env(t, 0.5) + (t > 0.12 ? Math.sin(t * 990 * TAU) * env(t - 0.12, 0.38) : 0)) * 0.45, false],
    success: [0.7, (t) => {
      const f = t < 0.15 ? 523 : t < 0.3 ? 659 : t < 0.45 ? 784 : 1047;
      return Math.sin(t * f * TAU) * env(t % 0.15, t < 0.45 ? 0.15 : 0.25) * 0.45;
    }, false],
    engine: [1, (t) => (saw(t * 70) * 0.5 + saw(t * 105) * 0.25 + noise() * 0.05) * 0.5, true],
  };
}

/** The raw samples of one sound (Float32Array at 22,050 Hz). Exported so a test can check the recipes. */
export function renderSound(name) {
  const spec = recipes()[name];
  if (!spec) return null;
  const [seconds, sample, loop] = spec;
  const n = Math.max(1, Math.floor(seconds * RATE));
  const data = new Float32Array(n);
  for (let i = 0; i < n; i++) data[i] = Math.max(-1, Math.min(1, sample(i / RATE)));
  if (loop) {
    // Sfx.Crossfade: blend the start into the end so the loop repeats without a click.
    const k = Math.min(Math.floor(n / 8), Math.floor(RATE / 10));
    for (let i = 0; i < k; i++) {
      const u = i / k;
      data[i] = data[i] * u + data[n - k + i] * (1 - u);
    }
  }
  return data;
}

/**
 * shellAudio: ctx.audio. When the shell shares its AudioContext it is used (already unlocked by the Enter
 * button, and suspended with the rest when the headset comes off); otherwise this makes its own, which
 * starts on the first press of anything.
 */
export function createRaceAudio({ shellAudio = null, muted = false } = {}) {
  let own = null, failed = false;
  let out = null, outContext = null;            // our master gain, on whichever context is in use
  const buffers = new Map();                   // name -> AudioBuffer made from the recipe
  const exported = new Map();                  // name -> AudioBuffer decoded from the game's exported WAV
  let preloading = null, preloadContext = null;
  let engine = null;                            // { source, gain, pitch, volume }
  let engineWanted = false;
  let unlockBound = false;

  function context() {
    if (failed) return null;
    let c = null;
    try {
      if (shellAudio && typeof shellAudio.ensureContext === 'function') c = shellAudio.ensureContext();
      else if (shellAudio && shellAudio.context) c = shellAudio.context;
    } catch { c = null; }
    if (!c) {
      if (!own) {
        const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AC) { failed = true; return null; }
        try { own = new AC({ latencyHint: 'interactive' }); } catch { failed = true; return null; }
      }
      c = own;
    }
    if (c !== outContext) {
      outContext = c;
      out = c.createGain();
      out.gain.value = muted ? 0 : 1;
      out.connect(c.destination);
      buffers.clear(); exported.clear(); preloading = null;
      engine = null;
    }
    return c;
  }

  /** Fetch and decode the game's own clips. Resolves when each has loaded or failed; never rejects. */
  function preload() {
    const c = context();
    if (!c) return Promise.resolve();
    if (preloading && preloadContext === c) return preloading;
    preloadContext = c;
    preloading = fetch('/audio/audio.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null), () => null)
      .then((index) => Promise.all(['engine', 'click', 'chime', 'success'].map(async (name) => {
        try {
          const file = index && index.sfx && index.sfx[name] ? index.sfx[name] : `sfx/${name}.wav`;
          const res = await fetch('/audio/' + file);
          if (!res.ok) return;
          const decoded = await c.decodeAudioData(await res.arrayBuffer());
          if (decoded && c === outContext) exported.set(name, decoded);
        } catch { /* the recipe stands in */ }
      })))
      .then(() => {}, () => {});
    return preloading;
  }

  function buffer(name) {
    const c = context();
    if (!c) return null;
    let b = exported.get(name);
    if (b) return b;
    b = buffers.get(name);
    if (!b) {
      const data = renderSound(name);
      if (!data) return null;
      b = c.createBuffer(1, data.length, RATE);
      b.getChannelData(0).set(data);
      buffers.set(name, b);
    }
    return b;
  }

  function unlock() {
    const c = context();
    if (c && c.state === 'suspended' && c === own) c.resume().catch(() => {});
  }
  function bindUnlock() {
    if (unlockBound || typeof window === 'undefined') return;
    unlockBound = true;
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }
  function unbindUnlock() {
    if (!unlockBound) return;
    unlockBound = false;
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  }

  /** A one-shot: 'click' | 'chime' | 'success', at Unity's volume. */
  function play(name, volume = 1) {
    try {
      const c = context();
      if (!c || c.state !== 'running') return false;
      const b = buffer(name);
      if (!b) return false;
      const src = c.createBufferSource();
      src.buffer = b;
      const g = c.createGain();
      g.gain.value = volume;
      src.connect(g); g.connect(out);
      src.onended = () => { try { src.disconnect(); g.disconnect(); } catch { /* gone */ } };
      src.start();
      return true;
    } catch { return false; }
  }

  function startEngine() {
    engineWanted = true;
    bindUnlock();
    preload().then(() => { if (engineWanted) beginEngine(); });
  }

  function beginEngine() {
    try {
      const c = context();
      if (!c || engine) return;
      const b = buffer('engine');
      if (!b) return;
      const source = c.createBufferSource();
      source.buffer = b; source.loop = true;
      const gain = c.createGain();
      gain.gain.value = 0;                                // AudioSource.volume starts at 0 in SnowCircuitGame.Start
      source.playbackRate.value = 0.6;
      source.connect(gain); gain.connect(out);
      source.start();
      engine = { source, gain, pitch: 0.6, volume: 0 };
    } catch { engine = null; }
  }

  /** Every frame: AudioSource.pitch and .volume. */
  function setEngine(pitch, volume) {
    if (!engineWanted || !engine) return;
    if (Math.abs(pitch - engine.pitch) > 0.002) { engine.pitch = pitch; engine.source.playbackRate.value = pitch; }
    if (Math.abs(volume - engine.volume) > 0.0005) { engine.volume = volume; engine.gain.gain.value = volume; }
  }

  function stopEngine() {
    engineWanted = false;
    const e = engine;
    engine = null;
    if (!e) return;
    try { e.gain.gain.value = 0; e.source.stop(); } catch { /* never started */ }
    try { e.source.disconnect(); e.gain.disconnect(); } catch { /* gone */ }
  }

  return {
    play, preload, startEngine, setEngine, stopEngine,
    /** 'exported' when the game's own WAV is in use for a sound, 'recipe' when it is synthesised here. */
    source(name) { return exported.has(name) ? 'exported' : 'recipe'; },
    setMuted(on) { muted = Boolean(on); if (out) out.gain.value = muted ? 0 : 1; },
    get engineRunning() { return Boolean(engine); },
    get engineVolume() { return engine ? engine.volume : 0; },
    get enginePitch() { return engine ? engine.pitch : 0; },
    /** Stop everything and let go of the page listeners. */
    dispose() {
      stopEngine();
      unbindUnlock();
    },
  };
}
