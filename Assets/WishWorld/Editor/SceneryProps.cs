using System;
using UnityEngine;

namespace WishWorld.EditorTools
{
    /// <summary>
    /// Scenery pieces built by hand where no free pack had one. All are in metres, standing on y = 0 at the origin,
    /// in the same blocky faceted style as the creatures.
    /// </summary>
    public static class SceneryProps
    {
        static Color C(float r, float g, float b) => new Color(r, g, b);
        static readonly Color Bark = C(0.42f, 0.30f, 0.20f), BarkDark = C(0.30f, 0.22f, 0.16f), Straw = C(0.90f, 0.78f, 0.42f);
        static readonly Color SnowC = C(0.96f, 0.98f, 1f), IceC = C(0.72f, 0.88f, 0.98f), IceDeep = C(0.45f, 0.70f, 0.90f);
        static readonly Color Stone = C(0.55f, 0.56f, 0.58f), StoneDark = C(0.38f, 0.39f, 0.42f), Bone = C(0.93f, 0.90f, 0.80f);

        /// <summary>A roof: triangular prism along Z, its eaves at y = 0.</summary>
        public static MeshBuilder Gable(MeshBuilder b, Vector3 at, float width, float rise, float length, Color roof, Color end, float yaw = 0f)
        {
            var rot = Quaternion.Euler(0, yaw, 0);
            Vector3 P(float x, float y, float z) => at + rot * new Vector3(x, y, z);
            float w = width * 0.5f, l = length * 0.5f;
            Vector3 a0 = P(-w, 0, -l), b0 = P(w, 0, -l), r0 = P(0, rise, -l), a1 = P(-w, 0, l), b1 = P(w, 0, l), r1 = P(0, rise, l);
            b.Quad(a0, r0, r1, a1, roof).Quad(b1, r1, r0, b0, roof);
            b.Tri(a0, b0, r0, end).Tri(b1, a1, r1, end);
            return b;
        }

        // ------------------------------------------------------------------ savanna
        public static MeshBuilder Acacia(System.Random rng)
        {
            float R(float a, float c) => a + (float)rng.NextDouble() * (c - a);
            var b = new MeshBuilder();
            float h = R(4.5f, 7f), lean = R(-10f, 10f);
            b.TaperBox(new Vector3(0, h * 0.3f, 0), new Vector3(0.45f, h * 0.6f, 0.45f), Bark, false, new Vector3(lean, R(0, 90), 0), 0.7f, 0.7f);
            for (int i = 0; i < 3; i++)
            {
                float a = i * 120f + R(-25, 25);
                var dir = Quaternion.Euler(0, a, 0) * Vector3.forward;
                b.TaperBox(new Vector3(0, h * 0.72f, 0) + dir * 0.7f, new Vector3(0.22f, h * 0.42f, 0.22f), Bark, false, new Vector3(38f, a, 0), 0.6f, 0.6f);
            }
            Color[] greens = { C(0.42f, 0.52f, 0.22f), C(0.50f, 0.58f, 0.26f), C(0.36f, 0.46f, 0.20f) };
            for (int i = 0; i < 4; i++)
            {
                float a = R(0, 360), d = i == 0 ? 0 : R(0.8f, 2.2f);
                var o = Quaternion.Euler(0, a, 0) * Vector3.forward * d;
                b.Sphere(new Vector3(o.x, h * R(0.92f, 1.02f), o.z), new Vector3(R(3.2f, 5.2f), R(0.55f, 0.85f), R(2.8f, 4.6f)), greens[i % 3], false, new Vector3(0, a, 0), 6);
            }
            return b;
        }

        public static MeshBuilder Baobab(System.Random rng)
        {
            float R(float a, float c) => a + (float)rng.NextDouble() * (c - a);
            var b = new MeshBuilder();
            var trunk = C(0.60f, 0.50f, 0.42f);
            float h = R(6f, 9f), w = R(2.2f, 3.2f);
            b.Cylinder(new Vector3(0, h * 0.5f, 0), new Vector3(w, h, w), trunk, false, default, 0.62f, 7);
            b.Cylinder(new Vector3(0, 0.35f, 0), new Vector3(w * 1.3f, 0.7f, w * 1.3f), C(0.54f, 0.45f, 0.38f), false, default, 0.8f, 7);
            for (int i = 0; i < 6; i++)
            {
                float a = i * 60f + R(-20, 20), len = R(1.6f, 2.6f);
                var dir = Quaternion.Euler(0, a, 0) * Vector3.forward;
                b.TaperBox(new Vector3(0, h + 0.3f, 0) + dir * (w * 0.2f + len * 0.3f), new Vector3(0.4f, len, 0.4f), trunk, false, new Vector3(R(40, 62), a, 0), 0.45f, 0.45f);
                b.Sphere(new Vector3(0, h + 0.3f + len * 0.45f, 0) + dir * (w * 0.2f + len * 0.75f), new Vector3(R(1.4f, 2.2f), R(0.8f, 1.2f), R(1.4f, 2.2f)), C(0.44f, 0.56f, 0.26f), false, default, 5);
            }
            return b;
        }

        public static MeshBuilder TermiteMound(System.Random rng)
        {
            float R(float a, float c) => a + (float)rng.NextDouble() * (c - a);
            var b = new MeshBuilder();
            var clay = C(0.66f, 0.42f, 0.28f);
            float h = R(1.4f, 2.6f);
            b.Cone(new Vector3(0, h * 0.5f, 0), new Vector3(h * 0.6f, h, h * 0.6f), clay, false, new Vector3(R(-4, 4), 0, R(-4, 4)), 5);
            b.Cone(new Vector3(h * 0.25f, h * 0.3f, 0.1f), new Vector3(h * 0.35f, h * 0.6f, h * 0.35f), C(0.60f, 0.38f, 0.25f), false, default, 5);
            b.Cone(new Vector3(-h * 0.2f, h * 0.22f, -h * 0.15f), new Vector3(h * 0.3f, h * 0.45f, h * 0.3f), clay, false, default, 5);
            return b;
        }

