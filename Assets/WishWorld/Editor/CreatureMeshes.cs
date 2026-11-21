using UnityEngine;

namespace WishWorld.EditorTools
{
    /// <summary>
    /// Placeholder creatures built from low-poly primitives, at roughly real size in metres, facing +Z.
    /// Walkers stand on y = 0; swimmers and flyers are centred on their origin.
    /// Every one is a stand-in to be replaced by a proper model: see the PLACEHOLDER_ prefix.
    /// </summary>
    public static class CreatureMeshes
    {
        static readonly Color W = new Color(0.97f, 0.97f, 0.97f), K = new Color(0.08f, 0.08f, 0.1f);
        static Vector3 V(float x, float y, float z) => new Vector3(x, y, z);
        static Color C(float r, float g, float b) => new Color(r, g, b);

        static void Eyes(MeshBuilder b, Vector3 head, float spread, float size, float forward = 0f)
        {
            for (int s = -1; s <= 1; s += 2)
            {
                b.Sphere(head + V(s * spread, size * 0.4f, forward), Vector3.one * size, W, false, default, 6);
                b.Sphere(head + V(s * (spread + size * 0.25f), size * 0.4f, forward + size * 0.25f), Vector3.one * size * 0.55f, K, false, default, 6);
            }
        }

        // ---- shared body plans ----

        static MeshBuilder Fish(float len, Color body, Color fin, bool stripes = false)
        {
            // Blocky retro fish: two tapered boxes nose to tail, wedge fins.
            var b = new MeshBuilder();
            b.TaperBox(V(0, 0, len * 0.2f), V(len * 0.26f, len * 0.4f, len * 0.4f), body, true, V(90, 0, 0), 0.55f, 0.6f);
            b.TaperBox(V(0, 0, -len * 0.2f), V(len * 0.26f, len * 0.4f, len * 0.4f), body, true, V(-90, 0, 0), 0.4f, 0.35f);
            b.TaperBox(V(0, 0, -len * 0.5f), V(len * 0.05f, len * 0.22f, len * 0.4f), fin, true, V(90, 0, 0), 1f, 0.15f);
            b.TaperBox(V(0, len * 0.27f, -len * 0.04f), V(len * 0.05f, len * 0.16f, len * 0.3f), fin, true, default, 1f, 0.3f);
            for (int s = -1; s <= 1; s += 2) b.TaperBox(V(s * len * 0.15f, -len * 0.08f, len * 0.08f), V(len * 0.04f, len * 0.14f, len * 0.16f), fin, true, V(0, 0, s * -70f), 1f, 0.4f);
            if (stripes)
            {
                b.Cube(V(0, 0, len * 0.14f), V(len * 0.27f, len * 0.37f, len * 0.07f), W, false);
                b.Cube(V(0, 0, -len * 0.12f), V(len * 0.24f, len * 0.3f, len * 0.06f), W, false);
            }
            for (int s = -1; s <= 1; s += 2)
            {
                b.Cube(V(s * len * 0.105f, len * 0.07f, len * 0.27f), Vector3.one * len * 0.075f, W, false);
                b.Cube(V(s * len * 0.125f, len * 0.07f, len * 0.285f), Vector3.one * len * 0.04f, K, false);
            }
            return b;
        }

        /// <summary>Four-legged body. Returns the head position so each animal can add its own features.</summary>
        static MeshBuilder Quad(float len, float h, float w, float leg, Color body, float head, float neck, float neckUp, out Vector3 headPos, Color? legColor = null)
        {
            // Blocky retro quadruped: tapered box torso, tapered legs, boxy head.
            var b = new MeshBuilder();
            float by = leg + h * 0.5f;
            b.TaperBox(V(0, by, 0), V(w, h, len), body, true, default, 0.82f, 0.94f);
            float t = w * 0.3f;
            for (int sx = -1; sx <= 1; sx += 2)
                for (int sz = -1; sz <= 1; sz += 2)
                    b.TaperBox(V(sx * w * 0.3f, leg * 0.5f + h * 0.05f, sz * len * 0.34f), V(t, leg + h * 0.1f, t), legColor ?? body, true, V(180, 0, 0), 0.72f, 0.72f);
            var dir = new Vector3(0, neckUp, 1f - neckUp).normalized;
            var from = V(0, by + h * 0.2f, len * 0.4f);
            headPos = from + dir * (neck + head * 0.3f);
            if (neck > 0.05f)
                b.TaperBox(from + dir * neck * 0.5f, V(head * 0.5f, neck + head * 0.3f, head * 0.5f), body, true, V(Mathf.Acos(dir.y) * Mathf.Rad2Deg, 0, 0), 0.8f, 0.8f);
            b.TaperBox(headPos, V(head * 0.72f, head * 1.05f, head * 0.72f), body, true, V(90, 0, 0), 0.7f, 0.75f);
            for (int s = -1; s <= 1; s += 2)
            {
                b.Cube(headPos + V(s * head * 0.3f, head * 0.14f, head * 0.2f), Vector3.one * head * 0.15f, W, false);
                b.Cube(headPos + V(s * head * 0.34f, head * 0.14f, head * 0.25f), Vector3.one * head * 0.08f, K, false);
            }
            return b;
        }

        static MeshBuilder Bird(float size, Color body, Color wing, Color beak, float span, bool legs = false)
        {
            // Blocky retro bird: box body, tapered wings, wedge beak and tail.
            var b = new MeshBuilder();
            b.TaperBox(V(0, 0, 0), V(size * 0.46f, size * 0.85f, size * 0.5f), body, true, V(90, 0, 0), 0.7f, 0.7f);
            b.TaperBox(V(0, size * 0.3f, size * 0.36f), Vector3.one * size * 0.42f, body, true, default, 0.8f, 0.8f);
            b.TaperBox(V(0, size * 0.26f, size * 0.66f), V(size * 0.14f, size * 0.24f, size * 0.12f), beak, false, V(90, 0, 0), 0.2f, 0.3f);
            for (int s = -1; s <= 1; s += 2)
            {
                b.TaperBox(V(s * span * 0.27f, size * 0.1f, 0), V(size * 0.5f, span * 0.5f, size * 0.07f), wing, true, V(90, 0, s * -90f), 0.35f, 1f);
                b.Cube(V(s * size * 0.15f, size * 0.36f, size * 0.5f), Vector3.one * size * 0.1f, W, false);
                b.Cube(V(s * size * 0.17f, size * 0.36f, size * 0.54f), Vector3.one * size * 0.055f, K, false);
            }
            b.TaperBox(V(0, 0.02f * size, -size * 0.6f), V(size * 0.34f, size * 0.42f, size * 0.06f), wing, true, V(-90, 0, 0), 1.5f, 1f);
            if (legs)
                for (int s = -1; s <= 1; s += 2)
                    b.Cube(V(s * size * 0.12f, -size * 0.45f, 0), V(size * 0.06f, size * 0.5f, size * 0.06f), beak, false);
            return b;
        }

