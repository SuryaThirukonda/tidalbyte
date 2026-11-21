using System.Collections.Generic;
using TMPro;
using UnityEditor;
using UnityEngine;

namespace WishWorld.EditorTools
{
    public static partial class WishWorldBuilder
    {
        static readonly Color Ice = new Color(0.74f, 0.90f, 1.00f);
        static readonly Color CarBody = new Color(0.96f, 0.56f, 0.36f);
        static readonly Color Tyre = new Color(0.13f, 0.14f, 0.16f);

        static GameObject Prefab(string name) => AssetDatabase.LoadAssetAtPath<GameObject>(Gen + "/Prefabs/" + name + ".prefab");

        // ------------------------------------------------------------------ Frost Slice assets

        // Whole fruit and cut halves come from Kenney's Food Kit when packs are on; otherwise simple generated shapes.
        static readonly (string name, Color skin, Color flesh, float radius, int points, Vector3 shape)[] Fruits =
        {
            ("Apple", new Color(0.86f, 0.16f, 0.18f), new Color(0.98f, 0.95f, 0.80f), 0.058f, 10, new Vector3(1, 0.92f, 1)),
            ("Orange", new Color(0.98f, 0.58f, 0.12f), new Color(1.00f, 0.76f, 0.36f), 0.058f, 10, new Vector3(1, 0.95f, 1)),
            ("Watermelon", new Color(0.22f, 0.55f, 0.25f), new Color(0.95f, 0.30f, 0.35f), 0.105f, 10, new Vector3(1, 0.9f, 1.25f)),
            ("Lemon", new Color(0.98f, 0.88f, 0.25f), new Color(1.00f, 0.97f, 0.70f), 0.052f, 15, new Vector3(0.85f, 0.85f, 1.3f)),
            ("Pear", new Color(0.55f, 0.75f, 0.30f), new Color(0.97f, 0.96f, 0.78f), 0.062f, 15, new Vector3(0.8f, 1.2f, 0.8f)),
            ("Coconut", new Color(0.45f, 0.30f, 0.20f), new Color(0.99f, 0.98f, 0.94f), 0.066f, 20, new Vector3(1, 1, 1)),
        };

