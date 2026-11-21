using UnityEngine;

namespace WishWorld
{
    /// <summary>
    /// Push-to-talk: hold A on the right controller, speak, let go. The heard text is shown,
    /// then sent to the CommandRouter. A loud hall cannot trigger commands by accident.
    /// </summary>
    public class WishVoice : MonoBehaviour
    {
        public static WishVoice I { get; private set; }
        public string Status { get; private set; } = "";
        bool listening;

        void Awake() { I = this; }
        void OnDestroy() { if (I == this) I = null; }

        void Update()
        {
            if (WWInput.PrimaryDown(false)) Begin();
            if (WWInput.PrimaryUp(false)) End();
        }

        public void Begin()
        {
            if (listening) return;
            listening = true;
            Services.Speech.StartListening();
            Show("Listening...");
        }

        public void End()
        {
            if (!listening) return;
            listening = false;
            Services.Speech.StopListening(Heard, Show);
        }

        /// <summary>Called with recognized text. Also used by the debug speech field.</summary>
        public void Heard(string text)
        {
            Show("Heard: " + text);
            if (CommandRouter.I != null) CommandRouter.I.HandleHeard(text);
        }

        void Show(string text)
        {
            Status = text;
            if (WorldController.I != null) WorldController.I.SetStatus(text);
        }
    }
}
