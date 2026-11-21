using System.Collections;
using System.Collections.Generic;
using System.Text;
using TMPro;
using UnityEngine;

namespace WishWorld
{
    /// <summary>
    /// "Scan a toy": a staged moment, not a real capture. The headset cannot read its cameras, so nothing is looked
    /// at or recorded here. A viewfinder is drawn over the real room for a few seconds, and then the toy the team
    /// modelled ahead of time (WorldLibrary.toys) pops into the world and greets the child.
    /// The whole feature runs on the device: it makes no network call of its own.
    /// </summary>
    public class ToyScan : MonoBehaviour
    {
        /// <summary>How long the scan line sweeps (two sweeps, up and down).</summary>
        public const float SweepSeconds = 4f;
        /// <summary>How long the guide waits for the child to say a name before the toy says "friend" instead.</summary>
        public const float NameWaitSeconds = 12f;

        public static ToyScan I { get; private set; }
        /// <summary>True from the first moment of a scan until the toy has appeared. Commands are ignored meanwhile.</summary>
        public static bool Busy { get; private set; }
        /// <summary>Where the sequence is: idle, starting, scanning, arriving, asking, greeting. For checks and debugging.</summary>
        public static string Stage { get; private set; } = "idle";
        /// <summary>How many scans have been started since the app began.</summary>
        public static int Runs { get; private set; }

        /// <summary>Start the scan. Does nothing if one is already running or there is no toy to bring in.</summary>
        public static void Run() { if (I != null) I.Begin(); }

        const float FrameSize = 0.40f, ArmLength = 0.09f, Thickness = 0.011f, BarWidth = 0.30f;
        static readonly string[] LabelFrames = { "Scanning.  ", "Scanning.. ", "Scanning..." };
        static readonly Dictionary<Color, Mesh> quads = new Dictionary<Color, Mesh>();

        WorldLibrary lib;
        Coroutine routine;
        GameObject finder;
        Transform sweep, sweepGlow, fill;
        TextMeshPro label;
        int labelFrame = -1;
        ParticleSystem sparkles;

        void Awake()
        {
            I = this;
            lib = WorldLibrary.I;
        }

        void OnDestroy()
        {
            if (I == this) I = null;
            Busy = false;
            Stage = "idle";
        }

        void Begin()
        {
            if (Busy) return;
            var wc = WorldController.I;
            if (wc == null || !wc.Ready || lib == null || !lib.ToysEnabled || XRRig.I == null) return;
            var def = NextToy();
            if (def == null) return;
            // An earlier scan may still be greeting, or waiting to hear a name. The new one takes over.
            if (routine != null) StopCoroutine(routine);
            if (CommandRouter.I != null) CommandRouter.I.CaptureNext(null);
            routine = StartCoroutine(Sequence(wc, def));
        }

        /// <summary>The next toy that has not been scanned yet. Once they all have, the last one again, so the demo can repeat.</summary>
        CreatureDefinition NextToy()
        {
            foreach (var t in lib.toys)
                if (t != null && !AppState.scannedToyIds.Contains(t.id)) return t;
            var last = lib.FindToy(AppState.lastToyId);
            if (last != null) return last;
            foreach (var t in lib.toys) if (t != null) return t;
            return null;
        }

