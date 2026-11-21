using System.Collections.Generic;
using System.IO;
using TMPro;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering.Universal;
using UnityEngine.SceneManagement;

namespace WishWorld.EditorTools
{
    /// <summary>
    /// Generates everything that is not hand-made: placeholder meshes, materials, sky images,
    /// prefabs, world definitions and the five scenes. Safe to run again; assets keep their identity.
    /// Menu: WishWorld > Rebuild All.
    /// </summary>
    public static partial class WishWorldBuilder
    {
        public const string Root = "Assets/WishWorld";
        public const string Gen = Root + "/Generated";
        public const string RigPath = Gen + "/Prefabs/XRRig.prefab";
        const string FontPath = "Assets/TextMesh Pro/Resources/Fonts & Materials/LiberationSans SDF.asset";

        // Palette from the event site: grey-blue sky, off-white ground, slate outlines, peach accent.
        public static readonly Color Sky = new Color(0.72f, 0.80f, 0.88f);
        public static readonly Color Snow = new Color(0.95f, 0.97f, 0.99f);
        public static readonly Color SnowShade = new Color(0.84f, 0.89f, 0.95f);
        public static readonly Color Slate = new Color(0.20f, 0.25f, 0.32f);
        public static readonly Color Peach = new Color(1.00f, 0.72f, 0.55f);
        public static readonly Color White = new Color(0.98f, 0.98f, 0.98f);
        public static readonly Color Black = new Color(0.08f, 0.08f, 0.10f);

        static Material vertexLit;
        static WWTheme theme;

        [MenuItem("WishWorld/Rebuild All")]
        public static void RebuildAll()
        {
            BuildShared();
            BuildWorldContent();
            BuildGameContent();
            BuildScenes();
            Debug.Log("[WishWorld] Rebuild finished.");
        }

        // ------------------------------------------------------------------ helpers

        public static void EnsureFolder(string path)
        {
            if (AssetDatabase.IsValidFolder(path)) return;
            var parent = Path.GetDirectoryName(path).Replace('\\', '/');
            EnsureFolder(parent);
            AssetDatabase.CreateFolder(parent, Path.GetFileName(path));
        }

        /// <summary>Create or overwrite in place, so references to the asset survive a rebuild.</summary>
        public static T Save<T>(T obj, string path) where T : Object
        {
            EnsureFolder(Path.GetDirectoryName(path).Replace('\\', '/'));
            obj.name = Path.GetFileNameWithoutExtension(path);
            var existing = AssetDatabase.LoadAssetAtPath<T>(path);
            if (existing != null)
            {
                EditorUtility.CopySerialized(obj, existing);
                EditorUtility.SetDirty(existing);
                return existing;
            }
            AssetDatabase.CreateAsset(obj, path);
            return obj;
        }

        public static Mesh SaveMesh(MeshBuilder b, string name) => Save(b.Build(name), Gen + "/Meshes/" + name + ".asset");

        public static GameObject MeshObject(string name, Mesh mesh, Transform parent = null)
        {
            var go = new GameObject(name);
            if (parent != null) go.transform.SetParent(parent, false);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var r = go.AddComponent<MeshRenderer>();
            r.sharedMaterial = vertexLit;
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            r.receiveShadows = false;
            return go;
        }

        public static GameObject SavePrefab(GameObject go, string name)
        {
            EnsureFolder(Gen + "/Prefabs");
            var prefab = PrefabUtility.SaveAsPrefabAsset(go, Gen + "/Prefabs/" + name + ".prefab");
            Object.DestroyImmediate(go);
            return prefab;
        }