        static MeshBuilder Biped(float height, Color body, Color limb, float headSize, out Vector3 headPos)
        {
            // Blocky retro figure, after the boxer reference: tapered torso, box limbs, box head.
            var b = new MeshBuilder();
            float leg = height * 0.38f, torso = height * 0.36f;
            b.TaperBox(V(0, leg + torso * 0.5f, 0), V(height * 0.26f, torso, height * 0.2f), body, true, default, 1.3f, 1.1f);
            for (int s = -1; s <= 1; s += 2)
            {
                b.TaperBox(V(s * height * 0.08f, leg * 0.5f, 0), V(height * 0.11f, leg, height * 0.12f), limb, true, V(180, 0, 0), 0.8f, 0.8f);
                b.Cube(V(s * height * 0.08f, height * 0.025f, height * 0.03f), V(height * 0.12f, height * 0.05f, height * 0.18f), limb);
                b.TaperBox(V(s * height * 0.23f, leg + torso * 0.52f, 0), V(height * 0.09f, torso * 0.95f, height * 0.1f), limb, true, V(180, 0, s * -12f), 0.8f, 0.8f);
            }
            headPos = V(0, leg + torso + headSize * 0.45f, 0);
            b.TaperBox(headPos, Vector3.one * headSize, body, true, default, 0.9f, 0.9f);
            return b;
        }

        // ---- aquarium ----
        public static MeshBuilder Clownfish() => Fish(0.18f, C(0.98f, 0.48f, 0.10f), C(0.95f, 0.35f, 0.05f), true);
        public static MeshBuilder Shark()
        {
            var g = C(0.42f, 0.50f, 0.60f); var belly = C(0.90f, 0.93f, 0.96f);
            var b = new MeshBuilder();
            b.TaperBox(V(0, 0, 0.42f), V(0.5f, 0.84f, 0.5f), g, true, V(90, 0, 0), 0.35f, 0.45f);       // head and nose
            b.TaperBox(V(0, 0, -0.42f), V(0.5f, 0.84f, 0.5f), g, true, V(-90, 0, 0), 0.28f, 0.3f);      // body to tail
            b.TaperBox(V(0, -0.14f, 0.3f), V(0.44f, 0.9f, 0.26f), belly, false, V(90, 0, 0), 0.4f, 0.5f);
            b.TaperBox(V(0, 0.38f, -0.02f), V(0.07f, 0.36f, 0.42f), g, true, V(-12, 0, 0), 1f, 0.2f);   // dorsal fin
            b.TaperBox(V(0, 0.2f, -0.98f), V(0.06f, 0.5f, 0.3f), g, true, V(-30, 0, 0), 1f, 0.2f);      // tail, upper lobe
            b.TaperBox(V(0, -0.14f, -0.95f), V(0.06f, 0.3f, 0.22f), g, true, V(-150, 0, 0), 1f, 0.2f);  // tail, lower lobe
            for (int s = -1; s <= 1; s += 2)
            {
                b.TaperBox(V(s * 0.36f, -0.1f, 0.22f), V(0.06f, 0.4f, 0.26f), g, true, V(0, 0, s * -105f), 1f, 0.3f);
                b.Cube(V(s * 0.19f, 0.06f, 0.58f), Vector3.one * 0.07f, W, false);
                b.Cube(V(s * 0.215f, 0.06f, 0.6f), Vector3.one * 0.04f, K, false);
                for (int k = 0; k < 3; k++) b.Cube(V(s * 0.245f, -0.02f, 0.3f - k * 0.06f), V(0.01f, 0.12f, 0.015f), C(0.25f, 0.3f, 0.38f), false);   // gills
            }
            return b;
        }
        public static MeshBuilder Turtle()
        {
            var shell = C(0.30f, 0.52f, 0.30f); var plate = C(0.40f, 0.64f, 0.34f); var skin = C(0.62f, 0.76f, 0.44f);
            var b = new MeshBuilder();
            b.TaperBox(V(0, 0.05f, 0), V(0.5f, 0.2f, 0.62f), shell, true, default, 0.6f, 0.65f);          // shell dome
            b.TaperBox(V(0, 0.16f, 0), V(0.26f, 0.04f, 0.36f), plate, true, default, 0.8f, 0.8f);         // top plate
            b.Cube(V(0, -0.06f, 0), V(0.44f, 0.06f, 0.56f), C(0.90f, 0.84f, 0.56f), false);               // underside
            b.TaperBox(V(0, 0.02f, 0.4f), V(0.16f, 0.22f, 0.14f), skin, true, V(90, 0, 0), 0.75f, 0.8f);  // head
            for (int s = -1; s <= 1; s += 2)
            {
                b.TaperBox(V(s * 0.36f, -0.03f, 0.2f), V(0.16f, 0.4f, 0.05f), skin, true, V(90, s * 60f, 0), 0.45f, 1f);    // front flippers
                b.TaperBox(V(s * 0.25f, -0.03f, -0.32f), V(0.12f, 0.2f, 0.05f), skin, true, V(90, s * 145f, 0), 0.5f, 1f);  // back flippers
                b.Cube(V(s * 0.06f, 0.05f, 0.47f), Vector3.one * 0.035f, K, false);
            }
            b.TaperBox(V(0, -0.02f, -0.36f), V(0.06f, 0.12f, 0.04f), skin, true, V(-90, 0, 0), 0.2f, 1f);
            return b;
        }
        public static MeshBuilder Jellyfish()
        {
            var p = C(0.96f, 0.56f, 0.78f); var light = C(0.99f, 0.80f, 0.90f);
            var b = new MeshBuilder();
            b.TaperBox(V(0, 0.12f, 0), V(0.3f, 0.12f, 0.3f), p, true, default, 0.55f, 0.55f);     // crown
            b.TaperBox(V(0, 0.03f, 0), V(0.34f, 0.07f, 0.34f), p, true, default, 0.88f, 0.88f);   // bell rim
            b.Cube(V(0, -0.02f, 0), V(0.26f, 0.04f, 0.26f), light, false);
            for (int i = 0; i < 6; i++)
            {
                float a = i / 6f * Mathf.PI * 2f; float len = 0.26f + (i % 2) * 0.12f;
                b.TaperBox(V(Mathf.Cos(a) * 0.09f, -0.04f - len * 0.5f, Mathf.Sin(a) * 0.09f), V(0.03f, len, 0.03f), light, true, V(180, 0, 0), 0.3f, 0.3f);
            }
            for (int s = -1; s <= 1; s += 2) b.Cube(V(s * 0.06f, 0.06f, 0.165f), Vector3.one * 0.03f, K, false);
            return b;
        }
        public static MeshBuilder Ray()
        {
            var g = C(0.28f, 0.36f, 0.52f);
            var b = new MeshBuilder();
            b.TaperBox(V(0, 0, 0.04f), V(0.34f, 0.1f, 0.6f), g, true, default, 0.7f, 0.8f);                               // body
            for (int s = -1; s <= 1; s += 2)
            {
                b.TaperBox(V(s * 0.36f, 0, 0), V(0.5f, 0.42f, 0.07f), g, true, V(90, 0, s * -90f), 0.25f, 0.5f);          // wings
                b.Cube(V(s * 0.07f, 0.06f, 0.26f), Vector3.one * 0.04f, W, false);
                b.Cube(V(s * 0.075f, 0.065f, 0.275f), Vector3.one * 0.025f, K, false);
                b.TaperBox(V(s * 0.09f, 0, 0.38f), V(0.06f, 0.14f, 0.04f), g, true, V(90, 0, 0), 0.4f, 1f);              // head lobes
            }
            b.Cube(V(0, -0.04f, 0.02f), V(0.5f, 0.03f, 0.5f), W, false);
            b.TaperBox(V(0, 0, -0.62f), V(0.03f, 0.7f, 0.03f), g, true, V(-90, 0, 0), 0.15f, 0.15f);                      // tail
            return b;
        }

