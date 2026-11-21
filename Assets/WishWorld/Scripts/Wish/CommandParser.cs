using System.Collections.Generic;
using System.Text;
using UnityEngine;

namespace WishWorld
{
    /// <summary>What a sentence asked for, after looking for known words.</summary>
    public class ParsedWish
    {
        public string world;
        public List<string> creatures = new List<string>();
        public string color, amount, size;
        public bool add, snow, night, sunny, ar, vr, clear, undo, home;

        public bool Any => world != null || creatures.Count > 0 || color != null || amount != null || size != null
                           || snow || night || sunny || ar || vr || clear || undo || home;
    }

    /// <summary>The preset choices, grouped the way a wish is put together. Each entry is a phrase the matcher understands.</summary>
    public class WishOptions
    {
        public string[] worlds, creatures, colors, amounts, sizes, extras;
    }

    /// <summary>
    /// The plan's matcher: lowercase the text, then look for known words. No AI involved.
    /// "I want an aquarium with purple sharks" contains aquarium, purple and shark.
    /// </summary>
    public static class CommandParser
    {
        public static readonly Dictionary<string, Color> ColorValues = new Dictionary<string, Color>
        {
            { "red", new Color(0.92f, 0.22f, 0.20f) },
            { "blue", new Color(0.22f, 0.45f, 0.95f) },
            { "purple", new Color(0.62f, 0.30f, 0.88f) },
            { "gold", new Color(1.00f, 0.78f, 0.18f) },
            { "rainbow", Color.white },
        };

        static readonly (string id, string[] words)[] Colors =
        {
            ("red", new[] { "red" }), ("blue", new[] { "blue" }), ("purple", new[] { "purple", "violet" }),
            ("gold", new[] { "gold", "golden", "yellow" }), ("rainbow", new[] { "rainbow", "rainbows" }),
        };
        static readonly (string id, string[] words)[] Amounts =
        {
            ("lots", new[] { "lots of", "lots", "many", "a lot" }), ("more", new[] { "more" }), ("fewer", new[] { "fewer", "less" }),
        };
        static readonly (string id, string[] words)[] Sizes =
        {
            ("giant", new[] { "giant", "huge", "enormous" }), ("tiny", new[] { "tiny", "teeny" }),
            ("bigger", new[] { "bigger", "larger", "big" }), ("smaller", new[] { "smaller", "small", "little" }),
        };
        static readonly string[] Snow = { "make it snow", "let it snow", "snow", "snowing" };
        static readonly string[] Night = { "make it night", "night", "nighttime", "dark" };
        static readonly string[] Sunny = { "make it sunny", "sunny", "sunshine", "daytime", "make it day" };
        static readonly string[] Ar = { "in my room", "my room", "in the room" };
        static readonly string[] Vr = { "take me there", "take me" };
        static readonly string[] ClearWords = { "clear", "remove everything", "reset" };
        static readonly string[] UndoWords = { "undo", "go back" };
        static readonly string[] HomeWords = { "go home", "home", "main menu" };
        static readonly string[] AddWords = { "add", "give me", "i want", "show me", "spawn" };

        public static string Normalize(string text)
        {
            if (string.IsNullOrEmpty(text)) return " ";
            var sb = new StringBuilder(text.Length + 2);
            sb.Append(' ');
            bool lastSpace = true;
            foreach (char raw in text.ToLowerInvariant())
            {
                char c = char.IsLetterOrDigit(raw) ? raw : ' ';
                if (c == ' ' && lastSpace) continue;
                sb.Append(c);
                lastSpace = c == ' ';
            }
            if (!lastSpace) sb.Append(' ');
            return sb.ToString();
        }

        /// <summary>True if the phrase, or a simple plural of it, appears as whole words.</summary>
        static bool Has(string padded, string phrase)
        {
            if (string.IsNullOrEmpty(phrase)) return false;
            phrase = phrase.ToLowerInvariant();
            if (padded.Contains(" " + phrase + " ")) return true;
            if (padded.Contains(" " + phrase + "s ")) return true;
            if (padded.Contains(" " + phrase + "es ")) return true;
            if (phrase.EndsWith("y") && padded.Contains(" " + phrase.Substring(0, phrase.Length - 1) + "ies ")) return true;
            return false;
        }

        static bool HasAny(string padded, string[] phrases)
        {
            foreach (var p in phrases) if (Has(padded, p)) return true;
            return false;
        }

        static string Pick(string padded, (string id, string[] words)[] table)
        {
            foreach (var row in table) if (HasAny(padded, row.words)) return row.id;
            return null;
        }

