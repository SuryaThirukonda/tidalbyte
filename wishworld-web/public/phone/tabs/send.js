// Send tab: name, a wish, three one-tap ideas, Send. Confirms with the creature's picture and the gift's message.
import { h, fill, icon, thumb, creatureInfo, plainName, errorText } from "/phone/lib.js";

// Child-friendly ideas; each one names a creature in the library so the wish always lands on something real.
const IDEAS = [
  { id: "turtle", text: "A sea turtle to swim beside you" },
  { id: "penguin", text: "A waddling penguin friend" },
  { id: "rocket", text: "A rocket to zoom past the stars" },
  { id: "whale", text: "A gentle blue whale" },
  { id: "butterfly", text: "A butterfly to flutter by" },
  { id: "trex", text: "A friendly T. rex" },
  { id: "clownfish", text: "A school of clownfish" },
  { id: "snowyowl", text: "A snowy owl to watch over you" },
  { id: "giraffe", text: "A tall giraffe to say hello" },
  { id: "jellyfish", text: "A glowing jellyfish" },
  { id: "parrot", text: "A chatty parrot" },
  { id: "polarbear", text: "A cuddly polar bear" },
  { id: "elephant", text: "A baby elephant" },
  { id: "balloon", text: "A hot-air balloon ride" },
  { id: "sloth", text: "A sleepy sloth" },
  { id: "saturn", text: "Saturn and its rings" },
  { id: "lion", text: "A brave lion" },
  { id: "flamingo", text: "A pink flamingo" },
  { id: "shark", text: "A smiling shark" },
  { id: "triceratops", text: "A triceratops to ride on" },
  { id: "seal", text: "A playful seal" },
];

const MAX = 200;

export function mount(root, ctx) {
  let offset = Math.floor(Math.random() * IDEAS.length);
  let busy = false;

  // ---- form
  const { row: nameRow, input: nameInput } = ctx.sender.field("send");
  const wish = h("textarea", {
    class: "field", id: "send-wish", rows: "3", maxlength: String(MAX), enterkeyhint: "send",
    placeholder: "What would you like to send? A turtle, a rocket, a rainbow fish...",
  });
  const counter = h("span", { class: "counter", "aria-hidden": "true" }, `0 / ${MAX}`);
  const chips = h("div", { class: "chips", id: "send-ideas" });
  const alertBox = h("div", { class: "note bad", role: "alert", hidden: true });
  const sendBtn = h("button", { class: "btn primary big block", type: "submit", id: "send-go" }, h("span", { html: icon("send") }), h("span", { class: "btn-text" }, "Send the wish"));

  const form = h("form", { class: "card snowcap", id: "send-form", novalidate: true },
    h("div", { class: "ribbon-row" }, h("h1", { class: "ribbon" }, "Send a wish")),
    h("p", { class: "lead" }, "Wish for a creature and it will appear in their world a moment later."),
    nameRow,
    h("div", { class: "field-row" }, h("label", { class: "label", for: "send-wish" }, "Your wish"), wish, counter),
    h("div", { class: "ideas-head" },
      h("span", { class: "label", id: "ideas-label" }, "Or tap an idea"),
      h("button", { class: "linkbtn", type: "button", id: "send-more", onclick: () => { offset = (offset + 3) % IDEAS.length; drawIdeas(); } },
        h("span", { html: icon("shuffle") }), "More ideas")),
    chips,
    alertBox,
    sendBtn);

  // ---- confirmation
  const done = h("div", { class: "card snowcap done", id: "send-done", hidden: true, "aria-live": "polite" });

  root.append(form, done);

  function updateCounter() {
    const n = wish.value.length;
    counter.textContent = `${n} / ${MAX}`;
    counter.classList.toggle("near", n >= MAX - 20);
  }

  function drawIdeas() {
    chips.replaceChildren();
    for (let i = 0; i < 3; i++) {
      const idea = IDEAS[(offset + i) % IDEAS.length];
      const chip = h("button", { class: "chip", type: "button", "data-id": idea.id },
        thumb(idea.id, 42), h("span", { class: "chip-text" }, idea.text));
      chip.addEventListener("click", () => {
        wish.value = idea.text;
        updateCounter();
        hideAlert();
        for (const c of chips.children) c.classList.toggle("picked", c === chip);
      });
      chips.append(chip);
    }
  }

  function showAlert(message) {
    alertBox.replaceChildren(h("span", { html: icon("warn") }), h("span", null, message));
    alertBox.hidden = false;
    alertBox.style.marginBottom = "14px";
  }
  function hideAlert() { alertBox.hidden = true; }

  function setBusy(on) {
    busy = on;
    sendBtn.disabled = on;
    sendBtn.querySelector(".btn-text").textContent = on ? "Sending..." : "Send the wish";
  }

  function showDone(gift, senderName) {
    const info = creatureInfo(gift.option_id);
    const move = String((info.raw && (info.raw.move || info.raw.motion)) || "").toLowerCase();
    const verb = { swim: "swimming", fly: "flying", walk: "walking", float: "floating", hover: "floating", orbit: "spinning" }[move] || "coming";
    const said = gift.message && String(gift.message).trim();
    const pic = thumb(gift.option_id, 132);
    pic.classList.add("pop");
    fill(done,
      h("div", { class: "ribbon-row" }, h("h1", { class: "ribbon" }, "Wish sent")),
      pic,
      h("p", { class: "done-line", id: "send-done-line" }, `Your ${plainName(info)} is ${verb} over.`),
      said ? h("p", { class: "quote", id: "send-done-message" }, said) : null,
      h("p", { class: "done-sub muted" }, `From ${senderName}, to room ${ctx.room()}.`),
      h("button", { class: "btn primary big block", type: "button", id: "send-again", onclick: again }, "Send another wish"),
    );
    form.hidden = true;
    done.hidden = false;
    window.scrollTo(0, 0);
  }

  function again() {
    done.hidden = true;
    form.hidden = false;
    offset = (offset + 3) % IDEAS.length;
    drawIdeas();
    wish.focus();
  }

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    hideAlert();
    const senderName = ctx.sender.require(nameInput);
    if (!senderName) return;
    const text = wish.value.trim();
    if (!text) {
      ctx.toast("Type a wish, or tap one of the ideas.", "warn");
      wish.focus();
      return;
    }
    setBusy(true);
    try {
      const gift = await ctx.api.sendWish({ sender: senderName, text });
      if (!gift || !gift.option_id) throw new Error("The wish was sent, but no creature came back. Please try again.");
      wish.value = "";
      updateCounter();
      for (const c of chips.children) c.classList.remove("picked");
      showDone(gift, senderName);
    } catch (err) {
      // Keep everything the person typed; only say what happened.
      showAlert(`That wish did not go through. ${errorText(err)} Nothing you typed was lost.`);
    } finally {
      setBusy(false);
    }
  }

  wish.addEventListener("input", () => { updateCounter(); hideAlert(); });
  wish.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  form.addEventListener("submit", submit);
  drawIdeas();
  updateCounter();

  return {
    onRoomChange() { if (!done.hidden) again(); },
  };
}
