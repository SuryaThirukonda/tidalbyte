using System.Collections.Generic;
using UnityEngine;

namespace WishWorld.EditorTools
{
    /// <summary>
    /// Builds one low-poly mesh out of coloured primitives. Colour goes in the vertex colours so every
    /// placeholder shares one material. Vertex alpha 1 marks "body" parts that a colour command may tint.
    /// Sizes are full extents in metres; +Z is the creature's forward.
    /// </summary>
    public class MeshBuilder
    {
        readonly List<Vector3> verts = new List<Vector3>();
        readonly List<Vector3> normals = new List<Vector3>();
        readonly List<Color> colors = new List<Color>();
        readonly List<int> tris = new List<int>();

        public int TriangleCount => tris.Count / 3;

        void Add(List<Vector3> v, List<Vector3> n, List<int> t, Vector3 pos, Vector3 size, Vector3 euler, Color color, bool body)
        {
            var rot = Quaternion.Euler(euler);
            int start = verts.Count;
            color = color.linear;          // vertex colours are not gamma-converted by Unity; the project renders in linear space
            color.a = body ? 1f : 0f;
            var inv = new Vector3(1f / Mathf.Max(1e-5f, size.x), 1f / Mathf.Max(1e-5f, size.y), 1f / Mathf.Max(1e-5f, size.z));
            for (int i = 0; i < v.Count; i++)
            {
                verts.Add(pos + rot * Vector3.Scale(v[i], size));
                normals.Add((rot * Vector3.Scale(n[i], inv)).normalized);
                colors.Add(color);
            }
            foreach (int i in t) tris.Add(start + i);
        }

        public MeshBuilder Sphere(Vector3 pos, Vector3 size, Color color, bool body = true, Vector3 euler = default, int seg = 7)
        {
            var v = new List<Vector3>(); var n = new List<Vector3>(); var t = new List<int>();
            int rings = Mathf.Max(3, seg * 2 / 3);
            for (int r = 0; r <= rings; r++)
            {
                float phi = Mathf.PI * r / rings;
                for (int s = 0; s <= seg; s++)
                {
                    float th = 2 * Mathf.PI * s / seg;
                    var d = new Vector3(Mathf.Sin(phi) * Mathf.Cos(th), Mathf.Cos(phi), Mathf.Sin(phi) * Mathf.Sin(th));
                    v.Add(d * 0.5f); n.Add(d);
                }
            }
            Grid(t, rings, seg);
            Add(v, n, t, pos, size, euler, color, body);
            return this;
        }

        /// <summary>Dome: flat side down (-Y), with a cap in capColor.</summary>
        public MeshBuilder Hemisphere(Vector3 pos, Vector3 size, Color color, Color capColor, bool body = true, Vector3 euler = default, int seg = 10)
        {
            var v = new List<Vector3>(); var n = new List<Vector3>(); var t = new List<int>();
            int rings = Mathf.Max(2, seg / 3);
            for (int r = 0; r <= rings; r++)
            {
                float phi = Mathf.PI * 0.5f * r / rings;
                for (int s = 0; s <= seg; s++)
                {
                    float th = 2 * Mathf.PI * s / seg;
                    var d = new Vector3(Mathf.Sin(phi) * Mathf.Cos(th), Mathf.Cos(phi), Mathf.Sin(phi) * Mathf.Sin(th));
                    v.Add(d * 0.5f); n.Add(d);
                }
            }
            Grid(t, rings, seg);
            Add(v, n, t, pos, size, euler, color, body);
            // Flat cap, facing down in the dome's own space, so it follows any rotation.
            var cv = new List<Vector3>(); var cn = new List<Vector3>(); var ct = new List<int>();
            cv.Add(Vector3.zero); cn.Add(Vector3.down);
            for (int s = 0; s <= seg; s++) { float th = 2 * Mathf.PI * s / seg; cv.Add(new Vector3(Mathf.Cos(th) * 0.5f, 0, Mathf.Sin(th) * 0.5f)); cn.Add(Vector3.down); }
            for (int s = 0; s < seg; s++) { ct.Add(0); ct.Add(1 + s); ct.Add(2 + s); }
            Add(cv, cn, ct, pos, size, euler, capColor, false);
            return this;
        }