        public static ParsedWish Parse(string text, WorldLibrary lib)
        {
            var p = new ParsedWish();
            string s = Normalize(text);

            p.undo = HasAny(s, UndoWords);
            p.home = !p.undo && HasAny(s, HomeWords);
            p.clear = HasAny(s, ClearWords);
            p.ar = HasAny(s, Ar);
            p.vr = HasAny(s, Vr);
            p.snow = HasAny(s, Snow);
            p.night = HasAny(s, Night);
            p.sunny = HasAny(s, Sunny);
            p.add = HasAny(s, AddWords);
            p.color = Pick(s, Colors);
            p.amount = Pick(s, Amounts);
            p.size = Pick(s, Sizes);

            if (lib != null)
            {
                if (lib.creatures != null)
                    foreach (var c in lib.creatures)
                        if (c != null && c.keywords != null && HasAny(s, c.keywords) && !p.creatures.Contains(c.id)) p.creatures.Add(c.id);
                if (lib.worlds != null)
                    foreach (var w in lib.worlds)
                        if (w != null && w.showInMenu && w.keywords != null && HasAny(s, w.keywords)) { p.world = w.id; break; }
            }
            return p;
        }

        /// <summary>The preset choices by kind. Every phrase here is one <see cref="Parse"/> understands.</summary>
        public static WishOptions Options(WorldLibrary lib)
        {
            var worlds = new List<string>();
            var creatures = new List<string>();
            if (lib != null)
            {
                if (lib.worlds != null) foreach (var w in lib.worlds) if (w != null && w.showInMenu && w.keywords != null && w.keywords.Length > 0) worlds.Add(w.keywords[0]);
                if (lib.creatures != null) foreach (var c in lib.creatures) if (c != null && c.keywords != null && c.keywords.Length > 0) creatures.Add(c.keywords[0]);
            }
            var colors = new List<string>();
            foreach (var row in Colors) colors.Add(row.id);
            return new WishOptions
            {
                worlds = worlds.ToArray(), creatures = creatures.ToArray(), colors = colors.ToArray(),
                amounts = new[] { "more", "fewer", "lots of" },
                sizes = new[] { "bigger", "smaller", "giant", "tiny" },
                extras = new[] { "make it snow", "make it night", "make it sunny", "in my room", "take me there", "clear", "undo", "go home", "add" },
            };
        }

        static readonly string[] Filler = { "a", "an", "the", "some", "please", "and", "with", "i", "want", "me", "give", "show", "add", "of", "to", "it", "make", "let", "lets", "s" };

        /// <summary>
        /// True when the sentence is nothing but preset words and small filler words ("purple sharks please"), which is
        /// what a menu button would send. Anything with other words in it ("not a shark", "something that swims") is not.
        /// </summary>
        public static bool IsExact(string text, WorldLibrary lib)
        {
            string s = Normalize(text);
            if (s.Trim().Length == 0) return false;
            var phrases = new List<string>();
            foreach (var table in new[] { Colors, Amounts, Sizes }) foreach (var row in table) phrases.AddRange(row.words);
            foreach (var list in new[] { Snow, Night, Sunny, Ar, Vr, ClearWords, UndoWords, HomeWords, AddWords }) phrases.AddRange(list);
            if (lib != null)
            {
                if (lib.creatures != null) foreach (var c in lib.creatures) if (c != null && c.keywords != null) phrases.AddRange(c.keywords);
                if (lib.worlds != null) foreach (var w in lib.worlds) if (w != null && w.showInMenu && w.keywords != null) phrases.AddRange(w.keywords);
            }
            phrases.Sort((a, b) => b.Length.CompareTo(a.Length));      // "make it snow" before "snow"
            bool found = false;
            foreach (var raw in phrases)
            {
                if (string.IsNullOrEmpty(raw)) continue;
                string ph = raw.ToLowerInvariant();
                var forms = new List<string> { ph, ph + "s", ph + "es" };
                if (ph.EndsWith("y")) forms.Add(ph.Substring(0, ph.Length - 1) + "ies");
                foreach (var f in forms)
                    while (s.Contains(" " + f + " ")) { s = s.Replace(" " + f + " ", " "); found = true; }
            }
            foreach (var f in Filler) while (s.Contains(" " + f + " ")) s = s.Replace(" " + f + " ", " ");
            return found && s.Trim().Length == 0;
        }

        /// <summary>Every word the router understands, for the interpreter's instructions.</summary>
        public static string Vocabulary(WorldLibrary lib)
        {
            var words = new List<string>();
            if (lib != null)
            {
                if (lib.worlds != null) foreach (var w in lib.worlds) if (w != null && w.showInMenu && w.keywords != null && w.keywords.Length > 0) words.Add(w.keywords[0]);
                if (lib.creatures != null) foreach (var c in lib.creatures) if (c != null && c.keywords != null && c.keywords.Length > 0) words.Add(c.keywords[0]);
            }
            foreach (var row in Colors) words.Add(row.id);
            words.AddRange(new[] { "more", "fewer", "lots of", "bigger", "smaller", "giant", "tiny",
                "make it snow", "make it night", "make it sunny", "in my room", "take me there", "clear", "undo", "go home", "add" });
            return string.Join(", ", words);
        }
    }
}