        IEnumerator Sequence(WorldController wc, CreatureDefinition def)
        {
            Busy = true;
            Runs++;
            Stage = "starting";
            GuideVoice.SayNow(VoiceLines.ScanHold);

            // 0.0 s: the world fades out and the real room takes its place.
            yield return Fade(0f, 1f, 0.22f);
            wc.SetScanView(true);
            yield return Fade(1f, 0f, 0.28f);

            // 0.5 s: the viewfinder. 1 to 5 s: two sweeps of the scan line while the bar fills.
            Stage = "scanning";
            ShowFinder();
            const float settle = 0.5f;
            Sfx.Play(Sfx.Scan(settle + SweepSeconds), XRRig.I.HeadPosition, 0.7f);
            float half = FrameSize * 0.5f - 0.03f, nextPulse = 0f;
            for (float t = 0f; t < settle + SweepSeconds; t += Time.deltaTime)
            {
                float k = Mathf.Clamp01((t - settle) / SweepSeconds);
                float y = Mathf.Lerp(-half, half, Mathf.PingPong(k * 4f, 1f));
                sweep.localPosition = new Vector3(0f, y, -0.002f);
                sweepGlow.localPosition = new Vector3(0f, y, 0.001f);
                fill.localScale = new Vector3(Mathf.Max(0.0001f, BarWidth * k), 0.012f, 1f);
                fill.localPosition = new Vector3(-BarWidth * 0.5f + BarWidth * k * 0.5f, -FrameSize * 0.5f - 0.035f, -0.002f);
                int frame = (int)(Time.unscaledTime * 3f) % LabelFrames.Length;
                if (frame != labelFrame) { labelFrame = frame; label.text = LabelFrames[frame]; }
                if (t >= nextPulse)
                {
                    // a soft heartbeat in both controllers, so the scan can be felt as well as seen
                    nextPulse = t + 0.45f;
                    WWInput.Haptic(true, 0.25f, 0.06f);
                    WWInput.Haptic(false, 0.25f, 0.06f);
                }
                yield return null;
            }

            // 5 s: a white flash, and the world comes back behind it.
            Stage = "arriving";
            var rig = XRRig.I;
            if (rig != null) { rig.SetFade(1f); Sfx.Play(Sfx.Flash, rig.HeadPosition, 0.6f); }
            WWInput.Haptic(true, 0.6f, 0.12f);
            WWInput.Haptic(false, 0.6f, 0.12f);
            finder.SetActive(false);
            wc.SetScanView(false);
            yield return null;

            // The toy joins the world. From here on it is an ordinary creature that also remembers it was scanned.
            var toy = wc.AddToy(def.id);
            if (CommandRouter.I != null) CommandRouter.I.RefreshVocabulary();
            Vector3 full = Vector3.one;
            if (toy != null)
            {
                full = toy.transform.localScale;
                toy.transform.localScale = full * 0.001f;
                // Everyone looks straight at a toy that has just appeared, and a look of two seconds opens a fact
                // card, which would talk over the greeting. The card waits until the toy has said hello.
                toy.Rest(90f);
                // A small toy on the floor is below where the child is looking. It appears at chest height, where it
                // cannot be missed, and then drifts down to the floor to start walking (see Settle).
                if (toy.mover != null && rig != null)
                    toy.mover.height = Mathf.Clamp(rig.HeadPosition.y - wc.Floor.y - 0.45f, 0.35f, 1.2f);
            }
            yield return Fade(1f, 0f, 0.3f);

            // 5.3 s: it pops in, growing from nothing with a little overshoot, in a burst of sparkles.
            if (toy != null)
            {
                Sfx.Play(Sfx.Pop, toy.transform.position, 0.8f);
                Sfx.Play(Sfx.Chime, toy.transform.position, 0.7f);
                Sparkle(toy.transform.position + Vector3.up * 0.12f * full.y);
                const float pop = 0.5f;
                for (float t = 0f; t < pop && toy != null; t += Time.deltaTime)
                {
                    toy.transform.localScale = full * Mathf.Max(0.001f, OutBack(t / pop));
                    yield return null;
                }
                if (toy != null) toy.transform.localScale = full;
                if (toy != null && toy.mover != null) StartCoroutine(Settle(toy.mover));
            }
            Busy = false;

            // 6 s: the toy says hello by name. The name is one already known, one set ahead of time in .env, or the
            // next thing the child says; with none of those the toy says "friend".
            string child = AppState.childName;
            if (string.IsNullOrEmpty(child)) child = CleanName(EnvConfig.ChildName);
            if (string.IsNullOrEmpty(child) && CommandRouter.I != null)
            {
                Stage = "asking";
                string heard = null;
                bool answered = false;
                GuideVoice.Say(VoiceLines.AskName);
                wc.SetStatus("Hold A and say your name");
                CommandRouter.I.CaptureNext(text => { heard = text; answered = true; });
                float deadline = Time.time + NameWaitSeconds;
                while (!answered && Time.time < deadline)
                {
                    // Someone who has started to answer is given time to finish, and for the words to be recognised.
                    if (Services.Speech.IsListening) deadline = Mathf.Max(deadline, Time.time + 8f);
                    yield return null;
                }
                if (!answered && CommandRouter.I != null) CommandRouter.I.CaptureNext(null);
                child = CleanName(heard);
            }
            if (!string.IsNullOrEmpty(child)) AppState.childName = child;

            Stage = "greeting";
            GuideVoice.Say(VoiceLines.ToyGreeting(def.greeting, child));
            GuideVoice.Say(def.greeting2);
            string last = VoiceLines.ToyWhereTo(def.displayName);
            GuideVoice.Say(last);

            // Once the last line has come up and had time to be heard, the toy's fact card may open again.
            // (If a command replaces the toy first, the new one starts out ready, and this has nothing left to do.)
            float giveUp = Time.time + 45f;
            while (GuideVoice.LastLine != last && Time.time < giveUp) yield return null;
            yield return new WaitForSeconds(3f);
            if (toy != null) toy.Rest(0f);
            Stage = "idle";
            routine = null;
        }

