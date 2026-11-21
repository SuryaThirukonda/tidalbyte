using UnityEngine;

namespace WishWorld.EditorTools
{
    public static partial class WishWorldBuilder
    {
        static void Pine(MeshBuilder b, Vector3 p, float h)
        {
            var trunk = new Color(0.42f, 0.33f, 0.28f);
            var green = new Color(0.30f, 0.50f, 0.47f);
            b.Cylinder(p + Vector3.up * h * 0.1f, new Vector3(h * 0.08f, h * 0.2f, h * 0.08f), trunk, false);
            for (int i = 0; i < 3; i++)
            {
                float y = h * (0.3f + i * 0.22f), w = h * (0.5f - i * 0.12f);
                b.Cone(p + Vector3.up * y, new Vector3(w, h * 0.36f, w), green, false);
                b.Cone(p + Vector3.up * (y + h * 0.1f), new Vector3(w * 0.62f, h * 0.2f, w * 0.62f), Snow, false);
            }
        }

        static readonly Color ShadowSnow = new Color(0.72f, 0.79f, 0.90f);

        /// <summary>Place a baked pack prop into the terrain mesh, facing the player, with a painted shadow under it.</summary>
        static bool Prop(MeshBuilder terrain, string pack, Vector3 pos, float scale = 1f, float shadow = 0f, float yawOffset = 0f)
        {
            var m = PackMeshes.Load(pack);
            if (m == null) return false;
            float yaw = Mathf.Atan2(-pos.x, -pos.z) * Mathf.Rad2Deg + yawOffset;
            terrain.Append(m, pos, yaw, scale);
            if (shadow > 0) terrain.Disc(pos + new Vector3(0.12f * shadow, 0.012f, -0.1f * shadow), new Vector2(shadow * 2f, shadow * 1.7f), ShadowSnow, false, default, 14);
            return true;
        }

