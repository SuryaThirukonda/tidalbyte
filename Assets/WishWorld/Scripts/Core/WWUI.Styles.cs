using System.Collections.Generic;
using UnityEngine;

namespace WishWorld
{
    /// <summary>
    /// The storybook winter look for panels, with no textures: every piece is flat vertex-coloured geometry
    /// on the one UI material. Nearer the viewer is smaller z; text sits at z = -0.004.
    /// </summary>
    public static partial class WWUI
    {
        /// <summary>Collects coloured triangles for one panel mesh.</summary>
        class Geo
        {
            public readonly List<Vector3> v = new List<Vector3>();
            public readonly List<Color> c = new List<Color>();
            public readonly List<int> t = new List<int>();

            int Add(float x, float y, float z, Color col) { v.Add(new Vector3(x, y, z)); c.Add(col.linear); return v.Count - 1; }

            public void Tri(Vector2 a, Vector2 b, Vector2 d, float z, Color ca, Color cb, Color cd)
            {
                int i = Add(a.x, a.y, z, ca); Add(b.x, b.y, z, cb); Add(d.x, d.y, z, cd);
                t.Add(i); t.Add(i + 1); t.Add(i + 2);
            }

            public void Tri(Vector2 a, Vector2 b, Vector2 d, float z, Color col) => Tri(a, b, d, z, col, col, col);

            public void Quad(Vector2 a, Vector2 b, Vector2 d, Vector2 e, float z, Color col)
            {
                Tri(a, b, d, z, col); Tri(a, d, e, z, col);
            }

            public void Line(Vector2 a, Vector2 b, float thickness, float z, Color col)
            {
                var dir = (b - a).normalized;
                var n = new Vector2(-dir.y, dir.x) * thickness * 0.5f;
                var e = dir * thickness * 0.5f;   // square caps so corners meet
                Quad(a - e - n, a - e + n, b + e + n, b + e - n, z, col);
            }

            /// <summary>Rounded rectangle shaded from <paramref name="top"/> to <paramref name="bottom"/>.</summary>
            public void Rounded(float w, float h, float r, float z, Color top, Color bottom, Vector2 offset = default)
            {
                const int seg = 6;
                r = Mathf.Max(0.0005f, Mathf.Min(r, Mathf.Min(w, h) * 0.5f));
                int start = v.Count;
                Add(offset.x, offset.y, z, Color.Lerp(bottom, top, 0.5f));
                float hx = w * 0.5f - r, hy = h * 0.5f - r;
                for (int corner = 0; corner < 4; corner++)
                {
                    float cx = (corner == 0 || corner == 3) ? hx : -hx;
                    float cy = corner < 2 ? hy : -hy;
                    for (int i = 0; i <= seg; i++)
                    {
                        float a = (corner * 90f + i * 90f / seg) * Mathf.Deg2Rad;
                        float y = cy + Mathf.Sin(a) * r;
                        Add(offset.x + cx + Mathf.Cos(a) * r, offset.y + y, z, Color.Lerp(bottom, top, Mathf.InverseLerp(-h * 0.5f, h * 0.5f, y)));
                    }
                }
                int n = v.Count - start - 1;
                for (int i = 0; i < n; i++) { t.Add(start); t.Add(start + 1 + (i + 1) % n); t.Add(start + 1 + i); }
            }

            public void Rounded(float w, float h, float r, float z, Color col, Vector2 offset = default) => Rounded(w, h, r, z, col, col, offset);

            public void Ellipse(Vector2 center, float rx, float ry, float z, Color col, int seg = 10)
            {
                int start = v.Count;
                Add(center.x, center.y, z, col);
                for (int i = 0; i < seg; i++)
                {
                    float a = i * Mathf.PI * 2f / seg;
                    Add(center.x + Mathf.Cos(a) * rx, center.y + Mathf.Sin(a) * ry, z, col);
                }
                for (int i = 0; i < seg; i++) { t.Add(start); t.Add(start + 1 + (i + 1) % seg); t.Add(start + 1 + i); }
            }

