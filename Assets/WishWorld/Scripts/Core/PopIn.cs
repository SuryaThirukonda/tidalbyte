using UnityEngine;

namespace WishWorld
{
    /// <summary>
    /// Makes a panel pop into view each time it is switched on (a quick grow with a little overshoot), optionally
    /// bob gently while it is up, and shrink away when closed with <see cref="Close"/>.
    /// Everything is added on top of whatever position and scale the owner sets, so owners can keep moving the panel.
    /// </summary>
    public class PopIn : MonoBehaviour
    {
        public float duration = 0.34f;
        public float delay;
        public float bob;                 // metres of gentle up and down drift; 0 for none
        public float bobSpeed = 1.2f;
        public float pulse;               // 0..1: a soft breathing while the guide speaks

        Vector3 baseScale;
        bool captured;
        float t, kick, kickSize;
        int state;                        // 0 resting, 1 opening, 2 closing
        Vector3 offset;
        float phase;

        void Capture() { if (!captured) { baseScale = transform.localScale; captured = true; } }

        void Awake() { Capture(); phase = Random.value * 6.28f; }

        void OnEnable()
        {
            Capture();
            t = -delay;
            state = 1;
            transform.localScale = baseScale * StartScale;
        }

        void OnDisable()
        {
            transform.localPosition -= offset;
            offset = Vector3.zero;
            if (captured) transform.localScale = baseScale;
            state = 0;
        }

        const float StartScale = 0.55f;

        /// <summary>Shrink away, then switch the object off. Safe on objects with no PopIn: they are just switched off.</summary>
        public static void Close(GameObject go)
        {
            if (go == null || !go.activeSelf) return;
            var p = go.GetComponent<PopIn>();
            if (p == null || !go.activeInHierarchy) { go.SetActive(false); return; }
            if (p.state == 2) return;
            p.state = 2; p.t = 0;
        }

        /// <summary>Open again from small, for a panel that stays on while its words change.</summary>
        public void Replay() { if (isActiveAndEnabled) { t = 0; state = 1; } }

        /// <summary>A quick bump in size, for a number that just changed.</summary>
        public void Kick(float size = 0.3f) { kick = 1f; kickSize = size; }

        // Rises past 1 and settles: the "back" easing curve.
        static float OutBack(float x)
        {
            const float c1 = 1.70158f, c3 = c1 + 1f;
            float y = x - 1f;
            return 1f + c3 * y * y * y + c1 * y * y;
        }

        void LateUpdate()
        {
            float dt = Time.unscaledDeltaTime;
            float s = 1f;
            if (state == 1)
            {
                t += dt;
                float x = Mathf.Clamp01(t / duration);
                s = t < 0 ? StartScale : Mathf.LerpUnclamped(StartScale, 1f, OutBack(x));
                if (x >= 1f) state = 0;
            }
            else if (state == 2)
            {
                t += dt;
                float x = Mathf.Clamp01(t / 0.14f);
                s = Mathf.Lerp(1f, 0.4f, x * x);
                if (x >= 1f) { gameObject.SetActive(false); return; }
            }
            if (kick > 0f) { kick = Mathf.Max(0f, kick - dt * 4.5f); s *= 1f + kickSize * kick * kick; }
            if (pulse > 0.001f) s *= 1f + 0.012f * pulse * Mathf.Sin(Time.unscaledTime * 9f);
            transform.localScale = baseScale * s;

            if (bob > 0f)
            {
                var want = transform.localRotation * Vector3.up * (Mathf.Sin(Time.unscaledTime * bobSpeed + phase) * bob);
                transform.localPosition += want - offset;
                offset = want;
            }
        }
    }
}
