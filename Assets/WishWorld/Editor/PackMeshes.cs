using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace WishWorld.EditorTools
{
    /// <summary>
    /// Loads third-party CC0 models that Tools/bake_models.py baked into Assets/ThirdParty/Baked, as MeshBuilders,
    /// so they go through the same mesh, material and prefab path as the generated models.
    /// Switch them off with WISHWORLD_MODELS=generated in .env.
    /// </summary>
    public static class PackMeshes
    {
        public const string Dir = "Assets/ThirdParty/Baked";
        public static bool UsePacks => EnvSync.Read("WISHWORLD_MODELS", "packs").ToLowerInvariant() != "generated";

        public static MeshBuilder Load(string name)
        {
            if (!UsePacks || string.IsNullOrEmpty(name)) return null;
            return LoadFile(Dir + "/" + name + ".bytes");
        }

        /// <summary>Read one baked model file (WWM1: triangle count, positions, then a colour per triangle).</summary>
        public static MeshBuilder LoadFile(string path)
        {
            if (!File.Exists(path)) return null;
            var d = File.ReadAllBytes(path);
            if (d.Length < 8 || d[0] != 'W' || d[1] != 'W' || d[2] != 'M' || d[3] != '1') return null;
            int tris = System.BitConverter.ToInt32(d, 4);
            var v = new List<Vector3>(tris * 3); var n = new List<Vector3>(tris * 3); var c = new List<Color>(tris * 3); var t = new List<int>(tris * 3);
            int pos = 8, col = 8 + tris * 36;
            for (int i = 0; i < tris; i++)
            {
                Vector3 P(int k) => new Vector3(System.BitConverter.ToSingle(d, pos + k * 12), System.BitConverter.ToSingle(d, pos + k * 12 + 4), System.BitConverter.ToSingle(d, pos + k * 12 + 8));
                Vector3 a = P(0), b = P(1), cc = P(2);
                pos += 36;
                var nn = Vector3.Cross(b - a, cc - a).normalized;
                var colour = new Color(d[col] / 255f, d[col + 1] / 255f, d[col + 2] / 255f, 1f).linear;   // stored as sRGB; meshes hold linear
                colour.a = d[col + 3] > 127 ? 1f : 0f;                                                    // tint mask
                col += 4;
                int s = v.Count;
                v.Add(a); v.Add(b); v.Add(cc);
                for (int k = 0; k < 3; k++) { n.Add(nn); c.Add(colour); t.Add(s + k); }
            }
            return new MeshBuilder().Raw(v, n, c, t);
        }

        /// <summary>
        /// Renders prefabs from Generated/Prefabs whose name contains any of the comma-separated filters onto one
        /// sheet, each scaled to fit its cell with a peach marker on its +Z (front) side. Used to check models.
        /// </summary>
        public static string RenderCatalog(string filters, string outFile, int cols = 6)
        {
            var wanted = filters.Split(',');
            var prefabs = new List<GameObject>();
            foreach (var g in AssetDatabase.FindAssets("t:Prefab", new[] { WishWorldBuilder.Gen + "/Prefabs" }))
            {
                var p = AssetDatabase.LoadAssetAtPath<GameObject>(AssetDatabase.GUIDToAssetPath(g));
                foreach (var f in wanted) if (f.Length > 0 && p.name.Contains(f.Trim())) { prefabs.Add(p); break; }
            }
            prefabs.Sort((a, b) => string.CompareOrdinal(a.name, b.name));
            if (prefabs.Count == 0) return "no prefabs match";

            var origin = new Vector3(2000, 0, 2000);
            var root = new GameObject("__catalog");
            int rows = (prefabs.Count + cols - 1) / cols;
            var names = new System.Text.StringBuilder();
            for (int i = 0; i < prefabs.Count; i++)
            {
                var go = Object.Instantiate(prefabs[i], root.transform);
                var b = new Bounds(go.transform.position, Vector3.zero);
                foreach (var r in go.GetComponentsInChildren<Renderer>()) b.Encapsulate(r.bounds);
                float k = 0.85f / Mathf.Max(b.size.x, b.size.y, b.size.z, 1e-4f);
                var cell = origin + new Vector3((i % cols) * 1.3f, 0, -(i / cols) * 1.5f);
                go.transform.localScale *= k;
                go.transform.position = cell - (b.center - go.transform.position) * k + Vector3.up * (b.extents.y * k);
                var marker = GameObject.CreatePrimitive(PrimitiveType.Cube);
                marker.transform.SetParent(root.transform);
                marker.transform.position = cell + new Vector3(0, 0.02f, 0.6f);
                marker.transform.localScale = new Vector3(0.08f, 0.04f, 0.16f);
                names.Append(i % cols == 0 ? "\n" : " | ").Append(prefabs[i].name.Replace("PLACEHOLDER_", "").Replace("Model_", ""));
            }
            var camGo = new GameObject("__catalogCam");
            var cam = camGo.AddComponent<Camera>();
            cam.orthographic = true;
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = new Color(0.20f, 0.22f, 0.25f);
            cam.allowHDR = false;
            var centre = origin + new Vector3((cols - 1) * 0.65f, 0.4f, -(rows - 1) * 0.75f);
            camGo.transform.position = centre + new Vector3(0.55f, 0.6f, 1f).normalized * 40f;
            camGo.transform.LookAt(centre);
            int w = 1560, h = Mathf.Clamp(Mathf.RoundToInt(w * (rows * 1.5f + 0.4f) / (cols * 1.3f + 0.3f) * 0.82f), 300, 1800);
            cam.aspect = w / (float)h;
            cam.orthographicSize = (cols * 1.3f + 0.3f) / cam.aspect * 0.5f * 1.02f;
            var lightGo = new GameObject("__catalogLight");
            var light = lightGo.AddComponent<Light>();
            light.type = LightType.Directional; light.intensity = 1f;
            lightGo.transform.rotation = Quaternion.Euler(50, -150, 0);
            bool fog = RenderSettings.fog; RenderSettings.fog = false;
            WWEnv.SetAmbient(new Color(0.7f, 0.72f, 0.76f));

            var rt = new RenderTexture(w, h, 24, RenderTextureFormat.ARGB32) { antiAliasing = 4 };
            var request = new UniversalRenderPipeline.SingleCameraRequest { destination = rt };
            RenderPipeline.SubmitRenderRequest(cam, request);
            var prev = RenderTexture.active; RenderTexture.active = rt;
            var tex = new Texture2D(w, h, TextureFormat.RGB24, false);
            tex.ReadPixels(new Rect(0, 0, w, h), 0, 0);
            RenderTexture.active = prev;
            string path = "Logs/verification/models/" + outFile + ".png";
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            File.WriteAllBytes(path, tex.EncodeToPNG());
            RenderSettings.fog = fog;
            Object.DestroyImmediate(tex); rt.Release(); Object.DestroyImmediate(rt);
            Object.DestroyImmediate(root); Object.DestroyImmediate(camGo); Object.DestroyImmediate(lightGo);
            return path + names;
        }
    }
}
