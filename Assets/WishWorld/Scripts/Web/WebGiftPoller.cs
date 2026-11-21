using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Networking;

namespace WishWorld
{
    /// <summary>
    /// Brings gifts sent from the WishWorld web app (a family member's phone) into the game.
    ///
    /// When WISHWORLD_WEB_URL is set in .env (for example https://wishworld-web.netlify.app), this asks
    /// GET {url}/api/gifts?room={WISHWORLD_ROOM}&amp;after={last id} every 2.5 seconds. Each gift of kind "creature" is
    /// put through the same path as a spoken wish or a menu pick (WorldController.AddCreature), and its message is
    /// shown and spoken by the guide (GuideVoice.Say). Other kinds (scanned toys, letters) belong to the web app.
    ///
    /// With no URL it never starts: no object, no requests, no log. It starts by itself (no scene holds it),
    /// survives scene changes, and remembers the last gift it took, so nothing arrives twice.
    /// </summary>
    public class WebGiftPoller : MonoBehaviour
    {
        public const string UrlKey = "WISHWORLD_WEB_URL", RoomKey = "WISHWORLD_ROOM", DefaultRoom = "WISH";
        public const float Interval = 2.5f;
        const float MaxWait = 20f;
        const int TimeoutSeconds = 8, MaxAtOnce = 5, MaxMessage = 260;

        [Serializable]
        class Gift
        {
            public long id;
            public string kind, option_id, message, sender, status;
        }

        [Serializable]
        class Reply
        {
            public Gift[] gifts;            // ready gifts with id > after, oldest first, at most PageSize
            public long latest;
            public long[] pending;          // ids of gifts still being built (a photo scan)
            public long oldest_pending;     // older servers: the lowest such id; 0 when absent or null
        }

        const int PageSize = 50, MaxPages = 6;

        // Static, so the session's place in the gift list outlives any one object or scene.
        static WebGiftPoller inst;
        static long lastId = -1;                                        // highest gift id seen; -1: not asked yet
        static long sessionFloor = -1;                                  // ids up to here belong to earlier sessions: never shown again
        static readonly HashSet<long> taken = new HashSet<long>();      // every gift id handled this session: none is handled twice
        // Gifts the server was still building when last asked. A photo scan that cannot be turned into a model comes
        // back as a creature gift under its old id, which is below gifts already taken; so while any are remembered
        // here, the next question starts from just below the lowest of them.
        static readonly HashSet<long> pendingIds = new HashSet<long>();
        static readonly Queue<Gift> waiting = new Queue<Gift>();        // arrived while no world was on show

        string baseUrl, room, prefsKey;
        bool warned;
        int announced;

        /// <summary>Gifts turned into creatures this session.</summary>
        public static int Delivered { get; private set; }
        /// <summary>Gifts that have arrived and are waiting for a world to appear in.</summary>
        public static int Waiting => waiting.Count;
        public static bool Running => inst != null;
        public static long LastId => lastId;
        /// <summary>Gifts the server is still building that this session is watching for.</summary>
        public static int Pending => pendingIds.Count;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics()
        {
            inst = null; lastId = -1; sessionFloor = -1; taken.Clear(); pendingIds.Clear(); waiting.Clear(); Delivered = 0;
        }

        /// <summary>Where the next question starts: the last id seen, or just below the lowest gift still being built.</summary>
        static long AskAfter()
        {
            long after = Math.Max(0L, lastId);
            foreach (long id in pendingIds) if (id - 1 < after) after = id - 1;
            return Math.Max(0L, after);
        }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void StartIfConfigured()
        {
            if (inst != null) return;
            string url = CleanUrl(EnvConfig.Get(UrlKey, ""));
            if (url.Length == 0) return;                                 // not configured: do nothing at all
            var go = new GameObject("WebGiftPoller");
            DontDestroyOnLoad(go);
            inst = go.AddComponent<WebGiftPoller>();
            inst.baseUrl = url;
            inst.room = CleanRoom(EnvConfig.Get(RoomKey, DefaultRoom));
            uint hash = 2166136261;                                      // the same key on every run, whatever the platform
            foreach (char ch in url) hash = (hash ^ ch) * 16777619;
            inst.prefsKey = "WishWorld.WebGift." + inst.room + "." + hash.ToString("x8");
            inst.StartCoroutine(inst.Poll());
        }

