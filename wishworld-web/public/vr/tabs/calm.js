// Calm: a calm breathing game. The child breathes out slowly and the world answers: bubbles rise from in
// front of them, the fish drift closer, and a long slow breath brings a soft glow and a chime. A ring grows
// and shrinks to pace the breathing (four seconds in, six out). It is a game: nothing here makes a health claim.
//
// Hearing a breath. The microphone's loudness is measured about 30 times a second (AnalyserNode, RMS).
// A breath out is steady, hissy noise that lasts; a clap or a shout is short, and a voice is made of clear
// notes. So a breath only counts when the level stays above the room's own level (found by the calibrate
// step) for a while, and only while the sound is noise-like (spectral flatness) rather than voiced.
//
// No microphone. If the browser will not give us the microphone (or it is silent, which can happen inside an
// immersive session), the card says so and the game carries on without it: the child holds the trigger while
// they breathe out. Whether the Quest browser delivers microphone sound during an immersive session has to
// be checked on a headset; this file detects both cases and works either way.

export const meta = { id: 'calm', label: 'Calm', order: 7 };

const FALLBACK_THEME = {
  slate: '#334052', panel: '#edf2f7', ice: '#8fb0d4', ribbon: '#45618c', snow: '#f2f7fc', peach: '#ffb88c', button: '#d1e0f0',
};

const IN_SECONDS = 4;            // the guide ring grows
const OUT_SECONDS = 6;           // and shrinks
const SAMPLE_MS = 33;            // about 30 loudness readings a second
const CALIBRATE_SECONDS = 3;
const LOG_EVERY = 5;             // slow breaths between breath_session logs (one more is sent on leaving)
const MIC_WAIT_MS = 12000;       // how long to wait for the browser's answer about the microphone
const BUBBLES = 80;
const FISH = ['clownfish', 'clownfish', 'clownfish', 'clownfish', 'turtle'];

// ---------------------------------------------------------------------------------------- the detector

/**
 * Turns a stream of (time, loudness in dB, noisiness 0..1) readings into breath events. No browser APIs
 * in here, so it can be driven by a test as easily as by the microphone.
 *
 *   exhaling      true while a breath out is under way (after SUSTAIN seconds of it): bubbles
 *   onEvent(type, info), type is one of:
 *     'calibrated'  the room's level has been measured             info: { baselineDb, silent }
 *     'breath'      a breath out has lasted BREATH seconds
 *     'slow'        it has lasted SLOW seconds: a long, slow breath (counted once per breath)
 *     'sharp'       a short, sharp puff ended (fast breathing)     info: { seconds }
 *     'end'         a sound ended                                  info: { seconds, kind }
 *     'ignored'     a loud sound that was not breath-like ended (a voice, a shout, a tone)   info: { seconds, noisiness }
 *     'reset'       steady noise went on too long to be a breath; the room level was measured again
 *                   info: { baselineDb, counted } (counted: it had been taken for a slow breath)
 */
export class BreathDetector {
  constructor() {
    this.SUSTAIN = 0.35;      // seconds of steady breath-like sound before bubbles start
    this.BREATH = 1.0;        // a breath out lasts over a second
    this.SLOW = 3.0;          // a long, slow breath
    this.SHARP_MIN = 0.12;    // shorter than this is a click or a clap: ignored
    this.SHARP_MAX = 0.6;     // a puff this short is a fast, sharp breath
    this.GAP = 0.25;          // a break this long ends the sound
    this.TOO_LONG = 14;       // nobody breathes out this long: it is a machine or a fan
    this.NOISY_MIN = 0.5;     // spectral flatness above this is breath-like; a voice sits well below

    this.sensitivity = 4 / 9; // 0..1 from the slider (step 5 of 10)
    this.baselineDb = -60;    // the room's own level
    this.onEvent = null;
    this.reset();
    this._cal = new Float32Array(400);
    this._calN = 0;
    this._calUntil = 0;
    this.calibrating = false;
  }

  /** How far above the room's level a sound must be: 18 dB at the least sensitive setting, 4 dB at the most. */
  get marginDb() { return 18 - 14 * this.sensitivity; }
  get thresholdDb() { return this.baselineDb + this.marginDb; }

  reset() {
    this.exhaling = false;
    this.strength = 0;
    this.levelDb = -140;
    this.noisiness = 0;
    this.seconds = 0;          // length of the sound under way
    this._start = -1;
    this._last = 0;
    this._peak = -140;
    this._saidBreath = false;
    this._saidSlow = false;
    this._loudStart = -1;      // a loud sound that is not breath-like (reported, never counted)
    this._loudLast = 0;
    this._loudNoise = 0;
    this._loudN = 0;
  }

  /** Listen to the room for a few seconds. The level found becomes the baseline. */
  calibrate(now, seconds = CALIBRATE_SECONDS) {
    this.reset();
    this.calibrating = true;
    this._calN = 0;
    this._calUntil = now + seconds;
  }

  _emit(type, info) {
    if (this.onEvent) this.onEvent(type, info);
  }

  _finish() {
    const seconds = this._last - this._start;
    let kind = 'blip';
    if (this._saidSlow) kind = 'slow';
    else if (this._saidBreath) kind = 'breath';
    else if (seconds >= this.SHARP_MAX) kind = 'short';
    else if (seconds >= this.SHARP_MIN) kind = 'sharp';
    const peakOver = this._peak - this.thresholdDb;
    this._start = -1;
    this.exhaling = false;
    this.seconds = 0;
    this._saidBreath = this._saidSlow = false;
    if (kind === 'sharp') this._emit('sharp', { seconds, peakOver });
    this._emit('end', { seconds, kind, peakOver });
  }

