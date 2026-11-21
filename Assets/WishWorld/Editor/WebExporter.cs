using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.SceneManagement;
using Object = UnityEngine.Object;

namespace WishWorld.EditorTools
{
    /// <summary>
    /// Exports the game's models, scenes, sounds and voice lines for the three.js web build (wishworld-web/public).
    /// Models are written as binary glTF (.glb) by the small writer in this file: no package is needed.
    ///
    /// Conventions of every .glb written here, and of layouts.json ("export axes"):
    ///   - Unity is left-handed, glTF and three.js are right-handed. X is negated: a Unity point (x, y, z) is (-x, y, z),
    ///     a rotation (x, y, z, w) is (x, -y, -z, w), and the triangle winding is flipped. Unity +Z (forward) stays +Z,
    ///     so a creature faces +Z as glTF expects, and in a scene file the player at the origin looks along +Z.
    ///     The headset (public/vr/core/environment.js) puts scenery under a group turned half a turn about Y, which
    ///     gives its own frame, where the viewer looks along -Z and a Unity point (x, y, z) is (x, y, -z).
    ///   - One unit is one metre. Nothing is rescaled.
    ///   - Colour is in COLOR_0 (linear, as the meshes store it). There are no normals: the game's shader shades
    ///     per face, and a glTF mesh without normals must be flat shaded (three.js does this by itself).
    ///   - _BODYMASK (0 or 1 per vertex, only where a model has both) marks the part a colour wish repaints.
    /// </summary>
    public static class WebExporter
    {
        public const string WebRoot = "wishworld-web/public";
        const string Models = WebRoot + "/models";
        const string Audio = WebRoot + "/audio";
        const string MeshDir = WishWorldBuilder.Gen + "/Meshes/";
        const string PrefabDir = WishWorldBuilder.Gen + "/Prefabs/";
        const string SceneDir = "Assets/WishWorld/Scenes/";
        const string EntriesFile = "Library/WishWorldWebExport.entries.txt";
        static readonly CultureInfo Inv = CultureInfo.InvariantCulture;

        // ------------------------------------------------------------------ menu

        [MenuItem("WishWorld/Web/Export Everything")]
        public static void ExportAll()
        {
            Debug.Log("[WishWorld] Web export\n" + ExportCreatures() + "\n" + ExportProps() + "\n" + ExportScenes() + "\n" + ExportThumbnails()
                + "\n" + ExportAudio() + "\n" + WriteManifest());
        }

        // ------------------------------------------------------------------ manifest entries (kept between calls)

        class Entry
        {
            public string id, file, kind, note = "";
            public Vector3 size, min, max;
            public int triangles, vertices;
            public long bytes;
            public bool mask;
        }

        static readonly Dictionary<string, Entry> entries = new Dictionary<string, Entry>();

        static void Remember(Entry e)
        {
            LoadEntries();
            entries[e.id] = e;
            var sb = new StringBuilder();
            foreach (var x in entries.Values)
                sb.Append(string.Join("\t", x.id, x.file, x.kind, V(x.size), V(x.min), V(x.max), x.triangles.ToString(Inv), x.vertices.ToString(Inv),
                    x.bytes.ToString(Inv), x.mask ? "1" : "0", x.note)).Append('\n');
            File.WriteAllText(EntriesFile, sb.ToString());
        }

        static void LoadEntries()
        {
            if (entries.Count > 0 || !File.Exists(EntriesFile)) return;
            foreach (var line in File.ReadAllLines(EntriesFile))
            {
                var p = line.Split('\t');
                if (p.Length < 11) continue;
                entries[p[0]] = new Entry
                {
                    id = p[0], file = p[1], kind = p[2], size = PV(p[3]), min = PV(p[4]), max = PV(p[5]),
                    triangles = int.Parse(p[6], Inv), vertices = int.Parse(p[7], Inv), bytes = long.Parse(p[8], Inv), mask = p[9] == "1", note = p[10]
                };
            }
        }

        static string V(Vector3 v) => F(v.x) + "," + F(v.y) + "," + F(v.z);
        static Vector3 PV(string s) { var p = s.Split(','); return new Vector3(float.Parse(p[0], Inv), float.Parse(p[1], Inv), float.Parse(p[2], Inv)); }

        public static string ClearEntries()
        {
            entries.Clear();
            if (File.Exists(EntriesFile)) File.Delete(EntriesFile);
            return "cleared";
        }

        public static string WriteManifest()
        {
            LoadEntries();
            int Rank(string kind) => kind == "creature" ? 0 : kind == "prop" ? 1 : 2;
            var list = entries.Values.Where(e => File.Exists(Models + "/" + e.file)).OrderBy(e => Rank(e.kind)).ThenBy(e => e.id, StringComparer.Ordinal).ToList();
            var sb = new StringBuilder("{ \"models\": [\n");
            for (int i = 0; i < list.Count; i++)
            {
                var e = list[i];
                sb.Append("  { \"id\": ").Append(Js(e.id)).Append(", \"file\": ").Append(Js(e.file)).Append(", \"kind\": ").Append(Js(e.kind))
                  .Append(", \"size\": ").Append(Arr(e.size)).Append(", \"triangles\": ").Append(e.triangles)
                  .Append(", \"vertexColors\": true, \"vertices\": ").Append(e.vertices).Append(", \"bytes\": ").Append(e.bytes)
                  .Append(", \"min\": ").Append(Arr(e.min)).Append(", \"max\": ").Append(Arr(e.max))
                  .Append(", \"bodyMask\": ").Append(e.mask ? "true" : "false");
                if (!string.IsNullOrEmpty(e.note)) sb.Append(", \"note\": ").Append(Js(e.note));
                sb.Append(" }").Append(i < list.Count - 1 ? ",\n" : "\n");
            }
            sb.Append("] }\n");
            Directory.CreateDirectory(Models);
            File.WriteAllText(Models + "/manifest.json", sb.ToString());
            return "manifest: " + list.Count + " models, " + (list.Sum(e => e.bytes) / 1024) + " KB";
        }

        // ------------------------------------------------------------------ creatures

        /// <summary>
        /// The Quaternius farm animals are baked facing -Z (in the game they walk tail first). The web contract wants
        /// every creature facing +Z, so these are turned half a turn on the way out, and in their thumbnails.
        /// </summary>
        static readonly HashSet<string> FacesBackward = new HashSet<string> { "cow", "horse", "pig", "sheep", "zebra" };

        /// <summary>Every creature in the library as models/&lt;id&gt;.glb: one mesh, centred left-right and front-back, height as in the game.</summary>
        public static string ExportCreatures()
        {
            var lib = Resources.Load<WorldLibrary>("WorldLibrary");
            if (lib == null) return "no WorldLibrary";
            int n = 0;
            foreach (var c in lib.creatures)
            {
                if (c == null || c.prefab == null || string.IsNullOrEmpty(c.id)) continue;
                bool turn = FacesBackward.Contains(c.id);
                ExportObject(c.prefab, c.id, "creature", flatten: true, centre: true,
                    note: c.displayName + " (" + c.prefab.name + ")" + (turn ? "; turned half a turn: in Unity this model faces -Z" : ""), turn: turn);
                n++;
            }
            return "creatures: " + n;
        }

        // ------------------------------------------------------------------ props

