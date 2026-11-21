using System.Collections;
using TMPro;
using UnityEngine;

namespace WishWorld
{
    /// <summary>The snowy home: a floating menu of four cards and the penguin guide.</summary>
    public class HubController : MonoBehaviour
    {
        public const float MenuDistance = 1.8f;
        public static HubController I { get; private set; }

        GameObject mainMenu, gamesMenu, worldsMenu;
        public string OpenMenu { get; private set; } = "main";

        void Awake() { I = this; }
        void OnDestroy() { if (I == this) I = null; }

        IEnumerator Start()
        {
            yield return null;
            yield return null;
            if (XRRig.I != null) XRRig.I.Recenter(transform, false);
            BuildMenus();
            Show("main");
            GuideVoice.Say("Welcome to WishWorld! Pick a card to begin.");
        }

        Transform MenuRoot(string name)
        {
            var go = new GameObject(name);
            go.transform.SetParent(transform, false);
            go.transform.localPosition = new Vector3(0, 1.38f, MenuDistance);
            return go.transform;
        }

        void BuildMenus()
        {
            var theme = WWTheme.I;

            // ----- main: four cards on a gentle arc -----
            var main = MenuRoot("MainMenu");
            mainMenu = main.gameObject;
            Pop(WWUI.Ribbon(main, "WishWorld", 0.125f, new Vector2(0.95f, 0.18f), new Vector3(0, 0.39f, 0)), 0.01f);
            (string name, string sub, System.Action act)[] cards =
            {
                ("Games", "Slice fruit, race cars", () => Show("games")),
                ("Worlds", "Visit far places", () => Show("worlds")),
                ("AR Worlds", "Bring them to you", OpenAR),
                ("Wish", "Say what you wish for", OpenWish),
            };
            for (int i = 0; i < cards.Length; i++)
            {
                float angle = (i - 1.5f) * 15f;
                var b = Card(main, cards[i].name, cards[i].sub, new Vector2(0.44f, 0.32f), cards[i].act, i == 3 ? theme.peach : theme.button);
                // Place on a circle around the player so every card faces them at the same distance.
                var dir = Quaternion.Euler(0, angle, 0) * Vector3.forward;
                b.transform.localPosition = dir * MenuDistance - Vector3.forward * MenuDistance;
                b.transform.localRotation = Quaternion.Euler(0, angle, 0);
            }

            // ----- games -----
            var games = MenuRoot("GamesMenu");
            gamesMenu = games.gameObject;
            Pop(WWUI.Ribbon(games, "Games", 0.09f, new Vector2(0.6f, 0.14f), new Vector3(0, 0.36f, 0)), 0.006f);
            Card(games, "Frost Slice", "Slice the flying fruit", new Vector2(0.5f, 0.32f), () => SceneLoader.Load(AppState.SceneFrostSlice), theme.button)
                .transform.localPosition = new Vector3(-0.28f, 0, 0);
            Card(games, "Snow Circuit", "Race a snowy track", new Vector2(0.5f, 0.32f), () => SceneLoader.Load(AppState.SceneSnowCircuit), theme.button)
                .transform.localPosition = new Vector3(0.28f, 0, 0);
            WWUI.Button(games, "Back", new Vector2(0.3f, 0.11f), () => Show("main"), 0.045f).transform.localPosition = new Vector3(0, -0.3f, 0);

            // ----- worlds: one card per world definition -----
            var worlds = MenuRoot("WorldsMenu");
            worldsMenu = worlds.gameObject;
            Pop(WWUI.Ribbon(worlds, "Worlds", 0.09f, new Vector2(0.6f, 0.14f), new Vector3(0, 0.43f, 0)), 0.006f);
            var lib = WorldLibrary.I;
            int n = 0;
            if (lib != null && lib.worlds != null)
            {
                foreach (var w in lib.worlds)
                {
                    if (w == null || !w.showInMenu) continue;
                    string id = w.id;
                    var b = WWUI.Button(worlds, w.displayName, new Vector2(0.4f, 0.17f), () => OpenWorld(id), 0.05f);
                    b.transform.localPosition = new Vector3((n % 4 - 1.5f) * 0.43f, 0.16f - (n / 4) * 0.2f, 0);
                    n++;
                }
            }
            WWUI.Button(worlds, "Back", new Vector2(0.3f, 0.11f), () => Show("main"), 0.045f).transform.localPosition = new Vector3(0, -0.3f, 0);
        }

        static WWButton Card(Transform parent, string title, string subtitle, Vector2 size, System.Action act, Color fill)
        {
            var b = WWUI.Button(parent, title, size, act, 0.066f, fill, PanelStyle.Frame);
            var main = b.GetComponentInChildren<TextMeshPro>();
            main.rectTransform.sizeDelta = new Vector2(size.x - 0.05f, size.y * 0.45f);
            main.transform.localPosition = new Vector3(0, size.y * 0.13f, -0.004f);
            b.spoken = title + ". " + subtitle + ".";
            var sub = WWUI.Label(b.transform, subtitle, 0.036f, new Vector2(size.x - 0.06f, size.y * 0.3f), WWTheme.I.slate);
            sub.transform.localPosition = new Vector3(0, -size.y * 0.24f, -0.004f);
            return b;
        }

        /// <summary>The ribbon over a menu drops in and then drifts a little, like a banner in a light wind.</summary>
        static void Pop(TextMeshPro ribbonLabel, float bob)
        {
            var p = ribbonLabel.transform.parent.gameObject.AddComponent<PopIn>();
            p.bob = bob;
            p.bobSpeed = 0.9f;
        }

        public void Show(string menu)
        {
            if (menu != OpenMenu) GuideVoice.ReadNow(menu == "games" ? VoiceLines.GamesMenu : menu == "worlds" ? VoiceLines.WorldsMenu : null);
            OpenMenu = menu;
            mainMenu.SetActive(menu == "main");
            gamesMenu.SetActive(menu == "games");
            worldsMenu.SetActive(menu == "worlds");
        }

        public void OpenWorld(string id)
        {
            AppState.pendingWorldId = id;
            AppState.pendingMode = WorldMode.VR;
            AppState.pendingCommand = null;
            SceneLoader.Load(AppState.SceneWorld);
        }

        public void OpenAR()
        {
            AppState.pendingMode = WorldMode.AR;
            AppState.pendingCommand = "flying fish";
            SceneLoader.Load(AppState.SceneWorld);
        }

        public void OpenWish()
        {
            AppState.pendingMode = WorldMode.Wish;
            AppState.pendingCommand = null;
            SceneLoader.Load(AppState.SceneWorld);
        }
    }
}
