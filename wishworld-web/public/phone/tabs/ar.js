// AR tab: the room's creatures around you.
//   Android Chrome with WebXR "immersive-ar": a real AR session.
//   iPhone (no WebXR): the rear camera as a full-screen background, a transparent 3D layer on top, tilt to look.
//   Desktop: a snowy sky, drag to look.
// Creatures are the room's ready creature gifts and scanned companions, plus a few library fish so it is never empty.
import { h, icon, thumb, creatureInfo, store, companionName } from "/phone/lib.js";

const LIBRARY = ["clownfish", "clownfish", "clownfish", "turtle", "jellyfish", "ray"];   // always there, so the view is never empty
const MAX_GIFT_CREATURES = 8;
const MAX_COMPANIONS = 3;
const EYE = 1.4;                       // metres from the floor to the phone
const SILENCE = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

const isTouch = () => (navigator.maxTouchPoints || 0) > 0 || (window.matchMedia && window.matchMedia("(pointer: coarse)").matches);

export function mount(root, ctx) {
  const forced = ctx.query.get("arMode");          // dev only: camera | desktop | xr
  let run = null;                                  // everything belonging to a running session
  let xrSupported = false;

  // ------------------------------------------------------------------ intro card
  const how = h("li", { id: "ar-how" }, h("span", { class: "ico", html: icon("phone") }), h("span", null, "Checking what this device can do..."));
  const alertBox = h("div", { class: "note bad", role: "alert", hidden: true, id: "ar-alert", style: { marginBottom: "14px" } });
  const startBtn = h("button", { class: "btn primary big block", type: "button", id: "ar-start" }, h("span", { html: icon("ar") }), h("span", { class: "btn-text" }, "Start"));
  const intro = h("div", { class: "card snowcap", id: "ar-intro" },
    h("div", { class: "ribbon-row" }, h("h1", { class: "ribbon" }, "Look around")),
    h("p", { class: "lead" }, "See the creatures from this room swimming and flying around you."),
    h("ul", { class: "ar-list" },
      how,
      h("li", null, h("span", { class: "ico", html: icon("sound") }), h("span", null, "Tap a creature to hear its name and a fact.")),
      h("li", null, h("span", { class: "ico", html: icon("gift") }), h("span", null, "Wishes and scanned toys sent to this room show up here too."))),
    alertBox,
    startBtn);
  root.append(intro);

  function describeMode() {
    const text = how.lastChild;
    if (xrSupported && forced !== "camera" && forced !== "desktop") text.textContent = "This phone can place them right in your room. Move it slowly to look around.";
    else if ((isTouch() || forced === "camera") && forced !== "desktop") text.textContent = "Your camera shows the room behind them. Turn and tilt the phone to look around.";
    else text.textContent = "On a computer they fly in a snowy sky. Drag to look around.";
  }
  describeMode();
  if (navigator.xr && navigator.xr.isSessionSupported) {
    navigator.xr.isSessionSupported("immersive-ar").then((ok) => { xrSupported = Boolean(ok); describeMode(); }).catch(() => {});
  }

  function showAlert(message) {
    alertBox.replaceChildren(h("span", { html: icon("warn") }), h("span", null, message));
    alertBox.hidden = false;
  }

  // ------------------------------------------------------------------ starting

  startBtn.addEventListener("click", async () => {
    if (run) return;
    alertBox.hidden = true;
    startBtn.disabled = true;
    startBtn.querySelector(".btn-text").textContent = "Starting...";

    const wantXR = forced ? forced === "xr" : xrSupported;
    const wantCamera = forced ? forced === "camera" : (!wantXR && isTouch());

    // Permission prompts must come straight from the tap, so ask before anything slow happens.
    const motionAsk = wantCamera ? askMotion() : Promise.resolve("none");
    const cameraAsk = wantCamera ? askCamera() : Promise.resolve({ stream: null, reason: null });
    const audio = unlockAudio();

    try {
      const [THREE, motion, cam] = await Promise.all([import("three"), motionAsk, cameraAsk]);
      await begin({ THREE, wantXR, wantCamera, motion, stream: cam.stream, cameraReason: cam.reason, audio });
    } catch (err) {
      console.error("[ar] could not start", err);
      stop();
      showAlert("The 3D view could not start on this device. " + (err && err.message ? err.message : ""));
    } finally {
      startBtn.disabled = false;
      startBtn.querySelector(".btn-text").textContent = "Start";
    }
  });

  /** iOS asks for motion access with a prompt; everywhere else it is simply there (or not). */
  async function askMotion() {
    try {
      const D = window.DeviceOrientationEvent;
      if (!D) return "missing";
      if (typeof D.requestPermission === "function") return (await D.requestPermission()) === "granted" ? "granted" : "denied";
      return "granted";
    } catch { return "denied"; }
  }

  async function askCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return { stream: null, reason: "missing" };
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      return { stream, reason: null };
    } catch (err) {
      const name = err && err.name;
      return { stream: null, reason: name === "NotAllowedError" || name === "SecurityError" ? "denied" : name === "NotFoundError" || name === "OverconstrainedError" ? "missing" : "failed" };
    }
  }

  /** One <audio> element, started from the tap so later speech is allowed to play on iPhone. */
  function unlockAudio() {
    try {
      const el = new Audio();
      el.preload = "auto";
      el.src = SILENCE;
      const p = el.play();
      if (p && p.catch) p.catch(() => {});
      return el;
    } catch { return null; }
  }

  // ------------------------------------------------------------------ the session

  async function begin({ THREE, wantXR, wantCamera, motion, stream, cameraReason, audio }) {
    const r = run = {
      THREE, audio, stream, entries: [], keys: new Set(), stopPoll: null, disposed: false,
      mode: "desktop", models: null, movement: null, cardTimer: null, session: null, cleanups: [],
    };

    if (ctx.query.has("debug")) window.__wwAR = r;          // dev only: lets an automated check find a creature to tap

    // Shared helpers are optional: without them creatures are simple coloured shapes on circular paths.
    const [models, movement] = await Promise.all([
      import("/shared/models.js").catch((e) => { console.warn("[ar] /shared/models.js unavailable:", e && e.message); return null; }),
      import("/shared/movement.js").catch((e) => { console.warn("[ar] /shared/movement.js unavailable:", e && e.message); return null; }),
    ]);
    if (r.disposed) return;
    r.models = models && typeof models.loadCreature === "function" ? models : null;
    r.movement = movement && typeof movement.createMover === "function" ? movement : null;

    // ---- DOM
    const hint = h("div", { class: "ar-hint", id: "ar-hint" }, "Tap a creature to meet it.");
    const soundOn = store.get("ww_ar_sound", "1") !== "0";
    r.sound = soundOn;
    const soundBtn = h("button", { class: "btn ar-close", type: "button", id: "ar-sound", "aria-label": "Sound on or off", "aria-pressed": soundOn ? "true" : "false", html: icon("sound") });
    soundBtn.style.opacity = soundOn ? "1" : "0.55";
    soundBtn.addEventListener("click", () => {
      r.sound = !r.sound;
      store.set("ww_ar_sound", r.sound ? "1" : "0");
      soundBtn.setAttribute("aria-pressed", r.sound ? "true" : "false");
      soundBtn.style.opacity = r.sound ? "1" : "0.55";
      if (!r.sound) hush();
      ctx.toast(r.sound ? "Sound on." : "Sound off.");
    });
    const closeBtn = h("button", { class: "btn ar-close", type: "button", id: "ar-close", "aria-label": "Close the AR view", html: icon("close"), onclick: stop });
    const msg = h("div", { class: "ar-msg", id: "ar-msg", hidden: true });
    const card = h("div", { class: "ar-card", id: "ar-card", hidden: true, "aria-live": "polite" });
    const ui = h("div", { class: "ar-ui", id: "ar-ui" },
      h("div", { class: "ar-top" }, hint, h("div", { class: "row", style: { gap: "8px" } }, soundBtn, closeBtn)),
      h("div", { class: "ar-bottom" }, msg, card));
    for (const el of [soundBtn, closeBtn, card]) el.addEventListener("beforexrselect", (e) => e.preventDefault());
    const stage = h("div", { class: "ar-stage", id: "ar-stage" });
    r.stage = stage; r.ui = ui; r.card = card; r.msg = msg; r.hint = hint;

    // ---- three.js
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    const world = new THREE.Group();           // floor at y = 0 in here
    scene.add(world);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x9fb6d0, 2.4));
    const sun = new THREE.DirectionalLight(0xfff4e6, 1.8);
    sun.position.set(1.5, 4, 2);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(64, 1, 0.05, 80);
    camera.position.set(0, EYE, 0);
    camera.rotation.order = "YXZ";
    Object.assign(r, { renderer, scene, world, camera });

    stage.append(renderer.domElement, ui);
    document.body.append(stage);
    // Short messages over the view (permissions, lost camera). Several in a row are shown together.
    let sayTimer = null;
    const say = (text) => {
      msg.textContent = msg.hidden ? text : msg.textContent + " " + text;
      msg.hidden = false;
      clearTimeout(sayTimer);
      sayTimer = setTimeout(() => { if (run === r) msg.hidden = true; }, 9000);
    };
    r.say = say;

    /** The rear camera as the background. If the camera stops (another app takes it, the phone sleeps), fall back to the sky. */
    const showCamera = (s) => {
      const el = h("video", { playsinline: true, muted: true, autoplay: true, id: "ar-video", "aria-hidden": "true" });
      el.muted = true; el.playsInline = true;
      el.srcObject = s;
      el.play().catch(() => {});
      stage.prepend(el);
      r.mode = "camera"; stage.dataset.mode = "camera";
      const lost = () => {
        if (run !== r || !el.isConnected) return;
        el.remove();
        r.mode = "sky"; stage.dataset.mode = "sky";
        say("The camera stopped, so the creatures are in a snowy sky for now. Close this view and start again to bring the camera back.");
      };
      const track = s.getVideoTracks()[0];
      if (!track || track.readyState === "ended") lost(); else track.addEventListener("ended", lost);
    };
    if (stream) showCamera(stream);

    document.body.classList.add("ar-live");
    intro.hidden = true;
    stage.dataset.mode = r.mode;

    const resize = () => {
      if (renderer.xr.isPresenting) return;
      const w = stage.clientWidth || window.innerWidth, hgt = stage.clientHeight || window.innerHeight;
      renderer.setSize(w, hgt, false);
      camera.aspect = w / Math.max(1, hgt);
      camera.fov = camera.aspect < 1 ? 64 : 48;      // roughly a phone's rear camera, portrait or landscape
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener("resize", resize);
    r.cleanups.push(() => window.removeEventListener("resize", resize));

    // ---- WebXR (Android Chrome)
    let xrOk = false;
    if (wantXR && navigator.xr) {
      try {
        const session = await navigator.xr.requestSession("immersive-ar", { optionalFeatures: ["dom-overlay"], domOverlay: { root: ui } });
        renderer.xr.enabled = true;
        renderer.xr.setReferenceSpaceType("local");
        await renderer.xr.setSession(session);
        r.session = session;
        r.mode = "xr";
        xrOk = true;
        world.position.set(0, -EYE, 0);         // "local" space starts at the phone, so the floor is about EYE below it
        camera.position.set(0, 0, 0);
        if (ui.parentElement !== stage) stage.append(ui);
        session.addEventListener("end", () => { if (run === r) stop(); });
        session.addEventListener("select", (e) => {
          try {
            const pose = e.frame.getPose(e.inputSource.targetRaySpace, renderer.xr.getReferenceSpace());
            if (!pose) return;
            const m = new THREE.Matrix4().fromArray(pose.transform.matrix);
            const origin = new THREE.Vector3().setFromMatrixPosition(m);
            const dir = new THREE.Vector3(0, 0, -1).transformDirection(m);
            tap(new THREE.Ray(origin, dir));
          } catch (err) { console.warn("[ar] tap failed", err); }
        });
      } catch (err) {
        console.warn("[ar] WebXR session refused, using the camera view instead:", err && err.message);
        renderer.xr.enabled = false;
      }
    }
    if (r.disposed) return;
    stage.dataset.mode = r.mode;

    // WebXR was wanted but did not start: try the camera view now (still close enough to the tap on Android).
    if (wantXR && !xrOk && isTouch() && !stream) {
      const cam = await askCamera();
      if (r.disposed) { if (cam.stream) cam.stream.getTracks().forEach((t) => t.stop()); return; }
      if (cam.stream) {
        r.stream = stream = cam.stream;
        showCamera(stream);
        motion = await askMotion();
      } else cameraReason = cam.reason;
      wantCamera = true;
    }

    // ---- looking around without WebXR: tilt (when allowed) plus drag
    const look = { yaw: 0, pitch: 0, dragYaw: 0, useTilt: false, gotTilt: false, baseYaw: null };
    if (r.mode !== "xr") {
      const q = new THREE.Quaternion(), qTilt = new THREE.Quaternion(), qYaw = new THREE.Quaternion();
      const zee = new THREE.Vector3(0, 0, 1), up = new THREE.Vector3(0, 1, 0), euler = new THREE.Euler(), q0 = new THREE.Quaternion();
      const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));     // the camera looks out of the back of the phone
      const fwd = new THREE.Vector3();
      const rad = Math.PI / 180;

      const onTilt = (e) => {
        if (e.alpha === null || e.beta === null || e.gamma === null) return;
        const orient = ((screen.orientation && screen.orientation.angle) || window.orientation || 0) * rad;
        euler.set(e.beta * rad, e.alpha * rad, -e.gamma * rad, "YXZ");
        q.setFromEuler(euler).multiply(q1).multiply(q0.setFromAxisAngle(zee, -orient));
        if (look.baseYaw === null) {
          fwd.set(0, 0, -1).applyQuaternion(q);
          look.baseYaw = -Math.atan2(-fwd.x, -fwd.z);          // whatever way the phone points at first becomes "ahead"
          qTilt.copy(q);
        } else qTilt.slerp(q, 0.4);
        look.gotTilt = true;
      };
      if (wantCamera && motion === "granted") {
        look.useTilt = true;
        window.addEventListener("deviceorientation", onTilt);
        r.cleanups.push(() => window.removeEventListener("deviceorientation", onTilt));
      }

      r.applyLook = () => {
        if (look.useTilt && look.gotTilt) {
          qYaw.setFromAxisAngle(up, (look.baseYaw || 0) + look.dragYaw);
          camera.quaternion.copy(qYaw).multiply(qTilt);
        } else {
          camera.rotation.set(look.pitch, look.yaw, 0, "YXZ");
        }
      };

      // Drag to look; a short press without movement is a tap.
      const canvas = renderer.domElement;
      const ray = new THREE.Raycaster();
      const ndc = new THREE.Vector2();
      let down = null;
      const onDown = (e) => { down = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, t: performance.now(), moved: 0, id: e.pointerId }; canvas.setPointerCapture?.(e.pointerId); };
      const onMove = (e) => {
        if (!down || e.pointerId !== down.id) return;
        const dx = e.clientX - down.lx, dy = e.clientY - down.ly;
        down.lx = e.clientX; down.ly = e.clientY;
        down.moved += Math.abs(dx) + Math.abs(dy);
        const k = (camera.fov * rad) / Math.max(1, canvas.clientHeight);      // one pixel of drag = one pixel of view
        if (look.useTilt && look.gotTilt) look.dragYaw += dx * k;
        else {
          look.yaw += dx * k;
          look.pitch = Math.max(-1.2, Math.min(1.2, look.pitch + dy * k));
        }
      };
      const onUp = (e) => {
        if (!down || e.pointerId !== down.id) return;
        const wasTap = down.moved < 10 && performance.now() - down.t < 600;
        down = null;
        if (!wasTap) return;
        const rect = canvas.getBoundingClientRect();
        ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
        camera.updateMatrixWorld();
        ray.setFromCamera(ndc, camera);
        tap(ray.ray);
      };
      canvas.addEventListener("pointerdown", onDown);
      canvas.addEventListener("pointermove", onMove);
      canvas.addEventListener("pointerup", onUp);
      canvas.addEventListener("pointercancel", () => { down = null; });

      // Without a camera picture, a pale snow floor gives the eye something to hold on to.
      if (r.mode !== "camera") {
        const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 40), new THREE.MeshBasicMaterial({ color: 0xf2f7fc }));
        floor.rotation.x = -Math.PI / 2;
        world.add(floor);
        const ring = new THREE.Mesh(new THREE.RingGeometry(3.4, 3.5, 48), new THREE.MeshBasicMaterial({ color: 0xd6e3f2 }));
        ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01;
        world.add(ring);
        look.pitch = -0.05;
      }
    }

    // ---- say what happened with the permissions
    const notes = [];
    if (wantCamera && !stream) {
      notes.push(cameraReason === "denied"
        ? "The camera is turned off for this page, so the creatures are in a snowy sky instead. Allow the camera in the browser settings, then start again."
        : cameraReason === "missing" ? "No camera was found, so the creatures are in a snowy sky instead."
        : "The camera could not be started, so the creatures are in a snowy sky instead.");
    }
    if (wantCamera && motion !== "granted") notes.push(motion === "denied" ? "Motion is turned off, so drag with your finger to look around." : "Drag with your finger to look around.");
    if (wantXR && !xrOk && !notes.length && r.mode !== "camera") notes.push("AR could not start here, so the creatures are in a snowy sky. Drag to look around.");
    if (notes.length) say(notes.join(" "));
    hint.textContent = r.mode === "xr" ? "Move the phone slowly. Tap a creature to meet it."
      : look.useTilt ? "Turn the phone to look around. Tap a creature to meet it."
      : "Drag to look around. Tap a creature to meet it.";
    if (look.useTilt) setTimeout(() => {
      if (run === r && !look.gotTilt) { look.useTilt = false; hint.textContent = "Drag to look around. Tap a creature to meet it."; }
    }, 2500);

    // ---- frame loop
    const viewer = new THREE.Vector3();
    let last = 0, elapsed = 0;
    renderer.setAnimationLoop((time) => {
      if (r.disposed) return;
      const dt = last ? Math.min(0.1, (time - last) / 1000) : 0;
      last = time; elapsed += dt;
      if (r.applyLook && !renderer.xr.isPresenting) r.applyLook();
      viewer.copy(camera.position).sub(world.position);
      for (const en of r.entries) {
        try { en.mover.update(dt, elapsed, viewer); } catch (err) { if (!en.warned) { en.warned = true; console.warn("[ar] mover failed", err); en.mover = simpleMover(THREE, en.object, en.seed); } }
        if (en.pulse > 0) {
          en.pulse = Math.max(0, en.pulse - dt * 2.2);
          const s = 1 + Math.sin(en.pulse * Math.PI) * 0.35;
          en.object.scale.copy(en.baseScale).multiplyScalar(s);
        }
        if (en.grow < 1) { en.grow = Math.min(1, en.grow + dt * 2); en.object.scale.copy(en.baseScale).multiplyScalar(0.2 + 0.8 * en.grow); }
      }
      renderer.render(scene, camera);
      stage.dataset.frames = String((Number(stage.dataset.frames) || 0) + 1);
    });

    // ---- creatures
    LIBRARY.forEach((id, i) => addCreature(r, { key: `lib:${id}:${i}`, id }));
    loadRoom(r);
  }

  /** The room's gifts so far, then anything that arrives while the view is open. */
  async function loadRoom(r) {
    let latest = 0;
    try {
      let after = 0;
      const ready = [];
      for (let page = 0; page < 6; page++) {
        const data = await ctx.api.getGifts(after);
        const gifts = Array.isArray(data.gifts) ? data.gifts : [];
        ready.push(...gifts);
        latest = Math.max(latest, Number(data.latest) || 0, ...gifts.map((g) => Number(g.id) || 0));
        if (gifts.length < 50) break;
        after = gifts[gifts.length - 1].id;
      }
      if (r.disposed) return;
      const creatures = ready.filter((g) => g.kind === "creature" && g.option_id).slice(-MAX_GIFT_CREATURES);
      const companions = ready.filter((g) => g.kind === "mesh" && g.model_url).slice(-MAX_COMPANIONS);
      for (const g of [...creatures, ...companions]) addGift(r, g);
    } catch (err) {
      if (r.disposed) return;
      r.say("The room's gifts could not be loaded just now, so here are some friends from the library.");
    }
    if (r.disposed) return;
    try {
      r.stopPoll = ctx.api.pollGifts((g) => { if (run === r) addGift(r, g, true); }, { intervalMs: 3000, after: latest });
    } catch (err) { console.warn("[ar] could not watch for new gifts", err); }
  }

  function addGift(r, gift, isNew = false) {
    if (!gift || gift.status === "pending" || gift.status === "failed") return;
    if (gift.kind === "creature" && gift.option_id) {
      addCreature(r, { key: "gift:" + gift.id, id: gift.option_id, gift, isNew });
    } else if (gift.kind === "mesh" && gift.model_url) {
      addCreature(r, { key: "gift:" + gift.id, modelUrl: gift.model_url, gift, isNew });
    }
  }

  async function addCreature(r, { key, id, modelUrl, gift, isNew }) {
    if (r.keys.has(key)) return;
    r.keys.add(key);
    const { THREE } = r;
    const info = id ? creatureInfo(id) : null;
    const seed = hash(key);
    let object = null, row = null;
    try {
      if (modelUrl) {
        object = r.models ? await r.models.loadModelUrl(modelUrl, 0.3) : await loadPlainGlb(THREE, modelUrl, 0.3);
        row = { id: "companion", move: "hover", speed: 0.2, size: 0.3 };
      } else if (r.models) {
        object = await r.models.loadCreature(id);
        row = (object.userData && object.userData.creature) || { id, move: "swim", speed: 0.35 };
      }
    } catch (err) {
      console.warn("[ar] could not load", key, err && err.message);
      if (modelUrl) { return; }                     // a companion that will not load is left out
    }
    if (r.disposed) return;
    if (!object) {
      object = simpleShape(THREE, info ? info.color : null, seed, (info && info.size) || 0.32);
      row = { id, move: "swim", speed: 0.35 };
    }

    // Keep the room readable: only so many gifts at once, oldest out first.
    const group = modelUrl ? "companion" : gift ? "gift" : "lib";
    const same = r.entries.filter((e) => e.group === group);
    const cap = group === "companion" ? MAX_COMPANIONS : group === "gift" ? MAX_GIFT_CREATURES : LIBRARY.length;
    if (same.length >= cap) removeEntry(r, same[0]);

    // In a real room Unity shows a creature at size * arScale (a whale would not fit otherwise).
    const arScale = Number(row.arScale) > 0 ? Number(row.arScale) : 1;
    if (arScale !== 1) object.scale.multiplyScalar(arScale);

    // Keep its Unity ring and height where they fit "1 to 3 m around the viewer".
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const ring = Array.isArray(row.ring) && row.ring.length === 2 ? row.ring : [1, 3];
    const heights = Array.isArray(row.height) && row.height.length === 2 ? row.height : [EYE - 0.45, EYE + 0.45];
    const options = {
      center: new THREE.Vector3(0, 0, 0),
      minRadius: modelUrl ? 0.9 : clamp(ring[0], 1, 3), maxRadius: modelUrl ? 1.5 : clamp(ring[1], 1, 3),
      height: modelUrl ? EYE - 0.25 : clamp(heights[0] + rand01(seed) * (heights[1] - heights[0]), 0.6, 2.1),
      seed,
    };
    if (isNew) { options.angle = Math.PI / 2 + r.camera.rotation.y; options.radius = 1.4; }   // arrive roughly in front
    let mover = null;
    if (r.movement) {
      try { mover = r.movement.createMover(object, row, options); } catch (err) { console.warn("[ar] createMover failed", err); }
    }
    if (!mover) mover = simpleMover(THREE, object, seed, options);

    r.world.add(object);
    const box = new THREE.Box3().setFromObject(object);
    const radius = Math.max(0.12, box.getSize(new THREE.Vector3()).length() * 0.5);
    const entry = {
      key, group, object, mover, seed, radius,
      baseScale: object.scale.clone(), pulse: 0, grow: 0,
      id: id || null, gift: gift || null,
      name: info ? info.name : (companionName(gift) || "A scanned companion"),
      fact: info ? info.fact : "",
    };
    object.scale.multiplyScalar(0.2);
    r.entries.push(entry);
    r.stage.dataset.creatures = String(r.entries.length);
    if (isNew && gift) {
      showCard(r, entry, true);
    }
  }

  function removeEntry(r, entry) {
    const i = r.entries.indexOf(entry);
    if (i >= 0) r.entries.splice(i, 1);
    try { entry.mover.dispose?.(); } catch { /* ignored */ }
    r.world.remove(entry.object);
  }

  // ------------------------------------------------------------------ tapping

  function tap(ray) {
    const r = run;
    if (!r) return;
    const { THREE } = r;
    const p = new THREE.Vector3(), toP = new THREE.Vector3();
    let best = null, bestScore = Infinity;
    for (const en of r.entries) {
      en.object.getWorldPosition(p);
      toP.copy(p).sub(ray.origin);
      const along = toP.dot(ray.direction);
      if (along < 0.15) continue;
      const miss = Math.sqrt(Math.max(0, toP.lengthSq() - along * along));
      const reach = Math.max(en.radius * 1.15, 0.2) + along * 0.05;      // a finger is not a pin: be generous, more so far away
      if (miss > reach) continue;
      const score = miss / reach + along * 0.02;
      if (score < bestScore) { bestScore = score; best = en; }
    }
    if (best) showCard(r, best, false);
    else hideCard(r);
  }

  function showCard(r, entry, arrived) {
    const g = entry.gift;
    const title = entry.name;
    const lines = [];
    if (g && g.sender) lines.push(h("p", { class: "from" }, arrived ? `Just arrived from ${g.sender}` : `A gift from ${g.sender}`));
    const body = entry.fact || (g && g.message) || "";
    r.card.replaceChildren(
      entry.id ? thumb(entry.id, 60) : h("span", { class: "thumb", role: "img", "aria-label": "Scanned companion" }, h("span", { class: "emoji", "aria-hidden": "true" }, "🧸")),
      h("div", { style: { minWidth: "0", flex: "1 1 0" } }, ...lines, h("h3", null, title), body ? h("p", null, body) : null));
    const t = r.card.querySelector(".thumb");
    if (t) t.style.setProperty("--size", "60px");
    r.card.hidden = false;
    r.card.dataset.id = entry.id || "companion";
    entry.pulse = 1;
    // The shared mover can slow down, so the creature holds nearly still while its card is up.
    for (const en of r.entries) if (en.mover && "speedScale" in en.mover) en.mover.speedScale = en === entry ? 0.15 : 1;
    clearTimeout(r.cardTimer);
    r.cardTimer = setTimeout(() => hideCard(r), 10000);
    speak(r, [title, body].filter(Boolean).join(". "));
  }

  function hideCard(r) {
    clearTimeout(r.cardTimer);
    r.card.hidden = true;
    for (const en of r.entries) if (en.mover && "speedScale" in en.mover) en.mover.speedScale = 1;
  }

  // ------------------------------------------------------------------ voice

  let speakToken = 0;
  function hush() {
    speakToken++;
    try { if (run && run.audio) run.audio.pause(); } catch { /* ignored */ }
    try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch { /* ignored */ }
  }

  /** The game's voice through the API; the phone's own voice if that is not available. The words are always on the card. */
  async function speak(r, text) {
    hush();
    if (!r.sound || !text) return;
    const token = speakToken;
    try {
      const url = await ctx.api.tts(text.slice(0, 400));
      if (token !== speakToken || run !== r || !url) return;
      const el = r.audio || new Audio();
      el.src = url;
      await el.play();
    } catch (err) {
      if (token !== speakToken || run !== r) return;
      try {
        if (!window.speechSynthesis) return;
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 0.95; u.pitch = 1.1;
        window.speechSynthesis.speak(u);
      } catch { /* silent: the card still shows the words */ }
    }
  }

  // ------------------------------------------------------------------ stopping

  function stop() {
    const r = run;
    if (!r) return;
    run = null;
    r.disposed = true;
    hush();
    clearTimeout(r.cardTimer);
    if (r.stopPoll) { try { r.stopPoll(); } catch { /* ignored */ } }
    for (const fn of r.cleanups) { try { fn(); } catch { /* ignored */ } }
    if (r.renderer) {
      try { r.renderer.setAnimationLoop(null); } catch { /* ignored */ }
      if (r.session) { try { r.session.end().catch(() => {}); } catch { /* ignored */ } }
      for (const en of r.entries) { try { en.mover.dispose?.(); } catch { /* ignored */ } }
      try { r.renderer.dispose(); } catch { /* ignored */ }
    }
    if (r.stream) for (const t of r.stream.getTracks()) t.stop();
    if (r.stage) r.stage.remove();
    if (r.ui) r.ui.remove();
    document.body.classList.remove("ar-live");
    intro.hidden = false;
  }

  return {
    // Leaving the tab (or the page going to the background) releases the camera. An immersive AR session is the
    // exception: some browsers report the page as hidden while it runs, and it ends itself through its own event.
    onHide() { if (run && run.session && document.hidden) return; stop(); },
    onRoomChange: stop,
  };
}