        static Texture2D SaveTexture(Texture2D tex, string name, bool sky)
        {
            EnsureFolder(Gen + "/Textures");
            string path = Gen + "/Textures/" + name + ".png";
            File.WriteAllBytes(path, tex.EncodeToPNG());
            Object.DestroyImmediate(tex);
            AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceUpdate);
            var imp = (TextureImporter)AssetImporter.GetAtPath(path);
            imp.mipmapEnabled = !sky;
            imp.wrapModeU = sky ? TextureWrapMode.Repeat : TextureWrapMode.Clamp;
            imp.wrapModeV = TextureWrapMode.Clamp;
            imp.alphaIsTransparency = !sky;
            imp.maxTextureSize = sky ? 2048 : 128;
            imp.SaveAndReimport();
            return AssetDatabase.LoadAssetAtPath<Texture2D>(path);
        }

        static Material MakeMaterial(string name, string shader)
        {
            var sh = Shader.Find(shader);
            if (sh == null) Debug.LogError("[WishWorld] Shader not found: " + shader);
            var m = new Material(sh) { name = name, enableInstancing = true };
            return Save(m, Gen + "/Materials/" + name + ".mat");
        }

        // ------------------------------------------------------------------ shared assets

        public static void BuildShared()
        {
            EnsureFolder(Gen);
            EnsureFolder(Root + "/Resources");

            // textures
            var dot = new Texture2D(64, 64, TextureFormat.RGBA32, false);
            for (int y = 0; y < 64; y++)
                for (int x = 0; x < 64; x++)
                {
                    float d = Vector2.Distance(new Vector2(x, y), new Vector2(31.5f, 31.5f)) / 31.5f;
                    dot.SetPixel(x, y, new Color(1, 1, 1, Mathf.Clamp01(1f - d * d)));
                }
            var dotTex = SaveTexture(dot, "T_Dot", false);

            // materials
            vertexLit = MakeMaterial("M_VertexLit", "WishWorld/VertexColorLit");
            var uiPanel = MakeMaterial("M_UIPanel", "WishWorld/VertexColorUnlit");
            var overlay = MakeMaterial("M_Overlay", "WishWorld/Overlay");
            var particle = MakeMaterial("M_Particle", "WishWorld/Particle");
            particle.SetTexture("_BaseMap", dotTex);
            var line = MakeMaterial("M_Line", "WishWorld/Particle");
            var shadow = MakeMaterial("M_BlobShadow", "WishWorld/Particle");
            shadow.SetTexture("_BaseMap", dotTex);
            shadow.SetColor("_BaseColor", new Color(0.04f, 0.06f, 0.12f, 0.46f));
            EditorUtility.SetDirty(shadow);
            var sky = MakeMaterial("M_SkyPanorama", "Skybox/Panoramic");
            sky.SetFloat("_Mapping", 1f);
            sky.EnableKeyword("_MAPPING_LATITUDE_LONGITUDE_LAYOUT");
            sky.SetFloat("_ImageType", 0f);
            sky.SetFloat("_Exposure", 1f);
            sky.SetColor("_Tint", new Color(0.5f, 0.5f, 0.5f, 0.5f));
            EditorUtility.SetDirty(sky);

            // theme
            var t = ScriptableObject.CreateInstance<WWTheme>();
            t.vertexLit = vertexLit; t.uiPanel = uiPanel; t.overlay = overlay; t.particle = particle; t.line = line; t.shadow = shadow;
            t.font = AssetDatabase.LoadAssetAtPath<TMP_FontAsset>(FontPath);
            if (t.font == null) Debug.LogWarning("[WishWorld] TextMesh Pro essentials are not imported; text will use TMP's default font setting.");
            var fonts = BuildFonts(false);
            t.fontTitle = fonts[0]; t.fontHeading = fonts[1]; t.fontBody = fonts[2];
            t.sky = Sky; t.snow = Snow; t.slate = Slate; t.peach = Peach;
            theme = Save(t, Root + "/Resources/WWTheme.asset");

            BuildRig();
            BuildSnow(particle);
            BuildPenguin();
            AssetDatabase.SaveAssets();
        }

        public static void BuildShared_LoadOnly() => LoadShared();

