// Snow Hoops sounds. The game's existing effects come from the shell (ctx.audio.sfx: the Unity clips in
// /audio/sfx): buzz is the end buzzer, pop the grab, chime the money ball, success the results card. The project
// has no swish or rim clank, so those two (and a soft board thud) are made here, the same way Frost Slice and the
// shell build their fallback effects: short recipes rendered once into buffers on the shell's AudioContext.
//
// Nothing here throws. ?mute=1 or a context the Enter press has not unlocked yet means silence.

const RATE = 22050;
const SHELL = new Set(['buzz', 'pop', 'chime', 'success', 'click']);

function makeNoise(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = Math.imul(s ^ (s >>> 15), 1 | s);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return (((x ^ (x >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
}

/** name -> (data: Float32Array) fills the samples. */
const RECIPES = {
  // the net: soft filtered noise that swells and fades, with a gentle downward sweep
  swish: [0.42, (d) => {
    const noise = makeNoise(11), n = d.length;
    let lp = 0, lp2 = 0;
    for (let i = 0; i < n; i++) {
      const u = i / n, cut = 0.35 - 0.25 * u;
      lp += (noise() - lp) * cut; lp2 += (lp - lp2) * cut;
      const env = Math.sin(Math.PI * Math.min(1, u * 1.6)) ** 2 * (1 - u);
      d[i] = (lp - lp2 * 0.6) * env * 2.4;
    }
  }],
  // the rim: a few inharmonic partials, struck and ringing out quickly
  clank: [0.4, (d) => {
    const noise = makeNoise(5);
    for (let i = 0; i < d.length; i++) {
      const t = i / RATE;
      const ring = Math.sin(t * 523 * 6.283) * 0.45 + Math.sin(t * 1397 * 6.283) * 0.3 + Math.sin(t * 2311 * 6.283) * 0.2 + Math.sin(t * 3770 * 6.283) * 0.1;
      d[i] = (ring * Math.exp(-t * 11) + noise() * Math.exp(-t * 90) * 0.5) * 0.7;
    }
  }],
  // the backboard: a short low thump
  board: [0.12, (d) => {
    for (let i = 0; i < d.length; i++) { const t = i / RATE; d[i] = Math.sin(t * (180 - 600 * t) * 6.283) * Math.exp(-t * 35) * 0.8; }
  }],
};

/** The raw samples of one made effect (for checks). */
export function renderEffect(name) {
  const r = RECIPES[name];
  if (!r) return null;
  const data = new Float32Array(Math.floor(r[0] * RATE));
  r[1](data);
  for (let i = 0; i < data.length; i++) data[i] = Math.max(-1, Math.min(1, data[i]));
  return data;
}

export function createSfx(ctx, { muted = false } = {}) {
  const buffers = new Map();
  let bufferContext = null;
  const played = {};

  function play(name, volume = 1, at = null) {
    played[name] = (played[name] || 0) + 1;
    if (muted) return false;
    const audio = ctx.audio;
    if (!audio) return false;
    if (SHELL.has(name)) { try { audio.sfx(name, volume, at); return true; } catch { return false; } }
    const ac = audio.context;
    if (!ac || ac.state !== 'running' || !RECIPES[name]) return false;
    try {
      if (bufferContext !== ac) { buffers.clear(); bufferContext = ac; }
      let buffer = buffers.get(name);
      if (!buffer) {
        const data = renderEffect(name);
        buffer = ac.createBuffer(1, data.length, RATE);
        buffer.getChannelData(0).set(data);
        buffers.set(name, buffer);
      }
      const src = ac.createBufferSource(), gain = ac.createGain();
      src.buffer = buffer; gain.gain.value = volume;
      src.connect(gain);
      let tail = gain;
      if (at) {
        const pan = ac.createPanner();
        pan.panningModel = 'equalpower'; pan.distanceModel = 'inverse'; pan.refDistance = 1.5; pan.rolloffFactor = 0.6;
        if (pan.positionX) { pan.positionX.value = at.x; pan.positionY.value = at.y; pan.positionZ.value = at.z; } else pan.setPosition(at.x, at.y, at.z);
        gain.connect(pan); tail = pan;
      }
      tail.connect(ac.destination);
      src.start();
      return true;
    } catch { return false; }
  }

  return {
    play,
    get played() { return { ...played }; },
    dispose() { buffers.clear(); bufferContext = null; },
  };
}
