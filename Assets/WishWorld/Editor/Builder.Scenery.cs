using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEngine;

namespace WishWorld.EditorTools
{
    /// <summary>
    /// Builds the surroundings of a world or the race track: terrain out to the horizon plus hundreds of props,
    /// merged into a few static meshes (one per compass sector, so what is behind the player is culled).
    /// Props come from the baked CC0 kits in Assets/ThirdParty/Baked/Scenery~ where one fits, and from the
    /// hand-built pieces in SceneryProps otherwise. Nothing here runs in the app: the result is ordinary meshes.
    /// </summary>
    public static partial class WishWorldBuilder
    {
        public const string SceneryFolder = Gen + "/Resources/Scenery";
        public const string KitFolder = "Assets/ThirdParty/Baked/Scenery~";
        public const float FarClip = 800f;

        public static float Smooth(float a, float b, float x) => Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(a, b, x));
        /// <summary>Smooth noise in 0..1 over the ground; scale is the size of its features in metres.</summary>
        public static float N2(float x, float z, float scale, float seed = 0f) => Fbm(new Vector3(x / scale + seed * 13.7f, 0.37f + seed, z / scale - seed * 7.1f)) / 0.9375f;
        /// <summary>Sharp ridges, for mountains.</summary>
        public static float Ridge(float x, float z, float scale, float seed = 0f)
        {
            float s = 0, a = 0.55f, f = 1f / scale;
            for (int o = 0; o < 3; o++)
            {
                float n = Noise(new Vector3(x * f + seed * 5.3f, 1.7f + seed, z * f - seed * 3.9f));
                s += (1f - Mathf.Abs(n * 2f - 1f)) * a;
                f *= 2.1f; a *= 0.5f;
            }
            return s;
        }

        // Recolours work on the linear colours stored in the builders.
        public static Func<Color, Color> Shade(float mul) => c => new Color(c.r * mul, c.g * mul, c.b * mul, c.a);
        public static Func<Color, Color> Mix(Color srgb, float t) { var l = srgb.linear; return c => { var o = Color.Lerp(c, l, t); o.a = c.a; return o; }; }
        /// <summary>Shift hue (0..1 turns), scale saturation and brightness.</summary>
        public static Func<Color, Color> Hue(float shift, float sat = 1f, float val = 1f) => c =>
        {
            Color.RGBToHSV(c.gamma, out float h, out float s, out float v);
            var o = Color.HSVToRGB(Mathf.Repeat(h + shift, 1f), Mathf.Clamp01(s * sat), Mathf.Clamp01(v * val)).linear;
            o.a = c.a; return o;
        };
        /// <summary>Recolour only the greens (leaves), leaving trunks and rocks alone.</summary>
        public static Func<Color, Color> Leaves(Color srgb, float t = 1f)
        {
            var l = srgb.linear;
            return c => (c.g > c.r * 1.08f && c.g > c.b * 1.08f) ? new Color(Mathf.Lerp(c.r, l.r, t), Mathf.Lerp(c.g, l.g, t), Mathf.Lerp(c.b, l.b, t), c.a) : c;
        }

        /// <summary>
        /// The Nature kit is drawn in a toy palette (teal leaves, orange wood, pale blue stone). For surroundings meant
        /// to look like the real place, map those few colours to natural ones: leaf green, bark brown, grey stone.
        /// </summary>
        public static Color NaturalPalette(Color c)
        {
            Color.RGBToHSV(c.gamma, out float h, out float s, out float v);
            Color o;
            if (h > 0.40f && h < 0.57f && s > 0.6f) o = Color.HSVToRGB(0.29f + (h - 0.47f) * 0.4f, 0.60f, v * 0.70f);              // leaves
            else if (h > 0.02f && h < 0.085f && s > 0.45f && s < 0.75f && v > 0.7f) o = Color.HSVToRGB(0.07f, 0.46f, v * 0.48f);  // bark, dirt
            else if (h > 0.48f && h < 0.58f && s < 0.3f && s > 0.1f) o = Color.HSVToRGB(0.60f, 0.05f, v * 0.68f);                 // stone
            else return c;
            o = o.linear; o.a = c.a;
            return o;
        }

