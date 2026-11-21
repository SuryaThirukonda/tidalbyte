using System.Collections.Generic;
using System.IO;
using System.Text;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace WishWorld.EditorTools
{
    /// <summary>
    /// Checks the touch reactions (CreatureReaction) without a headset: every creature is drawn twice, at rest and at
    /// the biggest moment of its reaction, side by side on one sheet in Logs/verification/reactions/. Also reports
    /// how many parts each creature was cut into, so a part box that caught nothing shows up as a 0.
    /// Run from the menu WishWorld/Check Reactions, or: unity command script eval -- --code
    /// 'return WishWorld.EditorTools.ReactionSheet.Render("");'
    /// </summary>
    public static class ReactionSheet
    {
        static int Cell = 200;
        const int PairsPerRow = 6;

        [MenuItem("WishWorld/Check Reactions")]
        static void Menu() => Debug.Log(Render(""));

        /// <summary>Render the sheet. <paramref name="filter"/>: comma-separated creature ids, or empty for all.</summary>
        public static string Render(string filter, int cell = 200)
        {
            Cell = cell;
            var wanted = new HashSet<string>();
            foreach (var f in (filter ?? "").Split(',')) if (f.Trim().Length > 0) wanted.Add(f.Trim());

            var defs = new List<CreatureDefinition>();
            foreach (var g in AssetDatabase.FindAssets("t:CreatureDefinition"))
            {
                var d = AssetDatabase.LoadAssetAtPath<CreatureDefinition>(AssetDatabase.GUIDToAssetPath(g));
                if (d != null && d.prefab != null && (wanted.Count == 0 || wanted.Contains(d.id))) defs.Add(d);
            }
            defs.Sort((a, b) => string.CompareOrdinal(a.id, b.id));
            if (defs.Count == 0) return "no creatures match";

            int rows = (defs.Count + PairsPerRow - 1) / PairsPerRow;
            int W = PairsPerRow * 2 * Cell, H = rows * Cell;
            var sheet = new Texture2D(W, H, TextureFormat.RGB24, false);
            var fill = new Color[W * H];
            for (int i = 0; i < fill.Length; i++) fill[i] = new Color(0.16f, 0.17f, 0.2f);
            sheet.SetPixels(fill);

            var camGo = new GameObject("__reactionCam");
            var cam = camGo.AddComponent<Camera>();
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.allowHDR = false;
            cam.fieldOfView = 30f;
            cam.nearClipPlane = 0.01f; cam.farClipPlane = 500f;
            var lightGo = new GameObject("__reactionLight");
            var light = lightGo.AddComponent<Light>();
            light.type = LightType.Directional; light.intensity = 1.1f;
            lightGo.transform.rotation = Quaternion.Euler(45, -120, 0);
            bool fog = RenderSettings.fog; RenderSettings.fog = false;
            WWEnv.SetAmbient(new Color(0.7f, 0.72f, 0.76f));
            var rt = new RenderTexture(Cell, Cell, 24, RenderTextureFormat.ARGB32) { antiAliasing = 4 };
            var origin = new Vector3(3000, 0, 3000);

            var report = new StringBuilder();
            for (int i = 0; i < defs.Count; i++)
            {
                var def = defs[i];
                var go = Object.Instantiate(def.prefab);
                go.transform.position = origin;
                go.transform.rotation = Quaternion.identity;
                var c = go.GetComponent<Creature>();
                if (c == null) c = go.AddComponent<Creature>();
                c.def = def;
                var rx = CreatureReaction.For(c);

                // Find the biggest moment by sampling the whole reaction.
                float best = 0f, bestAmount = -1f, dur = rx.Duration;
                for (int k = 1; k < 60; k++)
                {
                    float t = dur * k / 60f;
                    rx.PoseAt(t);
                    float a = rx.PoseAmount();
                    if (a > bestAmount) { bestAmount = a; best = t; }
                }

                // Frame on the rest pose, with room for parts that swing out.
                rx.PoseAt(-1f);
                var b = new Bounds(go.transform.position, Vector3.zero); bool any = false;
                foreach (var r in go.GetComponentsInChildren<Renderer>()) if (r.enabled) { if (!any) { b = r.bounds; any = true; } else b.Encapsulate(r.bounds); }
                float radius = b.extents.magnitude * 1.5f;
                var dir = new Vector3(1f, 0.45f, 0.75f).normalized;
                camGo.transform.position = b.center + dir * radius / Mathf.Tan(cam.fieldOfView * 0.5f * Mathf.Deg2Rad);
                camGo.transform.LookAt(b.center);

                int col = (i % PairsPerRow) * 2, row = rows - 1 - i / PairsPerRow;
                cam.backgroundColor = new Color(0.24f, 0.26f, 0.30f);
                Shoot(cam, rt, sheet, col * Cell, row * Cell);
                rx.PoseAt(best);
                cam.backgroundColor = new Color(0.30f, 0.26f, 0.22f);
                Shoot(cam, rt, sheet, (col + 1) * Cell, row * Cell);

                report.Append('\n').Append(def.id).Append(": ").Append(rx.ReactionName).Append(", ").Append(rx.PartCount)
                      .Append(" parts, peak at ").Append(best.ToString("0.00")).Append("s of ").Append(dur.ToString("0.0")).Append('s');
                Object.DestroyImmediate(go);
            }

            sheet.Apply();
            string path = "Logs/verification/reactions/" + (wanted.Count == 0 ? "all" : string.Join("_", wanted)) + ".png";
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            File.WriteAllBytes(path, sheet.EncodeToPNG());
            RenderSettings.fog = fog;
            Object.DestroyImmediate(sheet); rt.Release(); Object.DestroyImmediate(rt);
            Object.DestroyImmediate(camGo); Object.DestroyImmediate(lightGo);
            return path + "  (each pair: rest, then the biggest moment; rows read left to right, alphabetical)" + report;
        }

        static void Shoot(Camera cam, RenderTexture rt, Texture2D sheet, int x, int y)
        {
            cam.aspect = 1f;
            var request = new UniversalRenderPipeline.SingleCameraRequest { destination = rt };
            RenderPipeline.SubmitRenderRequest(cam, request);
            var prev = RenderTexture.active; RenderTexture.active = rt;
            sheet.ReadPixels(new Rect(0, 0, rt.width, rt.height), x, y);
            RenderTexture.active = prev;
        }
    }
}