        static void Grid(List<int> t, int rings, int seg)
        {
            for (int r = 0; r < rings; r++)
                for (int s = 0; s < seg; s++)
                {
                    int a = r * (seg + 1) + s, b = a + seg + 1;
                    t.Add(a); t.Add(a + 1); t.Add(b);
                    t.Add(a + 1); t.Add(b + 1); t.Add(b);
                }
        }

        public MeshBuilder Cube(Vector3 pos, Vector3 size, Color color, bool body = true, Vector3 euler = default)
        {
            var v = new List<Vector3>(); var n = new List<Vector3>(); var t = new List<int>();
            Vector3[] dirs = { Vector3.up, Vector3.down, Vector3.left, Vector3.right, Vector3.forward, Vector3.back };
            foreach (var d in dirs)
            {
                var a = Mathf.Abs(d.y) > 0.5f ? Vector3.right : Vector3.up;
                var b = Vector3.Cross(d, a);
                int s = v.Count;
                v.Add((d - a - b) * 0.5f); v.Add((d + a - b) * 0.5f); v.Add((d + a + b) * 0.5f); v.Add((d - a + b) * 0.5f);
                for (int i = 0; i < 4; i++) n.Add(d);
                t.Add(s); t.Add(s + 1); t.Add(s + 2); t.Add(s); t.Add(s + 2); t.Add(s + 3);
            }
            Add(v, n, t, pos, size, euler, color, body);
            return this;
        }

