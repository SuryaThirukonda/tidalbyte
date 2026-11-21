// Landing page: start or join a room, then show the QR code for the phone app and the address for the headset.
import { h, cleanRoomCode, errorText, loadApi, loadCreatures, applyTheme } from "/phone/lib.js";

const $ = (id) => document.getElementById(id);
let api = null;

let toastTimer = null;
function toast(message, kind = "info") {
  const el = $("toast");
  el.textContent = message;
  el.dataset.kind = kind;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
}

/** A few snowflakes with their own size, place and speed (CSS does the falling). */
function snow() {
  const box = $("snowfall");
  if (!box || (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)) return;
  for (let i = 0; i < 26; i++) {
    const size = 4 + Math.random() * 7;
    const flake = document.createElement("i");
    flake.style.left = (Math.random() * 100).toFixed(1) + "%";
    flake.style.width = flake.style.height = size.toFixed(1) + "px";
    flake.style.opacity = (0.55 + Math.random() * 0.4).toFixed(2);
    flake.style.animationDuration = (9 + Math.random() * 12).toFixed(1) + "s";
    flake.style.animationDelay = (-Math.random() * 20).toFixed(1) + "s";
    box.append(flake);
  }
}

/** QR code as an SVG (dark squares merged into one path). */
async function drawQr(text) {
  const box = $("qr");
  try {
    const { qrcode } = await import("/vendor/qrcode/qrcode.mjs");
    const qr = qrcode(0, "M");          // type 0 picks the smallest size that fits
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    const quiet = 2;
    let d = "";
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (!qr.isDark(r, c)) continue;
        let run = 1;
        while (c + run < n && qr.isDark(r, c + run)) run++;
        d += `M${c + quiet} ${r + quiet}h${run}v1h-${run}z`;
        c += run - 1;
      }
    }
    const size = n + quiet * 2;
    box.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="QR code for the phone app"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#1f2a3a"/></svg>`;
    box.dataset.ready = "1";
  } catch (err) {
    console.warn("[landing] QR code could not be drawn", err);
    box.replaceChildren(h("span", { class: "muted small", style: { display: "grid", placeItems: "center", height: "100%", textAlign: "center" } },
      "The QR code could not be drawn. Use the button or type the address below."));
  }
}

function showRoom(code, animate) {
  const site = (api && api.base) || location.origin;          // on a laptop the phone still needs the real address
  const shown = site.replace(/^https?:\/\//, "");
  const phonePath = `/phone/?room=${code}`, vrPath = `/vr/?room=${code}`;
  const codeEl = $("roomCode");
  codeEl.textContent = code;
  if (animate) { codeEl.classList.remove("pop"); void codeEl.offsetWidth; codeEl.classList.add("pop"); }
  $("phoneBtn").href = phonePath;
  $("qrLink").href = phonePath;
  $("vrBtn").href = vrPath;
  if ($("playBtn")) $("playBtn").href = vrPath + (vrPath.includes("?") ? "&" : "?") + "mode=play";
  // Host and path as two pieces, so a narrow screen breaks the address between them and nowhere else.
  const address = (path) => [h("span", null, shown), h("span", null, path)];
  $("phoneAddr").replaceChildren(...address(phonePath));
  $("vrAddr").replaceChildren(...address(vrPath));
  drawQr(site + phonePath);
  try {
    const url = new URL(location.href);
    if (url.searchParams.get("room") !== code) { url.searchParams.set("room", code); history.replaceState(null, "", url); }
  } catch { /* no address bar to update */ }
}

function showAlert(message) {
  const box = $("roomAlert");
  if (!message) { box.hidden = true; return; }
  box.textContent = message;
  box.hidden = false;
}

async function start() {
  snow();
  const [loadedApi, creatures] = await Promise.all([loadApi(), loadCreatures()]);
  api = loadedApi;
  applyTheme(creatures.theme);
  showRoom(api.room(), false);

  const startBtn = $("startBtn");
  $("startForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (startBtn.disabled) return;
    showAlert("");
    startBtn.disabled = true;
    startBtn.querySelector(".btn-text").textContent = "Making a room...";
    try {
      const made = await api.createRoom($("childName").value.trim() || undefined);
      const code = cleanRoomCode(made && made.code);
      if (!code) throw new Error("The room was made, but no code came back. Please try again.");
      try { if (api.room() !== code) api.setRoom(code); } catch { /* the code is still shown */ }
      showRoom(code, true);
      toast(made.child_name ? `Room ${code} is ready for ${made.child_name}.` : `Room ${code} is ready.`, "good");
    } catch (err) {
      showAlert(`A new room could not be made. ${errorText(err)} You can keep using room ${api.room()}.`);
    } finally {
      startBtn.disabled = false;
      startBtn.querySelector(".btn-text").textContent = "Start a room";
    }
  });

  const joinInput = $("joinCode");
  joinInput.addEventListener("input", () => {
    const c = cleanRoomCode(joinInput.value);
    if (c !== joinInput.value) joinInput.value = c;
    showAlert("");
  });
  $("joinForm").addEventListener("submit", (e) => {
    e.preventDefault();
    showAlert("");
    const code = cleanRoomCode(joinInput.value);
    if (code.length < 3) {
      showAlert("A room code is 3 to 8 letters or numbers, like WISH.");
      joinInput.focus();
      return;
    }
    try {
      api.setRoom(code);
    } catch (err) {
      showAlert(errorText(err, "That room code does not look right."));
      return;
    }
    joinInput.value = "";
    showRoom(code, true);
    toast(`You are in room ${code}.`, "good");
  });
}

start().catch((err) => {
  console.error("[landing] could not start", err);
  showAlert("WishWorld could not start. Check the connection and reload the page.");
});