        static void BuildHubScene()
        {
            var scene = NewScene();
            var rng = new System.Random(11);
            float R(float a, float b) => a + (float)rng.NextDouble() * (b - a);

            var sky = BuildSky("Hub", new SkySpec
            {
                top = new Color(0.50f, 0.63f, 0.79f), horizon = new Color(0.86f, 0.90f, 0.95f), bottom = Snow,
                clouds = 0.5f, cloudColor = White, glow = new Color(1f, 0.85f, 0.7f) * 0.22f, glowElevation = 0.45f
            });
            var hubPhoto = SkyPhoto("Hub");
            SetEnvironment(new Color(0.74f, 0.78f, 0.85f), SkyMaterial("M_Sky_Hub", hubPhoto != null ? hubPhoto : sky), hubPhoto != null ? 620f : 70f,
                SkyHorizon("Hub", new Color(0.90f, 0.93f, 0.97f)));
            if (hubPhoto != null) RenderSettings.fogStartDistance = 45f;
            var hubSun = AddSun(new Color(1f, 0.97f, 0.92f), 1.0f, new Vector3(48, -35, 0));
            var hubSunDir = SunDirection("Hub", 38f);
            if (hubSunDir.sqrMagnitude > 0.01f) hubSun.transform.rotation = Quaternion.LookRotation(hubSunDir);
            AddRig(false, false);

            // Snowy plain, a ring of low hills, a few pines.
            var terrain = new MeshBuilder().Disc(Vector3.zero, new Vector2(140, 140), Snow, false, default, 40);
            for (int i = 0; i < 16; i++)
            {
                float a = i / 16f * Mathf.PI * 2f + R(-0.1f, 0.1f), d = R(24f, 34f);
                terrain.Sphere(new Vector3(Mathf.Cos(a) * d, -1.2f, Mathf.Sin(a) * d), new Vector3(R(14, 22), R(7, 12), R(14, 22)), i % 2 == 0 ? Snow : SnowShade, false, default, 12);
            }
            for (int i = 0; i < 9; i++)
            {
                float a = R(0, Mathf.PI * 2f), d = R(6f, 13f);
                // keep the view ahead (the menu) clear of mounds
                terrain.Sphere(new Vector3(Mathf.Cos(a) * d, -0.25f, Mathf.Sin(a) * d), new Vector3(R(1.5f, 3f), R(0.7f, 1.1f), R(1.5f, 3f)), SnowShade, false);
            }
            if (hubPhoto != null)
            {
                // With a real sky the view runs to the horizon: carry the snow out to a ring of mountains and a wider forest.
                terrain.Disc(new Vector3(0, -0.4f, 0), new Vector2(1300, 1300), SnowShade, false, default, 40);
                var rock = new Color(0.44f, 0.44f, 0.48f);
                for (int i = 0; i < 26; i++)
                {
                    float a = i / 26f * Mathf.PI * 2f + R(-0.08f, 0.08f), d = R(430f, 640f), h = R(50f, 125f), w = h * R(2.2f, 3.2f);
                    var c = new Vector3(Mathf.Cos(a) * d, -6f, Mathf.Sin(a) * d);
                    terrain.Cone(c + Vector3.up * h * 0.5f, new Vector3(w, h, w), i % 2 == 0 ? Snow : SnowShade, false, new Vector3(0, R(0, 60), 0), 7);
                    terrain.Cone(c + new Vector3(Mathf.Cos(a) * -w * 0.16f, h * 0.24f, Mathf.Sin(a) * -w * 0.16f), new Vector3(w * 0.8f, h * 0.48f, w * 0.8f), rock, false, new Vector3(0, R(0, 60), 0), 6);
                }
                string[] far = { "TreeSnowA", "TreeSnowB", "TreeSnowC" };
                float[] farBaked = { 3.4f, 2.8f, 4.0f };
                for (int i = 0; i < 150; i++)
                {
                    float a = R(0f, Mathf.PI * 2f), d = Mathf.Sqrt(R(20f * 20f, 230f * 230f)), h = R(3.5f, 7f);
                    int k = i % 3;
                    Prop(terrain, far[k], new Vector3(Mathf.Cos(a) * d, d > 30f ? -0.3f : 0f, Mathf.Sin(a) * d), h / farBaked[k], 0f);
                }
                var hrng = new System.Random(4);
                for (int i = 0; i < 7; i++)        // a hamlet across the snow
                {
                    float x = -70f + R(-22f, 22f), z = 95f + R(-18f, 18f);
                    terrain.Append(SceneryProps.House(hrng, new Color(0.56f, 0.38f, 0.24f), new Color(0.36f, 0.26f, 0.22f), 1f, true), new Vector3(x, -0.3f, z), R(0, 360), 1.1f);
                }
                terrain.Append(SceneryProps.Church(true), new Vector3(-74f, -0.3f, 118f), 160f, 1.2f);
            }
            int treeIndex = 0;
            foreach (var (a, d, h) in new[] { (0.9f, 9f, 3.2f), (1.25f, 12f, 4f), (2.2f, 8f, 2.6f), (2.5f, 13f, 3.6f), (0.2f, 14f, 3.8f),
                                               (-0.5f, 10f, 3f), (-1.2f, 15f, 4.2f), (3.6f, 11f, 3.4f), (4.3f, 9f, 2.8f), (1.75f, 16f, 4.4f), (0.55f, 6.5f, 2.4f), (2.75f, 6.8f, 2.6f) })
            {
                var pos = new Vector3(Mathf.Cos(a) * d, 0, Mathf.Sin(a) * d);
                string[] kinds = { "TreeSnowA", "TreeSnowB", "TreeSnowC" };
                float[] baked = { 3.4f, 2.8f, 4.0f };
                int k = treeIndex++ % 3;
                if (!Prop(terrain, kinds[k], pos, h / baked[k] * 1.15f, h * 0.36f)) Pine(terrain, pos, h);
            }
            // A little winter camp around the menu (all from the Holiday Kit; skipped when packs are off).
            Prop(terrain, "Snowman", new Vector3(2.45f, 0, 2.9f), 1f, 0.5f);
            Prop(terrain, "Lantern", new Vector3(-1.75f, 0, 2.7f), 1.15f, 0.2f);
            Prop(terrain, "Lantern", new Vector3(1.75f, 0, 2.7f), 1.15f, 0.2f);
            Prop(terrain, "Sled", new Vector3(2.5f, 0, 1.3f), 1f, 0.55f, 70f);
            Prop(terrain, "PresentA", new Vector3(2.15f, 0, 1.75f), 1f, 0.28f, 20f);
            Prop(terrain, "PresentB", new Vector3(2.6f, 0, 2.05f), 1f, 0.28f, -30f);
            Prop(terrain, "PresentC", new Vector3(2.9f, 0, 1.6f), 1f, 0.3f, 45f);
            Prop(terrain, "Bench", new Vector3(-2.7f, 0, 0.9f), 1f, 0.7f);
            Prop(terrain, "Reindeer", new Vector3(-3.4f, 0, 3.6f), 1f, 0.6f, 30f);
            Prop(terrain, "TreeDecorated", new Vector3(3.3f, 0, 4.4f), 1.2f, 1.0f);
            Prop(terrain, "CandyCane", new Vector3(-2.3f, 0, 3.3f), 1f, 0.18f);
            Prop(terrain, "CandyCane", new Vector3(3.1f, 0, 3.2f), 1f, 0.18f, 180f);
            Prop(terrain, "RocksLarge", new Vector3(-5.5f, 0, 5.5f), 1.2f, 1.3f);
            Prop(terrain, "RocksLarge", new Vector3(6.5f, 0, 3.0f), 1.0f, 1.1f, 90f);
            Prop(terrain, "SnowPile", new Vector3(-3.6f, 0, 1.9f), 0.9f);
            Prop(terrain, "SnowPile", new Vector3(4.2f, 0, 2.6f), 1.1f, 0f, 60f);
            MeshObject("Terrain", SaveMesh(terrain, "HubTerrain"));

            // Rounded cloud shapes that drift around.
            var clouds = new GameObject("Clouds");
            for (int i = 0; i < 9; i++)
            {
                var b = new MeshBuilder();
                int puffs = rng.Next(3, 6);
                for (int k = 0; k < puffs; k++)
                    b.Sphere(new Vector3((k - puffs * 0.5f) * 2.6f, R(-0.4f, 0.6f), R(-0.8f, 0.8f)), new Vector3(R(3.5f, 5.5f), R(1.8f, 2.6f), R(2.6f, 3.6f)), White, false);
                var c = MeshObject("Cloud" + i, SaveMesh(b, "HubCloud" + i), clouds.transform);
                float a = i / 9f * Mathf.PI * 2f, d = R(28f, 46f);
                c.transform.position = new Vector3(Mathf.Cos(a) * d, R(11f, 19f), Mathf.Sin(a) * d);
                c.transform.rotation = Quaternion.LookRotation(new Vector3(Mathf.Cos(a), 0, Mathf.Sin(a)));
                c.AddComponent<Drift>().degreesPerSecond = R(0.6f, 1.4f);
            }

            var snow = (GameObject)UnityEditor.PrefabUtility.InstantiatePrefab(UnityEditor.AssetDatabase.LoadAssetAtPath<GameObject>(Gen + "/Prefabs/Snowfall.prefab"));
            snow.transform.position = new Vector3(0, 4.5f, 2f);

            var penguin = (GameObject)UnityEditor.PrefabUtility.InstantiatePrefab(UnityEditor.AssetDatabase.LoadAssetAtPath<GameObject>(Gen + "/Prefabs/PLACEHOLDER_PenguinGuide.prefab"));
            penguin.transform.position = new Vector3(-1.3f, 0, 2.15f);
            penguin.transform.rotation = Quaternion.LookRotation(new Vector3(1.3f, 0, -2.15f));

            new GameObject("Hub").AddComponent<HubController>();
            SaveScene(scene, AppState.SceneHub);
        }
    }
}
