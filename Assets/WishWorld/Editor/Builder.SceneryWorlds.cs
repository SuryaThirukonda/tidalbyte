using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEngine;

namespace WishWorld.EditorTools
{
    /// <summary>The surroundings of each world: what stands where. Distances are metres from the player at the origin, +Z ahead.</summary>
    public static partial class WishWorldBuilder
    {
        // ------------------------------------------------------------------ sky photographs
        [Serializable] class SkyInfo { public string name, source; public float sunU, sunElevation; public float[] horizon, overhead; }
        [Serializable] class SkyFile { public SkyInfo[] skies; }
        const string SkyFolder = "Assets/ThirdParty/Skies";
        static Dictionary<string, SkyInfo> skyInfo;

        static SkyInfo Sky_(string name)
        {
            if (skyInfo == null)
            {
                skyInfo = new Dictionary<string, SkyInfo>();
                string json = SkyFolder + "/skies.json";
                if (File.Exists(json))
                    foreach (var s in JsonUtility.FromJson<SkyFile>(File.ReadAllText(json)).skies) skyInfo[s.name] = s;
            }
            return PackMeshes.UsePacks && !string.IsNullOrEmpty(name) && skyInfo.TryGetValue(name, out var i) ? i : null;
        }

        /// <summary>The real sky photograph for a world, imported for a 360 backdrop. Null if there is none.</summary>
        public static Texture2D SkyPhoto(string name)
        {
            string path = SkyFolder + "/Sky_" + name + ".jpg";
            if (Sky_(name) == null || !File.Exists(path)) return null;
            var imp = (TextureImporter)AssetImporter.GetAtPath(path);
            if (imp == null) { AssetDatabase.ImportAsset(path); imp = (TextureImporter)AssetImporter.GetAtPath(path); }
            var android = imp.GetPlatformTextureSettings("Android");
            if (imp.mipmapEnabled || imp.maxTextureSize != 4096 || imp.wrapModeU != TextureWrapMode.Repeat || !android.overridden)
            {
                imp.mipmapEnabled = false;
                imp.wrapModeU = TextureWrapMode.Repeat; imp.wrapModeV = TextureWrapMode.Clamp;
                imp.maxTextureSize = 4096;
                imp.textureCompression = TextureImporterCompression.Compressed;
                android.overridden = true; android.maxTextureSize = 4096; android.format = TextureImporterFormat.ASTC_6x6;
                imp.SetPlatformTextureSettings(android);
                imp.SaveAndReimport();
            }
            return AssetDatabase.LoadAssetAtPath<Texture2D>(path);
        }

        /// <summary>Direction the sun's light travels for a sky photograph, lifted so the ground is never lit at a grazing angle.</summary>
        public static Vector3 SunDirection(string name, float minElevation = 30f)
        {
            var i = Sky_(name);
            if (i == null) return Vector3.zero;
            float lon = (0.5f - i.sunU) * Mathf.PI * 2f, el = Mathf.Clamp(i.sunElevation, minElevation, 72f) * Mathf.Deg2Rad;
            var toSun = new Vector3(Mathf.Cos(el) * Mathf.Cos(lon), Mathf.Sin(el), Mathf.Cos(el) * Mathf.Sin(lon));
            return -toSun;
        }

        public static Color SkyHorizon(string name, Color fallback)
        {
            var i = Sky_(name);
            return i == null ? fallback : new Color(i.horizon[0], i.horizon[1], i.horizon[2]);
        }

        static float Face(float x, float z) => Mathf.Atan2(-x, -z) * Mathf.Rad2Deg;      // yaw that turns +Z toward the player
        static Color V(Color c, float amount, float x, float z, float scale = 9f) => Color.Lerp(c * (1f - amount), Color.Lerp(c, Color.white, amount * 0.6f), N2(x, z, scale, 9f));
        static float Len(float x, float z) => Mathf.Sqrt(x * x + z * z);

