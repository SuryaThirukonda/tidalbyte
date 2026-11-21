// Scan tab, fruit side: photograph a real fruit, cut it out here on the phone, check it, and send the cut-out
// to the room. Frost Slice in the headset then throws copies of that very fruit. Only the cut-out is sent;
// the photo stays on the phone.
import { h, fill, icon, errorText } from "/phone/lib.js";
import { readPhoto, cutOut, ovalCrop, toPng } from "/phone/cutout.js";

const LOOSENESS = [0.65, 0.82, 1, 1.22, 1.5];        // the "Edge" slider: tighter ... looser
const METHOD_NOTE = {
  auto: "Background removed.",
  box: "Background removed inside your box.",
  oval: "Oval crop: this is not a true cut-out, so a little background stays around the fruit.",
};

export function mount(root, ctx) {
  let source = null;             // canvas of the chosen photo
  let result = null;             // { canvas, method, rect }
  let rect = null;               // the box drawn by hand, in source pixels
  let loose = 2;                 // index into LOOSENESS
  let busy = false;
  let previewUrl = null;

  // ------------------------------------------------------------------ current fruit (what the headset will use)
  const currentCard = h("div", { class: "card fruit-current", id: "fruit-current", hidden: true });

  // ------------------------------------------------------------------ step 1: choose a photo
  const cameraInput = h("input", { type: "file", accept: "image/*", capture: "environment", id: "fruit-camera", "aria-label": "Take a photo of a fruit" });
  const libraryInput = h("input", { type: "file", accept: "image/*", id: "fruit-library", "aria-label": "Choose a photo of a fruit" });
  const pickAlert = h("div", { class: "note bad", role: "alert", hidden: true, style: { marginBottom: "14px" } });
  const pickCard = h("div", { class: "card snowcap", id: "fruit-pick" },
    h("div", { class: "ribbon-row" }, h("h1", { class: "ribbon" }, "Scan a fruit")),
    h("p", { class: "lead" }, "Take a photo of a real fruit. Copies of it fly up in Frost Slice, ready to slice!"),
    h("ul", { class: "tips", "aria-label": "Tips for a good photo" },
      h("li", null, h("span", { html: icon("one") }), "One fruit"),
      h("li", null, h("span", { html: icon("plain") }), "Plain background"),
      h("li", null, h("span", { html: icon("sun") }), "Good light")),
    h("div", { class: "photo-frame", id: "fruit-frame" },
      h("div", { class: "hint" }, h("span", { html: icon("camera") }), "Your fruit will show here.")),
    h("div", { class: "pick-row" },
      h("label", { class: "btn filebtn", id: "fruit-take" }, h("span", { html: icon("camera") }), "Take photo", cameraInput),
      h("label", { class: "btn filebtn", id: "fruit-choose" }, h("span", { html: icon("image") }), "Choose", libraryInput)),
    pickAlert);

  // ------------------------------------------------------------------ step 2: check the cut-out
  const cutFrame = h("div", { class: "photo-frame has cutout-frame", id: "fruit-cutout" });
  const methodNote = h("p", { class: "muted center", id: "fruit-method" });
  const warnBox = h("div", { class: "note info", role: "status", hidden: true, style: { marginBottom: "14px" } });
  const looseInput = h("input", { type: "range", min: "0", max: String(LOOSENESS.length - 1), step: "1", value: String(loose), id: "fruit-edge", "aria-label": "Edge: tighter or looser" });
  const edgeRow = h("div", { class: "edge-row", id: "fruit-edge-row" }, h("span", null, "Tighter"), looseInput, h("span", null, "Looser"));
  const useBtn = h("button", { class: "btn primary big block", type: "button", id: "fruit-use" }, h("span", { class: "btn-text" }, "Use This Fruit"));
  const handBtn = h("button", { class: "btn block", type: "button", id: "fruit-hand" }, "Fix it: draw a box around the fruit");
  const ovalBtn = h("button", { class: "btn block", type: "button", id: "fruit-oval", hidden: true }, "Use an oval crop instead");
  const retryBtn = h("button", { class: "btn block", type: "button", id: "fruit-retry" }, h("span", { html: icon("redo") }), "Take a new photo");
  const sendAlert = h("div", { class: "note bad", role: "alert", hidden: true, style: { marginBottom: "14px" } });
  const checkCard = h("div", { class: "card snowcap", id: "fruit-check", hidden: true },
    h("div", { class: "ribbon-row" }, h("h1", { class: "ribbon" }, "Your fruit")),
    cutFrame, methodNote, warnBox, edgeRow, sendAlert, useBtn,
    h("div", { class: "stack" }, handBtn, ovalBtn, retryBtn));

  // ------------------------------------------------------------------ step 2b: draw a box by hand
  const boxCanvas = h("canvas", { class: "box-canvas", id: "fruit-box-canvas", "aria-label": "Your photo. Drag a box around the fruit." });
  const boxAlert = h("div", { class: "note bad", role: "alert", hidden: true, style: { marginBottom: "14px" } });
  const boxGo = h("button", { class: "btn primary big block", type: "button", id: "fruit-box-go", disabled: true }, "Cut out inside the box");
  const boxCard = h("div", { class: "card snowcap", id: "fruit-box", hidden: true },
    h("div", { class: "ribbon-row" }, h("h1", { class: "ribbon" }, "Draw a box")),
    h("p", { class: "lead" }, "Drag your finger from one corner of the fruit to the other."),
    h("div", { class: "box-wrap" }, boxCanvas),
    boxAlert, boxGo,
    h("div", { class: "stack" },
      h("button", { class: "btn block", type: "button", id: "fruit-box-back", onclick: () => showStep(result ? "check" : "pick") }, "Back")));

  // ------------------------------------------------------------------ step 3: sent
  const doneCard = h("div", { class: "card snowcap done", id: "fruit-done", hidden: true, "aria-live": "polite" });

  root.append(currentCard, pickCard, checkCard, boxCard, doneCard);

  // ------------------------------------------------------------------ helpers

  function showStep(step) {
    pickCard.hidden = step !== "pick";
    checkCard.hidden = step !== "check";
    boxCard.hidden = step !== "box";
    doneCard.hidden = step !== "done";
    if (step === "box") drawBox();
    window.scrollTo(0, 0);
  }

  function alertIn(box, message) {
    if (!message) { box.hidden = true; return; }
    box.replaceChildren(h("span", { html: icon("warn") }), h("span", null, message));
    box.hidden = false;
  }

  function showCut(canvas, method, warning) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    const img = h("img", { src: canvas.toDataURL("image/png"), alt: "Your fruit, cut out", id: "fruit-preview" });
    fill(cutFrame, img);
    cutFrame.dataset.method = method;
    methodNote.textContent = METHOD_NOTE[method];
    alertIn(warnBox, warning || "");
    edgeRow.hidden = method === "oval";
    ovalBtn.hidden = method === "auto";
    alertIn(sendAlert, "");
  }

  /** Runs the cut-out for the current photo (whole photo, or inside the drawn box). */
  function runCut(method) {
    if (!source) return;
    const r = method === "oval" ? ovalCrop(source, rect) : cutOut(source, { rect: method === "box" ? rect : null, looseness: LOOSENESS[loose] });
    if (!r.ok) {
      result = null;
      if (method === "auto") {
        // Nothing usable from the whole photo: go straight to drawing a box (the photo stays).
        showStep("box");
        alertIn(boxAlert, r.reason);
      } else {
        showStep("box");
        alertIn(boxAlert, r.reason + (method === "box" ? " Or try the oval crop." : ""));
        ovalChoice(true);
      }
      return;
    }
    result = { canvas: r.canvas, method };
    showCut(r.canvas, method, r.warning);
    showStep("check");
  }

  async function usePhoto(file) {
    alertIn(pickAlert, "");
    if (!file) return;
    try {
      source = await readPhoto(file);
      rect = null; loose = 2; looseInput.value = String(loose);
      const thumb = h("img", { src: source.toDataURL("image/jpeg", 0.8), alt: "The photo you chose" });
      fill(pickCard.querySelector("#fruit-frame"), thumb);
      pickCard.querySelector("#fruit-frame").classList.add("has");
      // Let the photo paint before the (short) cut-out work starts.
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)));
      runCut("auto");
    } catch (err) {
      alertIn(pickAlert, errorText(err, "That photo could not be read. Try taking a new one."));
    }
  }

  cameraInput.addEventListener("change", () => { usePhoto(cameraInput.files && cameraInput.files[0]); cameraInput.value = ""; });
  libraryInput.addEventListener("change", () => { usePhoto(libraryInput.files && libraryInput.files[0]); libraryInput.value = ""; });
  looseInput.addEventListener("change", () => { loose = Number(looseInput.value) || 0; if (result) runCut(result.method); });
  handBtn.addEventListener("click", () => { alertIn(boxAlert, ""); ovalChoice(false); showStep("box"); });
  ovalBtn.addEventListener("click", () => { if (rect) runCut("oval"); });
  retryBtn.addEventListener("click", () => reset());

  // ------------------------------------------------------------------ drawing the box

  let drag = null;
  let ovalExtra = null;
  function ovalChoice(on) {
    if (on && !ovalExtra) {
      ovalExtra = h("button", { class: "btn block", type: "button", id: "fruit-box-oval", onclick: () => { if (rect) runCut("oval"); } }, "Use an oval crop instead");
      boxGo.after(ovalExtra);
    }
    if (ovalExtra) ovalExtra.hidden = !on || !rect;
  }

  function drawBox() {
    if (!source) return;
    const maxW = Math.min(boxCard.clientWidth ? boxCard.clientWidth - 40 : 340, 520);
    const s = Math.min(1, maxW / source.width, 440 / source.height);
    boxCanvas.width = Math.round(source.width * s);
    boxCanvas.height = Math.round(source.height * s);
    const g = boxCanvas.getContext("2d");
    g.drawImage(source, 0, 0, boxCanvas.width, boxCanvas.height);
    if (rect) {
      const x = rect.x * s, y = rect.y * s, w = rect.w * s, hh = rect.h * s;
      g.fillStyle = "rgba(20, 30, 45, 0.45)";
      g.beginPath();
      g.rect(0, 0, boxCanvas.width, boxCanvas.height);
      g.rect(x, y, w, hh);
      g.fill("evenodd");
      g.lineWidth = 3; g.strokeStyle = "#ffffff"; g.setLineDash([8, 6]);
      g.strokeRect(x, y, w, hh);
      g.setLineDash([]);
    }
    boxGo.disabled = !rect;
  }

  function toSource(event) {
    const r = boxCanvas.getBoundingClientRect();
    const k = source.width / Math.max(1, r.width);
    return { x: Math.max(0, Math.min(source.width, (event.clientX - r.left) * k)), y: Math.max(0, Math.min(source.height, (event.clientY - r.top) * k)) };
  }
  boxCanvas.addEventListener("pointerdown", (e) => {
    if (!source) return;
    e.preventDefault();
    boxCanvas.setPointerCapture(e.pointerId);
    drag = toSource(e);
  });
  boxCanvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const p = toSource(e);
    rect = { x: Math.round(Math.min(drag.x, p.x)), y: Math.round(Math.min(drag.y, p.y)), w: Math.round(Math.abs(p.x - drag.x)), h: Math.round(Math.abs(p.y - drag.y)) };
    drawBox();
  });
  const endDrag = () => {
    if (!drag) return;
    drag = null;
    if (rect && (rect.w < 24 || rect.h < 24)) rect = null;
    drawBox();
    alertIn(boxAlert, "");
    if (ovalExtra) ovalExtra.hidden = !rect;
  };
  boxCanvas.addEventListener("pointerup", endDrag);
  boxCanvas.addEventListener("pointercancel", endDrag);
  boxGo.addEventListener("click", () => { if (rect) runCut("box"); });

  // ------------------------------------------------------------------ sending

  useBtn.addEventListener("click", async () => {
    if (busy || !result) return;
    busy = true; useBtn.disabled = true;
    useBtn.querySelector(".btn-text").textContent = "Sending your fruit...";
    alertIn(sendAlert, "");
    try {
      const png = await toPng(result.canvas);
      const fruit = await ctx.api.sendFruit({ sender: ctx.sender.get() || undefined, pngBlob: png, method: result.method });
      if (!fruit || !fruit.assetUrl) throw new Error("The fruit was sent, but WishWorld did not keep it. Please try again.");
      showDone(fruit);
      showCurrent(fruit);
    } catch (err) {
      alertIn(sendAlert, `Your fruit did not go through. ${errorText(err)} Tap "Use This Fruit" to try again.`);
    } finally {
      busy = false; useBtn.disabled = false;
      useBtn.querySelector(".btn-text").textContent = "Use This Fruit";
    }
  });

  function showDone(fruit) {
    const pic = h("img", { class: "fruit-done-img pop", src: fruit.assetUrl, alt: "Your fruit" });
    pic.onerror = () => { if (result) pic.src = result.canvas.toDataURL("image/png"); };
    fill(doneCard,
      h("div", { class: "ribbon-row" }, h("h1", { class: "ribbon" }, "Ready!")),
      h("div", { class: "fruit-done-pic" }, pic),
      h("p", { class: "done-line", id: "fruit-done-line" }, "Your fruit is ready! Put on your headset and play Frost Slice!"),
      h("p", { class: "done-sub muted" }, `Room ${ctx.room()}. If Frost Slice is already open, your fruit joins at the next round.`),
      h("button", { class: "btn primary big block", type: "button", id: "fruit-again", onclick: reset }, "Scan another fruit"));
    showStep("done");
  }

  // ------------------------------------------------------------------ the room's current fruit

  function showCurrent(fruit) {
    if (!fruit || !fruit.assetUrl) { currentCard.hidden = true; currentCard.replaceChildren(); return; }
    const img = h("img", { class: "fruit-current-img", src: fruit.assetUrl, alt: "The fruit Frost Slice is using" });
    img.onerror = () => { currentCard.hidden = true; };
    const clearBtn = h("button", { class: "btn small", type: "button", id: "fruit-clear" }, "Use normal fruit");
    clearBtn.addEventListener("click", async () => {
      clearBtn.disabled = true;
      try {
        await ctx.api.clearFruit();
        showCurrent(null);
        ctx.toast("Frost Slice is back to the normal fruit.", "good");
      } catch (err) {
        clearBtn.disabled = false;
        ctx.toast(errorText(err), "warn");
      }
    });
    fill(currentCard,
      h("div", { class: "fruit-current-row" }, img,
        h("div", { class: "fruit-current-text" }, h("b", null, "Frost Slice is using your fruit"), h("span", { class: "muted" }, `Room ${ctx.room()}`)),
        clearBtn));
    currentCard.hidden = false;
  }

  async function loadCurrent() {
    if (typeof ctx.api?.getFruit !== "function") return;
    const asked = ctx.room();
    try {
      const fruit = await ctx.api.getFruit();
      if (ctx.room() === asked) showCurrent(fruit);
    } catch { /* the card simply stays hidden */ }
  }

  function reset() {
    source = null; result = null; rect = null;
    const frame = pickCard.querySelector("#fruit-frame");
    frame.classList.remove("has");
    frame.replaceChildren(h("div", { class: "hint" }, h("span", { html: icon("camera") }), "Your fruit will show here."));
    alertIn(pickAlert, "");
    showStep("pick");
  }

  // ------------------------------------------------------------------ start

  loadCurrent();

  // Dev and desktop checks: ?debugImage=<url>&scan=fruit loads a test picture as if it had been chosen.
  const debugUrl = ctx.query.get("debugImage");
  if (debugUrl && ctx.query.get("scan") === "fruit") {
    fetch(debugUrl).then((r) => { if (!r.ok) throw new Error("debugImage " + r.status); return r.blob(); })
      .then((blob) => usePhoto(blob))
      .catch((err) => alertIn(pickAlert, "The test image could not be loaded: " + errorText(err)));
  }

  return {
    onShow() { loadCurrent(); },
    onRoomChange() { reset(); loadCurrent(); },
  };
}
