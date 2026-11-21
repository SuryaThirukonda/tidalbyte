using System;
using System.Collections.Generic;
using UnityEngine;

namespace WishWorld
{
    /// <summary>
    /// Placeholder audio made in code, so the app has sound with no audio files.
    /// Replace with recorded clips by swapping the getters or assigning clips on the definitions.
    /// </summary>
    public static class Sfx
    {
        const int Rate = 22050;
        static readonly Dictionary<string, AudioClip> cache = new Dictionary<string, AudioClip>();

        public static AudioClip Hover => Get("hover", 0.04f, t => Mathf.Sin(t * 1300 * 6.283f) * Env(t, 0.04f) * 0.4f);
        public static AudioClip Click => Get("click", 0.08f, t => Mathf.Sin(t * Mathf.Lerp(650, 980, t / 0.08f) * 6.283f) * Env(t, 0.08f) * 0.6f);
        public static AudioClip Slice => Get("slice", 0.18f, t => (Noise() * 0.5f + Mathf.Sin(t * Mathf.Lerp(1800, 500, t / 0.18f) * 6.283f) * 0.4f) * Env(t, 0.18f));
        public static AudioClip Pop => Get("pop", 0.14f, t => Mathf.Sin(t * Mathf.Lerp(300, 90, t / 0.14f) * 6.283f) * Env(t, 0.14f));
        public static AudioClip Chime => Get("chime", 0.5f, t => (Mathf.Sin(t * 660 * 6.283f) * Env(t, 0.5f) + (t > 0.12f ? Mathf.Sin(t * 990 * 6.283f) * Env(t - 0.12f, 0.38f) : 0)) * 0.45f);
        public static AudioClip Buzz => Get("buzz", 0.3f, t => Mathf.Sign(Mathf.Sin(t * 140 * 6.283f)) * Env(t, 0.3f) * 0.35f);
        public static AudioClip Success => Get("success", 0.7f, t =>
        {
            float f = t < 0.15f ? 523 : t < 0.3f ? 659 : t < 0.45f ? 784 : 1047;
            return Mathf.Sin(t * f * 6.283f) * Env(t % 0.15f, t < 0.45f ? 0.15f : 0.25f) * 0.45f;
        });
        /// <summary>The toy scan: a soft tone that climbs for as long as the scan line sweeps.</summary>
        public static AudioClip Scan(float seconds)
        {
            int tenths = Mathf.Clamp(Mathf.RoundToInt(seconds * 10f), 5, 120);
            float len = tenths / 10f;
            return Get("scan" + tenths, len, t =>
            {
                // The pitch doubles over the length of the clip, so the phase is the running sum of that rising pitch.
                float phase = 260f * len / 0.6931f * (Mathf.Pow(2f, t / len) - 1f) * 6.283f;
                float fade = Mathf.Clamp01(t / 0.15f) * Mathf.Clamp01((len - t) / 0.25f);
                float shimmer = 0.75f + 0.25f * Mathf.Sin(t * 11f * 6.283f);
                return (Mathf.Sin(phase) * 0.7f + Mathf.Sin(phase * 2f) * 0.3f) * fade * shimmer * 0.22f;
            });
        }
        /// <summary>The camera-flash moment at the end of the scan.</summary>
        public static AudioClip Flash => Get("flash", 0.35f, t => (Noise() * 0.5f + Mathf.Sin(t * Mathf.Lerp(2400, 900, t / 0.35f) * 6.283f) * 0.3f) * Env(t, 0.35f) * 0.5f);
        public static AudioClip Engine => Get("engine", 1f, t => (Saw(t * 70) * 0.5f + Saw(t * 105) * 0.25f + Noise() * 0.05f) * 0.5f, true);