        static void LoadShared()
        {
            if (vertexLit == null) vertexLit = AssetDatabase.LoadAssetAtPath<Material>(Gen + "/Materials/M_VertexLit.mat");
            if (theme == null) theme = AssetDatabase.LoadAssetAtPath<WWTheme>(Root + "/Resources/WWTheme.asset");
        }

        static void BuildRig()
        {
            var controller = SaveMesh(new MeshBuilder()
                .Cylinder(new Vector3(0, -0.015f, -0.035f), new Vector3(0.034f, 0.11f, 0.034f), Slate, false, new Vector3(70, 0, 0))
                .Sphere(new Vector3(0, 0.01f, 0.03f), new Vector3(0.06f, 0.05f, 0.06f), Peach, false), "Controller");

            var rig = new GameObject("XRRig");
            var xr = rig.AddComponent<XRRig>();
            rig.AddComponent<PassthroughToggle>();

            var head = new GameObject("Head");
            head.transform.SetParent(rig.transform, false);
            head.transform.localPosition = new Vector3(0, 1.6f, 0);
            head.tag = "MainCamera";
            var cam = head.AddComponent<Camera>();
            cam.nearClipPlane = 0.05f;
            cam.farClipPlane = FarClip;
            cam.allowHDR = false;
            cam.clearFlags = CameraClearFlags.Skybox;
            cam.backgroundColor = Snow;
            head.AddComponent<AudioListener>();
            var data = head.AddComponent<UniversalAdditionalCameraData>();
            data.renderPostProcessing = false;
            data.renderShadows = false;

            Transform Hand(string n, float x)
            {
                var h = new GameObject(n);
                h.transform.SetParent(rig.transform, false);
                h.transform.localPosition = new Vector3(x, 1.2f, 0.3f);
                var v = MeshObject("Visual", controller, h.transform);
                v.layer = 2; // Ignore Raycast, so a controller never blocks its own pointer
                return h.transform;
            }
            xr.head = head.transform;
            xr.cam = cam;
            xr.leftHand = Hand("LeftHand", -0.2f);
            xr.rightHand = Hand("RightHand", 0.2f);
            SavePrefab(rig, "XRRig");
        }

        static void BuildSnow(Material particle)
        {
            var go = new GameObject("Snowfall");
            var ps = go.AddComponent<ParticleSystem>();
            var main = ps.main;
            main.loop = true;
            main.prewarm = true;
            main.startLifetime = 7f;
            main.startSpeed = 0f;
            main.startSize = new ParticleSystem.MinMaxCurve(0.02f, 0.045f);
            main.startColor = new Color(1, 1, 1, 0.9f);
            main.maxParticles = 320;       // a few hundred: transparent particles are costly on a Quest 2
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            main.gravityModifier = 0f;
            var em = ps.emission;
            em.rateOverTime = 44f;
            var shape = ps.shape;
            shape.shapeType = ParticleSystemShapeType.Box;
            shape.scale = new Vector3(12f, 0.1f, 12f);
            var vel = ps.velocityOverLifetime;
            vel.enabled = true;
            vel.space = ParticleSystemSimulationSpace.World;
            vel.x = new ParticleSystem.MinMaxCurve(-0.12f, 0.12f);
            vel.y = new ParticleSystem.MinMaxCurve(-0.62f, -0.4f);
            vel.z = new ParticleSystem.MinMaxCurve(-0.12f, 0.12f);
            var r = go.GetComponent<ParticleSystemRenderer>();
            r.sharedMaterial = particle;
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            SavePrefab(go, "Snowfall");
        }

