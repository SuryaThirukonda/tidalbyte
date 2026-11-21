using System;
using System.Collections.Generic;
using TMPro;
using UnityEngine;

namespace WishWorld
{
    /// <summary>
    /// Frost Slice: fruit arcs up in front of the player and each controller is a blade.
    /// A hit only counts when the blade is moving fast, so resting a blade on fruit does nothing.
    /// </summary>
    public class FrostSliceGame : MonoBehaviour
    {
        [Serializable]
        public class FruitKind
        {
            public string name;
            public GameObject whole, half;
            public Color juice = Color.red;
            public float radius = 0.055f;
            public int points = 10;
        }

        public enum Phase { Ready, Playing, Over }
        public static FrostSliceGame I { get; private set; }

        [Header("Assets")]
        public FruitKind[] fruits;
        public GameObject hazardPrefab;
        public GameObject bladePrefab;
        public ParticleSystem juicePrefab;

        [Header("Rules")]
        public float roundSeconds = 60f;
        public int startLives = 3;
        [Tooltip("Blade tip speed, in metres per second, needed for a cut.")]
        public float minSliceSpeed = 1.6f;
        [Tooltip("Only the first fruit type until the floor is proven; set true for all five plus hazards.")]
        public bool fullGame = true;
        [Tooltip("Rotation of the blade relative to the controller grip. Adjust after testing on the headset.")]
        public Vector3 bladeEuler = Vector3.zero;

        public Phase State { get; private set; } = Phase.Ready;
        public int Score { get; private set; }
        public int Lives { get; private set; }
        public int Best { get; private set; }
        public int SlicedCount { get; private set; }
        public float TimeLeft { get; private set; }
        public int MaxCombo { get; private set; }
        public Vector3? FirstFruitPosition => flying.Count > 0 ? flying[0].t.position : (Vector3?)null;
        public bool FirstFruitIsHazard => flying.Count > 0 && flying[0].hazard;
        public int FlyingCount => flying.Count;

        class Flying
        {
            public Transform t; public Vector3 start, target, spin; public float time, apexTime, gravity, v0y, radius;
            public int kind; public bool hazard;
        }
        class Debris { public Transform t; public Vector3 vel, spin; public float life; }
        class Popup { public TextMeshPro text; public float life; }
        const float PopupLife = 1.0f;
        class Blade { public Transform root, tip; public Vector3 prevTip, prevBase; public bool hasPrev; public float lastSlice; public int combo; public bool left; }

        readonly List<Flying> flying = new List<Flying>();
        readonly List<Debris> debris = new List<Debris>();
        readonly List<Popup> popups = new List<Popup>();
        readonly Blade[] blades = new Blade[2];
        readonly Queue<float> pendingLaunch = new Queue<float>();
        ParticleSystem juice;
        GameObject menu, hud;
        TextMeshPro menuTitle, menuInfo, hudScore, hudTime, hudLives;
        WWButton startButton;
        float nextWave, roundTime;
        System.Random rng = new System.Random();
        const string BestKey = "FrostSliceBest";

        void Awake()
        {
            I = this;
            Best = PlayerPrefs.GetInt(BestKey, 0);
        }
        void OnDestroy() { if (I == this) I = null; }

        System.Collections.IEnumerator Start()
        {
            yield return null;
            yield return null;
            var rig = XRRig.I;
            rig.Recenter(transform, false);
            for (int i = 0; i < 2; i++)
            {
                var hand = rig.Hand(i == 0);
                var go = Instantiate(bladePrefab, hand);
                go.transform.localPosition = Vector3.zero;
                go.transform.localRotation = Quaternion.Euler(bladeEuler);
                blades[i] = new Blade { root = go.transform, tip = go.transform.Find("Tip"), left = i == 0 };
                go.SetActive(false);
            }
            if (juicePrefab != null) juice = Instantiate(juicePrefab, transform);
            BuildUi();
            ShowMenu("Frost Slice", "Swing the controllers to slice the fruit.\nLeave the ice blocks alone!", "Start");
            GuideVoice.Read(VoiceLines.FrostIntro);
        }