        /// <summary>After a moment in the air, lower the new toy gently to the floor. Stops by itself if the toy is replaced.</summary>
        IEnumerator Settle(Mover mover)
        {
            float from = mover.height;
            yield return new WaitForSeconds(0.6f);
            const float seconds = 1.2f;
            for (float t = 0f; t < seconds && mover != null; t += Time.deltaTime)
            {
                mover.height = Mathf.Lerp(from, 0f, Mathf.SmoothStep(0f, 1f, t / seconds));
                yield return null;
            }
            if (mover != null) mover.height = 0f;
        }

        // ---------- the child's name ----------

        static readonly string[][] NameLeads =
        {
            new[] { "hi" }, new[] { "hello" }, new[] { "hey" }, new[] { "um" }, new[] { "uh" }, new[] { "well" },
            new[] { "my", "name", "is" }, new[] { "my", "name's" }, new[] { "my", "names" }, new[] { "the", "name", "is" }, new[] { "name", "is" },
            new[] { "they", "call", "me" }, new[] { "call", "me" }, new[] { "this", "is" },
            new[] { "i'm" }, new[] { "im" }, new[] { "i", "am" }, new[] { "it's" }, new[] { "its" }, new[] { "it", "is" },
        };
        static readonly HashSet<string> NameStops = new HashSet<string>
        {
            "and", "but", "i", "i'm", "im", "is", "what", "what's", "whats", "who", "how", "please", "thank", "thanks", "nice", "to", "the", "a",
        };