        /// <summary>Only http(s) addresses are used; a trailing slash is dropped.</summary>
        public static string CleanUrl(string url)
        {
            url = (url ?? "").Trim().TrimEnd('/');
            return url.StartsWith("https://", StringComparison.OrdinalIgnoreCase) || url.StartsWith("http://", StringComparison.OrdinalIgnoreCase) ? url : "";
        }

        /// <summary>Room codes are 3 to 8 letters or digits, upper case (the server refuses anything else).</summary>
        public static string CleanRoom(string code)
        {
            var sb = new System.Text.StringBuilder();
            foreach (char ch in (code ?? "").Trim().ToUpperInvariant())
                if ((ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9')) sb.Append(ch);
            return sb.Length >= 3 && sb.Length <= 8 ? sb.ToString() : DefaultRoom;
        }

        void OnDestroy() { if (inst == this) inst = null; }

        IEnumerator Poll()
        {
            // Pick up where the last session stopped, so gifts sent while the headset was off still arrive (once).
            if (lastId < 0 && PlayerPrefs.HasKey(prefsKey) && long.TryParse(PlayerPrefs.GetString(prefsKey), out long saved) && saved >= 0)
            {
                lastId = saved;
                sessionFloor = saved;
            }
            float wait = Interval;
            var pause = new WaitForSecondsRealtime(0.25f);
            while (true)
            {
                // Ask from just below any gift the server is still building; ids already taken are skipped in Take.
                // A reply holds at most PageSize gifts, so while a low starting point returns a full page, read on
                // from the end of that page: otherwise a held-back start would hide everything newer.
                long after = AskAfter();
                bool ok = false;
                for (int page = 0; page < MaxPages; page++)
                {
                    string url = baseUrl + "/api/gifts?room=" + UnityWebRequest.EscapeURL(room) + "&after=" + after;
                    using (var req = UnityWebRequest.Get(url))
                    {
                        req.timeout = TimeoutSeconds;
                        yield return req.SendWebRequest();               // never blocks a frame
                        ok = req.result == UnityWebRequest.Result.Success && Receive(req.downloadHandler.text, after);
                        if (!ok)
                        {
                            // Say so once, then keep trying more slowly and quietly until it works again.
                            if (!warned) { warned = true; Debug.LogWarning("[WishWorld] Web gifts: cannot reach " + baseUrl + " (" + (req.error ?? "bad reply") + "). Will keep trying."); }
                            wait = Mathf.Min(wait * 2f, MaxWait);
                        }
                    }
                    if (!ok || pageCount < PageSize || pageTop <= after) break;
                    after = pageTop;
                }
                if (ok)
                {
                    if (warned) { warned = false; Debug.Log("[WishWorld] Web gifts: connected again."); }
                    wait = Interval;
                }
                for (float t = 0; t < wait; t += 0.25f)
                {
                    Deliver();
                    yield return pause;
                }
            }
        }

        int pageCount;      // gifts in the last reply
        long pageTop;       // highest id in the last reply

        /// <summary>One reply from the server, as text, and the "after" it answers. False when it is not a gift list.</summary>
        bool Receive(string json, long after)
        {
            Reply reply;
            try { reply = JsonUtility.FromJson<Reply>(json); }
            catch (Exception) { return false; }
            if (reply == null) return false;
            Take(reply, after);
            return true;
        }

        void Take(Reply reply, long after)
        {
            pageCount = reply.gifts != null ? reply.gifts.Length : 0;
            pageTop = after;
            if (reply.gifts != null) foreach (var g in reply.gifts) if (g != null && g.id > pageTop) pageTop = g.id;

            var building = new HashSet<long>();
            if (reply.pending != null) foreach (long id in reply.pending) if (id > 0) building.Add(id);
            if (reply.oldest_pending > 0) building.Add(reply.oldest_pending);

            if (lastId < 0)
            {
                // The first time this headset joins a room, start from now: do not replay the room's history.
                // What is being built right now is not history: watch for it.
                Remember(reply.latest);
                sessionFloor = lastId;
                pendingIds.UnionWith(building);
                return;
            }
            if (reply.latest < lastId && pageCount == 0)
            {
                // The room has fewer gifts than we remember (its data was cleared): follow it down.
                taken.Clear();
                pendingIds.Clear();
                pendingIds.UnionWith(building);
                Remember(reply.latest);
                sessionFloor = lastId;
                return;
            }

            var fresh = new List<Gift>();
            long top = lastId;
            if (reply.gifts != null)
                foreach (var g in reply.gifts)
                {
                    if (g == null || g.id <= 0) continue;
                    // Earlier sessions' gifts stay out, except one this session saw being built: it is only now ready.
                    if (g.id <= sessionFloor && !pendingIds.Contains(g.id)) continue;
                    if (!taken.Add(g.id)) continue;                 // never the same gift twice
                    if (g.id > top) top = g.id;
                    // Only creatures are spawned; scanned toys ("mesh") and letters belong to the web app.
                    if (g.kind == "creature" && (string.IsNullOrEmpty(g.status) || g.status == "ready") && !string.IsNullOrEmpty(g.option_id)) fresh.Add(g);
                }

            // Stop watching a gift once it has arrived, or once the server no longer lists it as being built and this
            // reply would have shown it had it become ready (it lies inside the range this reply covers).
            bool full = pageCount >= PageSize;
            pendingIds.RemoveWhere(id => taken.Contains(id) || (!building.Contains(id) && id > after && (!full || id <= pageTop)));
            pendingIds.UnionWith(building);
            pendingIds.ExceptWith(taken);

            if (top != lastId) Remember(top);
            // After a long time away only the newest few appear, so the room does not fill up at once.
            for (int i = Mathf.Max(0, fresh.Count - MaxAtOnce); i < fresh.Count; i++) waiting.Enqueue(fresh[i]);
            while (waiting.Count > MaxAtOnce * 2) waiting.Dequeue();
        }

        void Remember(long id)
        {
            lastId = Math.Max(0, id);
            PlayerPrefs.SetString(prefsKey, lastId.ToString());
        }

        /// <summary>Hand waiting gifts to the world on show, one at a time. Outside a world, the guide says one is waiting.</summary>
        void Deliver()
        {
            if (waiting.Count == 0 || SceneLoader.Busy) return;
            var wc = WorldController.I;
            if (wc == null || !wc.Ready)
            {
                // In the hub the guide mentions it; in a game nothing is said until the child is back.
                if (HubController.I != null && announced != waiting.Count)
                {
                    announced = waiting.Count;
                    var g = waiting.Peek();
                    GuideVoice.Say(string.IsNullOrWhiteSpace(g.sender) ? "A gift is waiting for you! Pick Wish to open it."
                                                                      : "A gift from " + Short(g.sender, 40) + " is waiting! Pick Wish to open it.");
                }
                return;
            }
            announced = 0;
            Open(wc, waiting.Dequeue());
        }

        static void Open(WorldController wc, Gift gift)
        {
            var lib = WorldLibrary.I;
            if (lib == null) return;
            // option_id is a creature id from the shared list; fall back to the wish keywords ("shark", "sea turtle").
            var def = lib.FindCreature(gift.option_id.Trim().ToLowerInvariant());
            if (def == null)
            {
                var parsed = CommandParser.Parse(gift.option_id, lib);
                if (parsed.creatures.Count > 0) def = lib.FindCreature(parsed.creatures[0]);
            }
            if (def == null) return;        // something this build does not have: skip it quietly

            wc.Begin();                     // the same steps as a wish, so "undo" takes a gift back too
            wc.AddCreature(def.id);
            wc.Commit();
            Delivered++;

            string from = string.IsNullOrWhiteSpace(gift.sender) ? "" : "From " + Short(gift.sender, 40) + ": ";
            string message = string.IsNullOrWhiteSpace(gift.message) ? "Here comes the " + def.displayName.ToLowerInvariant() + "!" : gift.message.Trim();
            GuideVoice.Say(Short(from + message, MaxMessage));
            if (XRRig.I != null) Sfx.Play(Sfx.Chime, XRRig.I.HeadPosition, 0.6f);
        }

        static string Short(string s, int max)
        {
            s = (s ?? "").Trim();
            return s.Length > max ? s.Substring(0, max) : s;
        }
    }
}