        public static MeshBuilder DeadTree(System.Random rng)
        {
            float R(float a, float c) => a + (float)rng.NextDouble() * (c - a);
            var b = new MeshBuilder();
            var wood = C(0.52f, 0.46f, 0.40f);
            float h = R(3f, 5f);
            b.TaperBox(new Vector3(0, h * 0.5f, 0), new Vector3(0.4f, h, 0.4f), wood, false, new Vector3(R(-6, 6), 0, R(-6, 6)), 0.45f, 0.45f);
            for (int i = 0; i < 4; i++)
            {
                float a = R(0, 360), y = h * R(0.5f, 0.95f), len = R(1f, 2f);
                var dir = Quaternion.Euler(0, a, 0) * Vector3.forward;
                b.TaperBox(new Vector3(0, y + len * 0.3f, 0) + dir * len * 0.38f, new Vector3(0.14f, len, 0.14f), wood, false, new Vector3(R(45, 65), a, 0), 0.3f, 0.3f);
            }
            return b;
        }

        // ------------------------------------------------------------------ farm and village
        public static MeshBuilder Barn()
        {
            var b = new MeshBuilder();
            Color red = C(0.72f, 0.20f, 0.16f), trim = C(0.96f, 0.94f, 0.90f), roof = C(0.34f, 0.32f, 0.36f), door = C(0.46f, 0.14f, 0.12f);
            b.Cube(new Vector3(0, 2.4f, 0), new Vector3(9f, 4.8f, 12f), red, false);
            Gable(b, new Vector3(0, 4.8f, 0), 9.8f, 3.4f, 12.8f, roof, red);
            b.Cube(new Vector3(0, 1.7f, 6.03f), new Vector3(3.6f, 3.4f, 0.12f), door, false);                // big door
            b.Cube(new Vector3(0, 3.45f, 6.06f), new Vector3(4.0f, 0.16f, 0.14f), trim, false);
            b.Cube(new Vector3(-1.9f, 1.7f, 6.06f), new Vector3(0.16f, 3.4f, 0.14f), trim, false).Cube(new Vector3(1.9f, 1.7f, 6.06f), new Vector3(0.16f, 3.4f, 0.14f), trim, false);
            b.Cube(new Vector3(0, 1.7f, 6.07f), new Vector3(0.12f, 3.4f, 0.12f), trim, false);
            b.Cube(new Vector3(-0.9f, 1.7f, 6.08f), new Vector3(2.4f, 0.1f, 0.1f), trim, false, new Vector3(0, 0, 54f)).Cube(new Vector3(0.9f, 1.7f, 6.08f), new Vector3(2.4f, 0.1f, 0.1f), trim, false, new Vector3(0, 0, -54f));
            b.Cube(new Vector3(0, 5.6f, 6.05f), new Vector3(1.2f, 1.2f, 0.12f), C(0.20f, 0.14f, 0.12f), false);  // hay loft
            b.Cube(new Vector3(0, 5.6f, 6.08f), new Vector3(1.5f, 0.12f, 0.1f), trim, false).Cube(new Vector3(0, 6.25f, 6.08f), new Vector3(1.5f, 0.12f, 0.1f), trim, false);
            for (int s = -1; s <= 1; s += 2)
                for (int k = -1; k <= 1; k++)
                    b.Cube(new Vector3(s * 4.53f, 2.6f, k * 3.6f), new Vector3(0.1f, 1.0f, 1.0f), trim, false);       // side windows
            b.Cube(new Vector3(0, 0.12f, 0), new Vector3(9.4f, 0.24f, 12.4f), Stone, false);                  // footing
            // silo
            b.Cylinder(new Vector3(7.2f, 4.5f, -2.5f), new Vector3(3.2f, 9f, 3.2f), C(0.80f, 0.82f, 0.84f), false, default, 1f, 10);
            b.Hemisphere(new Vector3(7.2f, 9f, -2.5f), new Vector3(3.3f, 2.4f, 3.3f), C(0.62f, 0.66f, 0.72f), C(0.62f, 0.66f, 0.72f), false, default, 10);
            for (int k = 1; k < 4; k++) b.Cylinder(new Vector3(7.2f, k * 2.2f, -2.5f), new Vector3(3.3f, 0.14f, 3.3f), C(0.60f, 0.62f, 0.66f), false, default, 1f, 10);
            return b;
        }

