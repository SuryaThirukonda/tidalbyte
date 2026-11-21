#if UNITY_EDITOR
using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.SceneManagement;

namespace WishWorld.DebugTools
{
    /// <summary>
    /// Editor-only scripted demos, one per part of the app, recorded by DemoRecorder.
    /// Every action goes through the desktop stand-in controls: the head turns, the mouse-driven
    /// controller points and pulls its trigger, keys are held. Nothing calls game code to fake a result,
    /// except where a comment says a debug hook sets up a moment (for example throwing two fruit together).
    /// Run with: DemoDirector.RunAll()  or  DemoDirector.Run("03_snow_circuit").
    /// </summary>
    public static partial class DemoDirector
    {
        public static string Status = "idle";
        public static readonly string[] Names =
            { "01_hub", "02_frost_slice", "03_snow_circuit", "04_worlds_aquarium", "05_worlds_tour", "06_ar_mode", "07_wish_mode" };

        static DesktopInputSource In => DesktopInputSource.I;
        static XRRig Rig => XRRig.I;
        static Vector2 hand;

        public static void RunAll() => DebugDriver.I.StartCoroutine(All(Names));
        public static void Run(params string[] names) => DebugDriver.I.StartCoroutine(All(names));

        static IEnumerator All(string[] names)
        {
            foreach (var n in names)
            {
                Status = "recording " + n;
                IEnumerator demo = n == "01_hub" ? Hub() : n == "02_frost_slice" ? FrostSlice() : n == "03_snow_circuit" ? SnowCircuit()
                    : n == "04_worlds_aquarium" ? WorldsAquarium() : n == "05_worlds_tour" ? WorldsTour() : n == "06_ar_mode" ? ArMode()
                    : n == "07_wish_mode" ? WishMode() : n == "08_new_features" ? NewFeatures() : null;
                if (demo == null) continue;
                yield return demo;
                DemoRecorder.End();
                DebugKeys.simHeld.Clear();
                yield return null;
            }
            DebugKeys.simMouse = null;
            DesktopInputSource.pointerMode = false;
            Status = "done " + string.Join(",", names);
        }

        // ------------------------------------------------------------------ helpers

        static float W => Rig.cam.pixelWidth;
        static float H => Rig.cam.pixelHeight;
        static Vector2 Park => new Vector2(W * 0.70f, H * 0.24f);
        static float Smooth(float k) { k = Mathf.Clamp01(k); return k * k * (3f - 2f * k); }
        static WaitForSeconds Wait(float s) => new WaitForSeconds(s);
        static void Say(string caption) => DemoRecorder.Caption(caption);

        static Vector2 ScreenOf(Vector3 world)
        {
            var p = Rig.cam.WorldToScreenPoint(world);
            if (p.z < 0.01f) return Park;
            return new Vector2(Mathf.Clamp(p.x, 4, W - 4), Mathf.Clamp(p.y, 4, H - 4));
        }

        static void SetHand(Vector2 px) { hand = px; DebugKeys.simMouse = px; }

        static void Begin(string name)
        {
            DesktopInputSource.pointerMode = true;
            DemoRecorder.Begin(name);
            DemoRecorder.PrepareCamera();
            SetHand(Park);
        }

        static IEnumerator WaitFor(Func<bool> condition, float timeout = 20f)
        {
            for (float t = 0; t < timeout && !condition(); t += Time.unscaledDeltaTime) yield return null;
            yield return null;
            DemoRecorder.PrepareCamera();
        }

        static IEnumerator LoadScene(string scene, Func<bool> ready)
        {
            SceneLoader.Load(scene);
            yield return null;
            yield return WaitFor(() => !SceneLoader.Busy && SceneManager.GetActiveScene().name == scene && Rig != null && ready());
            In.reach = 0.5f;
            SetHand(Park);
        }

