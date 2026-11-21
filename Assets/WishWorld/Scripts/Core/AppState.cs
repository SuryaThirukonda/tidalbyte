using System.Collections.Generic;

namespace WishWorld
{
    public enum WorldMode { VR, AR, Wish }

    /// <summary>What the next scene should do. Survives scene loads; reset when the app restarts.</summary>
    public static class AppState
    {
        public const string SceneBoot = "Boot";
        public const string SceneHub = "Hub";
        public const string SceneFrostSlice = "Game_FrostSlice";
        public const string SceneSnowCircuit = "Game_SnowCircuit";
        public const string SceneWorld = "World";

        public static string pendingWorldId = "aquarium";
        public static WorldMode pendingMode = WorldMode.VR;
        /// <summary>Command to run once the World scene is ready (for example "flying fish" for AR).</summary>
        public static string pendingCommand;

        /// <summary>Creature ids whose fact card has been played this session.</summary>
        public static readonly HashSet<string> learned = new HashSet<string>();
    }
}