        /// <summary>A small house. snow > 0 lays snow on the roof.</summary>
        public static MeshBuilder House(System.Random rng, Color wall, Color roof, float snow = 0f, bool chalet = false)
        {
            float R(float a, float c) => a + (float)rng.NextDouble() * (c - a);
            var b = new MeshBuilder();
            float w = R(5f, 7f), l = R(6f, 9f), h = R(2.8f, 3.6f), rise = chalet ? R(2.2f, 3f) : R(1.8f, 2.6f);
            Color lower = chalet ? C(0.86f, 0.84f, 0.80f) : wall;
            b.Cube(new Vector3(0, h * 0.25f, 0), new Vector3(w, h * 0.5f, l), lower, false);
            b.Cube(new Vector3(0, h * 0.75f, 0), new Vector3(w, h * 0.5f, l), wall, false);
            Gable(b, new Vector3(0, h, 0), w + 1.0f, rise, l + 1.0f, snow > 0 ? SnowC : roof, wall);
            if (snow > 0) Gable(b, new Vector3(0, h - 0.12f, 0), w + 1.1f, rise, l + 1.1f, roof, wall);          // eaves show under the snow
            b.Cube(new Vector3(w * 0.22f, h + rise * 0.75f, -l * 0.2f), new Vector3(0.6f, rise * 0.9f, 0.6f), C(0.50f, 0.36f, 0.32f), false);
            if (snow > 0) b.Cube(new Vector3(w * 0.22f, h + rise * 1.22f, -l * 0.2f), new Vector3(0.7f, 0.12f, 0.7f), SnowC, false);
            b.Cube(new Vector3(0, 1.0f, l * 0.5f + 0.03f), new Vector3(1.0f, 2.0f, 0.1f), C(0.36f, 0.24f, 0.16f), false);          // door
            Color glass = C(0.98f, 0.86f, 0.50f);
            foreach (float x in new[] { -w * 0.3f, w * 0.3f })
            {
                b.Cube(new Vector3(x, h * 0.62f, l * 0.5f + 0.03f), new Vector3(0.9f, 0.9f, 0.1f), glass, false);
                b.Cube(new Vector3(x, h * 0.62f, -l * 0.5f - 0.03f), new Vector3(0.9f, 0.9f, 0.1f), glass, false);
            }
            foreach (float z in new[] { -l * 0.25f, l * 0.25f })
            {
                b.Cube(new Vector3(w * 0.5f + 0.03f, h * 0.62f, z), new Vector3(0.1f, 0.9f, 0.9f), glass, false);
                b.Cube(new Vector3(-w * 0.5f - 0.03f, h * 0.62f, z), new Vector3(0.1f, 0.9f, 0.9f), glass, false);
            }
            if (chalet) b.Cube(new Vector3(0, h * 0.52f, l * 0.5f + 0.5f), new Vector3(w, 0.12f, 1.0f), C(0.42f, 0.28f, 0.18f), false);   // balcony
            return b;
        }

        public static MeshBuilder Church(bool snow)
        {
            var b = new MeshBuilder();
            Color wall = C(0.92f, 0.90f, 0.86f), roof = snow ? SnowC : C(0.40f, 0.26f, 0.22f), dark = C(0.36f, 0.26f, 0.22f);
            b.Cube(new Vector3(0, 2.5f, 0), new Vector3(6f, 5f, 11f), wall, false);
            Gable(b, new Vector3(0, 5f, 0), 6.8f, 3.2f, 11.6f, roof, wall);
            b.Cube(new Vector3(0, 5.5f, 6.5f), new Vector3(3.2f, 11f, 3.2f), wall, false);
            b.Cylinder(new Vector3(0, 14f, 6.5f), new Vector3(3.8f, 6f, 3.8f), snow ? C(0.86f, 0.90f, 0.96f) : dark, false, new Vector3(0, 45, 0), 0f, 4);
            b.Cube(new Vector3(0, 17.4f, 6.5f), new Vector3(0.12f, 1.2f, 0.12f), dark, false).Cube(new Vector3(0, 17.6f, 6.5f), new Vector3(0.6f, 0.12f, 0.12f), dark, false);
            b.Cube(new Vector3(0, 1.4f, 8.13f), new Vector3(1.4f, 2.8f, 0.1f), dark, false);
            b.Cube(new Vector3(0, 8.6f, 8.13f), new Vector3(1.0f, 1.4f, 0.1f), C(0.30f, 0.34f, 0.42f), false);
            for (int k = -1; k <= 1; k++)
                foreach (int s in new[] { -1, 1 })
                    b.Cube(new Vector3(s * 3.03f, 2.8f, k * 3f - 0.8f), new Vector3(0.1f, 2.2f, 0.9f), C(0.98f, 0.84f, 0.48f), false);
            return b;
        }

        public static MeshBuilder HayBale(bool round)
        {
            var b = new MeshBuilder();
            if (round)
            {
                b.Cylinder(new Vector3(0, 0.7f, 0), new Vector3(1.4f, 1.3f, 1.4f), Straw, false, new Vector3(0, 0, 90), 1f, 9);
                b.Cylinder(new Vector3(0, 0.7f, 0), new Vector3(1.42f, 0.14f, 1.42f), C(0.80f, 0.66f, 0.34f), false, new Vector3(0, 0, 90), 1f, 9);
            }
            else
            {
                b.Cube(new Vector3(0, 0.3f, 0), new Vector3(1.2f, 0.6f, 0.6f), Straw, false);
                b.Cube(new Vector3(-0.3f, 0.3f, 0), new Vector3(0.05f, 0.62f, 0.62f), C(0.62f, 0.44f, 0.26f), false).Cube(new Vector3(0.3f, 0.3f, 0), new Vector3(0.05f, 0.62f, 0.62f), C(0.62f, 0.44f, 0.26f), false);
            }
            return b;
        }