        // ---- zoo ----
        public static MeshBuilder Elephant()
        {
            var g = C(0.62f, 0.64f, 0.69f);
            var b = Quad(2.5f, 1.45f, 1.35f, 1.0f, g, 0.9f, 0.25f, 0.25f, out var h);
            b.Cylinder(h + V(0, -0.35f, 0.55f), V(0.24f, 0.75f, 0.24f), g, true, V(18, 0, 0), 0.7f);
            b.Cylinder(h + V(0, -0.95f, 0.68f), V(0.17f, 0.6f, 0.17f), g, true, V(-6, 0, 0), 0.7f);
            for (int s = -1; s <= 1; s += 2)
            {
                b.Sphere(h + V(s * 0.5f, 0.05f, -0.1f), V(0.1f, 0.85f, 0.7f), g, true, V(0, s * 25f, 0));
                b.Cone(h + V(s * 0.2f, -0.45f, 0.55f), V(0.08f, 0.45f, 0.08f), W, false, V(125, 0, 0));
            }
            b.Cylinder(V(0, 1.5f, -1.28f), V(0.07f, 0.8f, 0.07f), g, true, V(-20, 0, 0));
            return b;
        }
        public static MeshBuilder Giraffe()
        {
            var y = C(0.95f, 0.80f, 0.42f); var br = C(0.60f, 0.38f, 0.18f);
            var b = Quad(1.7f, 0.9f, 0.7f, 1.7f, y, 0.42f, 1.75f, 0.86f, out var h);
            foreach (var p in new[] { V(0.3f, 2.3f, 0.3f), V(-0.3f, 2.2f, -0.2f), V(0.28f, 2.1f, -0.5f), V(-0.28f, 2.4f, 0.45f), V(0, 2.62f, 0f), V(0.12f, 3.2f, 1.05f), V(-0.12f, 3.6f, 1.15f) })
                b.Sphere(p, V(0.2f, 0.2f, 0.26f), br, false, default, 6);
            for (int s = -1; s <= 1; s += 2) b.Cylinder(h + V(s * 0.09f, 0.26f, -0.05f), V(0.05f, 0.2f, 0.05f), br, false);
            b.Cylinder(V(0, 2.0f, -0.9f), V(0.05f, 0.8f, 0.05f), br, false, V(-15, 0, 0));
            return b;
        }
        public static MeshBuilder Zebra()
        {
            var b = Quad(1.5f, 0.72f, 0.55f, 0.8f, W, 0.4f, 0.5f, 0.62f, out var h, K);
            for (int i = -2; i <= 2; i++) b.Sphere(V(0, 1.16f, i * 0.26f), V(0.565f, 0.735f * (1f - Mathf.Abs(i) * 0.09f), 0.07f), K, false);
            b.Cube(V(0, 1.75f, 0.62f), V(0.05f, 0.5f, 0.12f), K, false, V(35, 0, 0));
            b.Sphere(h + V(0, -0.05f, 0.2f), V(0.24f, 0.2f, 0.22f), K, false);
            b.Cylinder(V(0, 1.05f, -0.82f), V(0.05f, 0.55f, 0.05f), K, false, V(-18, 0, 0));
            return b;
        }
        public static MeshBuilder Lion()
        {
            var t = C(0.88f, 0.68f, 0.36f); var m = C(0.55f, 0.33f, 0.15f);
            var b = Quad(1.3f, 0.6f, 0.5f, 0.55f, t, 0.42f, 0.12f, 0.45f, out var h);
            b.Sphere(h + V(0, 0, -0.1f), V(0.72f, 0.74f, 0.5f), m, false);
            b.Sphere(h + V(0, -0.06f, 0.2f), V(0.2f, 0.16f, 0.2f), W, false);
            b.Cylinder(V(0, 0.9f, -0.75f), V(0.05f, 0.6f, 0.05f), t, true, V(-40, 0, 0));
            b.Sphere(V(0, 0.68f, -1.02f), Vector3.one * 0.14f, m, false);
            return b;
        }
        public static MeshBuilder Flamingo()
        {
            var p = C(0.98f, 0.55f, 0.65f);
            var b = new MeshBuilder();
            b.Sphere(V(0, 0.78f, 0), V(0.26f, 0.3f, 0.46f), p);
            for (int s = -1; s <= 1; s += 2) b.Cylinder(V(s * 0.06f, 0.33f, 0), V(0.03f, 0.66f, 0.03f), C(0.95f, 0.45f, 0.55f), false, default, 1f, 5);
            b.Cylinder(V(0, 0.98f, 0.2f), V(0.07f, 0.36f, 0.07f), p, true, V(25, 0, 0));
            b.Cylinder(V(0, 1.18f, 0.24f), V(0.06f, 0.26f, 0.06f), p, true, V(-20, 0, 0));
            b.Sphere(V(0, 1.31f, 0.24f), V(0.11f, 0.11f, 0.14f), p);
            b.Cone(V(0, 1.27f, 0.36f), V(0.05f, 0.14f, 0.06f), K, false, V(120, 0, 0));
            Eyes(b, V(0, 1.32f, 0.27f), 0.045f, 0.03f);
            return b;
        }

