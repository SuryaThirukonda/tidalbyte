using System.Collections;
using System.Collections.Generic;
using TMPro;
using UnityEngine;

namespace WishWorld
{
    /// <summary>
    /// Runs the single World scene: loads any world definition, in VR or in the real room (AR),
    /// applies commands from the CommandRouter, and shows the collection counter and quiz.
    /// </summary>
    public class WorldController : MonoBehaviour
    {
        public const int MaxPerEntry = 30, MaxTotal = 60;
        public static WorldController I { get; private set; }

        public Light sun;
        public Renderer ground, platform;
        public Transform creatureRoot;

        public WorldMode Mode { get; private set; }
        public WorldState State { get; private set; } = new WorldState();
        public int LiveCount => live.Count;
        public bool Ready { get; private set; }

        readonly List<Creature> live = new List<Creature>();
        readonly Stack<WorldState> undo = new Stack<WorldState>();
        static readonly int BaseColor = Shader.PropertyToID("_BaseColor");

        WorldLibrary lib;
        Material sky;
        AudioSource ambient;
        GameObject snow;
        GameObject scenery;
        string sceneryPath;
        Quaternion sunHome;
        string skyWorld;
        GameObject infoPanel;
        TextMeshPro titleLabel, counterLabel;
        WishMenu wishMenu;
        QuizPanel quiz;
        GameObject guide;
        MaterialPropertyBlock mpb;

        public Vector3 Floor => transform.position;
        public Vector3 Forward => transform.forward;
        public Vector3 Right => transform.right;

        void Awake()
        {
            I = this;
            lib = WorldLibrary.I;
            mpb = new MaterialPropertyBlock();
            ambient = gameObject.AddComponent<AudioSource>();
            ambient.loop = true;
            ambient.volume = 0.22f;
            ambient.spatialBlend = 0f;
            if (lib.skyMaterial != null) sky = new Material(lib.skyMaterial);
            if (sun != null) sunHome = sun.transform.rotation;
            gameObject.AddComponent<CommandRouter>();
            gameObject.AddComponent<WishVoice>();
            gameObject.AddComponent<ToyScan>();
        }

        void OnDestroy()
        {
            if (I == this) I = null;
            if (sky != null) Destroy(sky);
        }

        IEnumerator Start()
        {
            yield return null;
            yield return null;
            if (XRRig.I != null) XRRig.I.Recenter(transform, false);
            Mode = AppState.pendingMode;
            BuildHud();

            if (Mode == WorldMode.VR)
            {
                LoadWorld(string.IsNullOrEmpty(AppState.pendingWorldId) ? "aquarium" : AppState.pendingWorldId);
                var def = lib.FindWorld(State.worldId);
                if (def != null) GuideVoice.Say(def.guideIntro);
            }
            else
            {
                State.ar = Mode == WorldMode.AR;
                State.worldId = Mode == WorldMode.Wish ? "blank" : "";
                GuideVoice.Say(Mode == WorldMode.AR
                    ? "This is your room. Say or pick what should visit!"
                    : "What do you wish for? Say it, or pick from the menu.");
                KeepToys();      // a toy scanned earlier in the session comes along here too
            }
            Rebuild();
            Ready = true;
            if (!string.IsNullOrEmpty(AppState.pendingCommand))
            {
                var cmd = AppState.pendingCommand;
                AppState.pendingCommand = null;
                CommandRouter.I.Execute(cmd);
            }
        }

        // ---------- commands (called by the CommandRouter between Begin and Commit) ----------

        public void Begin() { undo.Push(State.Clone()); }
        public void Commit() { Rebuild(); }

        public bool LoadWorld(string id)
        {
            var def = lib.FindWorld(id);
            if (def == null) return false;
            State.worldId = id;
            State.entries.Clear();
            State.snow = false;
            State.night = false;
            foreach (var e in def.creatures)
                if (e.creature != null) State.entries.Add(new WorldState.Entry { creatureId = e.creature.id, count = e.count });
            KeepToys();
            return true;
        }

        /// <summary>
        /// A scanned toy goes wherever the child goes. Anything that replaces the list of creatures (a new world,
        /// "clear", "undo") calls this, so the toys are put back before the world is built.
        /// </summary>
        void KeepToys()
        {
            foreach (var t in lib.ScannedToys())
                if (State.Find(t.id) == null) State.entries.Add(new WorldState.Entry { creatureId = t.id, count = 1 });
        }