        public static string ExportProps()
        {
            int n = 0;
            void Prefab(string prefab, string id, string note, bool flatten = true)
            {
                var p = AssetDatabase.LoadAssetAtPath<GameObject>(PrefabDir + prefab + ".prefab");
                if (p == null) { Debug.LogWarning("[WishWorld] Web export: prefab not found: " + prefab); return; }
                ExportObject(p, id, "prop", flatten, false, note);
                n++;
            }
            void MeshAsset(string mesh, string id, string kind, string note)
            {
                var m = AssetDatabase.LoadAssetAtPath<Mesh>(MeshDir + mesh + ".asset");
                if (m == null) { Debug.LogWarning("[WishWorld] Web export: mesh not found: " + mesh); return; }
                ExportMeshes(id, kind, note, new[] { (id, m) });
                n++;
            }

            Prefab("PLACEHOLDER_PenguinGuide", "penguin_guide", "Hub guide. Nodes Body, LeftWing, RightWing (the wings wave)", false);
            MeshAsset("Controller", "controller", "prop", "Hand controller visual, origin at the grip, pointing +Z");
            Prefab("PLACEHOLDER_Blade", "blade", "Frost Slice blade, held at its origin, pointing +Z; tip at z = 0.64. Glows");
            Prefab("PLACEHOLDER_IceBlock", "ice_block", "Frost Slice hazard");
            foreach (var f in new[] { "Apple", "Orange", "Watermelon", "Lemon", "Pear", "Coconut" })
            {
                Prefab("Fruit_" + f, "fruit_" + f.ToLowerInvariant(), "Frost Slice fruit (Kenney Food Kit, CC0)");
                Prefab("FruitHalf_" + f, "fruit_half_" + f.ToLowerInvariant(), "Half of a sliced fruit, cut face toward -Y (Kenney Food Kit, CC0)");
            }
            Prefab("PLACEHOLDER_GhostCar", "ghost_car", "Snow Circuit ghost car");
            for (int i = 0; i < 5; i++) Prefab("RivalCar_" + i, "rival_car_" + i, "Snow Circuit rival (Kenney Car Kit, CC0)");
            MeshAsset("PLACEHOLDER_CarCockpit", "car_cockpit", "prop", "Snow Circuit player car, seen from the driving seat");
            MeshAsset("PLACEHOLDER_SteeringWheel", "steering_wheel", "prop", "Turns about its local Z. Mounted on the car at (0, 0.70, 0.44), tilted 22 degrees about X");
            MeshAsset("WorldGround", "world_ground", "scenery", "Plain ground disc for a world with no surroundings, multiplied by the world's ground colour (unused while every world has surroundings)");
            MeshAsset("WorldPlatform", "world_platform", "scenery", "Round platform for a Platform-mode world with no surroundings (the Wish World), multiplied by the world's ground colour");
            MeshAsset("FrostSliceProps", "frostslice_props", "scenery", "Static pieces of the Frost Slice scene, already placed");
            MeshAsset("SnowCircuitTrack", "track_snowcircuit", "scenery", "The race track surface, kerbs and start line, already placed");

            // Hub props from the Holiday Kit. In the game they are merged into the hub terrain; here they are also separate.
            foreach (var (pack, id) in new[] { ("TreeSnowA", "tree_snow_a"), ("TreeSnowB", "tree_snow_b"), ("TreeSnowC", "tree_snow_c"), ("TreeDecorated", "tree_decorated"),
                ("Snowman", "snowman"), ("Lantern", "lantern"), ("Sled", "sled"), ("PresentA", "present_a"), ("PresentB", "present_b"), ("PresentC", "present_c"),
                ("Bench", "bench"), ("Reindeer", "reindeer"), ("CandyCane", "candy_cane"), ("RocksLarge", "rocks_large"), ("SnowPile", "snow_pile") })
            {
                var b = PackMeshes.Load(pack);
                if (b == null) { Debug.LogWarning("[WishWorld] Web export: pack model not found: " + pack); continue; }
                var m = b.Build(pack);
                ExportMeshes(id, "prop", "Hub prop (Kenney Holiday Kit, CC0), origin on the ground", new[] { (id, m) });
                Object.DestroyImmediate(m);
                n++;
            }

            // Panels: flat vertex-coloured geometry, unlit. They face -Z (toward the viewer); text sits 4 mm in front.
            var theme = WWTheme.I;
            if (theme != null)
            {
                void Ui(string id, Vector2 size, Color fill, float radius, float border, PanelStyle style, string note)
                {
                    var go = WWUI.Panel(null, id, size, fill, radius, border, style);
                    go.hideFlags = HideFlags.HideAndDontSave;
                    ExportObject(go, id, "prop", true, false, note);
                    Object.DestroyImmediate(go);
                    n++;
                }
                Ui("ui_ribbon", new Vector2(0.95f, 0.18f), theme.ribbon, 0.006f, 0.006f, PanelStyle.Ribbon, "Hub title banner (0.95 x 0.18 m plus tails). Unlit, faces -Z");
                Ui("ui_ribbon_small", new Vector2(0.6f, 0.14f), theme.ribbon, 0.006f, 0.006f, PanelStyle.Ribbon, "Menu title ribbon (0.6 x 0.14 m). Unlit, faces -Z");
                Ui("ui_card", new Vector2(0.44f, 0.32f), theme.button, 0.05f, 0.008f, PanelStyle.Frame, "Hub menu card frame (0.44 x 0.32 m). Unlit, faces -Z");
                Ui("ui_card_peach", new Vector2(0.44f, 0.32f), theme.peach, 0.05f, 0.008f, PanelStyle.Frame, "Hub menu card frame, peach (the Wish card). Unlit, faces -Z");
                Ui("ui_panel", new Vector2(0.92f, 0.74f), theme.panel, 0.05f, 0.008f, PanelStyle.Frame, "Large menu panel (0.92 x 0.74 m). Unlit, faces -Z");
                Ui("ui_bubble", new Vector2(1.0f, 0.2f), theme.panel, 0.06f, 0.007f, PanelStyle.Bubble, "The guide's caption bubble (1.0 x 0.2 m). Unlit, faces -Z");
                Ui("ui_button", new Vector2(0.3f, 0.11f), theme.button, 0.033f, 0.006f, PanelStyle.Pill, "Pill button (0.3 x 0.11 m). Unlit, faces -Z");
                Ui("ui_fact_card", new Vector2(0.62f, 0.3f), theme.panel, 0.05f, 0.008f, PanelStyle.Frame, "Fact card frame (0.62 x 0.3 m). Unlit, faces -Z");
            }
            return "props: " + n;
        }

        // ------------------------------------------------------------------ scenes

        public static int LiteBudget = 40000;

        /// <summary>Whole-scene files: the hub, each world's surroundings, the race surroundings. Each also gets a "_lite" file cut to a triangle budget.</summary>
        public static string ExportScenes() => ExportHub() + "\n" + ExportWorlds(null) + "\n" + ExportCar() + "\n" + WriteLayouts();

        public static string ExportHub()
        {
            var scene = EditorSceneManager.OpenScene(SceneDir + "Hub.unity", OpenSceneMode.Single);
            var roots = scene.GetRootGameObjects().Where(g => g.name == "Terrain" || g.name == "Clouds").ToArray();
            var glb = new Glb();
            int root = glb.AddNode("scene_hub", -1, Vector3.zero, Quaternion.identity, Vector3.one);
            foreach (var r in roots) AddHierarchy(glb, r.transform, root, false, null);
            Remember(Finish(glb, "scene_hub", "scenery", "The hub's terrain (hills, mountains, trees, camp props, all one mesh) and nine drifting clouds, placed as in the game"));

            var terrain = AssetDatabase.LoadAssetAtPath<Mesh>(MeshDir + "HubTerrain.asset");
            var lite = Lite(new[] { terrain }, LiteBudget, p => new Vector3(p.x, p.y - 1.6f, p.z).sqrMagnitude);
            glb = new Glb();
            root = glb.AddNode("scene_hub_lite", -1, Vector3.zero, Quaternion.identity, Vector3.one);
            glb.SetMesh(glb.AddNode("Terrain", root, Vector3.zero, Quaternion.identity, Vector3.one), lite[0], WWTheme.I.vertexLit, "HubTerrain_lite");
            foreach (var r in roots.Where(g => g.name == "Clouds")) AddHierarchy(glb, r.transform, root, false, null);
            Remember(Finish(glb, "scene_hub_lite", "scenery", "scene_hub cut to about " + LiteBudget + " triangles for the headset: the far forest is thinned, everything near is kept"));
            foreach (var m in lite) Object.DestroyImmediate(m);
            return "hub: scene_hub, scene_hub_lite";
        }

