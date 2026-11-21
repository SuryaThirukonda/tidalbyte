using System.IO;
using System.Text;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace WishWorld.EditorTools
{
    /// <summary>
    /// Copies the WISHWORLD_ keys from the project's .env into a Resources text asset, on editor load,
    /// before Play mode and before every build. Other keys in .env are never copied, so secrets kept
    /// there do not ship in the app.
    /// </summary>
    [InitializeOnLoad]
    public class EnvSync : IPreprocessBuildWithReport
    {
        const string AssetPath = "Assets/WishWorld/Resources/" + EnvConfig.ResourceName + ".txt";
        public int callbackOrder => -100;

        static EnvSync()
        {
            EditorApplication.delayCall += () => Sync();
            EditorApplication.playModeStateChanged += s => { if (s == PlayModeStateChange.ExitingEditMode) Sync(); };
        }

        public void OnPreprocessBuild(BuildReport report) { Sync(); }

        public static string Read(string key, string fallback)
        {
            var d = EnvConfig.Parse(File.Exists(".env") ? File.ReadAllText(".env") : null);
            return d.TryGetValue(key, out var v) && !string.IsNullOrEmpty(v) ? v : fallback;
        }

        /// <summary>ElevenLabs stock voice "Jessica" (playful, bright, warm). ELEVENLABS_VOICE_ID in .env overrides it.</summary>
        public const string DefaultVoiceId = "cgSgspJ2msm6clMCkdW9";

        const string ConfigPath = "Assets/WishWorld/Config/Resources/" + WishWorldServiceConfig.ResourceName + ".asset";

        /// <summary>
        /// Service keys in .env go into the service config asset (which is not in version control), and switch the
        /// matching services on. A key that is absent from .env leaves the asset alone, so keys typed in the Inspector stay.
        /// Note that the config asset is part of the app: a key in it ships inside the APK.
        /// </summary>
        static void SyncKeys(System.Collections.Generic.Dictionary<string, string> env)
        {
            // Two ElevenLabs accounts can sit side by side in .env: ELEVENLABS_ACCOUNT=2 picks ELEVENLABS_API_KEY2.
            env.TryGetValue("ELEVENLABS_ACCOUNT", out var account);
            env.TryGetValue(account == "2" ? "ELEVENLABS_API_KEY2" : "ELEVENLABS_API_KEY", out var eleven);
            env.TryGetValue("ELEVENLABS_VOICE_ID", out var voice);
            // With a key but no voice named, use a stock voice every account has, so the guide is not silent.
            if (!string.IsNullOrEmpty(eleven) && string.IsNullOrEmpty(voice)) voice = DefaultVoiceId;
            env.TryGetValue("GEMINI_API_KEY", out var gemini);
            env.TryGetValue("ANTHROPIC_API_KEY", out var claude);
            env.TryGetValue("ANTHROPIC_MODEL", out var claudeModel);
            var cfg = AssetDatabase.LoadAssetAtPath<WishWorldServiceConfig>(ConfigPath);
            if (cfg == null)
            {
                if (string.IsNullOrEmpty(eleven) && string.IsNullOrEmpty(gemini) && string.IsNullOrEmpty(claude)) return;
                Directory.CreateDirectory(Path.GetDirectoryName(ConfigPath));
                cfg = ScriptableObject.CreateInstance<WishWorldServiceConfig>();
                AssetDatabase.CreateAsset(cfg, ConfigPath);
            }
            bool changed = false;
            void Set(ref string field, string value) { if (!string.IsNullOrEmpty(value) && field != value) { field = value; changed = true; } }
            void On(ref bool field) { if (!field) { field = true; changed = true; } }
            if (!string.IsNullOrEmpty(eleven))
            {
                Set(ref cfg.speechApiKey, eleven); Set(ref cfg.ttsApiKey, eleven);
                On(ref cfg.useRealSpeechRecognition); On(ref cfg.useRealTextToSpeech);
            }
            Set(ref cfg.ttsVoiceId, voice);
            env.TryGetValue("ELEVENLABS_BAKE_MODEL", out var bakeModel);
            Set(ref cfg.ttsBakeModel, bakeModel);
            if (!string.IsNullOrEmpty(claude)) { Set(ref cfg.claudeApiKey, claude); On(ref cfg.useRealCommandInterpreter); }
            Set(ref cfg.claudeModel, claudeModel);
            if (!string.IsNullOrEmpty(gemini)) { Set(ref cfg.interpreterApiKey, gemini); On(ref cfg.useRealCommandInterpreter); }
            // model names that have been retired since the asset was first created
            if (cfg.speechModel == "scribe_v1") { cfg.speechModel = "scribe_v2"; changed = true; }
            if (cfg.interpreterModel == "gemini-2.5-flash") { cfg.interpreterModel = "gemini-3.5-flash-lite"; changed = true; }
            if (!changed) return;
            EditorUtility.SetDirty(cfg);
            AssetDatabase.SaveAssetIfDirty(cfg);
            Services.Reset();
        }

        [MenuItem("WishWorld/Sync .env Now")]
        public static void Sync()
        {
            SyncKeys(EnvConfig.Parse(File.Exists(".env") ? File.ReadAllText(".env") : null));
            var sb = new StringBuilder("# Generated from .env by EnvSync. Do not edit.\n");
            foreach (var kv in EnvConfig.Parse(File.Exists(".env") ? File.ReadAllText(".env") : null))
                if (kv.Key.StartsWith("WISHWORLD_")) sb.Append(kv.Key).Append('=').Append(kv.Value).Append('\n');
            string text = sb.ToString();
            if (File.Exists(AssetPath) && File.ReadAllText(AssetPath) == text) return;
            Directory.CreateDirectory(Path.GetDirectoryName(AssetPath));
            File.WriteAllText(AssetPath, text);
            AssetDatabase.ImportAsset(AssetPath);
            EnvConfig.Reload();
        }
    }
}