            /// <summary>Six arms, each with a pair of small branches.</summary>
            public void Snowflake(Vector2 center, float radius, float z, Color col)
            {
                float th = radius * 0.13f;
                for (int i = 0; i < 6; i++)
                {
                    float a = (i * 60f + 30f) * Mathf.Deg2Rad;
                    var dir = new Vector2(Mathf.Cos(a), Mathf.Sin(a));
                    Line(center, center + dir * radius, th, z, col);
                    var knot = center + dir * radius * 0.58f;
                    for (int s = -1; s <= 1; s += 2)
                    {
                        float b = a + s * 55f * Mathf.Deg2Rad;
                        Line(knot, knot + new Vector2(Mathf.Cos(b), Mathf.Sin(b)) * radius * 0.34f, th, z, col);
                    }
                }
                Ellipse(center, th * 1.2f, th * 1.2f, z, col, 6);
            }

            public Mesh ToMesh(string name)
            {
                var m = new Mesh { name = name };
                m.SetVertices(v);
                m.SetColors(c);
                m.SetTriangles(t, 0);
                m.RecalculateBounds();
                m.hideFlags = HideFlags.DontSave;
                return m;
            }
        }

        static readonly Color SnowWhite = new Color(0.985f, 0.99f, 1f);
        static readonly Color SnowUnder = new Color(0.76f, 0.84f, 0.93f);
        static readonly Color FrostBlue = new Color(0.80f, 0.87f, 0.95f);