        /// <summary>world_&lt;id&gt;.glb for each surroundings prefab (and world_race). Pass an id to do one, null for all.</summary>
        public static string ExportWorlds(string only)
        {
            var done = new List<string>();
            var track = AssetDatabase.LoadAssetAtPath<TrackData>(WishWorldBuilder.Gen + "/Track.asset");
            foreach (var guid in AssetDatabase.FindAssets("t:Prefab", new[] { WishWorldBuilder.SceneryFolder }))
            {
                var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(AssetDatabase.GUIDToAssetPath(guid));
                if (prefab == null || (only != null && prefab.name != only)) continue;
                string id = "world_" + prefab.name;
                bool race = prefab.name == "race";
                var glb = new Glb();
                int root = glb.AddNode(id, -1, Vector3.zero, Quaternion.identity, Vector3.one);
                AddHierarchy(glb, prefab.transform, root, true, null);
                Remember(Finish(glb, id, "scenery", (race ? "Snow Circuit surroundings" : "Surroundings of the " + prefab.name + " world")
                    + ": terrain and props to the horizon, one mesh per compass sector, placed as in the game"));

                var filters = prefab.GetComponentsInChildren<MeshFilter>(true).Where(f => f.sharedMesh != null).ToArray();
                Func<Vector3, float> dist = p => new Vector3(p.x, p.y - 1.6f, p.z).sqrMagnitude;
                if (race && track != null && track.points != null && track.points.Length > 0)
                {
                    var pts = track.points;
                    dist = p =>
                    {
                        float best = float.MaxValue;
                        for (int i = 0; i < pts.Length; i += 2) { float d = (pts[i] - p).sqrMagnitude; if (d < best) best = d; }
                        return best;
                    };
                }
                var lite = Lite(filters.Select(f => f.sharedMesh).ToArray(), LiteBudget, dist);
                glb = new Glb();
                root = glb.AddNode(id + "_lite", -1, Vector3.zero, Quaternion.identity, Vector3.one);
                for (int i = 0; i < lite.Length; i++)
                    glb.SetMesh(glb.AddNode(filters[i].name, root, Vector3.zero, Quaternion.identity, Vector3.one), lite[i], WWTheme.I.vertexLit, lite[i].name);
                Remember(Finish(glb, id + "_lite", "scenery", id + " cut to about " + LiteBudget + " triangles for the headset: small far-away pieces are dropped, the terrain and everything near stay"));
                foreach (var m in lite) Object.DestroyImmediate(m);
                done.Add(id);
                EditorUtility.UnloadUnusedAssetsImmediate();
            }
            return "worlds: " + string.Join(", ", done);
        }

        /// <summary>The player's race car as a hierarchy (cockpit, steering wheel mount, dashboard readout positions).</summary>
        public static string ExportCar()
        {
            var scene = EditorSceneManager.OpenScene(SceneDir + "Game_SnowCircuit.unity", OpenSceneMode.Single);
            var car = scene.GetRootGameObjects().FirstOrDefault(g => g.name == "Car");
            if (car == null) { EditorSceneManager.OpenScene(SceneDir + "Hub.unity", OpenSceneMode.Single); return "car: not found"; }
            var glb = new Glb();
            int root = glb.AddNode("car_player", -1, Vector3.zero, Quaternion.identity, Vector3.one);
            foreach (Transform child in car.transform) AddHierarchy(glb, child, root, false, t => t.GetComponent<XRRig>() != null || t.GetComponent<TMPro.TMP_Text>() != null, true);
            Remember(Finish(glb, "car_player", "prop", "Snow Circuit player car: Cockpit, WheelMount/Wheel (turn Wheel about its Z), Dash/Readout (three empty nodes where the speed, lap and time texts sit). The driver's head is at (0, 1.5, 0)"));
            EditorSceneManager.OpenScene(SceneDir + "Hub.unity", OpenSceneMode.Single);
            return "car: car_player";
        }

        /// <summary>Keep the triangles that cover the most of the view (area over squared distance) up to a budget, across a set of meshes.</summary>
        static Mesh[] Lite(Mesh[] meshes, int budget, Func<Vector3, float> distanceSquared)
        {
            var verts = new Vector3[meshes.Length][];
            var cols = new Color32[meshes.Length][];
            var tris = new int[meshes.Length][];
            var scores = new List<float>();
            var score = new float[meshes.Length][];
            for (int m = 0; m < meshes.Length; m++)
            {
                verts[m] = meshes[m].vertices; cols[m] = meshes[m].colors32; tris[m] = meshes[m].triangles;
                score[m] = new float[tris[m].Length / 3];
                for (int i = 0; i < score[m].Length; i++)
                {
                    Vector3 a = verts[m][tris[m][i * 3]], b = verts[m][tris[m][i * 3 + 1]], c = verts[m][tris[m][i * 3 + 2]];
                    float area = Vector3.Cross(b - a, c - a).magnitude * 0.5f;
                    float s = area / Mathf.Max(distanceSquared((a + b + c) / 3f), 9f);
                    score[m][i] = s; scores.Add(s);
                }
            }
            float cut = 0f;
            if (scores.Count > budget) { scores.Sort(); cut = scores[scores.Count - budget]; }
            var result = new Mesh[meshes.Length];
            for (int m = 0; m < meshes.Length; m++)
            {
                var map = new Dictionary<int, int>();
                var nv = new List<Vector3>(); var nc = new List<Color32>(); var nt = new List<int>();
                bool hasCol = cols[m].Length == verts[m].Length;
                for (int i = 0; i < score[m].Length; i++)
                {
                    if (score[m][i] < cut) continue;
                    for (int k = 0; k < 3; k++)
                    {
                        int old = tris[m][i * 3 + k];
                        if (!map.TryGetValue(old, out int idx)) { idx = nv.Count; map[old] = idx; nv.Add(verts[m][old]); nc.Add(hasCol ? cols[m][old] : new Color32(255, 255, 255, 255)); }
                        nt.Add(idx);
                    }
                }
                var mesh = new Mesh { name = meshes[m].name + "_lite", indexFormat = IndexFormat.UInt32, hideFlags = HideFlags.HideAndDontSave };
                mesh.SetVertices(nv); mesh.SetColors(nc); mesh.SetTriangles(nt, 0);
                result[m] = mesh;
            }
            return result;
        }

        // ------------------------------------------------------------------ layouts (machine-readable; LAYOUTS.md explains them)