  push(now, levelDb, noisiness) {
    this.levelDb = levelDb;
    this.noisiness = noisiness;

    if (this.calibrating) {
      if (this._calN < this._cal.length) this._cal[this._calN++] = levelDb;
      if (now >= this._calUntil) {
        this.calibrating = false;
        const n = this._calN;
        if (n > 0) {
          const sorted = this._cal.subarray(0, n).sort();
          const p80 = sorted[Math.min(n - 1, Math.floor(n * 0.8))];
          this.baselineDb = Math.max(-95, p80);
          // Silent means no sound at all in any reading: a stream that is open but muted.
          this._emit('calibrated', { baselineDb: this.baselineDb, silent: sorted[n - 1] < -110, samples: n });
        } else {
          this._emit('calibrated', { baselineDb: this.baselineDb, silent: true, samples: 0 });
        }
      }
      return;
    }

    const threshold = this.thresholdDb;
    const breathy = levelDb > threshold && noisiness >= this.NOISY_MIN;
    this.strength = Math.max(0, Math.min(1, (levelDb - threshold) / 14));

    // Loud but made of clear notes: a voice or a tone. It is only reported, so a test or a person looking
    // at the log can see that it was heard and passed over.
    if (levelDb > threshold && !breathy) {
      if (this._loudStart < 0) { this._loudStart = now; this._loudNoise = 0; this._loudN = 0; }
      this._loudLast = now;
      this._loudNoise += noisiness;
      this._loudN++;
    } else if (this._loudStart >= 0 && now - this._loudLast > this.GAP) {
      const seconds = this._loudLast - this._loudStart;
      if (seconds >= 0.15) this._emit('ignored', { seconds, noisiness: this._loudNoise / Math.max(1, this._loudN) });
      this._loudStart = -1;
    }

    if (breathy) {
      if (this._start < 0) {
        this._start = now;
        this._peak = levelDb;
      }
      this._last = now;
      if (levelDb > this._peak) this._peak = levelDb;
    }

    if (this._start >= 0) {
      if (now - this._last > this.GAP) {
        this._finish();
      } else {
        const seconds = now - this._start;
        this.seconds = seconds;
        this.exhaling = seconds >= this.SUSTAIN;
        if (!this._saidBreath && seconds >= this.BREATH) {
          this._saidBreath = true;
          this._emit('breath', { seconds });
        }
        if (!this._saidSlow && seconds >= this.SLOW) {
          this._saidSlow = true;
          this._emit('slow', { seconds });
        }
        if (seconds > this.TOO_LONG) {
          // Steady noise that never stops is the room, not the child. Take it as the new room level.
          const counted = this._saidSlow;
          this.baselineDb = levelDb;
          this._start = -1;
          this.exhaling = false;
          this.seconds = 0;
          this._saidBreath = this._saidSlow = false;
          this._emit('reset', { baselineDb: this.baselineDb, counted });
        }
      }
    } else if (levelDb < threshold) {
      // Follow slow changes in the room (a door closes, a machine starts) while nothing is happening.
      this.baselineDb += (Math.max(-95, levelDb) - this.baselineDb) * 0.003;
    }
  }
}

/**
 * How noise-like a spectrum is, 0 (clear notes: a voice, a tone) to 1 (hiss: a breath, a clap).
 * `power` holds a smoothed power spectrum (one value per analyser bin). The range 300 Hz to 5.1 kHz is cut
 * into eight bands; each band's flatness (geometric mean / mean) is found on its own, so a breath that is
 * louder at the low end still scores as noise, and the bands are averaged by how much energy they hold.
 */
export function spectralNoisiness(power, binHz) {
  const lo = Math.max(1, Math.round(300 / binHz));
  const hi = Math.min(power.length - 1, Math.round(5100 / binHz));
  const per = Math.floor((hi - lo) / 8);
  if (per < 3) return 0;
  let weighted = 0, total = 0;
  for (let band = 0; band < 8; band++) {
    let sum = 0, sumLog = 0;
    const from = lo + band * per;
    for (let i = from; i < from + per; i++) {
      const p = power[i] > 1e-16 ? power[i] : 1e-16;
      sum += p;
      sumLog += Math.log(p);
    }
    const flatness = Math.exp(sumLog / per) / (sum / per);
    weighted += flatness * sum;
    total += sum;
  }
  return total > 0 ? weighted / total : 0;
}

// ---------------------------------------------------------------------------------------- the tab

function cssColour(value, fallback) {
  if (typeof value === 'string' && value) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return '#' + (value >>> 0).toString(16).padStart(6, '0').slice(-6);
  return fallback;
}