        static void Angles(Vector3 world, out float yaw, out float pitch)
        {
            var local = Rig.transform.InverseTransformPoint(world) - Rig.head.localPosition;
            yaw = Mathf.Atan2(local.x, local.z) * Mathf.Rad2Deg;
            pitch = -Mathf.Atan2(local.y, new Vector2(local.x, local.z).magnitude) * Mathf.Rad2Deg;
        }

        static IEnumerator Look(float yaw, float pitch, float seconds)
        {
            float y0 = In.yaw, p0 = In.pitch;
            for (float t = 0; t < seconds; t += Time.deltaTime)
            {
                float k = Smooth(t / seconds);
                In.yaw = Mathf.Lerp(y0, yaw, k); In.pitch = Mathf.Lerp(p0, pitch, k);
                SetHand(hand);
                yield return null;
            }
            In.yaw = yaw; In.pitch = pitch;
        }

        /// <summary>Turn the head toward a (possibly moving) point and keep following it.</summary>
        static IEnumerator LookAt(Func<Vector3> point, float seconds, float holdSeconds = 0f, float pitchOffset = 0f)
        {
            float y0 = In.yaw, p0 = In.pitch;
            for (float t = 0; t < seconds + holdSeconds; t += Time.deltaTime)
            {
                Angles(point(), out float yaw, out float pitch);
                float k = Smooth(t / Mathf.Max(0.01f, seconds));
                In.yaw = Mathf.LerpAngle(y0, yaw, k); In.pitch = Mathf.Lerp(p0, pitch + pitchOffset, k);
                SetHand(hand);
                yield return null;
            }
        }

        static IEnumerator MoveHand(Func<Vector2> target, float seconds, bool linear = false)
        {
            var from = hand;
            for (float t = 0; t < seconds; t += Time.deltaTime)
            {
                float k = Mathf.Clamp01(t / seconds);
                SetHand(Vector2.Lerp(from, target(), linear ? k : Smooth(k)));
                yield return null;
            }
            SetHand(target());
        }

        static IEnumerator Click()
        {
            DebugKeys.simLeft = true;
            yield return null; yield return null; yield return null;
            DebugKeys.simLeft = false;
            yield return null;
        }

        static WWButton Find(string label, bool? inGrid = null)
        {
            foreach (var b in UnityEngine.Object.FindObjectsByType<WWButton>(FindObjectsSortMode.None))
            {
                if (!b.isActiveAndEnabled || !string.Equals(b.label, label, StringComparison.OrdinalIgnoreCase)) continue;
                bool grid = b.transform.parent != null && b.transform.parent.name == "Grid";
                if (inGrid.HasValue && inGrid.Value != grid) continue;
                return b;
            }
            return null;
        }

        /// <summary>Turn toward a button if it is off to one side, move the controller onto it, pull the trigger.</summary>
        static IEnumerator Press(string label, bool? inGrid = null, float after = 0.35f)
        {
            var b = Find(label, inGrid);
            if (b == null) { Debug.LogWarning("[Demo] No button '" + label + "'"); yield break; }
            var t = b.transform;
            var vp = Rig.cam.WorldToViewportPoint(t.position);
            if (vp.z < 0 || vp.x < 0.2f || vp.x > 0.8f || vp.y < 0.15f || vp.y > 0.85f)
                yield return LookAt(() => t.position, 0.75f, 0f, -4f);
            yield return MoveHand(() => ScreenOf(t.position), 0.45f);
            yield return Wait(0.12f);
            yield return Click();
            yield return Wait(after);
        }

        static IEnumerator ParkHand(float seconds = 0.35f) => MoveHand(() => Park, seconds);

        static Creature FindCreature(string id)
        {
            Creature best = null; float bestDot = -2f;
            foreach (var c in UnityEngine.Object.FindObjectsByType<Creature>(FindObjectsSortMode.None))
            {
                if (c.def == null || c.def.id != id) continue;
                float dot = Vector3.Dot(Rig.head.forward, (c.transform.position - Rig.HeadPosition).normalized);
                if (dot > bestDot) { bestDot = dot; best = c; }
            }
            return best;
        }

        // ------------------------------------------------------------------ 01 hub

