#if UNITY_EDITOR
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.InputSystem;

namespace WishWorld.DebugTools
{
    /// <summary>
    /// Keyboard and mouse for the editor-only desktop controls. Reads the real devices, and also
    /// accepts simulated keys and mouse positions so the controls can be exercised by script.
    /// </summary>
    public static class DebugKeys
    {
        public static readonly HashSet<Key> simHeld = new HashSet<Key>();
        static readonly List<Key> pendingTaps = new List<Key>();
        static readonly HashSet<Key> downNow = new HashSet<Key>();
        public static Vector2? simMouse;
        public static bool simLeft, simRight;
        /// <summary>True while the debug speech field has the keyboard.</summary>
        public static bool typing;

        public static void Tap(Key k) { pendingTaps.Add(k); }

        /// <summary>Called once at the start of each frame by DebugCommandKeys.</summary>
        public static void BeginFrame()
        {
            downNow.Clear();
            foreach (var k in pendingTaps) downNow.Add(k);
            pendingTaps.Clear();
        }

        public static bool Held(Key k)
        {
            if (simHeld.Contains(k)) return true;
            return !typing && Keyboard.current != null && Keyboard.current[k].isPressed;
        }

        public static bool Down(Key k)
        {
            if (downNow.Contains(k)) return true;
            return !typing && Keyboard.current != null && Keyboard.current[k].wasPressedThisFrame;
        }

        public static Vector2 MousePosition => simMouse ?? (Mouse.current != null ? Mouse.current.position.ReadValue() : Vector2.zero);
        public static bool LeftHeld => simLeft || (simMouse == null && Mouse.current != null && Mouse.current.leftButton.isPressed);
        public static bool RightHeld => simRight || (simMouse == null && Mouse.current != null && Mouse.current.rightButton.isPressed);
    }
}
#endif
