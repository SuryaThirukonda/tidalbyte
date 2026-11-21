using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace WishWorld.EditorTools
{
    public static partial class WishWorldBuilder
    {
        // ================================================================== rainforest
        static GameObject SceneryRainforest()
        {
            var s = new Scenery(25);
            var river = Spline(6, new Vector2(-170, 40), new Vector2(-80, 20), new Vector2(-34, 15), new Vector2(-6, 14.5f), new Vector2(16, 19), new Vector2(26, 30), new Vector2(60, 34), new Vector2(170, 20));
            var fall = new Vector2(27f, 40f);
            s.Height = (x, z) =>
            {
                float r = Len(x, z);
                float h = (N2(x, z, 44f) - 0.46f) * 7f * Smooth(10f, 44f, r) + (N2(x, z, 150f, 2f) - 0.4f) * 46f * Smooth(60f, 200f, r);
                h += Smooth(8f, 30f, z - 44f) * Smooth(60f, 20f, Mathf.Abs(x - fall.x)) * 15f;                       // the ledge the waterfall drops from
                h -= 1.5f * Smooth(5.5f, 1.5f, DistanceToPath(river, x, z));
                return h;
            };
            Color floor = new Color(0.24f, 0.40f, 0.20f), moss = new Color(0.34f, 0.52f, 0.22f), mud = new Color(0.36f, 0.30f, 0.20f);
            s.Terrain(190f, 30, 80, (p, n) =>
            {
                float dr = DistanceToPath(river, p.x, p.z);
                Color c = Color.Lerp(V(floor, 0.25f, p.x, p.z, 6f), moss, Smooth(0.5f, 0.75f, N2(p.x, p.z, 20f, 3f)));
                if (dr < 5f) c = Color.Lerp(mud, c, Smooth(3f, 5f, dr));
                if (n.y < 0.7f) c = Color.Lerp(c, new Color(0.34f, 0.36f, 0.32f), Smooth(0.7f, 0.45f, n.y));
                if (Len(p.x, p.z) > 120f) c = Color.Lerp(c, new Color(0.22f, 0.44f, 0.24f), 0.6f);                   // far canopy
                return c;
            }, 1.55f);
            s.Ribbon(river, 6.2f, 0.85f, new Color(0.24f, 0.46f, 0.44f));
            bool Land(float x, float z) => DistanceToPath(river, x, z) > 4.6f && Len(x - fall.x, z - (fall.y + 6f)) > 13f;
            var rng = new System.Random(12);

            // the waterfall: a wall of boulders with white water down the middle and a pool below
            var rockCol = new Color(0.38f, 0.40f, 0.36f);
            for (int i = 0; i < 22; i++)
            {
                float x = fall.x + s.R(-17f, 17f), y = s.R(0f, 13f), z = fall.y + 5f + s.R(-1.5f, 3f) + y * 0.25f;
                s.PutMesh(SceneryProps.Boulder(rng, Color.Lerp(rockCol, moss, s.R(0f, 0.5f)), s.R(4f, 7.5f)), x, z, 1f, float.NaN, 0f, null, y - 1.5f);
            }
            var wf = s.At(fall.x, fall.y);
            for (int k = 0; k < 7; k++)
            {
                float y0 = 14.5f - k * 2.2f, y1 = y0 - 2.2f, z0 = fall.y + 6.5f - k * 0.5f, z1 = z0 - 0.5f, w = 2.4f + k * 0.18f;
                wf.Quad(new Vector3(fall.x - w, y0, z0), new Vector3(fall.x + w, y0, z0), new Vector3(fall.x + w, y1, z1), new Vector3(fall.x - w, y1, z1),
                    k % 2 == 0 ? new Color(0.86f, 0.95f, 0.98f) : new Color(0.66f, 0.86f, 0.92f));
            }
            for (int i = 0; i < 7; i++) s.At(fall.x, fall.y).Sphere(new Vector3(fall.x + s.R(-3.5f, 3.5f), -0.2f + s.R(0f, 0.8f), fall.y + 1.5f + s.R(-1.5f, 1.5f)), Vector3.one * s.R(1.4f, 2.6f), new Color(0.92f, 0.97f, 0.98f), false, default, 5);
            s.Patch(fall.x, fall.y - 2f, 9f, -0.45f, new Color(0.26f, 0.50f, 0.48f), 14);
            for (int i = 0; i < 9; i++) { var p = river[s.RI(river.Count)]; s.Put(s.Pick("nature/lily_large", "nature/lily_small"), p.x + s.R(-1.6f, 1.6f), p.y + s.R(-1.6f, 1.6f), 0.14f, float.NaN, 0f, null, -0.48f); }
            s.Put("nature/bridge_wood", -6f, 14.5f, 7.5f, 90f, 0f, null, 0f, true);
            s.Put("nature/canoe", 10.5f, 16.2f, 0.7f, 70f, 0f, null, -0.45f);

            // overgrown ruins
            var mossy = Mix(new Color(0.40f, 0.52f, 0.30f), 0.35f);
            s.Put("nature/statue_head", -13f, 23f, 3.6f, Face(-13f, 23f), 0.06f, mossy);
            s.Put("nature/statue_obelisk", -8f, 26.5f, 5f, 0f, 0.03f, mossy);
            s.Put("nature/statue_column", -17f, 19f, 3.8f, 0f, 0.03f, mossy); s.Put("nature/statue_columnDamaged", -19.5f, 24f, 3.0f, 30f, 0.03f, mossy);
            s.Put("nature/statue_column", -10.5f, 19.5f, 3.8f, 0f, 0.03f, mossy); s.Put("nature/statue_ring", -15f, 27.5f, 2.8f, 20f, 0.05f, mossy);
            for (int i = 0; i < 9; i++) s.Put("nature/path_stone", -11f + s.R(-0.6f, 0.6f), 11.5f + i * 1.25f, 0.08f, s.R(0, 360), 0f, mossy);

            // the forest: tall trunks close in, giants standing over them, a thick understory
            string[] trunks = { "nature/tree_tall", "nature/tree_tall_dark", "nature/tree_fat", "nature/tree_fat_darkh", "nature/tree_oak", "nature/tree_oak_dark", "nature/tree_detailed", "nature/tree_detailed_dark", "nature/tree_default_dark", "town/tree-high", "town/tree-high-round" };
            s.Scatter(trunks, 330, 9.5f, 170f, 14f, 27f, Land, 1.25f, null, 0.02f, 4.2f);
            s.Scatter(new[] { "nature/tree_tall", "nature/tree_fat", "nature/tree_plateau" }, 16, 24f, 150f, 34f, 46f, Land, 1f, null, 0.02f, 16f);
            s.Scatter(Palms, 70, 9.5f, 110f, 5f, 10f, Land, 1.5f, null, 0.03f, 3f);
            s.Scatter(new[] { "nature/crops_bambooStageB", "nature/crops_bambooStageA" }, 70, 10f, 70f, 3f, 6f, Land, 1.4f);
            s.Scatter(Bushes, 320, 8.5f, 120f, 0.7f, 2.2f, Land, 1.7f, Leaves(new Color(0.20f, 0.48f, 0.22f), 0.4f));
            s.Scatter(new[] { "nature/plant_flatTall", "nature/plant_flatShort", "nature/grass_leafsLarge" }, 260, 8.5f, 90f, 0.6f, 1.6f, Land, 1.6f);
            s.Scatter(new[] { "nature/plant_flatShort", "nature/grass_leafs", "nature/grass_large", "nature/plant_bushSmall" }, 170, 2.3f, 9f, 0.22f, 0.5f, Land);
            s.Scatter(Flowers, 130, 2.6f, 40f, 0.3f, 0.6f, Land, 1.4f);
            s.Scatter(new[] { "nature/mushroom_redGroup", "nature/mushroom_tanGroup", "nature/mushroom_red", "nature/mushroom_tanTall" }, 60, 2.8f, 50f, 0.25f, 0.6f, Land, 1.4f);
            s.Scatter(new[] { "nature/log_large", "nature/log", "nature/stump_old", "nature/stump_oldTall", "nature/stump_round" }, 40, 9.5f, 90f, 0.5f, 1.3f, Land, 1.4f, mossy);
            s.Scatter(Rocks, 80, 9.5f, 150f, 0.6f, 2.4f, Land, 1.4f, mossy, 0.1f);
            for (int i = 0; i < 150; i++)      // vines and moss hanging in the gaps between the trunks
            {
                float a = s.R(0f, 6.28f), d = s.R(8.5f, 60f), x = Mathf.Cos(a) * d, z = Mathf.Sin(a) * d, len = s.R(2.5f, 6f);
                if (Land(x, z)) s.Put("nature/hanging_moss", x, z, len, float.NaN, 0f, null, s.H(x, z) + s.R(6f, 12f), false, null, 1f);
            }
            return s.Save("rainforest");
        }

        // ================================================================== coral reef
        static GameObject SceneryReef()
        {
            var s = new Scenery(26);
            float Mound(float x, float z) => Smooth(0.52f, 0.74f, N2(x, z, 34f, 2f)) * Smooth(11f, 22f, Len(x, z));
            s.Height = (x, z) =>
            {
                float r = Len(x, z);
                float h = (N2(x, z, 17f) - 0.5f) * 1.7f * Smooth(8f, 26f, r) + Mound(x, z) * 6.5f;
                h -= Smooth(-34f, -95f, z) * 34f;                                                                    // the drop-off into deep water behind
                return h;
            };
            Color sand = new Color(0.88f, 0.80f, 0.60f), reef = new Color(0.46f, 0.42f, 0.50f);
            s.Terrain(150f, 30, 76, (p, n) =>
            {
                float ripple = Mathf.Sin(p.x * 1.5f + p.z * 0.7f + N2(p.x, p.z, 9f) * 5f);
                Color c = sand * (ripple > 0.2f ? 1f : 0.93f);
                c = Color.Lerp(c, V(reef, 0.2f, p.x, p.z, 5f), Mathf.Max(Mound(p.x, p.z), Smooth(0.82f, 0.6f, n.y)));
                c = Color.Lerp(c, new Color(0.20f, 0.34f, 0.50f), Smooth(-4f, -30f, p.y));
                c.a = 1f; return c;
            }, 1.5f);
            // the surface of the sea, seen from below
            var bed = s.Height; s.Height = (x, z) => 15f + (N2(x, z, 9f, 4f) - 0.5f) * 1.6f;
            s.Terrain(150f, 14, 40, (p, n) => Color.Lerp(new Color(0.42f, 0.80f, 0.94f), new Color(0.80f, 0.97f, 1f), Smooth(0.35f, 0.75f, N2(p.x, p.z, 6f, 6f))), 1.3f, 0f, true);
            s.Height = bed;
            var rng = new System.Random(13);

            // the wreck, with what spilled out of it
            s.Put("pirate/ship-wreck", -17f, 27f, 17f, 35f, 0.07f, Mix(new Color(0.34f, 0.40f, 0.36f), 0.45f), float.NaN, false, new Vector3(4f, 0f, 16f));
            s.Put("pirate/chest", -8.5f, 20f, 0.95f, 150f, 0.05f); s.Put("pirate/chest", -11f, 17.5f, 0.8f, 40f, 0.2f, null, float.NaN, false, new Vector3(18f, 0, 0));
            foreach (var (x, z) in new[] { (-9.5f, 23f), (-6.5f, 18f), (-12.5f, 20.5f), (-5f, 22f) }) s.Put("pirate/barrel", x, z, 0.9f, float.NaN, 0.1f, null, float.NaN, false, new Vector3(s.R(0, 80), 0, s.R(0, 80)));
            s.Put("pirate/cannon", -4.5f, 25f, 0.8f, 70f, 0.1f, Mix(new Color(0.30f, 0.40f, 0.36f), 0.4f));
            s.Put("pirate/crate", -13.5f, 17f, 0.8f); s.Put("pirate/cannon-ball", -6f, 24f, 0.3f); s.Put("pirate/cannon-ball", -5.4f, 24.5f, 0.3f);
            s.PutMesh(SceneryProps.Anchor(), 8.5f, 13.5f, 1.3f, 30f, 0.2f, null, float.NaN, new Vector3(0, 0, 58f));
            foreach (var (x, z) in new[] { (30f, 24f), (-38f, -6f), (12f, 44f) }) s.PutMesh(SceneryProps.RockArch(rng, new Color(0.44f, 0.42f, 0.50f)), x, z, s.R(1f, 1.5f), float.NaN, 0.5f);

            s.ScatterMade(() => SceneryProps.Coral(rng), 380, 8.5f, 110f, 0.9f, 2.6f, (x, z) => Mound(x, z) > 0.12f || N2(x, z, 12f, 8f) > 0.62f, 1.5f, 1.1f, 0.05f);
            s.ScatterMade(() => SceneryProps.Coral(rng), 46, 3.4f, 9f, 0.35f, 0.6f, null, 1f, 0.9f);                 // low ones near you, under the swimmers
            for (int i = 0; i < 9; i++) { float a = i * 0.72f + 0.2f, d = s.R(4.2f, 7.2f); s.PutMesh(SceneryProps.Coral(rng, 5), Mathf.Cos(a) * d, Mathf.Sin(a) * d, 0.9f); }   // anemones
            s.ScatterMade(() => SceneryProps.Kelp(rng), 110, 11f, 110f, 0.9f, 1.7f, (x, z) => N2(x, z, 26f, 11f) > 0.5f, 1.4f, 1.6f);
            s.ScatterMade(() => SceneryProps.Clam(), 14, 6f, 50f, 0.7f, 1.4f, null, 1.4f, 3f);
            Color[] stars = { new Color(0.96f, 0.46f, 0.30f), new Color(0.92f, 0.36f, 0.56f), new Color(0.98f, 0.76f, 0.30f), new Color(0.50f, 0.42f, 0.80f) };
            s.ScatterMade(() => SceneryProps.Starfish(stars[rng.Next(4)]), 50, 2.2f, 40f, 0.9f, 1.8f, null, 1.5f, 0.6f, -0.01f);
            s.Scatter(new[] { "pirate/rocks-sand-a", "pirate/rocks-sand-b", "pirate/rocks-sand-c", "pirate/rocks-a", "pirate/rocks-b", "pirate/rocks-c" }, 60, 9.5f, 130f, 1.0f, 3.6f, null, 1.2f, Mix(new Color(0.46f, 0.46f, 0.56f), 0.55f), 0.12f, 5f);
            s.Scatter(Pebbles, 70, 2.4f, 40f, 0.15f, 0.5f, null, 1.4f, Mix(new Color(0.60f, 0.58f, 0.62f), 0.4f));
            for (int i = 0; i < 16; i++)       // columns of bubbles
            {
                float a = s.R(0f, 6.28f), d = s.R(5.5f, 40f), x = Mathf.Cos(a) * d, z = Mathf.Sin(a) * d, y = s.H(x, z);
                var mb = s.At(x, z);
                for (int k = 0; k < 10; k++)
                    mb.Sphere(new Vector3(x + Mathf.Sin(k * 1.7f) * 0.18f, y + 0.4f + k * s.R(0.9f, 1.3f), z + Mathf.Cos(k * 2.3f) * 0.18f), Vector3.one * s.R(0.06f, 0.16f), new Color(0.86f, 0.97f, 1f), false, default, 5);
            }
            return s.Save("aquarium");
        }

        // ================================================================== moon base
        static GameObject SceneryMoon()
        {
            var s = new Scenery(27);
            var crng = new System.Random(3);
            var craters = new List<Vector3>();     // x, z, radius
            for (int i = 0; i < 70; i++)
            {
                float a = (float)crng.NextDouble() * 6.28f, d = Mathf.Sqrt(Mathf.Lerp(16f * 16f, 560f * 560f, (float)crng.NextDouble()));
                craters.Add(new Vector3(Mathf.Cos(a) * d, Mathf.Sin(a) * d, Mathf.Lerp(4f, 10f + d * 0.12f, (float)crng.NextDouble())));
            }
            float Crater(float x, float z)
            {
                float h = 0f;
                foreach (var c in craters)
                {
                    float d = Len(x - c.x, z - c.y), R = c.z;
                    if (d > R * 1.7f) continue;
                    h += d < R ? -R * 0.30f * (1f - (d / R) * (d / R)) : 0f;
                    h += R * 0.14f * Mathf.Exp(-Mathf.Pow((d - R) / (0.22f * R), 2f));
                }
                return h;
            }
            s.Height = (x, z) =>
            {
                float r = Len(x, z);
                return ((N2(x, z, 60f) - 0.5f) * 5f + Crater(x, z)) * Smooth(9f, 20f, r) + Smooth(230f, 600f, r) * Ridge(x, z, 200f, 8f) * 170f;
            };
            Color dust = new Color(0.60f, 0.60f, 0.62f);
            s.Terrain(700f, 38, 92, (p, n) =>
            {
                Color c = V(dust, 0.22f, p.x, p.z, 12f);
                float cr = Crater(p.x, p.z);
                if (cr < -0.6f) c *= Mathf.Lerp(1f, 0.72f, Smooth(-0.6f, -4f, cr));
                if (n.y < 0.8f) c = Color.Lerp(c, new Color(0.78f, 0.78f, 0.80f), Smooth(0.8f, 0.55f, n.y));
                c.a = 1f; return c;
            });
            bool Out(float x, float z) => !(x > 6f && x < 52f && z > 10f && z < 56f) && Len(x + 22f, z - 15f) > 12f;       // keep the base and the pad clear

            // the base
            s.Put("qspace/Geodesic_Dome", 21f, 30f, 8f, 0f, 0.02f);
            s.Put("qspace/Base_Large", 38f, 26f, 7f, 200f, 0.02f);
            s.Put("qspace/House_Long", 26f, 16f, 4.6f, 90f, 0.02f); s.Put("qspace/House_Long", 36f, 42f, 4.6f, 20f, 0.02f);
            s.Put("qspace/House_Pod", 13f, 20f, 3.4f, 40f, 0.02f); s.Put("qspace/House_Cylinder", 15f, 38f, 4.2f, 0f, 0.02f); s.Put("qspace/House_Single", 46f, 34f, 3.6f, 0f, 0.02f);
            s.Put("qspace/Connector", 29.5f, 28.5f, 2.2f, 80f, 0.02f); s.Put("qspace/Connector", 17f, 25f, 2.2f, 130f, 0.02f);
            for (int i = 0; i < 10; i++) s.Put("qspace/Solar_Panel", 10f + (i % 5) * 4.2f, 48f + (i / 5) * 4.5f, 2.6f, 180f, 0.02f);
            s.Put("qspace/Solar_Panel_Structure", 34f, 52f, 5f, 180f, 0.02f);
            s.Put("qspace/Roof_Radar", 44f, 22f, 5f, 0f, 0.02f); s.Put("qspace/Roof_Antenna", 12f, 30f, 6f, 0f, 0.02f);
            s.Put("space/stationLarge", 46f, 48f, 17f, 0f, 0.02f); s.Put("space/station", 8f, 42f, 9f, 0f, 0.02f);
            s.Put("space/satelliteDishLarge", -19f, 34f, 10f, Face(-19f, 34f) + 180f, 0.02f); s.Put("space/satelliteDish", -27f, 28f, 5f, 120f, 0.02f);
            s.Put("space/barrelLarge", 14f, 14f, 1.5f); s.Put("space/barrel", 15.5f, 14.6f, 1.0f); s.Put("space/barrel", 15f, 13.2f, 1.0f);
            for (int i = 0; i < 8; i++) s.Put("space/metalFence", 9f + i * 2.4f, 11f, 1.2f, 0f, 0f, null, float.NaN, false);
            // landing pad and ships
            s.Patch(-22f, 15f, 9.5f, 0.03f, new Color(0.30f, 0.32f, 0.36f), 18, 0.02f);
            s.Patch(-22f, 15f, 7.6f, 0.05f, new Color(0.96f, 0.78f, 0.24f), 18, 0.02f);
            s.Patch(-22f, 15f, 7.0f, 0.07f, new Color(0.34f, 0.36f, 0.40f), 18, 0.02f);
            s.Put("qspace/Spaceship", -22f, 15f, 4.6f, 70f, 0f, null, 0.08f);
            s.Put("space/spaceCraft1", 80f, -30f, 8f, 20f); s.Put("space/spaceCraft3", -70f, 70f, 7f, 200f); s.Put("space/spaceCraft6", 10f, 90f, 7f, 0f);
            // a rover and its tracks
            s.Put("qspace/Rover", 5.2f, 11.5f, 2.0f, 205f, 0f);
            var track = Spline(5, new Vector2(4.4f, 9.8f), new Vector2(-2f, -10f), new Vector2(-20f, -34f), new Vector2(-70f, -60f), new Vector2(-160f, -70f));
            foreach (float off in new[] { -0.7f, 0.7f })
            {
                var side = new List<Vector2>();
                for (int i = 0; i < track.Count; i++) { var d = (track[Mathf.Min(i + 1, track.Count - 1)] - track[Mathf.Max(i - 1, 0)]).normalized; side.Add(track[i] + new Vector2(-d.y, d.x) * off); }
                s.Ribbon(side, 0.32f, 0.02f, new Color(0.44f, 0.44f, 0.46f));
            }
            s.Put("space/astronaut", 7.6f, 12.6f, 1.9f, 200f); s.Put("space/astronaut", -18f, 21f, 1.9f, 80f);
            s.PutMesh(SceneryProps.Flagpole(new Color(0.24f, 0.46f, 0.86f), 3.2f), -4.4f, 9.2f);
            s.Scatter(new[] { "space/rocks", "space/rocksSmall", "space/rocksTall", "space/rocksOre", "space/rocksSmallOre" }, 190, 9.5f, 520f, 0.5f, 5f, Out, 1.5f, Mix(dust, 0.8f), 0.08f, 3f);
            s.Scatter(new[] { "qspace/Rock_Large", "qspace/Rock" }, 44, 30f, 600f, 4f, 16f, Out, 1.2f, null, 0.1f, 14f);
            s.Scatter(new[] { "space/crater", "space/craterLarge" }, 30, 10.5f, 120f, 0.5f, 1.3f, Out, 1.4f, Mix(dust, 0.75f), 0.3f, 7f);
            s.Scatter(new[] { "space/meteorHalf", "space/meteorFull" }, 9, 30f, 300f, 3f, 9f, Out, 1f, Mix(new Color(0.40f, 0.38f, 0.38f), 0.7f), 0.35f, 30f);
            s.Scatter(Pebbles, 90, 2.4f, 30f, 0.12f, 0.4f, null, 1.4f, Mix(dust, 0.85f));
            // the Earth, low over the mountains ahead
            var earth = CreatureMeshes.Earth(); float es = 150f / Mathf.Max(0.01f, earth.Bounds.size.y);
            s.At(-200f, 600f).Append(earth, new Vector3(-190f, 250f, 640f), Quaternion.Euler(20f, 40f, 12f), Vector3.one * es);
            return s.Save("space");
        }

        // ================================================================== a summit above the clouds
        static GameObject ScenerySummit()
        {
            var s = new Scenery(28);
            s.Height = (x, z) =>
            {
                float r = Len(x, z);
                float ridge = Mathf.Exp(-Mathf.Pow(x / (9f + r * 0.2f), 2f)) * Smooth(40f, 0f, z) * (z < 0 ? 1f : 0.3f);     // a spine running back from the top
                float fall = Mathf.Pow(Mathf.Max(0f, r - 4.6f), 1.16f) * 1.15f * (1f - 0.55f * ridge);
                return -fall + (N2(x, z, 9f) - 0.5f) * 2.2f * Smooth(5f, 14f, r) + (Ridge(x, z, 40f, 3f) - 0.5f) * 12f * Smooth(14f, 60f, r);
            };
            Color snow = new Color(0.95f, 0.97f, 1f), rock = new Color(0.44f, 0.42f, 0.44f), dark = new Color(0.30f, 0.29f, 0.32f);
            s.Terrain(230f, 30, 72, (p, n) =>
            {
                Color c = Color.Lerp(snow, new Color(0.84f, 0.90f, 0.98f), N2(p.x, p.z, 7f, 2f));
                if (n.y < 0.80f) c = Color.Lerp(c, Color.Lerp(rock, dark, N2(p.x, p.z, 11f, 5f)), Smooth(0.80f, 0.60f, n.y));
                return c;
            }, 1.6f);
            // the sea of cloud below
            var ground = s.Height;
            s.Height = (x, z) => -46f + (N2(x, z, 70f, 3f) - 0.5f) * 30f + (N2(x, z, 19f, 4f) - 0.5f) * 8f;
            s.Terrain(780f, 30, 72, (p, n) => Color.Lerp(new Color(0.80f, 0.86f, 0.95f), Color.white, Smooth(0.7f, 0.98f, n.y) * Smooth(-58f, -36f, p.y)), 1.3f);
            var rng = new System.Random(14);
            for (int i = 0; i < 34; i++)       // towers of cloud standing out of the sea
            {
                float a = s.R(0f, 6.28f), d = s.R(210f, 720f), x = Mathf.Cos(a) * d, z = Mathf.Sin(a) * d;
                s.PutMesh(SceneryProps.Cloud(rng, s.R(50f, 130f), true), x, z, 1f, float.NaN, 0f, null, s.H(x, z) - 6f);
            }
            for (int i = 0; i < 14; i++)       // and loose ones drifting at eye level
            {
                float a = s.R(0f, 6.28f), d = s.R(130f, 420f), x = Mathf.Cos(a) * d, z = Mathf.Sin(a) * d;
                s.PutMesh(SceneryProps.Cloud(rng, s.R(12f, 34f)), x, z, 1f, float.NaN, 0f, null, s.R(-24f, 40f));
            }
            s.Height = ground;
            // other peaks breaking through
            foreach (var (px, pz, ph) in new[] { (260f, 420f, 190f), (-380f, 300f, 230f), (-180f, 560f, 260f), (480f, 80f, 170f), (120f, -520f, 240f), (-520f, -160f, 200f), (340f, -300f, 150f), (-90f, 330f, 120f) })
            {
                var mb = s.At(px, pz);
                float w = ph * 1.5f;
                mb.Cone(new Vector3(px, -70f + ph * 0.5f, pz), new Vector3(w, ph, w), rock, false, new Vector3(0, s.R(0, 60), 0), 7);
                mb.Cone(new Vector3(px + w * 0.22f, -70f + ph * 0.32f, pz - w * 0.12f), new Vector3(w * 0.7f, ph * 0.64f, w * 0.7f), dark, false, new Vector3(0, s.R(0, 60), 0), 6);
                mb.Cone(new Vector3(px, -70f + ph * 0.78f, pz), new Vector3(w * 0.46f, ph * 0.455f, w * 0.46f), snow, false, new Vector3(0, s.R(0, 60), 0), 7);
            }
            // on the summit
            s.PutMesh(SceneryProps.Cairn(rng), -3.3f, 2.6f, 1.2f);
            s.PutMesh(SceneryProps.Flagpole(new Color(0.90f, 0.26f, 0.22f), 3.4f), 3.4f, 2.4f);
            s.Put("survival/tent", -1.5f, -6.5f, 1.7f, 20f, 0.03f, Mix(new Color(0.96f, 0.56f, 0.14f), 0.7f));
            s.Put("survival/bedroll-packed", 0.6f, -5.6f, 0.3f); s.Put("survival/box-large", 1.4f, -6.4f, 0.45f);
            s.Scatter(new[] { "holiday/rocks-large", "holiday/rocks-medium", "holiday/rocks-small" }, 46, 4.6f, 90f, 0.6f, 4f, null, 1.5f, null, 0.15f);
            s.Scatter(new[] { "holiday/rocks-small", "holiday/rocks-medium" }, 24, 2.8f, 5.2f, 0.15f, 0.4f);
            // balloons and an airship out over the cloud
            for (int i = 0; i < 9; i++)
            {
                float a = s.R(0f, 6.28f), d = s.R(70f, 420f), x = Mathf.Cos(a) * d, z = Mathf.Sin(a) * d;
                float h = s.R(0f, 1f);
                s.PutMesh(CreatureMeshes.Balloon(), x, z, s.R(3f, 5f), float.NaN, 0f, Hue(h, 1f, 1f), s.R(-20f, 60f));
            }
            s.PutMesh(SceneryProps.Blimp(), 150f, 240f, 1.4f, 60f, 0f, null, 30f);
            return s.Save("sky");
        }

        // ------------------------------------------------------------------ checking by picture
        /// <summary>
        /// Renders a surroundings prefab from a chosen viewpoint to Logs/verification/scenery/&lt;file&gt;.png, with the
        /// world's own sky, sun and fog, so a build can be checked without entering Play mode.
        /// </summary>
        public static string SceneryShot(string id, Vector3 eye, Vector3 lookAt, string file, float fov = 70f, bool track = false)
        {
            LoadShared();
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(SceneryFolder + "/" + id + ".prefab");
            if (prefab == null) return "no scenery for " + id;
            var def = AssetDatabase.LoadAssetAtPath<WorldDefinition>(Root + "/Definitions/Worlds/" + id + ".asset");
            var origin = new Vector3(0, 3000, 0);
            var go = UnityEngine.Object.Instantiate(prefab, origin, Quaternion.identity);
            GameObject extra = null;
            if (track)
            {
                var tm = AssetDatabase.LoadAssetAtPath<Mesh>(Gen + "/Meshes/SnowCircuitTrack.asset");
                if (tm != null) { extra = MeshObject("Track", tm); extra.transform.position = origin; }
            }
            var camGo = new GameObject("__shotCam");
            var cam = camGo.AddComponent<Camera>();
            cam.fieldOfView = fov; cam.nearClipPlane = 0.1f; cam.farClipPlane = FarClip; cam.allowHDR = false;
            cam.clearFlags = CameraClearFlags.Skybox;
            camGo.transform.position = origin + eye; camGo.transform.LookAt(origin + lookAt);
            var lightGo = new GameObject("__shotLight");
            var light = lightGo.AddComponent<Light>(); light.type = LightType.Directional;
            var oldSky = RenderSettings.skybox; bool oldFog = RenderSettings.fog; var oldCol = RenderSettings.fogColor;
            float oldS = RenderSettings.fogStartDistance, oldE = RenderSettings.fogEndDistance; var oldMode = RenderSettings.fogMode;
            Material sky = null;
            string skyName = track ? "Race" : null;
            Vector3 sunDir = new Vector3(0.4f, -0.7f, 0.4f); Color lightCol = Color.white; float intensity = 1f; Color amb = new Color(0.7f, 0.72f, 0.76f);
            Texture2D skyTex = null; Color fogCol = Color.white; float fogEnd = 0f, fogStart = 0.2f;
            if (def != null)
            {
                skyTex = def.skyTexture; fogCol = def.fogColor; fogEnd = def.fogEnd; fogStart = def.fogStart;
                if (def.sunDirection.sqrMagnitude > 0.01f) sunDir = def.sunDirection;
                lightCol = def.lightColor; intensity = def.lightIntensity; amb = def.ambientColor;
            }
            else if (skyName != null)
            {
                skyTex = SkyPhoto(skyName); fogCol = SkyHorizon(skyName, Color.white); fogEnd = 700f; fogStart = 0.12f;
                var d = SunDirection(skyName); if (d.sqrMagnitude > 0.01f) sunDir = d;
            }
            light.color = lightCol; light.intensity = intensity; lightGo.transform.rotation = Quaternion.LookRotation(sunDir);
            var baseSky = AssetDatabase.LoadAssetAtPath<Material>(Gen + "/Materials/M_SkyPanorama.mat");
            if (baseSky != null && skyTex != null) { sky = new Material(baseSky); sky.SetTexture("_MainTex", skyTex); RenderSettings.skybox = sky; }
            RenderSettings.fog = fogEnd > 0f; RenderSettings.fogMode = FogMode.Linear; RenderSettings.fogColor = fogCol;
            RenderSettings.fogStartDistance = fogEnd * fogStart; RenderSettings.fogEndDistance = Mathf.Max(1f, fogEnd);
            WWEnv.SetAmbient(amb);

            int w = 1280, h = 720;
            var rt = new RenderTexture(w, h, 24, RenderTextureFormat.ARGB32) { antiAliasing = 4 };
            var request = new UniversalRenderPipeline.SingleCameraRequest { destination = rt };
            RenderPipeline.SubmitRenderRequest(cam, request);
            var prev = RenderTexture.active; RenderTexture.active = rt;
            var tex = new Texture2D(w, h, TextureFormat.RGB24, false);
            tex.ReadPixels(new Rect(0, 0, w, h), 0, 0);
            RenderTexture.active = prev;
            string path = "Logs/verification/scenery/" + file + ".png";
            Directory.CreateDirectory(System.IO.Path.GetDirectoryName(path));
            File.WriteAllBytes(path, tex.EncodeToPNG());
            RenderSettings.skybox = oldSky; RenderSettings.fog = oldFog; RenderSettings.fogColor = oldCol;
            RenderSettings.fogStartDistance = oldS; RenderSettings.fogEndDistance = oldE; RenderSettings.fogMode = oldMode;
            UnityEngine.Object.DestroyImmediate(tex); rt.Release(); UnityEngine.Object.DestroyImmediate(rt);
            UnityEngine.Object.DestroyImmediate(go); UnityEngine.Object.DestroyImmediate(camGo); UnityEngine.Object.DestroyImmediate(lightGo);
            if (extra != null) UnityEngine.Object.DestroyImmediate(extra);
            if (sky != null) UnityEngine.Object.DestroyImmediate(sky);
            return path;
        }
    }
}
