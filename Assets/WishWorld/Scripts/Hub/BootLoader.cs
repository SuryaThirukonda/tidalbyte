using System.Collections;
using UnityEngine;

namespace WishWorld
{
    /// <summary>First scene: makes sure settings and services exist, then opens the hub.</summary>
    public class BootLoader : MonoBehaviour
    {
        IEnumerator Start()
        {
            Application.targetFrameRate = 72;
            var config = Services.Config;   // loads the config asset (or defaults) once
            Debug.Log("[WishWorld] Boot. Services: speech=" + (config.useRealSpeechRecognition ? "real" : "mock")
                      + " interpreter=" + (config.useRealCommandInterpreter ? "real" : "mock")
                      + " tts=" + (config.useRealTextToSpeech ? "real" : "mock")
                      + " skybox=" + (config.useRealSkyboxGenerator ? "real" : "mock")
                      + ". Input: " + WWInput.Source.Name + " (WISHWORLD_INPUT=" + EnvConfig.Get("WISHWORLD_INPUT", "ovr") + ")");
            yield return null;
            yield return null;
            SceneLoader.Load(AppState.SceneHub);
        }
    }
}