        /// <summary>
        /// Turn what was heard ("hi, my name's Sam!") into a name ("Sam"): drop the lead-in words, keep at most two
        /// words, and give each a capital letter. Returns an empty string if nothing is left.
        /// </summary>
        public static string CleanName(string heard)
        {
            if (string.IsNullOrWhiteSpace(heard)) return "";
            var sb = new StringBuilder(heard.Length);
            foreach (char raw in heard)
            {
                char c = raw == '’' ? '\'' : raw;
                if (c == '.' || c == '!' || c == '?' || c == ';') { if (sb.ToString().Trim().Length > 0) sb.Append(" | "); continue; }
                sb.Append(char.IsLetter(c) || c == '\'' || c == '-' || c == '|' ? c : ' ');
            }
            var words = new List<string>(sb.ToString().Split(new[] { ' ' }, System.StringSplitOptions.RemoveEmptyEntries));
            // "Hi. My name is Sam." puts a sentence break before the name; breaks only count once a name has been found.
            bool stripped = true;
            while (stripped && words.Count > 0)
            {
                stripped = false;
                if (words[0] == "|") { words.RemoveAt(0); stripped = true; continue; }
                foreach (var lead in NameLeads)
                {
                    if (words.Count < lead.Length) continue;
                    bool match = true;
                    for (int i = 0; i < lead.Length && match; i++) match = words[i].ToLowerInvariant() == lead[i];
                    if (!match) continue;
                    words.RemoveRange(0, lead.Length);
                    stripped = true;
                    break;
                }
            }
            var name = new StringBuilder();
            int kept = 0;
            foreach (var w in words)
            {
                if (kept >= 2 || w == "|" || NameStops.Contains(w.ToLowerInvariant())) break;
                string word = w.Trim('\'', '-');
                if (word.Length == 0) break;
                if (name.Length > 0) name.Append(' ');
                name.Append(char.ToUpperInvariant(word[0])).Append(word.Substring(1).ToLowerInvariant());
                kept++;
            }
            return name.Length > 24 ? name.ToString(0, 24).Trim() : name.ToString();
        }

        // ---------- the viewfinder: corner brackets, a sweeping line, a progress bar and a label, with no Canvas ----------

        void ShowFinder()
        {
            if (finder == null) BuildFinder();
            var rig = XRRig.I;
            var forward = rig.HeadForwardFlat;
            finder.transform.SetPositionAndRotation(rig.HeadPosition + forward * 0.7f + Vector3.up * 0.04f, Quaternion.LookRotation(forward, Vector3.up));
            labelFrame = -1;
            finder.SetActive(true);
        }

        void BuildFinder()
        {
            var theme = WWTheme.I;
            finder = new GameObject("ToyScanViewfinder");
            finder.layer = WWUI.UILayer;
            finder.transform.SetParent(transform, false);
            finder.SetActive(false);

            float edge = FrameSize * 0.5f;
            for (int sx = -1; sx <= 1; sx += 2)
                for (int sy = -1; sy <= 1; sy += 2)
                {
                    Bar("Bracket", new Vector3(sx * (edge - ArmLength * 0.5f), sy * (edge - Thickness * 0.5f), 0f), new Vector2(ArmLength, Thickness), theme.snow);
                    Bar("Bracket", new Vector3(sx * (edge - Thickness * 0.5f), sy * (edge - ArmLength * 0.5f), 0f), new Vector2(Thickness, ArmLength), theme.snow);
                }
            sweepGlow = Bar("SweepGlow", Vector3.zero, new Vector2(FrameSize - 0.05f, 0.03f), new Color(0.36f, 0.66f, 0.80f));
            sweep = Bar("Sweep", Vector3.zero, new Vector2(FrameSize - 0.05f, 0.007f), new Color(0.80f, 0.98f, 1f));
            Bar("BarTrack", new Vector3(0f, -edge - 0.035f, 0f), new Vector2(BarWidth + 0.008f, 0.02f), theme.slate);
            fill = Bar("BarFill", new Vector3(0f, -edge - 0.035f, -0.002f), new Vector2(0.0001f, 0.012f), theme.peach);

            var plate = WWUI.Panel(finder.transform, "Plate", new Vector2(0.27f, 0.062f), theme.panel, 0.028f, 0.005f, PanelStyle.Plain);
            plate.transform.localPosition = new Vector3(0f, edge + 0.055f, 0f);
            label = WWUI.Label(plate.transform, LabelFrames[2], 0.032f, new Vector2(0.24f, 0.05f), theme.slate, TextAlignmentOptions.Center, true, WWFont.Heading);
            finder.AddComponent<PopIn>();
        }

        Transform Bar(string name, Vector3 localPosition, Vector2 size, Color color)
        {
            var go = new GameObject(name);
            go.layer = WWUI.UILayer;
            go.transform.SetParent(finder.transform, false);
            go.transform.localPosition = localPosition;
            go.transform.localScale = new Vector3(size.x, size.y, 1f);
            go.AddComponent<MeshFilter>().sharedMesh = Quad(color);
            var r = go.AddComponent<MeshRenderer>();
            r.sharedMaterial = WWTheme.I.uiPanel;
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            r.receiveShadows = false;
            return go.transform;
        }

