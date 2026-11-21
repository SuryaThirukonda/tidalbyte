#if UNITY_EDITOR
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Text;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace WishWorld.DebugTools
{
    /// <summary>
    /// Editor-only scripted check of "scan a toy". Run it in Play mode with the World scene loaded in wish mode
    /// (ToyScanCheck.Run()). It sends the same command text the menu and the voice send, waits through the
    /// sequence, and writes what it saw to <see cref="Result"/> and screenshots to Logs/verification/toy.
    /// Each line of the result starts with PASS or FAIL.
    /// </summary>
    public static class ToyScanCheck
    {
        public const string Folder = "Logs/verification/toy";
        public static string Result = "";
        public static bool Running { get; private set; }

        static readonly StringBuilder log = new StringBuilder();
        static readonly List<string> captions = new List<string>();
        static int failures;

        /// <param name="say">What to "say" when the guide asks for a name on the second scan. The first scan says nothing.</param>
        public static void Run(string say = "hi, my name's Sam!")
        {
            if (Running || DebugDriver.I == null) return;
            DebugDriver.I.StartCoroutine(Routine(say));
        }

        static void Check(bool ok, string what)
        {
            if (!ok) failures++;
            log.Append(ok ? "PASS " : "FAIL ").Append(what).Append('\n');
        }

        static Creature Toy(string id)
        {
            Creature found = null;
            foreach (var c in Object.FindObjectsByType<Creature>(FindObjectsSortMode.None))
                if (c.def != null && c.def.id == id && c.gameObject.activeInHierarchy) found = c;
            return found;
        }

        static int ToyCount(string id)
        {
            int n = 0;
            foreach (var c in Object.FindObjectsByType<Creature>(FindObjectsSortMode.None))
                if (c.def != null && c.def.id == id) n++;
            return n;
        }

        /// <summary>Every button on the Creatures tab, across its pages.</summary>
        static IEnumerator CreatureButtons(List<string> into)
        {
            var menu = Object.FindFirstObjectByType<WishMenu>();
            if (menu == null) yield break;
            menu.SelectTab(1);
            for (int page = 0; page < 8; page++)
            {
                yield return null;
                WWButton more = null;
                foreach (var b in menu.GetComponentsInChildren<WWButton>())
                {
                    if (b.label.StartsWith("More ")) more = b;
                    else if (!into.Contains(b.label)) into.Add(b.label);
                }
                if (more == null || more.label.StartsWith("More " + more.label.Substring(more.label.Length - 1))) break;   // last page reached
                more.OnClick();
            }
            menu.SelectTab(1);
        }

        static IEnumerator WatchCaptions()
        {
            string last = null;
            while (Running)
            {
                if (GuideVoice.LastLine != last) { last = GuideVoice.LastLine; if (!string.IsNullOrEmpty(last)) captions.Add(last); }
                yield return null;
            }
        }

        /// <summary>Render the player's view to a PNG, at a fixed size, whatever the Game window is doing.</summary>
        public static void Shot(string name)
        {
            var cam = XRRig.I != null ? XRRig.I.cam : null;
            if (cam == null) return;
            const int w = 1280, h = 720;
            var rt = new RenderTexture(w, h, 24, RenderTextureFormat.ARGB32) { antiAliasing = 4 };
            cam.aspect = w / (float)h;
            RenderPipeline.SubmitRenderRequest(cam, new UniversalRenderPipeline.SingleCameraRequest { destination = rt });
            cam.ResetAspect();
            var prev = RenderTexture.active; RenderTexture.active = rt;
            var tex = new Texture2D(w, h, TextureFormat.RGB24, false);
            tex.ReadPixels(new Rect(0, 0, w, h), 0, 0);
            RenderTexture.active = prev;
            Directory.CreateDirectory(Folder);
            File.WriteAllBytes(Folder + "/" + name + ".png", tex.EncodeToPNG());
            Object.Destroy(tex); rt.Release(); Object.Destroy(rt);
        }

        static IEnumerator LookAndShoot(Vector3 world, string name)
        {
            DebugDriver.LookAt(world);
            yield return null; yield return null; yield return null;
            Shot(name);
        }

        static IEnumerator Routine(string say)
        {
            Running = true; failures = 0; log.Clear(); captions.Clear(); Result = "running";
            var lib = WorldLibrary.I; var wc = WorldController.I; var router = CommandRouter.I;
            if (lib == null || wc == null || router == null || !wc.Ready) { Result = "FAIL the World scene is not ready"; Running = false; yield break; }
            DebugDriver.I.StartCoroutine(WatchCaptions());
            var ahead = wc.Floor + wc.Forward * 2f + Vector3.up * 1.3f;
            string id = lib.toys != null && lib.toys.Length > 0 && lib.toys[0] != null ? lib.toys[0].id : "";
            string key = id.Length > 0 ? lib.toys[0].keywords[0] : "";
            Check(id.Length > 0 && lib.ToysEnabled, "there is a toy to scan (" + id + ")");
            if (id.Length == 0) { Result = log.ToString(); Running = false; yield break; }

            // --- before the scan: the toy cannot be reached
            var buttons = new List<string>();
            yield return CreatureButtons(buttons);
            Check(buttons.Contains(WishMenu.ScanLabel), "Creatures tab has \"" + WishMenu.ScanLabel + "\"");
            Check(!buttons.Contains(lib.toys[0].displayName), "Creatures tab does not list " + lib.toys[0].displayName + " before the scan");
            int entriesBefore = wc.State.entries.Count;
            router.Execute("show me " + key);
            Check(wc.State.entries.Count == entriesBefore && ToyCount(id) == 0, "\"show me " + key + "\" does nothing before the scan (" + router.LastResult + ")");
            Check(!Services.Vocabulary.Contains(key), "the toy's name is not in the vocabulary yet");
            yield return LookAndShoot(ahead, "02_before_scan");

            // --- first scan: nobody says a name
            float t0 = Time.time;
            string worldBefore = wc.State.worldId;
            router.Execute(CommandParser.ScanCommand);
            Check(ToyScan.Busy && router.LastResult == "scan", "\"" + CommandParser.ScanCommand + "\" starts the sequence");
            while (ToyScan.Stage != "scanning" && Time.time - t0 < 3f) yield return null;
            Check(PassthroughToggle.I != null && PassthroughToggle.I.IsOn, "the real room is shown during the scan (passthrough on)");
            yield return new WaitForSeconds(1.7f);
            Shot("03_scanning");
            router.Execute("aquarium");
            Check(router.LastResult == "busy" && wc.State.worldId == worldBefore, "a second command during the scan is ignored");
            while (ToyScan.Busy && Time.time - t0 < 12f) yield return null;
            float arrived = Time.time - t0;
            var toy = Toy(id);
            Check(toy != null && !ToyScan.Busy, "the toy is in the world " + arrived.ToString("F1") + " s after the command");
            Check(PassthroughToggle.I != null && !PassthroughToggle.I.IsOn, "the world is back (passthrough off)");
            if (toy == null) { Result = log.ToString(); Running = false; yield break; }
            yield return LookAndShoot(toy.transform.position, "04_toy_appears");
            yield return new WaitForSeconds(2.4f);
            toy = Toy(id);
            Check(toy != null && Mathf.Abs(toy.transform.position.y - wc.Floor.y) < 0.06f, "the toy has come down to the floor");
            Vector3 p0 = toy.transform.position;
            yield return LookAndShoot(toy.transform.position, "05_toy_on_floor");
            yield return new WaitForSeconds(1.5f);
            Check((toy.transform.position - p0).magnitude > 0.02f, "the toy is walking");
            var flat = toy.transform.position - wc.Floor; flat.y = 0;
            Check(Vector3.Dot(flat.normalized, wc.Forward) > 0.85f, "the toy is ahead of the player, " + flat.magnitude.ToString("F2") + " m away");
            Check(ToyScan.Stage == "asking", "the guide asks for a name (stage " + ToyScan.Stage + ")");
            // The view stays on the toy all through the greeting, as a child's would. A two-second look normally
            // opens a creature's fact card; here it must not, or the card would cut the greeting off.
            bool cardOpened = false;
            while (ToyScan.Stage != "idle" && Time.time - t0 < 70f)
            {
                var now = Toy(id);
                if (now != null) DebugDriver.LookAt(now.transform.position);
                if (FactCardPanel.Visible) cardOpened = true;
                yield return null;
            }
            yield return new WaitForSeconds(0.2f);
            Check(ToyScan.Stage == "idle" && !cardOpened, "looking at the toy while it says hello does not open its fact card");
            Check(captions.Contains(lib.toys[0].greeting2) && captions.Contains(VoiceLines.ToyWhereTo(lib.toys[0].displayName)), "the whole greeting is said, to the \"where to\" line");
            Check(string.IsNullOrEmpty(AppState.childName), "saying nothing leaves no name stored");

            // --- vocabulary and menu after the scan
            Check(Services.Vocabulary.Contains(key) && Services.Vocabulary.Contains(CommandParser.ScanCommand), "vocabulary now has \"" + key + "\" and \"" + CommandParser.ScanCommand + "\"");
            buttons.Clear();
            yield return CreatureButtons(buttons);
            Check(buttons.Contains(lib.toys[0].displayName), "Creatures tab lists " + lib.toys[0].displayName + " after the scan");

            // --- persistence: every world, clear, undo
            var lost = new StringBuilder();
            foreach (var w in lib.worlds)
            {
                if (w == null || !w.showInMenu) continue;
                router.Execute(w.keywords[0]);
                yield return null; yield return null;
                if (wc.State.worldId != w.id || wc.State.Find(id) == null || ToyCount(id) != 1) lost.Append(w.id).Append(' ');
            }
            Check(lost.Length == 0, "the toy is in every world, once (missing in: " + (lost.Length == 0 ? "none" : lost.ToString()) + ")");
            yield return new WaitForSeconds(0.6f);
            toy = Toy(id);
            if (toy != null) yield return LookAndShoot(toy.transform.position + Vector3.up * 0.5f, "06_toy_in_last_world");
            router.Execute("take " + key + " to space");
            yield return null; yield return null;
            Check(wc.State.worldId == "space" && ToyCount(id) == 1, "\"take " + key + " to space\" goes to space with one toy");
            router.Execute("zoo");
            yield return null;
            router.Execute("undo");
            yield return null; yield return null;
            Check(wc.State.worldId == "space" && ToyCount(id) == 1, "undo after a world change restores the world and keeps the toy");
            router.Execute("clear");
            yield return null; yield return null;
            Check(wc.State.entries.Count == 1 && ToyCount(id) == 1, "clear keeps the toy and removes the rest");
            router.Execute("more");
            router.Execute(key);
            yield return null; yield return null;
            Check(ToyCount(id) == 1, "\"more\" and asking for it again still leave one toy");

            // --- fact card and colours
            toy = Toy(id);
            yield return new WaitForSeconds(0.5f);
            DebugDriver.LookAt(toy.transform.position);
            yield return null; yield return null;
            DebugDriver.ClickWorld(toy.hitCollider.bounds.center);
            while (DebugDriver.Busy) yield return null;
            yield return new WaitForSeconds(0.3f);
            bool pointer = FactCardPanel.Visible && FactCardPanel.Current == toy.def;
            if (!pointer) { toy.OnClick(); yield return new WaitForSeconds(0.3f); }
            Check(FactCardPanel.Visible && FactCardPanel.Current == toy.def, "the fact card shows for the toy (" + (pointer ? "pointer click" : "direct click, the pointer missed") + ")");
            Check(AppState.learned.Contains(id), "the toy counts as found");
            yield return new WaitForSeconds(0.9f);
            yield return LookAndShoot(toy.transform.position + Vector3.up * 0.6f, "07_fact_card");
            router.Execute("purple");
            yield return null; yield return null;
            toy = Toy(id);
            bool paintable = false;
            var mf = toy != null ? toy.GetComponent<MeshFilter>() : null;
            if (mf != null) foreach (var c in mf.sharedMesh.colors) if (c.a > 0.01f) { paintable = true; break; }
            Check(mf != null && !paintable, "no part of the toy can be recoloured (\"purple\" leaves it brown)");
            if (toy != null) yield return LookAndShoot(toy.transform.position, "08_after_purple");

            // --- second scan: a name is said this time
            int runs = ToyScan.Runs;
            float t1 = Time.time;
            router.Execute(CommandParser.ScanCommand);
            Check(ToyScan.Busy && ToyScan.Runs == runs + 1, "scanning again replays the sequence");
            while (ToyScan.Stage != "asking" && Time.time - t1 < 15f) yield return null;
            Check(ToyCount(id) == 1, "after the second scan there is exactly one toy");
            yield return new WaitForSeconds(1f);
            DebugCommandKeys.SubmitSpeech(say);
            yield return new WaitForSeconds(0.3f);
            Check(router.LastResult == "captured" && !string.IsNullOrEmpty(AppState.childName), "the answer is taken as the name, not as a wish");
            string greeting = VoiceLines.ToyGreeting(lib.toys[0].greeting, AppState.childName);
            float t2 = Time.time;
            int said = captions.Count;
            bool followed = false;
            while (!followed && Time.time - t2 < 40f)
            {
                // only lines that came up after the name was given count: the first scan said them too
                followed = captions.IndexOf(lib.toys[0].greeting2, said) >= 0 && captions.IndexOf(VoiceLines.ToyWhereTo(lib.toys[0].displayName), said) >= 0;
                yield return null;
            }
            Check(captions.Contains(greeting), "the toy greets the child by name: " + greeting);
            Check(followed, "the second greeting and the \"where to\" line follow");
            Check(captions.Contains(VoiceLines.ToyGreeting(lib.toys[0].greeting, null)), "the first scan, with no answer, used \"" + VoiceLines.NoName + "\"");

            // --- the real room
            router.Execute("in my room");
            yield return null; yield return null;
            toy = Toy(id);
            float length = toy != null ? toy.GetComponent<MeshFilter>().sharedMesh.bounds.size.z * toy.transform.lossyScale.z : 0f;
            Check(toy != null && wc.State.ar && length > 0.2f && length < 0.45f, "in the room the toy is " + length.ToString("F2") + " m long");
            yield return new WaitForSeconds(0.5f);
            if (toy != null) yield return LookAndShoot(toy.transform.position, "09_in_my_room");
            router.Execute("take me there");
            yield return null;

            log.Append("Captions, in order: ").Append(string.Join(" / ", captions)).Append('\n');
            log.Insert(0, (failures == 0 ? "ALL PASSED" : failures + " FAILED") + "\n");
            Result = log.ToString();
            Running = false;
        }
    }
}
#endif