        static partial void BuildGameContentImpl()
        {
            var leaf = new Color(0.30f, 0.62f, 0.28f);
            var stem = new Color(0.40f, 0.28f, 0.20f);
            foreach (var stale in AssetDatabase.FindAssets("PLACEHOLDER_Fruit", new[] { Gen }))
                AssetDatabase.DeleteAsset(AssetDatabase.GUIDToAssetPath(stale));
            foreach (var f in Fruits)
            {
                float d = f.radius * 2f;
                var size = f.shape * d;
                var whole = PackMeshes.Load("Fruit_" + f.name) ?? new MeshBuilder()
                    .Sphere(Vector3.zero, size, f.skin, true, default, 8)
                    .Cylinder(new Vector3(0, size.y * 0.52f, 0), new Vector3(d * 0.08f, d * 0.2f, d * 0.08f), stem, false)
                    .TaperBox(new Vector3(d * 0.14f, size.y * 0.56f, 0), new Vector3(d * 0.3f, d * 0.05f, d * 0.16f), leaf, false, new Vector3(0, 0, 20), 0.5f, 0.5f);
                SavePrefab(MeshObject("Fruit_" + f.name, SaveMesh(whole, "Fruit_" + f.name)), "Fruit_" + f.name);
                // Pre-made half: dome up, flat cut face (the flesh) down.
                var half = PackMeshes.Load("FruitHalf_" + f.name)
                           ?? new MeshBuilder().Hemisphere(Vector3.zero, new Vector3(size.x, size.y, size.z), f.skin, f.flesh, true, default, 8);
                SavePrefab(MeshObject("FruitHalf_" + f.name, SaveMesh(half, "FruitHalf_" + f.name)), "FruitHalf_" + f.name);
            }

            // Hazard: an ice block. A different shape from the fruit, so it reads even in grey passthrough.
            var deep = new Color(0.50f, 0.74f, 0.94f);
            var ice = new MeshBuilder()
                .TaperBox(Vector3.zero, new Vector3(0.15f, 0.13f, 0.14f), Ice, false, new Vector3(10, 22, 6), 0.72f, 0.8f)
                .TaperBox(new Vector3(0, -0.055f, 0), new Vector3(0.16f, 0.05f, 0.15f), deep, false, new Vector3(190, 22, 6), 0.75f, 0.8f)
                .TaperBox(new Vector3(0.03f, 0.075f, 0.01f), new Vector3(0.07f, 0.05f, 0.07f), White, false, new Vector3(4, 40, 10), 0.4f, 0.5f)
                .Cube(new Vector3(0, 0.005f, 0.066f), new Vector3(0.09f, 0.014f, 0.01f), Slate, false, new Vector3(10, 22, 40))
                .Cube(new Vector3(0, 0.005f, 0.066f), new Vector3(0.09f, 0.014f, 0.01f), Slate, false, new Vector3(10, 22, -40));
            SavePrefab(MeshObject("PLACEHOLDER_IceBlock", SaveMesh(ice, "PLACEHOLDER_IceBlock")), "PLACEHOLDER_IceBlock");

            // Blade: runs along the controller's forward axis. "Tip" marks the end used for the speed test.
            var glow = new Material(vertexLit) { name = "M_VertexLit_Glow" };
            glow.SetFloat("_Glow", 0.55f);
            glow.SetColor("_GlowColor", Ice);
            glow = Save(glow, Gen + "/Materials/M_VertexLit_Glow.mat");
            var bladeMesh = SaveMesh(new MeshBuilder()
                .Cylinder(new Vector3(0, 0, 0.0f), new Vector3(0.032f, 0.13f, 0.032f), Slate, false, new Vector3(90, 0, 0))
                .Cube(new Vector3(0, 0, 0.075f), new Vector3(0.1f, 0.022f, 0.022f), Peach, false)
                .Cube(new Vector3(0, 0, 0.34f), new Vector3(0.012f, 0.05f, 0.5f), Ice, false)
                .Cone(new Vector3(0, 0, 0.62f), new Vector3(0.012f, 0.06f, 0.05f), Ice, false, new Vector3(90, 0, 0)), "PLACEHOLDER_Blade");
            var blade = MeshObject("PLACEHOLDER_Blade", bladeMesh);
            blade.GetComponent<Renderer>().sharedMaterial = glow;
            var tip = new GameObject("Tip");
            tip.transform.SetParent(blade.transform, false);
            tip.transform.localPosition = new Vector3(0, 0, 0.64f);
            var trail = tip.AddComponent<TrailRenderer>();
            trail.time = 0.16f;
            trail.minVertexDistance = 0.01f;
            trail.widthCurve = new AnimationCurve(new Keyframe(0, 0.04f), new Keyframe(1, 0f));
            trail.sharedMaterial = AssetDatabase.LoadAssetAtPath<Material>(Gen + "/Materials/M_Line.mat");
            var grad = new Gradient();
            grad.SetKeys(new[] { new GradientColorKey(Ice, 0), new GradientColorKey(Color.white, 1) },
                         new[] { new GradientAlphaKey(0.8f, 0), new GradientAlphaKey(0f, 1) });
            trail.colorGradient = grad;
            trail.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            SavePrefab(blade, "PLACEHOLDER_Blade");

            // Juice burst: emitted by code, one puff per cut.
            var jgo = new GameObject("JuiceBurst");
            var ps = jgo.AddComponent<ParticleSystem>();
            var main = ps.main;
            main.playOnAwake = false;
            main.loop = false;
            main.startLifetime = new ParticleSystem.MinMaxCurve(0.4f, 0.7f);
            main.startSpeed = new ParticleSystem.MinMaxCurve(0.8f, 2.2f);
            main.startSize = new ParticleSystem.MinMaxCurve(0.018f, 0.04f);
            main.gravityModifier = 1.2f;
            main.maxParticles = 140;
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            var em = ps.emission; em.rateOverTime = 0f;
            var shape = ps.shape; shape.shapeType = ParticleSystemShapeType.Sphere; shape.radius = 0.03f;
            var pr = jgo.GetComponent<ParticleSystemRenderer>();
            pr.sharedMaterial = AssetDatabase.LoadAssetAtPath<Material>(Gen + "/Materials/M_Particle.mat");
            pr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            SavePrefab(jgo, "JuiceBurst");

            BuildCarAssets();
            AssetDatabase.SaveAssets();
        }