        static Mesh StyledMesh(PanelStyle style, float w, float h, float r, float border, Color fill, float tail)
        {
            var theme = WWTheme.I;
            Color slate = theme != null ? theme.slate : Color.black;
            if (style == PanelStyle.Plain) return RoundedRect(w, h, r, border, fill, slate);

            string key = $"{style}|{w:F3}|{h:F3}|{r:F3}|{border:F3}|{ColorUtility.ToHtmlStringRGB(fill)}|{tail:F2}";
            if (meshCache.TryGetValue(key, out var cached) && cached != null) return cached;

            Color ice = theme != null ? theme.ice : new Color(0.56f, 0.69f, 0.83f);
            Color shade = theme != null ? theme.shade : new Color(0.47f, 0.55f, 0.66f);
            var g = new Geo();
            var rng = new System.Random(Mathf.RoundToInt(w * 1000f) * 31 + Mathf.RoundToInt(h * 1000f));
            float Rand(float a, float b) => a + (float)rng.NextDouble() * (b - a);

            switch (style)
            {
                case PanelStyle.Frame:
                {
                    float b = Mathf.Max(border, 0.006f);
                    g.Rounded(w, h, r, 0.004f, shade, new Vector2(0.010f, -0.013f));                      // drop shadow
                    g.Rounded(w, h, r, 0.003f, slate);                                                     // outer line
                    g.Rounded(w - b * 2, h - b * 2, r - b, 0.002f, SnowWhite);                             // white band
                    float i2 = b + 0.009f;
                    g.Rounded(w - i2 * 2, h - i2 * 2, r - i2, 0.001f, ice);                                // thin inner line
                    float i3 = i2 + 0.0028f;
                    g.Rounded(w - i3 * 2, h - i3 * 2, r - i3, -0.0015f, Color.Lerp(fill, Color.white, 0.4f), Color.Lerp(fill, FrostBlue, 0.3f));

                    if (Mathf.Min(w, h) >= 0.3f)                                                           // corner snowflakes
                    {
                        Color flake = Color.Lerp(ice, fill, 0.45f);
                        float inset = i3 + 0.036f, rad = 0.021f;
                        for (int sx = -1; sx <= 1; sx += 2)
                            for (int sy = h >= 0.4f ? -1 : 1; sy <= 1; sy += 2)   // short panels keep their lower corners clear for text
                                g.Snowflake(new Vector2(sx * (w * 0.5f - inset), sy * (h * 0.5f - inset)), sy > 0 ? rad : rad * 0.8f, -0.0022f, flake);
                    }

                    Icicles(g, w, h, r, 0.0025f, ice, Rand);
                    SnowCap(g, w, h, r, Rand);
                    break;
                }
                case PanelStyle.Pill:
                {
                    Color lip = Color.Lerp(slate, fill, 0.42f);
                    g.Rounded(w, h, r, 0.0015f, lip, new Vector2(0, -0.008f));                             // raised edge below
                    g.Rounded(w, h, r, 0f, slate);
                    g.Rounded(w - border * 2, h - border * 2, r - border, -0.0015f, Color.Lerp(fill, Color.white, 0.5f), fill);
                    float sh = Mathf.Min(h * 0.11f, 0.012f);
                    float sw = w - border * 2 - r * 1.3f;
                    if (sw > 0.02f)                                                                        // highlight streak
                        g.Rounded(sw, sh, sh * 0.5f, -0.0021f, Color.Lerp(fill, Color.white, 0.85f), new Vector2(0, h * 0.5f - border - sh * 1.25f));
                    break;
                }
                case PanelStyle.Ribbon:
                {
                    Color dark = Color.Lerp(fill, Color.black, 0.22f), fold = Color.Lerp(fill, Color.black, 0.5f);
                    float drop = h * 0.2f, tailLen = h * 0.62f, notch = h * 0.3f, tuck = 0.03f, lw = 0.005f;
                    for (int s = -1; s <= 1; s += 2)
                    {
                        float x0 = s * (w * 0.5f - tuck), x1 = s * (w * 0.5f + tailLen);
                        float top = h * 0.5f - drop, bot = -h * 0.5f - drop, mid = (top + bot) * 0.5f;
                        var a = new Vector2(x0, top); var b = new Vector2(x1, top); var n = new Vector2(x1 - s * notch, mid);
                        var d = new Vector2(x1, bot); var e = new Vector2(x0, bot);
                        g.Tri(a, b, n, 0.003f, dark); g.Tri(a, n, e, 0.003f, dark); g.Tri(n, d, e, 0.003f, dark);
                        g.Line(a, b, lw, 0.0026f, slate); g.Line(b, n, lw, 0.0026f, slate); g.Line(n, d, lw, 0.0026f, slate); g.Line(d, e, lw, 0.0026f, slate);
                        g.Tri(new Vector2(s * w * 0.5f, -h * 0.5f + 0.002f), new Vector2(x0, -h * 0.5f + 0.002f), new Vector2(x0, bot), 0.002f, fold);
                    }
                    g.Rounded(w, h, r, 0f, slate);
                    g.Rounded(w - border * 2, h - border * 2, Mathf.Max(0.001f, r - border), -0.0015f, Color.Lerp(fill, Color.white, 0.22f), fill);
                    Color stitch = Color.Lerp(fill, Color.white, 0.5f);
                    float sy0 = h * 0.5f - border - 0.008f, sx0 = w * 0.5f - border - 0.012f;
                    for (int s = -1; s <= 1; s += 2)                                                       // stitched edge, dashed
                        for (float x = -sx0; x < sx0 - 0.012f; x += 0.026f)
                            g.Line(new Vector2(x, s * sy0), new Vector2(x + 0.012f, s * sy0), 0.0022f, -0.0021f, stitch);
                    break;
                }
                case PanelStyle.Bubble:
                {
                    float b = Mathf.Max(border, 0.006f);
                    g.Rounded(w, h, r, 0.004f, shade, new Vector2(0.008f, -0.011f));
                    g.Rounded(w, h, r, 0.003f, slate);
                    float tx = w * tail, dir = tail < 0 ? -1f : 1f, by = -h * 0.5f;
                    var p0 = new Vector2(tx - 0.035f, by + b); var p1 = new Vector2(tx + 0.035f, by + b); var tip = new Vector2(tx + dir * 0.06f, by - 0.075f);
                    g.Tri(p0 + new Vector2(-b * 1.3f, 0), p1 + new Vector2(b * 1.3f, 0), tip + new Vector2(dir * b * 0.8f, -b * 1.6f), 0.003f, slate);
                    g.Rounded(w - b * 2, h - b * 2, r - b, -0.0015f, SnowWhite, Color.Lerp(fill, FrostBlue, 0.5f));
                    Color tailFill = Color.Lerp(fill, FrostBlue, 0.5f);
                    g.Tri(p0 + new Vector2(0, 0.004f), p1 + new Vector2(0, 0.004f), tip, -0.0015f, tailFill);
                    float i2 = b + 0.008f;
                    Color line = Color.Lerp(ice, SnowWhite, 0.45f);
                    float lx = w * 0.5f - i2 - r * 0.6f;
                    g.Line(new Vector2(-lx, h * 0.5f - i2), new Vector2(lx, h * 0.5f - i2), 0.0025f, -0.002f, line);
                    break;
                }
            }

            var mesh = g.ToMesh(style + "Panel");
            meshCache[key] = mesh;
            return mesh;
        }

