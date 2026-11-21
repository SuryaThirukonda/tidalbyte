using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

// The real clients. Request and response shapes were checked against each provider's API reference:
// ElevenLabs text-to-speech and speech-to-text, Gemini generateContent, and Anthropic Messages.
// ElevenLabs and Claude have been run against the real services; Gemini and the skybox client have not.
// Switch them on by putting the keys in .env (see .env.example) or in the WishWorldServiceConfig asset.
namespace WishWorld
{
    public static class Json
    {
        public static string Escape(string s)
        {
            if (string.IsNullOrEmpty(s)) return "";
            var sb = new StringBuilder(s.Length + 8);
            foreach (char c in s)
            {
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4")); else sb.Append(c);
                        break;
                }
            }
            return sb.ToString();
        }

        public static UnityWebRequest Post(string url, string json)
        {
            var req = new UnityWebRequest(url, UnityWebRequest.kHttpVerbPOST)
            {
                uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(json)),
                downloadHandler = new DownloadHandlerBuffer(),
                timeout = 30
            };
            req.SetRequestHeader("Content-Type", "application/json");
            return req;
        }

        public static bool Failed(UnityWebRequest req, string what)
        {
            if (req.result == UnityWebRequest.Result.Success) return false;
            Debug.LogWarning("[WishWorld] " + what + " failed: " + req.responseCode + " " + req.error);
            return true;
        }
    }

    /// <summary>
    /// Records the microphone while the push-to-talk button is held and sends the audio to a
    /// cloud speech-to-text endpoint (ElevenLabs speech-to-text by default).
    /// </summary>
    public class CloudSpeechRecognizer : ISpeechRecognizer
    {
        const int SampleRate = 16000;
        const int MaxSeconds = 15;
        readonly WishWorldServiceConfig cfg;
        AudioClip recording;

        [Serializable] class Response { public string text; }

        public bool IsListening { get; private set; }

        public CloudSpeechRecognizer(WishWorldServiceConfig config) { cfg = config; }

        public void StartListening()
        {
#if UNITY_ANDROID && !UNITY_EDITOR
            if (!UnityEngine.Android.Permission.HasUserAuthorizedPermission(UnityEngine.Android.Permission.Microphone))
            {
                UnityEngine.Android.Permission.RequestUserPermission(UnityEngine.Android.Permission.Microphone);
                return;
            }
#endif
            if (Microphone.devices.Length == 0) { Debug.LogWarning("[WishWorld] No microphone found."); return; }
            recording = Microphone.Start(null, false, MaxSeconds, SampleRate);
            IsListening = recording != null;
        }

        public void StopListening(Action<string> onText, Action<string> onError)
        {
            if (!IsListening || recording == null) { IsListening = false; onError?.Invoke("The microphone was not recording."); return; }
            int samples = Microphone.GetPosition(null);
            Microphone.End(null);
            IsListening = false;
            if (samples <= SampleRate / 5) { onError?.Invoke("That was too short to hear."); return; }
            var data = new float[samples * recording.channels];
            recording.GetData(data, 0);
            Services.Run(Send(EncodeWav(data, recording.channels, SampleRate), onText, onError));
        }

        IEnumerator Send(byte[] wav, Action<string> onText, Action<string> onError)
        {
            var form = new List<IMultipartFormSection>
            {
                new MultipartFormDataSection("model_id", cfg.speechModel),
                new MultipartFormFileSection("file", wav, "speech.wav", "audio/wav")
            };
            using (var req = UnityWebRequest.Post(cfg.speechEndpoint, form))
            {
                req.SetRequestHeader("xi-api-key", cfg.speechApiKey);
                req.timeout = 30;
                yield return req.SendWebRequest();
                if (Json.Failed(req, "Speech recognition")) { onError?.Invoke("I could not reach the speech service."); yield break; }
                Response r = null;
                try { r = JsonUtility.FromJson<Response>(req.downloadHandler.text); } catch (Exception e) { Debug.LogWarning(e.Message); }
                if (r == null || string.IsNullOrWhiteSpace(r.text)) onError?.Invoke("I did not catch that.");
                else onText?.Invoke(r.text);
            }
        }

        static byte[] EncodeWav(float[] samples, int channels, int rate)
        {
            using (var ms = new MemoryStream(44 + samples.Length * 2))
            using (var w = new BinaryWriter(ms))
            {
                w.Write(Encoding.ASCII.GetBytes("RIFF"));
                w.Write(36 + samples.Length * 2);
                w.Write(Encoding.ASCII.GetBytes("WAVEfmt "));
                w.Write(16); w.Write((short)1); w.Write((short)channels);
                w.Write(rate); w.Write(rate * channels * 2); w.Write((short)(channels * 2)); w.Write((short)16);
                w.Write(Encoding.ASCII.GetBytes("data"));
                w.Write(samples.Length * 2);
                foreach (var s in samples) w.Write((short)(Mathf.Clamp(s, -1f, 1f) * 32767f));
                w.Flush();
                return ms.ToArray();
            }
        }
    }

    /// <summary>
    /// Asks Gemini to rewrite free speech using only words the CommandRouter knows.
    /// Used only when the keyword matcher found nothing. Falls back to the original text on any error.
    /// </summary>
    public class GeminiCommandInterpreter : ICommandInterpreter
    {
        readonly WishWorldServiceConfig cfg;

        [Serializable] class Part { public string text; }
        [Serializable] class Content { public Part[] parts; }
        [Serializable] class Candidate { public Content content; }
        [Serializable] class Response { public Candidate[] candidates; }

        public GeminiCommandInterpreter(WishWorldServiceConfig config) { cfg = config; }

        public void Interpret(string heard, Action<string> onCommandText)
        {
            Services.Run(Send(heard ?? "", onCommandText));
        }

        IEnumerator Send(string heard, Action<string> onCommandText)
        {
            // Two jobs in one call: map a wish onto the preset choices, or (if allowed) answer a question about the world.
            string system =
                "You are the guide in a calm VR playroom for young children in hospital. A child has just spoken. " +
                "FIRST decide if it is a wish to change the world. If it is, reply with ONLY words from this list, " +
                "separated by spaces, choosing the closest matches: " + Services.Vocabulary + ". " +
                "Example: 'can I see some sea creatures that are violet' -> 'aquarium purple'. " +
                (cfg.guideAnswersQuestions
                    ? "If instead the child is asking a question or just talking, reply with 'say: ' followed by a warm, true, " +
                      "simple answer of at most two short sentences for a six-year-old. Never mention illness, danger or anything frightening. " +
                      "If you are not sure something is true, say you are not sure. " +
                      (string.IsNullOrEmpty(Services.Context) ? "" : "What the child can see now: " + Services.Context + " ")
                    : "") +
                "If nothing fits, reply with the single word: none.";
            string body =
                "{\"systemInstruction\":{\"parts\":[{\"text\":\"" + Json.Escape(system) + "\"}]}," +
                "\"contents\":[{\"role\":\"user\",\"parts\":[{\"text\":\"" + Json.Escape(heard) + "\"}]}]," +
                "\"generationConfig\":{\"temperature\":0,\"maxOutputTokens\":300}}";
            string url = cfg.interpreterEndpoint.Replace("{model}", cfg.interpreterModel);
            using (var req = Json.Post(url, body))
            {
                req.SetRequestHeader("x-goog-api-key", cfg.interpreterApiKey);
                yield return req.SendWebRequest();
                string result = heard;
                if (!Json.Failed(req, "Command interpretation"))
                {
                    try
                    {
                        var r = JsonUtility.FromJson<Response>(req.downloadHandler.text);
                        if (r != null && r.candidates != null && r.candidates.Length > 0 && r.candidates[0].content != null
                            && r.candidates[0].content.parts != null && r.candidates[0].content.parts.Length > 0)
                            result = r.candidates[0].content.parts[0].text ?? heard;
                    }
                    catch (Exception e) { Debug.LogWarning("[WishWorld] Could not read the interpreter reply: " + e.Message); }
                }
                onCommandText?.Invoke(result);
            }
        }
    }

    /// <summary>
    /// Asks Claude (Anthropic Messages API) to turn what the child said into the preset choices.
    /// The reply is constrained to a JSON shape whose fields can only hold the preset worlds, creatures, colours and
    /// so on, so Claude can only select from what the app can already do. It may instead answer a question in a
    /// sentence or two (if the config allows), or say that nothing fits. Falls back to the original text on any error,
    /// which sends it to the keyword matcher.
    /// Raw HTTP through UnityWebRequest, like the other services here: the app runs on a Quest under IL2CPP, where
    /// Anthropic's C# SDK is not a supported target and no extra packages are imported.
    /// </summary>
    public class ClaudeCommandInterpreter : ICommandInterpreter
    {
        // If Claude's safety checks decline a request, the API retries it on a fallback model inside the same call.
        readonly WishWorldServiceConfig cfg;

        [Serializable] class Block { public string type; public string text; }
        [Serializable] class Response { public Block[] content; public string stop_reason; public string model; }
        [Serializable] class Choice
        {
            public string kind, world, color, amount, size, say;
            public string[] creatures, extras;
        }

        /// <summary>Seconds the last request took, and what came back, for the logs and the checks.</summary>
        public static float LastSeconds { get; private set; }
        public static string LastReply { get; private set; } = "";

        public ClaudeCommandInterpreter(WishWorldServiceConfig config) { cfg = config; }

        public void Interpret(string heard, Action<string> onCommandText)
        {
            Services.Run(Send(heard ?? "", onCommandText));
        }

        static string Enum(string[] values, bool allowEmpty)
        {
            var sb = new StringBuilder("[");
            if (allowEmpty) sb.Append("\"\"");
            if (values != null)
                foreach (var v in values)
                {
                    if (sb.Length > 1) sb.Append(',');
                    sb.Append('"').Append(Json.Escape(v)).Append('"');
                }
            return sb.Append(']').ToString();
        }

        static string Schema(WishOptions o)
        {
            string One(string[] v) => "{\"type\":\"string\",\"enum\":" + Enum(v, true) + "}";
            string Many(string[] v) => "{\"type\":\"array\",\"items\":{\"type\":\"string\",\"enum\":" + Enum(v, false) + "}}";
            return "{\"type\":\"object\",\"properties\":{" +
                   "\"kind\":{\"type\":\"string\",\"enum\":[\"wish\",\"answer\",\"none\"]}," +
                   "\"world\":" + One(o.worlds) + "," +
                   "\"creatures\":" + Many(o.creatures) + "," +
                   "\"color\":" + One(o.colors) + "," +
                   "\"amount\":" + One(o.amounts) + "," +
                   "\"size\":" + One(o.sizes) + "," +
                   "\"extras\":" + Many(o.extras) + "," +
                   "\"say\":{\"type\":\"string\"}}," +
                   "\"required\":[\"kind\",\"world\",\"creatures\",\"color\",\"amount\",\"size\",\"extras\",\"say\"]," +
                   "\"additionalProperties\":false}";
        }

        string SystemPrompt()
        {
            return
                "You are the wish-granter inside WishWorld, a calm virtual-reality playroom for young children who are in hospital. " +
                "A child holds a button and says out loud what they would like to see. Their words were turned into text by speech " +
                "recognition, so expect mishearings, half sentences and a small child's way of putting things.\n\n" +
                "The app cannot build anything new. It can only show what it already has: a fixed set of worlds, creatures, colours, " +
                "amounts, sizes and a few extras, which are exactly the values your reply is allowed to contain. Your job is to choose " +
                "the preset values that come closest to what the child meant, so that they get something delightful rather than a refusal.\n\n" +
                "How to choose (set kind to \"wish\"):\n" +
                "- world: the place they want to be, or empty to stay where they are. Pick one only when they ask for a place or for a " +
                "kind of thing that belongs somewhere else (\"I want to see fish\" suits the aquarium).\n" +
                "- creatures: each creature they asked for. If they ask for something the app does not have, choose the nearest in " +
                "spirit (a dragon is closest to a dinosaur, a puppy to a friendly farm animal). Leave it empty if they asked for no creature.\n" +
                "- color, amount, size: only when they said so (\"violet\" is purple, \"loads\" is lots of, \"teeny\" is tiny). Otherwise empty.\n" +
                "- extras: weather and time (make it snow, make it night, make it sunny), \"in my room\" to bring things into their real " +
                "room, \"take me there\" to go inside the world, \"clear\", \"undo\" and \"go home\". Add \"add\" when they want another " +
                "of a creature that is already there together with a change of colour, amount or size.\n" +
                "- say: leave empty for a wish.\n\n" +
                (cfg.guideAnswersQuestions
                    ? "If the child is asking a question or just chatting rather than wishing, set kind to \"answer\" and put a warm, true, " +
                      "simple reply of at most two short sentences for a six-year-old in say; leave the other fields empty. If you are not " +
                      "sure something is true, say you are not sure. Keep everything gentle: nothing about illness, danger, or anything frightening.\n\n"
                    : "") +
                "If the words are noise, or nothing in the presets comes close, set kind to \"none\" and leave the rest empty. " +
                "Prefer a near match over \"none\": a child who asks for a unicorn would rather meet a horse than be told no." +
                (string.IsNullOrEmpty(Services.Context) ? "" : "\n\nWhat the child can see right now: " + Services.Context);
        }

        IEnumerator Send(string heard, Action<string> onCommandText)
        {
            var options = Services.Options ?? new WishOptions();
            // Server-side refusal fallbacks exist for the Opus, Sonnet and Fable models; Claude Haiku has none, so a decline there goes to the keyword matcher.
            bool fallback = !cfg.claudeModel.Contains("haiku");
            string body =
                "{\"model\":\"" + Json.Escape(cfg.claudeModel) + "\",\"max_tokens\":4096," +
                (fallback ? "\"fallbacks\":\"default\"," : "") +
                "\"system\":\"" + Json.Escape(SystemPrompt()) + "\"," +
                "\"messages\":[{\"role\":\"user\",\"content\":\"" + Json.Escape(heard) + "\"}]," +
                "\"output_config\":{\"effort\":\"" + Json.Escape(cfg.claudeEffort) + "\"," +
                "\"format\":{\"type\":\"json_schema\",\"schema\":" + Schema(options) + "}}}";
            float started = Time.realtimeSinceStartup;
            using (var req = Json.Post(cfg.claudeEndpoint, body))
            {
                req.SetRequestHeader("x-api-key", cfg.claudeApiKey);
                req.timeout = 15;
                yield return req.SendWebRequest();
                LastSeconds = Time.realtimeSinceStartup - started;
                string result = heard;                                   // on any failure the keyword matcher gets the original words
                if (req.result != UnityWebRequest.Result.Success)
                {
                    string detail = req.downloadHandler != null ? req.downloadHandler.text : "";
                    Debug.LogWarning("[WishWorld] Claude request failed: " + req.responseCode + " " + req.error + " " + (detail.Length > 300 ? detail.Substring(0, 300) : detail));
                }
                else
                {
                    try
                    {
                        var r = JsonUtility.FromJson<Response>(req.downloadHandler.text);
                        if (r == null || r.stop_reason == "refusal") Debug.LogWarning("[WishWorld] Claude declined this wish; using the keyword matcher.");
                        else if (r.stop_reason == "max_tokens") Debug.LogWarning("[WishWorld] Claude's reply was cut short; using the keyword matcher.");
                        else
                        {
                            string json = null;
                            if (r.content != null) foreach (var b in r.content) if (b != null && b.type == "text" && !string.IsNullOrEmpty(b.text)) json = b.text;
                            if (json != null)
                            {
                                LastReply = json;
                                result = ToCommand(JsonUtility.FromJson<Choice>(json)) ?? heard;
                            }
                        }
                    }
                    catch (Exception e) { Debug.LogWarning("[WishWorld] Could not read Claude's reply: " + e.Message); }
                }
                onCommandText?.Invoke(result);
            }
        }

        /// <summary>Turn the chosen presets back into the words the CommandRouter understands.</summary>
        static string ToCommand(Choice c)
        {
            if (c == null) return null;
            if (c.kind == "answer") return string.IsNullOrWhiteSpace(c.say) ? "none" : "say: " + c.say.Trim();
            if (c.kind != "wish") return "none";
            var words = new List<string>();
            void Add(string w) { if (!string.IsNullOrWhiteSpace(w)) words.Add(w.Trim()); }
            if (c.extras != null) foreach (var e in c.extras) Add(e);
            Add(c.world);
            Add(c.amount); Add(c.size); Add(c.color);
            if (c.creatures != null) foreach (var k in c.creatures) Add(k);
            return words.Count == 0 ? "none" : string.Join(" ", words);
        }
    }

    /// <summary>
    /// Live guide speech from ElevenLabs, for lines that are not in the voice bank (the AI's answers).
    /// Asks for raw 24 kHz PCM so no audio decoder is needed.
    /// </summary>
    public class ElevenLabsTextToSpeech : ITextToSpeech
    {
        const int Rate = 24000;
        readonly WishWorldServiceConfig cfg;
        readonly Dictionary<string, AudioClip> cache = new Dictionary<string, AudioClip>();

        public ElevenLabsTextToSpeech(WishWorldServiceConfig config) { cfg = config; }

        public void Speak(string text, Action<AudioClip> onClip)
        {
            if (cache.TryGetValue(text, out var clip) && clip != null) { onClip?.Invoke(clip); return; }
            Services.Run(Send(text, onClip));
        }

        IEnumerator Send(string text, Action<AudioClip> onClip)
        {
            if (string.IsNullOrEmpty(cfg.ttsVoiceId))
            {
                Debug.LogWarning("[WishWorld] Text to speech has a key but no voice id (ELEVENLABS_VOICE_ID). Using the placeholder tone.");
                onClip?.Invoke(Sfx.SpeechPlaceholder(text));
                yield break;
            }
            string url = cfg.ttsEndpoint.Replace("{voice}", cfg.ttsVoiceId) + "?output_format=pcm_" + Rate;
            string body = "{\"text\":\"" + Json.Escape(text) + "\",\"model_id\":\"" + Json.Escape(cfg.ttsModel) + "\"}";
            using (var req = Json.Post(url, body))
            {
                req.SetRequestHeader("xi-api-key", cfg.ttsApiKey);
                yield return req.SendWebRequest();
                if (Json.Failed(req, "Text to speech"))
                {
                    onClip?.Invoke(Sfx.SpeechPlaceholder(text));   // never leave the guide silent
                    yield break;
                }
                var bytes = req.downloadHandler.data;
                int n = bytes.Length / 2;
                if (n == 0) { onClip?.Invoke(Sfx.SpeechPlaceholder(text)); yield break; }
                var samples = new float[n];
                for (int i = 0; i < n; i++) samples[i] = (short)(bytes[i * 2] | (bytes[i * 2 + 1] << 8)) / 32768f;
                var clip = AudioClip.Create("tts", n, 1, Rate, false);
                clip.SetData(samples, 0);
                cache[text] = clip;
                onClip?.Invoke(clip);
            }
        }
    }

    /// <summary>Generates a 360 panorama from a prompt with Blockade Labs Skybox, then downloads it.</summary>
    public class BlockadeSkyboxGenerator : ISkyboxGenerator
    {
        readonly WishWorldServiceConfig cfg;

        [Serializable] class Created { public int id; public string status; public string file_url; }
        [Serializable] class Wrapper { public Created request; }

        public BlockadeSkyboxGenerator(WishWorldServiceConfig config) { cfg = config; }

        public void Generate(string worldId, string prompt, Action<Texture> onTexture)
        {
            Services.Run(Send(worldId, prompt, onTexture));
        }

        IEnumerator Send(string worldId, string prompt, Action<Texture> onTexture)
        {
            // Fall back to the pre-made panorama whenever generation fails.
            Action fallback = () => new MockSkyboxGenerator().Generate(worldId, prompt, onTexture);
            Created job = null;
            using (var req = Json.Post(cfg.skyboxEndpoint + "/skybox", "{\"prompt\":\"" + Json.Escape(prompt) + "\"}"))
            {
                req.SetRequestHeader("x-api-key", cfg.skyboxApiKey);
                yield return req.SendWebRequest();
                if (Json.Failed(req, "Skybox request")) { fallback(); yield break; }
                try { job = JsonUtility.FromJson<Created>(req.downloadHandler.text); } catch (Exception e) { Debug.LogWarning(e.Message); }
            }
            if (job == null || job.id == 0) { fallback(); yield break; }

            string fileUrl = job.file_url;
            for (int i = 0; i < 40 && string.IsNullOrEmpty(fileUrl); i++)
            {
                yield return new WaitForSecondsRealtime(3f);
                using (var poll = UnityWebRequest.Get(cfg.skyboxEndpoint + "/imagine/requests/" + job.id))
                {
                    poll.SetRequestHeader("x-api-key", cfg.skyboxApiKey);
                    poll.timeout = 30;
                    yield return poll.SendWebRequest();
                    if (Json.Failed(poll, "Skybox status")) continue;
                    Wrapper w = null;
                    try { w = JsonUtility.FromJson<Wrapper>(poll.downloadHandler.text); } catch (Exception e) { Debug.LogWarning(e.Message); }
                    if (w == null || w.request == null) continue;
                    if (w.request.status == "error" || w.request.status == "abort") { fallback(); yield break; }
                    if (w.request.status == "complete") fileUrl = w.request.file_url;
                }
            }
            if (string.IsNullOrEmpty(fileUrl)) { fallback(); yield break; }

            using (var img = UnityWebRequestTexture.GetTexture(fileUrl))
            {
                img.timeout = 60;
                yield return img.SendWebRequest();
                if (Json.Failed(img, "Skybox download")) { fallback(); yield break; }
                onTexture?.Invoke(DownloadHandlerTexture.GetContent(img));
            }
        }
    }
}
