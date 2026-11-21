// Scan tab: photograph a toy (one photo, or up to four: front, back and sides, so the back is not guessed), shrink
// the photos, send them to be built into a 3D companion, show progress, then a spinnable preview.
// A switch at the top swaps to the fruit side (scan-fruit.js): a fruit photo cut out for Frost Slice.
import { h, fill, icon, thumb, creatureInfo, plainName, errorText, clock, store, shrinkToJpeg, companion } from "/phone/lib.js";

const POLL_MS = 3000;
const GIVE_UP_MS = 5 * 60 * 1000;       // the server falls back to a library creature after two minutes; this is a last resort
const PENDING_KEY = "ww_scan_pending";
const MAX_PHOTOS = 4;
const SLOTS = ["Front", "Back", "Left side", "Right side"];

const FLAKE = `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true">
<g id="arm"><path d="M24 24V5M24 10l-4-4M24 10l4-4M24 16l-3-3M24 16l3-3"/></g>
<use href="#arm" transform="rotate(60 24 24)"/><use href="#arm" transform="rotate(120 24 24)"/><use href="#arm" transform="rotate(180 24 24)"/>
<use href="#arm" transform="rotate(240 24 24)"/><use href="#arm" transform="rotate(300 24 24)"/></svg>`;

/** What is being built, for "Building your golden teddy bear...". */
const nameOf = (gift) => companion(gift).bare || "companion";

