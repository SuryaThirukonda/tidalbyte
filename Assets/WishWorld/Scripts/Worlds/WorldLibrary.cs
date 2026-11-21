using UnityEngine;

namespace WishWorld
{
    /// <summary>Every world and creature the app knows. Loaded from Resources.</summary>
    [CreateAssetMenu(menuName = "WishWorld/Library")]
    public class WorldLibrary : ScriptableObject
    {
        public WorldDefinition[] worlds;
        public CreatureDefinition[] creatures;
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
            if (creatures == null || string.IsNullOrEmpty(id)) return null;
            foreach (var c in creatures) if (c != null && c.id == id) return c;
            return null;
        }
    }
}