        /// <summary>Looping background bed. 0 underwater, 1 wind, 2 space hum, 3 outdoors.</summary>
        public static AudioClip Ambient(int kind)
        {
            switch (kind)
            {
                case 0: return GetFiltered("amb_water", 4f, 0.02f, t => 0.8f + 0.2f * Mathf.Sin(t * 1.57f));
                case 2: return Get("amb_hum", 4f, t => (Mathf.Sin(t * 55 * 6.283f) + Mathf.Sin(t * 82.5f * 6.283f) * 0.6f) * 0.25f * (0.8f + 0.2f * Mathf.Sin(t * 1.57f)), true);
                case 3: return GetFiltered("amb_outdoor", 4f, 0.12f, t => 0.5f + 0.2f * Mathf.Sin(t * 3.14f));
                default: return GetFiltered("amb_wind", 4f, 0.06f, t => 0.6f + 0.4f * Mathf.Sin(t * 1.57f));
            }
        }

        /// <summary>A short rising or falling blip; each creature gets its own pitch.</summary>
        public static AudioClip Chirp(float pitch)
        {
            int p = Mathf.RoundToInt(Mathf.Clamp(pitch, 0.3f, 3f) * 20);
            return Get("chirp" + p, 0.22f, t => Mathf.Sin(t * 440 * (p / 20f) * (1 + t * 2f) * 6.283f) * Env(t, 0.22f) * 0.5f);
        }

        /// <summary>Stand-in for a spoken line: a few soft blips, as long as the text would take to say.</summary>
        public static AudioClip SpeechPlaceholder(string text)
        {
            int words = Mathf.Clamp(string.IsNullOrEmpty(text) ? 1 : text.Split(' ').Length, 1, 12);
            int seed = string.IsNullOrEmpty(text) ? 0 : (text.Length * 31 + text[0]) % 5;
            return Get("speech" + words + "_" + seed, words * 0.16f, t =>
            {
                int i = (int)(t / 0.16f);
                float local = t - i * 0.16f;
                float f = 330 + ((i * 7 + seed * 3) % 5) * 45;
                return local < 0.11f ? Mathf.Sin(t * f * 6.283f) * Env(local, 0.11f) * 0.3f : 0;
            });
        }

        /// <summary>Told about every sound and spoken line as it starts. Used by the editor's video recorder to build a soundtrack.</summary>
        public static Action<AudioClip, float> Tap;
        /// <summary>Told when the guide's voice starts a line and when it is cut off, so a recording can cut it at the same moment.</summary>
        public static Action<AudioClip> VoiceStart;
        public static Action VoiceStop;

        public static void Play(AudioClip clip, Vector3 position, float volume = 1f)
        {
            if (clip == null) return;
            AudioSource.PlayClipAtPoint(clip, position, volume);
            Tap?.Invoke(clip, volume);
        }

        static float Env(float t, float length)
        {
            if (t < 0 || t > length) return 0;
            float attack = Mathf.Min(0.008f, length * 0.2f);
            return t < attack ? t / attack : 1f - (t - attack) / (length - attack);
        }

        static float Saw(float phase) => 2f * (phase - Mathf.Floor(phase + 0.5f));
        static System.Random rng = new System.Random(7);
        static float Noise() => (float)(rng.NextDouble() * 2.0 - 1.0);

        static AudioClip Get(string name, float seconds, Func<float, float> sample, bool loop = false)
        {
            if (cache.TryGetValue(name, out var c) && c != null) return c;
            int n = Mathf.Max(1, (int)(seconds * Rate));
            var data = new float[n];
            for (int i = 0; i < n; i++) data[i] = Mathf.Clamp(sample(i / (float)Rate), -1f, 1f);
            if (loop) Crossfade(data);
            c = AudioClip.Create("PLACEHOLDER_" + name, n, 1, Rate, false);
            c.SetData(data, 0);
            cache[name] = c;
            return c;
        }

        /// <summary>Low-passed noise loop; smaller alpha is a darker, more muffled sound.</summary>
        static AudioClip GetFiltered(string name, float seconds, float alpha, Func<float, float> gain)
        {
            float y = 0;
            return Get(name, seconds, t => { y += alpha * (Noise() - y); return y * gain(t) * (alpha < 0.05f ? 6f : 2.5f); }, true);
        }

        static void Crossfade(float[] d)
        {
            int n = Mathf.Min(d.Length / 8, Rate / 10);
            for (int i = 0; i < n; i++)
            {
                float k = i / (float)n;
                d[i] = d[i] * k + d[d.Length - n + i] * (1 - k);
            }
        }
    }
}