export function mount(root, ctx) {
  const photos = [];             // [{ blob, url }] the chosen pictures, front first (already shrunk)
  let shown = 0;                 // which photo the big frame shows
  let pollTimer = null, tickTimer = null;
  let startedAt = 0, pendingId = null, pendingName = "companion", misses = 0;
  let viewer = null;             // three.js preview, created on demand
  let busy = false;

  // ---- step 1: choose a photo
  const { row: nameRow, input: nameInput } = ctx.sender.field("scan");
  const frame = h("div", { class: "photo-frame", id: "scan-frame" },
    h("div", { class: "hint" }, h("span", { html: icon("camera") }), "Your photo will show here."));
  const cameraInput = h("input", { type: "file", accept: "image/*", capture: "environment", id: "scan-camera", "aria-label": "Take a photo" });
  const libraryInput = h("input", { type: "file", accept: "image/*", multiple: true, id: "scan-library", "aria-label": "Choose photos" });
  const views = h("div", { class: "views", id: "scan-views", role: "list", "aria-label": "Photos of the toy" });
  const viewsNote = h("p", { class: "muted views-note", id: "scan-views-note" });
  const alertBox = h("div", { class: "note bad", role: "alert", hidden: true, style: { marginBottom: "14px" } });
  const buildBtn = h("button", { class: "btn primary big block", type: "button", id: "scan-go", disabled: true },
    h("span", { class: "btn-text" }, "Build my companion"));

  const pickCard = h("div", { class: "card snowcap", id: "scan-pick" },
    h("div", { class: "ribbon-row" }, h("h1", { class: "ribbon" }, "Scan a toy")),
    h("p", { class: "lead" }, "Take a photo of a toy or an object. It becomes a 3D companion that floats beside them."),
    h("p", { class: "lead small" }, "Add photos of the back and sides too (up to four) and the 3D model is right all the way round."),
    h("ul", { class: "tips", "aria-label": "Tips for a good photo" },
      h("li", null, h("span", { html: icon("one") }), "One object"),
      h("li", null, h("span", { html: icon("plain") }), "Plain background"),
      h("li", null, h("span", { html: icon("sun") }), "Good light")),
    nameRow,
    frame,
    views,
    viewsNote,
    h("div", { class: "pick-row" },
      h("label", { class: "btn filebtn", id: "scan-take" }, h("span", { html: icon("camera") }), "Take photo", cameraInput),
      h("label", { class: "btn filebtn", id: "scan-choose" }, h("span", { html: icon("image") }), "Choose", libraryInput)),
    alertBox,
    buildBtn);

  // ---- step 2: building
  const buildTitle = h("p", { class: "build-title", id: "scan-building-line" }, "Building your companion... about a minute.");
  const buildSub = h("p", { class: "muted", id: "scan-building-sub" }, "You can keep this page open. It can take up to two minutes.");
  const barFill = h("i");
  const elapsedEl = h("span", { class: "elapsed", id: "scan-elapsed" }, "0:00");
  const buildCard = h("div", { class: "card snowcap build", id: "scan-building", hidden: true, "aria-live": "polite" },
    h("div", { class: "ribbon-row" }, h("h1", { class: "ribbon" }, "Building")),
    h("div", { class: "flake", html: FLAKE }),
    buildTitle,
    buildSub,
    h("div", { class: "bar", role: "progressbar", "aria-label": "Building progress", "aria-valuemin": "0", "aria-valuemax": "100" }, barFill),
    elapsedEl);

  // ---- step 3: result
  const resultCard = h("div", { class: "card snowcap done", id: "scan-result", hidden: true, "aria-live": "polite" });

  // ---- toy or fruit
  const toyRoot = h("div", { id: "scan-toy" });
  const fruitRoot = h("div", { id: "scan-fruit", hidden: true });
  const toyBtn = h("button", { class: "btn", type: "button", id: "scan-mode-toy", "aria-pressed": "true" }, h("span", { class: "emoji", "aria-hidden": "true" }, "🧸"), "Scan a toy");
  const fruitBtn = h("button", { class: "btn", type: "button", id: "scan-mode-fruit", "aria-pressed": "false" }, h("span", { class: "emoji", "aria-hidden": "true" }, "🍌"), "Scan Fruit for Frost Slice");
  let fruitTab = null, fruitLoading = null;

  async function setMode(mode) {
    const fruit = mode === "fruit";
    toyBtn.classList.toggle("on", !fruit); toyBtn.setAttribute("aria-pressed", String(!fruit));
    fruitBtn.classList.toggle("on", fruit); fruitBtn.setAttribute("aria-pressed", String(fruit));
    toyRoot.hidden = fruit; fruitRoot.hidden = !fruit;
    store.set("ww_scan_mode", mode);
    if (!fruit) return;
    if (!fruitLoading) {
      fruitLoading = import("/phone/tabs/scan-fruit.js")
        .then((m) => { fruitTab = m.mount(fruitRoot, ctx) || {}; })
        .catch((err) => {
          fruitLoading = null;
          console.error("[scan] the fruit scanner could not start", err);
          fill(fruitRoot, h("div", { class: "card" }, h("div", { class: "note bad", role: "alert" }, h("span", { html: icon("warn") }),
            h("span", null, "The fruit scanner could not load. Check the connection, then tap the button again."))));
        });
    } else if (fruitTab && fruitTab.onShow) fruitTab.onShow();
    await fruitLoading;
  }
  toyBtn.addEventListener("click", () => setMode("toy"));
  fruitBtn.addEventListener("click", () => setMode("fruit"));

  toyRoot.append(pickCard, buildCard, resultCard);
  root.append(h("div", { class: "scan-switch", role: "group", "aria-label": "What to scan" }, toyBtn, fruitBtn), toyRoot, fruitRoot);

  // ------------------------------------------------------------------ choosing

  function showAlert(message) {
    alertBox.replaceChildren(h("span", { html: icon("warn") }), h("span", null, message));
    alertBox.hidden = false;
  }

  function drawPhotos() {
    if (!photos.length) {
      frame.classList.remove("has");
      frame.replaceChildren(h("div", { class: "hint" }, h("span", { html: icon("camera") }), "Your photo will show here."));
      delete frame.dataset.bytes;
    } else {
      shown = Math.min(shown, photos.length - 1);
      const p = photos[shown];
      frame.replaceChildren(h("img", { src: p.url, alt: `The ${SLOTS[shown].toLowerCase()} photo`, id: "scan-preview" }));
      frame.classList.add("has");
      frame.dataset.bytes = String(photos.reduce((n, x) => n + x.blob.size, 0));
    }
    const slots = [];
    for (let i = 0; i < MAX_PHOTOS; i++) {
      const p = photos[i];
      if (p) {
        slots.push(h("div", { class: "view" + (i === shown ? " on" : ""), role: "listitem" },
          h("button", { type: "button", class: "view-pic", "aria-label": `Show the ${SLOTS[i].toLowerCase()} photo`, onclick: () => { shown = i; drawPhotos(); } },
            h("img", { src: p.url, alt: "" })),
          h("span", { class: "view-label" }, SLOTS[i]),
          h("button", { type: "button", class: "view-x", "aria-label": `Remove the ${SLOTS[i].toLowerCase()} photo`, onclick: () => removePhoto(i) }, "×")));
      } else if (i === photos.length && i > 0) {
        slots.push(h("label", { class: "view add", role: "listitem" },
          h("span", { class: "view-plus", "aria-hidden": "true" }, "+"),
          h("span", { class: "view-label" }, SLOTS[i]),
          h("input", { type: "file", accept: "image/*", capture: "environment", "aria-label": `Take the ${SLOTS[i].toLowerCase()} photo`,
            onchange: (e) => { addPhotos(e.target.files); e.target.value = ""; } })));
      } else {
        slots.push(h("div", { class: "view empty", role: "listitem", "aria-hidden": "true" }, h("span", { class: "view-label" }, SLOTS[i])));
      }
    }
    views.replaceChildren(...slots);
    views.hidden = photos.length === 0;
    viewsNote.textContent = photos.length === 1 ? "Next: the back. Turn the toy around and take another photo."
      : photos.length > 1 && photos.length < MAX_PHOTOS ? `${photos.length} photos. More sides make a better model.`
      : photos.length === MAX_PHOTOS ? "4 photos: all the way round." : "";
    buildBtn.disabled = photos.length === 0 || busy;
    buildBtn.querySelector(".btn-text").textContent = photos.length > 1 ? `Build from ${photos.length} photos` : "Build my companion";
  }

  function removePhoto(i) {
    const [gone] = photos.splice(i, 1);
    if (gone) URL.revokeObjectURL(gone.url);
    if (shown >= i && shown > 0) shown--;
    drawPhotos();
  }

  async function usePhoto(fileOrBlob) {
    if (!fileOrBlob) return false;
    if (fileOrBlob.type && !/^image\//.test(fileOrBlob.type)) { showAlert("That file is not a picture. Please choose a photo."); return false; }
    if (photos.length >= MAX_PHOTOS) { showAlert(`That is ${MAX_PHOTOS} photos already. Remove one to add another.`); return false; }
    try {
      const { blob } = await shrinkToJpeg(fileOrBlob, 1024, 0.85);
      photos.push({ blob, url: URL.createObjectURL(blob) });
      shown = photos.length - 1;
      return true;
    } catch (err) {
      showAlert(errorText(err, "That photo could not be read. Try taking a new one."));
      return false;
    }
  }

  async function addPhotos(files) {
    alertBox.hidden = true;
    for (const f of Array.from(files || [])) { if (!(await usePhoto(f))) break; }
    drawPhotos();
  }

  cameraInput.addEventListener("change", () => { addPhotos(cameraInput.files); cameraInput.value = ""; });
  libraryInput.addEventListener("change", () => { addPhotos(libraryInput.files); libraryInput.value = ""; });

  // ------------------------------------------------------------------ building

  function showStep(step) {
    pickCard.hidden = step !== "pick";
    buildCard.hidden = step !== "build";
    resultCard.hidden = step !== "result";
    if (step !== "result" && viewer) { viewer.dispose(); viewer = null; }
    window.scrollTo(0, 0);
  }

  function drawProgress() {
    const sec = (Date.now() - startedAt) / 1000;
    elapsedEl.textContent = clock(sec);
    const pct = Math.min(96, 4 + 92 * (1 - Math.exp(-sec / 48)));
    barFill.style.width = pct.toFixed(1) + "%";
    barFill.parentElement.setAttribute("aria-valuenow", String(Math.round(pct)));
    const name = pendingName;
    if (sec < 70) buildTitle.textContent = `Building your ${name}... about a minute.`;
    else if (sec < 115) buildTitle.textContent = `Still building your ${name}... nearly there.`;
    else buildTitle.textContent = `Putting the last touches on your ${name}...`;
  }

  function startWatching(id, name, started) {
    pendingId = id; pendingName = name || "companion"; startedAt = started || Date.now(); misses = 0;
    store.setJSON(PENDING_KEY, { id, name: pendingName, startedAt, room: ctx.room() });
    buildSub.textContent = "You can keep this page open. It can take up to two minutes.";
    showStep("build");
    drawProgress();
    clearInterval(tickTimer); tickTimer = setInterval(drawProgress, 500);
    clearTimeout(pollTimer); pollTimer = setTimeout(poll, POLL_MS);
  }

  function stopWatching() {
    clearInterval(tickTimer); clearTimeout(pollTimer);
    tickTimer = pollTimer = null; pendingId = null;
    store.setJSON(PENDING_KEY, null);
  }

  async function poll() {
    if (!pendingId) return;
    const id = pendingId;
    try {
      const gift = await ctx.api.scanStatus(id);
      if (pendingId !== id) return;
      misses = 0;
      if (gift) {
        if (gift.kind === "mesh") pendingName = nameOf(gift);
        if (gift.kind === "creature" && gift.status !== "pending") return finish(gift);
        if (gift.status === "ready") return finish(gift);
        if (gift.status === "failed") return finish(gift);
      }
      buildSub.textContent = "You can keep this page open. It can take up to two minutes.";
    } catch (err) {
      if (pendingId !== id) return;
      misses++;
      buildSub.textContent = "The connection dropped for a moment. Still checking...";
      if (misses >= 3 && /not found|no such|unknown/i.test(errorText(err))) return failed("We lost track of that scan. Please try the photo again.");
    }
    if (Date.now() - startedAt > GIVE_UP_MS) return failed("That took too long, so we stopped waiting. Your photo is still here if you would like to try again.");
    pollTimer = setTimeout(poll, POLL_MS);
  }

  function failed(message) {
    stopWatching();
    showStep("pick");
    showAlert(message);
  }

  async function finish(gift) {
    stopWatching();
    if (gift.kind === "creature") {
      // The model could not be built, so the server sent the closest library creature instead.
      const info = creatureInfo(gift.option_id);
      const friend = plainName(info);
      const pic = thumb(gift.option_id, 132); pic.classList.add("pop");
      fill(resultCard,
        h("div", { class: "ribbon-row" }, h("h1", { class: "ribbon" }, "A friend is coming")),
        pic,
        h("p", { class: "done-line", id: "scan-result-line" }, `We could not build that one, so a friendly ${friend} is on its way instead.`),
        gift.message ? h("p", { class: "quote" }, String(gift.message)) : null,
        h("button", { class: "btn primary big block", type: "button", id: "scan-again", onclick: reset }, "Scan something else"));
      resultCard.dataset.kind = "creature";
      showStep("result");
      return;
    }
    if (gift.status === "failed" || !gift.model_url) {
      return failed("We could not build that one this time. Your photos are still here, or try new ones with one object on a plain background.");
    }
    const pal = companion(gift);
    const stage = h("div", { class: "viewer", id: "scan-viewer" }, h("p", { class: "viewer-note" }, "Loading the 3D model..."));
    fill(resultCard,
      h("div", { class: "ribbon-row" }, h("h1", { class: "ribbon" }, "Ready")),
      stage,
      h("p", { class: "done-line", id: "scan-result-line" }, pal.name ? `${pal.name} is ready and floating over.` : `Your ${nameOf(gift)} is ready and floating over.`),
      gift.message ? h("p", { class: "quote", id: "scan-result-message" }, String(gift.message)) : null,
      h("p", { class: "done-sub muted" }, pal.what ? `Your photo became ${pal.what} that floats beside them.` : "It will float beside them in their world."),
      h("button", { class: "btn primary big block", type: "button", id: "scan-again", onclick: reset }, "Scan something else"));
    resultCard.dataset.kind = "mesh";
    showStep("result");
    try {
      const { createModelViewer } = await import("/phone/model-viewer.js");
      viewer = await createModelViewer(stage, gift.model_url);
      stage.querySelector(".viewer-note").textContent = "Drag to spin it.";
      stage.dataset.loaded = "1";
    } catch (err) {
      console.warn("[scan] preview failed", err);
      stage.querySelector(".viewer-note").textContent = "The preview could not load here, but your companion is safely in the room.";
      stage.dataset.loaded = "0";
    }
  }

  function reset() {
    for (const p of photos.splice(0)) URL.revokeObjectURL(p.url);
    shown = 0;
    drawPhotos();
    alertBox.hidden = true;
    showStep("pick");
  }

  buildBtn.addEventListener("click", async () => {
    if (busy || !photos.length) return;
    const senderName = ctx.sender.require(nameInput);
    if (!senderName) return;
    alertBox.hidden = true;
    busy = true; buildBtn.disabled = true;
    buildBtn.querySelector(".btn-text").textContent = photos.length > 1 ? "Sending the photos..." : "Sending the photo...";
    try {
      const gift = await ctx.api.startScan({ sender: senderName, imageBlob: photos[0].blob, imageBlobs: photos.map((p) => p.blob) });
      if (!gift || !gift.id) throw new Error("The photo was sent, but the scan did not start. Please try again.");
      if (gift.kind === "creature" || gift.status === "ready") { await finish(gift); }
      else startWatching(gift.id, nameOf(gift), Date.now());
    } catch (err) {
      // The photo stays selected so one tap tries again.
      showAlert(`That did not go through. ${errorText(err)} Your photos are still here.`);
    } finally {
      busy = false;
      drawPhotos();
    }
  });

  // ------------------------------------------------------------------ start

  // Pick up a scan that was still building when the page was closed or reloaded.
  const saved = store.getJSON(PENDING_KEY);
  if (saved && saved.id && saved.room === ctx.room() && Date.now() - Number(saved.startedAt) < GIVE_UP_MS) {
    startWatching(saved.id, saved.name, Number(saved.startedAt));
  } else if (saved) {
    store.setJSON(PENDING_KEY, null);
  }

  drawPhotos();

  // #scan/fruit or ?scan=fruit opens the fruit side; otherwise the side used last time.
  const wantFruit = /^#\/?scan\/fruit/i.test(location.hash) || ctx.query.get("scan") === "fruit";
  const wantToy = /^#\/?scan\/toy/i.test(location.hash) || ctx.query.get("scan") === "toy";
  setMode(wantFruit ? "fruit" : wantToy || pendingId ? "toy" : store.get("ww_scan_mode", "toy") === "fruit" ? "fruit" : "toy");

  // Dev only: ?debugImage=<url> (repeat it for more views) loads test pictures as if they had been chosen
  // (there is no camera in automated checks).
  const debugUrls = ctx.query.getAll("debugImage");
  if (debugUrls.length && !pendingId && ctx.query.get("scan") !== "fruit") {
    Promise.all(debugUrls.map((u) => fetch(u).then((r) => { if (!r.ok) throw new Error("debugImage " + r.status); return r.blob(); })))
      .then((blobs) => addPhotos(blobs))
      .catch((err) => showAlert("The test image could not be loaded: " + errorText(err)));
  }

  return {
    onShow() { if (!fruitRoot.hidden && fruitTab && fruitTab.onShow) fruitTab.onShow(); },
    onRoomChange(code) { stopWatching(); reset(); if (fruitTab && fruitTab.onRoomChange) fruitTab.onRoomChange(code); },
  };
}
