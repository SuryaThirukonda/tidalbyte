// Frost Slice sound effects: pop (a throw), slice (a cut), buzz (an ice block), success (the round ends),
// plus click and hover for the buttons. Where each sound comes from, best first:
//   1. the shell's own player (ctx.audio.sfx), when the shell has one: it plays the files below, follows the
//      shell's mute and pause, and places the sound in the room;
//   2. the Unity game's own clips, exported as /audio/sfx/<name>.wav and listed in /audio/audio.json
//      (rendered by Unity's Sfx.cs, so they are the game's sounds sample for sample);
//   3. the same recipes (Assets/WishWorld/Scripts/Core/Sfx.cs) rebuilt here sample by sample, for a file
//      that is missing or has not arrived yet.
// Unity makes mono clips at 22,050 Hz and plays them at a point in space (AudioSource.PlayClipAtPoint:
// fully 3D, logarithmic roll-off from 1 m), so 2 and 3 do the same.
//
// Nothing here throws: no Web Audio, or a context the browser has not unlocked yet, means silence.

const RATE = 22050;
const TAU = 6.283;                                   // Unity writes 6.283f, not 2 * PI
const lerp = (a, b, t) => a + (b - a) * t;

/** Sfx.Env: a linear attack over min(0.008, 20% of the length), then a straight decay to zero. */
function env(t, length) {
  if (t < 0 || t > length) return 0;
  const attack = Math.min(0.008, length * 0.2);
  return t < attack ? t / attack : 1 - (t - attack) / (length - attack);
}

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
const noise = makeNoise(7);

/** name -> [seconds, sample(t)] exactly as in Sfx.cs. */
const RECIPES = {
  hover: [0.04, (t) => Math.sin(t * 1300 * TAU) * env(t, 0.04) * 0.4],
  click: [0.08, (t) => Math.sin(t * lerp(650, 980, t / 0.08) * TAU) * env(t, 0.08) * 0.6],
  slice: [0.18, (t) => (noise() * 0.5 + Math.sin(t * lerp(1800, 500, t / 0.18) * TAU) * 0.4) * env(t, 0.18)],
  pop: [0.14, (t) => Math.sin(t * lerp(300, 90, t / 0.14) * TAU) * env(t, 0.14)],
  buzz: [0.3, (t) => Math.sign(Math.sin(t * 140 * TAU)) * env(t, 0.3) * 0.35],
  success: [0.7, (t) => {
    const f = t < 0.15 ? 523 : t < 0.3 ? 659 : t < 0.45 ? 784 : 1047;
    return Math.sin(t * f * TAU) * env(t % 0.15, t < 0.45 ? 0.15 : 0.25) * 0.45;
  }],
};

/** The raw samples of one effect (Float32Array at 22,050 Hz). Exported so a test can check the recipes. */
export function renderEffect(name) {
  const spec = RECIPES[name];
  if (!spec) return null;
  const [seconds, sample] = spec;
  const n = Math.max(1, Math.floor(seconds * RATE));
  const data = new Float32Array(n);
  for (let i = 0; i < n; i++) data[i] = Math.max(-1, Math.min(1, sample(i / RATE)));
  return data;
}

/**
 * shellAudio: ctx.audio. With a shell that has `sfx` every effect goes through it. Otherwise the files and
 * recipes are played here: on the shell's AudioContext when it exposes one (already unlocked by the Enter
 * button, and its listener follows the head), else on a context of our own.
 */
