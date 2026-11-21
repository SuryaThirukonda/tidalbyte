using UnityEngine;

namespace WishWorld
{
    /// <summary>
    /// Keys, endpoints and the mock/real switch for every outside service.
    /// The asset lives at Assets/WishWorld/Config/Resources/WishWorldServiceConfig.asset and is
    /// excluded from version control. Create it from the menu: WishWorld > Create Service Config.
    /// With no asset present, every service runs on its mock.
    /// </summary>
    public class WishWorldServiceConfig : ScriptableObject
    {
        public const string ResourceName = "WishWorldServiceConfig";

        [Header("Speech recognition (push-to-talk)")]
        public bool useRealSpeechRecognition;
        public string speechApiKey = "";
        public string speechEndpoint = "https://api.elevenlabs.io/v1/speech-to-text";
        public string speechModel = "scribe_v2";

        [Header("Command interpretation (free speech to commands)")]
        public bool useRealCommandInterpreter;
        public string interpreterApiKey = "";
        public string interpreterEndpoint = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent";
        public string interpreterModel = "gemini-3.5-flash-lite";
        [Tooltip("Claude (Anthropic). When this key is filled in it is used instead of the interpreter above.")]
        public string claudeApiKey = "";
        public string claudeEndpoint = "https://api.anthropic.com/v1/messages";
        public string claudeModel = "claude-haiku-5-5";
        [Tooltip("How hard Claude thinks before choosing: low is the quickest. low, medium or high.")]
        public string claudeEffort = "low";
        [Tooltip("Let the guide answer a child's question about the world in a sentence or two. The answers come from the AI and are not fact-checked.")]
        public bool guideAnswersQuestions = true;

        [Header("Text to speech (guide voice)")]
        public bool useRealTextToSpeech;
        public string ttsApiKey = "";
        public string ttsEndpoint = "https://api.elevenlabs.io/v1/text-to-speech/{voice}";
        public string ttsVoiceId = "";
        public string ttsModel = "eleven_flash_v2_5";
        [Tooltip("Model used when recording the preset lines into the voice bank (quality over speed).")]
        public string ttsBakeModel = "eleven_multilingual_v2";

        [Header("Skybox generation")]
        public bool useRealSkyboxGenerator;
        public string skyboxApiKey = "";
        public string skyboxEndpoint = "https://backend.blockadelabs.com/api/v1";

        public static WishWorldServiceConfig Load()
        {
            var c = Resources.Load<WishWorldServiceConfig>(ResourceName);
            return c != null ? c : CreateInstance<WishWorldServiceConfig>();
        }
    }
}