        /// <summary>
        /// Box whose top face is scaled (topX, topZ) relative to its base: the building block of the blocky retro look.
        /// 1,1 is a plain box; smaller values taper it; 0 on one axis makes a wedge (roof shape).
        /// </summary>
        public MeshBuilder TaperBox(Vector3 pos, Vector3 size, Color color, bool body = true, Vector3 euler = default, float topX = 1f, float topZ = 1f)
        {
            var v = new List<Vector3>(); var n = new List<Vector3>(); var t = new List<int>();
            Vector3 P(float x, float y, float z) => new Vector3(x * 0.5f * (y > 0 ? topX : 1f), y * 0.5f, z * 0.5f * (y > 0 ? topZ : 1f));
            void Face(Vector3 a, Vector3 b, Vector3 c, Vector3 d)
            {
                var nn = Vector3.Cross(b - a, c - a); if (nn.sqrMagnitude < 1e-10f) nn = Vector3.Cross(c - a, d - a);
                nn = nn.sqrMagnitude < 1e-10f ? Vector3.up : nn.normalized;
                int s0 = v.Count; v.Add(a); v.Add(b); v.Add(c); v.Add(d);
                for (int i = 0; i < 4; i++) n.Add(nn);
                t.Add(s0); t.Add(s0 + 1); t.Add(s0 + 2); t.Add(s0); t.Add(s0 + 2); t.Add(s0 + 3);
            }
            Face(P(-1, 1, -1), P(-1, 1, 1), P(1, 1, 1), P(1, 1, -1));       // top
            Face(P(-1, -1, 1), P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1));   // bottom
            Face(P(-1, -1, -1), P(-1, 1, -1), P(1, 1, -1), P(1, -1, -1));   // back (-Z)
            Face(P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1), P(-1, -1, 1));       // front (+Z)
            Face(P(-1, -1, 1), P(-1, 1, 1), P(-1, 1, -1), P(-1, -1, -1));   // left
            Face(P(1, -1, -1), P(1, 1, -1), P(1, 1, 1), P(1, -1, 1));       // right
            Add(v, n, t, pos, size, euler, color, body);
            return this;
        }

        /// <summary>Copy another builder's geometry in, moved, turned about Y and scaled (used to place props into one mesh).</summary>
        public MeshBuilder Append(MeshBuilder other, Vector3 pos, float yaw = 0f, float scale = 1f)
        {
            if (other == null) return this;
            var rot = Quaternion.Euler(0, yaw, 0);
            int start = verts.Count;
            for (int i = 0; i < other.verts.Count; i++)
            {
                verts.Add(pos + rot * (other.verts[i] * scale));
                normals.Add(rot * other.normals[i]);
                colors.Add(other.colors[i]);
            }
            foreach (int i in other.tris) tris.Add(start + i);
            return this;
        }

        /// <summary>Cylinder along Y. topScale 0 makes a cone, between 0 and 1 a taper.</summary>
        public MeshBuilder Cylinder(Vector3 pos, Vector3 size, Color color, bool body = true, Vector3 euler = default, float topScale = 1f, int seg = 6)
        {
            var v = new List<Vector3>(); var n = new List<Vector3>(); var t = new List<int>();
            for (int s = 0; s <= seg; s++)
            {
                float th = 2 * Mathf.PI * s / seg;
                var d = new Vector3(Mathf.Cos(th), 0, Mathf.Sin(th));
                var slope = new Vector3(d.x, (1f - topScale) * 0.5f, d.z).normalized;
                v.Add(new Vector3(d.x * 0.5f, -0.5f, d.z * 0.5f)); n.Add(slope);
                v.Add(new Vector3(d.x * 0.5f * topScale, 0.5f, d.z * 0.5f * topScale)); n.Add(slope);
            }
            for (int s = 0; s < seg; s++)
            {
                int a = s * 2;
                t.Add(a); t.Add(a + 1); t.Add(a + 2);
                t.Add(a + 1); t.Add(a + 3); t.Add(a + 2);
            }
            // caps
            int c0 = v.Count; v.Add(new Vector3(0, -0.5f, 0)); n.Add(Vector3.down);
            for (int s = 0; s <= seg; s++) { float th = 2 * Mathf.PI * s / seg; v.Add(new Vector3(Mathf.Cos(th) * 0.5f, -0.5f, Mathf.Sin(th) * 0.5f)); n.Add(Vector3.down); }
            for (int s = 0; s < seg; s++) { t.Add(c0); t.Add(c0 + 1 + s); t.Add(c0 + 2 + s); }
            if (topScale > 0.01f)
            {
                int c1 = v.Count; v.Add(new Vector3(0, 0.5f, 0)); n.Add(Vector3.up);
                for (int s = 0; s <= seg; s++) { float th = 2 * Mathf.PI * s / seg; v.Add(new Vector3(Mathf.Cos(th) * 0.5f * topScale, 0.5f, Mathf.Sin(th) * 0.5f * topScale)); n.Add(Vector3.up); }
                for (int s = 0; s < seg; s++) { t.Add(c1); t.Add(c1 + 2 + s); t.Add(c1 + 1 + s); }
            }
            Add(v, n, t, pos, size, euler, color, body);
            return this;
        }

        public MeshBuilder Cone(Vector3 pos, Vector3 size, Color color, bool body = true, Vector3 euler = default, int seg = 6)
            => Cylinder(pos, size, color, body, euler, 0f, seg);

        /// <summary>Flat disc facing +Y.</summary>
        public MeshBuilder Disc(Vector3 pos, Vector2 size, Color color, bool body = false, Vector3 euler = default, int seg = 12)
        {
            var v = new List<Vector3>(); var n = new List<Vector3>(); var t = new List<int>();
            v.Add(Vector3.zero); n.Add(Vector3.up);
            for (int s = 0; s <= seg; s++) { float th = 2 * Mathf.PI * s / seg; v.Add(new Vector3(Mathf.Cos(th) * 0.5f, 0, Mathf.Sin(th) * 0.5f)); n.Add(Vector3.up); }
            for (int s = 0; s < seg; s++) { t.Add(0); t.Add(2 + s); t.Add(1 + s); }
            Add(v, n, t, pos, new Vector3(size.x, 1, size.y), euler, color, body);
            return this;
        }

        public int VertexCount => verts.Count;

        public Bounds Bounds
        {
            get
            {
                if (verts.Count == 0) return new Bounds();
                var b = new Bounds(verts[0], Vector3.zero);
                foreach (var v in verts) b.Encapsulate(v);
                return b;
            }
        }

        /// <summary>Copy another builder's geometry in with a full rotation, per-axis scale and an optional recolour (linear colours in and out).</summary>
        public MeshBuilder Append(MeshBuilder other, Vector3 pos, Quaternion rot, Vector3 scale, System.Func<Color, Color> recolor = null)
        {
            if (other == null) return this;
            int start = verts.Count;
            bool flip = scale.x * scale.y * scale.z < 0;
            for (int i = 0; i < other.verts.Count; i++)
            {
                verts.Add(pos + rot * Vector3.Scale(other.verts[i], scale));
                normals.Add(rot * other.normals[i]);
                colors.Add(recolor != null ? recolor(other.colors[i]) : other.colors[i]);
            }
            for (int i = 0; i < other.tris.Count; i += 3)
            {
                tris.Add(start + other.tris[i]);
                tris.Add(start + other.tris[i + (flip ? 2 : 1)]);
                tris.Add(start + other.tris[i + (flip ? 1 : 2)]);
            }
            return this;
        }

        /// <summary>Change every colour in place (linear in, linear out).</summary>
        public MeshBuilder Recolor(System.Func<Color, Color> f)
        {
            for (int i = 0; i < colors.Count; i++) colors[i] = f(colors[i]);
            return this;
        }

        /// <summary>One flat-coloured triangle (colour is sRGB, like the primitives).</summary>
        public MeshBuilder Tri(Vector3 a, Vector3 b, Vector3 c, Color color)
        {
            int s = verts.Count;
            var n = Vector3.Cross(b - a, c - a).normalized;
            color = color.linear; color.a = 0f;
            verts.Add(a); verts.Add(b); verts.Add(c);
            for (int k = 0; k < 3; k++) { normals.Add(n); colors.Add(color); tris.Add(s + k); }
            return this;
        }

        public MeshBuilder Quad(Vector3 a, Vector3 b, Vector3 c, Vector3 d, Color color) => Tri(a, b, c, color).Tri(a, c, d, color);

        /// <summary>
        /// For large static scenery: vertices that share a position and colour are merged and normals are left out.
        /// The lit shader builds its own facet normals, so nothing is lost and the mesh is a fraction of the size.
        /// </summary>
        public Mesh BuildWelded(string name, Mesh into = null)
        {
            var map = new Dictionary<(int, int, int, int), int>(verts.Count);
            var v = new List<Vector3>(verts.Count / 2); var c = new List<Color>(verts.Count / 2); var t = new List<int>(tris.Count);
            int Key(float f) => Mathf.RoundToInt(f * 500f);
            for (int i = 0; i < tris.Count; i += 3)
            {
                int a = Weld(tris[i]), b = Weld(tris[i + 1]), cc = Weld(tris[i + 2]);
                if (a == b || b == cc || a == cc) continue;      // collapsed to a line
                t.Add(a); t.Add(b); t.Add(cc);
            }
            int Weld(int i)
            {
                var p = verts[i]; var col = colors[i];
                int ck = (Mathf.RoundToInt(col.r * 255f) << 16) | (Mathf.RoundToInt(col.g * 255f) << 8) | Mathf.RoundToInt(col.b * 255f);
                var key = (Key(p.x), Key(p.y), Key(p.z), ck);
                if (!map.TryGetValue(key, out int idx)) { idx = v.Count; v.Add(p); c.Add(col); map[key] = idx; }
                return idx;
            }
            // Filling an existing mesh through the API (rather than replacing the asset) keeps every reference to it valid.
            var m = into != null ? into : new Mesh();
            m.Clear();
            m.name = name;
            m.indexFormat = v.Count > 65000 ? UnityEngine.Rendering.IndexFormat.UInt32 : UnityEngine.Rendering.IndexFormat.UInt16;
            m.SetVertices(v);
            m.SetColors(c);
            m.SetTriangles(t, 0);
            m.RecalculateBounds();
            return m;
        }

        /// <summary>Add raw geometry (used for the race track ribbon).</summary>
        public MeshBuilder Raw(IList<Vector3> v, IList<Vector3> n, IList<Color> c, IList<int> t)
        {
            int start = verts.Count;
            verts.AddRange(v); normals.AddRange(n); colors.AddRange(c);
            foreach (int i in t) tris.Add(start + i);
            return this;
        }

        public Mesh Build(string name)
        {
            var m = new Mesh { name = name };
            if (verts.Count > 65000) m.indexFormat = UnityEngine.Rendering.IndexFormat.UInt32;
            m.SetVertices(verts);
            m.SetNormals(normals);
            m.SetColors(colors);
            m.SetTriangles(tris, 0);
            m.RecalculateBounds();
            return m;
        }
    }
}
