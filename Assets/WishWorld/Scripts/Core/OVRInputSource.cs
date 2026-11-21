// Controller input through Meta's OVRInput. Compiled when the Meta XR Core SDK is present
// (WISHWORLD_META_XR); only ever created on the headset, because the Linux editor has no Meta plugin.
// Selected with WISHWORLD_INPUT=ovr in .env (the default). Never run on a headset yet.
#if WISHWORLD_META_XR
using UnityEngine;

namespace WishWorld
{
    /// <summary>Makes sure Meta's OVRManager exists. OVRInput only reports and vibrates correctly with one in the scene.</summary>
    public static class MetaRuntime
    {
        public static OVRManager EnsureManager()
        {
            var m = OVRManager.instance;
            if (m != null) return m;
            m = Object.FindFirstObjectByType<OVRManager>();
            if (m == null && XRRig.I != null) m = XRRig.I.gameObject.AddComponent<OVRManager>();
            return m;
        }
    }

    public class OVRInputSource : IInputSource
    {
        // Head pose and the OpenXR aim poses still come from Unity's devices; OVRInput has neither.
        readonly XRInputSource xr = new XRInputSource();
        HandState l, r;
        float stopL, stopR, missingSince = -1f;
        int lastFrame = -1;

        public string Name => "OVRInput";
        public bool IsDesktop => false;
        public Vector3 HeadPosition => xr.HeadPosition;
        public Quaternion HeadRotation => xr.HeadRotation;
        public HandState Left => l;
        public HandState Right => r;

        /// <summary>True when OVRInput has seen no controller for a few seconds while Unity's devices do.</summary>
        public bool ShouldFallBack { get; private set; }

        public void Poll()
        {
            MetaRuntime.EnsureManager();   // OVRManager also calls OVRInput.Update(); this class must not.
            xr.Poll();
            bool firstThisFrame = Time.frameCount != lastFrame;
            lastFrame = Time.frameCount;
            Read(OVRInput.Controller.LTouch, ref l, xr.Left, firstThisFrame);
            Read(OVRInput.Controller.RTouch, ref r, xr.Right, firstThisFrame);
            if (!firstThisFrame) return;

            float now = Time.unscaledTime;
            if (stopL > 0 && now >= stopL) { OVRInput.SetControllerVibration(0, 0, OVRInput.Controller.LTouch); stopL = 0; }
            if (stopR > 0 && now >= stopR) { OVRInput.SetControllerVibration(0, 0, OVRInput.Controller.RTouch); stopR = 0; }

            bool ovrSees = l.tracked || r.tracked;
            bool unitySees = xr.Left.tracked || xr.Right.tracked;
            if (!ovrSees && unitySees)
            {
                if (missingSince < 0) missingSince = now;
                else if (now - missingSince > 3f) ShouldFallBack = true;
            }
            else missingSince = -1f;
        }

        static void Read(OVRInput.Controller c, ref HandState h, HandState unity, bool readButtons)
        {
            h.tracked = OVRInput.IsControllerConnected(c);
            if (!h.tracked) { h.trigger = h.grip = 0; h.primary = h.secondary = false; return; }
            h.position = OVRInput.GetLocalControllerPosition(c);
            h.rotation = OVRInput.GetLocalControllerRotation(c);
            if (unity.tracked) { h.aimPosition = unity.aimPosition; h.aimRotation = unity.aimRotation; }
            else { h.aimPosition = h.position; h.aimRotation = h.rotation * Quaternion.Euler(35f, 0, 0); }
            if (!readButtons) return;
            h.trigger = OVRInput.Get(OVRInput.Axis1D.PrimaryIndexTrigger, c);
            h.grip = OVRInput.Get(OVRInput.Axis1D.PrimaryHandTrigger, c);
            h.primary = OVRInput.Get(OVRInput.Button.One, c);      // A on the right controller, X on the left
            h.secondary = OVRInput.Get(OVRInput.Button.Two, c);    // B / Y
            h.stick = OVRInput.Get(OVRInput.Axis2D.PrimaryThumbstick, c);
        }

        public void Haptic(bool left, float amplitude, float seconds)
        {
            var c = left ? OVRInput.Controller.LTouch : OVRInput.Controller.RTouch;
            OVRInput.SetControllerVibration(1f, Mathf.Clamp01(amplitude), c);
            // OVRInput vibration has no duration, so it is switched off again in Poll.
            if (left) stopL = Time.unscaledTime + seconds; else stopR = Time.unscaledTime + seconds;
        }
    }
}
#endif