// ---------------------------------------------------------------------------------------------------- helpers

function hash(s) {
  let x = 2166136261;
  for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); }
  return x >>> 0;
}
function rand01(seed, salt = 0) {
  let t = (seed + 0x6d2b79f5 * (salt + 1)) | 0;
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const PALETTE = [0xfa7a1a, 0x4f9ad6, 0x8ccf6a, 0xf2c14e, 0xc78be0, 0xf08a8a];

/** Stand-in when the shared model loader is missing: a small low-poly fish in the creature's colour, facing +Z. */
function simpleShape(THREE, cssColor, seed, size) {
  const color = new THREE.Color(PALETTE[seed % PALETTE.length]);
  if (cssColor) { try { color.set(cssColor); } catch { /* keep the palette colour */ } }
  const mat = new THREE.MeshLambertMaterial({ color, flatShading: true });
  const dark = new THREE.MeshLambertMaterial({ color: color.clone().multiplyScalar(0.7), flatShading: true });
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), mat);
  body.scale.set(0.42, 0.6, 1);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.5, 4), dark);
  tail.rotation.x = Math.PI / 2; tail.position.z = -0.68; tail.scale.set(0.3, 1, 1);
  const fin = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 4), dark);
  fin.position.set(0, 0.36, -0.05); fin.scale.set(0.3, 1, 1);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x14141a });
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), eyeMat);
    eye.position.set(sx * 0.17, 0.1, 0.33);
    g.add(eye);
  }
  g.add(body, tail, fin);
  const holder = new THREE.Group();
  g.scale.setScalar(size / 1.2);
  holder.add(g);
  return holder;
}