        public static MeshBuilder Scarecrow()
        {
            var b = new MeshBuilder();
            b.Cube(new Vector3(0, 1.0f, 0), new Vector3(0.1f, 2.0f, 0.1f), Bark, false);
            b.Cube(new Vector3(0, 1.45f, 0), new Vector3(1.6f, 0.09f, 0.09f), Bark, false);
            b.TaperBox(new Vector3(0, 1.25f, 0), new Vector3(0.6f, 0.75f, 0.3f), C(0.30f, 0.44f, 0.70f), false, default, 1.15f, 1f);
            b.Cube(new Vector3(-0.55f, 1.45f, 0), new Vector3(0.5f, 0.22f, 0.24f), C(0.30f, 0.44f, 0.70f), false).Cube(new Vector3(0.55f, 1.45f, 0), new Vector3(0.5f, 0.22f, 0.24f), C(0.30f, 0.44f, 0.70f), false);
            b.Sphere(new Vector3(0, 1.85f, 0), new Vector3(0.42f, 0.42f, 0.42f), C(0.90f, 0.80f, 0.56f), false, default, 6);
            b.Cylinder(new Vector3(0, 2.02f, 0), new Vector3(0.8f, 0.05f, 0.8f), Straw, false, default, 1f, 8);
            b.Cone(new Vector3(0, 2.22f, 0), new Vector3(0.44f, 0.4f, 0.44f), Straw, false, default, 8);
            b.Cube(new Vector3(-0.85f, 1.4f, 0), new Vector3(0.2f, 0.3f, 0.08f), Straw, false).Cube(new Vector3(0.85f, 1.4f, 0), new Vector3(0.2f, 0.3f, 0.08f), Straw, false);
            return b;
        }

        // ------------------------------------------------------------------ ice
        public static MeshBuilder Igloo()
        {
            var b = new MeshBuilder();
            b.Hemisphere(new Vector3(0, 0, 0), new Vector3(4.2f, 3.6f, 4.2f), SnowC, SnowC, false, default, 10);
            for (int k = 1; k < 4; k++)        // courses of ice blocks, as thin bands
                b.Cylinder(new Vector3(0, k * 0.42f, 0), new Vector3(4.24f * Mathf.Sqrt(1f - Mathf.Pow(k * 0.42f / 1.8f, 2f)), 0.05f, 4.24f * Mathf.Sqrt(1f - Mathf.Pow(k * 0.42f / 1.8f, 2f))), C(0.80f, 0.88f, 0.96f), false, default, 1f, 10);
            b.Cube(new Vector3(0, 0.55f, 2.3f), new Vector3(1.5f, 1.1f, 1.5f), SnowC, false);
            Gable(b, new Vector3(0, 1.1f, 2.3f), 1.5f, 0.4f, 1.5f, C(0.90f, 0.94f, 1f), SnowC);
            b.Cube(new Vector3(0, 0.45f, 3.06f), new Vector3(0.8f, 0.9f, 0.06f), C(0.10f, 0.14f, 0.24f), false);
            return b;
        }

        public static MeshBuilder Iceberg(System.Random rng)
        {
            float R(float a, float c) => a + (float)rng.NextDouble() * (c - a);
            var b = new MeshBuilder();
            float s = R(5f, 14f);
            b.Cylinder(new Vector3(0, 0.3f, 0), new Vector3(s * 1.25f, 1.2f, s * 1.05f), IceDeep, false, new Vector3(0, R(0, 60), 0), 0.9f, 7);
            int n = 3 + rng.Next(3);
            for (int i = 0; i < n; i++)
            {
                float a = R(0, 360), d = i == 0 ? 0 : R(0.15f, 0.42f) * s, h = R(0.5f, 1.3f) * s, w = R(0.3f, 0.6f) * s;
                var o = Quaternion.Euler(0, a, 0) * Vector3.forward * d;
                b.Cylinder(new Vector3(o.x, 0.6f + h * 0.5f, o.z), new Vector3(w, h, w * R(0.7f, 1.1f)), i % 2 == 0 ? SnowC : IceC, false, new Vector3(R(-8, 8), a, R(-8, 8)), R(0.05f, 0.45f), 5);
            }
            return b;
        }

        public static MeshBuilder IceFloe(System.Random rng)
        {
            float R(float a, float c) => a + (float)rng.NextDouble() * (c - a);
            var b = new MeshBuilder();
            float s = R(2.5f, 8f);
            b.Cylinder(new Vector3(0, 0.02f, 0), new Vector3(s, 0.34f, s * R(0.6f, 1f)), SnowC, false, new Vector3(0, R(0, 60), 0), 0.93f, 6 + rng.Next(3));
            b.Cylinder(new Vector3(0, -0.2f, 0), new Vector3(s * 1.04f, 0.2f, s * 0.9f), IceDeep, false, new Vector3(0, R(0, 60), 0), 1f, 7);
            return b;
        }

        public static MeshBuilder IceSpike(System.Random rng)
        {
            float R(float a, float c) => a + (float)rng.NextDouble() * (c - a);
            var b = new MeshBuilder();
            int n = 2 + rng.Next(3);
            for (int i = 0; i < n; i++)
            {
                float h = R(1.2f, 4f);
                b.Cone(new Vector3(R(-0.8f, 0.8f), h * 0.5f, R(-0.8f, 0.8f)), new Vector3(h * 0.3f, h, h * 0.3f), i % 2 == 0 ? IceC : C(0.84f, 0.94f, 1f), false, new Vector3(R(-12, 12), R(0, 90), R(-12, 12)), 5);
            }
            return b;
        }

        // ------------------------------------------------------------------ reef
        static readonly Color[] CoralColors = { C(0.98f, 0.45f, 0.38f), C(0.98f, 0.62f, 0.25f), C(0.92f, 0.36f, 0.62f), C(0.62f, 0.40f, 0.86f), C(0.98f, 0.84f, 0.32f), C(0.30f, 0.78f, 0.72f) };

