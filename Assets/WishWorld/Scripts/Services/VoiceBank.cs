using System;
using System.Collections.Generic;
using UnityEngine;

namespace WishWorld
{
    /// <summary>
    /// Recorded audio for every preset line the app can say (world greetings, creature facts, quiz questions,
    /// the guide's fixed lines). It is filled in the editor by WishWorld > Voice > Bake Preset Lines, which sends
    /// each line to ElevenLabs once. At run time a line found here plays at once, with no network and no key.
    /// </summary>
    public class VoiceBank : ScriptableObject
    {
        public const string ResourceName = "VoiceBank";

        [Serializable]
        public class Entry { public string text; public AudioClip clip; }

        public string voiceName = "";
        public List<Entry> entries = new List<Entry>();

        Dictionary<string, AudioClip> lookup;
        static VoiceBank cached;
        static bool looked;

        public static VoiceBank I
        {
            get
            {
                if (!looked) { cached = Resources.Load<VoiceBank>(ResourceName); looked = true; }
                return cached;
            }
        }

        /// <summary>Same line, same key, whatever the spacing or capitals.</summary>
        public static string Key(string text) => string.IsNullOrEmpty(text) ? "" : string.Join(" ", text.Trim().ToLowerInvariant().Split((char[])null, StringSplitOptions.RemoveEmptyEntries));

        public AudioClip Find(string text)
        {
            if (lookup == null)
            {
                lookup = new Dictionary<string, AudioClip>();
                foreach (var e in entries) if (e != null && e.clip != null) lookup[Key(e.text)] = e.clip;
            }
            return lookup.TryGetValue(Key(text), out var clip) ? clip : null;
        }
    }

    /// <summary>Plays a recorded line when the bank has it; anything else goes to the live service (or the placeholder tone).</summary>
    public class BankedTextToSpeech : ITextToSpeech
    {
        readonly ITextToSpeech live;
        public static int Hits { get; private set; }
        public static int Misses { get; private set; }
        public static string LastMiss { get; private set; } = "";

        public BankedTextToSpeech(ITextToSpeech live) { this.live = live; }

        /// <summary>True when this line would come out as a real voice: it is recorded, or the live service is on.</summary>
        public bool CanSpeak(string text)
        {
            if (!(live is MockTextToSpeech)) return true;
            var bank = VoiceBank.I;
            return bank != null && bank.Find(text) != null;
        }

        public void Speak(string text, Action<AudioClip> onClip)
        {
            var bank = VoiceBank.I;
            var clip = bank != null ? bank.Find(text) : null;
            if (clip != null) { Hits++; onClip?.Invoke(clip); return; }
            Misses++; LastMiss = text;
            live.Speak(text, onClip);
        }
    }

    /// <summary>Every line the app builds from data rather than writing out in full. The baker adds the literal ones it finds in the scripts.</summary>
    public static class VoiceLines
    {
        public static string QuizRight(string name) => "Yes! " + name + ".";
        public static string QuizWrong(string name) => "It was the " + name + ".";
        public static string QuizScore(int got, int of) => "You got " + got + " of " + of + " right!";
        public const string QuizEmpty = "Add some creatures and learn their facts, then try the quiz.";
        public const string GamesMenu = "Games. Slice fruit, or race a car.";
        public const string WorldsMenu = "Worlds. Where would you like to go?";
        public const string FrostIntro = "Frost Slice. Swing the controllers to slice the fruit. Leave the ice blocks alone!";
        public const string SnowIntro = "Snow Circuit. Hold both controllers like a steering wheel. Right trigger to go, left trigger to brake.";
        public static readonly string[] Countdown = { "Three.", "Two.", "One.", "Go!" };

        /// <summary>Every fixed button and card in the app, as the guide names it when it is pointed at.</summary>
        public static readonly string[] ButtonLabels =
        {
            "Home", "Finish", "Close", "Back", "Start", "Hub", "Play again", "Race again",
            "Worlds", "Creatures", "Change", "Sky", "Control",
            "Red", "Blue", "Purple", "Gold", "Rainbow", "More", "Fewer", "Lots", "Bigger", "Smaller", "Giant", "Tiny",
            "Make it snow", "Make it night", "Make it sunny", "In my room", "Take me there", "Undo", "Clear", "Go home",
            "Games. Slice fruit, race cars.", "Worlds. Visit far places.", "AR Worlds. Bring them to you.", "Wish. Say what you wish for.",
            "Frost Slice. Slice the flying fruit.", "Snow Circuit. Race a snowy track.",
        };

        /// <summary>A button's label as it is spoken: page counters such as "More 2/3" are said as "More".</summary>
        public static string ForButton(string label)
        {
            if (string.IsNullOrEmpty(label)) return "";
            int cut = label.IndexOfAny("0123456789".ToCharArray());
            return (cut > 0 ? label.Substring(0, cut) : label).Trim();
        }

        public static List<string> FromData(WorldLibrary lib)
        {
            var lines = new List<string>();
            void Add(string s) { if (!string.IsNullOrWhiteSpace(s) && !lines.Contains(s)) lines.Add(s); }
            if (lib != null)
            {
                if (lib.worlds != null)
                    foreach (var w in lib.worlds)
                    {
                        if (w == null || string.IsNullOrEmpty(w.displayName)) continue;
                        Add(string.IsNullOrEmpty(w.guideIntro) ? "Welcome to the " + w.displayName + "!" : w.guideIntro);
                    }
                if (lib.creatures != null)
                    foreach (var c in lib.creatures)
                    {
                        if (c == null) continue;
                        Add(c.fact);
                        Add(c.quizQuestion);
                        Add("Here comes the " + c.displayName.ToLowerInvariant() + "!");
                    }
            }
            foreach (var color in CommandParser.ColorValues.Keys) Add("Ooh, " + color + "!");
            for (int lap = 2; lap <= 5; lap++) Add("Lap " + lap + "!");
            foreach (var place in new[] { "first", "second", "third", "fourth", "fifth" }) Add("You finished " + place + "!");

            // Words that sit on panels and are read out: quiz, menus, the countdown, and the name of each button.
            if (lib != null && lib.creatures != null)
                foreach (var c in lib.creatures)
                {
                    if (c == null || string.IsNullOrEmpty(c.displayName)) continue;
                    Add(QuizRight(c.displayName)); Add(QuizWrong(c.displayName));
                    Add(ForButton(c.displayName));
                }
            if (lib != null && lib.worlds != null)
                foreach (var w in lib.worlds) if (w != null && w.showInMenu) Add(ForButton(w.displayName));
            for (int of = 1; of <= 3; of++) for (int got = 0; got <= of; got++) Add(QuizScore(got, of));
            Add(QuizEmpty);
            foreach (var l in ButtonLabels) Add(ForButton(l));
            foreach (var l in Countdown) Add(l);
            Add(GamesMenu); Add(WorldsMenu); Add(FrostIntro); Add(SnowIntro);
            return lines;
        }
    }
}
