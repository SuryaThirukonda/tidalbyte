// The guide's lines for Frost Slice, with Unity's three ways of speaking (Scripts/Core/GuideVoice.cs):
//   say(line)     caption and voice, after anything already waiting       (GuideVoice.Say)
//   sayNow(line)  drop what is waiting and say this now, with a caption   (GuideVoice.SayNow)
//   read(line)    voice only, for words that are already on a panel      (GuideVoice.Read)
// One line at a time; at most four waiting, as in Unity.
//
// The words come from the game's recorded voice bank when /audio/audio.json has the line, and from the
// shell's live voice (ctx.audio.speak) when it has not. A shell with a guide of its own (ctx.say) does both
// and shows the caption bubble; otherwise the bank is looked up here and `caption` (hud.js) shows the words.

const MAX_WAITING = 4;

/** VoiceBank.Key: trimmed, lower case, runs of white space made one space. */
const keyOf = (text) => String(text).trim().toLowerCase().split(/\s+/).filter(Boolean).join(' ');

export function createVoice(ctx, { caption = null, log = null } = {}) {
  const hasGuide = typeof ctx.say === 'function';
  let bank = null, bankPromise = null;
  let token = 0, waiting = 0;
  let chain = Promise.resolve();
  const spoken = [];                                   // what was said, in order (for tests)

  function loadBank() {
    if (!bankPromise) {
      bankPromise = fetch('/audio/audio.json')
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          bank = new Map();
          for (const line of (data && data.voice) || []) if (line && line.file) bank.set(line.key || keyOf(line.text), line);
          return bank;
        })
        .catch(() => { bank = new Map(); return bank; });
    }
    return bankPromise;
  }
  if (!hasGuide) loadBank();

  const pause = (seconds) => new Promise((resolve) => setTimeout(resolve, Math.max(0, seconds) * 1000));

  async function speak(text, withCaption, mine) {
    spoken.push(text);
    if (log) log('voice', (withCaption ? 'say' : 'read') + ' "' + text + '"');
    try {
      if (hasGuide) { await ctx.say(text, { caption: withCaption }); return; }
      const lines = await loadBank();
      if (mine !== token) return;
      const line = lines.get(keyOf(text));
      const seconds = line ? Number(line.seconds) || 0 : 0;
      if (withCaption && caption) caption.show(text, seconds);
      if (line) await Promise.all([ctx.audio.playUrl('/audio/' + line.file), pause(seconds)]);   // recorded in Unity
      else await ctx.audio.speak(text);                                                           // spoken live
    } catch { /* silence is fine */ }
  }

  function queue(text, withCaption) {
    if (!text || waiting >= MAX_WAITING) return;
    const mine = token;
    waiting++;
    chain = chain.then(() => { waiting = Math.max(0, waiting - 1); return mine === token ? speak(text, withCaption, mine) : undefined; });
  }

  return {
    say(text) { queue(text, true); },
    read(text) { queue(text, false); },
    sayNow(text) {
      if (!text) return;
      const mine = ++token;
      waiting = 0;
      if (!hasGuide) { try { ctx.audio.stop(); } catch { /* fine */ } }      // ctx.say takes over by itself
      chain = speak(text, true, mine);
    },
    /** Stop talking and forget what was waiting (GuideVoice.Hush). */
    hush() {
      token++; waiting = 0;
      chain = Promise.resolve();
      try { if (ctx.guide && typeof ctx.guide.hush === 'function') ctx.guide.hush(); else ctx.audio.stop(); } catch { /* fine */ }
      if (caption) caption.hide();
    },
    spoken,
  };
}