        static partial void BuildFrostSliceSceneImpl()
        {
            var scene = NewScene();
            SetEnvironment(new Color(0.72f, 0.72f, 0.74f), AssetDatabase.LoadAssetAtPath<Material>(Gen + "/Materials/M_Sky_Hub.mat"), 0, Color.white);
            AddSun(Color.white, 1f, new Vector3(50, -30, 0));
            AddRig(false, true);

            // A snow mound where the fruit pops out, and a mark showing where to stand.
            var props = new MeshBuilder()
                .Sphere(new Vector3(0, 0.02f, 1.78f), new Vector3(1.5f, 0.5f, 0.9f), Snow, false, default, 12)
                .Sphere(new Vector3(-0.5f, 0.02f, 1.9f), new Vector3(0.7f, 0.36f, 0.6f), SnowShade, false)
                .Sphere(new Vector3(0.55f, 0.02f, 1.86f), new Vector3(0.6f, 0.3f, 0.55f), SnowShade, false)
                .Cylinder(new Vector3(0, 0.004f, 0), new Vector3(0.9f, 0.008f, 0.9f), Peach, false, default, 1f, 24)
                .Cylinder(new Vector3(0, 0.006f, 0), new Vector3(0.78f, 0.008f, 0.78f), Snow, false, default, 1f, 24);
            MeshObject("Props", SaveMesh(props, "FrostSliceProps"));

            var game = new GameObject("FrostSlice").AddComponent<FrostSliceGame>();
            var kinds = new List<FrostSliceGame.FruitKind>();
            foreach (var f in Fruits)
                kinds.Add(new FrostSliceGame.FruitKind
                {
                    name = f.name, whole = Prefab("Fruit_" + f.name), half = Prefab("FruitHalf_" + f.name),
                    juice = Color.Lerp(f.flesh, f.skin, 0.4f), radius = f.radius * Mathf.Max(f.shape.x, f.shape.z), points = f.points
                });
            game.fruits = kinds.ToArray();
            game.hazardPrefab = Prefab("PLACEHOLDER_IceBlock");
            game.bladePrefab = Prefab("PLACEHOLDER_Blade");
            game.juicePrefab = Prefab("JuiceBurst").GetComponent<ParticleSystem>();
            SaveScene(scene, AppState.SceneFrostSlice);
        }

        // ------------------------------------------------------------------ Snow Circuit assets

