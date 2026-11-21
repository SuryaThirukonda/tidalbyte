using System;
using UnityEngine;

namespace WishWorld
{
    /// <summary>The headset-specific part of passthrough. See MetaPassthroughProvider.</summary>
    public interface IPassthroughProvider
    {
        bool Available { get; }
        void SetEnabled(bool on);
    }

    public class NullPassthroughProvider : IPassthroughProvider
    {
        public bool Available => false;
        public void SetEnabled(bool on) { }
    }

    /// <summary>
    /// Switches between full VR (skybox drawn) and mixed reality (real room behind the scene).
    /// In the editor there is no real room, so a plain grey backdrop stands in for it.
    /// </summary>
    public class PassthroughToggle : MonoBehaviour
    {
        public static PassthroughToggle I { get; private set; }
        public static event Action<bool> Changed;
        public static readonly Color EditorBackdrop = new Color(0.42f, 0.43f, 0.45f, 1f);

        public bool startInPassthrough;
        public bool IsOn { get; private set; }
        public bool ProviderAvailable => provider != null && provider.Available;

        Camera cam;
        IPassthroughProvider provider;
        bool linkPassthrough;

        void Awake()
        {
            I = this;
            cam = GetComponentInChildren<Camera>();
#if WISHWORLD_META_XR && UNITY_ANDROID && !UNITY_EDITOR
            provider = new MetaPassthroughProvider(gameObject);
#elif WISHWORLD_META_XR
            provider = new NullPassthroughProvider();
            TryLinkPassthrough();
#else
            provider = new NullPassthroughProvider();
#endif
            Set(startInPassthrough);
        }

        void OnDestroy() { if (I == this) I = null; }

        static bool LinkRoomSupported()
        {
#if WISHWORLD_META_XR
            return OVRManager.IsInsightPassthroughSupported();
#else
            return false;
#endif
        }

#if WISHWORLD_META_XR
        void OnEnable() { WWInput.SourceChanged += OnHeadsetArrived; }
        void OnDisable() { WWInput.SourceChanged -= OnHeadsetArrived; }

        // The headset can become active after this object woke up (Link starts the session when it is put on).
        void OnHeadsetArrived() { if (TryLinkPassthrough()) Set(IsOn); }

        /// <summary>
        /// On a Windows PC through Meta Horizon Link the real room can be shown too, but only if passthrough over Link
        /// is switched on in the Link app. It is opt-in (.env: WISHWORLD_LINK_PASSTHROUGH=on); otherwise the grey
        /// backdrop is used, as in the editor without a headset. Returns true when it switched to real passthrough.
        /// </summary>
        bool TryLinkPassthrough()
        {
            if (linkPassthrough) return false;
            bool windows = Application.platform == RuntimePlatform.WindowsEditor || Application.platform == RuntimePlatform.WindowsPlayer;
            if (!windows || !UnityEngine.XR.XRSettings.isDeviceActive) return false;
            if (EnvConfig.Get("WISHWORLD_LINK_PASSTHROUGH", "off").ToLowerInvariant() != "on") return false;
            provider = new MetaPassthroughProvider(gameObject);
            linkPassthrough = true;
            Debug.Log("[WishWorld] Passthrough over Link is on: AR scenes show the real room.");
            return true;
        }
#endif

        public void Toggle() => Set(!IsOn);

        public void Set(bool on)
        {
            IsOn = on;
            // Through Link the room only shows if the Link app allows passthrough (a developer-account setting).
            // When it does not, keep the grey backdrop instead of leaving the player in a black void.
            bool linkRoom = linkPassthrough && LinkRoomSupported();
            if (cam != null)
            {
                if (on)
                {
                    cam.clearFlags = CameraClearFlags.SolidColor;
                    // Alpha 0 lets the headset's passthrough layer show through. The editor has no room to show.
                    cam.backgroundColor = Application.isEditor && !linkRoom ? EditorBackdrop : new Color(0, 0, 0, 0);
                }
                else
                {
                    cam.clearFlags = CameraClearFlags.Skybox;
                }
                // The PC render settings use an HDR colour buffer with no alpha channel, which would hide the
                // room behind opaque black. Drop to the 8-bit buffer (which has alpha) while the room is shown.
                if (linkRoom) cam.allowHDR = !on;
            }
            provider.SetEnabled(on);
            Changed?.Invoke(on);
        }
    }
}
