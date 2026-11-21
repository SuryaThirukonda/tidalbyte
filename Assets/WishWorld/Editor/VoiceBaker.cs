using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using UnityEditor;
using UnityEngine;
using UnityEngine.Networking;

namespace WishWorld.EditorTools
{
    /// <summary>
    /// Records every preset line with ElevenLabs, once, into the voice bank (Generated/Voice + Resources/VoiceBank).
    /// Lines already recorded are skipped, so running it again only sends what is new and costs nothing otherwise.
    /// Needs the ElevenLabs key and a voice id (put ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID in .env).
    /// </summary>
    public static class VoiceBaker
    {
        const string ClipFolder = WishWorldBuilder.Gen + "/Voice";
        const string BankPath = WishWorldBuilder.Gen + "/Resources/" + VoiceBank.ResourceName + ".asset";

        /// <summary>Every line the app can say without the AI: the data-built ones plus each literal passed to the guide in the scripts.</summary>
        public static List<string> AllLines()
        {
            var lines = VoiceLines.FromData(AssetDatabase.LoadAssetAtPath<WorldLibrary>(WishWorldBuilder.Root + "/Resources/WorldLibrary.asset"));
            // In every script that talks through the guide, take each whole sentence written out in the code. That
            // catches lines passed straight to the guide, ones split over several lines, and ones kept in a variable
            // first ("All clear."). Pieces of a line that is put together at run time are covered by VoiceLines.
            var literal = new Regex("\"((?:[^\"\\\\]|\\\\.)*)\"");
            foreach (var file in Directory.GetFiles(WishWorldBuilder.Root + "/Scripts", "*.cs", SearchOption.AllDirectories))
            {
                string path = file.Replace('\\', '/');
                if (path.Contains("/DebugTools/") || path.Contains("/Services/")) continue;
                string code = File.ReadAllText(file);
                if (!code.Contains("GuideVoice.")) continue;
                foreach (var line in code.Split('\n'))
                {
                    string t = line.TrimStart();
                    if (t.StartsWith("//") || t.StartsWith("///") || t.Contains("Debug.Log") || t.Contains("Tooltip(") || t.Contains("Header(") || t.Contains("ShowMenu(") || t.Contains("Status(") || t.Contains("Show(\"")) continue;
                    foreach (Match m in literal.Matches(line))
                    {
                        string s = Regex.Unescape(m.Groups[1].Value);
                        if (s.Length >= 6 && !s.Contains("\n") && !s.EndsWith("...") && (s.EndsWith(".") || s.EndsWith("!") || s.EndsWith("?"))
                            && char.IsUpper(s[0]) && !lines.Contains(s)) lines.Add(s);
                    }
                }
            }
            return lines;
        }

        static string FileFor(string text, WishWorldServiceConfig cfg)
        {
            using (var sha = SHA1.Create())
            {
                var h = sha.ComputeHash(Encoding.UTF8.GetBytes(VoiceBank.Key(text) + "|" + cfg.ttsVoiceId + "|" + cfg.ttsBakeModel));
                var sb = new StringBuilder();
                for (int i = 0; i < 8; i++) sb.Append(h[i].ToString("x2"));
                return ClipFolder + "/" + sb + ".mp3";
            }
        }

        /// <summary>Set by tests to point the baker at a stand-in server instead of the real config.</summary>
        public static WishWorldServiceConfig ConfigOverride;

        static WishWorldServiceConfig Config()
        {
            if (ConfigOverride != null) return ConfigOverride;
            EnvSync.Sync();
            Services.Reset();
            return Services.Config;
        }

        [MenuItem("WishWorld/Voice/Count Preset Lines")]
        public static string Count()
        {
            var cfg = Config();
            var lines = AllLines();
            int chars = 0, missing = 0, missingChars = 0;
            foreach (var l in lines) { chars += l.Length; if (!File.Exists(FileFor(l, cfg))) { missing++; missingChars += l.Length; } }
            string msg = $"{lines.Count} preset lines, {chars} characters. Not yet recorded with this voice: {missing} lines, {missingChars} characters.";
            Debug.Log("[WishWorld] " + msg);
            return msg;
        }

        [MenuItem("WishWorld/Voice/List My ElevenLabs Voices")]
        public static string ListVoices()
        {
            var cfg = Config();
            if (string.IsNullOrEmpty(cfg.ttsApiKey)) return Fail("No ElevenLabs key. Put ELEVENLABS_API_KEY in .env.");
            string url = new Uri(cfg.ttsEndpoint).GetLeftPart(UriPartial.Authority) + "/v2/voices?page_size=100";
            using (var req = UnityWebRequest.Get(url))
            {
                req.SetRequestHeader("xi-api-key", cfg.ttsApiKey);
                if (!Wait(req)) return Fail("Could not list voices: " + req.responseCode + " " + req.error);
                var sb = new StringBuilder("Voices on this ElevenLabs account (name = id):\n");
                foreach (Match m in Regex.Matches(req.downloadHandler.text, "\"voice_id\"\\s*:\\s*\"([^\"]+)\"\\s*,\\s*\"name\"\\s*:\\s*\"([^\"]*)\""))
                    sb.Append("  ").Append(m.Groups[2].Value).Append(" = ").Append(m.Groups[1].Value).Append('\n');
                Debug.Log("[WishWorld] " + sb);
                return sb.ToString();
            }
        }