        static void BuildCarAssets()
        {
            // A generic open-wheel car. No real series, team colours or logos.
            var body = new MeshBuilder()
                .Cube(new Vector3(0, 0.30f, 0.3f), new Vector3(0.98f, 0.12f, 2.3f), CarBody, false)                       // floor
                .Cube(new Vector3(-0.46f, 0.56f, 0.25f), new Vector3(0.08f, 0.42f, 1.7f), CarBody, false)                // side walls
                .Cube(new Vector3(0.46f, 0.56f, 0.25f), new Vector3(0.08f, 0.42f, 1.7f), CarBody, false)
                .Cylinder(new Vector3(0, 0.42f, 1.95f), new Vector3(0.72f, 1.7f, 0.32f), CarBody, false, new Vector3(90, 0, 0), 0.35f, 10)  // nose
                .Cube(new Vector3(0, 0.50f, 1.7f), new Vector3(0.16f, 0.03f, 1.5f), White, false)                         // stripe
                .Cube(new Vector3(0, 0.20f, 2.78f), new Vector3(1.75f, 0.05f, 0.36f), Slate, false)                       // front wing
                .Cube(new Vector3(0, 0.74f, -0.85f), new Vector3(0.72f, 0.5f, 1.2f), CarBody, false)                      // engine cover
                .Cube(new Vector3(0, 1.05f, -1.45f), new Vector3(1.3f, 0.06f, 0.3f), Slate, false)                        // rear wing
                .Cylinder(new Vector3(-0.92f, 0.33f, 2.05f), new Vector3(0.66f, 0.3f, 0.66f), Tyre, false, new Vector3(0, 0, 90), 1f, 12)
                .Cylinder(new Vector3(0.92f, 0.33f, 2.05f), new Vector3(0.66f, 0.3f, 0.66f), Tyre, false, new Vector3(0, 0, 90), 1f, 12)
                .Cylinder(new Vector3(-0.95f, 0.36f, -1.0f), new Vector3(0.72f, 0.36f, 0.72f), Tyre, false, new Vector3(0, 0, 90), 1f, 12)
                .Cylinder(new Vector3(0.95f, 0.36f, -1.0f), new Vector3(0.72f, 0.36f, 0.72f), Tyre, false, new Vector3(0, 0, 90), 1f, 12)
                .Cube(new Vector3(0, 0.78f, 0.80f), new Vector3(0.84f, 0.2f, 0.12f), Slate, false)                          // dashboard
                .Cube(new Vector3(0, 0.885f, 0.80f), new Vector3(0.56f, 0.13f, 0.06f), Slate, false, new Vector3(15, 0, 0))   // read-out hood, just above the wheel
                // Frame that stays in view the whole time: a fixed reference against motion sickness.
                .Cube(new Vector3(-0.41f, 1.13f, 0.74f), new Vector3(0.045f, 0.74f, 0.045f), Slate, false, new Vector3(-14, 0, 5))
                .Cube(new Vector3(0.41f, 1.13f, 0.74f), new Vector3(0.045f, 0.74f, 0.045f), Slate, false, new Vector3(-14, 0, -5))
                .Cube(new Vector3(0, 1.49f, 0.65f), new Vector3(0.78f, 0.045f, 0.045f), Slate, false);
            SaveMesh(body, "PLACEHOLDER_CarCockpit");

            var wheel = new MeshBuilder()
                .Cylinder(Vector3.zero, new Vector3(0.34f, 0.03f, 0.34f), Slate, false, new Vector3(90, 0, 0), 1f, 16)
                .Cylinder(new Vector3(0, 0, -0.012f), new Vector3(0.24f, 0.03f, 0.24f), new Color(0.32f, 0.37f, 0.45f), false, new Vector3(90, 0, 0), 1f, 16)
                .Cube(new Vector3(0, 0.145f, -0.02f), new Vector3(0.04f, 0.04f, 0.02f), Peach, false);
            SaveMesh(wheel, "PLACEHOLDER_SteeringWheel");

            var ghost = new MeshBuilder()
                .Cube(new Vector3(0, 0.36f, 0.2f), new Vector3(0.95f, 0.3f, 2.2f), Ice, false)
                .Cylinder(new Vector3(0, 0.42f, 1.95f), new Vector3(0.7f, 1.6f, 0.3f), Ice, false, new Vector3(90, 0, 0), 0.35f, 10)
                .Cube(new Vector3(0, 1.0f, -1.4f), new Vector3(1.3f, 0.06f, 0.3f), White, false)
                .Cylinder(new Vector3(-0.92f, 0.33f, 2.0f), new Vector3(0.66f, 0.3f, 0.66f), White, false, new Vector3(0, 0, 90), 1f, 10)
                .Cylinder(new Vector3(0.92f, 0.33f, 2.0f), new Vector3(0.66f, 0.3f, 0.66f), White, false, new Vector3(0, 0, 90), 1f, 10)
                .Cylinder(new Vector3(-0.95f, 0.36f, -1.0f), new Vector3(0.72f, 0.36f, 0.72f), White, false, new Vector3(0, 0, 90), 1f, 10)
                .Cylinder(new Vector3(0.95f, 0.36f, -1.0f), new Vector3(0.72f, 0.36f, 0.72f), White, false, new Vector3(0, 0, 90), 1f, 10);
            SavePrefab(MeshObject("PLACEHOLDER_GhostCar", SaveMesh(ghost, "PLACEHOLDER_GhostCar")), "PLACEHOLDER_GhostCar");
        }

        static Vector3 CatmullRom(Vector3 a, Vector3 b, Vector3 c, Vector3 d, float t)
        {
            float t2 = t * t, t3 = t2 * t;
            return 0.5f * ((2f * b) + (-a + c) * t + (2f * a - 5f * b + 4f * c - d) * t2 + (-a + 3f * b - 3f * c + d) * t3);
        }

