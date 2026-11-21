// Phone app shell: room, bottom tab bar, hash routing (#send, #scan, #letter, #inbox, #ar), shared helpers for tabs.
import { h, icon, store, cleanRoomCode, loadApi, loadCreatures, applyTheme } from "/phone/lib.js";

const TABS = [
  { id: "send", label: "Send", icon: "send" },
  { id: "scan", label: "Scan", icon: "scan" },
  { id: "letter", label: "Letter", icon: "letter" },
  { id: "inbox", label: "Inbox", icon: "inbox" },
  { id: "ar", label: "AR", icon: "ar" },
];

const $ = (id) => document.getElementById(id);
const tabbar = $("tabbar");
const toastEl = $("toast");
const mounted = new Map();          // id -> { api: tab object } once its module has loaded
let active = null;
let api = null;

// ------------------------------------------------------------------------------------------------ toast

let toastTimer = null;
function toast(message, kind = "info", ms = 3200) {
  toastEl.textContent = message;
  toastEl.dataset.kind = kind;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), ms);
}

// ------------------------------------------------------------------------------------------------ sender name

const senderInputs = new Set();
const sender = {
  get() { return (store.get("ww_sender", "") || "").trim().slice(0, 40); },
  set(value, from) {
    const v = String(value || "").slice(0, 40);
    store.set("ww_sender", v);
    for (const input of senderInputs) if (input !== from && input.value !== v) input.value = v;
  },
  /** Make an <input> show and edit the remembered name. */
  bind(input) {
    input.value = store.get("ww_sender", "") || "";
    senderInputs.add(input);
    input.addEventListener("input", () => sender.set(input.value, input));
    return input;
  },
  /** A labelled name field used at the top of Send, Scan and Letter. */
  field(idPrefix) {
    const input = h("input", {
      class: "field", id: idPrefix + "-name", type: "text", maxlength: "40", autocomplete: "name", autocapitalize: "words",
      placeholder: "Grandma, Uncle Sam, Nurse Jo...", enterkeyhint: "next",
    });
    sender.bind(input);
    const row = h("div", { class: "field-row" }, h("label", { class: "label", for: idPrefix + "-name" }, "Your name"), input);
    return { row, input };
  },
  /** Returns the name, or focuses the field and returns "" when it is empty. */
  require(input) {
    const name = sender.get();
    if (name) return name;
    toast("Add your name first, so they know who it is from.", "warn");
    if (input) { input.focus(); input.classList.add("shake"); setTimeout(() => input.classList.remove("shake"), 500); }
    return "";
  },
};

// ------------------------------------------------------------------------------------------------ room

function showRoom() {
  const code = api ? api.room() : (cleanRoomCode(new URLSearchParams(location.search).get("room")) || "WISH");
  $("roomCode").textContent = code;
  return code;
}

function setRoom(code) {
  const clean = cleanRoomCode(code);
  if (!clean || !api) return;
  if (clean === api.room()) return;
  try { api.setRoom(clean); } catch (err) { toast(err.message || "That room code does not look right.", "warn"); return; }
  const url = new URL(location.href);
  url.searchParams.set("room", clean);
  history.replaceState(null, "", url);
  showRoom();
  toast(`You are now in room ${clean}.`, "good");
  for (const [, tab] of mounted) if (tab.onRoomChange) { try { tab.onRoomChange(clean); } catch (e) { console.warn(e); } }
}

function setupRoomDialog() {
  const dialog = $("roomDialog");
  const input = $("roomInput");
  const open = () => {
    input.value = showRoom();
    if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open", "");
    setTimeout(() => input.select(), 30);
  };
  const close = () => { if (typeof dialog.close === "function") dialog.close(); else dialog.removeAttribute("open"); };
  $("roomChip").addEventListener("click", open);
  $("roomCancel").addEventListener("click", close);
  input.addEventListener("input", () => { const c = cleanRoomCode(input.value); if (c !== input.value) input.value = c; });
  $("roomForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const code = cleanRoomCode(input.value);
    if (code.length < 3) { toast("A room code is 3 to 8 letters or numbers.", "warn"); input.focus(); return; }
    close();
    setRoom(code);
  });
  dialog.addEventListener("click", (e) => { if (e.target === dialog) close(); });
}