        void BuildUi()
        {
            var theme = WWTheme.I;
            menu = WWUI.Panel(transform, "Menu", new Vector2(0.9f, 0.56f), theme.panel, 0.05f, 0.008f);
            menu.AddComponent<PopIn>();
            menu.transform.localPosition = new Vector3(0, 1.4f, 1.35f);
            menuTitle = WWUI.Label(menu.transform, "", 0.085f, new Vector2(0.7f, 0.12f), theme.slate, TextAlignmentOptions.Center, true, WWFont.Title);
            menuTitle.transform.localPosition = new Vector3(0, 0.185f, -0.004f);
            menuInfo = WWUI.Label(menu.transform, "", 0.05f, new Vector2(0.82f, 0.18f), theme.slate);
            menuInfo.transform.localPosition = new Vector3(0, 0.03f, -0.004f);
            startButton = WWUI.Button(menu.transform, "Start", new Vector2(0.34f, 0.13f), StartRound, 0.05f, theme.peach);
            startButton.transform.localPosition = new Vector3(-0.2f, -0.17f, -0.006f);
            WWUI.Button(menu.transform, "Hub", new Vector2(0.34f, 0.13f), () => SceneLoader.GoHub(), 0.05f)
                .transform.localPosition = new Vector3(0.2f, -0.17f, -0.006f);

            // Score panel floats above and behind where the fruit comes from, out of the swing zone.
            hud = WWUI.Panel(transform, "Score", new Vector2(1.1f, 0.3f), theme.panel, 0.05f, 0.008f);
            hud.AddComponent<PopIn>();
            hud.transform.localPosition = new Vector3(0, 2.05f, 2.5f);
            hud.transform.localRotation = Quaternion.Euler(-12f, 0, 0);
            hudScore = WWUI.Label(hud.transform, "", 0.1f, new Vector2(0.4f, 0.2f), theme.slate, TextAlignmentOptions.Center, true, WWFont.Plain);
            hudScore.transform.localPosition = new Vector3(0, 0, -0.004f);
            hudTime = WWUI.Label(hud.transform, "", 0.06f, new Vector2(0.3f, 0.2f), theme.slate, TextAlignmentOptions.Left, true, WWFont.Plain);
            hudTime.transform.localPosition = new Vector3(-0.36f, 0, -0.004f);
            hudLives = WWUI.Label(hud.transform, "", 0.06f, new Vector2(0.3f, 0.2f), theme.slate, TextAlignmentOptions.Right, true, WWFont.Plain);
            hudLives.transform.localPosition = new Vector3(0.36f, 0, -0.004f);
            hud.SetActive(false);
        }

        void ShowMenu(string title, string info, string button)
        {
            menu.SetActive(true);
            menuTitle.text = title;
            menuInfo.text = info;
            startButton.label = button;
            startButton.GetComponentInChildren<TextMeshPro>().text = button;
            if (XRRig.I != null) XRRig.I.pointersEnabled = true;
            foreach (var b in blades) if (b != null) b.root.gameObject.SetActive(false);
        }

        public void StartRound()
        {
            foreach (var f in flying) if (f.t != null) Destroy(f.t.gameObject);
            flying.Clear();
            pendingLaunch.Clear();
            Score = 0; SlicedCount = 0; MaxCombo = 0;
            Lives = startLives;
            TimeLeft = roundSeconds;
            roundTime = 0;
            nextWave = 0.8f;
            State = Phase.Playing;
            menu.SetActive(false);
            hud.SetActive(true);
            if (XRRig.I != null) XRRig.I.pointersEnabled = false;
            foreach (var b in blades) { b.root.gameObject.SetActive(true); b.hasPrev = false; b.combo = 0; }
            UpdateHud();
            GuideVoice.SayNow(fullGame ? "Slice the fruit! Leave the ice alone." : "Slice the fruit!");     // cuts off the menu being read
        }

