#if UNITY_EDITOR
using UnityEngine;
using UnityEngine.InputSystem;

namespace WishWorld.DebugTools
{
    /// <summary>
    /// Editor-only stand-in for the headset. Never compiled into a device build.
    ///   Right mouse drag: look.   W A S D, Q E: move the head.
    ///   Mouse: moves the right controller (hold Left Shift for the left one). Left click: trigger.
    ///   F: A/X button (push-to-talk).   C: B/Y button.   PageUp / PageDown: reach further / nearer.
    ///   While racing: A D steer the two controllers like a wheel, W throttle, S brake.
    /// </summary>
    public class DesktopInputSource : IInputSource
    {
        public static DesktopInputSource I { get; private set; }

        public float yaw, pitch;
        public float reach = 0.5f;
        /// <summary>
        /// When true the mouse-driven controller is held low, as a hand would be, and aims a ray at whatever is
        /// under the cursor, instead of floating on the cursor ray. Used for the recorded demos so the
        /// controller does not hide what it points at. Blades and reaching use the default (false).
        /// </summary>
        public static bool pointerMode;
        public float steer;

        Vector3 headPos;
        Quaternion headRot = Quaternion.identity;
        HandState l, r;
        Vector2 lastMouse;
        int rigId;

        public DesktopInputSource() { I = this; }

        public string Name => "Desktop";
        public bool IsDesktop => true;
        public Vector3 HeadPosition => headPos;
        public Quaternion HeadRotation => headRot;
        public HandState Left => l;
        public HandState Right => r;
        public void Haptic(bool left, float amplitude, float seconds) { LastHaptic = Time.time; HapticCount++; }
        public static float LastHaptic { get; private set; }
        public static int HapticCount { get; private set; }

        public void LookAt(Vector3 worldPoint)
        {
            var rig = XRRig.I;
            if (rig == null) return;
            var local = rig.transform.InverseTransformPoint(worldPoint) - headPos;
            if (local.sqrMagnitude < 1e-6f) return;
            var e = Quaternion.LookRotation(local.normalized, Vector3.up).eulerAngles;
            yaw = e.y;
            pitch = e.x > 180 ? e.x - 360 : e.x;
            headRot = Quaternion.Euler(pitch, yaw, 0);
            rig.head.localRotation = headRot;
        }

        public void Poll()
        {
            var rig = XRRig.I;
            if (rig == null) return;
            if (rig.GetInstanceID() != rigId)
            {
                // New scene, new rig: start standing (or seated) at the origin, facing forward.
                rigId = rig.GetInstanceID();
                headPos = new Vector3(0, rig.seated ? 1.15f : 1.6f, 0);
                yaw = pitch = 0; steer = 0;
                lastMouse = DebugKeys.MousePosition;
            }
            float dt = Time.unscaledDeltaTime;

            var mouse = DebugKeys.MousePosition;
            var delta = mouse - lastMouse;
            lastMouse = mouse;
            if (DebugKeys.RightHeld)
            {
                yaw += delta.x * 0.2f;
                pitch = Mathf.Clamp(pitch - delta.y * 0.2f, -85f, 85f);
            }
            headRot = Quaternion.Euler(pitch, yaw, 0);
            var yawRot = Quaternion.Euler(0, yaw, 0);

            if (DebugKeys.Held(Key.PageUp)) reach = Mathf.Min(1.2f, reach + dt * 0.5f);
            if (DebugKeys.Held(Key.PageDown)) reach = Mathf.Max(0.2f, reach - dt * 0.5f);

            l.tracked = r.tracked = true;
            if (WWInput.SteeringMode)
            {
                float target = (DebugKeys.Held(Key.D) ? 1f : 0f) - (DebugKeys.Held(Key.A) ? 1f : 0f);
                steer = Mathf.MoveTowards(steer, target, dt * 3f);
                var roll = Quaternion.AngleAxis(-steer * 55f, Vector3.forward);
                l.position = WWInput.SteeringWheelCenter + roll * new Vector3(-0.17f, 0, 0);
                r.position = WWInput.SteeringWheelCenter + roll * new Vector3(0.17f, 0, 0);
                l.rotation = r.rotation = roll;
                r.trigger = DebugKeys.Held(Key.W) ? 1f : 0f;
                l.trigger = DebugKeys.Held(Key.S) ? 1f : 0f;
                l.primary = r.primary = l.secondary = r.secondary = false;
            }
            else
            {
                var move = Vector3.zero;
                if (DebugKeys.Held(Key.W)) move.z += 1;
                if (DebugKeys.Held(Key.S)) move.z -= 1;
                if (DebugKeys.Held(Key.D)) move.x += 1;
                if (DebugKeys.Held(Key.A)) move.x -= 1;
                if (DebugKeys.Held(Key.E)) move.y += 1;
                if (DebugKeys.Held(Key.Q)) move.y -= 1;
                headPos += yawRot * move * (2f * dt);

                // The active controller sits on the ray through the mouse cursor, pointing along it.
                var world = rig.cam.ScreenPointToRay(new Vector3(mouse.x, mouse.y, 0));
                var dir = rig.transform.InverseTransformDirection(world.direction).normalized;
                bool leftActive = DebugKeys.Held(Key.LeftShift);
                var handPos = headPos + dir * reach;
                var handRot = Quaternion.LookRotation(dir, Vector3.up);
                if (pointerMode)
                {
                    // Aim from hip height at the first thing under the cursor (menus first, like the real pointer).
                    Vector3 target = world.GetPoint(2.5f);
                    if (Physics.Raycast(world, out var hit, 12f, 1 << WWUI.UILayer, QueryTriggerInteraction.Collide)
                        || Physics.Raycast(world, out hit, 12f, ~0, QueryTriggerInteraction.Collide)) target = hit.point;
                    handPos = headPos + yawRot * new Vector3(leftActive ? -0.2f : 0.2f, -0.3f, 0.36f);
                    var to = rig.transform.InverseTransformPoint(target) - handPos;
                    if (to.sqrMagnitude > 1e-4f) handRot = Quaternion.LookRotation(to.normalized, Vector3.up);
                }
                var active = new HandState
                {
                    tracked = true,
                    position = handPos,
                    rotation = handRot,
                    trigger = DebugKeys.LeftHeld ? 1f : 0f,
                    primary = DebugKeys.Held(Key.F),
                    secondary = DebugKeys.Held(Key.C),
                };
                var rest = new HandState { tracked = true, rotation = yawRot * Quaternion.Euler(-20f, 0, 0) };
                if (leftActive)
                {
                    l = active;
                    rest.position = headPos + yawRot * new Vector3(0.24f, -0.38f, 0.32f);
                    r = rest;
                }
                else
                {
                    r = active;
                    rest.position = headPos + yawRot * new Vector3(-0.24f, -0.38f, 0.32f);
                    l = rest;
                }
            }
            l.aimPosition = l.position; l.aimRotation = l.rotation;
            r.aimPosition = r.position; r.aimRotation = r.rotation;
        }
    }
}
#endif
