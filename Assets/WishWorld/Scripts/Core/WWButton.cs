using System;
using UnityEngine;

namespace WishWorld
{
    /// <summary>Anything a controller ray, a poke or the gaze can act on.</summary>
    public interface IPointerTarget
    {
        void OnHover(bool hovering);
        void OnClick();
    }

    /// <summary>
    /// A flat 3D button: point and pull the trigger, or poke it with a controller.
    /// It pops into view a moment after its neighbours, springs when pointed at or pressed, and after a short dwell
    /// the guide says its name, so a child who cannot read yet still knows what it does.
    /// </summary>
    public class WWButton : MonoBehaviour, IPointerTarget
    {
        public Action onClick;
        public Renderer background;
        public GameObject glow;          // warm halo shown while pointed at
        public string label;
        /// <summary>What the guide says when this is pointed at. Empty means the label.</summary>
        public string spoken;
        public bool interactable = true;

        static readonly int BaseColor = Shader.PropertyToID("_BaseColor");
        static bool? readAloud;
        MaterialPropertyBlock mpb;
        Vector3 baseScale;
        bool awake;
        float pulse, size = 1f, speed, wait, hoverTime, shake, shakeOffset;
        bool hovering, selected, hinted;

        void Awake() { baseScale = transform.localScale; awake = true; }

        void OnEnable()
        {
            if (!awake) return;
            // Each button on a panel arrives a beat after the one before it.
            wait = Mathf.Min(0.035f * transform.GetSiblingIndex(), 0.4f) + 0.02f;
            size = 0.01f; speed = 0f;
            transform.localScale = baseScale * size;
            hoverTime = 0; hinted = false;
        }

        void OnDisable()
        {
            if (awake) transform.localScale = baseScale;
            transform.localPosition -= transform.localRotation * Vector3.right * shakeOffset;
            shakeOffset = 0; shake = 0; hovering = false;
            if (glow != null) glow.SetActive(false);
        }

        public void SetSelected(bool on) { selected = on; Apply(); }

        public void OnHover(bool on)
        {
            if (hovering == on) return;
            hovering = on;
            hoverTime = 0; hinted = false;
            if (on && interactable) Sfx.Play(Sfx.Hover, transform.position, 0.25f);
            Apply();
        }

        public void OnClick()
        {
            if (!interactable) return;
            pulse = 1f;
            Sfx.Play(Sfx.Click, transform.position, 0.6f);
            onClick?.Invoke();
        }

        /// <summary>A happy hop, for a right answer.</summary>
        public void Bounce() { speed += 3.2f; }

        /// <summary>A quick side-to-side shake, for a wrong answer.</summary>
        public void Shake() { shake = 0.4f; }

        void Apply()
        {
            if (glow != null) glow.SetActive(hovering && interactable);
            if (background == null) return;
            if (mpb == null) mpb = new MaterialPropertyBlock();
            float v = !interactable ? 0.6f : hovering ? 1.12f : 1f;
            var c = selected ? new Color(1.0f * v, 0.86f * v, 0.72f * v, 1) : new Color(v, v, v, 1);
            background.GetPropertyBlock(mpb);
            mpb.SetColor(BaseColor, c);
            background.SetPropertyBlock(mpb);
        }

        void Update()
        {
            float dt = Mathf.Min(Time.unscaledDeltaTime, 0.05f);
            if (wait > 0)
            {
                wait -= dt;
                if (wait > 0) return;
                size = 0.6f; speed = 0f;
            }
            float target = hovering && interactable ? 1.06f : 1f;
            if (pulse > 0) { pulse -= dt * 4f; target -= 0.08f * Mathf.Max(pulse, 0); }
            // a soft spring: it overshoots a little and settles
            speed += (target - size) * 260f * dt;
            speed *= Mathf.Exp(-16f * dt);
            size += speed * dt;
            transform.localScale = baseScale * size;

            if (shake > 0 || shakeOffset != 0)
            {
                shake = Mathf.Max(0, shake - dt);
                float want = shake > 0 ? Mathf.Sin(shake * 55f) * 0.014f * (shake / 0.4f) : 0f;
                transform.localPosition += transform.localRotation * Vector3.right * (want - shakeOffset);
                shakeOffset = want;
            }

            if (hovering && interactable && !hinted)
            {
                hoverTime += dt;
                if (hoverTime >= 0.45f)
                {
                    hinted = true;
                    if (readAloud == null) readAloud = EnvConfig.Get("WISHWORLD_READ_BUTTONS", "on").ToLowerInvariant() != "off";
                    if (readAloud.Value) GuideVoice.Hint(VoiceLines.ForButton(string.IsNullOrEmpty(spoken) ? label : spoken));
                }
            }
        }
    }
}
