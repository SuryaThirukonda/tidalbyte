#if UNITY_EDITOR
using UnityEngine;
using UnityEngine.InputSystem;

namespace WishWorld.DebugTools
{
    /// <summary>
    /// Editor-only keys that fire every command in the command list, so worlds, add-ons and
    /// modifiers can be tested with no headset and no voice. F1 shows the key list.
    /// </summary>
    [DefaultExecutionOrder(-200)]
    public class DebugCommandKeys : MonoBehaviour
    {
        public static readonly (Key key, string label, string command)[] Commands =
        {
            (Key.Digit1, "1", "aquarium"), (Key.Digit2, "2", "zoo"), (Key.Digit3, "3", "space"), (Key.Digit4, "4", "dinosaurs"),
            (Key.Digit5, "5", "arctic"), (Key.Digit6, "6", "rainforest"), (Key.Digit7, "7", "farm"), (Key.Digit8, "8", "sky"),
            (Key.F5, "F5", "add a shark"), (Key.F6, "F6", "flying fish"), (Key.F7, "F7", "butterflies"), (Key.F8, "F8", "add a penguin"),
            (Key.R, "R", "red"), (Key.B, "B", "blue"), (Key.U, "U", "purple"), (Key.O, "O", "gold"), (Key.I, "I", "rainbow"),
            (Key.Equals, "=", "more"), (Key.Minus, "-", "fewer"), (Key.L, "L", "lots of"),
            (Key.RightBracket, "]", "bigger"), (Key.LeftBracket, "[", "smaller"), (Key.G, "G", "giant"), (Key.T, "T", "tiny"),
            (Key.N, "N", "make it snow"), (Key.M, "M", "make it night"), (Key.Y, "Y", "make it sunny"),
            (Key.K, "K", "in my room"), (Key.V, "V", "take me there"),
            (Key.X, "X", "clear"), (Key.Backspace, "Backspace", "undo"), (Key.H, "H", "go home"),
        };

        public static bool showHelp;
        public static bool showSpeech;
        public static string speechText = "";
        bool focusField;

        void Update()
        {
            DebugKeys.BeginFrame();
            if (DebugKeys.Down(Key.F1)) showHelp = !showHelp;
            if (DebugKeys.Down(Key.F2)) { showSpeech = !showSpeech; focusField = showSpeech; if (!showSpeech) DebugKeys.typing = false; }
            if (DebugKeys.Down(Key.P) && PassthroughToggle.I != null) PassthroughToggle.I.Toggle();
            if (DebugKeys.Down(Key.Escape)) SceneLoader.GoHub();
            if (DebugKeys.Down(Key.F10) && WorldController.I != null) WorldController.I.StartQuiz();

            if (CommandRouter.I != null)
                foreach (var c in Commands)
                    if (DebugKeys.Down(c.key)) CommandRouter.I.Execute(c.command);
        }

        /// <summary>Send text through the speech path exactly as if it had been spoken and recognized.</summary>
        public static void SubmitSpeech(string text)
        {
            if (WishVoice.I == null) return;
            MockSpeechRecognizer.TypedText = text;
            WishVoice.I.Begin();
            WishVoice.I.End();
        }

        void OnGUI()
        {
            if (showSpeech)
            {
                GUI.Box(new Rect(10, Screen.height - 46, 460, 36), GUIContent.none);
                GUI.SetNextControlName("speech");
                speechText = GUI.TextField(new Rect(16, Screen.height - 40, 360, 24), speechText);
                if (focusField) { GUI.FocusControl("speech"); focusField = false; }
                DebugKeys.typing = GUI.GetNameOfFocusedControl() == "speech";
                bool enter = Event.current.type == EventType.KeyUp && Event.current.keyCode == KeyCode.Return;
                if ((GUI.Button(new Rect(382, Screen.height - 40, 80, 24), "Say") || enter) && !string.IsNullOrWhiteSpace(speechText))
                {
                    SubmitSpeech(speechText);
                    speechText = "";
                }
            }
            if (!showHelp) return;
            var sb = new System.Text.StringBuilder();
            sb.AppendLine("DESKTOP DEBUG CONTROLS (editor only)");
            sb.AppendLine("Right mouse drag: look    WASD / QE: move    Mouse: right controller (Left Shift: left)");
            sb.AppendLine("Left click: trigger    F: A button (push-to-talk)    C: B button    PageUp/Down: reach");
            sb.AppendLine("Racing: A D steer, W throttle, S brake");
            sb.AppendLine("P: VR / passthrough    Esc: hub    F2: type speech    F10: quiz    F1: hide this");
            sb.AppendLine();
            int n = 0;
            foreach (var c in Commands)
            {
                sb.Append(c.label).Append(": ").Append(c.command).Append("    ");
                if (++n % 4 == 0) sb.AppendLine();
            }
            GUI.Box(new Rect(10, 10, 720, 250), sb.ToString());
        }
    }
}
#endif