        public static string WriteLayouts()
        {
            var sb = new StringBuilder("{\n  \"space\": \"Export axes, the same as every .glb in this folder: right-handed, Y up, metres. Unity (x, y, z) is (-x, y, z) here; a Unity yaw of a degrees is -a here; the player at the origin faces +Z. position, quaternion and yaw (degrees, three.js rotation.y) place a model file exactly as the game places it, in the same group as the scene files. The headset turns that whole group half a turn about Y (public/vr/core/environment.js), so in its world frame a value (x, y, z) from this file is (-x, y, -z), which is Unity (x, y, -z).\",\n");
            sb.Append("  \"scenes\": {\n");
            var names = new[] { "Hub", "World", "Game_FrostSlice", "Game_SnowCircuit" };
            for (int s = 0; s < names.Length; s++)
            {
                var scene = EditorSceneManager.OpenScene(SceneDir + names[s] + ".unity", OpenSceneMode.Single);
                sb.Append("    ").Append(Js(names[s])).Append(": {\n");
                var env = Object.FindFirstObjectByType<SceneEnvironment>();
                var sun = scene.GetRootGameObjects().Select(g => g.GetComponent<Light>()).FirstOrDefault(l => l != null);
                var cam = Object.FindFirstObjectByType<Camera>();
                var rig = Object.FindFirstObjectByType<XRRig>();
                var sky = RenderSettings.skybox;
                var skyTex = sky != null && sky.HasProperty("_MainTex") ? sky.GetTexture("_MainTex") : null;
                sb.Append("      \"fog\": ").Append(RenderSettings.fog ? "{ \"color\": " + Col(RenderSettings.fogColor) + ", \"near\": " + F(RenderSettings.fogStartDistance) + ", \"far\": " + F(RenderSettings.fogEndDistance) + " }" : "null").Append(",\n");
                sb.Append("      \"ambient\": ").Append(Amb(env != null ? env.ambient : RenderSettings.ambientLight)).Append(",\n");
                if (sun != null)
                    sb.Append("      \"sun\": { \"color\": ").Append(Col(sun.color)).Append(", \"intensity\": ").Append(F(sun.intensity))
                      .Append(", \"travels\": ").Append(Arr(Conv(sun.transform.forward))).Append(", \"toSun\": ").Append(Arr(Conv(-sun.transform.forward))).Append(" },\n");
                sb.Append("      \"sky\": ").Append(skyTex != null ? Js(Path.GetFileNameWithoutExtension(AssetDatabase.GetAssetPath(skyTex))) : "null").Append(",\n");
                if (rig != null) sb.Append("      \"player\": { \"position\": ").Append(Arr(Conv(rig.transform.position))).Append(", \"yaw\": ").Append(F(Mathf.DeltaAngle(0, -rig.transform.eulerAngles.y)))
                    .Append(", \"faces\": \"+Z at yaw 0 (yaw is a three.js rotation.y in degrees)\", \"eyeHeight\": ").Append(F(cam != null ? cam.transform.localPosition.y : 1.6f)).Append(" },\n");
                if (cam != null) sb.Append("      \"camera\": { \"fov\": ").Append(F(cam.fieldOfView)).Append(", \"near\": ").Append(F(cam.nearClipPlane)).Append(", \"far\": ").Append(F(cam.farClipPlane)).Append(" },\n");
                sb.Append("      \"objects\": [\n");
                var lines = new List<string>();
                foreach (var go in scene.GetRootGameObjects()) Describe(go.transform, lines, 0);
                sb.Append(string.Join(",\n", lines)).Append("\n      ]\n    }").Append(s < names.Length - 1 ? ",\n" : "\n");
            }
            sb.Append("  },\n  \"worlds\": {\n");
            var lib = Resources.Load<WorldLibrary>("WorldLibrary");
            var worlds = lib.worlds.Where(w => w != null).ToList();
            for (int i = 0; i < worlds.Count; i++)
            {
                var w = worlds[i];
                var travels = w.sunDirection.sqrMagnitude > 0.01f ? w.sunDirection.normalized : Quaternion.Euler(50, 330, 0) * Vector3.forward;
                sb.Append("    ").Append(Js(w.id)).Append(": { \"name\": ").Append(Js(w.displayName))
                  .Append(", \"sky\": ").Append(w.skyTexture != null ? Js(Path.GetFileNameWithoutExtension(AssetDatabase.GetAssetPath(w.skyTexture))) : "null")
                  .Append(", \"scenery\": ").Append(string.IsNullOrEmpty(w.scenery) ? "null" : Js("world_" + Path.GetFileName(w.scenery)))
                  .Append(", \"ground\": ").Append(Js(w.ground.ToString())).Append(", \"groundColor\": ").Append(Col(w.groundColor))
                  .Append(",\n      \"fog\": ").Append(w.fogEnd > 0 ? "{ \"color\": " + Col(w.fogColor) + ", \"near\": " + F(w.fogEnd * w.fogStart) + ", \"far\": " + F(w.fogEnd) + " }" : "null")
                  .Append(", \"ambient\": ").Append(Amb(w.ambientColor))
                  .Append(", \"sun\": { \"color\": ").Append(Col(w.lightColor)).Append(", \"intensity\": ").Append(F(w.lightIntensity))
                  .Append(", \"travels\": ").Append(Arr(Conv(travels))).Append(", \"toSun\": ").Append(Arr(Conv(-travels))).Append(" }")
                  .Append(",\n      \"ambientSound\": ").Append(Js(new[] { "amb_water", "amb_wind", "amb_hum", "amb_outdoor" }[Mathf.Clamp(w.ambientKind, 0, 3)]))
                  .Append(", \"showInMenu\": ").Append(w.showInMenu ? "true" : "false")
                  .Append(", \"intro\": ").Append(Js(string.IsNullOrEmpty(w.guideIntro) ? "Welcome to the " + w.displayName + "!" : w.guideIntro))
                  .Append(",\n      \"creatures\": [").Append(string.Join(", ", w.creatures.Where(e => e.creature != null).Select(e => "{ \"id\": " + Js(e.creature.id) + ", \"count\": " + e.count + " }")))
                  .Append("] }").Append(i < worlds.Count - 1 ? ",\n" : "\n");
            }
            sb.Append("  },\n  \"creatures\": {\n");
            var cs = lib.creatures.Where(c => c != null).ToList();
            for (int i = 0; i < cs.Count; i++)
            {
                var c = cs[i];
                sb.Append("    ").Append(Js(c.id)).Append(": { \"name\": ").Append(Js(c.displayName)).Append(", \"move\": ").Append(Js(c.moveType.ToString()))
                  .Append(", \"speed\": ").Append(F(c.speed)).Append(", \"distance\": [").Append(F(c.minDistance)).Append(", ").Append(F(c.maxDistance))
                  .Append("], \"height\": [").Append(F(c.minHeight)).Append(", ").Append(F(c.maxHeight)).Append("], \"arScale\": ").Append(F(c.arScale))
                  .Append(", \"addCount\": ").Append(c.addCount).Append(", \"schooling\": ").Append(c.schooling ? "true" : "false")
                  .Append(", \"voicePitch\": ").Append(F(c.voicePitch)).Append(" }").Append(i < cs.Count - 1 ? ",\n" : "\n");
            }
            sb.Append("  },\n");
            var track = AssetDatabase.LoadAssetAtPath<TrackData>(WishWorldBuilder.Gen + "/Track.asset");
            sb.Append("  \"track\": ");
            if (track != null && track.points != null)
                sb.Append("{ \"width\": ").Append(F(track.width)).Append(", \"length\": ").Append(F(track.length)).Append(", \"closed\": true, \"points\": [")
                  .Append(string.Join(", ", track.points.Select(p => Arr(Conv(p))))).Append("] }\n");
            else sb.Append("null\n");
            sb.Append("}\n");
            File.WriteAllText(Models + "/layouts.json", sb.ToString());
            EditorSceneManager.OpenScene(SceneDir + "Hub.unity", OpenSceneMode.Single);
            return "layouts.json written";
        }

        static void Describe(Transform t, List<string> lines, int depth)
        {
            if (depth > 3 || t.GetComponent<TMPro.TMP_Text>() != null) return;
            var mf = t.GetComponent<MeshFilter>();
            var sb = new StringBuilder("        { \"name\": ").Append(Js(t.name)).Append(", \"depth\": ").Append(depth)
                .Append(", \"position\": ").Append(Arr(Conv(t.position)))
                .Append(", \"quaternion\": ").Append(Quat(t.rotation)).Append(", \"yaw\": ").Append(F(Yaw(t.eulerAngles.y)))
                .Append(", \"scale\": ").Append(Arr(t.lossyScale));
            if (mf != null && mf.sharedMesh != null) sb.Append(", \"mesh\": ").Append(Js(mf.sharedMesh.name));
            var comps = t.GetComponents<Component>().Where(c => c != null && !(c is Transform) && !(c is MeshFilter) && !(c is MeshRenderer)).Select(c => c.GetType().Name).ToArray();
            if (comps.Length > 0) sb.Append(", \"components\": [").Append(string.Join(", ", comps.Select(Js))).Append("]");
            var drift = t.GetComponent<Drift>();
            if (drift != null) sb.Append(", \"degreesPerSecond\": ").Append(F(-drift.degreesPerSecond));
            sb.Append(" }");
            lines.Add(sb.ToString());
            foreach (Transform c in t) Describe(c, lines, depth + 1);
        }

        // ------------------------------------------------------------------ thumbnails