        public void AddCreature(string creatureId)
        {
            var def = lib.FindCreature(creatureId);
            if (def == null) return;
            var e = State.Find(creatureId);
            if (def.toy)
            {
                // There is only ever one of the child's toy.
                if (e == null) State.entries.Add(new WorldState.Entry { creatureId = creatureId, count = 1 });
                return;
            }
            if (e == null) State.entries.Add(new WorldState.Entry { creatureId = creatureId, count = Mathf.Max(1, def.addCount) });
            else e.count = Mathf.Min(MaxPerEntry, e.count + Mathf.Max(1, def.addCount));
        }

        /// <summary>
        /// Bring a prepared toy into the world, as the end of "scan a toy". It is remembered for the session, so it
        /// is still there after a world change. Returns the toy now in the scene.
        /// </summary>
        public Creature AddToy(string toyId)
        {
            var def = lib.FindToy(toyId);
            if (def == null) return null;
            AppState.scannedToyIds.Add(toyId);
            AppState.lastToyId = toyId;
            Begin();
            KeepToys();
            Commit();
            if (wishMenu != null) wishMenu.Refresh();
            foreach (var c in live) if (c != null && c.def == def) return c;
            return null;
        }

        IEnumerable<WorldState.Entry> Targets(List<string> ids)
        {
            foreach (var e in State.entries)
                if (ids == null || ids.Count == 0 || ids.Contains(e.creatureId)) yield return e;
        }

        public void SetColor(List<string> ids, string color) { foreach (var e in Targets(ids)) e.color = color; }

        public void ChangeAmount(List<string> ids, string word)
        {
            foreach (var e in Targets(ids))
            {
                if (lib.FindToy(e.creatureId) != null) continue;      // only ever one of the child's toy
                if (word == "more") e.count += Mathf.Max(2, e.count / 2);
                else if (word == "lots") e.count = Mathf.Max(e.count * 3, 12);
                else if (word == "fewer") e.count = Mathf.Max(1, e.count / 2);
                e.count = Mathf.Clamp(e.count, 1, MaxPerEntry);
            }
        }

        public void ChangeSize(List<string> ids, string word)
        {
            foreach (var e in Targets(ids))
            {
                if (word == "bigger") e.scale *= 1.4f;
                else if (word == "smaller") e.scale *= 0.7f;
                else if (word == "giant") e.scale = 2.5f;
                else if (word == "tiny") e.scale = 0.4f;
                e.scale = Mathf.Clamp(e.scale, 0.3f, 3f);
            }
        }

        public void SetSnow(bool on) { State.snow = on; }
        public void SetNight(bool on) { State.night = on; }
        public void SetAR(bool on) { State.ar = on; }
        public void Clear() { State.entries.Clear(); State.snow = false; KeepToys(); }

        public bool Undo()
        {
            if (undo.Count == 0) return false;
            State = undo.Pop();
            KeepToys();
            Rebuild();
            return true;
        }

        // ---------- the scan view (see ToyScan) ----------

        bool scanView;

        /// <summary>
        /// While a toy is being "scanned" the world steps aside: creatures, panels and the guide are hidden and the
        /// real room is shown, the same way "in my room" shows it. Switching it off puts everything back.
        /// This is a view, not a command: the state is untouched and nothing is added to undo.
        /// </summary>
        public void SetScanView(bool on)
        {
            if (scanView == on) return;
            scanView = on;
            if (on) FactCardPanel.Hide();
            if (creatureRoot != null) creatureRoot.gameObject.SetActive(!on);
            if (infoPanel != null) infoPanel.SetActive(!on);
            if (wishMenu != null) wishMenu.gameObject.SetActive(!on);
            if (guide != null) guide.SetActive(!on);
            if (quiz != null) quiz.gameObject.SetActive(!on);
            ApplyEnvironment(lib.FindWorld(State.worldId));
        }

        // ---------- building the world from the state ----------

        void Rebuild()
        {
            foreach (var c in live) if (c != null) Destroy(c.gameObject);
            live.Clear();
            FactCardPanel.Hide();

            var def = lib.FindWorld(State.worldId);
            ApplyEnvironment(def);

            var ctx = new Spawner.Context { playerFloor = Floor, forward = Forward, ar = State.ar, parent = creatureRoot,
                                            shadows = State.ar || (def != null && def.ground == GroundMode.Full) };
            foreach (var e in State.entries)
            {
                var w = lib.FindCreature(e.creatureId);
                if (w != null && w.moveType == MoveType.Walk && !w.toy) ctx.walkerTotal += e.count;
            }
            int total = 0;
            foreach (var e in State.entries)
            {
                var cdef = lib.FindCreature(e.creatureId);
                if (cdef == null) continue;
                int count = Mathf.Min(e.count, MaxTotal - total);
                if (count <= 0) break;
                total += count;
                var spawned = Spawner.Spawn(cdef, count, e.scale, ctx);
                for (int i = 0; i < spawned.Count; i++)
                {
                    if (string.IsNullOrEmpty(e.color)) continue;
                    if (e.color == "rainbow") spawned[i].SetTint(Color.HSVToRGB(i / (float)Mathf.Max(1, spawned.Count), 0.75f, 1f), true);
                    else if (CommandParser.ColorValues.TryGetValue(e.color, out var col)) spawned[i].SetTint(col, true);
                }
                live.AddRange(spawned);
            }
            UpdateHud(def);
        }