        // ---- space ----
        public static MeshBuilder Saturn()
        {
            var b = new MeshBuilder();
            b.Sphere(V(0, 0, 0), Vector3.one * 0.66f, C(0.90f, 0.78f, 0.52f), true, default, 14);
            b.Sphere(V(0, 0.08f, 0), V(0.665f, 0.1f, 0.665f), C(0.80f, 0.64f, 0.40f), false, default, 14);
            b.Cylinder(V(0, 0, 0), V(1.45f, 0.012f, 1.45f), C(0.82f, 0.74f, 0.60f), false, V(0, 0, 18), 1f, 24);
            b.Cylinder(V(0, 0, 0), V(1.16f, 0.016f, 1.16f), C(0.62f, 0.54f, 0.42f), false, V(0, 0, 18), 1f, 24);
            return b;
        }
        public static MeshBuilder Earth()
        {
            var g = C(0.30f, 0.66f, 0.32f);
            var b = new MeshBuilder();
            b.Sphere(V(0, 0, 0), Vector3.one * 0.5f, C(0.20f, 0.45f, 0.88f), true, default, 14);
            foreach (var d in new[] { V(0.5f, 0.4f, 0.6f), V(-0.6f, 0.2f, 0.5f), V(0.3f, -0.4f, -0.7f), V(-0.4f, -0.5f, 0.3f), V(0.8f, -0.1f, -0.2f) })
                b.Sphere(d.normalized * 0.225f, V(0.2f, 0.16f, 0.14f), g, false, Quaternion.LookRotation(d).eulerAngles, 6);
            b.Sphere(V(0, 0.22f, 0), V(0.24f, 0.08f, 0.24f), W, false);
            b.Sphere(V(0, -0.22f, 0), V(0.22f, 0.08f, 0.22f), W, false);
            return b;
        }
        public static MeshBuilder Venus()
        {
            var b = new MeshBuilder();
            b.Sphere(V(0, 0, 0), Vector3.one * 0.46f, C(0.95f, 0.84f, 0.58f), true, default, 14);
            b.Sphere(V(0, 0.09f, 0), V(0.465f, 0.07f, 0.465f), C(0.99f, 0.93f, 0.76f), false, V(0, 0, 8), 14);
            b.Sphere(V(0, -0.08f, 0), V(0.465f, 0.06f, 0.465f), C(0.86f, 0.70f, 0.44f), false, V(0, 0, -6), 14);
            return b;
        }
        public static MeshBuilder Astronaut()
        {
            var b = Biped(1.3f, W, C(0.86f, 0.88f, 0.92f), 0.4f, out var h);
            b.Sphere(h + V(0, 0, 0.1f), V(0.3f, 0.26f, 0.26f), C(0.15f, 0.2f, 0.35f), false);
            b.Cube(V(0, 0.75f, -0.2f), V(0.34f, 0.44f, 0.16f), C(0.80f, 0.82f, 0.86f), false);
            b.Cube(V(0, 0.84f, 0.165f), V(0.16f, 0.1f, 0.03f), C(0.95f, 0.55f, 0.3f), false);
            return b;
        }
        public static MeshBuilder Rocket()
        {
            var r = C(0.90f, 0.25f, 0.22f);
            var b = new MeshBuilder();
            b.Cylinder(V(0, 0, 0), V(0.5f, 1.3f, 0.5f), W, true, V(90, 0, 0), 1f, 12);
            b.Cone(V(0, 0, 0.95f), V(0.5f, 0.6f, 0.5f), r, true, V(90, 0, 0), 12);
            for (int i = 0; i < 3; i++) b.Cube(Quaternion.Euler(0, 0, i * 120f) * V(0, 0.36f, -0.5f), V(0.05f, 0.4f, 0.5f), r, true, V(0, 0, i * 120f));
            b.Sphere(V(0, 0.22f, 0.25f), V(0.2f, 0.12f, 0.2f), C(0.35f, 0.7f, 0.95f), false);
            b.Cone(V(0, 0, -0.95f), V(0.36f, 0.6f, 0.36f), C(1f, 0.65f, 0.15f), false, V(-90, 0, 0));
            return b;
        }
        public static MeshBuilder Satellite()
        {
            var b = new MeshBuilder();
            b.Cube(V(0, 0, 0), V(0.4f, 0.4f, 0.6f), C(0.92f, 0.75f, 0.30f));
            for (int s = -1; s <= 1; s += 2)
            {
                b.Cube(V(s * 0.75f, 0, 0), V(0.95f, 0.02f, 0.44f), C(0.20f, 0.36f, 0.75f), false);
                b.Cylinder(V(s * 0.25f, 0, 0), V(0.04f, 0.14f, 0.04f), W, false, V(0, 0, 90));
            }
            b.Hemisphere(V(0, 0, 0.36f), V(0.42f, 0.22f, 0.42f), W, C(0.8f, 0.8f, 0.85f), false, V(-90, 0, 0), 10);
            b.Cylinder(V(0, 0.3f, -0.1f), V(0.025f, 0.3f, 0.025f), W, false);
            return b;
        }
        public static MeshBuilder Comet()
        {
            var ice = C(0.78f, 0.92f, 1f);
            var b = new MeshBuilder();
            b.Sphere(V(0, 0, 0), Vector3.one * 0.36f, ice);
            b.Cone(V(0, 0, -0.75f), V(0.34f, 1.3f, 0.34f), C(0.62f, 0.82f, 1f), true, V(-90, 0, 0), 10);
            for (int i = 1; i <= 3; i++) b.Sphere(V(0.05f * i, 0.04f * i, -0.35f * i - 0.3f), Vector3.one * (0.2f - i * 0.04f), W, false, default, 6);
            return b;
        }