        static IEnumerator Hub()
        {
            SceneManager.LoadScene(AppState.SceneBoot);
            yield return null;
            Begin("01_hub");
            Say("The app boots and fades into the snow hub");
            yield return WaitFor(() => !SceneLoader.Busy && HubController.I != null && Find("Games") != null);
            SetHand(Park);
            yield return Wait(1.6f);
            Say("The penguin guide turns to the player, waves and greets them");
            yield return Look(-30f, 12f, 1.5f);
            yield return Wait(2.2f);
            yield return Look(0f, 4f, 1.3f);
            Say("Point a controller at a card and pull the trigger: Games");
            yield return Press("Games", null, 1.6f);
            yield return MoveHand(() => ScreenOf(Find("Snow Circuit").transform.position), 0.5f);
            yield return Wait(0.6f);
            yield return Press("Back", null, 0.5f);
            Say("Worlds: one card per world definition");
            yield return Press("Worlds", null, 1.0f);
            foreach (var w in new[] { "Space", "Arctic", "Farm" })
            {
                var b = Find(w);
                if (b != null) yield return MoveHand(() => ScreenOf(b.transform.position), 0.4f);
                yield return Wait(0.35f);
            }
            yield return Press("Back", null, 0.5f);
            Say("Four destinations: Games, Worlds, AR Worlds and Wish");
            foreach (var w in new[] { "AR Worlds", "Wish" })
            {
                var b = Find(w);
                if (b != null) yield return MoveHand(() => ScreenOf(b.transform.position), 0.5f);
                yield return Wait(0.7f);
            }
            yield return ParkHand();
            yield return Wait(1.0f);
        }

        // ------------------------------------------------------------------ 02 frost slice

        static IEnumerator Swing(Func<Vector3?> target, int variant, bool leftHand, float halfWidth = 0.3f)
        {
            var p = target();
            if (!p.HasValue) yield break;
            Vector3 right = Rig.head.right, up = Rig.head.up;
            var dir = variant % 3 == 0 ? right : variant % 3 == 1 ? (right + up * 0.7f).normalized : (right - up * 0.7f).normalized;
            if (variant % 2 == 1) dir = -dir;
            if (leftHand) DebugKeys.simHeld.Add(Key.LeftShift);
            yield return MoveHand(() => ScreenOf((target() ?? p.Value) - dir * halfWidth), 0.16f);
            var b = ScreenOf((target() ?? p.Value) + dir * halfWidth);
            yield return MoveHand(() => b, 0.1f, true);     // the fast part of the swing
            yield return MoveHand(() => Park, 0.28f);
            if (leftHand) DebugKeys.simHeld.Remove(Key.LeftShift);
        }

        static IEnumerator SliceFor(FrostSliceGame g, float seconds, int startVariant)
        {
            float until = g.RoundTime + seconds;
            int n = startVariant;
            while (g.State == FrostSliceGame.Phase.Playing && g.RoundTime < until)
            {
                int pick = -1;
                for (int i = 0; i < g.FlyingCount; i++)
                    if (g.DebugFruit(i, out var pos, out bool hazard, out float phase) && !hazard && phase > 0.72f && phase < 1.4f && pos.y > 0.85f) { pick = i; break; }
                if (pick < 0) { yield return null; continue; }
                int idx = pick;
                yield return Swing(() => g.DebugFruit(idx, out var p, out bool hz, out _) && !hz ? p : (Vector3?)null, n, n % 4 == 3);
                n++;
            }
        }

