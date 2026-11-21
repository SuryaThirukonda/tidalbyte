using UnityEngine;

namespace WishWorld
{
    /// <summary>
    /// A live creature. Touch it, look at it for two seconds, or point and pull the trigger:
    /// it glows, makes its sound, and its fact card plays.
    /// </summary>
    public class Creature : MonoBehaviour, IPointerTarget
    {
        public const float GazeSeconds = 2f;
        public const float ScatterRange = 0.4f;

        public CreatureDefinition def;
        public Mover mover;
        public Collider hitCollider;
        public Renderer[] renderers;

        static readonly int Glow = Shader.PropertyToID("_Glow");
        static readonly int Tint = Shader.PropertyToID("_Tint");
        static readonly int TintAmount = Shader.PropertyToID("_TintAmount");

        MaterialPropertyBlock mpb;
        Color tint = Color.white;
        float tintAmount;
        float glow, glowTarget, glowUntil;
        float cooldownUntil;
        bool hovered, gazeConsumed;

        void Awake() { mpb = new MaterialPropertyBlock(); }

        public void SetTint(Color c, bool on)
        {
            tint = c; tintAmount = on ? 1f : 0f;
            Apply();
        }

        /// <summary>
        /// Keep the fact card shut for a while, however the creature is touched or looked at. A toy that has just
        /// arrived is busy saying hello, and its card would cut the greeting off. Rest(0) ends the wait.
        /// </summary>
        public void Rest(float seconds) { cooldownUntil = Time.time + seconds; }

        public void OnHover(bool on) { hovered = on; }
        public void OnClick() { Learn(); }

        void Update()
        {
            var rig = XRRig.I;
            float gazeGlow = 0;
            if (rig != null && hitCollider != null)
            {
                // Touch: either controller reaching the creature.
                if (!WWInput.IsDesktop)
                {
                    for (int i = 0; i < 2; i++)
                    {
                        var hand = rig.Hand(i == 0);
                        if (!hand.gameObject.activeSelf) continue;
                        if ((hitCollider.ClosestPoint(hand.position) - hand.position).sqrMagnitude < 0.06f * 0.06f)
                        {
                            if (Time.time >= cooldownUntil) WWInput.Haptic(i == 0, 0.5f, 0.08f);
                            Learn();
                        }
                    }
                }
                // In the real room, small schooling creatures dart away from a reaching hand.
                if (mover != null && def != null && def.addCount > 1 && def.moveType != MoveType.Walk
                    && WorldController.I != null && WorldController.I.State.ar)
                {
                    for (int i = 0; i < 2; i++)
                    {
                        var hand = rig.Hand(i == 0);
                        if (!hand.gameObject.activeSelf) continue;
                        var away = transform.position - hand.position;
                        float d = away.magnitude;
                        if (d < ScatterRange && d > 1e-4f)
                            mover.nudge = Vector3.MoveTowards(mover.nudge, away / d * 0.45f * (1f - d / ScatterRange), Time.deltaTime * 2.5f);
                    }
                }
                // Gaze: glow builds while looked at, fires at two seconds.
                if (rig.gazeCollider == hitCollider && !QuizPanel.Blocking)
                {
                    gazeGlow = Mathf.Clamp01(rig.gazeSeconds / GazeSeconds) * 0.4f;
                    if (rig.gazeSeconds >= GazeSeconds && !gazeConsumed) { gazeConsumed = true; Learn(); }
                }
                else gazeConsumed = false;
            }

            bool lit = Time.time < glowUntil;
            glowTarget = lit ? 0.55f + Mathf.Sin(Time.time * 6f) * 0.15f : Mathf.Max(gazeGlow, hovered ? 0.25f : 0f);
            if (!Mathf.Approximately(glow, glowTarget))
            {
                glow = Mathf.MoveTowards(glow, glowTarget, Time.deltaTime * 3f);
                Apply();
            }
            if (mover != null) mover.speedScale = Mathf.MoveTowards(mover.speedScale, lit ? 0.15f : 1f, Time.deltaTime * 1.5f);
        }

        public void Learn()
        {
            if (Time.time < cooldownUntil || def == null) return;
            cooldownUntil = Time.time + 4f;
            glowUntil = Time.time + 5f;
            Sfx.Play(Sfx.Chirp(def.voicePitch), transform.position, 0.8f);
            Sfx.Play(Sfx.Chime, transform.position, 0.5f);
            CreatureReaction.For(this).Play();
            bool isNew = AppState.learned.Add(def.id);
            FactCardPanel.Show(def, this, isNew);
            if (WorldController.I != null) WorldController.I.OnLearned(def, isNew);
        }

        /// <summary>Pick up the renderers again after <see cref="CreatureReaction"/> has cut the model into parts.</summary>
        public void RefreshRenderers()
        {
            var list = new System.Collections.Generic.List<Renderer>();
            foreach (var r in GetComponentsInChildren<Renderer>())
                if (r.enabled) list.Add(r);
            renderers = list.ToArray();
            Apply();
        }

        void Apply()
        {
            if (renderers == null) return;
            if (mpb == null) mpb = new MaterialPropertyBlock();
            foreach (var r in renderers)
            {
                if (r == null) continue;
                r.GetPropertyBlock(mpb);
                mpb.SetFloat(Glow, glow);
                mpb.SetColor(Tint, tint);
                mpb.SetFloat(TintAmount, tintAmount);
                r.SetPropertyBlock(mpb);
            }
        }
    }
}