        static void Branch(MeshBuilder b, System.Random rng, Vector3 from, Vector3 dir, float len, float thick, Color col, int depth)
        {
            float R(float a, float c) => a + (float)rng.NextDouble() * (c - a);
            var to = from + dir * len;
            var rot = Quaternion.FromToRotation(Vector3.up, dir);
            b.TaperBox((from + to) * 0.5f, new Vector3(thick, len, thick), col, false, rot.eulerAngles, 0.7f, 0.7f);
            if (depth <= 0) { b.Sphere(to, Vector3.one * thick * 1.2f, Color.Lerp(col, Color.white, 0.35f), false, default, 5); return; }
            int kids = 2 + rng.Next(2);
            for (int i = 0; i < kids; i++)
            {
                var nd = (dir + new Vector3(R(-0.9f, 0.9f), R(0.1f, 0.6f), R(-0.9f, 0.9f))).normalized;
                Branch(b, rng, to, nd, len * R(0.6f, 0.8f), thick * 0.7f, col, depth - 1);
            }
        }

        public static MeshBuilder Coral(System.Random rng, int kind = -1)
        {
            float R(float a, float c) => a + (float)rng.NextDouble() * (c - a);
            var b = new MeshBuilder();
            var col = CoralColors[rng.Next(CoralColors.Length)];
            if (kind < 0) kind = rng.Next(6);
            switch (kind)
            {
                case 0:     // branching
                    for (int i = 0; i < 3; i++) Branch(b, rng, new Vector3(R(-0.15f, 0.15f), 0, R(-0.15f, 0.15f)), new Vector3(R(-0.4f, 0.4f), 1, R(-0.4f, 0.4f)).normalized, R(0.5f, 0.9f), 0.16f, col, 2);
                    break;
                case 1:     // brain
                    b.Sphere(new Vector3(0, 0.35f, 0), new Vector3(R(1.0f, 1.8f), R(0.7f, 1.1f), R(1.0f, 1.8f)), col, false, default, 7);
                    b.Sphere(new Vector3(0.5f, 0.2f, 0.3f), new Vector3(0.7f, 0.5f, 0.7f), Color.Lerp(col, Color.white, 0.2f), false, default, 6);
                    break;
                case 2:     // tube sponges
                    for (int i = 0; i < 5; i++)
                    {
                        float h = R(0.5f, 1.5f);
                        var p = new Vector3(R(-0.4f, 0.4f), h * 0.5f, R(-0.4f, 0.4f));
                        b.Cylinder(p, new Vector3(0.24f, h, 0.24f), col, false, new Vector3(R(-10, 10), 0, R(-10, 10)), 1.5f, 6);
                        b.Cylinder(p + Vector3.up * (h * 0.5f - 0.01f), new Vector3(0.24f, 0.04f, 0.24f), Color.Lerp(col, Color.black, 0.55f), false, default, 1f, 6);
                    }
                    break;
                case 3:     // table
                    b.Cylinder(new Vector3(0, 0.35f, 0), new Vector3(0.3f, 0.7f, 0.3f), Color.Lerp(col, Color.black, 0.25f), false, default, 0.6f, 6);
                    b.Cylinder(new Vector3(0, 0.75f, 0), new Vector3(R(1.6f, 2.6f), 0.14f, R(1.6f, 2.6f)), col, false, new Vector3(R(-6, 6), R(0, 60), R(-6, 6)), 1.1f, 8);
                    b.Cylinder(new Vector3(0.3f, 1.05f, 0.2f), new Vector3(R(1.0f, 1.6f), 0.12f, R(1.0f, 1.6f)), Color.Lerp(col, Color.white, 0.2f), false, new Vector3(R(-6, 6), R(0, 60), R(-6, 6)), 1.1f, 7);
                    break;
                case 4:     // sea fan
                    b.Cylinder(new Vector3(0, 0.8f, 0), new Vector3(R(1.2f, 1.8f), 0.06f, R(1.4f, 2.0f)), col, false, new Vector3(90, R(0, 180), 0), 1f, 9);
                    b.Cube(new Vector3(0, 0.15f, 0), new Vector3(0.12f, 0.3f, 0.12f), Color.Lerp(col, Color.black, 0.3f), false);
                    break;
                default:    // anemone: where the clownfish live
                    b.Cylinder(new Vector3(0, 0.2f, 0), new Vector3(0.7f, 0.4f, 0.7f), C(0.80f, 0.36f, 0.50f), false, default, 0.8f, 8);
                    for (int i = 0; i < 14; i++)
                    {
                        float a = i / 14f * 360f, d = i % 2 == 0 ? 0.22f : 0.1f;
                        var o = Quaternion.Euler(0, a, 0) * Vector3.forward * d;
                        b.TaperBox(new Vector3(o.x * 1.6f, 0.65f, o.z * 1.6f), new Vector3(0.09f, 0.6f, 0.09f), i % 2 == 0 ? C(0.98f, 0.70f, 0.78f) : C(0.98f, 0.84f, 0.62f), false,
                            new Vector3(d * 110f, a, 0), 0.5f, 0.5f);
                    }
                    break;
            }
            return b;
        }

        public static MeshBuilder Kelp(System.Random rng)
        {
            float R(float a, float c) => a + (float)rng.NextDouble() * (c - a);
            var b = new MeshBuilder();
            Color[] g = { C(0.20f, 0.50f, 0.26f), C(0.30f, 0.58f, 0.24f), C(0.42f, 0.56f, 0.18f) };
            int stalks = 2 + rng.Next(3);
            for (int s = 0; s < stalks; s++)
            {
                var p = new Vector3(R(-0.5f, 0.5f), 0, R(-0.5f, 0.5f));
                float seg = R(0.8f, 1.2f), yaw = R(0, 360), sway = R(8f, 18f);
                int n = 5 + rng.Next(6);
                for (int i = 0; i < n; i++)
                {
                    float tilt = Mathf.Sin(i * 1.1f + s) * sway;
                    var rot = Quaternion.Euler(tilt, yaw, tilt * 0.5f);
                    var q = p + rot * Vector3.up * seg;
                    b.TaperBox((p + q) * 0.5f, new Vector3(0.34f, seg * 1.05f, 0.06f), g[(i + s) % 3], false, rot.eulerAngles, i == n - 1 ? 0.2f : 0.85f, 1f);
                    p = q;
                }
            }
            return b;
        }