        static void BuildPenguin()
        {
            // An original guide character: round slate-blue penguin with a peach scarf.
            var navy = new Color(0.22f, 0.29f, 0.40f);
            var body = SaveMesh(new MeshBuilder()
                .TaperBox(new Vector3(0, 0.34f, 0), new Vector3(0.48f, 0.62f, 0.42f), navy, true, default, 0.78f, 0.8f)                       // body
                .TaperBox(new Vector3(0, 0.32f, 0.09f), new Vector3(0.34f, 0.5f, 0.28f), White, false, default, 0.75f, 0.8f)                  // belly
                .TaperBox(new Vector3(0, 0.80f, 0), new Vector3(0.38f, 0.30f, 0.36f), navy, true, default, 0.84f, 0.84f)                      // head
                .Cube(new Vector3(0, 0.78f, 0.15f), new Vector3(0.27f, 0.18f, 0.08f), White, false)                                          // face
                .TaperBox(new Vector3(0, 0.75f, 0.26f), new Vector3(0.11f, 0.15f, 0.075f), Peach, false, new Vector3(90, 0, 0), 0.3f, 0.4f)   // beak
                .Cube(new Vector3(-0.075f, 0.835f, 0.19f), Vector3.one * 0.045f, Black, false)
                .Cube(new Vector3(0.075f, 0.835f, 0.19f), Vector3.one * 0.045f, Black, false)
                .TaperBox(new Vector3(0, 0.655f, 0.01f), new Vector3(0.43f, 0.08f, 0.41f), Peach, false, default, 0.92f, 0.92f)               // scarf
                .TaperBox(new Vector3(0.13f, 0.56f, 0.2f), new Vector3(0.08f, 0.2f, 0.04f), Peach, false, new Vector3(0, 0, -10), 0.8f, 1f)
                .TaperBox(new Vector3(0, 0.98f, 0.0f), new Vector3(0.2f, 0.07f, 0.2f), Peach, false, default, 0.5f, 0.5f)                     // little hat
                .Cube(new Vector3(0, 1.03f, 0), Vector3.one * 0.06f, White, false)
                .Cube(new Vector3(-0.11f, 0.025f, 0.09f), new Vector3(0.16f, 0.05f, 0.24f), Peach, false)
                .Cube(new Vector3(0.11f, 0.025f, 0.09f), new Vector3(0.16f, 0.05f, 0.24f), Peach, false),
                "PLACEHOLDER_PenguinBody");
            var wing = SaveMesh(new MeshBuilder()
                .TaperBox(new Vector3(0, -0.18f, 0), new Vector3(0.07f, 0.38f, 0.2f), navy, true, new Vector3(180, 0, 0), 0.6f, 0.5f), "PLACEHOLDER_PenguinWing");

            var root = new GameObject("PLACEHOLDER_PenguinGuide");
            MeshObject("Body", body, root.transform);
            var lw = MeshObject("LeftWing", wing, root.transform);
            lw.transform.localPosition = new Vector3(-0.25f, 0.6f, 0);
            lw.transform.localRotation = Quaternion.Euler(0, 0, -14f);
            var rw = MeshObject("RightWing", wing, root.transform);
            rw.transform.localPosition = new Vector3(0.25f, 0.6f, 0);
            rw.transform.localRotation = Quaternion.Euler(0, 0, 14f);
            var guide = root.AddComponent<PenguinGuide>();
            guide.leftWing = lw.transform;
            guide.rightWing = rw.transform;
            SavePrefab(root, "PLACEHOLDER_PenguinGuide");
        }

        // ------------------------------------------------------------------ sky images

        static float Hash(float x, float y, float z)
        {
            float h = Mathf.Sin(x * 127.1f + y * 311.7f + z * 74.7f) * 43758.5453f;
            return h - Mathf.Floor(h);
        }