        static readonly string[] Oaks = { "nature/tree_oak", "nature/tree_default", "nature/tree_detailed", "nature/tree_fat", "nature/tree_simple", "nature/tree_oak_dark", "nature/tree_detailed_dark" };
        static readonly string[] Rocks = { "nature/rock_largeA", "nature/rock_largeB", "nature/rock_largeC", "nature/rock_largeD", "nature/rock_tallA", "nature/rock_tallB", "nature/rock_tallC", "nature/rock_tallD", "nature/rock_tallE" };
        static readonly string[] Pebbles = { "nature/rock_smallA", "nature/rock_smallB", "nature/rock_smallC", "nature/rock_smallD", "nature/rock_smallE", "nature/stone_smallA", "nature/stone_smallB" };
        static readonly string[] Bushes = { "nature/plant_bush", "nature/plant_bushDetailed", "nature/plant_bushLarge", "nature/plant_bushSmall", "nature/plant_bushTriangle" };
        static readonly string[] Grass = { "nature/grass", "nature/grass_large", "nature/grass_leafs", "nature/grass_leafsLarge" };
        static readonly string[] Flowers = { "nature/flower_purpleA", "nature/flower_redA", "nature/flower_yellowA", "nature/flower_purpleB", "nature/flower_redB", "nature/flower_yellowB", "nature/flower_redC", "nature/flower_yellowC" };
        static readonly string[] Palms = { "nature/tree_palm", "nature/tree_palmBend", "nature/tree_palmDetailedTall", "nature/tree_palmDetailedShort", "nature/tree_palmTall", "pirate/palm-detailed-bend", "pirate/palm-detailed-straight", "pirate/palm-straight" };
        static readonly string[] Pines = { "nature/tree_pineTallA_detailed", "nature/tree_pineTallB_detailed", "nature/tree_pineTallC_detailed", "nature/tree_pineTallD_detailed", "nature/tree_pineDefaultA", "nature/tree_pineDefaultB", "nature/tree_pineRoundA", "nature/tree_pineRoundC" };

        /// <summary>Menu: rebuild only the surroundings (and the definitions that point at them).</summary>
        [MenuItem("WishWorld/Rebuild Surroundings")]
        public static void RebuildSurroundings()
        {
            LoadShared();
            foreach (var kv in SceneryBuilders) kv.Value();
            AssetDatabase.SaveAssets();
        }

        public static readonly Dictionary<string, Func<GameObject>> SceneryBuilders = new Dictionary<string, Func<GameObject>>
        {
            { "farm", SceneryFarm }, { "zoo", ScenerySavanna }, { "dinosaurs", SceneryDinosaurs }, { "arctic", SceneryArctic },
            { "rainforest", SceneryRainforest }, { "aquarium", SceneryReef }, { "space", SceneryMoon }, { "sky", ScenerySummit },
        };

        /// <summary>Build one world's surroundings; returns the Resources path to load it by, or null if it has none.</summary>
        public static string BuildScenery(string worldId)
        {
            if (!SceneryBuilders.TryGetValue(worldId, out var build)) return null;
            return build() != null ? "Scenery/" + worldId : null;
        }