        /// <summary>A one-metre square in one flat colour, sized by its transform. One mesh per colour, shared.</summary>
        static Mesh Quad(Color color)
        {
            if (quads.TryGetValue(color, out var cached) && cached != null) return cached;
            var c = color.linear;      // vertex colours are raw; convert so the bars match the theme colours
            var m = new Mesh { name = "ScanQuad", hideFlags = HideFlags.DontSave };
            m.SetVertices(new List<Vector3> { new Vector3(-0.5f, -0.5f, 0), new Vector3(0.5f, -0.5f, 0), new Vector3(0.5f, 0.5f, 0), new Vector3(-0.5f, 0.5f, 0) });
            m.SetColors(new List<Color> { c, c, c, c });
            m.SetTriangles(new[] { 0, 2, 1, 0, 3, 2 }, 0);
            m.RecalculateBounds();
            quads[color] = m;
            return m;
        }

        // ---------- small effects ----------

        IEnumerator Fade(float from, float to, float seconds)
        {
            for (float t = 0f; t < seconds; t += Time.deltaTime)
            {
                if (XRRig.I != null) XRRig.I.SetFade(Mathf.Lerp(from, to, t / seconds));
                yield return null;
            }
            if (XRRig.I != null) XRRig.I.SetFade(to);
        }

        // Rises past 1 and settles: the same "back" easing the panels pop in with.
        static float OutBack(float x)
        {
            const float c1 = 1.70158f, c3 = c1 + 1f;
            float y = Mathf.Clamp01(x) - 1f;
            return 1f + c3 * y * y * y + c1 * y * y;
        }

        void Sparkle(Vector3 position)
        {
            if (sparkles == null) sparkles = BuildSparkles();
            if (sparkles == null) return;
            sparkles.transform.position = position;
            sparkles.Emit(28);
        }

        ParticleSystem BuildSparkles()
        {
            var theme = WWTheme.I;
            if (theme == null || theme.particle == null) return null;
            var go = new GameObject("ToySparkles");
            go.transform.SetParent(transform, false);
            var ps = go.AddComponent<ParticleSystem>();
            ps.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            var main = ps.main;
            main.playOnAwake = false;
            main.loop = true;
            main.startLifetime = new ParticleSystem.MinMaxCurve(0.5f, 0.95f);
            main.startSpeed = new ParticleSystem.MinMaxCurve(0.5f, 1.4f);
            main.startSize = new ParticleSystem.MinMaxCurve(0.025f, 0.06f);
            main.startColor = new ParticleSystem.MinMaxGradient(new Color(1f, 0.96f, 0.72f, 1f), new Color(1f, 0.78f, 0.55f, 1f));
            main.gravityModifier = 0.3f;
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            main.maxParticles = 64;         // a small burst: transparent particles are costly on a Quest 2
            var emission = ps.emission;
            emission.enabled = false;       // particles are only ever sent out by Sparkle()
            var shape = ps.shape;
            shape.shapeType = ParticleSystemShapeType.Sphere;
            shape.radius = 0.1f;
            var fadeOut = ps.colorOverLifetime;
            fadeOut.enabled = true;
            var g = new Gradient();
            g.SetKeys(new[] { new GradientColorKey(Color.white, 0f), new GradientColorKey(Color.white, 1f) },
                      new[] { new GradientAlphaKey(1f, 0f), new GradientAlphaKey(1f, 0.5f), new GradientAlphaKey(0f, 1f) });
            fadeOut.color = new ParticleSystem.MinMaxGradient(g);
            var r = go.GetComponent<ParticleSystemRenderer>();
            r.sharedMaterial = theme.particle;
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            ps.Play();
            return ps;
        }
    }
}
