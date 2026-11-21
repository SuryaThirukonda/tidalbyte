// Makes the sound files used to test Calm's breath detector with Chrome's pretend microphone
// (--use-file-for-fake-audio-capture). Everything is synthetic: steady hissy noise for breaths, very short
// loud bursts for claps, stacked harmonics for a voice. Real breaths on a real headset microphone still
// have to be tried by a person.
//
//   node make-wavs.mjs <out folder>
//
// Exports makeWavs(outDir) -> { breaths: { file, events, expect }, fan: {...} } for calm.test.mjs.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const RATE = 48000;

function random(seed) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

const dbToGain = (db) => Math.pow(10, db / 20);

class Track {
  constructor(seconds, seed = 12345) {
    this.data = new Float32Array(Math.ceil(seconds * RATE));
    this.rand = random(seed);
    this.events = [];
  }

  noise() { return this.rand() * 2 - 1; }

  /** Quiet hiss everywhere: the room. `db` is the RMS level in dBFS. */
  room(db) {
    const gain = dbToGain(db) * Math.sqrt(3);   // uniform noise has an RMS of 1/sqrt(3)
    for (let i = 0; i < this.data.length; i++) this.data[i] += this.noise() * gain;
    return this;
  }

  /** A breath out: low-passed noise plus a little hiss, rising and falling gently, with a slow flutter. */
  breath(at, seconds, db, label = 'breath') {
    const start = Math.floor(at * RATE), n = Math.floor(seconds * RATE);
    const attack = Math.min(0.4, seconds * 0.25) * RATE, release = Math.min(0.6, seconds * 0.3) * RATE;
    const gain = dbToGain(db) * 2.6;
    let low = 0, flutter = 0;
    const a = 1 - Math.exp(-2 * Math.PI * 1700 / RATE);
    for (let i = 0; i < n && start + i < this.data.length; i++) {
      const white = this.noise();
      low += (white - low) * a;
      flutter += ((this.noise() * 0.35) - flutter) * 0.0004;
      let env = 1;
      if (i < attack) env = i / attack;
      else if (i > n - release) env = (n - i) / release;
      env = env * env * (3 - 2 * env);
      this.data[start + i] += (low * 1.6 + white * 0.22) * gain * env * (1 + flutter * 3);
    }
    this.events.push({ at, seconds, label });
    return this;
  }

  /** A clap: a few milliseconds of loud noise and a short echo. */
  clap(at, db = -3) {
    const start = Math.floor(at * RATE), n = Math.floor(0.35 * RATE);
    const gain = dbToGain(db);
    for (let i = 0; i < n && start + i < this.data.length; i++) {
      const t = i / RATE;
      const env = Math.exp(-t / 0.006) + 0.05 * Math.exp(-t / 0.05);
      this.data[start + i] += this.noise() * gain * env;
    }
    this.events.push({ at, seconds: 0.05, label: 'clap' });
    return this;
  }

  /** A voice holding a note ("aaah") or shouting: harmonics of one pitch with a little wobble. */
  voice(at, seconds, db, pitch = 260, label = 'voice') {
    const start = Math.floor(at * RATE), n = Math.floor(seconds * RATE);
    const edge = 0.06 * RATE;
    const gain = dbToGain(db) * 0.9;
    let phase = 0;
    for (let i = 0; i < n && start + i < this.data.length; i++) {
      const t = i / RATE;
      const f = pitch * (1 + 0.012 * Math.sin(2 * Math.PI * 5.2 * t));
      phase += 2 * Math.PI * f / RATE;
      let v = 0;
      for (let k = 1; k * pitch < 4200; k++) {
        // Rough vowel shape: strong near 800 Hz and 1200 Hz.
        const hz = k * pitch;
        const formant = 0.25 + Math.exp(-((hz - 800) ** 2) / (2 * 260 ** 2)) + 0.7 * Math.exp(-((hz - 1250) ** 2) / (2 * 300 ** 2));
        v += Math.sin(phase * k) * formant / k;
      }
      let env = 1;
      if (i < edge) env = i / edge;
      else if (i > n - edge) env = (n - i) / edge;
      this.data[start + i] += v * gain * env;
    }
    this.events.push({ at, seconds, label });
    return this;
  }

  /** Steady noise that starts and never stops: a fan or a machine. */
  machine(at, db) {
    const start = Math.floor(at * RATE);
    const gain = dbToGain(db) * 2.2;
    let low = 0;
    const a = 1 - Math.exp(-2 * Math.PI * 1200 / RATE);
    for (let i = start; i < this.data.length; i++) {
      const white = this.noise();
      low += (white - low) * a;
      const env = Math.min(1, (i - start) / (0.3 * RATE));
      this.data[i] += (low * 1.5 + white * 0.15) * gain * env;
    }
    this.events.push({ at, seconds: this.data.length / RATE - at, label: 'machine' });
    return this;
  }

  save(file) {
    const n = this.data.length;
    const out = Buffer.alloc(44 + n * 2);
    out.write('RIFF', 0); out.writeUInt32LE(36 + n * 2, 4); out.write('WAVE', 8);
    out.write('fmt ', 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22);
    out.writeUInt32LE(RATE, 24); out.writeUInt32LE(RATE * 2, 28); out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34);
    out.write('data', 36); out.writeUInt32LE(n * 2, 40);
    for (let i = 0; i < n; i++) {
      const v = Math.max(-1, Math.min(1, this.data[i]));
      out.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
    }
    writeFileSync(file, out);
    return file;
  }
}

export function makeWavs(outDir) {
  mkdirSync(outDir, { recursive: true });

  // The main test. The first seven seconds are a quiet room (the game calibrates in that time).
  const breaths = new Track(54, 1)
    .room(-55)
    .breath(7.0, 4.0, -24, 'long breath A')              // counted
    .breath(13.0, 5.0, -22, 'long breath B')             // counted
    .clap(20.0).clap(20.6).clap(21.2)                    // ignored
    .voice(23.0, 3.5, -18, 260, 'voice "aaah"')          // ignored: loud and long, but voiced
    .voice(28.5, 0.5, -8, 330, 'shout')                  // ignored
    .breath(30.5, 0.3, -18, 'sharp puff')                // scatters the fish, not counted
    .breath(31.3, 0.3, -18, 'sharp puff')
    .breath(34.0, 1.6, -24, 'short breath (1.6 s)')      // a breath, but not a long slow one: not counted
    .breath(37.5, 3.8, -31, 'long quiet breath C')       // counted
    .breath(43.0, 6.0, -23, 'long breath D');            // counted
  const breathsFile = breaths.save(join(outDir, 'breaths.wav'));

  // A machine starts after calibration and never stops. It must not keep being counted as breaths.
  const fan = new Track(34, 2).room(-55).machine(8.0, -30);
  const fanFile = fan.save(join(outDir, 'fan.wav'));

  return {
    breaths: { file: breathsFile, events: breaths.events, seconds: 54, expect: { slow: 4, sharp: 2 } },
    fan: { file: fanFile, events: fan.events, seconds: 34, expect: { slow: 0 } },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = process.argv[2];
  if (!out) {
    console.error('usage: node make-wavs.mjs <out folder>');
    process.exit(2);
  }
  const made = makeWavs(out);
  for (const [name, info] of Object.entries(made)) {
    console.log(`${name}: ${info.file}`);
    for (const e of info.events) console.log(`   ${e.at.toFixed(1).padStart(5)} s  ${e.label} (${e.seconds.toFixed(1)} s)`);
  }
}