        // ---- dinosaurs ----
        public static MeshBuilder TRex()
        {
            var g = C(0.36f, 0.56f, 0.32f); var belly = C(0.80f, 0.82f, 0.56f);
            var b = new MeshBuilder();
            b.Sphere(V(0, 2.1f, 0), V(1.1f, 1.3f, 2.4f), g, true, V(-12, 0, 0), 12);
            b.Sphere(V(0, 1.9f, 0.2f), V(0.9f, 1.0f, 1.9f), belly, false, V(-12, 0, 0), 12);
            b.Cone(V(0, 1.85f, -2.2f), V(0.7f, 2.6f, 0.7f), g, true, V(-98, 0, 0), 10);
            for (int s = -1; s <= 1; s += 2)
            {
                b.Cylinder(V(s * 0.42f, 1.0f, -0.15f), V(0.45f, 1.5f, 0.55f), g);
                b.Cube(V(s * 0.42f, 0.12f, 0.1f), V(0.5f, 0.24f, 0.9f), g);
                b.Cylinder(V(s * 0.36f, 2.15f, 1.05f), V(0.12f, 0.45f, 0.12f), g, true, V(55, 0, 0));
            }
            b.Cylinder(V(0, 2.85f, 1.1f), V(0.6f, 0.9f, 0.6f), g, true, V(35, 0, 0));
            b.Sphere(V(0, 3.25f, 1.6f), V(0.8f, 0.75f, 1.25f), g, true, default, 12);
            b.Cube(V(0, 2.95f, 1.85f), V(0.6f, 0.2f, 0.9f), belly, false);
            Eyes(b, V(0, 3.4f, 1.75f), 0.3f, 0.14f);
            return b;
        }
        public static MeshBuilder Triceratops()
        {
            var o = C(0.78f, 0.52f, 0.30f);
            var b = Quad(3.0f, 1.4f, 1.3f, 0.75f, o, 0.9f, 0.1f, 0.05f, out var h);
            b.Sphere(h + V(0, 0.35f, -0.35f), V(1.5f, 1.3f, 0.2f), C(0.86f, 0.62f, 0.36f), true, V(-25, 0, 0), 12);
            for (int s = -1; s <= 1; s += 2) b.Cone(h + V(s * 0.25f, 0.45f, 0.35f), V(0.14f, 0.8f, 0.14f), W, false, V(55, 0, 0));
            b.Cone(h + V(0, 0.15f, 0.62f), V(0.14f, 0.35f, 0.14f), W, false, V(40, 0, 0));
            b.Cone(V(0, 1.2f, -2.0f), V(0.6f, 1.6f, 0.6f), o, true, V(-100, 0, 0), 10);
            return b;
        }
        public static MeshBuilder Stegosaurus()
        {
            var g = C(0.52f, 0.62f, 0.34f); var pl = C(0.92f, 0.56f, 0.26f);
            var b = Quad(3.2f, 1.5f, 1.1f, 0.75f, g, 0.4f, 0.5f, 0.02f, out _);
            for (int i = 0; i < 7; i++)
            {
                float z = -1.25f + i * 0.42f, sc = 1f - Mathf.Abs(i - 3) * 0.17f;
                b.Cube(V(0, 2.25f + sc * 0.2f - Mathf.Abs(i - 3) * 0.05f, z), V(0.07f, 0.55f * sc, 0.55f * sc), pl, false, V(45, 0, 0));
            }
            b.Cone(V(0, 1.25f, -2.2f), V(0.55f, 1.9f, 0.55f), g, true, V(-98, 0, 0), 10);
            for (int s = -1; s <= 1; s += 2) b.Cone(V(s * 0.25f, 1.35f, -2.9f), V(0.08f, 0.5f, 0.08f), W, false, V(-40, 0, s * -40f));
            return b;
        }
        public static MeshBuilder Pterosaur()
        {
            var r = C(0.70f, 0.42f, 0.32f);
            var b = new MeshBuilder();
            b.Sphere(V(0, 0, 0), V(0.34f, 0.3f, 0.9f), r);
            for (int s = -1; s <= 1; s += 2) b.Cone(V(s * 0.72f, 0.02f, -0.05f), V(0.6f, 1.4f, 0.03f), C(0.82f, 0.56f, 0.40f), true, V(90, 0, s * -90f));
            b.Sphere(V(0, 0.14f, 0.55f), V(0.24f, 0.24f, 0.34f), r);
            b.Cone(V(0, 0.12f, 0.98f), V(0.1f, 0.6f, 0.12f), C(0.95f, 0.80f, 0.40f), false, V(90, 0, 0));
            b.Cone(V(0, 0.24f, 0.3f), V(0.06f, 0.5f, 0.14f), C(0.92f, 0.50f, 0.25f), false, V(-70, 0, 0));
            Eyes(b, V(0, 0.16f, 0.62f), 0.1f, 0.06f);
            return b;
        }

