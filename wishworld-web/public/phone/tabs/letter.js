// Letter tab: a short written note and an optional voice recording of at most ten seconds.
import { h, fill, icon, errorText } from "/phone/lib.js";

const MAX = 600;
const MAX_SECONDS = 10;
const RING = 2 * Math.PI * 32;

/** First recording format this browser can make: webm on Android and desktop, mp4 on iPhone. */
function pickMime() {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/ogg;codecs=opus"];
  for (const type of candidates) {
    try { if (MediaRecorder.isTypeSupported(type)) return type; } catch { /* keep looking */ }
  }
  return "";      // let the browser choose
}

export function mount(root, ctx) {
  let busy = false;
  let clip = null;                 // { blob, url }
  let recorder = null, stream = null, chunks = [], startedAt = 0, tick = null, stopTimer = null;

  const canRecord = Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && typeof MediaRecorder !== "undefined");

  const { row: nameRow, input: nameInput } = ctx.sender.field("letter");
  const text = h("textarea", {
    class: "field", id: "letter-text", rows: "6", maxlength: String(MAX),
    placeholder: "Dear friend, I am thinking of you today...",
  });
  text.style.minHeight = "168px";
  const counter = h("span", { class: "counter", id: "letter-count" }, `0 / ${MAX}`);

  // ---- voice note
  const recBody = h("div", { id: "letter-rec-body" });
  const recBox = h("div", { class: "rec", id: "letter-rec" },
    h("p", { class: "rec-title" }, "Add your voice"),
    h("p", { class: "muted small", style: { marginBottom: "10px" } }, `Optional. Up to ${MAX_SECONDS} seconds, played when the letter is opened.`),
    recBody);

  const alertBox = h("div", { class: "note bad", role: "alert", hidden: true, style: { marginBottom: "14px" } });
  const sendBtn = h("button", { class: "btn primary big block", type: "submit", id: "letter-go" },
    h("span", { html: icon("letter") }), h("span", { class: "btn-text" }, "Send the letter"));

  const form = h("form", { class: "card snowcap", id: "letter-form", novalidate: true },
    h("div", { class: "ribbon-row" }, h("h1", { class: "ribbon" }, "Write a letter")),
    h("p", { class: "lead" }, "A short note for their mailbox. They open it in their world when they are ready."),
    nameRow,
    h("div", { class: "field-row" }, h("label", { class: "label", for: "letter-text" }, "Your note"), text, counter),
    recBox,
    alertBox,
    sendBtn);

  const done = h("div", { class: "card snowcap done", id: "letter-done", hidden: true, "aria-live": "polite" });
  root.append(form, done);

  // ------------------------------------------------------------------ recording

  function recIdle(message) {
    fill(recBody,
      message ? h("div", { class: "note info", style: { marginBottom: "10px" } }, h("span", { html: icon("info") }), h("span", null, message)) : null,
      canRecord
        ? h("button", { class: "btn block", type: "button", id: "letter-rec-start", onclick: startRecording }, h("span", { html: icon("mic") }), "Record a voice note")
        : h("p", { class: "muted small", id: "letter-rec-unsupported" }, "This browser cannot record sound, so the letter will be sent as writing only."));
  }

  function recLive() {
    const num = h("b", { id: "letter-rec-count" }, String(MAX_SECONDS));
    const ring = h("div", { class: "ring", html:
      `<svg viewBox="0 0 76 76" aria-hidden="true"><circle class="track" cx="38" cy="38" r="32"/><circle class="arc" cx="38" cy="38" r="32" stroke-dasharray="${RING.toFixed(2)}" stroke-dashoffset="0"/></svg>` });
    ring.append(num);
    const arc = ring.querySelector(".arc");
    recBody.replaceChildren(h("div", { class: "rec-live" }, ring,
      h("div", { class: "grow", style: { flex: "1 1 0", minWidth: "0" } },
        h("p", { style: { marginBottom: "8px" } }, h("span", { class: "dot" }), "Recording... speak now."),
        h("button", { class: "btn block", type: "button", id: "letter-rec-stop", onclick: stopRecording }, h("span", { html: icon("stop") }), "Stop"))));
    return (elapsed) => {
      const left = Math.max(0, MAX_SECONDS - elapsed);
      num.textContent = String(Math.ceil(left));
      arc.setAttribute("stroke-dashoffset", (RING * Math.min(1, elapsed / MAX_SECONDS)).toFixed(2));
    };
  }

  function recReview() {
    const audio = h("audio", { controls: true, src: clip.url, id: "letter-rec-audio", preload: "metadata" });
    recBody.replaceChildren(
      h("p", { class: "small", id: "letter-rec-ready" }, `Your voice note is ready (${Math.max(1, Math.round(clip.seconds))} seconds). Listen, then send.`),
      audio,
      h("div", { class: "rec-actions" },
        h("button", { class: "btn small", type: "button", id: "letter-rec-redo", onclick: () => { dropClip(); startRecording(); } }, h("span", { html: icon("redo") }), "Record again"),
        h("button", { class: "btn small", type: "button", id: "letter-rec-remove", onclick: () => { dropClip(); recIdle(); } }, h("span", { html: icon("trash") }), "Remove")));
  }

  function dropClip() {
    if (clip) { URL.revokeObjectURL(clip.url); clip = null; }
  }

  function releaseMic() {
    clearInterval(tick); clearTimeout(stopTimer); tick = stopTimer = null;
    if (stream) { for (const t of stream.getTracks()) t.stop(); stream = null; }
    recorder = null;
  }

  async function startRecording() {
    if (recorder) return;
    alertBox.hidden = true;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (err) {
      const name = err && err.name;
      if (name === "NotAllowedError" || name === "SecurityError") recIdle("The microphone is turned off for this page. Allow it in the browser settings to add your voice, or send the letter as writing only.");
      else if (name === "NotFoundError" || name === "OverconstrainedError") recIdle("No microphone was found on this device. The letter can still be sent as writing only.");
      else recIdle("The microphone could not be started. The letter can still be sent as writing only.");
      return;
    }
    try {
      const mime = pickMime();
      const options = { audioBitsPerSecond: 64000 };
      if (mime) options.mimeType = mime;
      recorder = new MediaRecorder(stream, options);
    } catch {
      try { recorder = new MediaRecorder(stream); }
      catch { releaseMic(); recIdle("This browser cannot record sound. The letter can still be sent as writing only."); return; }
    }
    chunks = [];
    const rec = recorder;
    rec.addEventListener("dataavailable", (e) => { if (e.data && e.data.size) chunks.push(e.data); });
    rec.addEventListener("error", () => { releaseMic(); recIdle("The recording stopped unexpectedly. Please try again."); });
    rec.addEventListener("stop", () => {
      const seconds = Math.min(MAX_SECONDS, (Date.now() - startedAt) / 1000);
      const type = (rec.mimeType || (chunks[0] && chunks[0].type) || "audio/webm");
      releaseMic();
      const blob = new Blob(chunks, { type });
      chunks = [];
      if (!blob.size || seconds < 0.4) { recIdle("That was too short to hear. Hold on a little longer next time."); return; }
      dropClip();
      clip = { blob, url: URL.createObjectURL(blob), seconds };
      recReview();
    });
    const draw = recLive();
    startedAt = Date.now();
    rec.start();
    tick = setInterval(() => draw((Date.now() - startedAt) / 1000), 100);
    stopTimer = setTimeout(stopRecording, MAX_SECONDS * 1000);
  }

  function stopRecording() {
    clearTimeout(stopTimer); stopTimer = null;
    if (recorder && recorder.state !== "inactive") { try { recorder.stop(); } catch { releaseMic(); recIdle(); } }
  }

  // ------------------------------------------------------------------ sending

  function updateCounter() {
    const n = text.value.length;
    counter.textContent = `${n} / ${MAX}`;
    counter.classList.toggle("near", n >= MAX - 40);
  }

  function showAlert(message) {
    alertBox.replaceChildren(h("span", { html: icon("warn") }), h("span", null, message));
    alertBox.hidden = false;
  }

  function setBusy(on) {
    busy = on;
    sendBtn.disabled = on;
    sendBtn.querySelector(".btn-text").textContent = on ? "Sending..." : "Send the letter";
  }

  function showDone(hadVoice, senderName) {
    done.replaceChildren(
      h("div", { class: "ribbon-row" }, h("h1", { class: "ribbon" }, "Letter sent")),
      h("div", { class: "thumb pop", style: { margin: "4px auto 14px" }, role: "img", "aria-label": "Mailbox" }, h("span", { class: "emoji", "aria-hidden": "true" }, "📬")),
      h("p", { class: "done-line", id: "letter-done-line" }, "Your letter is in the mailbox."),
      h("p", { class: "done-sub muted" }, `From ${senderName}, to room ${ctx.room()}${hadVoice ? ", with your voice" : ""}. The flag goes up, and you will see in Inbox when it is opened.`),
      h("button", { class: "btn primary big block", type: "button", id: "letter-again", onclick: again }, "Write another letter"),
      h("button", { class: "btn block", type: "button", style: { marginTop: "14px" }, onclick: () => ctx.go("inbox") }, "See the Inbox"));
    const t = done.querySelector(".thumb");
    t.style.setProperty("--size", "132px");
    t.style.setProperty("--tint", "#ffdfe3");
    form.hidden = true;
    done.hidden = false;
    window.scrollTo(0, 0);
  }

  function again() {
    done.hidden = true;
    form.hidden = false;
    text.focus();
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy) return;
    alertBox.hidden = true;
    if (recorder) { ctx.toast("Stop the recording first.", "warn"); return; }
    const senderName = ctx.sender.require(nameInput);
    if (!senderName) return;
    const note = text.value.trim();
    if (!note && !clip) {
      ctx.toast("Write a few words, or record your voice, first.", "warn");
      text.focus();
      return;
    }
    setBusy(true);
    try {
      const gift = await ctx.api.sendLetter({ sender: senderName, text: note, audioBlob: clip ? clip.blob : undefined });
      if (!gift) throw new Error("The letter did not arrive. Please try again.");
      const hadVoice = Boolean(clip);
      text.value = "";
      updateCounter();
      dropClip();
      recIdle();
      showDone(hadVoice, senderName);
    } catch (err) {
      // Keep the note and the recording so nothing has to be redone.
      showAlert(`That letter did not go through. ${errorText(err)} Your note${clip ? " and voice recording are" : " is"} still here.`);
    } finally {
      setBusy(false);
    }
  });

  text.addEventListener("input", () => { updateCounter(); alertBox.hidden = true; });
  recIdle();
  updateCounter();

  return {
    onHide() { if (recorder) stopRecording(); },
    onRoomChange() { if (!done.hidden) again(); },
  };
}