export function createTab(ctx) {
  const { THREE } = ctx;

  const group = new THREE.Group();
  group.name = 'Calm';
  const root = new THREE.Group();       // at the viewer's feet, turned the way they face when they arrive
  root.name = 'CalmRoot';
  group.add(root);

  const verbose = Boolean(ctx.dev && ctx.dev.verbose) || /[?&]calmdebug=1/.test(globalThis.location ? globalThis.location.search : '');
  const say = (...parts) => { if (verbose) console.info('[calm]', ...parts); };

  // ---------- theme ----------

  const theme = { ...FALLBACK_THEME };
  const themeReady = import('/shared/creatures.js')
    .then((shared) => {
      const t = shared && shared.THEME;
      if (!t) return;
      const palette = t.colors || t.colours || t;
      for (const key of Object.keys(FALLBACK_THEME)) theme[key] = cssColour(palette[key], theme[key]);
    })
    .catch(() => { /* optional: keep the Unity colours above */ });

  // ---------- state ----------

  let entered = false;
  let built = false;
  let session = 0;
  let state = 'intro';           // intro | asking | calibrating | running | nomic
  let micMode = false;           // true while the microphone drives the game
  let noMicReason = '';
  let count = 0;                 // slow breaths this visit
  let logged = 0;                // how many of them have been sent in a breath_session event
  let clock = 0;
  let breathClock = 0;
  let phase = '';
  let eyeY = 1.5;
  let placedAt = 0;
  let wasImmersive = false;
  let exhaleNow = false;         // a breath out is under way (from the microphone or the trigger)
  let strength = 0;
  let closeness = 0;             // 0 fish far .. 1 fish near
  let scatter = 0;               // 1 just scattered .. 0 settled
  let glow = 0;                  // 1 just had a long slow breath .. 0
  let warm = 0;                  // ring brightens while breathing out
  let spawnDebt = 0;
  let statusText = '';

  // Trigger breathing (no microphone).
  const manual = { down: false, start: 0, slow: false };

  // Microphone.
  const detector = new BreathDetector();
  let stream = null, audioContext = null, source = null, analyser = null, sampleTimer = 0;
  let ownContext = false;        // false when listening through the shell's own AudioContext (never closed here)
  let timeData = null, freqData = null, powerData = null;
  let micToken = 0;
  let quietReadings = 0, readings = 0;

  // Scratch: nothing is allocated per frame.
  const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3(), vD = new THREE.Vector3();
  const qA = new THREE.Quaternion(), qB = new THREE.Quaternion();
  const rootQuatInverse = new THREE.Quaternion();
  const mA = new THREE.Matrix4();
  const box = new THREE.Box3(), partBox = new THREE.Box3(), mB = new THREE.Matrix4(), mC = new THREE.Matrix4();
  const sizeOut = new THREE.Vector3();
  const rayOrigin = new THREE.Vector3(), rayDir = new THREE.Vector3();
  const iceColour = new THREE.Color(FALLBACK_THEME.ice), peachColour = new THREE.Color(FALLBACK_THEME.peach);
  const mixColour = new THREE.Color();

  // ---------- things made here (ring, glow, bubbles, slider, meter): all freed in dispose() ----------

  const owned = [];   // geometries, materials and textures this tab created
  const own = (thing) => { owned.push(thing); return thing; };

  function softTexture(draw, size = 128) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    draw(canvas.getContext('2d'), size);
    const texture = own(new THREE.CanvasTexture(canvas));
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  const flat = (options) => {
    const material = own(new THREE.MeshBasicMaterial(options));
    material.toneMapped = false;
    material.fog = false;
    return material;
  };

  // The guide ring.
  const ringCentre = new THREE.Group();
  root.add(ringCentre);
  const ringMaterial = flat({ color: FALLBACK_THEME.ice });
  const ring = new THREE.Mesh(own(new THREE.TorusGeometry(1, 0.05, 10, 64)), ringMaterial);
  ring.name = 'GuideRing';
  ringCentre.add(ring);
  const ringInner = new THREE.Mesh(
    own(new THREE.CircleGeometry(0.95, 48)),
    flat({ color: '#ffffff', transparent: true, opacity: 0.16, depthWrite: false }),
  );
  ringInner.position.z = -0.002;
  ringCentre.add(ringInner);

  // The soft glow behind the ring after a long slow breath.
  const glowTexture = softTexture((g, s) => {
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(255,246,214,0.95)');
    grad.addColorStop(0.35, 'rgba(255,226,170,0.55)');
    grad.addColorStop(1, 'rgba(255,214,150,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  });
  const glowMaterial = flat({ map: glowTexture, transparent: true, opacity: 0, depthWrite: false });
  const glowMesh = new THREE.Mesh(own(new THREE.PlaneGeometry(1, 1)), glowMaterial);
  glowMesh.position.z = -0.03;
  glowMesh.visible = false;
  ringCentre.add(glowMesh);

  // Bubbles: one instanced quad, always turned to the viewer. A fixed pool, reused.
  const bubbleTexture = softTexture((g, s) => {
    const c = s / 2;
    const body = g.createRadialGradient(c, c, s * 0.18, c, c, s * 0.47);
    body.addColorStop(0, 'rgba(215,236,255,0.10)');
    body.addColorStop(0.72, 'rgba(200,228,255,0.26)');
    body.addColorStop(0.9, 'rgba(236,247,255,0.95)');
    body.addColorStop(1, 'rgba(170,205,240,0)');
    g.fillStyle = body;
    g.beginPath();
    g.arc(c, c, s * 0.47, 0, Math.PI * 2);
    g.fill();
    const shine = g.createRadialGradient(c - s * 0.16, c - s * 0.18, 0, c - s * 0.16, c - s * 0.18, s * 0.13);
    shine.addColorStop(0, 'rgba(255,255,255,0.95)');
    shine.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = shine;
    g.fillRect(0, 0, s, s);
  });
  const bubbleMesh = new THREE.InstancedMesh(
    own(new THREE.PlaneGeometry(1, 1)),
    flat({ map: bubbleTexture, transparent: true, depthWrite: false }),
    BUBBLES,
  );
  bubbleMesh.name = 'Bubbles';
  bubbleMesh.frustumCulled = false;
  bubbleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  bubbleMesh.renderOrder = 5;
  root.add(bubbleMesh);
  const bubble = {
    x: new Float32Array(BUBBLES), y: new Float32Array(BUBBLES), z: new Float32Array(BUBBLES),
    vx: new Float32Array(BUBBLES), vy: new Float32Array(BUBBLES), vz: new Float32Array(BUBBLES),
    age: new Float32Array(BUBBLES), life: new Float32Array(BUBBLES), size: new Float32Array(BUBBLES),
    wobble: new Float32Array(BUBBLES), next: 0, alive: 0,
  };
  const zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < BUBBLES; i++) bubbleMesh.setMatrixAt(i, zeroMatrix);

  // Fish.
  const fishGroup = new THREE.Group();
  fishGroup.name = 'CalmFish';
  root.add(fishGroup);
  const fish = [];      // { object, angle, speed, rx, rz, y, bob, turn }
  let fishAsked = false;

  function simpleFish(colour) {
    const holder = new THREE.Group();
    const material = flat({ color: colour });
    const body = new THREE.Mesh(own(new THREE.ConeGeometry(0.04, 0.13, 6).rotateX(Math.PI / 2)), material);
    const tail = new THREE.Mesh(own(new THREE.ConeGeometry(0.035, 0.06, 4).rotateX(-Math.PI / 2)), material);
    tail.position.z = -0.085;
    holder.add(body, tail);
    return holder;
  }

  function addFish(object, index) {
    const n = FISH.length;
    fish.push({
      object,
      angle: (index / n) * Math.PI * 2,
      speed: (0.2 + 0.07 * ((index * 37) % 5) / 4) * (index % 2 ? -1 : 1),
      rx: 0.95 + 0.14 * (index % 3),
      rz: 0.42 + 0.08 * ((index + 1) % 3),
      y: FISH[index] === 'turtle' ? -0.14 : -0.1 + 0.1 * (index % 4),   // between the card above and the words below
      bob: index * 1.7,
    });
    object.visible = entered;
    fishGroup.add(object);
  }

  function loadFish() {
    if (fishAsked) return;
    fishAsked = true;
    import('/shared/models.js').then(
      (models) => Promise.all(FISH.map((id) => models.loadCreature(id))).then((objects) => {
        objects.forEach((object, i) => {
          if (FISH[i] === 'turtle') object.scale.multiplyScalar(0.3);   // a small, slow friend among the fish
          addFish(object, i);
        });
      }),
    ).catch((err) => {
      console.warn('[calm] the shared creature models are not available; using simple fish.', err && err.message);
      const colours = ['#fa7a1a', '#4f9ad6', '#f2c14e', '#fa7a1a', '#8ccf6a'];
      FISH.forEach((id, i) => addFish(simpleFish(colours[i % colours.length]), i));
    });
  }

  // ---------- cards and buttons (the shell's ui, so they look like every other tab) ----------

  let statusPanel = null, phasePanel = null, readyButton = null;
  let sensPanel = null, minusButton = null, plusButton = null, calibrateButton = null;
  let micOffButton = null, micOnButton = null;   // the same spot: 'No microphone' while listening, 'Use microphone' while not
  const column = new THREE.Group();   // the controls, to the right
  const slider = new THREE.Group();
  slider.name = 'CalmSlider';
  const SLIDER_WIDTH = 0.3;
  let sliderKnob = null, sliderFill = null, meterFill = null, meterTick = null, meterGroup = null;
  let sliderHand = null;              // the hand dragging the slider
  let sliderIsTarget = false;         // the shell's pointer knows the slider (it then tells us about presses on it)
  let sliderViaTarget = false;
  let sensStep = -1;
  const buttons = [];                 // every button of ours, to tell a button press from a breath

  function sizeOf(object) {
    const known = object.userData.calmSize;
    if (known) return sizeOut.set(known[0], known[1], 0);
    object.updateWorldMatrix(true, true);
    mB.copy(object.matrixWorld).invert();
    box.makeEmpty();
    object.traverse((o) => {
      if (!o.geometry) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      mC.multiplyMatrices(mB, o.matrixWorld);
      partBox.copy(o.geometry.boundingBox).applyMatrix4(mC);
      box.union(partBox);
    });
    if (box.isEmpty()) return sizeOut.set(0, 0, 0);
    box.getSize(sizeOut);
    return sizeOut.multiply(object.scale);
  }

  function makeButton(label, onClick, width, height, accent) {
    const options = { width, height };
    if (accent) { options.fill = theme.peach; options.color = theme.peach; }
    const button = ctx.ui.makeButton(label, onClick, options);
    button.userData.calmSize = [width, height];   // its own size animates when it pops in: remember the real one
    buttons.push(button);
    return button;
  }

  function buildCards() {
    if (built) return;
    built = true;
    const ui = ctx.ui;
    // `padding` is understood by the shell's card (room for its corner snowflakes); others ignore it.
    const text = { color: theme.slate, background: theme.panel, padding: 0.05 };

    iceColour.set(theme.ice);
    peachColour.set(theme.peach);
    ringMaterial.color.copy(iceColour);

    statusPanel = ui.makeTextPanel('Calm game', { width: 0.96, fontSize: 0.04, ...text });
    phasePanel = ui.makeTextPanel('Breathe in', { width: 0.46, fontSize: 0.052, ...text });
    readyButton = makeButton("I'm ready", onReady, 0.42, 0.12, true);
    root.add(statusPanel, phasePanel, readyButton);

    // Controls: how easily a breath is heard, listen to the room again, play without the microphone.
    sensPanel = ui.makeTextPanel('Listening: 5 of 10', { width: 0.46, fontSize: 0.034, ...text });
    minusButton = makeButton('-', () => stepSensitivity(-1), 0.085, 0.085);
    plusButton = makeButton('+', () => stepSensitivity(1), 0.085, 0.085);
    calibrateButton = makeButton('Listen again', startCalibration, 0.4, 0.09);
    micOffButton = makeButton('No microphone', toggleMode, 0.4, 0.09);
    micOnButton = makeButton('Use microphone', toggleMode, 0.4, 0.09);

    // The slider itself: a track, a filled part and a knob, dragged with the pointer.
    const track = new THREE.Mesh(own(new THREE.PlaneGeometry(SLIDER_WIDTH + 0.024, 0.026)), flat({ color: theme.slate }));
    const groove = new THREE.Mesh(own(new THREE.PlaneGeometry(SLIDER_WIDTH + 0.012, 0.014)), flat({ color: theme.snow }));
    groove.position.z = 0.001;
    sliderFill = new THREE.Mesh(own(new THREE.PlaneGeometry(1, 0.014).translate(0.5, 0, 0)), flat({ color: theme.ice }));
    sliderFill.position.set(-SLIDER_WIDTH / 2, 0, 0.002);
    sliderKnob = new THREE.Group();
    const knobEdge = new THREE.Mesh(own(new THREE.CircleGeometry(0.03, 24)), flat({ color: theme.slate }));
    const knobFace = new THREE.Mesh(own(new THREE.CircleGeometry(0.023, 24)), flat({ color: theme.peach }));
    knobFace.position.z = 0.001;
    sliderKnob.add(knobEdge, knobFace);
    sliderKnob.position.z = 0.004;
    slider.add(track, groove, sliderFill, sliderKnob);
    slider.userData.calmSize = [SLIDER_WIDTH + 0.06, 0.07];

    // A thin bar under it: how loud the microphone is now, and the line a breath must pass.
    meterGroup = new THREE.Group();
    const meterBack = new THREE.Mesh(own(new THREE.PlaneGeometry(SLIDER_WIDTH, 0.012)), flat({ color: theme.button }));
    meterFill = new THREE.Mesh(own(new THREE.PlaneGeometry(1, 0.012).translate(0.5, 0, 0)), flat({ color: theme.ice }));
    meterFill.position.set(-SLIDER_WIDTH / 2, 0, 0.001);
    meterFill.scale.x = 0.001;
    meterTick = new THREE.Mesh(own(new THREE.PlaneGeometry(0.005, 0.024)), flat({ color: theme.slate }));
    meterTick.position.z = 0.002;
    meterGroup.add(meterBack, meterFill, meterTick);
    meterGroup.userData.calmSize = [SLIDER_WIDTH, 0.03];

    column.add(sensPanel, slider, minusButton, plusButton, meterGroup, calibrateButton, micOffButton, micOnButton);
    root.add(column);
    // In the real shell, tell its pointer about the slider, so the ray lands on it and a press on it comes
    // to us as a click (ctx.input is a shell extra; without it the trigger handlers below do the same job).
    if (ctx.input && typeof ctx.input.addTarget === 'function') {
      ctx.input.addTarget(slider, {
        width: SLIDER_WIDTH + 0.07, height: 0.09, ui: true,
        onClick: (hand) => { if (aimRay(hand, null)) startSliderDrag(hand, true); },
      });
      sliderIsTarget = true;
    }
    showSensitivity();
  }

  function layout() {
    if (!built) return;
    // Straight ahead: the ring, the words under it, the card above it, the ready button below.
    ringCentre.position.set(0, eyeY - 0.1, -1.4);
    const statusH = sizeOf(statusPanel).y;
    statusPanel.position.set(0, eyeY + 0.3 + statusH / 2, -1.5);
    // The ready button and the "Breathe in / out" words share one spot: the button first, the words once playing.
    phasePanel.position.set(0, eyeY - 0.5, -1.4);
    readyButton.position.set(0, eyeY - 0.5, -1.4);

    // To the right, turned to face the viewer.
    // Close enough to the middle to be seen without turning the head (and to fit a desktop preview).
    const angle = THREE.MathUtils.degToRad(30), radius = 1.2;
    column.position.set(Math.sin(angle) * radius, 0, -Math.cos(angle) * radius);
    column.rotation.y = -angle;
    let y = eyeY + 0.12;
    const put = (object, gap) => {
      if (!object.visible) return;
      const h = sizeOf(object).y;
      object.position.set(0, y - h / 2, 0);
      y -= h + gap;
    };
    put(sensPanel, 0.04);
    put(slider, 0.0);
    minusButton.position.set(-SLIDER_WIDTH / 2 - 0.075, slider.position.y, 0);
    plusButton.position.set(SLIDER_WIDTH / 2 + 0.075, slider.position.y, 0);
    put(meterGroup, 0.04);
    put(calibrateButton, 0.03);
    put(micOffButton, 0.03);
    put(micOnButton, 0.03);
  }

  function setStatus(text) {
    if (!statusPanel || text === statusText) return;
    statusText = text;
    statusPanel.setText(text);
    const h = sizeOf(statusPanel).y;
    statusPanel.position.y = eyeY + 0.3 + h / 2;
  }

  function showButton(button, on) {
    if (!button) return;
    button.visible = on;
    if (typeof button.setEnabled === 'function') button.setEnabled(on);
  }

  function holdWord() {
    return ctx.isImmersive() ? 'Hold the trigger' : 'Hold the mouse button';
  }

  /** The words on the card, and which controls show, for the state the game is in. */
  function refresh() {
    if (!built) return;
    const counted = count === 1 ? '1 slow breath' : `${count} slow breaths`;
    if (state === 'intro') {
      setStatus('Calm game\nBreathe out slowly and make bubbles for the fish.\nPress the button when you are ready.');
    } else if (state === 'asking') {
      setStatus('Asking for the microphone...\nIf a box pops up, pick Allow.');
    } else if (state === 'calibrating') {
      setStatus('Breathe normally for three seconds.\nI am listening to the room.');
    } else if (state === 'running') {
      setStatus(`Breathe in with the ring. Breathe out slowly to make bubbles.\n${count ? counted + ' so far.' : 'The fish like long, slow breaths.'}`);
    } else {
      let why = noMicReason ? noMicReason + '\n' : '';
      if (noMicReason && ctx.isImmersive()) why += 'Grown-ups: it may work in the preview on the flat page.\n';
      setStatus(`${why}${holdWord()} while you breathe out.\n${count ? counted + ' so far.' : 'The fish like long, slow breaths.'}`);
    }
    showButton(readyButton, state === 'intro');
    phasePanel.visible = state !== 'intro' && state !== 'asking';
    const playing = state === 'running' || state === 'nomic' || state === 'calibrating';
    column.visible = playing;
    if (playing) {
      const mic = state !== 'nomic';
      showButton(calibrateButton, mic);
      showButton(minusButton, mic);
      showButton(plusButton, mic);
      slider.visible = sensPanel.visible = meterGroup.visible = mic;
      showButton(micOffButton, mic);
      showButton(micOnButton, !mic);
      layout();
    }
  }

  // ---------- sensitivity slider ----------

  function showSensitivity() {
    if (!sliderKnob) return;
    const v = detector.sensitivity;
    sliderKnob.position.x = (v - 0.5) * SLIDER_WIDTH;
    sliderFill.scale.x = Math.max(0.001, v * SLIDER_WIDTH);
    const step = Math.round(v * 9) + 1;
    if (step !== sensStep) {
      sensStep = step;
      sensPanel.setText(`Listening: ${step} of 10`);
    }
  }

  function stepSensitivity(direction) {
    const step = Math.round(detector.sensitivity * 9) + direction;
    detector.sensitivity = Math.max(0, Math.min(9, step)) / 9;
    showSensitivity();
    say('sensitivity', detector.sensitivity.toFixed(2), 'margin', detector.marginDb.toFixed(1), 'dB');
  }

  /** Where a pointer ray crosses the slider, as 0..1 along it; -1 if it misses. `loose` ignores the edges. */
  function sliderValueUnderRay(loose) {
    if (!built || !slider.visible || !column.visible) return -1;
    slider.updateWorldMatrix(true, false);
    vA.copy(rayOrigin);
    vB.copy(rayOrigin).add(rayDir);
    slider.worldToLocal(vA);
    slider.worldToLocal(vB).sub(vA);
    if (Math.abs(vB.z) < 1e-6) return -1;
    const t = -vA.z / vB.z;
    if (t < 0) return -1;
    const x = vA.x + vB.x * t, y = vA.y + vB.y * t;
    if (!loose && (Math.abs(y) > 0.05 || Math.abs(x) > SLIDER_WIDTH / 2 + 0.035)) return -1;
    return Math.max(0, Math.min(1, x / SLIDER_WIDTH + 0.5));
  }

  function startSliderDrag(hand, viaTarget) {
    const v = sliderValueUnderRay(viaTarget);
    if (v < 0) return false;
    sliderHand = hand;
    sliderViaTarget = viaTarget;
    detector.sensitivity = v;
    showSensitivity();
    return true;
  }

  function endSliderDrag() {
    sliderHand = null;
    sliderViaTarget = false;
    say('sensitivity', detector.sensitivity.toFixed(2), 'margin', detector.marginDb.toFixed(1), 'dB');
  }

  function triggerHeld(hand) {
    const c = ctx.controllers && ctx.controllers[hand];
    if (!c) return false;
    if (typeof c.selecting === 'boolean') return c.selecting;
    const button = c.gamepad && c.gamepad.buttons && c.gamepad.buttons[0];
    return Boolean(button && button.pressed);
  }

  function aimRay(hand, controller) {
    const known = ctx.controllers && ctx.controllers[hand];
    const c = controller && !controller.isObject3D ? controller : known;
    // Desktop preview of the real shell: the hand is held low and only aims at the cursor, so use the ray
    // from the eye through the point under the cursor instead (the shell keeps that point in `hit`).
    if (c && c.hit && c.hit.isVector3 && !ctx.isImmersive()) {
      ctx.viewerPosition(rayOrigin);
      rayDir.copy(c.hit).sub(rayOrigin);
      if (rayDir.lengthSq() > 1e-8) { rayDir.normalize(); return true; }
    }
    let object = null;
    if (controller && controller.ray && controller.ray.isObject3D) object = controller.ray;
    else if (controller && controller.isObject3D) object = controller;
    else object = known && known.ray && known.ray.isObject3D ? known.ray : null;
    if (!object) return false;
    object.getWorldPosition(rayOrigin);
    rayDir.set(0, 0, -1).applyQuaternion(object.getWorldQuaternion(qA)).normalize();
    return true;
  }

  /** True if the pointer ray is on one of this tab's buttons (so the press is a press, not a breath). */
  function rayOnButton() {
    for (let i = 0; i < buttons.length; i++) {
      const button = buttons[i];
      if (!button.visible || !button.parent || !button.parent.visible) continue;
      const size = button.userData.calmSize;
      button.updateWorldMatrix(true, false);
      vA.copy(rayOrigin);
      vB.copy(rayOrigin).add(rayDir);
      button.worldToLocal(vA);
      button.worldToLocal(vB).sub(vA);
      if (Math.abs(vB.z) < 1e-6) continue;
      const t = -vA.z / vB.z;
      if (t < 0) continue;
      if (Math.abs(vA.x + vB.x * t) <= size[0] / 2 + 0.01 && Math.abs(vA.y + vB.y * t) <= size[1] / 2 + 0.01) return true;
    }
    return false;
  }

  // ---------- microphone ----------

  function micSupported() {
    return Boolean(globalThis.navigator && navigator.mediaDevices && navigator.mediaDevices.getUserMedia &&
      (globalThis.AudioContext || globalThis.webkitAudioContext));
  }

  function releaseMic() {
    micToken++;
    if (sampleTimer) { clearInterval(sampleTimer); sampleTimer = 0; }
    if (source) { try { source.disconnect(); } catch { /* already disconnected */ } source = null; }
    analyser = null;
    if (stream) {
      for (const track of stream.getTracks()) { track.onended = null; track.stop(); }
      stream = null;
    }
    if (audioContext) {
      const closing = audioContext;
      audioContext = null;
      if (ownContext) closing.close().catch(() => { /* already closed */ });
    }
    micMode = false;
    detector.reset();
    detector.calibrating = false;
  }

  function noMicrophone(reason) {
    releaseMic();
    noMicReason = reason;
    state = 'nomic';
    say('no microphone:', reason);
    refresh();
    speak(`${holdWord()} while you breathe out.`);
  }

  async function startMic() {
    if (!entered) return;
    releaseMic();
    const token = micToken;
    if (!micSupported()) {
      noMicrophone(globalThis.isSecureContext === false
        ? 'The microphone only works on a safe (https) page.'
        : 'This browser has no microphone to use.');
      return;
    }
    state = 'asking';
    refresh();

    let answered = false;
    const waiting = setTimeout(() => {
      if (answered || token !== micToken || !entered) return;
      // No answer: in a headset the question may be hidden behind the immersive view.
      noMicrophone(ctx.isImmersive()
        ? 'The microphone did not answer in the headset view.'
        : 'The microphone did not answer.');
    }, MIC_WAIT_MS);

    let got = null;
    try {
      got = await navigator.mediaDevices.getUserMedia({
        // Noise suppression would remove exactly the steady hiss of a breath, so it is turned off.
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
        video: false,
      });
    } catch (err) {
      answered = true;
      clearTimeout(waiting);
      if (token !== micToken || !entered) return;
      const name = err && err.name;
      noMicrophone(name === 'NotAllowedError' || name === 'SecurityError'
        ? 'The microphone is turned off for this page.'
        : name === 'NotFoundError' || name === 'OverconstrainedError'
          ? 'I could not find a microphone.'
          : 'The microphone would not start.');
      return;
    }
    answered = true;
    clearTimeout(waiting);
    const late = token !== micToken;
    if (!entered || (late && state !== 'nomic')) {
      for (const track of got.getTracks()) track.stop();
      return;
    }
    if (late) releaseMic();   // it answered after we gave up waiting: use it after all
    const mine = micToken;

    stream = got;
    try {
      // Listen through the shell's audio context when it has one (it was started by the Enter press);
      // otherwise make one of our own, which exit() closes.
      const shared = ctx.audio && (typeof ctx.audio.ensureContext === 'function' ? ctx.audio.ensureContext() : ctx.audio.context);
      ownContext = !(shared && typeof shared.createAnalyser === 'function' && shared.state !== 'closed');
      const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
      audioContext = ownContext ? new AudioContextClass() : shared;
      if (audioContext.state !== 'running') {
        await Promise.race([audioContext.resume(), new Promise((resolve) => setTimeout(resolve, 1500))]);
      }
      if (mine !== micToken || !entered) return;
      source = audioContext.createMediaStreamSource(stream);
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0;
      source.connect(analyser);   // not connected to the speakers: we only listen
      if (!timeData || timeData.length !== analyser.fftSize) {
        timeData = new Float32Array(analyser.fftSize);
        freqData = new Float32Array(analyser.frequencyBinCount);
        powerData = new Float32Array(analyser.frequencyBinCount);
      }
      powerData.fill(0);
    } catch (err) {
      console.warn('[calm] could not listen to the microphone:', err && err.message);
      noMicrophone('The microphone would not start.');
      return;
    }
    const track = stream.getAudioTracks()[0];
    if (track) track.onended = () => { if (mine === micToken && entered) noMicrophone('The microphone stopped.'); };
    micMode = true;
    quietReadings = readings = 0;
    sampleTimer = setInterval(sample, SAMPLE_MS);
    say('microphone on:', track ? track.label : '(no label)', 'context', audioContext.state, audioContext.sampleRate + ' Hz',
      ctx.isImmersive() ? 'immersive' : 'page view');
    startCalibration();
  }

  /** One loudness reading: RMS of the last 43 ms, and how noise-like the sound is. */
  function sample() {
    if (!analyser || !audioContext) return;
    analyser.getFloatTimeDomainData(timeData);
    let sum = 0;
    for (let i = 0; i < timeData.length; i++) sum += timeData[i] * timeData[i];
    const rms = Math.sqrt(sum / timeData.length);
    const levelDb = 20 * Math.log10(rms + 1e-7);

    analyser.getFloatFrequencyData(freqData);
    for (let i = 0; i < freqData.length; i++) {
      const db = freqData[i];
      const p = db > -160 ? Math.pow(10, db * 0.1) : 1e-16;
      powerData[i] += (p - powerData[i]) * 0.45;   // a little smoothing, so hiss looks flat rather than spiky
    }
    const noisiness = spectralNoisiness(powerData, audioContext.sampleRate / analyser.fftSize);

    readings++;
    if (rms < 1e-6) quietReadings++;
    detector.push(performance.now() / 1000, levelDb, noisiness);
  }

  function startCalibration() {
    if (!entered || !micMode) return;
    state = 'calibrating';
    refresh();
    const mine = micToken;
    // Say it first, then listen, so the guide's own voice is not measured as the room.
    speak('Breathe normally for three seconds.').then(() => {
      if (mine !== micToken || !entered || state !== 'calibrating') return;
      quietReadings = readings = 0;
      detector.calibrate(performance.now() / 1000, CALIBRATE_SECONDS);
    });
  }

  detector.onEvent = (type, info) => {
    if (type === 'calibrated') {
      say(`calibrated: room ${info.baselineDb.toFixed(1)} dB, a breath must pass ${detector.thresholdDb.toFixed(1)} dB` +
        ` (${info.samples} readings, ${quietReadings} silent)`);
      if (info.silent) {
        // The stream is open but carries no sound at all.
        noMicrophone(ctx.isImmersive()
          ? 'The microphone is silent in the headset view.'
          : 'The microphone is silent.');
        return;
      }
      state = 'running';
      refresh();
      speak('Now breathe in, and breathe out slowly.');
    } else if (type === 'slow') {
      say(`SLOW BREATH counted after ${info.seconds.toFixed(2)} s (level ${detector.levelDb.toFixed(1)} dB, noisiness ${detector.noisiness.toFixed(2)})`);
      slowBreath();
    } else if (type === 'breath') {
      say(`breath out under way (${info.seconds.toFixed(2)} s)`);
    } else if (type === 'sharp') {
      say(`sharp puff, ${info.seconds.toFixed(2)} s: the fish scatter`);
      sharpBreath();
    } else if (type === 'end') {
      say(`sound ended: ${info.kind}, ${info.seconds.toFixed(2)} s, peak ${info.peakOver.toFixed(1)} dB over the line` +
        (info.kind === 'blip' ? ' (too short: ignored)' : ''));
    } else if (type === 'ignored') {
      say(`loud but not breath-like for ${info.seconds.toFixed(2)} s (noisiness ${info.noisiness.toFixed(2)}): a voice or a tone, ignored`);
    } else if (type === 'reset') {
      say(`steady noise is not a breath: room level is now ${info.baselineDb.toFixed(1)} dB` + (info.counted ? '; its count is taken back' : ''));
      if (info.counted && count > logged) {
        count--;
        refresh();
      }
    }
  };

  // ---------- what a breath does ----------

  function slowBreath() {
    count++;
    glow = 1;
    ctx.audio.chime();
    if (ctx.haptic) { ctx.haptic('left', 0.25, 60); ctx.haptic('right', 0.25, 60); }
    refresh();
    if (count - logged >= LOG_EVERY) logBreaths(false);
  }

  function sharpBreath() {
    scatter = 1;
    closeness *= 0.2;
    ctx.audio.pop();
  }

  function logBreaths(final) {
    const fresh = count - logged;
    if (fresh <= 0) return;
    logged = count;
    // `breaths` is the number since the last log, so adding the events up gives the true total.
    ctx.log('breath_session', { breaths: fresh, total: count, microphone: micMode, final });
  }

  /** The guide speaks. Resolves when the line ends (or after a while if the voice never reports back). */
  function speak(text) {
    const mine = session;
    let spoken;
    try {
      spoken = Promise.resolve(ctx.audio.speak(text));
    } catch {
      spoken = Promise.resolve();
    }
    return Promise.race([
      spoken.catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, 7000)),
    ]).then(() => new Promise((resolve) => setTimeout(resolve, mine === session ? 250 : 0)));
  }

  // ---------- buttons ----------

  function onReady() {
    if (!entered || state !== 'intro') return;
    startMic();
  }

  function toggleMode() {
    if (!entered) return;
    if (state === 'nomic') {
      startMic();
    } else if (state === 'running' || state === 'calibrating') {
      releaseMic();
      noMicReason = '';
      state = 'nomic';
      refresh();
    }
  }

  // ---------- placing everything in front of the viewer ----------

  function place() {
    ctx.viewerPosition(vA);
    ctx.viewerForward(vB);
    vB.y = 0;
    if (vB.lengthSq() < 1e-4) vB.set(0, 0, -1);
    vB.normalize();
    group.updateWorldMatrix(true, false);
    group.worldToLocal(vC.copy(vA));
    vD.copy(vA).add(vB);
    group.worldToLocal(vD).sub(vC);
    root.position.set(vC.x, 0, vC.z);
    root.rotation.set(0, Math.atan2(-vD.x, -vD.z), 0);
    root.updateMatrixWorld(true);
    root.getWorldQuaternion(rootQuatInverse).invert();
    eyeY = vC.y;
    placedAt = clock;
    layout();
  }

  // ---------- frame ----------

  function spawnBubble() {
    const i = bubble.next;
    bubble.next = (bubble.next + 1) % BUBBLES;
    // From just in front of the mouth, wherever the head is now.
    ctx.viewerPosition(vA);
    root.worldToLocal(vA);
    ctx.viewerForward(vB);
    vB.applyQuaternion(rootQuatInverse);
    vB.y = 0;
    if (vB.lengthSq() < 1e-4) vB.set(0, 0, -1);
    vB.normalize();
    const side = Math.random() - 0.5, lift = Math.random();
    bubble.x[i] = vA.x + vB.x * 0.32 - vB.z * side * 0.1;
    bubble.y[i] = vA.y - 0.11 + (lift - 0.5) * 0.04;
    bubble.z[i] = vA.z + vB.z * 0.32 + vB.x * side * 0.1;
    const push = 0.28 + Math.random() * 0.3;
    bubble.vx[i] = vB.x * push - vB.z * side * 0.16;
    bubble.vy[i] = 0.04 + lift * 0.1;
    bubble.vz[i] = vB.z * push + vB.x * side * 0.16;
    bubble.age[i] = 0;
    bubble.life[i] = 3.2 + Math.random() * 2.2;
    bubble.size[i] = 0.022 + Math.random() * Math.random() * 0.05;
    bubble.wobble[i] = Math.random() * Math.PI * 2;
  }

  function updateBubbles(dt) {
    if (exhaleNow) {
      spawnDebt += dt * (7 + 13 * strength);
      while (spawnDebt >= 1) { spawnDebt -= 1; spawnBubble(); }
    } else {
      spawnDebt = 0;
    }
    // Quads face the viewer: the camera's turn, in the root's own space.
    ctx.camera.getWorldQuaternion(qA);
    qB.copy(rootQuatInverse).multiply(qA);
    const slow = Math.exp(-dt * 0.9);
    let alive = 0;
    for (let i = 0; i < BUBBLES; i++) {
      const life = bubble.life[i];
      if (life <= 0) continue;
      const age = bubble.age[i] + dt;
      if (age >= life) {
        bubble.life[i] = 0;
        bubbleMesh.setMatrixAt(i, zeroMatrix);
        continue;
      }
      alive++;
      bubble.age[i] = age;
      bubble.vx[i] *= slow;
      bubble.vz[i] *= slow;
      bubble.vy[i] += (0.2 - bubble.vy[i]) * (1 - Math.exp(-dt * 1.5));   // settles into a steady rise
      const wob = Math.sin(age * 2.6 + bubble.wobble[i]) * 0.03;
      bubble.x[i] += (bubble.vx[i] + wob) * dt;
      bubble.y[i] += bubble.vy[i] * dt;
      bubble.z[i] += bubble.vz[i] * dt;
      // Grow in, and pop at the end: a quick swell and then gone.
      const left = life - age;
      let s = bubble.size[i] * Math.min(1, age / 0.25);
      if (left < 0.14) s *= left < 0.05 ? left / 0.05 : 1 + (0.14 - left) * 3.5;
      vA.set(bubble.x[i], bubble.y[i], bubble.z[i]);
      vB.set(s, s, s);
      bubbleMesh.setMatrixAt(i, mA.compose(vA, qB, vB));
    }
    if (alive > 0 || bubble.alive > 0) bubbleMesh.instanceMatrix.needsUpdate = true;
    bubble.alive = alive;
    bubbleMesh.visible = alive > 0;
  }

  function updateFish(dt, elapsed) {
    // Near means about 1.2 m away at the closest, level with the ring, never in front of the words.
    const spread = (1 - 0.4 * closeness) * (1 + 1.5 * scatter);
    const centreZ = -2.1 + 0.55 * closeness - 0.6 * scatter;
    const speedUp = 1 + 5 * scatter;
    for (let i = 0; i < fish.length; i++) {
      const f = fish[i];
      f.angle += f.speed * speedUp * dt;
      const c = Math.cos(f.angle), s = Math.sin(f.angle);
      const o = f.object;
      o.position.set(c * f.rx * spread, eyeY + f.y + Math.sin(elapsed * 0.8 + f.bob) * 0.035, centreZ + s * f.rz * spread);
      const dir = f.speed > 0 ? 1 : -1;
      // Models face +Z: turn that way along the path, with a small tail-wag.
      o.rotation.y = Math.atan2(-s * f.rx * dir, c * f.rz * dir) + Math.sin(elapsed * 5 + f.bob) * 0.12;
    }
  }

  function updateRing(dt) {
    breathClock += dt;
    const t = breathClock % (IN_SECONDS + OUT_SECONDS);
    const breathingIn = t < IN_SECONDS;
    const x = breathingIn ? t / IN_SECONDS : 1 - (t - IN_SECONDS) / OUT_SECONDS;
    const k = x * x * (3 - 2 * x);
    const radius = 0.1 + 0.16 * k;
    ring.scale.setScalar(radius);
    ringInner.scale.setScalar(radius);
    const now = breathingIn ? 'Breathe in' : 'Breathe out';
    if (now !== phase) {
      phase = now;
      if (phasePanel) phasePanel.setText(now);
    }

    warm += ((exhaleNow ? 1 : 0) - warm) * (1 - Math.exp(-dt * 4));
    mixColour.copy(iceColour).lerp(peachColour, Math.min(1, warm * 0.85 + glow * 0.5));
    ringMaterial.color.copy(mixColour);

    if (glow > 0) {
      glow = Math.max(0, glow - dt / 2.6);
      const g = glow * glow * (3 - 2 * glow);
      glowMesh.visible = true;
      glowMaterial.opacity = 0.85 * g;
      glowMesh.scale.setScalar(radius * 3.2 + 0.5 * (1 - glow));
    } else if (glowMesh.visible) {
      glowMesh.visible = false;
    }
  }

  function updateMeter() {
    if (!meterFill || !micMode || !meterGroup.visible) return;
    const span = 45, floor = detector.baselineDb - 6;
    const level = Math.max(0, Math.min(1, (detector.levelDb - floor) / span));
    meterFill.scale.x = Math.max(0.001, level * SLIDER_WIDTH);
    meterFill.material.color.copy(detector.exhaling ? peachColour : iceColour);
    meterTick.position.x = (Math.max(0, Math.min(1, (detector.thresholdDb - floor) / span)) - 0.5) * SLIDER_WIDTH;
  }

  function update(dt, elapsed) {
    if (!entered || !built) return;
    clock += dt;

    // If the headset's pose arrives late, or the child goes in or out of the headset view, lay it all out again.
    const immersive = ctx.isImmersive();
    if (immersive !== wasImmersive) {
      wasImmersive = immersive;
      place();
      refresh();
    } else if (clock - placedAt < 1.2 && state === 'intro') {
      ctx.viewerPosition(vA);
      group.worldToLocal(vA);
      if (Math.abs(vA.y - eyeY) > 0.25 || Math.hypot(vA.x - root.position.x, vA.z - root.position.z) > 0.6) {
        const keep = placedAt;
        place();
        placedAt = keep;
      }
    }

    // Is a breath out under way?
    if (state === 'running') {
      exhaleNow = detector.exhaling;
      strength += (detector.strength - strength) * (1 - Math.exp(-dt * 6));
    } else if (state === 'nomic') {
      const held = manual.down ? clock - manual.start : 0;
      exhaleNow = held >= 0.25;
      strength = 0.55;
      if (manual.down && !manual.slow && held >= detector.SLOW) {
        manual.slow = true;
        say(`SLOW BREATH counted (trigger held ${held.toFixed(2)} s)`);
        slowBreath();
      }
    } else {
      exhaleNow = false;
    }

    // Slider drag.
    if (sliderHand) {
      if (sliderViaTarget && !triggerHeld(sliderHand)) {
        endSliderDrag();
      } else if (aimRay(sliderHand, null)) {
        const v = sliderValueUnderRay(true);
        if (v >= 0) {
          detector.sensitivity = v;
          showSensitivity();
        }
      }
    }

    closeness += ((exhaleNow ? 1 : 0) - closeness) * (1 - Math.exp(-dt * (exhaleNow ? 0.9 : 0.22)));
    if (scatter > 0) scatter = Math.max(0, scatter - dt * 0.45);

    updateRing(dt);
    updateBubbles(dt);
    updateFish(dt, elapsed);
    updateMeter();
  }

  // ---------- trigger ----------

  function onSelectStart(hand, controller) {
    if (!entered || !built) return;
    const aimed = aimRay(hand, controller);
    if (aimed && !sliderIsTarget && startSliderDrag(hand, false)) return;
    if (state === 'nomic' && !(aimed && rayOnButton())) {
      manual.down = true;
      manual.start = clock;
      manual.slow = false;
    }
  }

  function onSelectEnd(hand) {
    if (sliderHand === hand && !sliderViaTarget) {
      endSliderDrag();
      return;
    }
    if (manual.down) {
      const held = clock - manual.start;
      manual.down = false;
      if (state === 'nomic' && held >= 0.08 && held < 0.45) {
        say(`quick tap (${held.toFixed(2)} s): the fish scatter`);
        sharpBreath();
      }
    }
  }

  // ---------- enter / exit ----------

  function enter() {
    entered = true;
    const mine = ++session;
    clock = 0;
    breathClock = 0;
    phase = '';
    count = logged = 0;
    state = 'intro';
    noMicReason = '';
    exhaleNow = false;
    closeness = scatter = glow = warm = 0;
    manual.down = false;
    sliderHand = null;
    wasImmersive = ctx.isImmersive();
    for (let i = 0; i < fish.length; i++) fish[i].object.visible = true;
    // In VR and the desktop preview the fish get Unity's aquarium around them (sky, light, sea floor), without
    // its background water sound, which the microphone would hear. In AR the shell ignores this: the room stays.
    if (typeof ctx.setEnvironment === 'function') ctx.setEnvironment('aquarium', { ambientSound: false });
    themeReady.then(() => {
      if (mine !== session || !entered) return;
      buildCards();
      loadFish();
      place();
      statusText = '';
      refresh();
      speak("Let's play a calm game. Press I'm ready when you want to start.");
    });
  }

  function exit() {
    if (entered) logBreaths(true);
    entered = false;
    session++;
    releaseMic();           // the microphone is let go the moment the child leaves
    ctx.audio.stop();
    manual.down = false;
    sliderHand = null;
    exhaleNow = false;
    for (let i = 0; i < BUBBLES; i++) {
      bubble.life[i] = 0;
      bubbleMesh.setMatrixAt(i, zeroMatrix);
    }
    bubble.alive = 0;
    bubbleMesh.instanceMatrix.needsUpdate = true;
    bubbleMesh.visible = false;
    glowMesh.visible = false;
    glow = 0;
  }

  /** Free everything this tab made itself. The shell does not need to call this; exit() already stops it all. */
  function dispose() {
    exit();
    if (sliderIsTarget && ctx.input && typeof ctx.input.removeTarget === 'function') ctx.input.removeTarget(slider);
    sliderIsTarget = false;
    for (const thing of owned) thing.dispose();
    owned.length = 0;
    bubbleMesh.dispose();
  }

  return {
    name: 'Calm',
    group,
    enter,
    exit,
    update,
    dispose,
    onSelectStart,
    onSelectEnd,
    onSqueezeStart() {},
    onSqueezeEnd() {},
    /** The shell's recentre button: bring everything back in front of the viewer. */
    onRecenter() { if (entered && built) place(); },
    /** For tests and for looking at the detector on a headset through remote debugging. */
    debug() {
      return {
        state, count, logged, micMode, noMicReason, exhaling: exhaleNow,
        levelDb: detector.levelDb, noisiness: detector.noisiness, baselineDb: detector.baselineDb,
        thresholdDb: detector.thresholdDb, sensitivity: detector.sensitivity, bubbles: bubble.alive,
        micOpen: Boolean(stream), listening: Boolean(sampleTimer), sharedContext: Boolean(audioContext) && !ownContext,
        closeness, scatter, fish: fish.length, phase,
      };
    },
  };
}
