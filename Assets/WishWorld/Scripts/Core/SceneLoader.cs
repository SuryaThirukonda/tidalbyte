using System.Collections;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace WishWorld
{
    /// <summary>Fades to white, loads a scene, fades back.</summary>
    public class SceneLoader : MonoBehaviour
    {
        static SceneLoader inst;
        public static float FadeAlpha { get; private set; }
        public static bool Busy { get; private set; }

        public static void Load(string scene)
        {
            if (Busy) return;
            if (inst == null)
            {
                var go = new GameObject("SceneLoader");
                DontDestroyOnLoad(go);
                inst = go.AddComponent<SceneLoader>();
            }
            inst.StartCoroutine(inst.Run(scene));
        }

        public static void GoHub() => Load(AppState.SceneHub);

        IEnumerator Run(string scene)
        {
            Busy = true;
            yield return Fade(0f, 1f, 0.35f);
            var op = SceneManager.LoadSceneAsync(scene);
            if (op == null)
            {
                Debug.LogError("[WishWorld] Scene '" + scene + "' is not in the build list.");
            }
            else
            {
                while (!op.isDone) yield return null;
            }
            yield return null;
            yield return Fade(1f, 0f, 0.45f);
            Busy = false;
        }

        IEnumerator Fade(float from, float to, float seconds)
        {
            for (float t = 0; t < seconds; t += Time.unscaledDeltaTime)
            {
                FadeAlpha = Mathf.Lerp(from, to, t / seconds);
                if (XRRig.I != null) XRRig.I.SetFade(FadeAlpha);
                yield return null;
            }
            FadeAlpha = to;
            if (XRRig.I != null) XRRig.I.SetFade(FadeAlpha);
        }
    }
}
