using System.Collections.Generic;
using UnityEngine;

namespace WishWorld
{
    /// <summary>
    /// Turns a recognized command into an action. Voice, the wish menu and the debug keys all
    /// send the same text here, so the menu is both the fallback and the test tool.
    /// </summary>
    public class CommandRouter : MonoBehaviour
    {
        public static CommandRouter I { get; private set; }

        public string LastHeard { get; private set; } = "";
        public string LastResult { get; private set; } = "";

        WorldLibrary lib;

        void Awake()
        {
            I = this;
            lib = WorldLibrary.I;
            Services.Vocabulary = CommandParser.Vocabulary(lib);
            Services.Options = CommandParser.Options(lib);
        }

        void OnDestroy() { if (I == this) I = null; }

        /// <summary>
        /// Speech path. With only the keyword matcher (no AI key), the words go straight to it.
        /// With the AI on, a sentence made of nothing but preset words ("purple sharks") still goes straight through,
        /// at once and with no network. Anything else goes to the AI, which picks from the preset choices or answers
        /// a question; if it fails or finds nothing, the matcher gets a turn before the guide gives up.
        /// </summary>
        public void HandleHeard(string heard)
        {
            LastHeard = heard ?? "";
            LastRoute = "keywords";
            bool ai = !(Services.Interpreter is KeywordCommandInterpreter);
            if (!ai) { if (!Execute(heard, true)) Miss(); return; }
            if (CommandParser.IsExact(LastHeard, lib) && Execute(heard, true)) return;
            Services.Context = DescribeScene();
            LastRoute = "ai";
            Thinking = true;
            Status("Thinking...");
            Services.Interpreter.Interpret(heard, mapped =>
            {
                Thinking = false;
                Status("Heard: " + heard);
                mapped = (mapped ?? "").Trim();
                LastMapped = mapped;
                // The interpreter may answer a question instead of mapping a wish: "say: <a sentence or two>".
                if (mapped.StartsWith("say:", System.StringComparison.OrdinalIgnoreCase))
                {
                    string answer = mapped.Substring(4).Trim();
                    if (answer.Length > 0) { LastResult = "answer"; GuideVoice.SayNow(answer.Length > 260 ? answer.Substring(0, 260) : answer); return; }
                }
                bool unmapped = string.IsNullOrEmpty(mapped) || mapped == heard || mapped.ToLowerInvariant().TrimEnd('.') == "none";
                if (!unmapped && Execute(mapped, true)) return;
                LastRoute = "ai then keywords";
                if (!Execute(heard, true)) Miss();          // the AI found nothing or could not be reached: fall back to the keywords
            });
        }

        /// <summary>How the last spoken wish was handled: "keywords", "ai", or "ai then keywords".</summary>
        public string LastRoute { get; private set; } = "";
        /// <summary>What the AI turned the last spoken wish into.</summary>
        public string LastMapped { get; private set; } = "";
        public bool Thinking { get; private set; }

        static void Status(string text) { if (WorldController.I != null) WorldController.I.SetStatus(text); }

        public bool Execute(string text) => Execute(text, false);

        bool Execute(string text, bool quietMiss)
        {
            var p = CommandParser.Parse(text, lib);
            if (!p.Any)
            {
                if (!quietMiss) Miss();
                return false;
            }
            if (p.home) { LastResult = "home"; SceneLoader.GoHub(); return true; }

            var wc = WorldController.I;
            if (wc == null) { LastResult = "no world"; return false; }

            if (p.undo)
            {
                bool ok = wc.Undo();
                LastResult = ok ? "undo" : "nothing to undo";
                GuideVoice.Say(ok ? "Okay, I put it back." : "There is nothing to undo.");
                return true;
            }

            wc.Begin();
            var said = new List<string>();
            string line = null;

            if (p.clear) { wc.Clear(); said.Add("clear"); line = "All clear."; }
            if (p.ar) { wc.SetAR(true); said.Add("ar"); line = "Here it is, in your room."; }
            if (p.vr) { wc.SetAR(false); said.Add("vr"); line = "Off we go!"; }

            if (p.world != null && wc.LoadWorld(p.world))
            {
                said.Add("world:" + p.world);
                var def = lib.FindWorld(p.world);
                line = string.IsNullOrEmpty(def.guideIntro) ? "Welcome to the " + def.displayName + "!" : def.guideIntro;
            }

            bool modifiers = p.color != null || p.amount != null || p.size != null;
            foreach (var id in p.creatures)
            {
                bool present = wc.State.Find(id) != null;
                if (!present || p.add || !modifiers)
                {
                    // A world command already brought its own creatures; do not double them.
                    if (!(present && p.world != null))
                    {
                        wc.AddCreature(id);
                        said.Add("add:" + id);
                        var c = lib.FindCreature(id);
                        if (line == null && c != null) line = "Here comes the " + c.displayName.ToLowerInvariant() + "!";
                    }
                }
            }

            var targets = p.creatures.Count > 0 ? p.creatures : null;
            if (p.color != null) { wc.SetColor(targets, p.color); said.Add("color:" + p.color); line = line ?? "Ooh, " + p.color + "!"; }
            if (p.amount != null) { wc.ChangeAmount(targets, p.amount); said.Add("amount:" + p.amount); line = line ?? (p.amount == "fewer" ? "A few less." : "More and more!"); }
            if (p.size != null) { wc.ChangeSize(targets, p.size); said.Add("size:" + p.size); line = line ?? (p.size == "tiny" || p.size == "smaller" ? "So small!" : "So big!"); }

            if (p.snow) { wc.SetSnow(true); said.Add("snow"); line = line ?? "Let it snow!"; }
            if (p.night) { wc.SetNight(true); said.Add("night"); line = line ?? "Goodnight, world."; }
            if (p.sunny) { wc.SetNight(false); wc.SetSnow(false); said.Add("sunny"); line = line ?? "Hello, sunshine!"; }

            wc.Commit();
            LastResult = string.Join(" ", said);
            // Arriving in a new world replaces anything the guide still had queued about the last one.
            if (line != null) { if (p.world != null) GuideVoice.SayNow(line); else GuideVoice.Say(line); }
            return true;
        }

        /// <summary>The world on show and what lives in it, with the facts on the cards, for the interpreter to answer from.</summary>
        string DescribeScene()
        {
            var wc = WorldController.I;
            if (wc == null || lib == null) return "";
            var sb = new System.Text.StringBuilder();
            var def = lib.FindWorld(wc.State.worldId);
            sb.Append(wc.State.ar ? "the child's own room" : def != null ? "the " + def.displayName + " world" : "an empty dream world");
            foreach (var e in wc.State.entries)
            {
                var c = lib.FindCreature(e.creatureId);
                if (c == null) continue;
                sb.Append("; ").Append(e.count).Append(' ').Append(c.displayName);
                if (!string.IsNullOrEmpty(c.fact)) sb.Append(" (").Append(c.fact).Append(')');
            }
            return sb.Append('.').ToString();
        }

        void Miss()
        {
            LastResult = "miss";
            GuideVoice.Say("I can't make that yet. Want a shark instead?");
        }
    }
}
