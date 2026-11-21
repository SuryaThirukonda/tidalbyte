using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.XR;

namespace WishWorld
{
    /// <summary>One controller's state. Poses are local to the rig (tracking space).</summary>
    public struct HandState
    {
        public bool tracked;
        public Vector3 position;
        public Quaternion rotation;
        /// <summary>Pose to cast pointer rays from (aim pose on device, same as grip on desktop).</summary>
        public Vector3 aimPosition;
        public Quaternion aimRotation;
        public float trigger, grip;
        public bool primary, secondary;   // A/X and B/Y
        public Vector2 stick;
    }

    public interface IInputSource
    {
        string Name { get; }
        bool IsDesktop { get; }
        void Poll();
        Vector3 HeadPosition { get; }
        Quaternion HeadRotation { get; }
        HandState Left { get; }
        HandState Right { get; }
        void Haptic(bool left, float amplitude, float seconds);
    }

    /// <summary>
    /// Single entry point for head and controller input. On the headset it reads the XR devices.
    /// In the Unity editor with no headset it uses the desktop fallback (registered by editor-only code).
    /// </summary>
    public static class WWInput
    {
        /// <summary>Set by the editor-only desktop layer. Null in device builds.</summary>
        public static Func<IInputSource> DesktopFactory;

        /// <summary>Raised when the input source is replaced mid-session (desktop fallback handing over to the headset).</summary>
        public static event Action SourceChanged;

        /// <summary>Set by the racer while driving. The desktop fallback then maps A/D/W/S to a steering wheel.</summary>
        public static bool SteeringMode;
        /// <summary>Rig-local centre of the steering wheel, set by the racer for the desktop fallback.</summary>
        public static Vector3 SteeringWheelCenter = new Vector3(0f, 0.95f, 0.42f);

        static IInputSource source;
        static int polledFrame = -1;
        static HandState prevL, prevR, curL, curR;
        const float PressThreshold = 0.55f;

        public static IInputSource Source
        {
            get
            {
                if (source == null) source = Create();
                return source;
            }
        }

        public static bool IsDesktop => Source.IsDesktop;

        static IInputSource Create()
        {
#if UNITY_EDITOR
            if (!XRSettings.isDeviceActive && DesktopFactory != null) return DesktopFactory();
#endif
#if WISHWORLD_META_XR && UNITY_ANDROID && !UNITY_EDITOR
            // .env: WISHWORLD_INPUT=ovr (default) uses Meta's OVRInput; openxr uses Unity's XR devices.
            if (EnvConfig.Get("WISHWORLD_INPUT", "ovr").ToLowerInvariant() != "openxr") return new OVRInputSource();
#endif
            return new XRInputSource();
        }

        /// <summary>Drop the cached source (used when entering play mode in the editor).</summary>
        public static void Reset() { source = null; polledFrame = -1; prevL = prevR = curL = curR = default; }

        public static void Poll()
        {
            if (polledFrame == Time.frameCount) return;
            polledFrame = Time.frameCount;
            prevL = curL; prevR = curR;
#if UNITY_EDITOR
            // Through Link the headset can become active a few frames after Play starts, by which time the
            // desktop fallback has already been chosen. Hand over to the headset as soon as it is there.
            if (Source.IsDesktop && XRSettings.isDeviceActive)
            {
                Debug.Log("[WishWorld] Headset became active after start. Switching from desktop controls to the headset.");
                source = new XRInputSource();
                SourceChanged?.Invoke();
            }
#endif
            Source.Poll();
#if WISHWORLD_META_XR
            if (source is OVRInputSource ovr && ovr.ShouldFallBack)
            {
                Debug.LogWarning("[WishWorld] OVRInput reported no controllers while OpenXR did. Switching to the OpenXR input path.");
                source = new XRInputSource();
                source.Poll();
            }
#endif
            curL = Source.Left; curR = Source.Right;
        }

        public static HandState Hand(bool left) => left ? curL : curR;
        static HandState Prev(bool left) => left ? prevL : prevR;