        static TrackData BuildTrack(out Mesh mesh)
        {
            // One closed loop: start straight, a long right-hander, a gentle chicane, then back.
            Vector2[] ctrl =
            {
                new Vector2(0, 0), new Vector2(0, 26), new Vector2(8, 43), new Vector2(26, 49), new Vector2(43, 41),
                new Vector2(47, 23), new Vector2(37, 10), new Vector2(41, -8), new Vector2(28, -22), new Vector2(10, -21), new Vector2(1, -12),
            };
            var dense = new List<Vector3>();
            int n = ctrl.Length;
            for (int i = 0; i < n; i++)
                for (int k = 0; k < 40; k++)
                {
                    Vector3 P(int j) { var c = ctrl[((j % n) + n) % n]; return new Vector3(c.x, 0, c.y); }
                    dense.Add(CatmullRom(P(i - 1), P(i), P(i + 1), P(i + 2), k / 40f));
                }
            float total = 0;
            for (int i = 0; i < dense.Count; i++) total += Vector3.Distance(dense[i], dense[(i + 1) % dense.Count]);

            // Resample at even spacing so progress and checkpoints are uniform.
            const int Samples = 320;
            var pts = new Vector3[Samples];
            float step = total / Samples, acc = 0; int di = 0; float segStart = 0;
            for (int s = 0; s < Samples; s++)
            {
                float target = s * step;
                while (true)
                {
                    float seg = Vector3.Distance(dense[di % dense.Count], dense[(di + 1) % dense.Count]);
                    if (segStart + seg >= target || di > dense.Count * 2) { pts[s] = Vector3.Lerp(dense[di % dense.Count], dense[(di + 1) % dense.Count], seg > 0 ? (target - segStart) / seg : 0); break; }
                    segStart += seg; di++;
                }
            }
            acc = total;

            var data = ScriptableObject.CreateInstance<TrackData>();
            data.points = pts;
            data.width = 7f;
            data.length = acc;
            data = Save(data, Gen + "/Track.asset");

            // Mesh: road, kerb stripes, snow banks, start line, marker poles.
            float half = data.width * 0.5f;
            var road = new Color(0.78f, 0.84f, 0.92f);
            var mb = new MeshBuilder();
            var V = new List<Vector3>(); var N = new List<Vector3>(); var C = new List<Color>(); var T = new List<int>();
            void Strip(System.Func<int, Vector3> left, System.Func<int, Vector3> right, System.Func<int, Color> color)
            {
                for (int i = 0; i < Samples; i++)
                {
                    int j = (i + 1) % Samples;
                    Vector3 a = left(i), b = right(i), c = left(j), d = right(j);
                    var nrm = Vector3.Cross(c - a, b - a).normalized;
                    int s = V.Count;
                    V.Add(a); V.Add(b); V.Add(c); V.Add(d);
                    for (int k = 0; k < 4; k++) { N.Add(nrm); C.Add(color(i)); }
                    T.Add(s); T.Add(s + 2); T.Add(s + 1);
                    T.Add(s + 1); T.Add(s + 2); T.Add(s + 3);
                }
            }
            Vector3 Dir(int i) => (pts[(i + 1) % Samples] - pts[(i - 1 + Samples) % Samples]).normalized;
            Vector3 Side(int i) => Vector3.Cross(Vector3.up, Dir(i));
            Vector3 At(int i, float offset, float y) => pts[i] + Side(i) * offset + Vector3.up * y;
            Color Kerb(int i) => (i / 2) % 2 == 0 ? Peach : White;

            Strip(i => At(i, -half + 0.4f, 0.01f), i => At(i, half - 0.4f, 0.01f), i => road);
            Strip(i => At(i, -half, 0.012f), i => At(i, -half + 0.4f, 0.012f), Kerb);
            Strip(i => At(i, half - 0.4f, 0.012f), i => At(i, half, 0.012f), Kerb);
            // banks: rise to a crest, then fall away
            Strip(i => At(i, half, 0.01f), i => At(i, half + 0.7f, 0.6f), i => Snow);
            Strip(i => At(i, half + 0.7f, 0.6f), i => At(i, half + 2.3f, -0.3f), i => SnowShade);     // the skirts go under the ground around
            Strip(i => At(i, -half - 0.7f, 0.6f), i => At(i, -half, 0.01f), i => Snow);
            Strip(i => At(i, -half - 2.3f, -0.3f), i => At(i, -half - 0.7f, 0.6f), i => SnowShade);
            mb.Raw(V, N, C, T);

            // start line: slate and white checks across the road at sample 0
            for (int k = 0; k < 10; k++)
            {
                float x = -half + 0.4f + (k + 0.5f) * (data.width - 0.8f) / 10f;
                for (int row = 0; row < 2; row++)
                    mb.Cube(pts[0] + Side(0) * x + Dir(0) * (row * 0.45f - 0.22f) + Vector3.up * 0.016f, new Vector3((data.width - 0.8f) / 10f, 0.006f, 0.45f),
                        (k + row) % 2 == 0 ? Slate : White, false, new Vector3(0, Quaternion.LookRotation(Dir(0)).eulerAngles.y, 0));
            }
            // marker poles with flags: something passing by, to give a sense of speed
            for (int i = 0; i < Samples; i += 16)
            {
                float side = (i / 16) % 2 == 0 ? 1f : -1f;
                var basePos = At(i, side * (half + 2.2f), 0);
                mb.Cylinder(basePos + Vector3.up * 0.9f, new Vector3(0.07f, 1.8f, 0.07f), Slate, false);
                mb.Cube(basePos + Vector3.up * 1.6f + Dir(i) * 0.2f, new Vector3(0.04f, 0.26f, 0.4f), (i / 16) % 4 < 2 ? Peach : Sky, false,
                    new Vector3(0, Quaternion.LookRotation(Dir(i)).eulerAngles.y, 0));
            }
            // a start gantry
            mb.Cylinder(At(0, half + 1.0f, 2.0f), new Vector3(0.14f, 4f, 0.14f), Slate, false);
            mb.Cylinder(At(0, -half - 1.0f, 2.0f), new Vector3(0.14f, 4f, 0.14f), Slate, false);
            mb.Cube(pts[0] + Vector3.up * 4f, new Vector3(data.width + 2.2f, 0.4f, 0.14f), Peach, false, new Vector3(0, Quaternion.LookRotation(Dir(0)).eulerAngles.y, 0));

            mesh = SaveMesh(mb, "SnowCircuitTrack");
            return data;
        }

