using System.Collections.Generic;
using UnityEngine;

namespace WishWorld
{
    /// <summary>
    /// Build switches from the project's .env file. The editor copies the WISHWORLD_ keys into
    /// Resources/WishWorldEnv.txt (see EnvSync) so they are available inside a device build.
    /// </summary>
    public static class EnvConfig
    {
        public const string ResourceName = "WishWorldEnv";
        static Dictionary<string, string> values;

        public static string Get(string key, string fallback)
        {
            if (values == null) Load();
            return values.TryGetValue(key, out var v) && !string.IsNullOrEmpty(v) ? v : fallback;
        }

        public static void Reload() { values = null; }

        /// <summary>WISHWORLD_TOY (on by default): off takes "scan a toy" and the prepared toy out of the app.</summary>
        public static bool ToyEnabled => Get("WISHWORLD_TOY", "on").ToLowerInvariant() != "off";

        /// <summary>WISHWORLD_CHILD_NAME: the child's name when it is known before the session. Empty when not set.</summary>
        public static string ChildName => Get("WISHWORLD_CHILD_NAME", "").Trim();

        public static Dictionary<string, string> Parse(string text)
        {
            var d = new Dictionary<string, string>();
            if (string.IsNullOrEmpty(text)) return d;
            foreach (var raw in text.Split('\n'))
            {
                var line = raw.Trim();
                if (line.Length == 0 || line[0] == '#') continue;
                int eq = line.IndexOf('=');
                if (eq <= 0) continue;
                d[line.Substring(0, eq).Trim()] = line.Substring(eq + 1).Trim().Trim('"', '\'');
            }
            return d;
        }

        static void Load()
        {
            var asset = Resources.Load<TextAsset>(ResourceName);
            values = Parse(asset != null ? asset.text : null);
        }
    }
}
