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

        /// <summary>
        /// Toys that "scan a toy" has brought in this session. The World scene adds them back every time it builds a
        /// world's creature list, which is what keeps a toy with the child from world to world.
        /// </summary>
        public static readonly HashSet<string> scannedToyIds = new HashSet<string>();
        /// <summary>The toy scanned most recently. Scanning again once every toy is in replays this one.</summary>
        public static string lastToyId;
        /// <summary>
        /// The child's name, for the toy's greeting. Kept in memory for this session only: never saved, never logged,
        /// and sent nowhere except as the words of a line for the voice to speak.
        /// </summary>
        public static string childName;
    }
}
