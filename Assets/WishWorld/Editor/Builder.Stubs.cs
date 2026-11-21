namespace WishWorld.EditorTools
{
    // Filled in as each stage is built.
    public static partial class WishWorldBuilder
    {
        static partial void BuildWorldContentImpl();
        static partial void BuildGameContentImpl();
        static partial void BuildFrostSliceSceneImpl();
        static partial void BuildSnowCircuitSceneImpl();
        static partial void BuildWorldSceneImpl();
        public static void BuildWorldContent() { LoadShared(); BuildWorldContentImpl(); }
        public static void BuildGameContent() { LoadShared(); BuildGameContentImpl(); }
        static void BuildFrostSliceScene() { BuildFrostSliceSceneImpl(); }
        static void BuildSnowCircuitScene() { BuildSnowCircuitSceneImpl(); }
        static void BuildWorldScene() { BuildWorldSceneImpl(); }
    }
}