        void EndRound(string title)
        {
            State = Phase.Over;
            bool newBest = Score > Best;
            if (newBest) { Best = Score; PlayerPrefs.SetInt(BestKey, Best); PlayerPrefs.Save(); }
            hud.SetActive(false);
            Sfx.Play(Sfx.Success, transform.position + Vector3.up * 1.4f, 0.6f);
            ShowMenu(title, "Score " + Score + "\nBest " + Best + (newBest ? "  (new best!)" : ""), "Play again");
            GuideVoice.Read(title + " Score " + Score + ". Best " + Best + ".");
            GuideVoice.Say(newBest ? "A new best score! Amazing slicing." : "Nice slicing! Want another go?");
        }

        void Update()
        {
            float dt = Time.deltaTime;
            UpdateDebris(dt);
            UpdatePopups(dt);
            if (State != Phase.Playing) return;

            roundTime += dt;
            TimeLeft -= dt;
            if (TimeLeft <= 0) { TimeLeft = 0; UpdateHud(); EndRound("Time!"); return; }

            // Waves: a few fruit close together, then a pause that shortens as the round goes on.
            nextWave -= dt;
            if (nextWave <= 0 && !debugNoWaves)
            {
                float progress = roundTime / roundSeconds;
                int count = 1 + rng.Next(0, progress < 0.3f ? 2 : progress < 0.7f ? 3 : 4);
                for (int i = 0; i < count; i++) pendingLaunch.Enqueue(roundTime + i * 0.28f);
                nextWave = Mathf.Lerp(2.6f, 1.7f, progress) + count * 0.28f;
            }
            while (pendingLaunch.Count > 0 && pendingLaunch.Peek() <= roundTime) { pendingLaunch.Dequeue(); Launch(); }

            UpdateFlying(dt);
            UpdateBlades(dt);
            hudTime.text = Mathf.CeilToInt(TimeLeft) + "s";
        }

        float Rand(float a, float b) => a + (float)rng.NextDouble() * (b - a);

        void Launch(int force = 0, Vector3? localTarget = null)
        {
            // force: 0 = normal rules, 1 = always fruit, 2 = always a hazard (used by editor checks)
            bool hazard = force == 2 || (force == 0 && fullGame && hazardPrefab != null && roundTime > 8f && rng.NextDouble() < 0.16);
            int kind = fullGame ? rng.Next(fruits.Length) : 0;
            var prefab = hazard ? hazardPrefab : fruits[kind].whole;
            var go = Instantiate(prefab, transform);
            var f = new Flying
            {
                t = go.transform, kind = kind, hazard = hazard,
                radius = hazard ? 0.075f : fruits[kind].radius,
                // From the front only: thrown from 1.5 to 2 m ahead, peaking inside arm's reach.
                start = transform.TransformPoint(new Vector3(Rand(-0.45f, 0.45f), 0.35f, Rand(1.5f, 2.0f))),
                target = transform.TransformPoint(new Vector3(Rand(-0.38f, 0.38f), Rand(1.1f, 1.55f), Rand(0.45f, 0.62f))),
                apexTime = Rand(1.0f, 1.25f),
                spin = new Vector3(Rand(-180, 180), Rand(-180, 180), Rand(-180, 180)),
            };
            // Gentle custom gravity so the fruit hangs near its peak, where it can be reached.
            f.gravity = 2f * (f.target.y - f.start.y) / (f.apexTime * f.apexTime);
            f.v0y = f.gravity * f.apexTime;
            if (localTarget.HasValue) f.target = transform.TransformPoint(localTarget.Value);
            f.gravity = 2f * (f.target.y - f.start.y) / (f.apexTime * f.apexTime);
            f.v0y = f.gravity * f.apexTime;
            go.transform.position = f.start;
            flying.Add(f);
            BlobShadow.Attach(go.transform, transform.position.y, f.radius * 1.3f, 2.2f, transform);
            Sfx.Play(Sfx.Pop, f.start, 0.35f);
        }

        void UpdateFlying(float dt)
        {
            for (int i = flying.Count - 1; i >= 0; i--)
            {
                var f = flying[i];
                f.time += dt;
                float u = Mathf.Clamp01(f.time / f.apexTime);
                float ease = 1f - (1f - u) * (1f - u);
                var p = Vector3.Lerp(f.start, f.target, ease);
                p.y = f.start.y + f.v0y * f.time - 0.5f * f.gravity * f.time * f.time;
                f.t.position = p;
                f.t.Rotate(f.spin * dt, Space.Self);
                if (p.y < transform.position.y + 0.15f && f.time > f.apexTime)
                {
                    Destroy(f.t.gameObject);
                    flying.RemoveAt(i);
                }
            }
        }