        // ---- arctic ----
        public static MeshBuilder Penguin()
        {
            var orange = C(0.98f, 0.62f, 0.18f);
            var b = new MeshBuilder();
            b.TaperBox(V(0, 0.34f, 0), V(0.44f, 0.6f, 0.38f), K, true, default, 0.78f, 0.8f);
            b.TaperBox(V(0, 0.32f, 0.08f), V(0.32f, 0.5f, 0.26f), W, false, default, 0.75f, 0.8f);
            b.TaperBox(V(0, 0.76f, 0), V(0.34f, 0.28f, 0.32f), K, true, default, 0.82f, 0.82f);
            b.Cube(V(0, 0.74f, 0.13f), V(0.24f, 0.16f, 0.08f), W, false);
            b.TaperBox(V(0, 0.71f, 0.23f), V(0.1f, 0.14f, 0.07f), orange, false, V(90, 0, 0), 0.3f, 0.4f);
            for (int s = -1; s <= 1; s += 2)
            {
                b.TaperBox(V(s * 0.25f, 0.4f, 0), V(0.06f, 0.38f, 0.2f), K, true, V(180, 0, s * 14f), 0.6f, 0.5f);
                b.Cube(V(s * 0.1f, 0.025f, 0.08f), V(0.15f, 0.05f, 0.22f), orange, false);
                b.Cube(V(s * 0.07f, 0.79f, 0.165f), Vector3.one * 0.04f, K, false);
            }
            return b;
        }
        public static MeshBuilder PolarBear()
        {
            var w = C(0.97f, 0.97f, 0.94f);
            var b = Quad(1.9f, 0.95f, 0.85f, 0.55f, w, 0.52f, 0.2f, 0.3f, out var h);
            b.Sphere(h + V(0, -0.06f, 0.3f), V(0.2f, 0.18f, 0.22f), w);
            b.Sphere(h + V(0, -0.02f, 0.42f), Vector3.one * 0.08f, K, false);
            for (int s = -1; s <= 1; s += 2) b.Sphere(h + V(s * 0.17f, 0.2f, -0.08f), Vector3.one * 0.12f, w);
            return b;
        }
        public static MeshBuilder Seal()
        {
            var g = C(0.52f, 0.56f, 0.62f); var light = C(0.76f, 0.78f, 0.80f);
            var b = new MeshBuilder();
            b.TaperBox(V(0, 0.24f, 0.2f), V(0.5f, 0.7f, 0.44f), g, true, V(78, 0, 0), 0.75f, 0.8f);      // chest, raised
            b.TaperBox(V(0, 0.16f, -0.42f), V(0.46f, 0.8f, 0.34f), g, true, V(-94, 0, 0), 0.3f, 0.4f);   // body to tail
            b.TaperBox(V(0, 0.5f, 0.55f), V(0.3f, 0.3f, 0.34f), g, true, default, 0.85f, 0.85f);         // head
            b.Cube(V(0, 0.45f, 0.74f), V(0.18f, 0.12f, 0.1f), light, false);
            b.Cube(V(0, 0.49f, 0.8f), Vector3.one * 0.05f, K, false);
            for (int s = -1; s <= 1; s += 2)
            {
                b.TaperBox(V(s * 0.3f, 0.06f, 0.25f), V(0.16f, 0.34f, 0.05f), g, true, V(90, s * 60f, 0), 0.5f, 1f);
                b.TaperBox(V(s * 0.12f, 0.06f, -0.84f), V(0.14f, 0.26f, 0.05f), g, true, V(90, s * 160f, 0), 1.4f, 1f);
                b.Cube(V(s * 0.1f, 0.56f, 0.7f), Vector3.one * 0.045f, K, false);
            }
            return b;
        }
        public static MeshBuilder Whale()
        {
            var bl = C(0.24f, 0.40f, 0.66f); var belly = C(0.86f, 0.90f, 0.95f);
            var b = new MeshBuilder();
            b.TaperBox(V(0, 0, 0.85f), V(1.1f, 1.7f, 1.0f), bl, true, V(90, 0, 0), 0.7f, 0.75f);          // head
            b.TaperBox(V(0, 0, -0.85f), V(1.1f, 1.7f, 1.0f), bl, true, V(-90, 0, 0), 0.25f, 0.28f);       // body to tail
            b.TaperBox(V(0, -0.3f, 0.7f), V(0.98f, 1.9f, 0.5f), belly, false, V(90, 0, 0), 0.7f, 0.7f);
            for (int k = 0; k < 5; k++) b.Cube(V(0, -0.5f, 1.3f - k * 0.3f), V(0.9f, 0.02f, 0.04f), C(0.7f, 0.76f, 0.84f), false);   // throat grooves
            for (int s = -1; s <= 1; s += 2)
            {
                b.TaperBox(V(s * 0.5f, 0.02f, -2.0f), V(0.5f, 0.9f, 0.08f), bl, true, V(90, s * 115f, 0), 0.4f, 1f);       // flukes
                b.TaperBox(V(s * 0.7f, -0.3f, 0.5f), V(0.3f, 0.7f, 0.07f), bl, true, V(90, s * 60f, s * 20f), 0.4f, 1f);   // flippers
                b.Cube(V(s * 0.5f, -0.05f, 1.15f), Vector3.one * 0.1f, W, false);
                b.Cube(V(s * 0.53f, -0.05f, 1.17f), Vector3.one * 0.06f, K, false);
            }
            b.Cube(V(0, 0.52f, 0.9f), V(0.12f, 0.04f, 0.16f), C(0.14f, 0.24f, 0.44f), false);              // blowhole
            return b;
        }
        public static MeshBuilder SnowyOwl()
        {
            var b = Bird(0.5f, W, C(0.92f, 0.92f, 0.90f), C(0.25f, 0.25f, 0.28f), 1.1f);
            for (int s = -1; s <= 1; s += 2) b.Sphere(V(s * 0.075f, 0.16f, 0.38f), Vector3.one * 0.07f, C(0.98f, 0.82f, 0.15f), false, default, 6);
            foreach (var p in new[] { V(0.1f, 0.14f, -0.1f), V(-0.12f, 0.12f, 0.05f), V(0.02f, 0.15f, -0.25f) }) b.Sphere(p, V(0.07f, 0.03f, 0.05f), C(0.5f, 0.5f, 0.52f), false, default, 5);
            return b;
        }