        // ================================================================== farm
        static GameObject SceneryFarm()
        {
            var s = new Scenery(21);
            var pond = new Vector2(15f, -17f);
            var road = Spline(6, new Vector2(-260, -70), new Vector2(-120, -34), new Vector2(-40, -17), new Vector2(-12, -13), new Vector2(18, -30), new Vector2(70, -44), new Vector2(170, -30), new Vector2(300, -60));
            s.Height = (x, z) =>
            {
                float r = Len(x, z);
                float h = (N2(x, z, 95f) - 0.45f) * 16f * Smooth(14f, 80f, r) + (N2(x, z, 26f, 1f) - 0.5f) * 2.4f * Smooth(9f, 32f, r);
                h += Smooth(240f, 560f, r) * Ridge(x, z, 190f, 2f) * 110f;
                h -= 1.3f * Smooth(8.5f, 4f, Len(x - pond.x, z - pond.y));
                return h;
            };
            Color grass = new Color(0.46f, 0.70f, 0.32f), wheat = new Color(0.90f, 0.78f, 0.36f), soil = new Color(0.52f, 0.38f, 0.26f), dirt = new Color(0.72f, 0.60f, 0.42f);
            s.Terrain(600f, 44, 110, (p, n) =>
            {
                float r = Len(p.x, p.z);
                if (DistanceToPath(road, p.x, p.z) < 2.6f) return V(dirt, 0.12f, p.x, p.z, 4f);
                if (Len(p.x - pond.x, p.z - pond.y) < 7.5f) return new Color(0.50f, 0.46f, 0.32f);
                Color c = V(grass, 0.22f, p.x, p.z);
                if (r > 34f && r < 300f)
                {
                    // patchwork of fields, each cell one crop
                    float u = (p.x * 0.80f + p.z * 0.60f) / 46f, v = (-p.x * 0.60f + p.z * 0.80f) / 64f;
                    float cell = Hash(Mathf.Floor(u), Mathf.Floor(v), 3f);
                    bool stripe = Mathf.FloorToInt((-p.x * 0.60f + p.z * 0.80f) / 3.2f) % 2 == 0;
                    if (cell < 0.22f) c = stripe ? wheat : wheat * 0.92f;
                    else if (cell < 0.38f) c = stripe ? soil : soil * 1.18f;
                    else if (cell < 0.52f) c = new Color(0.36f, 0.60f, 0.26f) * (stripe ? 1f : 0.9f);
                    else if (cell < 0.62f) c = new Color(0.94f, 0.86f, 0.30f);
                    c = Color.Lerp(c, V(grass, 0.2f, p.x, p.z), Smooth(200f, 300f, r));
                }
                if (r > 300f) c = Color.Lerp(c, new Color(0.40f, 0.56f, 0.46f), Smooth(300f, 420f, r));
                if (n.y < 0.80f && r > 260f) c = Color.Lerp(c, new Color(0.50f, 0.52f, 0.50f), Smooth(0.80f, 0.62f, n.y));
                return c;
            });
            s.Patch(pond.x, pond.y, 6.6f, -0.32f, new Color(0.32f, 0.58f, 0.80f), 16);
            foreach (var (dx, dz) in new[] { (2f, 1f), (-2.5f, 2.2f), (0.6f, -2.6f), (-1.2f, -1f) }) s.Put("nature/lily_large", pond.x + dx, pond.y + dz, 0.12f, float.NaN, 0f, null, -0.31f);
            bool Free(float x, float z) => DistanceToPath(road, x, z) > 4.5f && Len(x - pond.x, z - pond.y) > 8.5f;

            // the yard: barn and silo, farmhouse, windmill
            s.PutMesh(SceneryProps.Barn(), -17f, 27f, 1f, Face(-17f, 27f));
            var rng = new System.Random(5);
            s.PutMesh(SceneryProps.House(rng, new Color(0.96f, 0.94f, 0.88f), new Color(0.62f, 0.26f, 0.22f)), 18f, 21f, 1f, Face(18f, 21f));
            s.Put("town/windmill", 30f, 44f, 15f, Face(30f, 44f) + 90f);
            s.Put("car/tractor", -5.5f, 17f, 2.9f, 140f);
            s.Put("town/cart", 9f, 13.5f, 1.3f, 30f);
            s.Put("nature/log_stackLarge", -27f, 19f, 1.5f);
            s.Put("town/stall-red", 12f, 15f, 2.3f, Face(12f, 15f));
            for (int i = 0; i < 9; i++) s.PutMesh(SceneryProps.HayBale(true), 26f + (i % 3) * 5.5f + s.R(-1, 1), -2f + (i / 3) * 6f + s.R(-1, 1), 1f);
            for (int i = 0; i < 6; i++) s.PutMesh(SceneryProps.HayBale(false), -23.5f + (i % 3) * 1.25f, 17f, 1f, 0f, 0f, null, s.H(-23.5f, 17f) + (i / 3) * 0.6f);

            // a paddock fence round the animals, open toward the yard
            for (int i = 0; i < 20; i++)
            {
                float a = i / 20f * Mathf.PI * 2f;
                if (Mathf.Abs(Mathf.DeltaAngle(a * Mathf.Rad2Deg, 90f)) < 14f) continue;      // the gateway, straight ahead
                s.Put("nature/fence_simple", Mathf.Cos(a) * 9.2f, Mathf.Sin(a) * 9.2f, 1.0f, Mathf.Atan2(-Mathf.Cos(a), -Mathf.Sin(a)) * Mathf.Rad2Deg, 0f);
            }
            // crops near the yard
            for (int i = 0; i < 6; i++) for (int k = 0; k < 7; k++) s.Put("nature/crops_cornStageD", -31f + i * 1.1f, -1f + k * 1.1f, s.R(2.0f, 2.4f));
            s.PutMesh(SceneryProps.Scarecrow(), -27.5f, -3.2f, 1f, 30f);
            for (int i = 0; i < 7; i++) for (int k = 0; k < 8; k++) s.Put("nature/crops_wheatStageB", -40f + i * 0.9f, 9f + k * 0.9f, s.R(0.9f, 1.1f));
            for (int i = 0; i < 12; i++) s.Put(s.Pick("nature/crop_pumpkin", "nature/crop_melon"), 22f + (i % 4) * 1.6f + s.R(-0.3f, 0.3f), 9f + (i / 4) * 1.6f, s.R(0.45f, 0.6f));
            // animals grazing far off (these stand still; the ones near you are alive)
            foreach (var (name, count) in new[] { ("Cow", 9), ("Sheep", 14), ("Horse", 4) })
                for (int i = 0; i < count; i++)
                {
                    float a = s.R(0f, 6.28f), d = s.R(42f, 120f), x = Mathf.Cos(a) * d, z = Mathf.Sin(a) * d;
                    if (Free(x, z)) s.PutMesh(PackMeshes.Load(name) ?? (name == "Cow" ? CreatureMeshes.Cow() : name == "Sheep" ? CreatureMeshes.Sheep() : CreatureMeshes.Horse()), x, z);
                }
            // a village and a second farm far off
            for (int i = 0; i < 9; i++)
            {
                float x = -150f + s.R(-34f, 34f), z = 190f + s.R(-26f, 26f);
                s.PutMesh(SceneryProps.House(rng, new Color(0.94f, 0.90f, 0.82f), s.Pick(new Color(0.62f, 0.28f, 0.22f), new Color(0.42f, 0.36f, 0.40f))), x, z, 1.15f);
            }
            s.PutMesh(SceneryProps.Church(false), -150f, 196f, 1.3f, 200f);
            s.PutMesh(SceneryProps.Barn(), 140f, 110f, 1.1f, 250f);
            s.Put("town/windmill", -90f, -150f, 17f);

            s.Scatter(Oaks, 300, 16f, 560f, 5.5f, 10f, (x, z) => Free(x, z) && (N2(x, z, 70f, 4f) > 0.52f || Len(x, z) > 280f || Len(x, z) < 34f), 1.5f, null, 0.03f, 4f);
            s.Scatter(Bushes, 90, 10.5f, 130f, 0.7f, 1.6f, Free, 2f);
            s.Scatter(Flowers, 110, 2.6f, 34f, 0.25f, 0.45f, Free, 1.4f);
            s.Scatter(Grass, 170, 2.4f, 46f, 0.22f, 0.42f, Free, 1.6f);
            s.Scatter(Rocks, 40, 12f, 300f, 0.6f, 2.4f, Free, 1.4f);
            return s.Save("farm");
        }

