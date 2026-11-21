#if UNITY_EDITOR
using System;
using System.Collections;
using System.IO;
using System.Reflection;
using UnityEngine;

namespace WishWorld.DebugTools
{
    public static partial class DemoDirector
    {
        /// <summary>
        /// Spoken wishes for the new-features demo: 16 kHz mono WAV files of a person speaking (made with a second
        /// ElevenLabs voice, standing in for a child). Set before running "08_new_features".
        /// </summary>
        public static string[] WishAudio = new string[0];

        /// <summary>
        /// A spoken wish, end to end with the real services: "Listening..." while the recording plays, then the same
        /// upload the push-to-talk button makes (ElevenLabs speech to text), then the CommandRouter and Claude.
        /// The microphone itself is the only part replaced: the recording stands in for it.
        /// </summary>
        static IEnumerator VoiceWish(string wav)
        {
            if (string.IsNullOrEmpty(wav) || !File.Exists(wav)) { Debug.LogWarning("[Demo] No wish recording " + wav); yield break; }
            var bytes = File.ReadAllBytes(wav);
            float seconds = Mathf.Max(0.5f, (bytes.Length - 44) / 32000f);
            WorldController.I.SetStatus("Listening...");
            DemoRecorder.SoundFile(wav, 1f);
            yield return Wait(seconds + 0.35f);
            string heard = null, error = null;
            var stt = Services.Speech;
            var send = stt.GetType().GetMethod("Send", BindingFlags.NonPublic | BindingFlags.Instance);
            if (send == null) { Debug.LogWarning("[Demo] Speech recognition is on its mock; add the ElevenLabs key"); yield break; }
            Services.Run((IEnumerator)send.Invoke(stt, new object[] { bytes, (Action<string>)(t => heard = t), (Action<string>)(e => error = e) }));
            yield return WaitFor(() => heard != null || error != null, 40f);
            if (heard == null) { Debug.LogWarning("[Demo] Speech recognition failed: " + error); yield break; }
            WishVoice.I.Heard(heard);
            yield return WaitFor(() => CommandRouter.I == null || !CommandRouter.I.Thinking, 40f);
        }

        static IEnumerator WaitForQuiet(float timeout = 12f)
        {
            yield return WaitFor(() => !GuideVoice.Speaking, timeout);
        }

        /// <summary>Wait for a line that is still being fetched (a live answer) to start, then for it to finish.</summary>
        static IEnumerator WaitForSpeech(float timeout = 20f)
        {
            yield return WaitFor(() => GuideVoice.Speaking, timeout);
            yield return WaitForQuiet(timeout);
        }