        static IEnumerator FrostSlice()
        {
            yield return LoadScene(AppState.SceneFrostSlice, () => FrostSliceGame.I != null && Find("Start") != null);
            var g = FrostSliceGame.I;
            In.pitch = 8f;
            Begin("02_frost_slice");
            Say("Frost Slice, a mixed-reality game. The grey backdrop stands in for the real room");
            yield return Wait(2.2f);
            yield return Press("Start", null, 0.2f);
            DesktopInputSource.pointerMode = false;     // blades ride on the cursor ray
            In.reach = 0.32f;
            yield return ParkHand(0.3f);
            yield return Look(0f, 13f, 0.8f);
            Say("Fruit arcs up from the snow mound and peaks within arm's reach. Each controller is a blade");
            yield return SliceFor(g, 9f, 0);

            // Debug hook: pause the automatic waves so two fruit can be thrown side by side.
            g.debugNoWaves = true;
            yield return WaitFor(() => g.FlyingCount == 0, 4f);
            Say("Two fruit in one swing scores a combo");
            g.DebugLaunch(false, new Vector3(-0.13f, 1.34f, 0.55f));
            g.DebugLaunch(false, new Vector3(0.13f, 1.36f, 0.55f));
            yield return Wait(1.0f);
            var mid = g.transform.TransformPoint(new Vector3(0f, 1.33f, 0.55f));
            yield return Swing(() => mid, 0, false, 0.42f);
            yield return Wait(1.0f);

            Say("Slicing an ice block costs a life");
            yield return WaitFor(() => g.FlyingCount == 0, 4f);
            g.DebugLaunch(true, new Vector3(0.05f, 1.36f, 0.55f));
            yield return Wait(1.0f);
            yield return Swing(() => g.DebugFruit(0, out var p, out _, out _) ? p : (Vector3?)null, 2, false);
            yield return Wait(1.2f);
            g.debugNoWaves = false;

            Say("Waves get busier as the 60 second round goes on");
            yield return SliceFor(g, 7f, 1);
            g.DebugSetTimeLeft(1.2f);       // debug hook: skip to the end of the round
            yield return WaitFor(() => g.State == FrostSliceGame.Phase.Over, 6f);
            In.reach = 0.5f;
            DesktopInputSource.pointerMode = true;
            Say("Round over: score, and the best score is saved");
            yield return Look(0f, 9f, 0.8f);
            yield return MoveHand(() => ScreenOf(Find("Play again").transform.position), 0.6f);
            yield return Wait(2.8f);
            yield return ParkHand();
        }

        // ------------------------------------------------------------------ 03 snow circuit

        static void Key_(Key k, bool on) { if (on) DebugKeys.simHeld.Add(k); else DebugKeys.simHeld.Remove(k); }

        /// <summary>Drive with the desktop keys: A/D tilt the two controllers like a wheel, W throttle, S brake.</summary>
        static IEnumerator Drive(SnowCircuitGame g, Func<bool> keepGoing, float coastSeconds = 0f)
        {
            int idx = g.track.Nearest(g.car.position, 0, g.track.points.Length / 2);
            float started = -1f;
            while (g != null && keepGoing())
            {
                if (g.State == SnowCircuitGame.Phase.Racing)
                {
                    if (started < 0) started = Time.time;
                    idx = g.track.Nearest(g.car.position, idx);
                    var aim = g.track.points[(idx + 9) % g.track.points.Length];
                    float angle = Vector3.SignedAngle(g.car.forward, aim - g.car.position, Vector3.up);
                    Key_(Key.D, angle > 3f); Key_(Key.A, angle < -3f);
                    bool sharp = Mathf.Abs(angle) > 22f && g.Speed > 8f;
                    bool go = Time.time - started >= coastSeconds;
                    Key_(Key.W, go && !sharp); Key_(Key.S, sharp);
                    // look a little into the corner, as a driver would
                    In.yaw = Mathf.Lerp(In.yaw, g.Steer * 15f, Time.deltaTime * 2.5f);
                    In.pitch = Mathf.Lerp(In.pitch, 7f, Time.deltaTime * 2f);
                }
                yield return null;
            }
            Key_(Key.W, false); Key_(Key.S, false); Key_(Key.A, false); Key_(Key.D, false);
        }

