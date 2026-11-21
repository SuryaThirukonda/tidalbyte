using System.Collections.Generic;
using UnityEngine;

namespace WishWorld
{
    /// <summary>
    /// The player: head camera and two controllers. Applies poses from WWInput, casts the pointer
    /// rays that click WWButtons and creatures, tracks what the head is looking at, and owns the fade quad.
    /// </summary>
    [DefaultExecutionOrder(-100)]
    public class XRRig : MonoBehaviour
    {
        public static XRRig I { get; private set; }

        public Transform head, leftHand, rightHand;
        public Camera cam;
        [Tooltip("Seated experiences (the racer) use a lower desktop head height.")]
        public bool seated;
        public bool pointersEnabled = true;

        /// <summary>Collider the head has been looking at, and for how long.</summary>
        public Collider gazeCollider { get; private set; }
        public float gazeSeconds { get; private set; }

        Transform recenterAnchor;
        bool recenterMatchHeight;
        float recenterEye;
        LineRenderer leftLine, rightLine;
        IPointerTarget leftHover, rightHover;
        Renderer fade;
        MaterialPropertyBlock fadeBlock;
        readonly HashSet<WWButton> poked = new HashSet<WWButton>();
        readonly List<WWButton> pokeScratch = new List<WWButton>();
        static readonly Collider[] overlap = new Collider[8];
        static readonly int BaseColor = Shader.PropertyToID("_BaseColor");

        public Vector3 HeadPosition => head.position;
        public Vector3 HeadForwardFlat
        {
            get
            {
                var f = head.forward; f.y = 0;
                return f.sqrMagnitude < 1e-4f ? transform.forward : f.normalized;
            }
        }
        public Transform Hand(bool left) => left ? leftHand : rightHand;

        void Awake()
        {
            I = this;
            if (cam == null) cam = GetComponentInChildren<Camera>();
            cam.nearClipPlane = 0.05f;
            leftLine = MakeLine("LeftRay");
            rightLine = MakeLine("RightRay");
            MakeFade();
            SetFade(SceneLoader.FadeAlpha);
        }

        void OnEnable() { Application.onBeforeRender += BeforeRender; WWInput.SourceChanged += OnSourceChanged; }
        void OnDisable() { Application.onBeforeRender -= BeforeRender; WWInput.SourceChanged -= OnSourceChanged; }
        void OnDestroy() { if (I == this) I = null; }

        // The headset took over from the desktop fallback: measure from the floor again, then stand the
        // player back on the scene's anchor once tracking has had a moment to settle.
        float recenterAt = -1f;
        void OnSourceChanged()
        {
            originCheckUntil = -1f;
            recenterAt = Time.unscaledTime + 0.75f;
        }

        void Update()
        {
            WWInput.Poll();
#if !UNITY_ANDROID || UNITY_EDITOR
            // On a PC through Link the headset's runtime paces the frames. A fixed cap that differs from the
            // headset's refresh rate (Link can run at 72, 80, 90 or 120) makes the view judder, so drop the cap.
            if (!WWInput.IsDesktop && Application.targetFrameRate != -1) Application.targetFrameRate = -1;
#endif
            EnsureFloorOrigin();
            ApplyPoses();
            if (recenterAt > 0 && Time.unscaledTime >= recenterAt)
            {
                recenterAt = -1f;
                if (recenterAnchor != null) Recenter(recenterAnchor, recenterMatchHeight, recenterEye);
            }
            if (recenterAnchor != null && WWInput.SecondaryDown(true)) Recenter(recenterAnchor, recenterMatchHeight, recenterEye);
            UpdatePointer(true, ref leftHover, leftLine);
            UpdatePointer(false, ref rightHover, rightLine);
            UpdatePoke();
            UpdateGaze();
        }

        // The rig stands on the floor, so tracking must be measured from the floor too (OpenXR may start at eye level).
        static readonly List<UnityEngine.XR.XRInputSubsystem> xrInputs = new List<UnityEngine.XR.XRInputSubsystem>();
        float originCheckUntil = -1f;
        void EnsureFloorOrigin()
        {
            if (WWInput.IsDesktop) return;
            if (originCheckUntil < 0) originCheckUntil = Time.unscaledTime + 5f;
            if (Time.unscaledTime > originCheckUntil) return;
            SubsystemManager.GetSubsystems(xrInputs);
            foreach (var x in xrInputs)
                if (x.GetTrackingOriginMode() != UnityEngine.XR.TrackingOriginModeFlags.Floor)
                    x.TrySetTrackingOriginMode(UnityEngine.XR.TrackingOriginModeFlags.Floor);
        }

        // Re-read tracking right before rendering so the view does not lag the head.
        void BeforeRender()
        {
            if (WWInput.IsDesktop) return;
            WWInput.Source.Poll();
            ApplyPoses();
        }

        void ApplyPoses()
        {
            var s = WWInput.Source;
            head.localPosition = s.HeadPosition;
            head.localRotation = s.HeadRotation;
            ApplyHand(leftHand, s.Left);
            ApplyHand(rightHand, s.Right);
        }

        static void ApplyHand(Transform t, HandState h)
        {
            if (t.gameObject.activeSelf != h.tracked) t.gameObject.SetActive(h.tracked);
            if (!h.tracked) return;
            t.localPosition = h.position;
            t.localRotation = h.rotation;
        }