        void ApplyEnvironment(WorldDefinition def)
        {
            // The scan view borrows the real-room look: no scenery, ground or sky, and passthrough on.
            bool ar = State.ar || scanView;
            if (PassthroughToggle.I != null && PassthroughToggle.I.IsOn != ar) PassthroughToggle.I.Set(ar);
            float dim = State.night ? 0.3f : 1f;

            Color lightColor = def != null ? def.lightColor : Color.white;
            float lightIntensity = def != null ? def.lightIntensity : 1f;
            Color ambientColor = def != null ? def.ambientColor : new Color(0.62f, 0.62f, 0.62f);
            if (ar) { lightColor = Color.white; lightIntensity = 1f; ambientColor = new Color(0.62f, 0.62f, 0.62f); }

            if (sun != null)
            {
                sun.color = lightColor; sun.intensity = lightIntensity * dim;
                bool own = !ar && def != null && def.sunDirection.sqrMagnitude > 0.01f;
                sun.transform.rotation = own ? transform.rotation * Quaternion.LookRotation(def.sunDirection) : sunHome;
            }
            // "In my room" unloads the surroundings. The scan view only hides them: it lasts a few seconds, and
            // loading a whole landscape again when it ends would make the headset stutter.
            ApplyScenery(!State.ar && def != null ? def.scenery : null);
            if (scenery != null) scenery.SetActive(!scanView);
            WWEnv.SetAmbient(ambientColor * (State.night ? 0.45f : 1f));

            if (def != null && sky != null)
            {
                if (skyWorld != def.id)
                {
                    skyWorld = def.id;
                    string wanted = def.id;
                    Services.Skybox.Generate(def.id, def.skyPrompt, tex =>
                    {
                        if (tex != null && sky != null && skyWorld == wanted) sky.SetTexture("_MainTex", tex);
                    });
                }
                sky.SetFloat("_Exposure", State.night ? 0.28f : 1f);
                RenderSettings.skybox = sky;
            }

            RenderSettings.fog = !ar && def != null && def.fogEnd > 0f;
            if (RenderSettings.fog)
            {
                RenderSettings.fogMode = FogMode.Linear;
                RenderSettings.fogColor = def.fogColor * dim;
                RenderSettings.fogStartDistance = def.fogEnd * def.fogStart;
                RenderSettings.fogEndDistance = def.fogEnd;
            }

            var mode = def != null ? def.ground : GroundMode.None;
            // Surroundings bring their own ground, so the plain disc and platform are only for worlds without any.
            SetGround(ground, !ar && mode == GroundMode.Full && scenery == null, def);
            SetGround(platform, !ar && mode == GroundMode.Platform && scenery == null, def);

            var clip = (def != null && !ar) ? Sfx.Ambient(def.ambientKind) : null;
            if (ambient.clip != clip)
            {
                ambient.Stop();
                ambient.clip = clip;
                if (clip != null) ambient.Play();
            }

            if (State.snow && snow == null && lib.snowPrefab != null)
            {
                snow = Instantiate(lib.snowPrefab, Floor + Vector3.up * 3.2f, lib.snowPrefab.transform.rotation, transform);
            }
            if (snow != null) snow.SetActive(State.snow && !scanView);
        }

        /// <summary>Swap the surroundings (terrain and props to the horizon). Only one world's set is in memory at a time.</summary>
        void ApplyScenery(string path)
        {
            if (path == sceneryPath) return;
            sceneryPath = path;
            if (scenery != null) { Destroy(scenery); scenery = null; }
            if (!string.IsNullOrEmpty(path))
            {
                var prefab = Resources.Load<GameObject>(path);
                if (prefab != null)
                {
                    scenery = Instantiate(prefab, transform);
                    scenery.transform.localPosition = Vector3.zero;
                    scenery.transform.localRotation = Quaternion.identity;
                }
            }
            Resources.UnloadUnusedAssets();
        }

        void SetGround(Renderer r, bool on, WorldDefinition def)
        {
            if (r == null) return;
            r.gameObject.SetActive(on);
            if (!on || def == null) return;
            r.GetPropertyBlock(mpb);
            mpb.SetColor(BaseColor, def.groundColor);
            r.SetPropertyBlock(mpb);
        }