export function createSfx({ shellAudio = null, camera = null, muted = false } = {}) {
  let own = null;                    // our own AudioContext, when the shell has none to share
  let failed = false;
  const buffers = new Map();         // name -> AudioBuffer, per context
  let bufferContext = null;
  let played = 0;
  const shellPlays = Boolean(shellAudio && typeof shellAudio.sfx === 'function');
  const files = new Map();           // name -> AudioBuffer decoded from the exported .wav
  const source = {};                 // name -> 'shell' | 'file' | 'recipe': what the last play used (for checks)
  let filesFor = null;               // the context the files were decoded for

  // Fetch and decode the exported clips once a context exists. Until one has arrived its recipe plays instead.
  function loadFiles(ac) {
    if (filesFor === ac) return;
    filesFor = ac;
    files.clear();
    fetch('/audio/audio.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((index) => {
        const list = index && index.sfx ? index.sfx : {};
        for (const name of Object.keys(RECIPES)) {
          if (!list[name]) continue;
          fetch('/audio/' + list[name])
            .then((r) => (r.ok ? r.arrayBuffer() : null))
            .then((data) => (data ? ac.decodeAudioData(data) : null))
            .then((buffer) => { if (buffer && filesFor === ac) files.set(name, buffer); })
            .catch(() => { /* the recipe stands in */ });
        }
      })
      .catch(() => { /* no index: recipes only */ });
  }

  function context() {
    if (shellAudio) {
      try {
        if (typeof shellAudio.ensureContext === 'function') { const c = shellAudio.ensureContext(); if (c) return c; }
        else if (shellAudio.context) return shellAudio.context;
      } catch { /* fall through to our own */ }
    }
    if (own || failed) return own;
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) { failed = true; return null; }
    try { own = new AC({ latencyHint: 'interactive' }); } catch { failed = true; own = null; }
    return own;
  }

  function bufferFor(ac, name) {
    if (bufferContext !== ac) { buffers.clear(); bufferContext = ac; }
    let b = buffers.get(name);
    if (b) return b;
    const data = renderEffect(name);
    if (!data) return null;
    b = ac.createBuffer(1, data.length, RATE);
    b.getChannelData(0).set(data);
    buffers.set(name, b);
    return b;
  }

  /** Play an effect at `volume` (Unity's number). `at`: a world-space Vector3, or null for a flat sound. */
  function play(name, volume = 1, at = null) {
    played++;
    if (!RECIPES[name]) return false;
    if (shellPlays) {
      source[name] = 'shell';
      try { shellAudio.sfx(name, volume, at); return true; } catch { return false; }
    }
    if (muted) return false;
    const ac = context();
    if (!ac) return false;
    loadFiles(ac);
    if (ac.state !== 'running') return false;
    try {
      const file = files.get(name);
      const buffer = file || bufferFor(ac, name);
      source[name] = file ? 'file' : 'recipe';
      if (!buffer) return false;
      const src = ac.createBufferSource();
      src.buffer = buffer;
      const gain = ac.createGain();
      gain.gain.value = volume;
      src.connect(gain);
      let tail = gain;
      if (at) {
        const pan = ac.createPanner();
        pan.panningModel = 'equalpower';
        pan.distanceModel = 'inverse'; pan.refDistance = 1; pan.rolloffFactor = 1; pan.maxDistance = 500;
        if (pan.positionX) { pan.positionX.value = at.x; pan.positionY.value = at.y; pan.positionZ.value = at.z; }
        else pan.setPosition(at.x, at.y, at.z);
        gain.connect(pan);
        tail = pan;
      }
      tail.connect(ac.destination);
      src.start();
      return true;
    } catch { return false; }
  }

  /** Browsers start audio only after a press: call from one. Only matters for our own context. */
  function unlock() {
    if (shellPlays) return;
    const ac = context();
    if (!ac) return;
    loadFiles(ac);
    if (ac === own && ac.state === 'suspended') ac.resume().catch(() => {});
  }

  /** Keep our own listener on the head (the shell does this for its context). No allocations. */
  function update() {
    if (!own || !camera || own.state !== 'running') return;
    const l = own.listener, e = camera.matrixWorld.elements;
    if (l.positionX) {
      l.positionX.value = e[12]; l.positionY.value = e[13]; l.positionZ.value = e[14];
      l.forwardX.value = -e[8]; l.forwardY.value = -e[9]; l.forwardZ.value = -e[10];
      l.upX.value = e[4]; l.upY.value = e[5]; l.upZ.value = e[6];
    } else if (l.setPosition) {
      l.setPosition(e[12], e[13], e[14]);
      l.setOrientation(-e[8], -e[9], -e[10], e[4], e[5], e[6]);
    }
  }

  function dispose() {
    buffers.clear(); bufferContext = null;
    files.clear(); filesFor = null;
    if (own) { try { own.close(); } catch { /* already closed */ } own = null; }
  }

  return {
    play, unlock, update, dispose,
    setMuted(on) { muted = Boolean(on); },
    get played() { return played; },
    /** Which of the three sources each effect last used, and which exported files are decoded. */
    get sources() { return { ...source, files: [...files.keys()] }; },
  };
}