        // ---- rainforest ----
        public static MeshBuilder Parrot()
        {
            var b = Bird(0.36f, C(0.90f, 0.20f, 0.16f), C(0.18f, 0.42f, 0.90f), C(0.98f, 0.85f, 0.4f), 0.7f);
            b.Cone(V(0, 0, -0.42f), V(0.1f, 0.5f, 0.03f), C(0.98f, 0.80f, 0.15f), false, V(-90, 0, 0));
            return b;
        }
        public static MeshBuilder Monkey()
        {
            var br = C(0.50f, 0.34f, 0.22f); var face = C(0.90f, 0.74f, 0.58f);
            var b = Biped(0.8f, br, br, 0.3f, out var h);
            b.Sphere(h + V(0, -0.02f, 0.09f), V(0.2f, 0.2f, 0.14f), face, false);
            for (int s = -1; s <= 1; s += 2) b.Sphere(h + V(s * 0.16f, 0.02f, 0), V(0.05f, 0.12f, 0.12f), face, false);
            Eyes(b, h + V(0, 0, 0.13f), 0.05f, 0.04f);
            b.Cylinder(V(0, 0.4f, -0.22f), V(0.05f, 0.45f, 0.05f), br, true, V(-60, 0, 0));
            b.Cylinder(V(0, 0.68f, -0.44f), V(0.05f, 0.35f, 0.05f), br, true, V(-10, 0, 0));
            return b;
        }
        public static MeshBuilder Frog()
        {
            var g = C(0.30f, 0.78f, 0.32f);
            var b = new MeshBuilder();
            b.Sphere(V(0, 0.09f, 0), V(0.2f, 0.14f, 0.24f), g);
            b.Sphere(V(0, 0.06f, 0.03f), V(0.17f, 0.09f, 0.2f), C(0.98f, 0.92f, 0.5f), false);
            for (int s = -1; s <= 1; s += 2)
            {
                b.Sphere(V(s * 0.06f, 0.17f, 0.07f), Vector3.one * 0.065f, g);
                b.Sphere(V(s * 0.065f, 0.185f, 0.095f), Vector3.one * 0.035f, K, false, default, 6);
                b.Sphere(V(s * 0.12f, 0.04f, -0.07f), V(0.1f, 0.07f, 0.16f), g, true, V(0, s * 25f, 0));
                b.Sphere(V(s * 0.1f, 0.02f, 0.1f), V(0.07f, 0.03f, 0.08f), C(0.95f, 0.45f, 0.2f), false);
            }
            return b;
        }
        public static MeshBuilder Butterfly()
        {
            var o = C(0.98f, 0.55f, 0.12f);
            var b = new MeshBuilder();
            b.Cylinder(V(0, 0, 0), V(0.014f, 0.1f, 0.014f), K, false, V(90, 0, 0), 1f, 5);
            for (int s = -1; s <= 1; s += 2)
            {
                b.Sphere(V(s * 0.055f, 0.015f, 0.02f), V(0.1f, 0.006f, 0.08f), o, true, V(0, 0, s * 22f), 8);
                b.Sphere(V(s * 0.045f, 0.012f, -0.035f), V(0.075f, 0.006f, 0.06f), C(0.98f, 0.72f, 0.2f), true, V(0, 0, s * 22f), 8);
                b.Sphere(V(s * 0.075f, 0.026f, 0.03f), V(0.03f, 0.008f, 0.03f), K, false, V(0, 0, s * 22f), 6);
            }
            return b;
        }
        public static MeshBuilder Sloth()
        {
            var t = C(0.66f, 0.58f, 0.46f); var face = C(0.92f, 0.86f, 0.74f);
            var b = new MeshBuilder();
            b.Cylinder(V(0, 0.42f, 0), V(0.08f, 1.1f, 0.08f), C(0.45f, 0.32f, 0.22f), false, V(0, 0, 90));
            b.Sphere(V(0, 0, 0), V(0.34f, 0.5f, 0.3f), t);
            b.Sphere(V(0, 0.22f, 0.14f), Vector3.one * 0.26f, t);
            b.Sphere(V(0, 0.21f, 0.23f), V(0.2f, 0.17f, 0.1f), face, false);
            for (int s = -1; s <= 1; s += 2)
            {
                b.Cylinder(V(s * 0.2f, 0.22f, 0), V(0.07f, 0.46f, 0.07f), t, true, V(0, 0, s * -12f));
                b.Cylinder(V(s * 0.1f, -0.28f, 0.02f), V(0.07f, 0.3f, 0.07f), t);
                b.Sphere(V(s * 0.055f, 0.23f, 0.275f), V(0.05f, 0.03f, 0.02f), K, false, V(0, 0, s * -20f), 6);
            }
            return b;
        }

