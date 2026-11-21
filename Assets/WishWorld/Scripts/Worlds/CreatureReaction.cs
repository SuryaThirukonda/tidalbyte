using System.Collections.Generic;
using UnityEngine;

namespace WishWorld
{
    /// <summary>
    /// The little performance a creature gives when it is touched, looked at or clicked: the elephant lifts its trunk,
    /// the owl turns its head right round, the rocket fires its engine.
    ///
    /// The creatures are single meshes with no rig, so the first time one reacts its mesh is cut into parts here
    /// (trunk, ears, wings, tail...) along the boxes its <see cref="Reaction"/> names, and each part gets its own
    /// pivot. Everything sits under a "Pose" child, so the reaction never fights the <see cref="Mover"/>, which owns
    /// the root transform. The root keeps its MeshFilter and collider; only its renderer is switched off.
    /// Cut meshes are shared by every creature of the same kind.
    /// </summary>
    [DisallowMultipleComponent]
    public class CreatureReaction : MonoBehaviour
    {
        /// <summary>Find or add the reaction for a creature.</summary>
        public static CreatureReaction For(Creature c)
        {
            var r = c.GetComponent<CreatureReaction>();
            if (r == null) r = c.gameObject.AddComponent<CreatureReaction>();
            r.creature = c;
            return r;
        }

        Creature creature;
        Reaction reaction;
        Transform pose;
        Transform[] parts = new Transform[0];
        Vector3[] partPivots = new Vector3[0];
        Bounds bounds;
        bool built;
        float t = -1f;

        public bool Playing => t >= 0f;

        /// <summary>Size of the creature's mesh, in its own (unscaled) metres.</summary>
        public Vector3 Size => bounds.size;
        public float H => bounds.size.y;
        /// <summary>A point given as fractions of the mesh's bounds (0..1 on each axis), in mesh metres.</summary>
        public Vector3 N(float x, float y, float z) => bounds.min + Vector3.Scale(bounds.size, new Vector3(x, y, z));
        public Vector3 Center => bounds.center;
        public Vector3 Floor => new Vector3(bounds.center.x, bounds.min.y, bounds.center.z);

        public void Play()
        {
            if (!built) Build();
            if (pose == null || reaction == null) return;
            t = 0f;
        }

        void LateUpdate()
        {
            if (t < 0f || pose == null) return;
            t += Time.deltaTime;
            ResetPose();
            if (t >= reaction.duration) { t = -1f; return; }
            reaction.eval(this, t);
        }

        void OnDisable() { if (pose != null) ResetPose(); t = -1f; }

        // ---- for the editor check (ReactionSheet) ----

        public float Duration { get { if (!built) Build(); return reaction != null ? reaction.duration : 0f; } }
        public string ReactionName { get { if (!built) Build(); return reaction != null ? reaction.name : "-"; } }
        public int PartCount { get { if (!built) Build(); int k = 0; foreach (var p in parts) if (p != null) k++; return k; } }

        /// <summary>Hold the pose the reaction has at <paramref name="time"/> seconds (works outside play mode).</summary>
        public void PoseAt(float time)
        {
            if (!built) Build();
            if (pose == null || reaction == null) return;
            ResetPose();
            if (time >= 0f && time < reaction.duration) reaction.eval(this, time);
        }

        /// <summary>How far the current pose is from rest, in degrees plus centimetres, summed over the body and parts.</summary>
        public float PoseAmount()
        {
            if (pose == null) return 0f;
            float a = Quaternion.Angle(Quaternion.identity, pose.localRotation) + pose.localPosition.magnitude * 100f + (pose.localScale - Vector3.one).magnitude * 100f;
            for (int i = 0; i < parts.Length; i++)
                if (parts[i] != null)
                    a += Quaternion.Angle(Quaternion.identity, parts[i].localRotation) + (parts[i].localPosition - partPivots[i]).magnitude * 100f + (parts[i].localScale.x - 1f) * 100f;
            return a;
        }

        // ---- posing, called from the reactions ----

        /// <summary>
        /// Move the whole creature: turn it by <paramref name="euler"/> degrees about <paramref name="pivot"/> (mesh metres),
        /// shift it by <paramref name="offset"/> metres, squash or stretch it (stretch &gt; 0 is taller and thinner,
        /// keeping its volume) and scale it, all about the pivot.
        /// </summary>
        public void Body(Vector3 pivot, Vector3 euler, Vector3 offset = default, float stretch = 0f, float scale = 1f)
        {
            float sy = Mathf.Max(0.2f, 1f + stretch), sxz = 1f / Mathf.Sqrt(sy);
            var s = new Vector3(sxz, sy, sxz) * scale;
            var q = Quaternion.Euler(euler);
            pose.localRotation = q;
            pose.localScale = s;
            pose.localPosition = pivot - q * Vector3.Scale(s, pivot) + offset;
        }