        static float Noise(Vector3 p)
        {
            var i = new Vector3(Mathf.Floor(p.x), Mathf.Floor(p.y), Mathf.Floor(p.z));
            var f = p - i;
            f = new Vector3(f.x * f.x * (3 - 2 * f.x), f.y * f.y * (3 - 2 * f.y), f.z * f.z * (3 - 2 * f.z));
            float n(float dx, float dy, float dz) => Hash(i.x + dx, i.y + dy, i.z + dz);
            float x00 = Mathf.Lerp(n(0, 0, 0), n(1, 0, 0), f.x), x10 = Mathf.Lerp(n(0, 1, 0), n(1, 1, 0), f.x);
            float x01 = Mathf.Lerp(n(0, 0, 1), n(1, 0, 1), f.x), x11 = Mathf.Lerp(n(0, 1, 1), n(1, 1, 1), f.x);
            return Mathf.Lerp(Mathf.Lerp(x00, x10, f.y), Mathf.Lerp(x01, x11, f.y), f.z);
        }

        static float Fbm(Vector3 p)
        {
            float a = 0.5f, s = 0;
            for (int o = 0; o < 4; o++) { s += Noise(p) * a; p *= 2.03f; a *= 0.5f; }
            return s;
        }

        public struct SkySpec
        {
            public Color top, horizon, bottom;
            public float clouds; public Color cloudColor;
            public float stars;
            public Color glow; public float glowElevation;
            public bool aurora, rays;
        }

        /// <summary>Paints a simple 360 panorama. These are placeholders for generated skyboxes.</summary>
        public static Texture2D BuildSky(string name, SkySpec s)
        {
            const int W = 1024, H = 512;
            var tex = new Texture2D(W, H, TextureFormat.RGB24, false);
            var px = new Color[W * H];
            var sun = new Vector3(Mathf.Cos(s.glowElevation), Mathf.Sin(s.glowElevation), 0f);
            sun = Quaternion.Euler(0, -90, 0) * sun;
            for (int y = 0; y < H; y++)
            {
                float el = (y / (float)(H - 1) - 0.5f) * Mathf.PI;
                float se = Mathf.Sin(el), ce = Mathf.Cos(el);
                for (int x = 0; x < W; x++)
                {
                    float az = x / (float)W * Mathf.PI * 2f;
                    var d = new Vector3(ce * Mathf.Cos(az), se, ce * Mathf.Sin(az));
                    Color c = se >= 0 ? Color.Lerp(s.horizon, s.top, Mathf.Pow(se, 0.6f)) : Color.Lerp(s.horizon, s.bottom, Mathf.Pow(-se, 0.5f));
                    if (s.stars > 0 && se > -0.1f)
                    {
                        var q = d * 90f;
                        float h = Hash(Mathf.Floor(q.x), Mathf.Floor(q.y), Mathf.Floor(q.z));
                        if (h > 1f - s.stars * 0.02f) c += Color.white * (0.5f + 0.5f * Hash(q.z, q.x, q.y));
                    }
                    if (s.aurora && se > 0.05f)
                    {
                        float band = 0.55f + 0.18f * Mathf.Sin(az * 2f + Fbm(d * 2f) * 3f);
                        float a = Mathf.Exp(-Mathf.Pow((el - band) / 0.16f, 2f)) * (0.4f + 0.6f * Fbm(d * 5f + Vector3.one * 3f));
                        c += new Color(0.25f, 0.95f, 0.65f) * a * 0.8f;
                    }
                    if (s.rays && se > 0)
                    {
                        float r = Mathf.Pow(Fbm(new Vector3(Mathf.Cos(az) * 5f, 0.3f, Mathf.Sin(az) * 5f)), 3f) * 3f;
                        c += new Color(0.55f, 0.85f, 0.95f) * r * se * 0.6f;
                    }
                    if (s.glow.maxColorComponent > 0)
                        c += s.glow * Mathf.Pow(Mathf.Max(0, Vector3.Dot(d, sun)), 10f);
                    if (s.clouds > 0 && se > -0.08f)
                    {
                        float n = Fbm(d * 3.2f + new Vector3(4.1f, 0, 1.7f));
                        float cover = Mathf.SmoothStep(1f - s.clouds * 0.75f, 1f - s.clouds * 0.75f + 0.18f, n + 0.35f);
                        cover *= Mathf.SmoothStep(-0.08f, 0.12f, se);
                        c = Color.Lerp(c, s.cloudColor, cover * 0.9f);
                    }
                    px[y * W + x] = c;
                }
            }
            tex.SetPixels(px);
            tex.Apply();
            return SaveTexture(tex, "PLACEHOLDER_Sky_" + name, true);
        }