        // ---- farm ----
        public static MeshBuilder Cow()
        {
            var b = Quad(1.9f, 0.95f, 0.78f, 0.7f, W, 0.46f, 0.25f, 0.3f, out var h);
            foreach (var p in new[] { V(0.3f, 1.35f, 0.3f), V(-0.33f, 1.2f, -0.3f), V(0.22f, 1.5f, -0.55f), V(-0.2f, 1.55f, 0.5f) }) b.Sphere(p, V(0.36f, 0.34f, 0.44f), K, false, default, 8);
            b.Sphere(h + V(0, -0.1f, 0.26f), V(0.26f, 0.18f, 0.18f), C(0.96f, 0.70f, 0.72f), false);
            for (int s = -1; s <= 1; s += 2) b.Cone(h + V(s * 0.15f, 0.22f, -0.05f), V(0.06f, 0.16f, 0.06f), C(0.9f, 0.86f, 0.75f), false, V(0, 0, s * -25f));
            b.Sphere(V(0, 0.72f, -0.35f), V(0.3f, 0.2f, 0.3f), C(0.96f, 0.70f, 0.72f), false);
            return b;
        }
        public static MeshBuilder Sheep()
        {
            var b = new MeshBuilder();
            foreach (var p in new[] { V(0, 0.62f, 0), V(0.14f, 0.7f, 0.25f), V(-0.14f, 0.7f, -0.22f), V(0.12f, 0.6f, -0.3f), V(-0.12f, 0.62f, 0.3f), V(0, 0.8f, 0.05f) })
                b.Sphere(p, Vector3.one * 0.52f, W, true, default, 8);
            for (int sx = -1; sx <= 1; sx += 2) for (int sz = -1; sz <= 1; sz += 2) b.Cylinder(V(sx * 0.15f, 0.2f, sz * 0.25f), V(0.08f, 0.4f, 0.08f), K, false);
            b.Sphere(V(0, 0.75f, 0.55f), V(0.24f, 0.26f, 0.32f), K, false);
            Eyes(b, V(0, 0.78f, 0.62f), 0.09f, 0.05f);
            return b;
        }
        public static MeshBuilder Horse()
        {
            var br = C(0.56f, 0.34f, 0.20f); var dk = C(0.20f, 0.13f, 0.10f);
            var b = Quad(1.9f, 0.8f, 0.6f, 1.0f, br, 0.5f, 0.7f, 0.66f, out var h);
            b.Cube(V(0, 2.05f, 0.82f), V(0.06f, 0.75f, 0.16f), dk, false, V(32, 0, 0));
            b.Cylinder(V(0, 1.2f, -1.05f), V(0.12f, 0.9f, 0.12f), dk, false, V(-16, 0, 0), 0.4f);
            b.Sphere(h + V(0, -0.08f, 0.26f), V(0.22f, 0.2f, 0.26f), br);
            for (int s = -1; s <= 1; s += 2) b.Cone(h + V(s * 0.1f, 0.24f, -0.1f), V(0.07f, 0.16f, 0.05f), br);
            return b;
        }
        public static MeshBuilder Chicken()
        {
            var b = Bird(0.36f, W, C(0.93f, 0.93f, 0.90f), C(0.98f, 0.76f, 0.2f), 0.34f, true);
            b.Sphere(V(0, 0.36f, 0.14f), V(0.04f, 0.1f, 0.12f), C(0.9f, 0.18f, 0.18f), false);
            b.Sphere(V(0, 0.06f, 0.22f), V(0.04f, 0.07f, 0.04f), C(0.9f, 0.18f, 0.18f), false);
            // Bird() is centred on its origin; lift it so the feet stand on the ground.
            var lifted = new MeshBuilder();
            var m = b.Build("tmp");
            var v = m.vertices; for (int i = 0; i < v.Length; i++) v[i] += V(0, 0.34f, 0);
            lifted.Raw(v, m.normals, m.colors, m.triangles);
            Object.DestroyImmediate(m);
            return lifted;
        }
        public static MeshBuilder Pig()
        {
            var p = C(0.98f, 0.70f, 0.74f);
            var b = Quad(1.1f, 0.62f, 0.56f, 0.28f, p, 0.42f, 0.05f, 0.25f, out var h);
            b.Cylinder(h + V(0, -0.03f, 0.26f), V(0.18f, 0.1f, 0.15f), C(0.94f, 0.56f, 0.62f), false, V(90, 0, 0));
            for (int s = -1; s <= 1; s += 2) b.Cone(h + V(s * 0.13f, 0.2f, -0.04f), V(0.12f, 0.16f, 0.05f), p, true, V(20, 0, s * -20f));
            b.Sphere(V(0, 0.7f, -0.58f), Vector3.one * 0.1f, p);
            return b;
        }

        // ---- sky ----
        public static MeshBuilder Balloon()
        {
            var b = new MeshBuilder();
            b.Sphere(V(0, 2.1f, 0), V(2.2f, 2.5f, 2.2f), C(0.98f, 0.55f, 0.36f), true, default, 14);
            b.Sphere(V(0, 2.4f, 0), V(2.22f, 0.5f, 2.22f), W, false, default, 14);
            b.Sphere(V(0, 1.7f, 0), V(2.1f, 0.45f, 2.1f), C(0.35f, 0.62f, 0.95f), false, default, 14);
            b.Cone(V(0, 0.95f, 0), V(1.1f, 0.7f, 1.1f), C(0.98f, 0.55f, 0.36f), true, V(180, 0, 0), 12);
            for (int sx = -1; sx <= 1; sx += 2) for (int sz = -1; sz <= 1; sz += 2) b.Cylinder(V(sx * 0.22f, 0.55f, sz * 0.22f), V(0.02f, 0.6f, 0.02f), K, false, default, 1f, 4);
            b.Cube(V(0, 0.18f, 0), V(0.55f, 0.36f, 0.55f), C(0.62f, 0.44f, 0.26f), false);
            return b;
        }
        public static MeshBuilder SkyBird() => Bird(0.32f, C(0.30f, 0.60f, 0.95f), C(0.22f, 0.45f, 0.85f), C(0.98f, 0.76f, 0.2f), 0.7f);
        public static MeshBuilder Kite()
        {
            var b = new MeshBuilder();
            b.Cube(V(0, 0, 0), V(0.7f, 0.7f, 0.02f), C(0.98f, 0.62f, 0.42f), true, V(0, 0, 45));
            b.Cube(V(0, 0, -0.012f), V(0.03f, 0.98f, 0.02f), W, false);
            b.Cube(V(0, 0, -0.012f), V(0.98f, 0.03f, 0.02f), W, false);
            for (int i = 1; i <= 4; i++) b.Cube(V(Mathf.Sin(i * 1.3f) * 0.06f, -0.5f - i * 0.2f, 0), V(0.16f, 0.07f, 0.02f), i % 2 == 0 ? C(0.35f, 0.62f, 0.95f) : C(0.98f, 0.85f, 0.3f), false, V(0, 0, i * 25f));
            b.Cylinder(V(0, -0.95f, 0), V(0.012f, 0.9f, 0.012f), K, false, default, 1f, 4);
            return b;
        }
        public static MeshBuilder Plane()
        {
            var r = C(0.90f, 0.28f, 0.24f);
            var b = new MeshBuilder();
            b.Cylinder(V(0, 0, 0), V(0.42f, 2.0f, 0.42f), W, true, V(90, 0, 0), 0.6f, 12);
            b.Sphere(V(0, 0, -1.0f), V(0.42f, 0.42f, 0.5f), W);
            b.Cone(V(0, 0, 1.12f), V(0.26f, 0.3f, 0.26f), r, true, V(90, 0, 0));
            b.Cube(V(0, -0.02f, -0.1f), V(2.6f, 0.05f, 0.5f), r);
            b.Cube(V(0, 0.02f, -1.0f), V(0.95f, 0.04f, 0.3f), r);
            b.Cube(V(0, 0.26f, -1.02f), V(0.04f, 0.46f, 0.32f), r);
            b.Sphere(V(0, 0.16f, 0.3f), V(0.3f, 0.2f, 0.5f), C(0.35f, 0.7f, 0.95f), false);
            b.Cube(V(0, 0, 1.28f), V(0.7f, 0.06f, 0.02f), K, false, V(0, 0, 30));
            return b;
        }
    }
}
