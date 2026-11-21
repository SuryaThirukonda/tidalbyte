using System;
using System.Collections;
using UnityEngine;

namespace WishWorld
{
    /// <summary>Turns speech into text. Used with push-to-talk: start on press, stop on release.</summary>
    public interface ISpeechRecognizer
    {
        bool IsListening { get; }
        void StartListening();
        void StopListening(Action<string> onText, Action<string> onError);
    }

    /// <summary>Turns what was heard into text made of words the CommandRouter knows.</summary>
    public interface ICommandInterpreter
    {
        void Interpret(string heard, Action<string> onCommandText);
    }

    public interface ITextToSpeech
    {
        void Speak(string text, Action<AudioClip> onClip);
    }

    public interface ISkyboxGenerator
    {
        /// <summary>Returns a 360 panorama for a world. The mock returns the pre-made one.</summary>
        void Generate(string worldId, string prompt, Action<Texture> onTexture);
    }

    /// <summary>
    /// Where the rest of the app gets its services. Each one is the mock unless its switch is on
    /// in the config asset AND its key is filled in.
    /// </summary>
    public static class Services
    {
        static WishWorldServiceConfig config;
        static ISpeechRecognizer speech;
        static ICommandInterpreter interpreter;
        static ITextToSpeech tts;
        static ISkyboxGenerator skybox;
        static ServiceRunner runner;

        /// <summary>Words the interpreter may answer with. Filled in by the CommandRouter.</summary>
        public static string Vocabulary = "";
        /// <summary>The preset choices by kind, for an interpreter that must pick from them. Filled in by the CommandRouter.</summary>
        public static WishOptions Options;
        /// <summary>What the player is looking at now (world, creatures, their facts), so the interpreter can answer questions about it.</summary>
        public static string Context = "";

        public static WishWorldServiceConfig Config
        {
            get { if (config == null) config = WishWorldServiceConfig.Load(); return config; }
        }

        public static ISpeechRecognizer Speech => speech ?? (speech =
            Use(Config.useRealSpeechRecognition, Config.speechApiKey, "speech recognition")
                ? new CloudSpeechRecognizer(Config) : (ISpeechRecognizer)new MockSpeechRecognizer());

        // Claude when its key is present, otherwise Gemini when its key is present, otherwise the keyword matcher alone.
        public static ICommandInterpreter Interpreter => interpreter ?? (interpreter =
            Config.useRealCommandInterpreter && !string.IsNullOrEmpty(Config.claudeApiKey) ? new ClaudeCommandInterpreter(Config)
            : Use(Config.useRealCommandInterpreter, Config.interpreterApiKey, "command interpretation")
                ? new GeminiCommandInterpreter(Config) : (ICommandInterpreter)new KeywordCommandInterpreter());

        // Recorded lines first (the voice bank), then the live service for anything not recorded.
        public static ITextToSpeech Tts => tts ?? (tts = new BankedTextToSpeech(
            Use(Config.useRealTextToSpeech, Config.ttsApiKey, "text to speech")
                ? new ElevenLabsTextToSpeech(Config) : (ITextToSpeech)new MockTextToSpeech()));

        /// <summary>Whether a line can be spoken in a real voice (recorded, or live text to speech is on). Voice-only lines are skipped otherwise.</summary>
        public static bool CanSpeak(string text) => Tts is BankedTextToSpeech b && b.CanSpeak(text);

        public static ISkyboxGenerator Skybox => skybox ?? (skybox =
            Use(Config.useRealSkyboxGenerator, Config.skyboxApiKey, "skybox generation")
                ? new BlockadeSkyboxGenerator(Config) : (ISkyboxGenerator)new MockSkyboxGenerator());

        static bool Use(bool wanted, string key, string what)
        {
            if (!wanted) return false;
            if (!string.IsNullOrEmpty(key)) return true;
            Debug.LogWarning("[WishWorld] Real " + what + " is switched on but its key is blank. Using the mock.");
            return false;
        }

        /// <summary>Forget cached services so a changed config takes effect.</summary>
        public static void Reset() { config = null; speech = null; interpreter = null; tts = null; skybox = null; }

        public static Coroutine Run(IEnumerator routine)
        {
            if (runner == null)
            {
                var go = new GameObject("WishWorldServices");
                UnityEngine.Object.DontDestroyOnLoad(go);
                runner = go.AddComponent<ServiceRunner>();
            }
            return runner.StartCoroutine(routine);
        }
    }
}