        /// <summary>Five race cars for the computer drivers: two kit models in different liveries, or tinted copies of the ghost car without the kits.</summary>
        static GameObject[] BuildRivalCars()
        {
            var cars = new List<GameObject>();
            float[] hues = { 0f, 0.58f, 0.30f, 0.12f, 0.80f };
            for (int i = 0; i < hues.Length; i++)
            {
                var model = Scenery.Model(i % 2 == 0 ? "car/race" : "car/race-future");
                var mb = new MeshBuilder();
                if (model != null)
                {
                    float scale = 4.0f / Mathf.Max(0.01f, model.Bounds.size.z);
                    mb.Append(model, Vector3.zero, Quaternion.identity, Vector3.one * scale, Hue(hues[i]));
                }
                else
                {
                    var tint = Color.HSVToRGB(hues[i], 0.7f, 0.9f);
                    mb.Cube(new Vector3(0, 0.36f, 0.2f), new Vector3(0.95f, 0.3f, 2.2f), tint, false)
                      .Cylinder(new Vector3(0, 0.42f, 1.95f), new Vector3(0.7f, 1.6f, 0.3f), tint, false, new Vector3(90, 0, 0), 0.35f, 10)
                      .Cube(new Vector3(0, 1.0f, -1.4f), new Vector3(1.3f, 0.06f, 0.3f), Slate, false);
                    foreach (var (x, z) in new[] { (-0.92f, 2f), (0.92f, 2f), (-0.95f, -1f), (0.95f, -1f) })
                        mb.Cylinder(new Vector3(x, 0.35f, z), new Vector3(0.7f, 0.32f, 0.7f), new Color(0.12f, 0.12f, 0.14f), false, new Vector3(0, 0, 90), 1f, 10);
                }
                cars.Add(SavePrefab(MeshObject("RivalCar_" + i, SaveMesh(mb, "RivalCar_" + i)), "RivalCar_" + i));
            }
            return cars.ToArray();
        }