        /// <summary>The newer textured kits have blue-green leaves; turn them toward a natural green and leave the rest.</summary>
        public static Color GreenerLeaves(Color c)
        {
            Color.RGBToHSV(c.gamma, out float h, out float s, out float v);
            if (!(h > 0.37f && h < 0.50f && s >= 0.45f)) return c;
            var o = Color.HSVToRGB(0.31f + (h - 0.43f) * 0.3f, s * 0.95f, v * 0.95f).linear; o.a = c.a;
            return o;
        }

        public class Scenery
        {
            public const int Sectors = 8;
            readonly MeshBuilder[] parts = new MeshBuilder[Sectors];
            readonly System.Random rng;
            static readonly Dictionary<string, MeshBuilder> models = new Dictionary<string, MeshBuilder>();

            /// <summary>Ground height at a point. Props are stood on it.</summary>
            public Func<float, float, float> Height = (x, z) => 0f;
            /// <summary>Centre the sectors are cut around (the player, or the middle of the race track).</summary>
            public Vector2 Center;
            public int Props { get; private set; }

            public Scenery(int seed)
            {
                rng = new System.Random(seed);
                for (int i = 0; i < Sectors; i++) parts[i] = new MeshBuilder();
            }

            public float R(float a, float b) => a + (float)rng.NextDouble() * (b - a);
            public int RI(int n) => rng.Next(n);
            public T Pick<T>(params T[] items) => items[rng.Next(items.Length)];
            public bool Chance(float p) => rng.NextDouble() < p;
            public float H(float x, float z) => Height(x, z);

            public int Triangles { get { int t = 0; foreach (var p in parts) t += p.TriangleCount; return t; } }

            /// <summary>The mesh for the compass sector that holds this point. Add hand-made geometry straight into it.</summary>
            public MeshBuilder At(float x, float z)
            {
                float a = Mathf.Atan2(z - Center.y, x - Center.x) / (Mathf.PI * 2f);
                return parts[Mathf.Clamp(Mathf.FloorToInt(Mathf.Repeat(a, 1f) * Sectors), 0, Sectors - 1)];
            }

            /// <summary>A baked kit model, for example "nature/tree_oak". Null if packs are switched off or the file is missing.</summary>
            public static MeshBuilder Model(string name)
            {
                if (!PackMeshes.UsePacks || string.IsNullOrEmpty(name)) return null;
                if (models.TryGetValue(name, out var m)) return m;
                m = PackMeshes.LoadFile(KitFolder + "/" + name + ".bytes");
                if (m == null) Debug.LogWarning("[WishWorld] Scenery model not found: " + name);
                else if (name.StartsWith("nature/")) m.Recolor(NaturalPalette);
                else if (name.StartsWith("pirate/") || name.StartsWith("town/") || name.StartsWith("holiday/") || name.StartsWith("survival/")) m.Recolor(GreenerLeaves);
                models[name] = m;
                return m;
            }

            /// <summary>Stand a kit model on the ground, scaled to a height in metres (or to a width with byWidth).</summary>
            public bool Put(string name, float x, float z, float height, float yaw = float.NaN, float sink = 0.03f,
                Func<Color, Color> recolor = null, float y = float.NaN, bool byWidth = false, Vector3? tilt = null, float stretch = 1f)
            {
                var m = Model(name);
                if (m == null) return false;
                var b = m.Bounds;
                float reference = byWidth ? Mathf.Max(b.size.x, b.size.z) : b.size.y;
                float s = reference > 1e-4f ? height / reference : 1f;
                return PutMesh(m, x, z, s, yaw, sink * height, recolor, y, tilt, stretch);
            }

