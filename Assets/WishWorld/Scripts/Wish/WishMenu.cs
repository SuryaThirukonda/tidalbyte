using System.Collections.Generic;
using TMPro;
using UnityEngine;

namespace WishWorld
{
    /// <summary>
    /// The controller menu for wish and AR modes. Every button sends a command string to the
    /// CommandRouter, the same text that voice would produce.
    /// </summary>
    public class WishMenu : MonoBehaviour
    {
        const int Columns = 3, Rows = 4;
        static readonly string[] Tabs = { "Worlds", "Creatures", "Change", "Sky", "Control" };

        readonly List<WWButton> tabButtons = new List<WWButton>();
        readonly List<GameObject> cells = new List<GameObject>();
        Transform grid;
        TextMeshPro status;
        int tab, page;

        void Awake()
        {
            var theme = WWTheme.I;
            var panel = WWUI.Panel(transform, "Panel", new Vector2(0.92f, 0.74f), theme.panel, 0.05f, 0.008f);
            panel.AddComponent<PopIn>();
            for (int i = 0; i < Tabs.Length; i++)
            {
                int k = i;
                var b = WWUI.Button(panel.transform, Tabs[i], new Vector2(0.168f, 0.075f), () => SelectTab(k), 0.03f);
                b.transform.localPosition = new Vector3((i - 2) * 0.176f, 0.31f, -0.006f);
                tabButtons.Add(b);
            }
            grid = new GameObject("Grid").transform;
            grid.SetParent(panel.transform, false);
            status = WWUI.Label(panel.transform, "Hold A and speak, or pick", 0.03f, new Vector2(0.7f, 0.05f), theme.slate);
            status.transform.localPosition = new Vector3(0, -0.325f, -0.004f);
            statusPop = status.gameObject.AddComponent<PopIn>();
            SelectTab(0);
        }

        PopIn statusPop;
        string statusText = "";

        public void SetStatus(string text)
        {
            if (status == null) return;
            statusText = text ?? "";
            status.text = statusText;
            if (statusPop != null) statusPop.Kick(0.2f);
        }

        void Update()
        {
            // "Listening..." and "Thinking..." count their dots, so it is plain that something is happening
            if (status == null || !statusText.EndsWith("...")) return;
            int dots = 1 + (int)(Time.unscaledTime * 3f) % 3;
            status.text = statusText.Substring(0, statusText.Length - 3) + new string('.', dots) + new string(' ', 3 - dots);
        }

        public const string ScanLabel = "Scan a toy";

        /// <summary>Lay the buttons out again, for when the choices have changed (a toy has just been scanned).</summary>
        public void Refresh() { Fill(); }

        public void SelectTab(int index)
        {
            tab = index;
            page = 0;
            for (int i = 0; i < tabButtons.Count; i++) tabButtons[i].SetSelected(i == tab);
            Fill();
        }

        void Fill()
        {
            foreach (var c in cells) Destroy(c);
            cells.Clear();
            var items = new List<(string label, string command)>();
            var lib = WorldLibrary.I;
            switch (tab)
            {
                case 0:
                    foreach (var w in lib.worlds) if (w != null && w.showInMenu) items.Add((w.displayName, w.keywords[0]));
                    break;
                case 1:
                    if (lib.ToysEnabled) items.Add((ScanLabel, CommandParser.ScanCommand));
                    foreach (var c in lib.creatures) if (c != null) items.Add((c.displayName, "add " + c.keywords[0]));
                    foreach (var t in lib.ScannedToys()) items.Add((t.displayName, "add " + t.keywords[0]));     // only after its scan
                    break;
                case 2:
                    items.AddRange(new[] { ("Red", "red"), ("Blue", "blue"), ("Purple", "purple"), ("Gold", "gold"), ("Rainbow", "rainbow"),
                        ("More", "more"), ("Fewer", "fewer"), ("Lots", "lots of"), ("Bigger", "bigger"), ("Smaller", "smaller"), ("Giant", "giant"), ("Tiny", "tiny") });
                    break;
                case 3:
                    items.AddRange(new[] { ("Make it snow", "make it snow"), ("Make it night", "make it night"), ("Make it sunny", "make it sunny"),
                        ("In my room", "in my room"), ("Take me there", "take me there") });
                    break;
                default:
                    items.AddRange(new[] { ("Undo", "undo"), ("Clear", "clear"), ("Go home", "go home") });
                    break;
            }

            int perPage = Columns * Rows;
            bool paged = items.Count > perPage;
            int shown = paged ? perPage - 1 : perPage;
            int pages = paged ? Mathf.CeilToInt(items.Count / (float)shown) : 1;
            page = Mathf.Clamp(page, 0, pages - 1);
            for (int i = 0; i < shown; i++)
            {
                int idx = page * shown + i;
                if (idx >= items.Count) break;
                var item = items[idx];
                AddCell(i, item.label, () => { if (CommandRouter.I != null) CommandRouter.I.Execute(item.command); });
            }
            if (paged) AddCell(perPage - 1, "More " + (page + 1) + "/" + pages, () => { page = (page + 1) % pages; Fill(); }, true);
        }

        void AddCell(int slot, string label, System.Action action, bool accent = false)
        {
            var b = WWUI.Button(grid, label, new Vector2(0.27f, 0.105f), action, 0.032f, accent ? WWTheme.I.peach : (Color?)null);
            b.transform.localPosition = new Vector3((slot % Columns - 1) * 0.285f, 0.195f - (slot / Columns) * 0.12f, -0.006f);
            cells.Add(b.gameObject);
        }
    }
}
