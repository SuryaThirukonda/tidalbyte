using TMPro;
using UnityEngine;

namespace WishWorld
{
    /// <summary>Writes a text out letter by letter over a set time, so words appear as they are spoken.</summary>
    public class TypeOn : MonoBehaviour
    {
        TextMeshPro label;
        float t, duration;
        int total;
        bool running;

        /// <summary>Start again from the first letter and reach the last one after <paramref name="seconds"/>.</summary>
        public void Play(float seconds)
        {
            if (label == null) label = GetComponent<TextMeshPro>();
            if (label == null) return;
            label.maxVisibleCharacters = 99999;
            label.ForceMeshUpdate();
            total = label.textInfo.characterCount;
            duration = Mathf.Max(0.15f, seconds);
            t = 0;
            running = total > 0;
            if (running) label.maxVisibleCharacters = 0;
        }

        /// <summary>Keep the place reached so far, but finish in <paramref name="seconds"/> from now (the real length of the speech is known).</summary>
        public void Retime(float seconds)
        {
            if (!running) return;
            float done = Mathf.Clamp01(t / duration);
            duration = Mathf.Max(0.15f, seconds) / Mathf.Max(0.05f, 1f - done);
            t = done * duration;
        }

        public void Finish()
        {
            running = false;
            if (label != null) label.maxVisibleCharacters = 99999;
        }

        void OnDisable() { Finish(); }

        void Update()
        {
            if (!running) return;
            t += Time.unscaledDeltaTime;
            if (t >= duration) { Finish(); return; }
            label.maxVisibleCharacters = Mathf.CeilToInt(total * (t / duration));
        }
    }
}