            /// <summary>Stand any builder (a hand-made prop, already in metres) on the ground.</summary>
            public bool PutMesh(MeshBuilder m, float x, float z, float scale = 1f, float yaw = float.NaN, float sink = 0f,
                Func<Color, Color> recolor = null, float y = float.NaN, Vector3? tilt = null, float stretch = 1f)
            {
                if (m == null) return false;
                if (float.IsNaN(yaw)) yaw = R(0f, 360f);
                if (float.IsNaN(y)) y = Height(x, z);
                var rot = Quaternion.Euler(0, yaw, 0) * (tilt.HasValue ? Quaternion.Euler(tilt.Value) : Quaternion.identity);
                At(x, z).Append(m, new Vector3(x, y - sink, z), rot, new Vector3(scale, scale * stretch, scale), recolor);
                Props++;
                return true;
            }

            /// <summary>
            /// Scatter kit models between two distances from the centre. bias above 1 crowds them toward the inner edge.
            /// ok(x, z) can veto a spot (water, the track, a clearing); spacing keeps them apart.
            /// </summary>
            public int Scatter(string[] names, int count, float rMin, float rMax, float hMin, float hMax, Func<float, float, bool> ok = null,
                float bias = 1f, Func<Color, Color> recolor = null, float sink = 0.04f, float spacing = 0f, Func<Func<Color, Color>> recolorEach = null)
            {
                var placed = new List<Vector2>();
                int done = 0;
                for (int tries = 0; tries < count * 6 && done < count; tries++)
                {
                    float u = Mathf.Pow(R(0f, 1f), bias);
                    float r = Mathf.Sqrt(Mathf.Lerp(rMin * rMin, rMax * rMax, u)), a = R(0f, Mathf.PI * 2f);
                    float x = Center.x + Mathf.Cos(a) * r, z = Center.y + Mathf.Sin(a) * r;
                    if (ok != null && !ok(x, z)) continue;
                    if (spacing > 0f)
                    {
                        bool close = false;
                        foreach (var p in placed) if ((p.x - x) * (p.x - x) + (p.y - z) * (p.y - z) < spacing * spacing) { close = true; break; }
                        if (close) continue;
                        placed.Add(new Vector2(x, z));
                    }
                    if (Put(names[rng.Next(names.Length)], x, z, R(hMin, hMax), float.NaN, sink, recolorEach != null ? recolorEach() : recolor)) done++;
                }
                return done;
            }

            /// <summary>Scatter hand-made props (each call of make() builds one, in metres).</summary>
            public int ScatterMade(Func<MeshBuilder> make, int count, float rMin, float rMax, float sMin = 1f, float sMax = 1f,
                Func<float, float, bool> ok = null, float bias = 1f, float spacing = 0f, float sink = 0f)
            {
                var placed = new List<Vector2>();
                int done = 0;
                for (int tries = 0; tries < count * 6 && done < count; tries++)
                {
                    float u = Mathf.Pow(R(0f, 1f), bias);
                    float r = Mathf.Sqrt(Mathf.Lerp(rMin * rMin, rMax * rMax, u)), a = R(0f, Mathf.PI * 2f);
                    float x = Center.x + Mathf.Cos(a) * r, z = Center.y + Mathf.Sin(a) * r;
                    if (ok != null && !ok(x, z)) continue;
                    if (spacing > 0f)
                    {
                        bool close = false;
                        foreach (var p in placed) if ((p.x - x) * (p.x - x) + (p.y - z) * (p.y - z) < spacing * spacing) { close = true; break; }
                        if (close) continue;
                        placed.Add(new Vector2(x, z));
                    }
                    if (PutMesh(make(), x, z, R(sMin, sMax), float.NaN, sink)) done++;
                }
                return done;
            }