        static IEnumerator SnowCircuit()
        {
            yield return LoadScene(AppState.SceneSnowCircuit, () => SnowCircuitGame.I != null && Find("Start") != null);
            var g = SnowCircuitGame.I;
            Begin("03_snow_circuit");
            Say("Snow Circuit: seated cockpit racing in an alpine valley against four computer-driven cars");
            yield return Wait(2.6f);
            yield return Press("Start", null, 0.2f);
            Say("Hold both controllers like a steering wheel. Right trigger goes, left trigger brakes");
            int lap = 1;
            yield return Drive(g, () =>
            {
                if (g.Lap != lap)
                {
                    lap = g.Lap;
                    Say(lap == 2 ? "Grandstands, pits, forest, a village and mountains surround the track" : "Arcade handling: the snow banks keep the car on the circuit");
                }
                return g.State != SnowCircuitGame.Phase.Finished;
            });
            Say("Three laps: the finishing place, race time and best lap are shown");
            yield return Look(0f, 0f, 0.8f);
            yield return Wait(3.0f);
            yield return Press("Race again", null, 0.2f);
            Say("The rivals ease off when far ahead and push on when behind, so the race stays close");
            float end = -1f;
            yield return Drive(g, () =>
            {
                if (g.State == SnowCircuitGame.Phase.Racing && end < 0) end = Time.time + 11f;
                return end < 0 || Time.time < end;
            }, 1.6f);
        }

        // ------------------------------------------------------------------ 04 worlds: aquarium

        static IEnumerator WorldsAquarium()
        {
            AppState.pendingWorldId = "aquarium";
            AppState.pendingMode = WorldMode.VR;
            AppState.pendingCommand = null;
            AppState.learned.Clear();
            yield return LoadScene(AppState.SceneWorld, () => WorldController.I != null && WorldController.I.Ready);
            Begin("04_worlds_aquarium");
            Say("Worlds: each has surroundings out to the horizon. This is the aquarium, a coral reef with a wreck");
            yield return Look(-32f, 2f, 1.8f);
            yield return Look(30f, -2f, 3.2f);

            Say("Point and pull the trigger: the creature glows and its fact card is shown and spoken");
            var shark = FindCreature("shark");
            if (shark != null)
            {
                yield return LookAt(() => shark.transform.position, 1.1f, 0f, 3f);
                yield return MoveHand(() => ScreenOf(shark.transform.position), 0.6f);
                for (float t = 0; t < 0.25f; t += Time.deltaTime) { SetHand(ScreenOf(shark.transform.position)); yield return null; }
                yield return Click();
                yield return ParkHand();
                yield return Wait(4.2f);
            }

            Say("Looking steadily at a creature for two seconds does the same");
            var turtle = FindCreature("turtle");
            if (turtle != null)
            {
                yield return LookAt(() => turtle.transform.position, 1.2f, 2.5f);
                yield return Wait(3.6f);
            }

            Say("The panel counts how many kinds have been found");
            var finish = Find("Finish");
            yield return LookAt(() => finish.transform.position, 1.1f, 1.4f, -8f);
            Say("Finish opens a three-question quiz drawn from this world's facts");
            yield return Press("Finish", null, 0.3f);
            yield return ParkHand();
            yield return Look(0f, 2f, 1.0f);
            var quiz = UnityEngine.Object.FindFirstObjectByType<QuizPanel>();
            for (int q = 0; q < 3 && quiz != null; q++)
            {
                yield return Wait(1.8f);
                int correct = quiz.CorrectOption();
                if (correct < 0) break;
                var options = quiz.GetComponentsInChildren<WWButton>();
                yield return Press(options[correct].label, null, 0.2f);
                yield return ParkHand(0.3f);
                yield return Wait(1.7f);
            }
            yield return Wait(3.2f);
            yield return Press("Close", null, 0.6f);
            yield return ParkHand();
        }

        // ------------------------------------------------------------------ 05 worlds: tour