        /// <summary>Record what is missing and rebuild the bank. Returns a one-line summary.</summary>
        [MenuItem("WishWorld/Voice/Bake Preset Lines (ElevenLabs)")]
        public static string Bake()
        {
            var cfg = Config();
            if (string.IsNullOrEmpty(cfg.ttsApiKey)) return Fail("No ElevenLabs key. Put ELEVENLABS_API_KEY in .env.");
            if (string.IsNullOrEmpty(cfg.ttsVoiceId)) return Fail("No voice chosen. Put ELEVENLABS_VOICE_ID in .env (WishWorld > Voice > List My ElevenLabs Voices shows the ids).");
            var lines = AllLines();
            Directory.CreateDirectory(ClipFolder);
            int made = 0, sent = 0;
            string stopped = null;
            try
            {
                for (int i = 0; i < lines.Count; i++)
                {
                    string path = FileFor(lines[i], cfg);
                    if (File.Exists(path)) continue;
                    if (EditorUtility.DisplayCancelableProgressBar("Recording the guide's lines", lines[i], i / (float)lines.Count)) { stopped = "cancelled"; break; }
                    string url = cfg.ttsEndpoint.Replace("{voice}", cfg.ttsVoiceId) + "?output_format=mp3_44100_128";
                    string body = "{\"text\":\"" + Json.Escape(lines[i]) + "\",\"model_id\":\"" + Json.Escape(cfg.ttsBakeModel) + "\"}";
                    using (var req = Json.Post(url, body))
                    {
                        req.SetRequestHeader("xi-api-key", cfg.ttsApiKey);
                        req.timeout = 60;
                        if (!Wait(req) || req.downloadHandler.data == null || req.downloadHandler.data.Length < 200)
                        {
                            string detail = req.downloadHandler != null ? req.downloadHandler.text : "";
                            stopped = "ElevenLabs refused line " + (i + 1) + ": " + req.responseCode + " " + req.error + " " + (detail.Length > 300 ? detail.Substring(0, 300) : detail);
                            break;       // a bad key or an empty quota fails the same way for every line: stop, do not hammer
                        }
                        File.WriteAllBytes(path, req.downloadHandler.data);
                        made++; sent += lines[i].Length;
                    }
                }
            }
            finally { EditorUtility.ClearProgressBar(); }

            AssetDatabase.Refresh();
            int inBank = BuildBank(lines, cfg);
            string msg = $"Recorded {made} new lines ({sent} characters sent). The bank now holds {inBank} of {lines.Count} preset lines." + (stopped != null ? " Stopped early: " + stopped : "");
            if (stopped != null) Debug.LogWarning("[WishWorld] " + msg); else Debug.Log("[WishWorld] " + msg);
            return msg;
        }

        /// <summary>Point the bank at whichever recordings exist for the current voice.</summary>
        public static int BuildBank(List<string> lines, WishWorldServiceConfig cfg)
        {
            WishWorldBuilder.EnsureFolder(WishWorldBuilder.Gen + "/Resources");
            var bank = AssetDatabase.LoadAssetAtPath<VoiceBank>(BankPath);
            if (bank == null) { bank = ScriptableObject.CreateInstance<VoiceBank>(); AssetDatabase.CreateAsset(bank, BankPath); }
            bank.entries.Clear();
            bank.voiceName = cfg.ttsVoiceId;
            foreach (var line in lines)
            {
                string path = FileFor(line, cfg);
                if (!File.Exists(path)) continue;
                var imp = AssetImporter.GetAtPath(path) as AudioImporter;
                if (imp != null && !imp.forceToMono)
                {
                    imp.forceToMono = true;
                    var s = imp.defaultSampleSettings;
                    s.loadType = AudioClipLoadType.CompressedInMemory; s.compressionFormat = AudioCompressionFormat.Vorbis; s.quality = 0.55f;
                    imp.defaultSampleSettings = s;
                    imp.SaveAndReimport();
                }
                var clip = AssetDatabase.LoadAssetAtPath<AudioClip>(path);
                if (clip != null) bank.entries.Add(new VoiceBank.Entry { text = line, clip = clip });
            }
            EditorUtility.SetDirty(bank);
            AssetDatabase.SaveAssets();
            return bank.entries.Count;
        }

        static bool Wait(UnityWebRequest req)
        {
            var op = req.SendWebRequest();
            var until = DateTime.UtcNow.AddSeconds(90);
            while (!op.isDone && DateTime.UtcNow < until) System.Threading.Thread.Sleep(15);
            return op.isDone && req.result == UnityWebRequest.Result.Success;
        }

        static string Fail(string why) { Debug.LogWarning("[WishWorld] " + why); return why; }
    }
}