        public static MeshBuilder Starfish(Color col)
        {
            var b = new MeshBuilder();
            b.Cylinder(new Vector3(0, 0.05f, 0), new Vector3(0.22f, 0.1f, 0.22f), col, false, default, 0.7f, 5);
            for (int i = 0; i < 5; i++)
            {
                var d = Quaternion.Euler(0, i * 72f, 0) * Vector3.forward;
                b.TaperBox(d * 0.24f + Vector3.up * 0.04f, new Vector3(0.13f, 0.34f, 0.07f), col, false, new Vector3(90, i * 72f, 0), 0.25f, 0.6f);
            }
            return b;
        }

        public static MeshBuilder Clam()
        {
            var b = new MeshBuilder();
            Color shell = C(0.80f, 0.74f, 0.86f), lip = C(0.40f, 0.72f, 0.86f);
            b.Hemisphere(new Vector3(0, 0.1f, 0), new Vector3(1.3f, 0.7f, 0.9f), shell, lip, false, new Vector3(180, 0, 0), 8);
            b.Hemisphere(new Vector3(0, 0.3f, -0.18f), new Vector3(1.3f, 0.7f, 0.9f), shell, lip, false, new Vector3(-38, 0, 0), 8);
            b.Sphere(new Vector3(0, 0.2f, 0.05f), new Vector3(0.22f, 0.22f, 0.22f), C(0.98f, 0.97f, 0.94f), false, default, 6);
            return b;
        }

        public static MeshBuilder Anchor()
        {
            var b = new MeshBuilder();
            var iron = C(0.26f, 0.28f, 0.32f);
            b.Cube(new Vector3(0, 1.1f, 0), new Vector3(0.18f, 2.2f, 0.18f), iron, false);
            b.Cube(new Vector3(0, 2.0f, 0), new Vector3(0.9f, 0.14f, 0.14f), iron, false);
            b.Cylinder(new Vector3(0, 2.4f, 0), new Vector3(0.5f, 0.1f, 0.5f), iron, false, new Vector3(90, 0, 0), 1f, 8);
            b.Cube(new Vector3(-0.5f, 0.35f, 0), new Vector3(1.1f, 0.18f, 0.18f), iron, false, new Vector3(0, 0, -32)).Cube(new Vector3(0.5f, 0.35f, 0), new Vector3(1.1f, 0.18f, 0.18f), iron, false, new Vector3(0, 0, 32));
            b.Cone(new Vector3(-0.98f, 0.72f, 0), new Vector3(0.36f, 0.4f, 0.2f), iron, false, default, 4).Cone(new Vector3(0.98f, 0.72f, 0), new Vector3(0.36f, 0.4f, 0.2f), iron, false, default, 4);
            return b;
        }

        public static MeshBuilder RockArch(System.Random rng, Color rock)
        {
            float R(float a, float c) => a + (float)rng.NextDouble() * (c - a);
            var b = new MeshBuilder();
            Color dark = Color.Lerp(rock, Color.black, 0.25f);
            float span = R(5f, 8f), h = R(4f, 6f);
            foreach (int s in new[] { -1, 1 })
            {
                b.Sphere(new Vector3(s * span * 0.5f, h * 0.3f, 0), new Vector3(R(2.4f, 3.2f), h * 0.9f, R(2.4f, 3.4f)), rock, false, new Vector3(0, R(0, 90), s * -8f), 5);
                b.Sphere(new Vector3(s * span * 0.42f, h * 0.75f, 0), new Vector3(R(2.2f, 3f), h * 0.6f, R(2.2f, 3f)), dark, false, new Vector3(0, R(0, 90), s * -20f), 5);
            }
            b.Sphere(new Vector3(0, h, 0), new Vector3(span * 1.25f, h * 0.42f, R(2.6f, 3.4f)), rock, false, new Vector3(0, 0, R(-5, 5)), 6);
            return b;
        }

        public static MeshBuilder Boulder(System.Random rng, Color rock, float size)
        {
            float R(float a, float c) => a + (float)rng.NextDouble() * (c - a);
            var b = new MeshBuilder();
            b.Sphere(new Vector3(0, size * 0.3f, 0), new Vector3(size * R(0.9f, 1.4f), size * R(0.6f, 1f), size * R(0.9f, 1.3f)), rock, false, new Vector3(R(-15, 15), R(0, 90), R(-15, 15)), 5);
            b.Sphere(new Vector3(size * 0.5f, size * 0.15f, size * 0.2f), new Vector3(size * 0.7f, size * 0.5f, size * 0.6f), Color.Lerp(rock, Color.black, 0.18f), false, new Vector3(R(-15, 15), R(0, 90), 0), 5);
            return b;
        }