            /// <summary>
            /// The ground: a web of triangles around the centre, fine near the player and coarse far away, following
            /// Height. Every triangle gets one colour from color(centre of triangle, its normal), which gives the
            /// faceted low-poly look.
            /// </summary>
            public void Terrain(float radius, int rings, int segs, Func<Vector3, Vector3, Color> color, float power = 1.75f, float yOffset = 0f, bool ceiling = false)
            {
                var grid = new Vector3[rings + 1, segs];
                for (int i = 1; i <= rings; i++)
                {
                    float r0 = radius * Mathf.Pow((i - 1) / (float)rings, power), r1 = radius * Mathf.Pow(i / (float)rings, power);
                    for (int j = 0; j < segs; j++)
                    {
                        // nudge every point so the web does not read as rings and spokes
                        float jr = i == rings ? 0f : (Hash(i * 1.37f, j * 2.11f, 0.5f) - 0.5f) * (r1 - r0) * 0.55f;
                        float ja = (Hash(i * 3.71f, j * 1.13f, 1.5f) - 0.5f) * 0.6f + (i % 2) * 0.5f;
                        float a = (j + ja) / segs * Mathf.PI * 2f, r = r1 + jr;
                        float x = Center.x + Mathf.Cos(a) * r, z = Center.y + Mathf.Sin(a) * r;
                        grid[i, j] = new Vector3(x, Height(x, z) + yOffset, z);
                    }
                }
                var c0 = new Vector3(Center.x, Height(Center.x, Center.y) + yOffset, Center.y);
                void Tri(Vector3 a, Vector3 b, Vector3 c)
                {
                    var n = Vector3.Cross(b - a, c - a).normalized;
                    if ((n.y < 0) != ceiling) { var t = b; b = c; c = t; n = -n; }   // face up, or down for a ceiling seen from below
                    var mid = (a + b + c) / 3f;
                    At(mid.x, mid.z).Tri(a, b, c, color(mid, n));
                }
                for (int j = 0; j < segs; j++) Tri(c0, grid[1, (j + 1) % segs], grid[1, j]);
                for (int i = 1; i < rings; i++)
                    for (int j = 0; j < segs; j++)
                    {
                        int k = (j + 1) % segs;
                        Vector3 a = grid[i, j], b = grid[i, k], c = grid[i + 1, j], d = grid[i + 1, k];
                        if ((i + j) % 2 == 0) { Tri(a, c, b); Tri(b, c, d); } else { Tri(a, c, d); Tri(a, d, b); }
                    }
            }

            /// <summary>A flat patch (water, ice, a path) lying on the ground: a fan of triangles around a wobbly outline.</summary>
            public void Patch(float x, float z, float radius, float y, Color color, int seg = 14, float wobble = 0.18f, float squash = 1f, float yaw = 0f)
            {
                var pts = new Vector3[seg];
                float cy = Mathf.Cos(yaw * Mathf.Deg2Rad), sy = Mathf.Sin(yaw * Mathf.Deg2Rad);
                for (int i = 0; i < seg; i++)
                {
                    float a = i / (float)seg * Mathf.PI * 2f, r = radius * (1f + (Hash(x + i, z, 7f) - 0.5f) * 2f * wobble);
                    float px = Mathf.Cos(a) * r, pz = Mathf.Sin(a) * r * squash;
                    pts[i] = new Vector3(x + px * cy - pz * sy, y, z + px * sy + pz * cy);
                }
                var mb = At(x, z);
                var c = new Vector3(x, y, z);
                for (int i = 0; i < seg; i++) mb.Tri(c, pts[(i + 1) % seg], pts[i], color);
            }