        static IEnumerator WorldsTour()
        {
            if (SceneManager.GetActiveScene().name != AppState.SceneWorld || WorldController.I == null)
            {
                AppState.pendingWorldId = "aquarium"; AppState.pendingMode = WorldMode.VR; AppState.pendingCommand = null;
                yield return LoadScene(AppState.SceneWorld, () => WorldController.I != null && WorldController.I.Ready);
            }
            In.yaw = -36f; In.pitch = 2f;
            (string id, string caption, float pitch)[] worlds =
            {
                ("zoo", "Zoo: elephant, giraffe, zebra, lion, flamingos", 0f),
                ("space", "Space: planets orbit ahead; astronaut, rocket, satellite and comet float by", -8f),
                ("dinosaurs", "Dinosaurs: T. rex, Triceratops, Stegosaurus, pterosaurs", -4f),
                ("arctic", "Arctic: penguins, polar bear, seal, snowy owl and a whale, under the aurora", -4f),
                ("rainforest", "Rainforest: parrots, monkey, tree frogs, butterflies, sloth", 0f),
                ("farm", "Farm: cow, sheep, horse, chickens, pig", 2f),
                ("sky", "Sky: hot-air balloons, birds, a kite and a plane", -10f),
            };
            Begin("05_worlds_tour");
            foreach (var w in worlds)
            {
                CommandRouter.I.Execute(w.id);      // the same command text that voice, the menu or a debug key sends
                Say(w.caption);
                In.yaw = -40f; In.pitch = w.pitch;
                yield return Look(40f, w.pitch, 4.8f);
            }
            yield return Wait(0.4f);
        }

        // ------------------------------------------------------------------ 06 AR mode

        static IEnumerator ArMode()
        {
            yield return LoadScene(AppState.SceneHub, () => HubController.I != null && Find("AR Worlds") != null);
            In.yaw = 0; In.pitch = 4f;
            Begin("06_ar_mode");
            Say("AR Worlds brings creatures into the real room");
            yield return Wait(1.2f);
            yield return Press("AR Worlds", null, 0.1f);
            yield return WaitFor(() => !SceneLoader.Busy && WorldController.I != null && WorldController.I.Ready && WorldController.I.LiveCount > 0);
            SetHand(Park);
            Say("Flying fish in the room. The grey backdrop stands in for the headset's passthrough view");
            var fish = FindCreature("clownfish");
            if (fish != null) yield return LookAt(() => fish.transform.position, 1.2f, 2.6f);

            Say("The menu sends the same commands as voice: make it snow");
            yield return Press("Sky", false);
            yield return Press("Make it snow", true);
            yield return ParkHand();
            fish = FindCreature("clownfish");
            if (fish != null) yield return LookAt(() => fish.transform.position, 1.1f, 2.4f, -6f);

            Say("More, and bigger");
            yield return Press("Change", false);
            yield return Press("More", true);
            yield return Press("Bigger", true);
            yield return ParkHand();
            fish = FindCreature("clownfish");
            if (fish != null) yield return LookAt(() => fish.transform.position, 1.1f, 2.6f, -4f);

            Say("Small creatures dart away from a reaching hand");
            fish = FindCreature("clownfish");
            if (fish != null)
            {
                float reach0 = In.reach;
                DesktopInputSource.pointerMode = false;  // reach out with the controller itself
                for (float t = 0; t < 3.0f; t += Time.deltaTime)
                {
                    float d = Vector3.Distance(Rig.HeadPosition, fish.transform.position);
                    In.reach = Mathf.Lerp(In.reach, Mathf.Clamp(d - 0.12f, 0.3f, 1.6f), Time.deltaTime * 3f);
                    Angles(fish.transform.position, out float yaw, out float pitch);
                    In.yaw = Mathf.LerpAngle(In.yaw, yaw, Time.deltaTime * 3f); In.pitch = Mathf.Lerp(In.pitch, pitch, Time.deltaTime * 3f);
                    SetHand(Vector2.Lerp(hand, ScreenOf(fish.transform.position), Time.deltaTime * 6f));
                    yield return null;
                }
                In.reach = reach0;
                DesktopInputSource.pointerMode = true;
                yield return ParkHand();
            }

            Say("Space becomes a tabletop solar system at arm's length");
            yield return Press("Worlds", false);
            yield return Press("Space", true);
            yield return ParkHand();
            var saturn = FindCreature("earth");
            if (saturn != null) yield return LookAt(() => saturn.GetComponent<Mover>().center + Vector3.up * 1.05f, 1.2f, 4.2f);

            Say("Clear removes everything");
            yield return Press("Control", false);
            yield return Press("Clear", true);
            yield return ParkHand();
            yield return Look(0f, 6f, 1.0f);
            yield return Wait(1.0f);
        }