        /// <summary>The plate used behind loose text: a snowy pill with a thin frame.</summary>
        public static Mesh PlateMesh(float w, float h, Color fill)
        {
            string key = $"Plate|{w:F2}|{h:F2}|{ColorUtility.ToHtmlStringRGB(fill)}";
            if (meshCache.TryGetValue(key, out var cached) && cached != null) return cached;
            var theme = WWTheme.I;
            Color slate = theme != null ? theme.slate : Color.black, ice = theme != null ? theme.ice : Color.cyan;
            float r = Mathf.Min(h * 0.42f, 0.09f), b = Mathf.Clamp(h * 0.05f, 0.004f, 0.012f);
            var g = new Geo();
            g.Rounded(w, h, r, 0.003f, theme != null ? theme.shade : Color.gray, new Vector2(b, -b * 1.3f));
            g.Rounded(w, h, r, 0.002f, slate);
            g.Rounded(w - b * 2, h - b * 2, r - b, 0.001f, SnowWhite);
            g.Rounded(w - b * 3.6f, h - b * 3.6f, r - b * 1.8f, 0.0005f, ice);
            g.Rounded(w - b * 4.4f, h - b * 4.4f, r - b * 2.2f, 0f, Color.Lerp(fill, Color.white, 0.55f), Color.Lerp(fill, FrostBlue, 0.65f));
            var mesh = g.ToMesh("Plate");
            meshCache[key] = mesh;
            return mesh;
        }

        /// <summary>Snow lying along the top edge: a white strip with rounded mounds, each with a blue-grey underside.</summary>
        static void SnowCap(Geo g, float w, float h, float r, System.Func<float, float, float> rand)
        {
            float x0 = -w * 0.5f + r * 0.45f, x1 = w * 0.5f - r * 0.45f, y = h * 0.5f;
            if (x1 - x0 < 0.08f) return;
            g.Rounded(x1 - x0, 0.016f, 0.008f, -0.0026f, SnowUnder, new Vector2(0, y - 0.006f));
            g.Rounded(x1 - x0, 0.016f, 0.008f, -0.003f, SnowWhite, new Vector2(0, y - 0.001f));
            float x = x0 + 0.01f;
            while (x < x1 - 0.02f)
            {
                float bw = Mathf.Min(rand(0.05f, 0.10f), x1 - x);
                float ry = rand(0.011f, 0.021f);
                var c = new Vector2(x + bw * 0.5f, y - 0.002f);
                g.Ellipse(c + new Vector2(0, -0.005f), bw * 0.58f, ry, -0.0026f, SnowUnder);
                g.Ellipse(c, bw * 0.58f, ry, -0.003f, SnowWhite);
                x += bw * rand(0.72f, 0.95f);
            }
        }

        /// <summary>Icicles hanging from the bottom edge, in uneven lengths with gaps.</summary>
        static void Icicles(Geo g, float w, float h, float r, float z, Color tipColor, System.Func<float, float, float> rand)
        {
            float x = -w * 0.5f + r * 0.8f, x1 = w * 0.5f - r * 0.8f, y = -h * 0.5f + 0.004f;
            while (x < x1)
            {
                float half = rand(0.006f, 0.011f);
                if (rand(0f, 1f) > 0.3f)
                {
                    float len = rand(0.016f, 0.05f);
                    g.Tri(new Vector2(x - half, y), new Vector2(x + half, y), new Vector2(x + rand(-0.003f, 0.003f), y - len), z, SnowWhite, SnowWhite, tipColor);
                }
                x += half * 2f + rand(0.004f, 0.03f);
            }
        }
    }
}