        // ---------- heads-up panels ----------

        void BuildHud()
        {
            var theme = WWTheme.I;
            infoPanel = WWUI.Panel(transform, "InfoPanel", new Vector2(0.62f, 0.4f), theme.panel, 0.045f, 0.008f);
            infoPanel.transform.position = Floor + Forward * 1.15f - Right * 0.95f + Vector3.up * 1.12f;
            WWUI.FaceHead(infoPanel.transform, Floor + Vector3.up * 1.5f);
            infoPanel.transform.rotation *= Quaternion.Euler(12f, 0, 0);

            infoPanel.AddComponent<PopIn>();
            titleLabel = WWUI.Label(infoPanel.transform, "", 0.06f, new Vector2(0.5f, 0.085f), theme.slate, TextAlignmentOptions.Center, true, WWFont.Title);
            titleLabel.transform.localPosition = new Vector3(0, 0.125f, -0.004f);
            counterLabel = WWUI.Label(infoPanel.transform, "", 0.04f, new Vector2(0.56f, 0.07f), theme.slate);
            counterLabel.transform.localPosition = new Vector3(0, 0.04f, -0.004f);

            var home = WWUI.Button(infoPanel.transform, "Home", new Vector2(0.24f, 0.11f), () => SceneLoader.GoHub(), 0.042f);
            home.transform.localPosition = new Vector3(-0.14f, -0.105f, -0.006f);
            var finish = WWUI.Button(infoPanel.transform, "Finish", new Vector2(0.24f, 0.11f), StartQuiz, 0.042f, theme.peach);
            finish.transform.localPosition = new Vector3(0.14f, -0.105f, -0.006f);

            if (Mode != WorldMode.VR)
            {
                var go = new GameObject("WishMenu");
                go.transform.SetParent(transform, false);
                go.transform.position = Floor + Forward * 1.15f + Right * 1.0f + Vector3.up * 1.2f;
                WWUI.FaceHead(go.transform, Floor + Vector3.up * 1.5f);
                wishMenu = go.AddComponent<WishMenu>();
            }

            if (lib.guidePrefab != null)
            {
                guide = Instantiate(lib.guidePrefab, transform);
                guide.transform.position = Floor + Forward * 1.5f - Right * 1.55f;
                guide.transform.rotation = Quaternion.LookRotation(Floor - guide.transform.position, Vector3.up);
                guide.transform.localScale = lib.guidePrefab.transform.localScale * 0.6f;
            }
        }

        void UpdateHud(WorldDefinition def)
        {
            if (titleLabel == null) return;
            titleLabel.text = def != null && def.showInMenu ? def.displayName : State.ar ? "My room" : "Wish world";
            counterLabel.text = CounterText();
        }

        public int FoundCount()
        {
            int n = 0;
            foreach (var e in State.entries) if (AppState.learned.Contains(e.creatureId)) n++;
            return n;
        }

        public string CounterText()
        {
            int total = State.entries.Count;
            return total == 0 ? "Nothing here yet" : FoundCount() + " of " + total + " found";
        }

        public void OnLearned(CreatureDefinition def, bool isNew)
        {
            if (counterLabel != null)
            {
                counterLabel.text = CounterText();
                if (isNew) Kick(counterLabel);          // the count jumps when it goes up
            }
            if (isNew && State.entries.Count > 1 && FoundCount() == State.entries.Count)
                GuideVoice.Say("You found them all! Press Finish for a quiz.");
            // Touched again, a toy has something friendly to say after its card.
            if (!isNew && def != null && def.toy) GuideVoice.Say(VoiceLines.NextToyFriendly());
        }

        static void Kick(TextMeshPro label)
        {
            var p = label.GetComponent<PopIn>();
            if (p == null) p = label.gameObject.AddComponent<PopIn>();
            p.Kick(0.35f);
        }

        public void SetStatus(string text) { if (wishMenu != null) wishMenu.SetStatus(text); }

        public void StartQuiz()
        {
            if (quiz == null)
            {
                var go = new GameObject("QuizPanel");
                go.transform.SetParent(transform, false);
                go.transform.position = Floor + Forward * 1.25f + Vector3.up * 1.55f;
                go.transform.rotation = Quaternion.LookRotation(Forward, Vector3.up);
                quiz = go.AddComponent<QuizPanel>();
            }
            var defs = new List<CreatureDefinition>();
            foreach (var e in State.entries)
            {
                var c = lib.FindCreature(e.creatureId);
                if (c != null && !string.IsNullOrEmpty(c.quizQuestion)) defs.Add(c);
            }
            quiz.Begin(defs, FoundCount(), State.entries.Count);
        }
    }
}