        static partial void BuildSnowCircuitSceneImpl()
        {
            var scene = NewScene();
            // A real sky and a whole valley around the circuit. (The plan had this game in passthrough; WISHWORLD_RACE_VIEW=room brings that back.)
            var skyPhoto = SkyPhoto("Race");
            var skyMat = skyPhoto != null ? SkyMaterial("M_Sky_Race", skyPhoto) : AssetDatabase.LoadAssetAtPath<Material>(Gen + "/Materials/M_Sky_Hub.mat");
            SetEnvironment(new Color(0.74f, 0.78f, 0.86f), skyMat, 740f, SkyHorizon("Race", new Color(0.86f, 0.90f, 0.96f)));
            RenderSettings.fogStartDistance = 90f;
            var sun = AddSun(new Color(1f, 0.98f, 0.94f), 1.05f, new Vector3(52, -40, 0));
            var sunDir = SunDirection("Race");
            if (sunDir.sqrMagnitude > 0.01f) sun.transform.rotation = Quaternion.LookRotation(sunDir);

            var track = BuildTrack(out var trackMesh);
            MeshObject("Track", trackMesh);
            GameObject surroundings = null;
            var sceneryPrefab = SceneryRace(track);
            if (sceneryPrefab != null) { surroundings = (GameObject)PrefabUtility.InstantiatePrefab(sceneryPrefab); surroundings.name = "Surroundings"; }

            var car = new GameObject("Car");
            var dir = track.Direction(0);
            car.transform.position = track.points[0] - dir * 4f;
            car.transform.rotation = Quaternion.LookRotation(dir, Vector3.up);
            MeshObject("Cockpit", AssetDatabase.LoadAssetAtPath<Mesh>(Gen + "/Meshes/PLACEHOLDER_CarCockpit.asset"), car.transform);

            var mount = new GameObject("WheelMount");
            mount.transform.SetParent(car.transform, false);
            mount.transform.localPosition = new Vector3(0, 0.70f, 0.44f);
            mount.transform.localRotation = Quaternion.Euler(22f, 0, 0);
            var wheel = MeshObject("Wheel", AssetDatabase.LoadAssetAtPath<Mesh>(Gen + "/Meshes/PLACEHOLDER_SteeringWheel.asset"), mount.transform);

            // Dashboard read-outs, laid on the tilted dash face.
            var dash = new GameObject("Dash");
            dash.transform.SetParent(car.transform, false);
            dash.transform.localPosition = new Vector3(0, 0.893f, 0.766f);
            dash.transform.localRotation = Quaternion.Euler(15f, 0, 0);
            TextMeshPro Readout(string text, float x, float h)
            {
                // A plain holder carries the offset: a text object placed directly in edit mode loses its position on save.
                var holder = new GameObject("Readout");
                holder.transform.SetParent(dash.transform, false);
                holder.transform.localPosition = new Vector3(x, 0, 0);
                var t = WWUI.Label(holder.transform, text, h, new Vector2(0.17f, 0.09f), White, TMPro.TextAlignmentOptions.Center, true, WWFont.Plain);
                t.gameObject.layer = 0;
                return t;
            }
            var lap = Readout("Lap -", -0.18f, 0.028f);
            var speed = Readout("0 km/h", 0, 0.034f);
            var time = Readout("0:00.0", 0.18f, 0.028f);

            var rig = AddRig(true, false);
            rig.transform.SetParent(car.transform, false);
            rig.transform.localPosition = new Vector3(0, -0.1f, 0);

            var game = new GameObject("SnowCircuit").AddComponent<SnowCircuitGame>();
            game.track = track;
            game.car = car.transform;
            game.wheel = wheel.transform;
            game.dashSpeed = speed; game.dashLap = lap; game.dashTime = time;
            game.ghostPrefab = Prefab("PLACEHOLDER_GhostCar");
            game.surroundings = surroundings;
            game.rivalPrefabs = BuildRivalCars();
            SaveScene(scene, AppState.SceneSnowCircuit);
        }
    }
}