        static IEnumerator NewFeatures()
        {
            yield return LoadScene(AppState.SceneHub, () => HubController.I != null && Find("Wish") != null);
            In.yaw = 0; In.pitch = 4f;
            AppState.learned.Clear();
            Begin("08_new_features");
            Say("New: every dialog is spoken in a recorded ElevenLabs voice, and panels animate");
            yield return Wait(3.6f);

            Say("Menus pop in, buttons arrive one by one, and the menu is read out");
            yield return Press("Games", null, 0.2f);
            yield return ParkHand(0.3f);
            yield return WaitForQuiet();
            Say("Point at a card and the guide says its name, for children who cannot read yet");
            var card = Find("Frost Slice");
            if (card != null) yield return MoveHand(() => ScreenOf(card.transform.position), 0.5f);
            yield return WaitForSpeech(3f);
            yield return Wait(0.4f);
            yield return Press("Back", null, 0.4f);
            var wish = Find("Wish");
            if (wish != null) yield return MoveHand(() => ScreenOf(wish.transform.position), 0.5f);
            yield return WaitForSpeech(3f);
            yield return Press("Wish", null, 0.1f);
            yield return WaitFor(() => !SceneLoader.Busy && WorldController.I != null && WorldController.I.Ready);
            SetHand(Park);
            yield return WaitForQuiet();

            Say("Hold A and speak. ElevenLabs turns the words into text; Claude Haiku picks from the app's own worlds and creatures");
            yield return Look(-12f, 4f, 0.8f);
            yield return VoiceWish(WishAudio.Length > 0 ? WishAudio[0] : null);
            Say("There is no dragon, so Claude chose the nearest thing the app has: dinosaurs, a giant T. rex, at night");
            var trex = FindCreature("trex");
            if (trex != null) yield return LookAt(() => trex.transform.position, 1.4f, 2.0f);
            else yield return Look(20f, 0f, 2.4f);
            yield return WaitForQuiet();

            Say("Another wish in a child's own words");
            yield return Look(-12f, 4f, 0.8f);
            yield return VoiceWish(WishAudio.Length > 1 ? WishAudio[1] : null);
            yield return Look(18f, 0f, 2.6f);
            yield return WaitForQuiet();

            Say("A question gets a short spoken answer from Claude. These answers are not fact-checked");
            yield return Look(-12f, 4f, 0.8f);
            yield return VoiceWish(WishAudio.Length > 2 ? WishAudio[2] : null);
            yield return WaitForSpeech();
            yield return Wait(0.6f);

            Say("Touch a creature: the fact card pops in, writes itself out and is read aloud");
            var jelly = FindCreature("jellyfish") ?? FindCreature("shark");
            if (jelly != null)
            {
                yield return LookAt(() => jelly.transform.position, 1.1f, 0f, 3f);
                yield return MoveHand(() => ScreenOf(jelly.transform.position), 0.5f);
                for (float t = 0; t < 0.25f; t += Time.deltaTime) { SetHand(ScreenOf(jelly.transform.position)); yield return null; }
                yield return Click();
                yield return ParkHand();
                yield return Wait(0.8f);
                yield return WaitForQuiet();
                yield return Wait(0.8f);
            }

            Say("The quiz reads each question. A wrong answer shakes and the right one hops");
            var finish = Find("Finish");
            if (finish != null)
            {
                yield return Press("Finish", null, 0.3f);
                yield return ParkHand();
                yield return Look(0f, 2f, 1.0f);
                var quiz = UnityEngine.Object.FindFirstObjectByType<QuizPanel>();
                for (int q = 0; q < 3 && quiz != null; q++)
                {
                    yield return Wait(0.6f);
                    yield return WaitForQuiet();
                    int correct = quiz.CorrectOption();
                    if (correct < 0) break;
                    var options = quiz.GetComponentsInChildren<WWButton>();
                    int pick = q == 0 ? (correct + 1) % 3 : correct;
                    yield return Press(options[pick].label, null, 0.2f);
                    yield return ParkHand(0.3f);
                    yield return Wait(0.5f);
                    yield return WaitForQuiet();
                    yield return Wait(1.0f);
                }
                yield return Wait(0.8f);
                yield return WaitForQuiet();
                yield return Wait(0.8f);
                yield return WaitForQuiet();
                yield return Press("Close", null, 0.4f);
            }

            yield return LoadScene(AppState.SceneSnowCircuit, () => SnowCircuitGame.I != null && Find("Start") != null);
            Say("The race countdown is spoken, and each number lands with a thump");
            yield return Wait(1.6f);
            yield return Press("Start", null, 0.2f);
            yield return ParkHand(0.3f);
            yield return Wait(3.8f);

            yield return LoadScene(AppState.SceneFrostSlice, () => FrostSliceGame.I != null && Find("Start") != null);
            var g = FrostSliceGame.I;
            In.pitch = 8f;
            Say("Score pop-ups burst in at a tilt, and the score kicks with every slice");
            yield return Wait(1.4f);
            yield return Press("Start", null, 0.2f);
            DesktopInputSource.pointerMode = false;
            In.reach = 0.32f;
            yield return ParkHand(0.3f);
            yield return Look(0f, 13f, 0.8f);
            yield return SliceFor(g, 8f, 0);
            yield return Wait(0.8f);
            In.reach = 0.5f;
            DesktopInputSource.pointerMode = true;
        }
    }
}
#endif