// ------------------------------------------------------------------------------------------------ tabs

function buildTabbar() {
  tabbar.setAttribute("role", "tablist");
  for (const t of TABS) {
    const btn = h("button", {
      class: "tab", id: "tabbtn-" + t.id, type: "button", role: "tab", "aria-controls": "tab-" + t.id, "aria-selected": "false",
      onclick: () => go(t.id),
    }, h("span", { class: "tab-ico", html: icon(t.icon) }), h("span", { class: "tab-label" }, t.label));
    tabbar.append(btn);
  }
}

function tabFromHash() {
  const id = (location.hash || "").replace(/^#\/?/, "").split(/[?&/]/)[0].toLowerCase();
  return TABS.some((t) => t.id === id) ? id : null;
}

function go(id) {
  if (location.hash !== "#" + id) {
    history.replaceState(null, "", location.pathname + location.search + "#" + id);
  }
  show(id);
}

const ctx = {
  get api() { return api; },
  toast, sender, go,
  room: () => (api ? api.room() : "WISH"),
  query: new URLSearchParams(location.search),
};

async function show(id) {
  if (active === id) return;
  const prev = active;
  active = id;
  store.set("ww_tab", id);
  for (const t of TABS) {
    const on = t.id === id;
    $("tab-" + t.id).hidden = !on;
    const btn = $("tabbtn-" + t.id);
    btn.classList.toggle("on", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
  }
  document.body.dataset.tab = id;
  if (prev && mounted.has(prev)) { try { mounted.get(prev).onHide?.(); } catch (e) { console.warn(e); } }
  window.scrollTo(0, 0);

  if (!mounted.has(id)) {
    const root = $("tab-" + id);
    root.replaceChildren(h("div", { class: "card loading-card" }, h("p", { class: "muted center" }, "Getting ready...")));
    try {
      const mod = await import(`/phone/tabs/${id}.js`);
      root.replaceChildren();
      const tab = (await mod.mount(root, ctx)) || {};
      mounted.set(id, tab);
    } catch (err) {
      console.error(`[phone] the ${id} tab could not start`, err);
      root.replaceChildren(h("div", { class: "card" },
        h("div", { class: "note bad", role: "alert" }, h("span", { html: icon("warn") }),
          h("span", null, "This part of WishWorld could not load. Check the connection, then tap to try again.")),
        h("button", { class: "btn block", type: "button", style: { marginTop: "14px" }, onclick: () => { active = null; show(id); } }, "Try again")));
      return;
    }
  }
  if (active === id) { try { mounted.get(id).onShow?.(); } catch (e) { console.warn(e); } }
}

// ------------------------------------------------------------------------------------------------ start

async function start() {
  buildTabbar();
  setupRoomDialog();
  showRoom();

  const [loadedApi, creatures] = await Promise.all([loadApi(), loadCreatures()]);
  api = loadedApi;
  applyTheme(creatures.theme);
  showRoom();

  window.addEventListener("hashchange", () => { const id = tabFromHash(); if (id) show(id); });
  document.addEventListener("visibilitychange", () => {
    const tab = active && mounted.get(active);
    if (!tab) return;
    try { if (document.hidden) tab.onHide?.(); else tab.onShow?.(); } catch (e) { console.warn(e); }
  });
  window.addEventListener("online", () => toast("Back online.", "good"));
  window.addEventListener("offline", () => toast("You are offline. Nothing you typed is lost.", "warn", 5000));

  show(tabFromHash() || "send");
}

start().catch((err) => {
  console.error("[phone] could not start", err);
  $("view").prepend(h("div", { class: "card" }, h("div", { class: "note bad", role: "alert" },
    h("span", { html: icon("warn") }), h("span", null, "WishWorld could not start. Check the connection and reload the page."))));
});
