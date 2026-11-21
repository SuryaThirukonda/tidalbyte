#if UNITY_EDITOR
using System.Collections.Generic;
using System.IO;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace WishWorld.DebugTools
{
    /// <summary>
    /// Editor-only video capture. While recording, game time advances exactly 1/fps per frame and the
    /// player camera is rendered to a 1280x720 image each frame, saved as numbered JPEGs. ffmpeg turns
    /// those into a video afterwards. Captions are logged with the frame they start on.
    /// </summary>
    [DefaultExecutionOrder(10000)]
    public class DemoRecorder : MonoBehaviour
    {
        public const int Width = 1280, Height = 720;
        public const float FieldOfView = 70f;
        public static bool Recording { get; private set; }
        public static int Frame { get; private set; }
        public static string Folder { get; private set; }

        static DemoRecorder inst;
        static readonly List<string> captions = new List<string>();
        static readonly List<string> sounds = new List<string>();
        static readonly Dictionary<int, string> written = new Dictionary<int, string>();
        RenderTexture rt;
        Texture2D tex;

        public static void Begin(string name, int fps = 30)
        {
            if (inst == null)
            {
                var go = new GameObject("DemoRecorder (editor only)");
                DontDestroyOnLoad(go);
                inst = go.AddComponent<DemoRecorder>();
            }
            Folder = Path.Combine(Directory.GetCurrentDirectory(), "Logs", "demo_frames", name);
            if (Directory.Exists(Folder)) Directory.Delete(Folder, true);
            Directory.CreateDirectory(Folder);
            captions.Clear();
            sounds.Clear();
            written.Clear();
            Sfx.Tap = Sound;
            Sfx.VoiceStart = Voice;
            Sfx.VoiceStop = VoiceCut;
            voiceLine = -1;
            Frame = 0;
            Time.captureFramerate = fps;
            Recording = true;
        }

        public static void Caption(string text)
        {
            if (Recording) captions.Add(Frame + "\t" + text);
        }

        public static void End()
        {
            if (!Recording) return;
            Recording = false;
            Time.captureFramerate = 0;
            if (Sfx.Tap == (System.Action<AudioClip, float>)Sound) Sfx.Tap = null;
            Sfx.VoiceStart = null; Sfx.VoiceStop = null;
            File.WriteAllLines(Path.Combine(Folder, "captions.tsv"), captions);
            File.WriteAllLines(Path.Combine(Folder, "audio.tsv"), sounds);
            File.WriteAllText(Path.Combine(Folder, "frames.txt"), Frame.ToString());
        }

        /// <summary>
        /// Note a sound starting on this frame. Recorded lines are referenced by their file in the project; sounds made
        /// in code (and live speech) are written out once as WAV. The encoder mixes them at their frames.
        /// </summary>
        public static void Sound(AudioClip clip, float volume)
        {
            if (!Recording || clip == null) return;
            string path = UnityEditor.AssetDatabase.GetAssetPath(clip);
            if (!string.IsNullOrEmpty(path)) path = Path.GetFullPath(path);
            else if (!written.TryGetValue(clip.GetInstanceID(), out path))
            {
                path = Path.Combine(Folder, "a_" + written.Count.ToString("000") + ".wav");
                var data = new float[clip.samples * clip.channels];
                if (!clip.GetData(data, 0)) return;
                WriteWav(path, data, clip.channels, clip.frequency);
                written[clip.GetInstanceID()] = path;
            }
            sounds.Add(Frame + "\t" + path + "\t" + volume.ToString(System.Globalization.CultureInfo.InvariantCulture));
        }

        static int voiceLine = -1, voiceEnd;

        /// <summary>The guide started a line. It plays to its end unless <see cref="VoiceCut"/> says it was stopped.</summary>
        static void Voice(AudioClip clip)
        {
            if (!Recording || clip == null) return;
            Sound(clip, 1f);
            voiceLine = sounds.Count - 1;
            voiceEnd = Frame + Mathf.CeilToInt(clip.length * 30f);
        }

        /// <summary>The guide's line was stopped: cut it in the soundtrack at this frame (a fourth column, the end frame).</summary>
        static void VoiceCut()
        {
            if (!Recording || voiceLine < 0 || voiceLine >= sounds.Count) return;
            if (Frame < voiceEnd) sounds[voiceLine] += "\t" + Frame;
            voiceLine = -1;
        }

        /// <summary>Note an audio file (for example the recorded voice of someone making a wish) starting on this frame.</summary>
        public static void SoundFile(string path, float volume = 1f)
        {
            if (Recording) sounds.Add(Frame + "\t" + path + "\t" + volume.ToString(System.Globalization.CultureInfo.InvariantCulture));
        }

        static void WriteWav(string path, float[] samples, int channels, int rate)
        {
            using (var w = new BinaryWriter(File.Create(path)))
            {
                w.Write(System.Text.Encoding.ASCII.GetBytes("RIFF")); w.Write(36 + samples.Length * 2);
                w.Write(System.Text.Encoding.ASCII.GetBytes("WAVEfmt ")); w.Write(16); w.Write((short)1); w.Write((short)channels);
                w.Write(rate); w.Write(rate * channels * 2); w.Write((short)(channels * 2)); w.Write((short)16);
                w.Write(System.Text.Encoding.ASCII.GetBytes("data")); w.Write(samples.Length * 2);
                foreach (var s in samples) w.Write((short)(Mathf.Clamp(s, -1f, 1f) * 32767f));
            }
        }

        /// <summary>Keep the player camera at the recording's shape, so pointing lines up with what is filmed.</summary>
        public static void PrepareCamera()
        {
            var rig = XRRig.I;
            if (!Recording || rig == null) return;
            rig.cam.aspect = Width / (float)Height;
            rig.cam.fieldOfView = FieldOfView;
        }

        void Update() { PrepareCamera(); }

        void LateUpdate()
        {
            var rig = XRRig.I;
            if (!Recording || rig == null) return;
            PrepareCamera();
            if (rt == null)
            {
                rt = new RenderTexture(Width, Height, 24, RenderTextureFormat.ARGB32) { antiAliasing = 4 };
                tex = new Texture2D(Width, Height, TextureFormat.RGB24, false);
            }
            var request = new UniversalRenderPipeline.SingleCameraRequest { destination = rt };
            if (!RenderPipeline.SupportsRenderRequest(rig.cam, request)) return;
            RenderPipeline.SubmitRenderRequest(rig.cam, request);
            var prev = RenderTexture.active;
            RenderTexture.active = rt;
            tex.ReadPixels(new Rect(0, 0, Width, Height), 0, 0);
            RenderTexture.active = prev;
            File.WriteAllBytes(Path.Combine(Folder, "f_" + Frame.ToString("00000") + ".jpg"), tex.EncodeToJPG(92));
            Frame++;
        }
    }
}
#endif