        // ================================================================== savanna
        static GameObject ScenerySavanna()
        {
            var s = new Scenery(22);
            var hole = new Vector2(-14f, 16f);
            var peak = new Vector2(90f, 520f);
            s.Height = (x, z) =>
            {
                float r = Len(x, z);
                float h = (N2(x, z, 130f) - 0.5f) * 11f * Smooth(16f, 110f, r) + (N2(x, z, 30f, 1f) - 0.5f) * 1.8f * Smooth(9f, 30f, r);
                h += Mathf.Pow(Mathf.Max(0f, 1f - Len(x - peak.x, z - peak.y) / 260f), 1.35f) * 240f;                 // one great mountain
                h += Smooth(330f, 600f, r) * Ridge(x, z, 210f, 3f) * 55f;
                h -= 1.4f * Smooth(9f, 4f, Len(x - hole.x, z - hole.y));
                return h;
            };
            Color gold = new Color(0.82f, 0.70f, 0.38f), earth = new Color(0.70f, 0.48f, 0.32f);
            s.Terrain(640f, 34, 84, (p, n) =>
            {
                float dh = Len(p.x - hole.x, p.z - hole.y);
                if (dh < 8.2f) return new Color(0.46f, 0.38f, 0.28f);                                      // mud
                Color c = Color.Lerp(V(gold, 0.2f, p.x, p.z), earth, Smooth(0.60f, 0.72f, N2(p.x, p.z, 44f, 6f)));
                c = Color.Lerp(c, new Color(0.56f, 0.66f, 0.30f), Smooth(22f, 9f, dh));                    // greener round the water
                if (p.y > 30f) c = Color.Lerp(c, new Color(0.46f, 0.42f, 0.50f), Smooth(30f, 90f, p.y));  // the mountain, blue with distance
                if (p.y > 170f) c = Color.Lerp(c, Color.white, Smooth(170f, 196f, p.y + (N2(p.x, p.z, 30f) - 0.5f) * 30f));
                if (n.y < 0.7f && p.y < 30f) c = Color.Lerp(c, new Color(0.56f, 0.48f, 0.40f), 0.6f);
                return c;
            });
            s.Patch(hole.x, hole.y, 6.8f, -0.36f, new Color(0.36f, 0.56f, 0.66f), 16);
            bool Dry(float x, float z) => Len(x - hole.x, z - hole.y) > 9.5f;
            var rng = new System.Random(8);

            s.ScatterMade(() => SceneryProps.Acacia(rng), 95, 13f, 520f, 0.9f, 1.4f, Dry, 1.5f, 8f);
            s.ScatterMade(() => SceneryProps.Baobab(rng), 8, 26f, 260f, 0.9f, 1.3f, Dry, 1f, 30f);
            s.ScatterMade(() => SceneryProps.TermiteMound(rng), 16, 11f, 120f, 0.8f, 1.4f, Dry, 1.5f, 6f);
            s.ScatterMade(() => SceneryProps.DeadTree(rng), 12, 12f, 200f, 0.9f, 1.3f, Dry, 1.2f, 10f);
            // kopjes: piles of boulders standing out of the plain
            foreach (var (kx, kz, n) in new[] { (34f, 30f, 9), (-46f, 52f, 12), (70f, -40f, 10), (-90f, -60f, 14), (150f, 120f, 16), (-30f, -34f, 7) })
                for (int i = 0; i < n; i++)
                    s.PutMesh(SceneryProps.Boulder(rng, Color.Lerp(new Color(0.62f, 0.50f, 0.40f), new Color(0.52f, 0.46f, 0.42f), s.R(0f, 1f)), s.R(1.6f, 6f)), kx + s.R(-7f, 7f), kz + s.R(-7f, 7f), 1f, float.NaN, 0.3f);
            s.Scatter(Grass, 320, 2.4f, 80f, 0.2f, 0.5f, Dry, 1.5f, Mix(new Color(0.86f, 0.74f, 0.36f), 0.85f));
            s.Scatter(Bushes, 120, 10.5f, 200f, 0.6f, 1.7f, Dry, 1.6f, Mix(new Color(0.52f, 0.56f, 0.28f), 0.6f));
            s.Scatter(Pebbles, 60, 2.6f, 60f, 0.15f, 0.5f, Dry, 1.4f, Mix(new Color(0.66f, 0.54f, 0.42f), 0.4f));
            for (int i = 0; i < 16; i++)       // reeds at the water's edge
            {
                float a = s.R(0f, 6.28f), d = s.R(6.6f, 8.2f);
                s.Put("nature/plant_flatTall", hole.x + Mathf.Cos(a) * d, hole.y + Mathf.Sin(a) * d, s.R(0.5f, 0.9f), float.NaN, 0.02f, Mix(new Color(0.50f, 0.62f, 0.26f), 0.5f));
            }
            // a safari camp
            s.Put("nature/tent_detailedOpen", 21f, 27f, 2.5f, Face(21f, 27f) + 180f);
            s.Put("nature/tent_smallClosed", 26f, 23f, 2.0f, Face(26f, 23f) + 180f);
            s.Put("nature/campfire_stones", 21.5f, 22.5f, 0.45f);
            s.Put("car/suv", 16f, 24.5f, 1.9f, 115f, 0f, Mix(new Color(0.70f, 0.64f, 0.46f), 0.55f));
            s.Put("survival/box-large", 23.5f, 25f, 0.6f); s.Put("survival/barrel", 24.4f, 25.8f, 0.9f);
            // herds in the distance
            for (int i = 0; i < 12; i++) { float a = s.R(0.3f, 1.5f), d = s.R(46f, 110f); s.PutMesh(PackMeshes.Load("Zebra") ?? CreatureMeshes.Zebra(), Mathf.Cos(a) * d, Mathf.Sin(a) * d); }
            for (int i = 0; i < 4; i++) { float a = s.R(2.0f, 2.9f), d = s.R(70f, 130f); s.PutMesh(CreatureMeshes.Elephant(), Mathf.Cos(a) * d, Mathf.Sin(a) * d, s.R(0.8f, 1.1f)); }
            for (int i = 0; i < 4; i++) { float a = s.R(-0.6f, 0.2f), d = s.R(60f, 120f); s.PutMesh(CreatureMeshes.Giraffe(), Mathf.Cos(a) * d, Mathf.Sin(a) * d, s.R(0.85f, 1.1f)); }
            return s.Save("zoo");
        }