        /// <summary>Turn part <paramref name="i"/> about its own pivot, shift it (metres) and scale it.</summary>
        public void Part(int i, Vector3 euler, Vector3 offset = default, float scale = 1f)
        {
            if (i < 0 || i >= parts.Length || parts[i] == null) return;
            parts[i].localRotation = Quaternion.Euler(euler);
            parts[i].localPosition = partPivots[i] + offset;
            parts[i].localScale = Vector3.one * scale;
        }

        void ResetPose()
        {
            pose.localPosition = Vector3.zero; pose.localRotation = Quaternion.identity; pose.localScale = Vector3.one;
            for (int i = 0; i < parts.Length; i++)
            {
                if (parts[i] == null) continue;
                parts[i].localPosition = partPivots[i]; parts[i].localRotation = Quaternion.identity; parts[i].localScale = Vector3.one;
            }
        }

        // ---- building the rig ----

        class Cut { public Mesh body; public Mesh[] parts; public Vector3[] pivots; }
        static readonly Dictionary<(Mesh, string), Cut> cuts = new Dictionary<(Mesh, string), Cut>();

        void Build()
        {
            built = true;
            if (creature == null) creature = GetComponent<Creature>();
            var mf = GetComponent<MeshFilter>();
            var mr = GetComponent<MeshRenderer>();
            if (mf == null || mr == null || mf.sharedMesh == null) return;

            var mesh = mf.sharedMesh;
            bounds = mesh.bounds;
            reaction = CreatureReactions.For(creature != null ? creature.def : null);

            var key = (mesh, reaction.name);
            if (!cuts.TryGetValue(key, out var cut))
            {
                cut = mesh.isReadable ? Split(mesh, reaction, bounds) : new Cut { body = mesh, parts = new Mesh[0], pivots = new Vector3[0] };
                cuts[key] = cut;
            }

            pose = new GameObject("Pose").transform;
            pose.SetParent(transform, false);
            MakeRenderer("Body", pose, cut.body, Vector3.zero, mr);
            parts = new Transform[cut.parts.Length];
            partPivots = cut.pivots;
            for (int i = 0; i < cut.parts.Length; i++)
                if (cut.parts[i] != null) parts[i] = MakeRenderer(reaction.parts[i].name, pose, cut.parts[i], cut.pivots[i], mr);

            mr.enabled = false;
            if (creature != null) creature.RefreshRenderers();
        }

        static Transform MakeRenderer(string name, Transform parent, Mesh mesh, Vector3 at, MeshRenderer like)
        {
            var go = new GameObject(name);
            go.layer = like.gameObject.layer;
            go.transform.SetParent(parent, false);
            go.transform.localPosition = at;
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var r = go.AddComponent<MeshRenderer>();
            r.sharedMaterials = like.sharedMaterials;
            r.shadowCastingMode = like.shadowCastingMode;
            r.receiveShadows = like.receiveShadows;
            return go.transform;
        }