        /// <summary>models/thumbs/&lt;id&gt;.png: each creature from its front right, 256 x 256, transparent background.</summary>
        public static string ExportThumbnails()
        {
            var lib = Resources.Load<WorldLibrary>("WorldLibrary");
            if (lib == null) return "no WorldLibrary";
            Directory.CreateDirectory(Models + "/thumbs");
            const int size = 256, ss = 2;

            var lights = Object.FindObjectsByType<Light>(FindObjectsSortMode.None).Where(l => l.enabled).ToArray();
            foreach (var l in lights) l.enabled = false;
            bool fog = RenderSettings.fog; var ambMode = RenderSettings.ambientMode; var ambProbe = RenderSettings.ambientProbe; var ambLight = RenderSettings.ambientLight;
            RenderSettings.fog = false;
            WWEnv.SetAmbient(new Color(0.78f, 0.80f, 0.84f));

            var camGo = new GameObject("__thumbCam") { hideFlags = HideFlags.HideAndDontSave };
            var cam = camGo.AddComponent<Camera>();
            cam.orthographic = true; cam.clearFlags = CameraClearFlags.SolidColor; cam.backgroundColor = new Color(0, 0, 0, 0);
            cam.allowHDR = false; cam.aspect = 1f; cam.enabled = false;
            var lightGo = new GameObject("__thumbLight") { hideFlags = HideFlags.HideAndDontSave };
            var light = lightGo.AddComponent<Light>();
            light.type = LightType.Directional; light.intensity = 1.05f; light.color = new Color(1f, 0.98f, 0.95f);
            var rt = new RenderTexture(size * ss, size * ss, 24, RenderTextureFormat.ARGB32) { antiAliasing = 8 };
            var tex = new Texture2D(size * ss, size * ss, TextureFormat.RGBA32, false);
            var small = new Texture2D(size, size, TextureFormat.RGBA32, false);
            int n = 0;
            try
            {
                foreach (var c in lib.creatures)
                {
                    if (c == null || c.prefab == null) continue;
                    var origin = new Vector3(3000, 0, 3000);
                    var go = Object.Instantiate(c.prefab, origin, FacesBackward.Contains(c.id) ? Quaternion.Euler(0, 180, 0) : Quaternion.identity);
                    go.hideFlags = HideFlags.HideAndDontSave;
                    var rs = go.GetComponentsInChildren<Renderer>();
                    var b = rs[0].bounds;
                    foreach (var r in rs) b.Encapsulate(r.bounds);

                    // Camera on the creature's front right, a little above; the light comes over the camera's left shoulder.
                    var dir = new Vector3(-0.72f, 0.34f, 1f).normalized;
                    camGo.transform.rotation = Quaternion.LookRotation(-dir, Vector3.up);
                    lightGo.transform.rotation = Quaternion.LookRotation(new Vector3(0.35f, -0.75f, -0.6f));
                    float maxX = float.MinValue, maxY = float.MinValue, minX = float.MaxValue, minY = float.MaxValue, depth = b.extents.magnitude;
                    var toCam = Quaternion.Inverse(camGo.transform.rotation);
                    foreach (var mf in go.GetComponentsInChildren<MeshFilter>())
                    {
                        if (mf.sharedMesh == null) continue;
                        foreach (var v in mf.sharedMesh.vertices)
                        {
                            var local = toCam * (mf.transform.TransformPoint(v) - b.center);
                            minX = Mathf.Min(minX, local.x); maxX = Mathf.Max(maxX, local.x); minY = Mathf.Min(minY, local.y); maxY = Mathf.Max(maxY, local.y);
                        }
                    }
                    var centre = b.center + camGo.transform.rotation * new Vector3((minX + maxX) * 0.5f, (minY + maxY) * 0.5f, 0);
                    cam.orthographicSize = Mathf.Max(maxX - minX, maxY - minY) * 0.5f * 1.08f;
                    camGo.transform.position = centre + dir * (depth + 5f);
                    cam.nearClipPlane = 1f; cam.farClipPlane = depth * 2f + 10f;

                    RenderPipeline.SubmitRenderRequest(cam, new UniversalRenderPipeline.SingleCameraRequest { destination = rt });
                    var prev = RenderTexture.active; RenderTexture.active = rt;
                    tex.ReadPixels(new Rect(0, 0, size * ss, size * ss), 0, 0);
                    RenderTexture.active = prev;
                    var src = tex.GetPixels32();
                    var dst = new Color32[size * size];
                    for (int y = 0; y < size; y++)
                        for (int x = 0; x < size; x++)
                        {
                            // Box filter. The render is colour over black with coverage in alpha, so divide the colour back out.
                            float r = 0, g = 0, bl = 0, a = 0;
                            for (int dy = 0; dy < ss; dy++)
                                for (int dx = 0; dx < ss; dx++)
                                {
                                    var p = src[(y * ss + dy) * size * ss + x * ss + dx];
                                    r += p.r; g += p.g; bl += p.b; a += p.a;
                                }
                            float k = a > 0.5f ? 255f / a : 0f;
                            dst[y * size + x] = new Color32((byte)Mathf.Clamp(r * k, 0, 255), (byte)Mathf.Clamp(g * k, 0, 255), (byte)Mathf.Clamp(bl * k, 0, 255), (byte)Mathf.Clamp(a / (ss * ss), 0, 255));
                        }
                    small.SetPixels32(dst);
                    File.WriteAllBytes(Models + "/thumbs/" + c.id + ".png", small.EncodeToPNG());
                    Object.DestroyImmediate(go);
                    n++;
                }
            }
            finally
            {
                foreach (var l in lights) if (l != null) l.enabled = true;
                RenderSettings.fog = fog; RenderSettings.ambientMode = ambMode; RenderSettings.ambientProbe = ambProbe; RenderSettings.ambientLight = ambLight;
                rt.Release(); Object.DestroyImmediate(rt); Object.DestroyImmediate(tex); Object.DestroyImmediate(small);
                Object.DestroyImmediate(camGo); Object.DestroyImmediate(lightGo);
            }
            return "thumbnails: " + n;
        }

        // ------------------------------------------------------------------ audio