        void UpdateBlades(float dt)
        {
            foreach (var b in blades)
            {
                if (b == null || !b.root.gameObject.activeInHierarchy) { if (b != null) b.hasPrev = false; continue; }
                Vector3 tip = b.tip.position, bas = b.root.position;
                if (b.hasPrev && dt > 0)
                {
                    var move = tip - b.prevTip;
                    float speed = move.magnitude / dt;
                    if (speed >= minSliceSpeed)
                    {
                        for (int i = flying.Count - 1; i >= 0; i--)
                        {
                            var f = flying[i];
                            var c = f.t.position;
                            float reach = f.radius + 0.025f;
                            // The blade now, plus the paths five points along it swept since the last frame,
                            // so a fast swing cannot pass through fruit between two frames.
                            bool hit = DistToSegment(c, bas, tip) < reach;
                            for (int k = 0; k <= 4 && !hit; k++)
                            {
                                float u = k / 4f;
                                hit = DistToSegment(c, Vector3.Lerp(b.prevBase, b.prevTip, u), Vector3.Lerp(bas, tip, u)) < reach;
                            }
                            if (hit)
                            {
                                Slice(f, b, move.normalized, (tip - bas).normalized);
                                flying.RemoveAt(i);
                            }
                        }
                    }
                }
                b.prevTip = tip; b.prevBase = bas; b.hasPrev = true;
            }
        }

        static float DistToSegment(Vector3 p, Vector3 a, Vector3 b)
        {
            var ab = b - a;
            float t = Mathf.Clamp01(Vector3.Dot(p - a, ab) / Mathf.Max(1e-6f, ab.sqrMagnitude));
            return Vector3.Distance(p, a + ab * t);
        }

        void Slice(Flying f, Blade b, Vector3 swing, Vector3 bladeDir)
        {
            var pos = f.t.position;
            Destroy(f.t.gameObject);
            WWInput.Haptic(b.left, f.hazard ? 1f : 0.6f, f.hazard ? 0.25f : 0.06f);

            if (f.hazard)
            {
                Lives--;
                Sfx.Play(Sfx.Buzz, pos, 0.7f);
                AddPopup(pos, "Ouch!", new Color(0.85f, 0.2f, 0.2f));
                Burst(pos, new Color(0.75f, 0.9f, 1f));
                UpdateHud();
                if (Lives <= 0) EndRound("Out of lives");
                return;
            }

            var kind = fruits[f.kind];
            // Combo: several fruit in one swing of the same blade.
            b.combo = Time.time - b.lastSlice < 0.3f ? b.combo + 1 : 1;
            b.lastSlice = Time.time;
            MaxCombo = Mathf.Max(MaxCombo, b.combo);
            int gained = kind.points * b.combo;
            Score += gained;
            SlicedCount++;
            Sfx.Play(Sfx.Slice, pos, 0.8f);
            AddPopup(pos, b.combo > 1 ? "Combo x" + b.combo + "  +" + gained : "+" + gained, WWTheme.I.slate);
            if (b.combo == 3) GuideVoice.Say("What a swing!");
            Burst(pos, kind.juice);

            // Two pre-made halves fly apart, across the cut.
            var normal = Vector3.Cross(swing, bladeDir);
            if (normal.sqrMagnitude < 1e-4f) normal = Vector3.up;
            normal.Normalize();
            for (int s = -1; s <= 1; s += 2)
            {
                var h = Instantiate(kind.half, pos + normal * (s * kind.radius * 0.25f), Quaternion.FromToRotation(Vector3.up, normal * s), transform);
                debris.Add(new Debris
                {
                    t = h.transform, life = 1.3f,
                    vel = swing * 1.3f + normal * (s * 0.9f) + Vector3.up * 0.5f,
                    spin = new Vector3(Rand(-300, 300), Rand(-300, 300), Rand(-300, 300)),
                });
            }
            UpdateHud();
        }

