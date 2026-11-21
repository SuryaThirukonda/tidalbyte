using System;
using UnityEngine;

namespace WishWorld
{
    /// <summary>Returns whatever was typed into the debug field (F2 in the editor) instead of listening.</summary>
    public class MockSpeechRecognizer : ISpeechRecognizer
    {
        /// <summary>Text the next StopListening call returns.</summary>
        public static string TypedText = "";
        public bool IsListening { get; private set; }
        public void StartListening() { IsListening = true; }
        public void StopListening(Action<string> onText, Action<string> onError)
        {
            IsListening = false;
            var t = TypedText;
            TypedText = "";
            if (string.IsNullOrWhiteSpace(t)) onError?.Invoke("Nothing was typed into the debug speech field.");
            else onText?.Invoke(t);
        }
    }

    /// <summary>The plan's keyword matcher: passes the words straight to the CommandRouter, which looks for known ones.</summary>
    public class KeywordCommandInterpreter : ICommandInterpreter
    {
        public void Interpret(string heard, Action<string> onCommandText) => onCommandText?.Invoke(heard ?? "");
    }

    /// <summary>Plays a short placeholder tone; the caption carries the words.</summary>
    public class MockTextToSpeech : ITextToSpeech
    {
        public void Speak(string text, Action<AudioClip> onClip) => onClip?.Invoke(Sfx.SpeechPlaceholder(text));
    }

    /// <summary>Returns the panorama already stored on the world's definition.</summary>
    public class MockSkyboxGenerator : ISkyboxGenerator
    {
        public void Generate(string worldId, string prompt, Action<Texture> onTexture)
        {
            var lib = WorldLibrary.I;
            var def = lib != null ? lib.FindWorld(worldId) : null;
            onTexture?.Invoke(def != null ? def.skyTexture : null);
        }
    }
}