        // ================================================================== dinosaur valley
        static GameObject SceneryDinosaurs()
        {
            var s = new Scenery(23);
            var volcano = new Vector2(60f, 380f);
            var swamp = new Vector2(-21f, -15f);
            var river = Spline(6, new Vector2(70, 250), new Vector2(40, 150), new Vector2(52, 80), new Vector2(30, 40), new Vector2(4, 22), new Vector2(-30, 24), new Vector2(-80, 60), new Vector2(-180, 90), new Vector2(-340, 80));
            float Cone(float x, float z)
            {
                float d = Len(x - volcano.x, z - volcano.y);
                float h = Mathf.Pow(Mathf.Max(0f, 1f - d / 250f), 1.3f) * 250f;
                if (d < 34f) h -= (34f - d) * 2.4f;                                 // the crater
                return h;
            }
            s.Height = (x, z) =>
            {
                float r = Len(x, z);
                float h = (N2(x, z, 80f) - 0.46f) * 22f * Smooth(14f, 90f, r) + (N2(x, z, 24f, 1f) - 0.5f) * 2.6f * Smooth(9f, 30f, r);
                h += Smooth(250f, 600f, r) * Ridge(x, z, 170f, 4f) * 150f;
                h = Mathf.Max(h, Cone(x, z));
                h -= 1.7f * Smooth(6.5f, 2f, DistanceToPath(river, x, z)) * Smooth(150f, 210f, Len(x - volcano.x, z - volcano.y));
                h -= 1.0f * Smooth(8.5f, 4f, Len(x - swamp.x, z - swamp.y));
                return h;
            };
            Color lush = new Color(0.34f, 0.58f, 0.28f), deep = new Color(0.22f, 0.44f, 0.24f), basalt = new Color(0.26f, 0.23f, 0.24f);
            s.Terrain(660f, 36, 88, (p, n) =>
            {
                float dv = Len(p.x - volcano.x, p.z - volcano.y), dr = DistanceToPath(river, p.x, p.z);
                Color c = Color.Lerp(V(lush, 0.22f, p.x, p.z), deep, Smooth(0.45f, 0.7f, N2(p.x, p.z, 60f, 5f)));
                if (dr < 6f) c = Color.Lerp(new Color(0.62f, 0.56f, 0.38f), c, Smooth(3.5f, 6f, dr));               // muddy banks
                if (Len(p.x - swamp.x, p.z - swamp.y) < 8f) c = new Color(0.34f, 0.40f, 0.24f);
                if (n.y < 0.72f) c = Color.Lerp(c, new Color(0.50f, 0.46f, 0.42f), Smooth(0.72f, 0.5f, n.y));      // rock on steep ground
                if (dv < 250f && p.y > 14f)
                {
                    c = Color.Lerp(c, V(basalt, 0.25f, p.x, p.z, 20f), Smooth(14f, 80f, p.y));
                    float streak = Ridge(p.x, p.z, 26f, 7f);
                    if (p.y > 110f && streak > 0.74f) c = Color.Lerp(c, new Color(1f, 0.46f, 0.10f), Smooth(110f, 190f, p.y));   // lava
                    if (dv < 30f) c = new Color(1f, 0.62f, 0.14f);
                }
                else if (p.y > 120f) c = Color.Lerp(c, new Color(0.62f, 0.60f, 0.62f), Smooth(120f, 170f, p.y));
                return c;
            });
            s.Ribbon(river, 6.4f, 0.95f, new Color(0.30f, 0.56f, 0.70f));
            s.Patch(swamp.x, swamp.y, 6.4f, -0.3f, new Color(0.30f, 0.46f, 0.36f), 14);
            for (int i = 0; i < 6; i++) s.Put("nature/lily_large", swamp.x + s.R(-4f, 4f), swamp.y + s.R(-4f, 4f), 0.14f, float.NaN, 0f, null, -0.29f);
            bool Land(float x, float z) => DistanceToPath(river, x, z) > 5.5f && Len(x - swamp.x, z - swamp.y) > 8f && Len(x - volcano.x, z - volcano.y) > 150f;
            var rng = new System.Random(9);

            s.PutMesh(SceneryProps.SmokePlume(rng, new Color(0.42f, 0.40f, 0.42f)), volcano.x, volcano.y, 1.6f, 20f, 0f, null, 172f);
            s.PutMesh(SceneryProps.DinoSkeleton(), 13.5f, 14.5f, 1.25f, 40f, 0.25f);
            s.PutMesh(SceneryProps.Nest(), -10.5f, 9.5f, 1f);
            s.PutMesh(SceneryProps.Nest(), 40f, -22f, 1.2f);
            s.Scatter(Palms, 150, 10.5f, 420f, 6f, 13f, Land, 1.7f, null, 0.03f, 3.5f);
            s.Scatter(Pines, 110, 30f, 520f, 15f, 27f, Land, 1.3f, Leaves(new Color(0.16f, 0.40f, 0.26f), 0.7f), 0.03f, 5f);
            s.Scatter(new[] { "nature/tree_palmDetailedShort", "nature/tree_palmShort" }, 60, 10.5f, 140f, 2.2f, 4f, Land, 1.5f);      // cycads
            s.Scatter(new[] { "nature/plant_flatTall", "nature/plant_bushDetailed", "nature/plant_bushLarge", "nature/plant_flatShort" }, 240, 9.5f, 160f, 0.8f, 2.2f, Land, 1.8f);
            s.Scatter(new[] { "nature/plant_flatShort", "nature/grass_leafsLarge", "nature/grass_large" }, 150, 2.4f, 12f, 0.25f, 0.5f, Land);
            s.Scatter(Rocks, 90, 11f, 460f, 1.2f, 7f, Land, 1.4f, null, 0.1f);
            s.Scatter(new[] { "nature/log_large", "nature/log", "nature/stump_old", "nature/stump_oldTall" }, 24, 10.5f, 120f, 0.5f, 1.2f, Land);
            s.Scatter(new[] { "nature/mushroom_redGroup", "nature/mushroom_tanGroup", "nature/mushroom_redTall" }, 30, 3f, 40f, 0.3f, 0.7f, Land);
            // other dinosaurs far up the valley
            foreach (var (make, n) in new (Func<MeshBuilder>, int)[] { (CreatureMeshes.Stegosaurus, 3), (CreatureMeshes.Triceratops, 4) })
                for (int i = 0; i < n; i++)
                {
                    float a = s.R(0f, 6.28f), d = s.R(55f, 130f), x = Mathf.Cos(a) * d, z = Mathf.Sin(a) * d;
                    if (Land(x, z)) s.PutMesh(make(), x, z, s.R(0.85f, 1.15f));
                }
            return s.Save("dinosaurs");
        }