        void Burst(Vector3 pos, Color color)
        {
            if (juice == null) return;
            var ep = new ParticleSystem.EmitParams { position = pos, startColor = color };
            ep.applyShapeToPosition = true;
            juice.Emit(ep, 14);
        }

        void UpdateDebris(float dt)
        {
            for (int i = debris.Count - 1; i >= 0; i--)
            {
                var d = debris[i];
                d.life -= dt;
                if (d.life <= 0 || d.t == null) { if (d.t != null) Destroy(d.t.gameObject); debris.RemoveAt(i); continue; }
                d.vel += Vector3.down * (6f * dt);
                d.t.position += d.vel * dt;
                d.t.Rotate(d.spin * dt, Space.Self);
                if (d.life < 0.3f) d.t.localScale *= 1f - dt * 3f;
            }
        }

        void AddPopup(Vector3 pos, string text, Color color)
        {
            var label = WWUI.Label(transform, text, 0.05f, new Vector2(0.6f, 0.08f), color, TextAlignmentOptions.Center, false, WWFont.Heading);
            WWUI.Backdrop(label, null, 0.022f);
            label.transform.position = pos + Vector3.up * 0.08f;
            if (XRRig.I != null) label.transform.rotation = Quaternion.LookRotation(label.transform.position - XRRig.I.HeadPosition, Vector3.up);
            label.transform.rotation *= Quaternion.Euler(0, 0, UnityEngine.Random.Range(-9f, 9f));     // each one lands at its own tilt
            label.transform.localScale = Vector3.one * 0.3f;
            popups.Add(new Popup { text = label, life = PopupLife });
            if (hudScore != null)
            {
                var kick = hudScore.GetComponent<PopIn>();
                if (kick == null) kick = hudScore.gameObject.AddComponent<PopIn>();
                kick.Kick(0.22f);
            }
        }

        void UpdatePopups(float dt)
        {
            for (int i = popups.Count - 1; i >= 0; i--)
            {
                var p = popups[i];
                p.life -= dt;
                if (p.life <= 0) { Destroy(p.text.gameObject); popups.RemoveAt(i); continue; }
                float age = PopupLife - p.life;
                // pops up past full size, settles, then drifts up and fades
                float grow = Mathf.Clamp01(age / 0.16f);
                float size = age < 0.16f ? Mathf.Lerp(0.3f, 1.25f, grow) : Mathf.Lerp(1.25f, 1f, Mathf.Clamp01((age - 0.16f) / 0.12f));
                p.text.transform.localScale = Vector3.one * size;
                p.text.transform.position += Vector3.up * ((age < 0.28f ? 0.08f : 0.3f) * dt);
                p.text.alpha = Mathf.Clamp01(p.life / 0.35f);
            }
        }

        void UpdateHud()
        {
            hudScore.text = Score.ToString();
            hudTime.text = Mathf.CeilToInt(TimeLeft) + "s";
            hudLives.text = "Lives " + Mathf.Max(0, Lives);
        }

        /// <summary>For checks in the editor: read one item in the air. phase is 1 at the top of its arc.</summary>
        public bool DebugFruit(int i, out Vector3 position, out bool hazard, out float phase)
        {
            position = default; hazard = false; phase = 0;
            if (i < 0 || i >= flying.Count || flying[i].t == null) return false;
            position = flying[i].t.position; hazard = flying[i].hazard; phase = flying[i].time / flying[i].apexTime;
            return true;
        }
        public float RoundTime => roundTime;

        /// <summary>For checks in the editor: jump the clock to near the end of the round.</summary>
        public void DebugSetTimeLeft(float seconds) { TimeLeft = seconds; }
        /// <summary>For checks in the editor: throw one item now.</summary>
        public void DebugLaunch(bool hazard = false, Vector3? localTarget = null) { if (State == Phase.Playing) Launch(hazard ? 2 : 1, localTarget); }
        /// <summary>For checks in the editor: stop the automatic waves so one item can be tested alone.</summary>
        [NonSerialized] public bool debugNoWaves;
    }
}