        /// <summary>
        /// Turn and move the whole rig so the player's head is above <paramref name="floorPoint"/> and
        /// facing <paramref name="forward"/>. With matchHeight the head is also put at eyeHeight (seated games).
        /// </summary>
        public void Recenter(Vector3 floorPoint, Vector3 forward, bool matchHeight, float eyeHeight = 1.15f)
        {
            var s = WWInput.Source;
            forward.y = 0;
            if (forward.sqrMagnitude < 1e-4f) forward = Vector3.forward;
            float targetYaw = Quaternion.LookRotation(forward.normalized, Vector3.up).eulerAngles.y;
            transform.rotation = Quaternion.Euler(0, targetYaw - s.HeadRotation.eulerAngles.y, 0);
            var local = s.HeadPosition;
            var offset = transform.rotation * new Vector3(local.x, matchHeight ? local.y : 0f, local.z);
            transform.position = floorPoint + (matchHeight ? Vector3.up * eyeHeight : Vector3.zero) - offset;
            ApplyPoses();
        }

        /// <summary>
        /// Recenter on an anchor and remember it: pressing Y on the left controller repeats it, for when
        /// the player has turned around or tracking started late.
        /// </summary>
        public void Recenter(Transform anchor, bool matchHeight, float eyeHeight = 1.15f)
        {
            recenterAnchor = anchor;
            recenterMatchHeight = matchHeight;
            recenterEye = eyeHeight;
            Recenter(anchor.position, anchor.forward, matchHeight, eyeHeight);
        }

        /// <summary>World-space ray a controller points along.</summary>
        public Ray Aim(bool left)
        {
            var h = WWInput.Hand(left);
            return new Ray(transform.TransformPoint(h.aimPosition), transform.rotation * h.aimRotation * Vector3.forward);
        }

        void UpdatePointer(bool left, ref IPointerTarget hovered, LineRenderer line)
        {
            var h = WWInput.Hand(left);
            IPointerTarget target = null;
            Vector3 end = Vector3.zero;
            Ray ray = default;
            if (pointersEnabled && h.tracked && !SceneLoader.Busy)
            {
                ray = Aim(left);
                // Menus win over creatures: a giant shark drifting past must not block a button.
                if (Physics.Raycast(ray, out var hit, 10f, 1 << WWUI.UILayer, QueryTriggerInteraction.Collide)
                    || Physics.Raycast(ray, out hit, 10f, ~0, QueryTriggerInteraction.Collide))
                {
                    target = hit.collider.GetComponentInParent<IPointerTarget>();
                    end = hit.point;
                }
            }
            if (!ReferenceEquals(target, hovered))
            {
                if (hovered != null && (hovered as Object) != null) hovered.OnHover(false);
                hovered = target;
                if (hovered != null) hovered.OnHover(true);
            }
            line.enabled = target != null;
            if (target != null)
            {
                line.SetPosition(0, ray.origin);
                line.SetPosition(1, end);
                if (WWInput.TriggerDown(left)) target.OnClick();
            }
        }

        // Pushing a controller into a button also presses it.
        void UpdatePoke()
        {
            pokeScratch.Clear();
            if (pointersEnabled && !SceneLoader.Busy)
            {
                for (int i = 0; i < 2; i++)
                {
                    bool left = i == 0;
                    if (!WWInput.Hand(left).tracked || WWInput.IsDesktop) continue;
                    var tip = Hand(left).position + Aim(left).direction * 0.04f;
                    int n = Physics.OverlapSphereNonAlloc(tip, 0.03f, overlap, 1 << WWUI.UILayer, QueryTriggerInteraction.Collide);
                    for (int k = 0; k < n; k++)
                    {
                        var b = overlap[k].GetComponentInParent<WWButton>();
                        if (b == null) continue;
                        pokeScratch.Add(b);
                        if (poked.Add(b))
                        {
                            b.OnClick();
                            WWInput.Haptic(left, 0.4f, 0.04f);
                        }
                    }
                }
            }
            poked.RemoveWhere(b => b == null || !pokeScratch.Contains(b));
        }

        void UpdateGaze()
        {
            Collider c = null;
            if (Physics.Raycast(head.position, head.forward, out var hit, 12f, ~0, QueryTriggerInteraction.Collide)) c = hit.collider;
            if (c == gazeCollider) gazeSeconds += Time.deltaTime;
            else { gazeCollider = c; gazeSeconds = 0; }
        }

        LineRenderer MakeLine(string name)
        {
            var go = new GameObject(name);
            go.transform.SetParent(transform, false);
            var l = go.AddComponent<LineRenderer>();
            l.useWorldSpace = true;
            l.positionCount = 2;
            l.startWidth = 0.006f;
            l.endWidth = 0.003f;
            l.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            var theme = WWTheme.I;
            if (theme != null) { l.sharedMaterial = theme.line; l.startColor = l.endColor = theme.peach; }
            l.enabled = false;
            return l;
        }

        void MakeFade()
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Quad);
            go.name = "Fade";
            Destroy(go.GetComponent<Collider>());
            go.layer = 2; // Ignore Raycast
            go.transform.SetParent(head, false);
            go.transform.localPosition = new Vector3(0, 0, 0.12f);
            go.transform.localScale = new Vector3(2f, 2f, 1f);
            fade = go.GetComponent<Renderer>();
            fade.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            var theme = WWTheme.I;
            if (theme != null) fade.sharedMaterial = theme.overlay;
            fadeBlock = new MaterialPropertyBlock();
            fade.enabled = false;
        }

        public void SetFade(float alpha)
        {
            if (fade == null) return;
            fade.enabled = alpha > 0.002f;
            fadeBlock.SetColor(BaseColor, new Color(1, 1, 1, Mathf.Clamp01(alpha)));
            fade.SetPropertyBlock(fadeBlock);
        }
    }
}