        // ------------------------------------------------------------------ 07 wish mode

        static IEnumerator Speak(string sentence, float holdSeconds)
        {
            // The mock recogniser returns this text when the push-to-talk button is released.
            MockSpeechRecognizer.TypedText = sentence;
            DebugKeys.simHeld.Add(Key.F);          // hold A (push-to-talk)
            yield return Wait(holdSeconds);
            DebugKeys.simHeld.Remove(Key.F);
            yield return null;
        }

        static IEnumerator WishMode()
        {
            yield return LoadScene(AppState.SceneHub, () => HubController.I != null && Find("Wish") != null);
            In.yaw = 0; In.pitch = 4f;
            Begin("07_wish_mode");
            Say("Wish mode: say or pick what the world should be");
            yield return Wait(1.0f);
            yield return Press("Wish", null, 0.1f);
            yield return WaitFor(() => !SceneLoader.Busy && WorldController.I != null && WorldController.I.Ready);
            SetHand(Park);
            yield return Wait(1.2f);

            Say("Hold A and speak. Here the mock recogniser returns typed text: \"I want an aquarium with purple sharks\"");
            var tab = Find("Worlds", false);
            yield return LookAt(() => tab.transform.position + Vector3.down * 0.3f, 1.0f);
            yield return Speak("I want an aquarium with purple sharks", 1.6f);
            yield return Wait(1.6f);
            Say("The keyword matcher loads the aquarium and tints only the shark purple. No AI is involved");
            var shark = FindCreature("shark");
            if (shark != null) yield return LookAt(() => shark.transform.position, 1.2f, 3.4f);

            Say("Colour, size and amount: rainbow, giant, tiny");
            yield return Press("Change", false);
            yield return Press("Rainbow", true);
            yield return ParkHand();
            yield return Look(-25f, 2f, 1.0f);
            yield return Look(20f, 0f, 2.4f);
            yield return Press("Giant", true);
            yield return ParkHand();
            yield return Look(-25f, 0f, 1.0f);
            yield return Look(15f, 0f, 2.2f);
            yield return Press("Tiny", true);
            yield return ParkHand();
            yield return Look(-10f, 4f, 0.9f);
            yield return Wait(1.3f);

            Say("Weather: make it snow, make it night, make it sunny");
            yield return Press("Sky", false);
            yield return Press("Make it snow", true);
            yield return Press("Make it night", true);
            yield return ParkHand();
            yield return Look(-5f, -4f, 1.0f);
            yield return Wait(2.2f);
            yield return Press("Make it sunny", true);

            Say("\"In my room\" switches to AR; \"take me there\" switches back");
            yield return Press("In my room", true);
            yield return ParkHand();
            yield return Look(-8f, 2f, 1.0f);
            yield return Wait(2.2f);
            yield return Press("Take me there", true);
            yield return ParkHand();
            yield return Look(0f, 4f, 0.9f);
            yield return Wait(2.6f);

            Say("A wish it cannot grant gets a friendly miss from the guide");
            yield return Speak("please make me a sandwich", 1.0f);
            yield return Wait(4.6f);

            Say("Undo, then go home");
            yield return Press("Control", false);
            yield return Press("Undo", true, 1.6f);
            yield return Press("Go home", true, 0.1f);
            yield return WaitFor(() => !SceneLoader.Busy && HubController.I != null && Find("Games") != null);
            SetHand(Park);
            In.yaw = 0; In.pitch = 4f;
            yield return Wait(1.8f);
        }
    }
}
#endif