        /// <summary>
        /// Cut a mesh into the reaction's parts. The generated creatures are built from separate primitives, so the mesh
        /// is first grouped into islands (pieces whose vertices touch), and a whole island goes to the first part whose
        /// box holds its centre. Baked models can be one big island; an island holding more than a third of the mesh is
        /// cut triangle by triangle instead.
        /// </summary>
        static Cut Split(Mesh mesh, Reaction reaction, Bounds bounds)
        {
            var v = mesh.vertices;
            var n = mesh.normals;
            var c = mesh.colors;
            var uv = mesh.uv;
            int subs = mesh.subMeshCount;
            var subTris = new int[subs][];
            int total = 0;
            for (int s = 0; s < subs; s++) { subTris[s] = mesh.GetTriangles(s); total += subTris[s].Length / 3; }

            // Resolve the part boxes into mesh metres.
            int pc = reaction.parts.Length;
            var mins = new Vector3[pc]; var maxs = new Vector3[pc]; var pivots = new Vector3[pc];
            for (int i = 0; i < pc; i++)
            {
                var p = reaction.parts[i];
                Vector3 R(Vector3 a) => p.normalized ? bounds.min + Vector3.Scale(bounds.size, a) : a;
                mins[i] = Vector3.Min(R(p.min), R(p.max)); maxs[i] = Vector3.Max(R(p.min), R(p.max)); pivots[i] = R(p.pivot);
            }
            int Owner(Vector3 at)
            {
                for (int i = 0; i < pc; i++)
                    if (at.x >= mins[i].x && at.x <= maxs[i].x && at.y >= mins[i].y && at.y <= maxs[i].y && at.z >= mins[i].z && at.z <= maxs[i].z)
                        return i;
                return -1;
            }

            // Islands: union vertices joined by a triangle or sitting at the same spot.
            var parent = new int[v.Length];
            for (int i = 0; i < parent.Length; i++) parent[i] = i;
            int Find(int a) { while (parent[a] != a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; }
            void Union(int a, int b) { a = Find(a); b = Find(b); if (a != b) parent[a] = b; }
            var weld = new Dictionary<Vector3Int, int>(v.Length);
            for (int i = 0; i < v.Length; i++)
            {
                var k = new Vector3Int(Mathf.RoundToInt(v[i].x * 2000f), Mathf.RoundToInt(v[i].y * 2000f), Mathf.RoundToInt(v[i].z * 2000f));
                if (weld.TryGetValue(k, out int j)) Union(i, j); else weld[k] = i;
            }
            foreach (var tris in subTris)
                for (int i = 0; i < tris.Length; i += 3) { Union(tris[i], tris[i + 1]); Union(tris[i + 1], tris[i + 2]); }

            var islandMin = new Dictionary<int, Vector3>(); var islandMax = new Dictionary<int, Vector3>(); var islandTris = new Dictionary<int, int>();
            foreach (var tris in subTris)
                for (int i = 0; i < tris.Length; i += 3)
                {
                    int root = Find(tris[i]);
                    islandTris[root] = islandTris.TryGetValue(root, out int cnt) ? cnt + 1 : 1;
                    for (int k = 0; k < 3; k++)
                    {
                        var p = v[tris[i + k]];
                        islandMin[root] = islandMin.TryGetValue(root, out var mn) ? Vector3.Min(mn, p) : p;
                        islandMax[root] = islandMax.TryGetValue(root, out var mx) ? Vector3.Max(mx, p) : p;
                    }
                }
            var islandOwner = new Dictionary<int, int>();
            foreach (var kv in islandTris)
                islandOwner[kv.Key] = kv.Value * 3 > total && pc > 0 ? int.MinValue : Owner((islandMin[kv.Key] + islandMax[kv.Key]) * 0.5f);

            // Sort every triangle into its owner (-1 is the body), per submesh.
            var buckets = new List<int>[pc + 1, subs];
            for (int o = 0; o <= pc; o++) for (int s = 0; s < subs; s++) buckets[o, s] = new List<int>();
            for (int s = 0; s < subs; s++)
            {
                var tris = subTris[s];
                for (int i = 0; i < tris.Length; i += 3)
                {
                    int owner = islandOwner[Find(tris[i])];
                    if (owner == int.MinValue) owner = Owner((v[tris[i]] + v[tris[i + 1]] + v[tris[i + 2]]) / 3f);
                    var b = buckets[owner + 1, s];
                    b.Add(tris[i]); b.Add(tris[i + 1]); b.Add(tris[i + 2]);
                }
            }

            Mesh Make(int o, Vector3 shift, string name)
            {
                bool any = false;
                for (int s = 0; s < subs; s++) any |= buckets[o, s].Count > 0;
                if (!any) return null;
                var map = new Dictionary<int, int>();
                var nv = new List<Vector3>(); var nn = new List<Vector3>(); var nc = new List<Color>(); var nuv = new List<Vector2>();
                var nt = new List<int>[subs];
                for (int s = 0; s < subs; s++)
                {
                    nt[s] = new List<int>(buckets[o, s].Count);
                    foreach (int idx in buckets[o, s])
                    {
                        if (!map.TryGetValue(idx, out int ni))
                        {
                            ni = nv.Count; map[idx] = ni;
                            nv.Add(v[idx] - shift);
                            if (n.Length == v.Length) nn.Add(n[idx]);
                            if (c.Length == v.Length) nc.Add(c[idx]);
                            if (uv.Length == v.Length) nuv.Add(uv[idx]);
                        }
                        nt[s].Add(ni);
                    }
                }
                var m = new Mesh { name = mesh.name + "_" + name };
                if (nv.Count > 65000) m.indexFormat = UnityEngine.Rendering.IndexFormat.UInt32;
                m.SetVertices(nv);
                if (nn.Count == nv.Count) m.SetNormals(nn);
                if (nc.Count == nv.Count) m.SetColors(nc);
                if (nuv.Count == nv.Count) m.SetUVs(0, nuv);
                m.subMeshCount = subs;
                for (int s = 0; s < subs; s++) m.SetTriangles(nt[s], s);
                m.RecalculateBounds();
                return m;
            }

            var cut = new Cut { body = Make(0, Vector3.zero, "Body") ?? new Mesh(), parts = new Mesh[pc], pivots = pivots };
            for (int i = 0; i < pc; i++) cut.parts[i] = Make(i + 1, pivots[i], reaction.parts[i].name);
            return cut;
        }
    }
}