        // ------------------------------------------------------------------ prehistoric
        public static MeshBuilder DinoSkeleton()
        {
            var b = new MeshBuilder();
            for (int i = 0; i < 12; i++)           // spine, arching
            {
                float t = i / 11f, z = Mathf.Lerp(-4f, 4f, t), y = 1.2f + Mathf.Sin(t * Mathf.PI) * 1.1f;
                b.Cube(new Vector3(0, y, z), new Vector3(0.26f, 0.3f, 0.5f), Bone, false, new Vector3(Mathf.Cos(t * Mathf.PI) * -24f, 0, 0));
                if (i > 2 && i < 9)
                    foreach (int s in new[] { -1, 1 })
                    {
                        float len = 1.5f - Mathf.Abs(i - 5.5f) * 0.16f;
                        b.TaperBox(new Vector3(s * len * 0.34f, y - len * 0.36f, z), new Vector3(0.1f, len, 0.12f), Bone, false, new Vector3(0, 0, s * 38f), 0.6f, 1f);
                    }
            }
            b.Cube(new Vector3(0, 2.0f, 4.7f), new Vector3(0.7f, 0.7f, 1.3f), Bone, false, new Vector3(-12, 0, 0));           // skull
            b.TaperBox(new Vector3(0, 1.6f, 5.0f), new Vector3(0.55f, 0.2f, 1.2f), Bone, false, new Vector3(8, 0, 0), 1f, 0.8f);
            b.Cube(new Vector3(0.36f, 2.1f, 4.6f), new Vector3(0.06f, 0.24f, 0.3f), new Color(0.2f, 0.18f, 0.16f), false).Cube(new Vector3(-0.36f, 2.1f, 4.6f), new Vector3(0.06f, 0.24f, 0.3f), new Color(0.2f, 0.18f, 0.16f), false);
            foreach (int s in new[] { -1, 1 })
            {
                b.TaperBox(new Vector3(s * 0.7f, 0.8f, 1.6f), new Vector3(0.2f, 1.6f, 0.2f), Bone, false, new Vector3(10, 0, s * 8f), 0.7f, 0.7f);
                b.TaperBox(new Vector3(s * 0.8f, 0.9f, -1.8f), new Vector3(0.26f, 1.8f, 0.26f), Bone, false, new Vector3(-12, 0, s * 8f), 0.7f, 0.7f);
            }
            return b;
        }

        public static MeshBuilder Nest()
        {
            var b = new MeshBuilder();
            b.Cylinder(new Vector3(0, 0.2f, 0), new Vector3(2.4f, 0.5f, 2.4f), BarkDark, false, default, 1.15f, 9);
            b.Cylinder(new Vector3(0, 0.42f, 0), new Vector3(1.9f, 0.1f, 1.9f), C(0.56f, 0.46f, 0.26f), false, default, 1f, 9);
            for (int i = 0; i < 5; i++)
            {
                var d = Quaternion.Euler(0, i * 72f, 0) * Vector3.forward * (i == 0 ? 0f : 0.48f);
                b.Sphere(new Vector3(d.x, 0.72f, d.z), new Vector3(0.44f, 0.6f, 0.44f), i % 2 == 0 ? C(0.94f, 0.92f, 0.82f) : C(0.84f, 0.90f, 0.84f), false, new Vector3(i * 7f, 0, i * -5f), 6);
            }
            return b;
        }

        public static MeshBuilder SmokePlume(System.Random rng, Color col)
        {
            float R(float a, float c) => a + (float)rng.NextDouble() * (c - a);
            var b = new MeshBuilder();
            float y = 0, x = 0;
            for (int i = 0; i < 7; i++)
            {
                float s = 10f + i * 6f;
                b.Sphere(new Vector3(x, y + s * 0.4f, R(-4, 4)), new Vector3(s, s * 0.8f, s), Color.Lerp(col, Color.white, i * 0.08f), false, new Vector3(0, R(0, 90), 0), 6);
                y += s * 0.55f; x += s * 0.35f;
            }
            return b;
        }

        // ------------------------------------------------------------------ sky
        public static MeshBuilder Cloud(System.Random rng, float size, bool tall = false)
        {
            float R(float a, float c) => a + (float)rng.NextDouble() * (c - a);
            var b = new MeshBuilder();
            Color white = C(0.99f, 0.99f, 1f), under = C(0.82f, 0.87f, 0.95f);
            int n = tall ? 9 : 6;
            for (int i = 0; i < n; i++)
            {
                float a = R(0, 360), d = i == 0 ? 0 : R(0.2f, 0.6f) * size, s = R(0.45f, 0.8f) * size;
                var o = Quaternion.Euler(0, a, 0) * Vector3.forward * d;
                float y = tall ? i * size * 0.16f : R(0f, 0.12f) * size;
                b.Sphere(new Vector3(o.x, y + s * 0.3f, o.z), new Vector3(s, s * R(0.55f, 0.75f), s), i % 3 == 2 ? under : white, false, new Vector3(0, R(0, 90), 0), 6);
            }
            return b;
        }

        public static MeshBuilder Blimp()
        {
            var b = new MeshBuilder();
            Color hull = C(0.92f, 0.36f, 0.28f), stripe = C(0.98f, 0.96f, 0.92f);
            b.Sphere(new Vector3(0, 0, 0), new Vector3(7f, 7f, 22f), hull, false, default, 9);
            b.Sphere(new Vector3(0, 0, 0), new Vector3(7.15f, 2.2f, 21f), stripe, false, default, 9);
            b.Cube(new Vector3(0, -3.9f, 1f), new Vector3(1.8f, 1.4f, 5f), C(0.28f, 0.30f, 0.36f), false);
            foreach (var e in new[] { new Vector3(0, 0, 0), new Vector3(0, 0, 90) })
                b.TaperBox(new Vector3(0, 0, -9.5f), new Vector3(0.3f, 7.5f, 3.2f), stripe, false, e, 1f, 0.5f);
            return b;
        }

        public static MeshBuilder Cairn(System.Random rng)
        {
            float R(float a, float c) => a + (float)rng.NextDouble() * (c - a);
            var b = new MeshBuilder();
            float y = 0;
            for (int i = 0; i < 6; i++)
            {
                float s = 0.9f - i * 0.12f;
                b.Sphere(new Vector3(R(-0.06f, 0.06f), y + s * 0.2f, R(-0.06f, 0.06f)), new Vector3(s, s * 0.45f, s * R(0.8f, 1f)), i % 2 == 0 ? Stone : StoneDark, false, new Vector3(0, R(0, 90), 0), 5);
                y += s * 0.34f;
            }
            return b;
        }