        // ================================================================== arctic
        static GameObject SceneryArctic()
        {
            var s = new Scenery(24);
            // Open sea ahead, the ice sheet and its mountains behind and to the sides.
            float Sea(float x, float z) => Smooth(0f, 7f, (z + 0.3f * x) - (25f + (N2(x, z, 44f, 5f) - 0.5f) * 22f));
            s.Height = (x, z) =>
            {
                float r = Len(x, z), sea = Sea(x, z);
                float land = (N2(x, z, 64f) - 0.45f) * 9f * Smooth(12f, 70f, r) + (N2(x, z, 18f, 1f) - 0.5f) * 1.3f * Smooth(8f, 24f, r);
                land += Smooth(140f, 520f, r) * Ridge(x, z, 170f, 6f) * 190f;
                return Mathf.Lerp(land, -3.5f, sea);
            };
            Color snow = new Color(0.94f, 0.97f, 1f), shade = new Color(0.80f, 0.88f, 0.97f), ice = new Color(0.60f, 0.80f, 0.94f), rock = new Color(0.36f, 0.40f, 0.48f);
            s.Terrain(660f, 36, 88, (p, n) =>
            {
                if (p.y < -0.3f) return Color.Lerp(ice, new Color(0.30f, 0.52f, 0.72f), Smooth(-0.3f, -2.5f, p.y));     // ice shelf edge going under
                Color c = Color.Lerp(snow, shade, N2(p.x, p.z, 14f, 2f));
                if (n.y < 0.84f) c = Color.Lerp(c, ice, Smooth(0.84f, 0.66f, n.y));
                if (n.y < 0.62f && p.y > 12f) c = Color.Lerp(c, rock, Smooth(0.62f, 0.44f, n.y));
                return c;
            });
            // the sea itself: one sheet under everything, seen wherever the ice dips below it
            var water = s.Height; s.Height = (x, z) => -0.7f;
            s.Terrain(760f, 10, 28, (p, n) => Color.Lerp(new Color(0.10f, 0.22f, 0.40f), new Color(0.14f, 0.30f, 0.50f), N2(p.x, p.z, 60f, 8f)), 1.4f);
            s.Height = water;
            bool Ice(float x, float z) => Sea(x, z) < 0.05f;
            bool Open(float x, float z) => Sea(x, z) > 0.95f;
            var rng = new System.Random(10);

            for (int i = 0, done = 0; i < 400 && done < 42; i++)
            {
                float a = s.R(0f, 6.28f), d = Mathf.Sqrt(s.R(45f * 45f, 620f * 620f)), x = Mathf.Cos(a) * d, z = Mathf.Sin(a) * d;
                if (!Open(x, z)) continue;
                s.PutMesh(SceneryProps.Iceberg(rng), x, z, s.R(0.8f, 2.6f) * (d > 250f ? 2.2f : 1f), float.NaN, 0f, null, -0.9f); done++;
            }
            for (int i = 0, done = 0; i < 600 && done < 90; i++)
            {
                float a = s.R(0f, 6.28f), d = s.R(24f, 190f), x = Mathf.Cos(a) * d, z = Mathf.Sin(a) * d;
                if (!Open(x, z)) continue;
                s.PutMesh(SceneryProps.IceFloe(rng), x, z, 1f, float.NaN, 0f, null, -0.66f); done++;
            }
            s.PutMesh(SceneryProps.Igloo(), -11.5f, 8.5f, 1f, Face(-11.5f, 8.5f));
            s.PutMesh(SceneryProps.Igloo(), -17f, 2.5f, 0.8f, Face(-17f, 2.5f) + 25f);
            // a research camp
            s.Put("survival/tent", 13f, 11.5f, 2.3f, Face(13f, 11.5f) + 180f, 0.02f, Hue(0.02f, 1.3f, 1.1f));
            s.Put("survival/tent-canvas", 17f, 8f, 2.4f, Face(17f, 8f) + 180f, 0.02f, Mix(new Color(0.92f, 0.44f, 0.20f), 0.6f));
            s.Put("survival/box-large", 14.6f, 8.6f, 0.6f); s.Put("survival/box-large-open", 15.3f, 9.4f, 0.6f); s.Put("survival/barrel", 12.4f, 8.2f, 0.95f);
            s.Put("survival/signpost", 10.6f, 10.2f, 1.6f); s.Put("holiday/sled-long", 11.2f, 13.6f, 0.5f, 40f);
            s.PutMesh(SceneryProps.Snowmobile(), 16.5f, 12.8f, 1f, 200f); s.PutMesh(SceneryProps.Snowmobile(), 18.4f, 11.6f, 1f, 230f);
            s.PutMesh(SceneryProps.Flagpole(new Color(0.86f, 0.22f, 0.22f)), 14.8f, 13.8f);
            s.Put("space/satelliteDish", 20f, 14f, 2.6f);
            s.Patch(-4.2f, 9.4f, 0.75f, 0.015f, new Color(0.10f, 0.20f, 0.36f), 9, 0.1f);                     // a fishing hole
            s.Put("survival/bucket", -3.3f, 10.2f, 0.34f); s.Put("survival/fish", -3.7f, 8.5f, 0.12f);
            // a ship held in the ice
            s.Put("pirate/ship-large", 46f, 74f, 26f, 205f, 0.03f, Mix(new Color(0.36f, 0.30f, 0.28f), 0.4f), -1.4f, false, new Vector3(0, 0, 7f));
            s.Patch(46f, 74f, 15f, -0.6f, snow, 12, 0.3f, 0.6f, 25f);
            s.ScatterMade(() => SceneryProps.IceSpike(rng), 60, 11f, 300f, 0.8f, 2.4f, Ice, 1.5f, 6f);
            s.Scatter(new[] { "holiday/snow-pile", "holiday/snow-bunker" }, 70, 9.5f, 140f, 0.3f, 0.9f, Ice, 1.6f);
            s.Scatter(new[] { "holiday/rocks-large", "holiday/rocks-medium", "holiday/rocks-small" }, 60, 11f, 400f, 0.7f, 3f, Ice, 1.4f, null, 0.1f);
            // a penguin colony along the shore, seals on the ice, a bear far out
            for (int i = 0, done = 0; i < 300 && done < 34; i++)
            {
                float x = s.R(-46f, 40f), z = s.R(14f, 30f);
                if (Sea(x, z) > 0.02f || Len(x, z) < 12f) continue;
                s.PutMesh(CreatureMeshes.Penguin(), x, z, s.R(0.85f, 1.1f)); done++;
            }
            for (int i = 0; i < 5; i++) s.PutMesh(CreatureMeshes.Seal(), s.R(-60f, -22f), s.R(-6f, 12f), 1f);
            s.PutMesh(CreatureMeshes.PolarBear(), -64f, -40f, 1.1f, 80f);
            return s.Save("arctic");
        }
    }
}