        public static bool TriggerHeld(bool left) => Hand(left).trigger > PressThreshold;
        public static bool TriggerDown(bool left) => Hand(left).trigger > PressThreshold && Prev(left).trigger <= PressThreshold;
        public static bool TriggerUp(bool left) => Hand(left).trigger <= PressThreshold && Prev(left).trigger > PressThreshold;
        public static bool PrimaryHeld(bool left) => Hand(left).primary;
        public static bool PrimaryDown(bool left) => Hand(left).primary && !Prev(left).primary;
        public static bool PrimaryUp(bool left) => !Hand(left).primary && Prev(left).primary;
        public static bool SecondaryDown(bool left) => Hand(left).secondary && !Prev(left).secondary;

        public static void Haptic(bool left, float amplitude, float seconds) => Source.Haptic(left, amplitude, seconds);
    }

    /// <summary>Reads the headset and controllers through Unity's XR input devices (works with OpenXR).</summary>
    public class XRInputSource : IInputSource
    {
        static readonly InputFeatureUsage<Vector3> PointerPosition = new InputFeatureUsage<Vector3>("PointerPosition");
        static readonly InputFeatureUsage<Quaternion> PointerRotation = new InputFeatureUsage<Quaternion>("PointerRotation");

        InputDevice head, left, right;
        HandState l, r;
        Vector3 headPos = new Vector3(0, 1.6f, 0);
        Quaternion headRot = Quaternion.identity;

        public string Name => "XR";
        public bool IsDesktop => false;
        public Vector3 HeadPosition => headPos;
        public Quaternion HeadRotation => headRot;
        public HandState Left => l;
        public HandState Right => r;

        public void Poll()
        {
            if (!head.isValid) head = InputDevices.GetDeviceAtXRNode(XRNode.Head);
            if (!left.isValid) left = InputDevices.GetDeviceAtXRNode(XRNode.LeftHand);
            if (!right.isValid) right = InputDevices.GetDeviceAtXRNode(XRNode.RightHand);

            if (head.isValid)
            {
                if (head.TryGetFeatureValue(CommonUsages.centerEyePosition, out var p) || head.TryGetFeatureValue(CommonUsages.devicePosition, out p)) headPos = p;
                if (head.TryGetFeatureValue(CommonUsages.centerEyeRotation, out var q) || head.TryGetFeatureValue(CommonUsages.deviceRotation, out q)) headRot = q;
            }
            ReadHand(left, ref l);
            ReadHand(right, ref r);
        }

        static void ReadHand(InputDevice d, ref HandState h)
        {
            if (!d.isValid) { h.tracked = false; h.trigger = h.grip = 0; h.primary = h.secondary = false; return; }
            bool gotPos = d.TryGetFeatureValue(CommonUsages.devicePosition, out var p);
            bool gotRot = d.TryGetFeatureValue(CommonUsages.deviceRotation, out var q);
            h.tracked = gotPos && gotRot;
            if (gotPos) h.position = p;
            if (gotRot) h.rotation = q;
            if (d.TryGetFeatureValue(PointerPosition, out var ap) && d.TryGetFeatureValue(PointerRotation, out var aq))
            {
                h.aimPosition = ap; h.aimRotation = aq;
            }
            else
            {
                // No aim pose reported: point slightly down from the grip, which is how a Touch controller is held.
                h.aimPosition = h.position;
                h.aimRotation = h.rotation * Quaternion.Euler(35f, 0, 0);
            }
            d.TryGetFeatureValue(CommonUsages.trigger, out h.trigger);
            d.TryGetFeatureValue(CommonUsages.grip, out h.grip);
            d.TryGetFeatureValue(CommonUsages.primaryButton, out h.primary);
            d.TryGetFeatureValue(CommonUsages.secondaryButton, out h.secondary);
            d.TryGetFeatureValue(CommonUsages.primary2DAxis, out h.stick);
        }

        public void Haptic(bool leftHand, float amplitude, float seconds)
        {
            var d = leftHand ? left : right;
            if (d.isValid) d.SendHapticImpulse(0u, Mathf.Clamp01(amplitude), seconds);
        }
    }
}