            /// <summary>A ribbon along a path (river, road, lava), at a fixed height above the ground it follows.</summary>
            public void Ribbon(IList<Vector2> path, float width, float lift, Color color, Color? edge = null, float fixedY = float.NaN)
            {
                for (int i = 0; i < path.Count - 1; i++)
                {
                    Vector2 p = path[i], q = path[i + 1];
                    Vector2 dp = (path[Mathf.Min(i + 1, path.Count - 1)] - path[Mathf.Max(i - 1, 0)]).normalized;
                    Vector2 dq = (path[Mathf.Min(i + 2, path.Count - 1)] - path[i]).normalized;
                    var np = new Vector2(-dp.y, dp.x) * width * 0.5f; var nq = new Vector2(-dq.y, dq.x) * width * 0.5f;
                    Vector3 P(Vector2 v, float extra = 0f) => new Vector3(v.x, (float.IsNaN(fixedY) ? Height(v.x, v.y) : fixedY) + lift + extra, v.y);
                    var mb = At(p.x, p.y);
                    Color c = edge.HasValue && i % 2 == 1 ? Color.Lerp(color, edge.Value, 0.25f) : color;
                    mb.Quad(P(p - np), P(q - nq), P(q + nq), P(p + np), c);
                    if (edge.HasValue)
                    {
                        mb.Quad(P(p - np * 1.35f, -0.03f), P(q - nq * 1.35f, -0.03f), P(q - nq), P(p - np), edge.Value);
                        mb.Quad(P(p + np), P(q + nq), P(q + nq * 1.35f, -0.03f), P(p + np * 1.35f, -0.03f), edge.Value);
                    }
                }
            }

            /// <summary>Save as a prefab of static meshes. Returns the prefab asset.</summary>
            public GameObject Save(string id)
            {
                EnsureFolder(SceneryFolder);
                var root = new GameObject("Scenery_" + id);
                int tris = 0, verts = 0;
                for (int i = 0; i < Sectors; i++)
                {
                    // Each sector's mesh asset is filled in place, so the same asset serves every rebuild.
                    string meshPath = Gen + "/Meshes/Scenery_" + id + "_" + i + ".asset";
                    var existing = AssetDatabase.LoadAssetAtPath<Mesh>(meshPath);
                    var mesh = parts[i].BuildWelded("Scenery_" + id + "_" + i, existing);
                    if (existing == null) AssetDatabase.CreateAsset(mesh, meshPath); else EditorUtility.SetDirty(mesh);
                    if (mesh.vertexCount == 0) continue;
                    tris += (int)mesh.GetIndexCount(0) / 3; verts += mesh.vertexCount;
                    var go = MeshObject("Sector" + i, mesh, root.transform);
                    go.isStatic = true;
                }
                string path = SceneryFolder + "/" + id + ".prefab";
                var prefab = PrefabUtility.SaveAsPrefabAsset(root, path);
                UnityEngine.Object.DestroyImmediate(root);
                Debug.Log($"[WishWorld] Scenery '{id}': {Props} props, {tris} triangles, {verts} vertices.");
                return prefab;
            }
        }

        /// <summary>Winding path through points, smoothed, for rivers and roads.</summary>
        public static List<Vector2> Spline(int steps, params Vector2[] ctrl)
        {
            var list = new List<Vector2>();
            int n = ctrl.Length;
            for (int i = 0; i < n - 1; i++)
                for (int k = 0; k < steps; k++)
                {
                    Vector3 P(int j) { var c = ctrl[Mathf.Clamp(j, 0, n - 1)]; return new Vector3(c.x, 0, c.y); }
                    var v = CatmullRom(P(i - 1), P(i), P(i + 1), P(i + 2), k / (float)steps);
                    list.Add(new Vector2(v.x, v.z));
                }
            list.Add(ctrl[n - 1]);
            return list;
        }

        public static float DistanceToPath(IList<Vector2> path, float x, float z)
        {
            float best = float.MaxValue; var p = new Vector2(x, z);
            for (int i = 0; i < path.Count - 1; i++)
            {
                Vector2 a = path[i], b = path[i + 1], ab = b - a;
                float t = Mathf.Clamp01(Vector2.Dot(p - a, ab) / Mathf.Max(1e-6f, ab.sqrMagnitude));
                float d = (a + ab * t - p).sqrMagnitude;
                if (d < best) best = d;
            }
            return Mathf.Sqrt(best);
        }
    }
}