        /// <summary>
        /// The game's sounds are made in code (Sfx.cs), so they are rendered to WAV here; the guide's recorded lines are copied.
        /// Writes audio/audio.json: { sfx: { name: file }, chirps: { creatureId: file }, voice: [ { id, text, file } ] }.
        /// </summary>
        public static string ExportAudio()
        {
            Directory.CreateDirectory(Audio + "/sfx");
            Directory.CreateDirectory(Audio + "/voice");
            var sfx = new List<(string name, AudioClip clip, bool loop)>
            {
                ("hover", Sfx.Hover, false), ("click", Sfx.Click, false), ("slice", Sfx.Slice, false), ("pop", Sfx.Pop, false), ("chime", Sfx.Chime, false),
                ("buzz", Sfx.Buzz, false), ("success", Sfx.Success, false), ("engine", Sfx.Engine, true),
                ("amb_water", Sfx.Ambient(0), true), ("amb_wind", Sfx.Ambient(1), true), ("amb_hum", Sfx.Ambient(2), true), ("amb_outdoor", Sfx.Ambient(3), true),
            };
            var sb = new StringBuilder("{\n  \"note\": \"sfx and chirps are 22.05 kHz mono WAV made by the game's own code (plays in every browser, loops are seamless); voice is MP3 from ElevenLabs. Paths are relative to /audio/.\",\n  \"sfx\": {\n");
            for (int i = 0; i < sfx.Count; i++)
            {
                WriteWav(Audio + "/sfx/" + sfx[i].name + ".wav", sfx[i].clip);
                sb.Append("    ").Append(Js(sfx[i].name)).Append(": ").Append(Js("sfx/" + sfx[i].name + ".wav")).Append(i < sfx.Count - 1 ? ",\n" : "\n");
            }
            sb.Append("  },\n  \"loops\": [").Append(string.Join(", ", sfx.Where(s => s.loop).Select(s => Js(s.name)))).Append("],\n  \"chirps\": {\n");
            var lib = Resources.Load<WorldLibrary>("WorldLibrary");
            var cs = lib.creatures.Where(c => c != null).ToList();
            var written = new HashSet<string>();
            for (int i = 0; i < cs.Count; i++)
            {
                int p = Mathf.RoundToInt(Mathf.Clamp(cs[i].voicePitch, 0.3f, 3f) * 20);
                string file = "sfx/chirp_" + p + ".wav";
                if (written.Add(file)) WriteWav(Audio + "/" + file, Sfx.Chirp(cs[i].voicePitch));
                sb.Append("    ").Append(Js(cs[i].id)).Append(": ").Append(Js(file)).Append(i < cs.Count - 1 ? ",\n" : "\n");
            }
            sb.Append("  },\n");

            var bank = Resources.Load<VoiceBank>(VoiceBank.ResourceName);
            int voices = 0;
            sb.Append("  \"voiceName\": ").Append(Js(bank != null ? bank.voiceName : "")).Append(",\n  \"voiceKey\": \"key = text trimmed, lower-cased, runs of white space made one space; look a line up by key\",\n  \"voice\": [\n");
            if (bank != null)
            {
                var lines = new List<string>();
                foreach (var e in bank.entries)
                {
                    if (e == null || e.clip == null || string.IsNullOrEmpty(e.text)) continue;
                    string path = AssetDatabase.GetAssetPath(e.clip);
                    if (string.IsNullOrEmpty(path) || !File.Exists(path)) continue;
                    string id = Path.GetFileNameWithoutExtension(path), ext = Path.GetExtension(path).ToLowerInvariant();
                    File.Copy(path, Audio + "/voice/" + id + ext, true);
                    lines.Add("    { \"id\": " + Js(id) + ", \"text\": " + Js(e.text) + ", \"file\": " + Js("voice/" + id + ext) + ", \"key\": " + Js(VoiceBank.Key(e.text))
                        + ", \"seconds\": " + F(e.clip.length) + " }");
                    voices++;
                }
                sb.Append(string.Join(",\n", lines)).Append('\n');
            }
            sb.Append("  ]\n}\n");
            File.WriteAllText(Audio + "/audio.json", sb.ToString());
            return "audio: " + sfx.Count + " sounds, " + written.Count + " chirps, " + voices + " voice lines";
        }

        static void WriteWav(string path, AudioClip clip)
        {
            var data = new float[clip.samples * clip.channels];
            clip.GetData(data, 0);
            using (var w = new BinaryWriter(File.Create(path)))
            {
                int bytes = data.Length * 2;
                w.Write(Encoding.ASCII.GetBytes("RIFF")); w.Write(36 + bytes); w.Write(Encoding.ASCII.GetBytes("WAVEfmt "));
                w.Write(16); w.Write((short)1); w.Write((short)clip.channels); w.Write(clip.frequency);
                w.Write(clip.frequency * clip.channels * 2); w.Write((short)(clip.channels * 2)); w.Write((short)16);
                w.Write(Encoding.ASCII.GetBytes("data")); w.Write(bytes);
                foreach (var s in data) w.Write((short)Mathf.RoundToInt(Mathf.Clamp(s, -1f, 1f) * 32767f));
            }
        }

        // ------------------------------------------------------------------ export helpers

        static bool Exportable(Renderer r, out Material mat)
        {
            mat = r != null ? r.sharedMaterial : null;
            if (mat == null || mat.shader == null) return false;
            return mat.shader.name == "WishWorld/VertexColorLit" || mat.shader.name == "WishWorld/VertexColorUnlit";
        }

        /// <summary>
        /// One prefab or scene object as a .glb. flatten: bake every mesh into the root's space (a single node);
        /// otherwise the transform hierarchy is kept as glTF nodes. centre: move the model so its bounds are centred in X and Z.
        /// </summary>
        public static string ExportObject(GameObject go, string id, string kind, bool flatten, bool centre, string note = "", bool turn = false)
        {
            var glb = new Glb();
            int root = glb.AddNode(id, -1, Vector3.zero, Quaternion.identity, Vector3.one);
            if (flatten)
            {
                var toRoot = (turn ? Matrix4x4.Rotate(Quaternion.Euler(0, 180, 0)) : Matrix4x4.identity) * go.transform.worldToLocalMatrix;
                var parts = new List<(Mesh mesh, Material mat, Matrix4x4 m)>();
                foreach (var mf in go.GetComponentsInChildren<MeshFilter>(true))
                    if (mf.sharedMesh != null && mf.sharedMesh.vertexCount > 0 && Exportable(mf.GetComponent<Renderer>(), out var mat))
                        parts.Add((mf.sharedMesh, mat, toRoot * mf.transform.localToWorldMatrix));
                var offset = Vector3.zero;
                if (centre && parts.Count > 0)
                {
                    Vector3 min = Vector3.positiveInfinity, max = Vector3.negativeInfinity;
                    foreach (var p in parts) foreach (var v in p.mesh.vertices) { var q = p.m.MultiplyPoint3x4(v); min = Vector3.Min(min, q); max = Vector3.Max(max, q); }
                    offset = new Vector3(-(min.x + max.x) * 0.5f, 0, -(min.z + max.z) * 0.5f);
                }
                for (int i = 0; i < parts.Count; i++)
                {
                    int node = parts.Count == 1 ? root : glb.AddNode(parts[i].mesh.name, root, Vector3.zero, Quaternion.identity, Vector3.one);
                    glb.SetMesh(node, parts[i].mesh, parts[i].mat, parts[i].mesh.name, Matrix4x4.Translate(offset) * parts[i].m);
                }
            }
            else
            {
                foreach (Transform child in go.transform) AddHierarchy(glb, child, root, false, null);
                var mf = go.GetComponent<MeshFilter>();
                if (mf != null && mf.sharedMesh != null && Exportable(go.GetComponent<Renderer>(), out var mat)) glb.SetMesh(root, mf.sharedMesh, mat, mf.sharedMesh.name);
            }
            Remember(Finish(glb, id, kind, note));
            return id;
        }

        static void ExportMeshes(string id, string kind, string note, IEnumerable<(string name, Mesh mesh)> meshes)
        {
            var glb = new Glb();
            var list = meshes.ToList();
            int root = glb.AddNode(id, -1, Vector3.zero, Quaternion.identity, Vector3.one);
            foreach (var (name, mesh) in list)
                glb.SetMesh(list.Count == 1 ? root : glb.AddNode(name, root, Vector3.zero, Quaternion.identity, Vector3.one), mesh, WWTheme.I.vertexLit, name);
            Remember(Finish(glb, id, kind, note));
        }

        /// <summary>Copy a transform and its children into the file as nodes. skipRootTransform puts the first one at the parent's origin.</summary>
        static void AddHierarchy(Glb glb, Transform t, int parent, bool skipRootTransform, Func<Transform, bool> skip, bool keepEmpty = false)
        {
            if (skip != null && skip(t)) return;
            bool any = keepEmpty || t.GetComponentsInChildren<MeshFilter>(true).Any(f => f.sharedMesh != null && f.sharedMesh.vertexCount > 0 && Exportable(f.GetComponent<Renderer>(), out _));
            if (!any) return;
            int node = skipRootTransform ? glb.AddNode(t.name, parent, Vector3.zero, Quaternion.identity, Vector3.one)
                                         : glb.AddNode(t.name, parent, t.localPosition, t.localRotation, t.localScale);
            var mf = t.GetComponent<MeshFilter>();
            if (mf != null && mf.sharedMesh != null && mf.sharedMesh.vertexCount > 0 && Exportable(t.GetComponent<Renderer>(), out var mat))
                glb.SetMesh(node, mf.sharedMesh, mat, mf.sharedMesh.name);
            foreach (Transform c in t) AddHierarchy(glb, c, node, false, skip, keepEmpty);
        }

        static Entry Finish(Glb glb, string id, string kind, string note)
        {
            Directory.CreateDirectory(Models);
            string path = Models + "/" + id + ".glb";
            glb.Write(path);
            return new Entry
            {
                id = id, file = id + ".glb", kind = kind, note = note, size = glb.Size, min = glb.Min, max = glb.Max,
                triangles = glb.Triangles, vertices = glb.Vertices, bytes = new FileInfo(path).Length, mask = glb.HasMask
            };
        }