/** Stand-in when the shared movement is missing: a circle around the viewer with a gentle bob. */
function simpleMover(THREE, object, seed, options = {}) {
  const minR = options.minRadius ?? 1, maxR = options.maxRadius ?? 3;
  const radius = options.radius ?? minR + rand01(seed, 1) * (maxR - minR);
  const height = options.height ?? EYE - 0.3 + rand01(seed, 2) * 0.7;
  const dir = rand01(seed, 3) < 0.5 ? 1 : -1;
  const speed = 0.25 + rand01(seed, 4) * 0.25;
  const phase = rand01(seed, 5) * Math.PI * 2;
  let angle = options.angle ?? rand01(seed, 6) * Math.PI * 2;
  const center = new THREE.Vector3();
  if (options.center) center.copy(options.center);
  return {
    update(dt, elapsed) {
      angle += dir * (speed / radius) * dt;
      const x = Math.cos(angle) * radius, z = -Math.sin(angle) * radius;
      object.position.set(center.x + x, center.y + height + Math.sin(elapsed * 0.7 + phase) * 0.12, center.z + z);
      // face along the path: the tangent of the circle
      const tx = -Math.sin(angle) * dir, tz = -Math.cos(angle) * dir;
      object.rotation.set(0, Math.atan2(tx, tz) + Math.sin(elapsed * 5 + phase) * 0.12, 0);
    },
    dispose() {},
  };
}

/** A .glb by URL without the shared loader, scaled so its longest side is `size` and centred. */
async function loadPlainGlb(THREE, url, size) {
  const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
  const gltf = await new GLTFLoader().loadAsync(url);
  const model = gltf.scene || gltf.scenes[0];
  const box = new THREE.Box3().setFromObject(model);
  const dims = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  model.position.sub(centre);
  const inner = new THREE.Group();
  inner.add(model);
  inner.scale.setScalar(size / (Math.max(dims.x, dims.y, dims.z) || 1));
  const holder = new THREE.Group();
  holder.add(inner);
  return holder;
}