        public static MeshBuilder Flagpole(Color flag, float h = 5f)
        {
            var b = new MeshBuilder();
            b.Cylinder(new Vector3(0, h * 0.5f, 0), new Vector3(0.09f, h, 0.09f), C(0.80f, 0.82f, 0.86f), false, default, 1f, 5);
            b.Cube(new Vector3(0.62f, h - 0.45f, 0), new Vector3(1.2f, 0.75f, 0.04f), flag, false, new Vector3(0, 0, -4));
            b.Sphere(new Vector3(0, h + 0.05f, 0), new Vector3(0.18f, 0.18f, 0.18f), C(0.95f, 0.80f, 0.35f), false, default, 5);
            return b;
        }

        // ------------------------------------------------------------------ trackside
        public static MeshBuilder TyreStack(int count, Color a, Color c)
        {
            var b = new MeshBuilder();
            for (int i = 0; i < count; i++)
                b.Cylinder(new Vector3(0, 0.15f + i * 0.3f, 0), new Vector3(0.9f, 0.28f, 0.9f), i % 2 == 0 ? a : c, false, default, 1f, 8);
            return b;
        }

        /// <summary>Rows of seated spectators as small coloured blocks, rising toward the back (+Z), to sit on a grandstand.</summary>
        public static MeshBuilder Crowd(System.Random rng, float width, int rows, float stepDepth, float stepHeight, float fill = 0.8f)
        {
            float R(float a, float c) => a + (float)rng.NextDouble() * (c - a);
            var b = new MeshBuilder();
            Color[] coats = { C(0.86f, 0.24f, 0.22f), C(0.20f, 0.46f, 0.80f), C(0.98f, 0.80f, 0.26f), C(0.26f, 0.64f, 0.42f), C(0.94f, 0.94f, 0.96f), C(0.58f, 0.32f, 0.70f), C(0.98f, 0.55f, 0.20f), C(0.22f, 0.24f, 0.30f) };
            Color[] skin = { C(0.98f, 0.82f, 0.68f), C(0.80f, 0.60f, 0.44f), C(0.52f, 0.36f, 0.26f) };
            for (int r = 0; r < rows; r++)
                for (float x = -width * 0.5f + 0.4f; x < width * 0.5f - 0.3f; x += 0.62f)
                {
                    if (rng.NextDouble() > fill) continue;
                    var p = new Vector3(x + R(-0.06f, 0.06f), r * stepHeight, r * stepDepth);
                    b.Cube(p + new Vector3(0, 0.32f, 0), new Vector3(0.42f, 0.64f, 0.3f), coats[rng.Next(coats.Length)], false);
                    b.Cube(p + new Vector3(0, 0.78f, 0), new Vector3(0.26f, 0.26f, 0.26f), skin[rng.Next(skin.Length)], false);
                    if (rng.NextDouble() < 0.3) b.Cube(p + new Vector3(0, 0.94f, 0), new Vector3(0.3f, 0.1f, 0.3f), coats[rng.Next(coats.Length)], false);   // hat
                }
            return b;
        }

        public static MeshBuilder SkiPylon(float h)
        {
            var b = new MeshBuilder();
            var steel = C(0.52f, 0.56f, 0.62f);
            b.TaperBox(new Vector3(0, h * 0.5f, 0), new Vector3(0.7f, h, 0.7f), steel, false, default, 0.5f, 0.5f);
            b.Cube(new Vector3(0, h, 0), new Vector3(4.4f, 0.3f, 0.4f), steel, false);
            foreach (int s in new[] { -1, 1 }) b.Cube(new Vector3(s * 2f, h + 0.3f, 0), new Vector3(0.3f, 0.5f, 1.4f), C(0.30f, 0.33f, 0.38f), false);
            return b;
        }

        public static MeshBuilder SkiChair(Color col)
        {
            var b = new MeshBuilder();
            b.Cube(new Vector3(0, -1.2f, 0), new Vector3(0.06f, 2.4f, 0.06f), C(0.30f, 0.33f, 0.38f), false);
            b.Cube(new Vector3(0, -2.5f, 0), new Vector3(1.8f, 0.1f, 0.6f), col, false);
            b.Cube(new Vector3(0, -2.1f, -0.3f), new Vector3(1.8f, 0.8f, 0.08f), col, false);
            return b;
        }

        public static MeshBuilder Snowmobile()
        {
            var b = new MeshBuilder();
            Color body = C(0.94f, 0.36f, 0.20f), dark = C(0.16f, 0.18f, 0.22f);
            b.TaperBox(new Vector3(0, 0.55f, 0.2f), new Vector3(0.8f, 0.5f, 2.2f), body, false, default, 0.8f, 0.7f);
            b.Cube(new Vector3(0, 0.82f, -0.5f), new Vector3(0.5f, 0.2f, 1.0f), dark, false);
            b.Cube(new Vector3(0, 1.0f, 0.55f), new Vector3(0.7f, 0.4f, 0.08f), C(0.60f, 0.80f, 0.92f), false, new Vector3(-25, 0, 0));
            b.Cube(new Vector3(0, 0.22f, -0.6f), new Vector3(0.5f, 0.3f, 1.5f), dark, false);
            foreach (int s in new[] { -1, 1 }) b.Cube(new Vector3(s * 0.5f, 0.06f, 0.9f), new Vector3(0.14f, 0.06f, 1.2f), C(0.75f, 0.78f, 0.82f), false);
            return b;
        }
    }
}