        // ------------------------------------------------------------------ formatting

        /// <summary>Unity point or direction to export axes (the axes of the .glb files): X is mirrored.</summary>
        static Vector3 Conv(Vector3 v) => new Vector3(-v.x, v.y, v.z);
        /// <summary>Unity yaw (degrees, clockwise from above) to a three.js rotation.y in degrees, in export axes.</summary>
        static float Yaw(float unityYaw) => Mathf.DeltaAngle(0, -unityYaw);
        static string F(float v) => (Mathf.Abs(v) < 1e-6f ? 0f : v).ToString("0.#####", Inv);
        static string Arr(Vector3 v) => "[" + F(v.x) + ", " + F(v.y) + ", " + F(v.z) + "]";
        /// <summary>A Unity rotation as a three.js quaternion in export axes.</summary>
        static string Quat(Quaternion q) => "[" + F(q.x) + ", " + F(-q.y) + ", " + F(-q.z) + ", " + F(q.w) + "]";
        /// <summary>A colour as the game's authored (sRGB) values plus a hex string for THREE.Color.</summary>
        static string Col(Color c) => "{ \"srgb\": [" + F(c.r) + ", " + F(c.g) + ", " + F(c.b) + "], \"hex\": \"#" + ColorUtility.ToHtmlStringRGB(c).ToLowerInvariant() + "\" }";

        /// <summary>Ambient light: the game hands these numbers to the shader as they are (linear), not as an sRGB colour.</summary>
        static string Amb(Color c) => "{ \"linear\": [" + F(c.r) + ", " + F(c.g) + ", " + F(c.b) + "] }";

        static string Js(string s)
        {
            var sb = new StringBuilder("\"");
            foreach (char ch in s ?? "")
            {
                switch (ch)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (ch < 0x20) sb.Append("\\u").Append(((int)ch).ToString("x4"));
                        else sb.Append(ch);
                        break;
                }
            }
            return sb.Append('"').ToString();
        }

        // ------------------------------------------------------------------ the .glb writer

        /// <summary>A minimal binary glTF 2.0 writer for vertex-coloured meshes: nodes, meshes, three kinds of material.</summary>
        sealed class Glb
        {
            class NodeDef
            {
                public string name; public int mesh = -1;
                public Vector3 p; public Quaternion r; public Vector3 s;
                public Matrix4x4 world;
                public readonly List<int> children = new List<int>();
            }

            readonly MemoryStream bin = new MemoryStream();
            readonly List<string> views = new List<string>(), accessors = new List<string>(), meshes = new List<string>(), materials = new List<string>();
            readonly List<NodeDef> nodes = new List<NodeDef>();
            readonly List<int> roots = new List<int>();
            readonly Dictionary<string, int> materialIndex = new Dictionary<string, int>();
            readonly Dictionary<string, (int mesh, int tris, int verts, Vector3[] pos)> meshCache = new Dictionary<string, (int, int, int, Vector3[])>();
            bool unlit;
            Vector3 bmin = Vector3.positiveInfinity, bmax = Vector3.negativeInfinity;

            /// <summary>Unity to glTF: X is mirrored, so what faces +Z in Unity still faces +Z.</summary>
            static Vector3 Point(Vector3 v) => new Vector3(-v.x, v.y, v.z);

            public int Triangles { get; private set; }
            public int Vertices { get; private set; }
            public bool HasMask { get; private set; }
            public Vector3 Min => Triangles > 0 ? bmin : Vector3.zero;
            public Vector3 Max => Triangles > 0 ? bmax : Vector3.zero;
            public Vector3 Size => Triangles > 0 ? bmax - bmin : Vector3.zero;

            /// <summary>Position, rotation and scale are Unity local values; they are converted on writing.</summary>
            public int AddNode(string name, int parent, Vector3 p, Quaternion r, Vector3 s)
            {
                var n = new NodeDef { name = name, p = p, r = r, s = s };
                n.world = (parent >= 0 ? nodes[parent].world : Matrix4x4.identity) * Matrix4x4.TRS(p, r, s);
                nodes.Add(n);
                if (parent >= 0) nodes[parent].children.Add(nodes.Count - 1); else roots.Add(nodes.Count - 1);
                return nodes.Count - 1;
            }

            public void SetMesh(int node, Mesh mesh, Material material, string name, Matrix4x4? bake = null)
            {
                int mat = MaterialFor(material);
                string key = mesh.GetInstanceID() + "|" + mat + "|" + (bake.HasValue ? bake.Value.ToString("R") : "");
                if (!meshCache.TryGetValue(key, out var cached))
                {
                    cached = Build(mesh, mat, name, bake);
                    meshCache[key] = cached;
                }
                nodes[node].mesh = cached.mesh;
                Triangles += cached.tris;
                Vertices += cached.verts;
                // Bounds in the space of the file, through this node's place in it.
                var w = nodes[node].world;
                foreach (var v in cached.pos)
                {
                    var q = Point(w.MultiplyPoint3x4(v));
                    bmin = Vector3.Min(bmin, q); bmax = Vector3.Max(bmax, q);
                }
            }

            int MaterialFor(Material m)
            {
                string shader = m != null && m.shader != null ? m.shader.name : "";
                bool isUnlit = shader == "WishWorld/VertexColorUnlit";
                float glow = m != null && m.HasProperty("_Glow") ? m.GetFloat("_Glow") : 0f;
                Color baseColor = m != null && m.HasProperty("_BaseColor") ? m.GetColor("_BaseColor").linear : Color.white;
                string name = m != null ? m.name.Replace("M_", "") : "VertexLit";
                string key = name + "|" + isUnlit + "|" + glow + "|" + baseColor;
                if (materialIndex.TryGetValue(key, out int idx)) return idx;
                var sb = new StringBuilder("{\"name\":").Append(Js(name))
                    .Append(",\"pbrMetallicRoughness\":{\"baseColorFactor\":[").Append(F(baseColor.r)).Append(',').Append(F(baseColor.g)).Append(',').Append(F(baseColor.b))
                    .Append(",1],\"metallicFactor\":0,\"roughnessFactor\":1}");
                if (isUnlit) { sb.Append(",\"extensions\":{\"KHR_materials_unlit\":{}}"); unlit = true; }
                else if (glow > 0f)
                {
                    // The shader adds glowColor * glow * (0.3 + 0.7 * albedo); glTF has one emissive colour, so use the middle of that.
                    var g = m.GetColor("_GlowColor").linear * glow * 0.65f;
                    sb.Append(",\"emissiveFactor\":[").Append(F(Mathf.Clamp01(g.r))).Append(',').Append(F(Mathf.Clamp01(g.g))).Append(',').Append(F(Mathf.Clamp01(g.b))).Append(']');
                }
                sb.Append('}');
                materials.Add(sb.ToString());
                materialIndex[key] = materials.Count - 1;
                return materials.Count - 1;
            }

            struct VKey : IEquatable<VKey>
            {
                public Vector3 p; public uint c;
                public bool Equals(VKey o) => p.x == o.p.x && p.y == o.p.y && p.z == o.p.z && c == o.c;
                public override bool Equals(object o) => o is VKey k && Equals(k);
                public override int GetHashCode() => unchecked(((p.x.GetHashCode() * 397) ^ p.y.GetHashCode()) * 397 ^ p.z.GetHashCode() * 31 ^ (int)c);
            }

