using System.Collections.Generic;
using UnityEngine;

namespace WishWorld
{
    /// <summary>Every world and creature the app knows. Loaded from Resources.</summary>
    [CreateAssetMenu(menuName = "WishWorld/Library")]
    public class WorldLibrary : ScriptableObject
    {
        public WorldDefinition[] worlds;
        public CreatureDefinition[] creatures;
        [Tooltip("Toys the team prepared ahead of time (WishWorld > Rebuild All, Builder.Toy.cs). A toy is not in the menu and " +
                 "cannot be asked for by name until \"scan a toy\" has brought it in. Empty when WISHWORLD_TOY=off.")]
        public CreatureDefinition[] toys;
        public GameObject snowPrefab;
        public GameObject guidePrefab;
        public Material skyMaterial;

        static WorldLibrary cached;
        public static WorldLibrary I
        {
            get
            {
                if (cached == null) cached = Resources.Load<WorldLibrary>("WorldLibrary");
                return cached;
            }
        }

        public WorldDefinition FindWorld(string id)
        {
            if (worlds == null || string.IsNullOrEmpty(id)) return null;
            foreach (var w in worlds) if (w != null && w.id == id) return w;
            return null;
        }

        public CreatureDefinition FindCreature(string id)
        {
            if (string.IsNullOrEmpty(id)) return null;
            if (creatures != null) foreach (var c in creatures) if (c != null && c.id == id) return c;
            return FindToy(id);
        }

        public CreatureDefinition FindToy(string id)
        {
            if (toys == null || string.IsNullOrEmpty(id)) return null;
            foreach (var t in toys) if (t != null && t.id == id) return t;
            return null;
        }

        /// <summary>True when there is a toy to scan and the feature is switched on (.env: WISHWORLD_TOY, default on).</summary>
        public bool ToysEnabled => toys != null && toys.Length > 0 && EnvConfig.ToyEnabled;

        /// <summary>The toys that "scan a toy" has already brought in this session, in library order.</summary>
        public IEnumerable<CreatureDefinition> ScannedToys()
        {
            if (!ToysEnabled) yield break;
            foreach (var t in toys)
                if (t != null && AppState.scannedToyIds.Contains(t.id)) yield return t;
        }
    }
}