        // ------------------------------------------------------------------ scenes

        static Scene NewScene()
        {
            LoadShared();
            return EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        }

        static void SaveScene(Scene scene, string name)
        {
            EnsureFolder(Root + "/Scenes");
            EditorSceneManager.SaveScene(scene, Root + "/Scenes/" + name + ".unity");
        }

        static GameObject AddRig(bool seated, bool passthrough)
        {
            var go = (GameObject)PrefabUtility.InstantiatePrefab(AssetDatabase.LoadAssetAtPath<GameObject>(RigPath));
            var xr = go.GetComponent<XRRig>();
            xr.seated = seated;
            PrefabUtility.RecordPrefabInstancePropertyModifications(xr);
            var pt = go.GetComponent<PassthroughToggle>();
            pt.startInPassthrough = passthrough;
            PrefabUtility.RecordPrefabInstancePropertyModifications(pt);
            return go;
        }

        static Light AddSun(Color color, float intensity, Vector3 euler)
        {
            var go = new GameObject("Sun");
            var l = go.AddComponent<Light>();
            l.type = LightType.Directional;
            l.color = color;
            l.intensity = intensity;
            l.shadows = LightShadows.None;
            go.transform.rotation = Quaternion.Euler(euler);
            return l;
        }

        static void SetEnvironment(Color ambient, Material sky, float fogEnd, Color fogColor)
        {
            RenderSettings.skybox = sky;
            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Flat;
            RenderSettings.ambientLight = ambient;
            RenderSettings.fog = fogEnd > 0;
            RenderSettings.fogMode = FogMode.Linear;
            RenderSettings.fogColor = fogColor;
            RenderSettings.fogStartDistance = fogEnd * 0.3f;
            RenderSettings.fogEndDistance = Mathf.Max(1f, fogEnd);
            var env = new GameObject("SceneEnvironment").AddComponent<SceneEnvironment>();
            env.ambient = ambient;
        }

        static Material SkyMaterial(string name, Texture2D tex)
        {
            var baseMat = AssetDatabase.LoadAssetAtPath<Material>(Gen + "/Materials/M_SkyPanorama.mat");
            var m = new Material(baseMat) { name = name };
            m.SetTexture("_MainTex", tex);
            return Save(m, Gen + "/Materials/" + name + ".mat");
        }

        public static void BuildScenes()
        {
            BuildBootScene();
            BuildHubScene();
            BuildFrostSliceScene();
            BuildSnowCircuitScene();
            BuildWorldScene();

            var list = new List<EditorBuildSettingsScene>();
            foreach (var n in new[] { AppState.SceneBoot, AppState.SceneHub, AppState.SceneFrostSlice, AppState.SceneSnowCircuit, AppState.SceneWorld })
                list.Add(new EditorBuildSettingsScene(Root + "/Scenes/" + n + ".unity", true));
            EditorBuildSettings.scenes = list.ToArray();
            EditorSceneManager.OpenScene(Root + "/Scenes/" + AppState.SceneHub + ".unity");
            AssetDatabase.SaveAssets();
        }

        static void BuildBootScene()
        {
            var scene = NewScene();
            AddRig(false, false);
            SetEnvironment(new Color(0.8f, 0.84f, 0.9f), null, 0, Color.white);
            var cam = Object.FindFirstObjectByType<Camera>();
            cam.clearFlags = CameraClearFlags.SolidColor;
            PrefabUtility.RecordPrefabInstancePropertyModifications(cam);
            new GameObject("Boot").AddComponent<BootLoader>();
            SaveScene(scene, AppState.SceneBoot);
        }
    }
}
