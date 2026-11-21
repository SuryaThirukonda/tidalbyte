#if UNITY_EDITOR
using System.Collections;
using System.Text;
using UnityEngine;
using UnityEngine.InputSystem;

namespace WishWorld.DebugTools
{
    /// <summary>
    /// Editor-only helper that drives the desktop controls by script (simulated mouse and keys),
    /// used for automated checks. It goes through the same input path a person at the keyboard uses.
    /// </summary>
    public class DebugDriver : MonoBehaviour
    {
        public static DebugDriver I { get; private set; }
        public static bool Busy { get; private set; }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void Register()
        {
            WWInput.Reset();
            WWInput.SteeringMode = false;
            WWInput.DesktopFactory = () => new DesktopInputSource();
            DesktopInputSource.pointerMode = false;
            DebugKeys.simHeld.Clear();
            DebugKeys.simMouse = null;
            DebugKeys.simLeft = DebugKeys.simRight = false;
            DebugKeys.typing = false;
            Busy = false;
        }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
        static void Spawn()
        {
            Application.targetFrameRate = 72;   // match the headset; an unfocused editor otherwise runs uncapped
            var go = new GameObject("WishWorld Debug Tools (editor only)");
            DontDestroyOnLoad(go);
            go.AddComponent<DebugCommandKeys>();
            I = go.AddComponent<DebugDriver>();
        }

        static Vector2 Screen(Vector3 world)
        {
            var p = XRRig.I.cam.WorldToScreenPoint(world);
            return new Vector2(p.x, p.y);
        }

        public static void Tap(Key k) => DebugKeys.Tap(k);

        public static void Hold(Key k, float seconds) => I.StartCoroutine(I.HoldRoutine(k, seconds));
        IEnumerator HoldRoutine(Key k, float seconds)
        {
            DebugKeys.simHeld.Add(k);
            yield return new WaitForSeconds(seconds);
            DebugKeys.simHeld.Remove(k);
        }

        public static void LookAt(Vector3 world) { if (DesktopInputSource.I != null) DesktopInputSource.I.LookAt(world); }

        /// <summary>Point the mouse-driven controller at a world position and pull the trigger.</summary>
        public static void ClickWorld(Vector3 world) => I.StartCoroutine(I.ClickRoutine(world));
        IEnumerator ClickRoutine(Vector3 world)
        {
            Busy = true;
            DebugKeys.simMouse = Screen(world);
            yield return null; yield return null; yield return null;
            DebugKeys.simMouse = Screen(world);
            DebugKeys.simLeft = true;
            yield return null; yield return null;
            DebugKeys.simLeft = false;
            yield return null;
            Busy = false;
        }

        /// <summary>Click the active button whose label matches. Returns false if there is none.</summary>
        public static bool ClickButton(string label)
        {
            foreach (var b in FindObjectsByType<WWButton>(FindObjectsSortMode.None))
            {
                if (!b.isActiveAndEnabled || !string.Equals(b.label, label, System.StringComparison.OrdinalIgnoreCase)) continue;
                LookAt(b.transform.position);
                I.StartCoroutine(I.ClickAfterLook(b.transform));
                return true;
            }
            return false;
        }
        IEnumerator ClickAfterLook(Transform t)
        {
            Busy = true;
            yield return null; yield return null;
            yield return ClickRoutine(t.position);
        }

        /// <summary>Sweep the controller between two world points, as a blade swing.</summary>
        public static void Swing(Vector3 from, Vector3 to, float seconds, bool leftHand = false) => I.StartCoroutine(I.SwingRoutine(from, to, seconds, leftHand));
        IEnumerator SwingRoutine(Vector3 from, Vector3 to, float seconds, bool leftHand)
        {
            Busy = true;
            if (leftHand) DebugKeys.simHeld.Add(Key.LeftShift);
            for (float t = 0; t < seconds; t += Time.deltaTime)
            {
                DebugKeys.simMouse = Vector2.Lerp(Screen(from), Screen(to), t / seconds);
                yield return null;
            }
            DebugKeys.simMouse = Screen(to);
            yield return null;
            if (leftHand) DebugKeys.simHeld.Remove(Key.LeftShift);
            Busy = false;
        }

        public static string Buttons()
        {
            var sb = new StringBuilder();
            foreach (var b in FindObjectsByType<WWButton>(FindObjectsSortMode.None))
                if (b.isActiveAndEnabled) sb.Append(b.label).Append(" | ");
            return sb.ToString();
        }
    }
}
#endif
