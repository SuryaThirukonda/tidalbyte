// Inbox tab: the parent check-in. A feed of what the child did and which gifts and letters were opened, and the
// buddies of the child picked in the "For" strip, which can be renamed or let go (as in the headset's Settings).
import { h, icon, thumb, creatureInfo, theName, worldName, timeAgo, errorText, companion } from "/phone/lib.js";

const REFRESH_MS = 3000;

const PLACES = { liberty: "the Statue of Liberty", niagara: "Niagara Falls" };

const first = (obj, keys) => {
  for (const k of keys) {
    const v = obj && obj[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return null;
};
const lower = (s) => String(s || "").toLowerCase();
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const tidy = (s) => String(s || "").replace(/[_-]+/g, " ").trim();

/** One event row -> { cls, icon, text } in friendly words. Unknown types still show up, in plain words. */
function describeEvent(ev) {
  const d = ev.detail && typeof ev.detail === "object" ? ev.detail : {};
  switch (ev.type) {
    case "world_visited": {
      const id = first(d, ["world", "world_id", "worldId", "id"]);
      const name = first(d, ["name", "world_name", "title"]) || worldName(id);
      if (!name) return { cls: "world", icon: "globe", text: "Visited a new world" };
      return { cls: "world", icon: "globe", text: `Visited ${/^(the|a|an) /i.test(name) ? name : "the " + name} world` };
    }
    case "creature_learned": {
      const id = first(d, ["creature", "creature_id", "creatureId", "option_id", "id"]);
      const info = creatureInfo(id);
      const given = first(d, ["name", "creature_name"]);
      const name = id && info.known ? theName(info) : given ? "the " + lower(given) : id ? theName(info) : "a new creature";
      return { cls: "learn", icon: "book", text: `Learned about ${name}`, creature: id ? info.id : null };
    }
    case "breath_session": {
      // The headset logs a session in steps: `breaths` since its last log, `total` so far, `final` on the last one.
      const total = Number(first(d, ["total", "breaths", "slow_breaths", "slowBreaths", "count", "breath_count"]));
      const has = Number.isFinite(total) && total > 0;
      if (d.final === false) return { cls: "calm", icon: "wind", text: has ? `Calm session: ${plural(total, "slow breath", "slow breaths")} so far` : "Started a calm session" };
      return { cls: "calm", icon: "wind", text: has ? `Finished a calm session with ${plural(total, "slow breath", "slow breaths")}` : "Finished a calm session" };
    }
    case "explore_visited": {
      const id = lower(first(d, ["id", "place_id", "placeId"]));
      const given = first(d, ["place", "name", "place_name", "title"]);
      const name = PLACES[id] || PLACES[lower(given)] || (given ? (/^statue/i.test(given) ? "the " + given : given) : "") || tidy(id) || "a real place";
      return { cls: "explore", icon: "map", text: `Explored ${name}` };
    }
    case "gift_opened": {
      const kind = lower(first(d, ["kind", "gift_kind"]));
      const from = first(d, ["sender", "from"]);
      const tail = from ? ` from ${from}` : "";
      if (kind === "letter") return { cls: "letter", icon: "letter", text: `Opened the letter${tail}` };
      if (kind === "mesh") return { cls: "gift", icon: "gift", text: `Met the scanned companion${tail}` };
      const id = first(d, ["option_id", "creature", "creature_id"]);
      if (id) return { cls: "gift", icon: "gift", text: `Met ${theName(creatureInfo(id))}${tail}`, creature: creatureInfo(id).id };
      return { cls: "gift", icon: "gift", text: `Opened a gift${tail}` };
    }
    default: {
      const words = tidy(ev.type);
      const score = first(d, ["score", "points"]);
      const text = words ? words.charAt(0).toUpperCase() + words.slice(1) : "Did something new";
      return { cls: "", icon: "send", text: score !== null ? `${text} (score ${score})` : text };
    }
  }
}

function describeGift(g) {
  const from = g.sender ? ` from ${g.sender}` : "";
  if (g.kind === "letter") return { cls: "letter", icon: "letter", text: `Letter${from}${g.audio_url ? ", with a voice note" : ""}` };
  if (g.kind === "mesh") {
    const pal = companion(g);
    return { cls: "gift", icon: "scan", text: pal.name ? `${pal.name}${pal.what ? ", " + pal.what + "," : ""} scanned${from ? " by " + g.sender : ""}` : `Scanned companion${from}` };
  }
  const info = creatureInfo(g.option_id);
  return { cls: "gift", icon: "gift", text: `${info.name}${from}`, creature: info.id, wish: g.wish };
}

function giftState(g) {
  if (g.opened_at) return { cls: "opened", text: `Opened ${timeAgo(g.opened_at)}`, time: g.opened_at, prefix: "Opened " };
  if (g.status === "pending") return { cls: "waiting", text: "Still being built" };
  if (g.status === "failed") return { cls: "", text: "Could not be built" };
  return { cls: "waiting", text: g.kind === "letter" ? "Waiting in the mailbox" : "Not opened yet" };
}

export function mount(root, ctx) {
  let timer = null, visible = false, loading = false, signature = "", lastOk = 0, loadedOnce = false;

  const lead = h("p", { class: "lead", id: "inbox-lead" }, "What they have been up to in WishWorld. It updates by itself.");
  const stats = h("div", { class: "stats", id: "inbox-stats" });
  const summary = h("div", { class: "card snowcap", id: "inbox-summary" },
    h("div", { class: "ribbon-row" }, h("h1", { class: "ribbon" }, "Check-in")), lead, stats);

  const feed = h("ul", { class: "feed", id: "inbox-feed" });
  const feedCard = h("div", { class: "card", id: "inbox-activity" }, h("h2", { class: "sub-title" }, "What happened"), feed);

  const gifts = h("ul", { class: "feed", id: "inbox-gifts" });
  const giftCard = h("div", { class: "card", id: "inbox-giftcard" }, h("h2", { class: "sub-title" }, "Gifts and letters"), gifts);

  const empty = h("div", { class: "card", id: "inbox-empty", hidden: true },
    h("div", { class: "empty" },
      h("div", { class: "big-emoji", "aria-hidden": "true" }, "🐧"),
      h("p", { class: "done-line" }, "Nothing here yet"),
      h("p", { class: "muted" }, "When they visit a world, learn about a creature, take some slow breaths or open a gift, it will show up here."),
      h("button", { class: "btn primary block", type: "button", style: { marginTop: "16px" }, onclick: () => ctx.go("send") }, "Send the first wish")));

  const alertBox = h("div", { class: "note bad", role: "alert", hidden: true, id: "inbox-alert", style: { marginTop: "14px" } });
  const live = h("div", { class: "live", id: "inbox-live" }, h("i"), h("span", null, "Checking..."));

  const buddyLead = h("p", { class: "muted", id: "inbox-buddies-lead" });
  const buddyList = h("ul", { class: "feed buddies", id: "inbox-buddies" });
  const buddyCard = h("div", { class: "card", id: "inbox-buddycard", hidden: true },
    h("h2", { class: "sub-title" }, "Buddies"), buddyLead, buddyList);

  root.append(summary, buddyCard, feedCard, giftCard, empty, alertBox, live);
  feedCard.hidden = giftCard.hidden = true;

  // ---------- buddies: rename or let go ----------
  let buddies = [], following = null, buddySig = "", editingId = null, confirmId = null, busy = false;
  const canEdit = () => ctx.api && typeof ctx.api.getBuddies === "function" && typeof ctx.api.renameCompanion === "function";
  const childName = () => { const p = ctx.profile(); return p ? p.name : "them"; };
  const followsIt = (c) => (Array.isArray(following) ? following.includes(c.id) : buddies.slice(-3).includes(c));

  function buddyRow(c) {
    const badge = c.option_id ? thumb(c.option_id, 44) : h("span", { class: "badge gift", html: icon("scan") });
    const sub = h("div", { class: "when" }, followsIt(c) ? `Follows ${childName()} around` : "Stays home for now");
    let actions;
    if (editingId === c.id) {
      const input = h("input", {
        class: "field", type: "text", maxlength: "24", value: c.name, "aria-label": `New name for ${c.name}`,
        id: "buddy-name-" + c.id, autocomplete: "off",
        onkeydown: (e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { editingId = null; drawBuddies(); } },
      });
      const save = () => renameBuddy(c, input.value);
      actions = h("div", { class: "buddy-edit" }, input,
        h("div", { class: "buddy-actions" },
          h("button", { class: "btn primary small", type: "button", onclick: save }, "Save"),
          h("button", { class: "btn small", type: "button", onclick: () => { editingId = null; drawBuddies(); } }, "Cancel")));
      setTimeout(() => { input.focus(); input.select(); }, 0);
    } else if (confirmId === c.id) {
      actions = h("div", null,
        h("div", { class: "when" }, `Let ${c.name} go? Their gift stays in the mailbox.`),
        h("div", { class: "buddy-actions" },
          h("button", { class: "btn primary small", type: "button", onclick: () => letGo(c) }, `Yes, let ${c.name} go`),
          h("button", { class: "btn small", type: "button", onclick: () => { confirmId = null; drawBuddies(); } }, "Keep")));
    } else {
      actions = h("div", { class: "buddy-actions" },
        h("button", { class: "btn small", type: "button", onclick: () => { editingId = c.id; confirmId = null; drawBuddies(); } }, "Rename"),
        h("button", { class: "btn small", type: "button", onclick: () => { confirmId = c.id; editingId = null; drawBuddies(); } }, "Let go"));
    }
    return h("li", { id: "buddy-" + c.id }, badge,
      h("div", { style: { minWidth: "0", flex: "1 1 0" } }, h("div", { class: "what" }, c.name), sub, actions));
  }

  function drawBuddies() {
    if (!canEdit()) { buddyCard.hidden = true; return; }
    buddyCard.hidden = false;
    const who = childName();
    buddyLead.textContent = buddies.length
      ? `${who}'s buddies follow them around WishWorld (up to three at once). Rename one, or let one go.`
      : `${who} has no buddies yet. Scan a toy, or send a wish, and keep it as a buddy in the headset.`;
    buddyList.replaceChildren(...buddies.map(buddyRow));
  }

  async function loadBuddies(force = false) {
    if (!canEdit() || busy) return;
    if (!force && (editingId !== null || confirmId !== null)) return;   // do not redraw under an open edit
    const room = ctx.room(), pid = ctx.profile() && ctx.profile().id;
    try {
      const [data, profiles] = await Promise.all([ctx.api.getBuddies(), ctx.api.getProfiles()]);
      if (room !== ctx.room() || pid !== (ctx.profile() && ctx.profile().id)) return;
      const me = profiles.find((p) => p.id === pid);
      const next = data.companions || [];
      following = me && me.settings ? me.settings.following : null;
      const sig = JSON.stringify([pid, next.map((c) => [c.id, c.name]), following]);
      if (!force && sig === buddySig) return;
      buddySig = sig; buddies = next;
      drawBuddies();
    } catch (err) {
      console.warn("[phone] buddies could not load", err);
    }
  }

  async function renameBuddy(c, raw) {
    const name = String(raw || "").trim().slice(0, 24);
    if (!name) { ctx.toast("A buddy needs a name.", "warn"); return; }
    if (name === c.name) { editingId = null; drawBuddies(); return; }
    busy = true;
    try {
      await ctx.api.renameCompanion(c.id, name);
      ctx.toast(`${c.name} is now called ${name}.`, "good");
      editingId = null;
      c.name = name;
      drawBuddies();
    } catch (err) {
      ctx.toast(errorText(err) || "That name could not be saved just now.", "bad", 5000);
      return;
    } finally {
      busy = false;
    }
    await loadBuddies(true);
  }

  async function letGo(c) {
    busy = true;
    try {
      await ctx.api.removeCompanion(c.id);
      if (Array.isArray(following) && following.includes(c.id) && ctx.profile()) {
        await ctx.api.saveProfileSettings(ctx.profile().id, { following: following.filter((id) => id !== c.id) });
      }
      ctx.toast(`Bye bye, ${c.name}!`, "good");
      confirmId = null;
      buddies = buddies.filter((x) => x.id !== c.id);
      if (Array.isArray(following)) following = following.filter((id) => id !== c.id);
      drawBuddies();
    } catch (err) {
      ctx.toast(errorText(err) || "That buddy could not be let go just now.", "bad", 5000);
      return;
    } finally {
      busy = false;
    }
    await loadBuddies(true);
  }

  function resetBuddies() {
    buddies = []; following = null; buddySig = ""; editingId = null; confirmId = null;
    buddyList.replaceChildren(); buddyCard.hidden = true;
  }

  function stat(iconName, value, what) {
    return h("div", { class: "stat" }, h("span", { class: "ico", html: icon(iconName) }),
      h("div", { style: { minWidth: "0" } }, h("b", null, String(value)), h("span", { class: "what" }, what)));
  }

  function row(desc, when, extra, prefix = "") {
    const badge = desc.creature
      ? thumb(desc.creature, 44)
      : h("span", { class: "badge " + (desc.cls || ""), html: icon(desc.icon) });
    return h("li", null, badge,
      h("div", { style: { minWidth: "0", flex: "1 1 0" } },
        h("div", { class: "what" }, desc.text),
        desc.wish ? h("div", { class: "when" }, `Wish: "${String(desc.wish).slice(0, 80)}"`) : null,
        extra || null,
        when ? h("div", { class: "when", "data-time": when, "data-prefix": prefix }, prefix + timeAgo(when)) : null));
  }

  function render(data) {
    const events = Array.isArray(data.events) ? data.events : [];
    const giftList = Array.isArray(data.gifts) ? data.gifts : [];
    const who = data.child_name ? String(data.child_name) : "";
    lead.textContent = who
      ? `What ${who} has been up to in WishWorld. It updates by itself.`
      : "What they have been up to in WishWorld. It updates by itself.";

    const uniq = (type, keys) => new Set(events.filter((e) => e.type === type).map((e) => String(first(e.detail || {}, keys) ?? e.id))).size;
    const calm = events.filter((e) => e.type === "breath_session");
    const breaths = calm.reduce((sum, e) => sum + (Number(first(e.detail || {}, ["breaths", "slow_breaths", "slowBreaths", "count", "breath_count"])) || 0), 0);
    const sessions = calm.filter((e) => !(e.detail && e.detail.final === false)).length || (calm.length ? 1 : 0);
    const opened = giftList.filter((g) => g.opened_at).length;
    stats.replaceChildren(
      stat("globe", uniq("world_visited", ["world", "world_id", "worldId", "id", "name"]), "worlds visited"),
      stat("book", uniq("creature_learned", ["creature", "creature_id", "creatureId", "option_id", "id", "name"]), "creatures learned"),
      stat("wind", sessions, breaths ? `calm sessions, ${plural(breaths, "slow breath", "slow breaths")}` : "calm sessions"),
      stat("map", events.filter((e) => e.type === "explore_visited").length, "explore visits"),
      stat("gift", `${opened} of ${giftList.length}`, "gifts and letters opened"));
    stats.lastChild.style.gridColumn = "1 / -1";

    feed.replaceChildren(...events.map((e) => row(describeEvent(e), e.created_at)));
    gifts.replaceChildren(...giftList.map((g) => {
      const st = giftState(g);
      const state = h("span", { class: "state " + st.cls }, st.text);
      if (st.time) { state.dataset.time = st.time; state.dataset.prefix = st.prefix; }
      return row(describeGift(g), g.created_at, h("div", null, state), "Sent ");
    }));

    const nothing = !events.length && !giftList.length;
    empty.hidden = !nothing;
    feedCard.hidden = !events.length;
    giftCard.hidden = !giftList.length;
  }

  function refreshTimes() {
    for (const el of root.querySelectorAll("[data-time]")) el.textContent = (el.dataset.prefix || "") + timeAgo(el.dataset.time);
  }

  function setLive(ok) {
    live.classList.toggle("stale", !ok);
    live.lastChild.textContent = ok ? `Room ${ctx.room()} · up to date` : (lastOk ? `Room ${ctx.room()} · last updated ${timeAgo(lastOk)}` : `Room ${ctx.room()} · not connected`);
  }

  async function load() {
    if (loading) return;
    loading = true;
    const room = ctx.room();
    try {
      const data = await ctx.api.getInbox();
      if (room !== ctx.room()) return;
      const sig = JSON.stringify([data.child_name, (data.events || []).map((e) => e.id), (data.gifts || []).map((g) => [g.id, g.status, g.opened_at, g.kind])]);
      if (sig !== signature) { signature = sig; render(data); } else refreshTimes();
      lastOk = Date.now(); loadedOnce = true;
      alertBox.hidden = true;
      setLive(true);
    } catch (err) {
      setLive(false);
      alertBox.replaceChildren(h("span", { html: icon("warn") }),
        h("span", null, loadedOnce ? `Could not refresh just now. ${errorText(err)} Showing the last update.` : `The check-in could not load. ${errorText(err)} It will keep trying.`));
      alertBox.hidden = false;
      refreshTimes();
    } finally {
      loading = false;
    }
  }

  function schedule() {
    clearTimeout(timer);
    if (!visible) return;
    timer = setTimeout(async () => { await Promise.all([load(), loadBuddies()]); schedule(); }, REFRESH_MS);
  }

  return {
    onShow() { visible = true; loadBuddies(); load().then(schedule); },
    onHide() { visible = false; clearTimeout(timer); },
    onProfileChange() { resetBuddies(); if (visible) loadBuddies(true); },
    onRoomChange() {
      resetBuddies();
      signature = ""; lastOk = 0; loadedOnce = false;
      feed.replaceChildren(); gifts.replaceChildren(); stats.replaceChildren();
      feedCard.hidden = giftCard.hidden = true; empty.hidden = true;
      if (visible) load();
    },
  };
}
