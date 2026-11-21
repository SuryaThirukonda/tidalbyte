using System.Collections.Generic;
using TMPro;
using UnityEngine;

namespace WishWorld
{
    /// <summary>
    /// The guide's voice, and the one place every spoken word goes through, so two lines never talk over each other.
    /// <see cref="Say"/> shows a caption in front of the player and speaks it. <see cref="Read"/> speaks words that
    /// are already on a panel (a fact card, a quiz question, a menu) without a caption. <see cref="Hint"/> names the
    /// button being pointed at, only when nothing else is being said.
    /// Speech comes from the text-to-speech service: a recorded line if the voice bank has it, otherwise live.
    /// </summary>
    public class GuideVoice : MonoBehaviour
    {
        struct Line { public string text; public bool caption; }

        static GuideVoice inst;
        readonly Queue<Line> queue = new Queue<Line>();
        GameObject panel;
        PopIn pop;
        TextMeshPro text;
        TypeOn typer;
        AudioSource voice;
        float hideAt, busyUntil;
        bool showing, hinting;
        int token;

        /// <summary>The last caption shown.</summary>
        public static string LastLine { get; private set; }
        /// <summary>The last thing sent to the voice, caption or not.</summary>
        public static string LastSpoken { get; private set; } = "";
        public static int SpokenCount { get; private set; }
        public static bool Speaking => inst != null && inst.voice != null && inst.voice.isPlaying;

        /// <summary>Caption and voice, after anything already waiting.</summary>
        public static void Say(string line) { Add(line, true, false); }

        /// <summary>Drop anything waiting and say this now, with a caption.</summary>
        public static void SayNow(string line) { Add(line, true, true); }

        /// <summary>Voice only, after anything already waiting: for words that are already on screen.</summary>
        public static void Read(string line) { Add(line, false, false); }

        /// <summary>Voice only, now: for a panel that has just replaced what was being read.</summary>
        public static void ReadNow(string line) { Add(line, false, true); }

        /// <summary>Name the thing being pointed at. Stays quiet while the guide is saying anything else.</summary>
        public static void Hint(string line)
        {
            if (string.IsNullOrEmpty(line)) return;
            var g = Ensure();
            if (g == null || g.queue.Count > 0 || g.showing) return;
            if (g.voice.isPlaying && !g.hinting) return;
            if (g.hinting && g.voice.isPlaying && LastSpoken == line) return;     // already saying this name: do not start it again
            if (!Services.CanSpeak(line)) return;
            g.hinting = true;
            g.Speak(line, false);
        }

        /// <summary>Stop talking and forget what was waiting (leaving a scene, closing a panel).</summary>
        public static void Hush()
        {
            if (inst == null) return;
            inst.queue.Clear();
            inst.token++;
            if (inst.voice != null) { inst.voice.Stop(); Sfx.VoiceStop?.Invoke(); }
            inst.busyUntil = 0;
        }

        static void Add(string line, bool caption, bool now)
        {
            if (string.IsNullOrEmpty(line)) return;
            var g = Ensure();
            if (g == null) return;
            if (!caption && !Services.CanSpeak(line)) return;      // nothing to play and no caption to show
            if (now)
            {
                g.queue.Clear();
                g.token++;
                g.voice.Stop(); Sfx.VoiceStop?.Invoke();
                g.busyUntil = 0;
                if (caption) g.showing = false;
            }
            if (g.queue.Count < 4) g.queue.Enqueue(new Line { text = line, caption = caption });
        }

        static GuideVoice Ensure()
        {
            if (inst != null) return inst;
            if (XRRig.I == null) return null;
            var go = new GameObject("GuideVoice");
            go.transform.SetParent(XRRig.I.transform, false);
            inst = go.AddComponent<GuideVoice>();
            return inst;
        }

        void Awake()
        {
            var theme = WWTheme.I;
            panel = WWUI.Panel(transform, "Caption", new Vector2(1.0f, 0.2f), theme.panel, 0.06f, 0.007f, PanelStyle.Bubble);
            text = WWUI.Label(panel.transform, "", 0.042f, new Vector2(0.92f, 0.16f), theme.slate);
            typer = text.gameObject.AddComponent<TypeOn>();
            pop = panel.AddComponent<PopIn>();
            pop.bob = 0.006f;
            voice = gameObject.AddComponent<AudioSource>();
            voice.spatialBlend = 0f;
            voice.playOnAwake = false;
            panel.SetActive(false);
        }

        void Update()
        {
            float now = Time.unscaledTime;
            if (showing && now >= hideAt)
            {
                showing = false;
                PopIn.Close(panel);
            }
            if (pop != null) pop.pulse = Mathf.MoveTowards(pop.pulse, voice.isPlaying && showing ? 1f : 0f, Time.unscaledDeltaTime * 4f);
            if (queue.Count == 0) return;
            bool free = now >= busyUntil && !showing && (!voice.isPlaying || hinting);
            // a voice-only line may start under a caption that has finished speaking
            if (!free && showing && !queue.Peek().caption && !voice.isPlaying && now >= busyUntil) free = true;
            if (!free) return;
            var line = queue.Dequeue();
            hinting = false;
            Speak(line.text, line.caption);
        }

        void Speak(string line, bool caption)
        {
            float now = Time.unscaledTime;
            float guess = Mathf.Clamp(1.8f + line.Length * 0.055f, 2.5f, 8f);
            if (caption)
            {
                LastLine = line;
                var rig = XRRig.I;
                if (rig == null) return;
                // Park the caption below eye level, in front of where the player is facing now.
                var fwd = rig.HeadForwardFlat;
                var pos = rig.HeadPosition + fwd * 1.1f;
                pos.y = rig.HeadPosition.y - 0.5f;
                panel.transform.position = pos;
                panel.transform.rotation = Quaternion.LookRotation(fwd, Vector3.up) * Quaternion.Euler(24f, 0, 0);
                text.text = line;
                if (panel.activeSelf) pop.Replay(); else panel.SetActive(true);
                typer.Play(Mathf.Min(guess * 0.5f, 0.3f + line.Length * 0.035f));
                showing = true;
                hideAt = now + guess;
                busyUntil = hideAt;
            }
            else busyUntil = now + 0.25f;

            LastSpoken = line;
            SpokenCount++;
            int mine = ++token;
            Services.Tts.Speak(line, clip =>
            {
                if (mine != token || clip == null || voice == null) return;     // something newer took over while this was loading
                voice.Stop(); Sfx.VoiceStop?.Invoke();
                voice.clip = clip; voice.Play();
                Sfx.VoiceStart?.Invoke(clip);
                float end = Time.unscaledTime + clip.length;
                if (caption)
                {
                    hideAt = Mathf.Max(hideAt, end + 0.7f);
                    busyUntil = hideAt;
                    typer.Retime(clip.length * 0.9f);
                }
                else busyUntil = end + 0.15f;
            });
        }
    }
}