            (int mesh, int tris, int verts, Vector3[] pos) Build(Mesh mesh, int material, string name, Matrix4x4? bake)
            {
                var v = mesh.vertices; var c = mesh.colors32; var t = mesh.triangles;
                bool hasCol = c.Length == v.Length;
                // Weld vertices that share a position and colour: with no normals in the file they are the same vertex.
                var map = new Dictionary<VKey, int>(v.Length);
                var remap = new int[v.Length];
                var pos = new List<Vector3>(v.Length); var col = new List<Color32>(v.Length);
                for (int i = 0; i < v.Length; i++)
                {
                    var p = bake.HasValue ? bake.Value.MultiplyPoint3x4(v[i]) : v[i];
                    var cc = hasCol ? c[i] : new Color32(255, 255, 255, 255);
                    cc.a = cc.a > 127 ? (byte)255 : (byte)0;
                    var key = new VKey { p = p, c = (uint)(cc.r | cc.g << 8 | cc.b << 16 | cc.a << 24) };
                    if (!map.TryGetValue(key, out int idx)) { idx = pos.Count; map[key] = idx; pos.Add(p); col.Add(cc); }
                    remap[i] = idx;
                }
                var tri = new List<int>(t.Length);
                for (int i = 0; i + 2 < t.Length; i += 3)
                {
                    int a = remap[t[i]], b = remap[t[i + 1]], d = remap[t[i + 2]];
                    if (a == b || b == d || a == d) continue;
                    tri.Add(a); tri.Add(d); tri.Add(b);          // winding flips with the mirrored axis
                }
                int n = pos.Count;
                bool any0 = false, any1 = false;
                foreach (var cc in col) { if (cc.a == 0) any0 = true; else any1 = true; }
                bool mask = any0 && any1;
                if (mask) HasMask = true;

                var pb = new byte[n * 12]; var cb = new byte[n * 4]; var mb = mask ? new byte[n * 4] : null;
                Vector3 min = Vector3.positiveInfinity, max = Vector3.negativeInfinity;
                var f3 = new float[3];
                for (int i = 0; i < n; i++)
                {
                    var fp = Point(pos[i]);
                    f3[0] = fp.x; f3[1] = fp.y; f3[2] = fp.z;
                    Buffer.BlockCopy(f3, 0, pb, i * 12, 12);
                    var q = new Vector3(f3[0], f3[1], f3[2]);
                    min = Vector3.Min(min, q); max = Vector3.Max(max, q);
                    cb[i * 4] = col[i].r; cb[i * 4 + 1] = col[i].g; cb[i * 4 + 2] = col[i].b; cb[i * 4 + 3] = 255;
                    if (mask) mb[i * 4] = col[i].a;
                }
                byte[] ib; int componentType;
                if (n <= 65535)
                {
                    ib = new byte[tri.Count * 2]; componentType = 5123;
                    for (int i = 0; i < tri.Count; i++) { ib[i * 2] = (byte)(tri[i] & 255); ib[i * 2 + 1] = (byte)(tri[i] >> 8); }
                }
                else
                {
                    ib = new byte[tri.Count * 4]; componentType = 5125;
                    Buffer.BlockCopy(tri.ToArray(), 0, ib, 0, ib.Length);
                }

                int posAcc = Accessor(View(pb, 34962, 0), 5126, n, "VEC3", false,
                    ",\"min\":[" + R(min.x) + "," + R(min.y) + "," + R(min.z) + "],\"max\":[" + R(max.x) + "," + R(max.y) + "," + R(max.z) + "]");
                int colAcc = Accessor(View(cb, 34962, 0), 5121, n, "VEC4", true, "");
                int maskAcc = mask ? Accessor(View(mb, 34962, 4), 5121, n, "SCALAR", true, "") : -1;
                int idxAcc = Accessor(View(ib, 34963, 0), componentType, tri.Count, "SCALAR", false, "");

                var sb = new StringBuilder("{\"name\":").Append(Js(name)).Append(",\"primitives\":[{\"attributes\":{\"POSITION\":").Append(posAcc).Append(",\"COLOR_0\":").Append(colAcc);
                if (mask) sb.Append(",\"_BODYMASK\":").Append(maskAcc);
                sb.Append("},\"indices\":").Append(idxAcc).Append(",\"material\":").Append(material).Append(",\"mode\":4}]}");
                meshes.Add(sb.ToString());
                return (meshes.Count - 1, tri.Count / 3, n, pos.ToArray());
            }

            static string R(float v) => v.ToString("R", Inv);

            int View(byte[] data, int target, int stride)
            {
                while (bin.Length % 4 != 0) bin.WriteByte(0);
                long offset = bin.Length;
                bin.Write(data, 0, data.Length);
                views.Add("{\"buffer\":0,\"byteOffset\":" + offset + ",\"byteLength\":" + data.Length + (stride > 0 ? ",\"byteStride\":" + stride : "") + ",\"target\":" + target + "}");
                return views.Count - 1;
            }

            int Accessor(int view, int componentType, int count, string type, bool normalized, string extra)
            {
                accessors.Add("{\"bufferView\":" + view + ",\"componentType\":" + componentType + (normalized ? ",\"normalized\":true" : "") + ",\"count\":" + count + ",\"type\":\"" + type + "\"" + extra + "}");
                return accessors.Count - 1;
            }

            public void Write(string path)
            {
                while (bin.Length % 4 != 0) bin.WriteByte(0);
                var sb = new StringBuilder("{\"asset\":{\"version\":\"2.0\",\"generator\":\"WishWorld WebExporter (Unity " + Application.unityVersion + ")\"},");
                if (unlit) sb.Append("\"extensionsUsed\":[\"KHR_materials_unlit\"],");
                sb.Append("\"scene\":0,\"scenes\":[{\"nodes\":[").Append(string.Join(",", roots)).Append("]}],\"nodes\":[");
                for (int i = 0; i < nodes.Count; i++)
                {
                    var n = nodes[i];
                    if (i > 0) sb.Append(',');
                    sb.Append("{\"name\":").Append(Js(n.name));
                    var tp = Point(n.p);
                    if (n.p != Vector3.zero) sb.Append(",\"translation\":[").Append(R(tp.x)).Append(',').Append(R(tp.y)).Append(',').Append(R(tp.z)).Append(']');
                    var q = n.r.normalized;
                    q = new Quaternion(q.x, -q.y, -q.z, q.w);
                    if (Quaternion.Angle(q, Quaternion.identity) > 0.001f) sb.Append(",\"rotation\":[").Append(R(q.x)).Append(',').Append(R(q.y)).Append(',').Append(R(q.z)).Append(',').Append(R(q.w)).Append(']');
                    if (n.s != Vector3.one) sb.Append(",\"scale\":[").Append(R(n.s.x)).Append(',').Append(R(n.s.y)).Append(',').Append(R(n.s.z)).Append(']');
                    if (n.mesh >= 0) sb.Append(",\"mesh\":").Append(n.mesh);
                    if (n.children.Count > 0) sb.Append(",\"children\":[").Append(string.Join(",", n.children)).Append(']');
                    sb.Append('}');
                }
                sb.Append(']');
                if (meshes.Count > 0)
                {
                    sb.Append(",\"meshes\":[").Append(string.Join(",", meshes)).Append("],\"materials\":[").Append(string.Join(",", materials))
                      .Append("],\"accessors\":[").Append(string.Join(",", accessors)).Append("],\"bufferViews\":[").Append(string.Join(",", views))
                      .Append("],\"buffers\":[{\"byteLength\":").Append(bin.Length).Append("}]");
                }
                sb.Append('}');
                var json = Encoding.UTF8.GetBytes(sb.ToString());
                int jsonPad = (4 - json.Length % 4) % 4;
                using (var w = new BinaryWriter(File.Create(path)))
                {
                    bool hasBin = bin.Length > 0;
                    w.Write(0x46546C67u); w.Write(2u);
                    w.Write((uint)(12 + 8 + json.Length + jsonPad + (hasBin ? 8 + bin.Length : 0)));
                    w.Write((uint)(json.Length + jsonPad)); w.Write(0x4E4F534Au);
                    w.Write(json);
                    for (int i = 0; i < jsonPad; i++) w.Write((byte)0x20);
                    if (hasBin) { w.Write((uint)bin.Length); w.Write(0x004E4942u); w.Write(bin.GetBuffer(), 0, (int)bin.Length); }
                }
            }
        }
    }
}
