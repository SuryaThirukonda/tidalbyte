using System;
using System.Collections.Generic;
using UnityEditor;
using UnityEngine;

namespace WishWorld.EditorTools
{
    public static partial class WishWorldBuilder
    {
        static float YawOf(Vector3 dir) => Mathf.Atan2(dir.x, dir.z) * Mathf.Rad2Deg;          // turns +Z onto dir
        static float YawX(Vector3 dir) => Mathf.Atan2(-dir.z, dir.x) * Mathf.Rad2Deg;         // turns +X onto dir

        /// <summary>
        /// The alpine valley the Snow Circuit runs through: snowfields and mountains to the horizon, forest, a village
        /// with a church, a ski lift, a frozen lake, and around the track itself grandstands with a crowd, the pit
        /// building and paddock, barriers, billboards, flags and lights.
        /// </summary>
        public static GameObject SceneryRace(TrackData t)
        {
            var s = new Scenery(30);
            var pts = t.points; int n = pts.Length; float half = t.width * 0.5f;
            var loop = new List<Vector2>();
            var centre = Vector2.zero;
            for (int i = 0; i < n; i += 2) { loop.Add(new Vector2(pts[i].x, pts[i].z)); centre += new Vector2(pts[i].x, pts[i].z); }
            centre /= loop.Count; loop.Add(loop[0]);
            s.Center = centre;
            float D(float x, float z) => DistanceToPath(loop, x, z);
            Vector3 Dir(int i) => (pts[((i + 1) % n + n) % n] - pts[((i - 1) % n + n) % n]).normalized;
            Vector3 Side(int i) => Vector3.Cross(Vector3.up, Dir(i));                               // points into the infield
            Vector3 P(int i, float off) => pts[((i % n) + n) % n] + Side(i) * off;
            float Turn(int i) { var a = Dir(i - 5); var b = Dir(i + 5); return a.z * b.x - a.x * b.z; }   // > 0 turning right

            var lake = new Vector2(96f, 2f);
            var village = new Vector2(-84f, 96f);
            var liftA = new Vector2(-40f, 150f); var liftB = new Vector2(-150f, 360f);
            var road = Spline(6, new Vector2(-22f, -6f), new Vector2(-28f, 30f), new Vector2(-46f, 62f), village + new Vector2(10f, -8f), village + new Vector2(-30f, 20f), new Vector2(-190f, 150f), new Vector2(-330f, 170f));
            s.Height = (x, z) =>
            {
                float d = D(x, z), rc = Len(x - centre.x, z - centre.y);
                float h = Smooth(11f, 36f, d) * ((N2(x, z, 78f) - 0.42f) * 18f + (N2(x, z, 22f, 2f) - 0.5f) * 3f);
                h += Smooth(150f, 600f, rc) * Ridge(x, z, 200f, 5f) * 250f;
                h -= 1.3f * Smooth(23f, 14f, Len(x - lake.x, z - lake.y));
                return Mathf.Lerp(-0.14f, h, Smooth(6.4f, 9f, d));                                  // just under the road and its banks
            };
            Color snow = new Color(0.95f, 0.97f, 1f), shade = new Color(0.82f, 0.89f, 0.97f), rock = new Color(0.44f, 0.42f, 0.44f), rockDark = new Color(0.30f, 0.30f, 0.34f);
            s.Terrain(720f, 48, 116, (p, nrm) =>
            {
                Color c = Color.Lerp(snow, shade, N2(p.x, p.z, 13f, 2f));
                if (DistanceToPath(road, p.x, p.z) < 2.4f && D(p.x, p.z) > 8f) c = new Color(0.80f, 0.84f, 0.90f);            // packed snow road
                if (nrm.y < 0.82f) c = Color.Lerp(c, Color.Lerp(rock, rockDark, N2(p.x, p.z, 30f, 4f)), Smooth(0.82f, 0.60f, nrm.y));
                return c;
            }, 1.7f);
            s.Patch(lake.x, lake.y, 17.5f, -0.62f, new Color(0.70f, 0.86f, 0.96f), 18, 0.14f);
            s.Patch(lake.x - 3f, lake.y + 2f, 9f, -0.60f, new Color(0.80f, 0.92f, 0.99f), 12, 0.3f);
            var rng = new System.Random(15);
            bool Inside(float x, float z)       // inside the loop of the track
            {
                bool c = false; var q = new Vector2(x, z);
                for (int i = 0, j = loop.Count - 1; i < loop.Count; j = i++)
                    if ((loop[i].y > q.y) != (loop[j].y > q.y) && q.x < (loop[j].x - loop[i].x) * (q.y - loop[i].y) / (loop[j].y - loop[i].y) + loop[i].x) c = !c;
                return c;
            }
            bool Wild(float x, float z) => D(x, z) > 11f && Len(x - lake.x, z - lake.y) > 21f && Len(x - village.x, z - village.y) > 34f
                                           && DistanceToPath(road, x, z) > 5f && DistanceToPath(new[] { liftA, liftB }, x, z) > 13f && !Inside(x, z);

            // ---- along the start straight: three grandstands outside, the pit building inside
            foreach (int i in new[] { 8, 22, 36 })
            {
                var p = P(i, -(half + 10.5f));
                float yaw = YawOf(Side(i)) + StandYaw;
                s.Put("racing/" + (i == 22 ? "grandStandCovered" : "grandStand"), p.x, p.z, i == 22 ? 9.6f : 7.4f, yaw, 0f);
                var seat = Quaternion.Euler(0, yaw, 0) * new Vector3(0, 0, -3.15f);                  // the lowest row; the rows climb toward the back
                s.PutMesh(SceneryProps.Crowd(rng, 7.0f, 7, 0.92f, 0.47f), p.x + seat.x, p.z + seat.z, 1f, yaw, 0f, null, 2.1f);
            }
            for (int i = 2; i <= 44; i += 5) { var p = P(i, -(half + 4.2f)); s.Put("racing/fenceStraight", p.x, p.z, 1.5f, YawX(Dir(i)), 0f, null, float.NaN, false, null, 1f); }
            foreach (int i in new[] { 7, 20, 33 }) { var p = P(i, half + 12.5f); s.Put("racing/pitsGarage", p.x, p.z, 5.6f, YawOf(-Side(i)) + PitYaw, 0f); }
            { var p = P(46, half + 12.5f); s.Put("racing/pitsOffice", p.x, p.z, 4.4f, YawOf(-Side(46)) + PitYaw, 0f); }
            foreach (var (i, model, yawOff) in new[] { (9, "car/race", 0f), (21, "car/race-future", 0f), (33, "car/race", 180f), (40, "car/kart-oobi", 0f) })
            { var p = P(i, half + 5.6f); s.Put(model, p.x, p.z, model.Contains("kart") ? 0.75f : 1.15f, YawOf(Dir(i)) + yawOff, 0f, i == 33 ? Hue(0.55f) : null); }
            for (int i = -2; i <= 50; i += 4) { var p = P(i, half + 3.2f); s.Put("racing/pylon", p.x, p.z, 0.55f, 0f, 0f); }
            // gantries over the road
            { var p = P(13, 0f); s.Put("racing/overheadLights", p.x, p.z, 11.4f, YawX(Side(13)), 0f, null, float.NaN, true); }
            { var p = P(168, 0f); s.Put("racing/overheadRoundColored", p.x, p.z, 12.5f, YawX(Side(168)), 0f, null, float.NaN, true); }
            { var p = P(250, 0f); s.Put("racing/overhead", p.x, p.z, 11.4f, YawX(Side(250)), 0f, null, float.NaN, true); }
            foreach (int sgn in new[] { -1, 1 })
            {
                var p = P(-3, sgn * (half + 2.7f)); s.Put("racing/flagCheckers", p.x, p.z, 6.5f, YawOf(Dir(0)), 0f);
                p = P(52, sgn * (half + 2.7f)); s.Put(sgn < 0 ? "racing/flagGreen" : "racing/flagTankco", p.x, p.z, 6f, YawOf(Dir(52)), 0f);
            }
            // ---- round the lap: barriers on the outside of every corner, tyres on the inside, lights, billboards, a second stand
            for (int i = 0; i < n; i += 3)
            {
                float turn = Turn(i);
                if (Mathf.Abs(turn) < 0.10f) continue;
                float outside = turn > 0 ? -1f : 1f;
                var p = P(i, outside * (half + 2.7f));
                if (i > 2 && i < 46 && outside > 0) continue;                    // the pit lane side of the straight stays open
                s.Put((i / 3) % 2 == 0 ? "racing/barrierRed" : "racing/barrierWhite", p.x, p.z, 1.0f, YawX(Dir(i)), 0f);
                if (i % 9 == 0) { var q = P(i, -outside * (half + 2.5f)); s.PutMesh(SceneryProps.TyreStack(3, new Color(0.12f, 0.12f, 0.14f), i % 18 == 0 ? new Color(0.86f, 0.24f, 0.22f) : Color.white), q.x, q.z, 1f, 0f); }
            }
            for (int i = 16; i < n; i += 34)
            {
                float outside = Turn(i) > 0 ? -1f : 1f;
                if (i < 50) outside = -1f;
                var p = P(i, outside * (half + 4.4f));
                s.Put(i % 68 == 16 ? "racing/lightColored" : "racing/lightRedDouble", p.x, p.z, 6.5f, YawOf(Side(i) * -outside) + 180f, 0f);
            }
            foreach (var (i, model) in new[] { (66, "racing/billboard"), (104, "racing/billboardLow"), (140, "racing/billboard"), (196, "racing/billboardLower"), (228, "racing/billboard"), (284, "racing/billboardLow") })
            {
                float outside = Turn(i) > 0 ? -1f : 1f;
                var p = P(i, outside * (half + 8f));
                if (D(p.x, p.z) > 7.5f) s.Put(model, p.x, p.z, model.EndsWith("billboard") ? 5.5f : 3.2f, YawOf(Side(i) * -outside) + BoardYaw, 0f);
            }
            {   // a stand at the far hairpin
                int i = 96; float outside = Turn(i) > 0 ? -1f : 1f; var p = P(i, outside * (half + 12f));
                float yaw = YawOf(Side(i) * -outside) + StandYaw;
                s.Put("racing/grandStand", p.x, p.z, 7.4f, yaw, 0f);
                var seat = Quaternion.Euler(0, yaw, 0) * new Vector3(0, 0, -3.15f);
                s.PutMesh(SceneryProps.Crowd(rng, 7.0f, 7, 0.92f, 0.47f, 0.6f), p.x + seat.x, p.z + seat.z, 1f, yaw, 0f, null, 2.1f);
            }
            // ---- the paddock inside the track
            foreach (var (x, z, model, h, yaw) in new[] {
                (26f, 6f, "racing/tent", 3.6f, 0f), (26f, 15f, "racing/tentLong", 3.6f, 0f), (32f, 24f, "racing/tentClosed", 3.4f, 90f), (24f, 26f, "racing/tentClosedLong", 3.4f, 0f),
                (31f, 9f, "car/truck", 2.7f, 20f), (33f, 16f, "car/van", 2.3f, 200f), (21f, 20f, "car/ambulance", 2.5f, 90f), (28f, 31f, "car/firetruck", 3.0f, 250f),
                (22f, 10f, "car/suv", 1.9f, 180f), (34f, 4f, "car/tractor-shovel", 2.8f, 300f), (21f, 31f, "car/delivery", 2.4f, 0f), (30f, 30f, "racing/radarEquipment", 6f, 0f) })
                if (D(x, z) > 9f && Inside(x, z)) s.Put(model, x, z, h, yaw, 0f);
            // spectators' cars along the road behind the stands
            string[] cars = { "car/sedan", "car/suv", "car/van", "car/taxi", "car/hatchback-sports", "car/sedan-sports", "car/suv-luxury", "car/police" };
            for (int i = 0; i < 6; i++)
            {
                float z = -2f + i * 5.2f, x = -27.5f - (z > 20f ? (z - 20f) * 0.35f : 0f);
                s.Put(cars[i % cars.Length], x - 3.2f, z, i % 3 == 2 ? 1.9f : 1.5f, 90f + s.R(-6f, 6f), 0f, i % 2 == 0 ? Hue(s.R(0f, 1f)) : null);
            }
            // ---- the valley
            // forest: snow-laden firs near the track, darker pines filling the slopes
            s.Scatter(new[] { "holiday/tree-snow-a", "holiday/tree-snow-b", "holiday/tree-snow-c", "holiday/tree" }, 100, 9f, 150f, 5f, 11f, Wild, 1.3f, null, 0.03f, 3.2f);
            Func<Color, Color> frosted = c => (c.g > c.r * 1.08f && c.g > c.b * 1.08f) ? Color.Lerp(new Color(0.07f, 0.20f, 0.13f, c.a), new Color(0.80f, 0.86f, 0.92f, c.a), 0.22f) : c;
            s.Scatter(Pines, 520, 30f, 620f, 7f, 16f, (x, z) => Wild(x, z) && (N2(x, z, 80f, 6f) > 0.44f || Len(x - centre.x, z - centre.y) > 320f) && s.H(x, z) < 190f, 1.25f, frosted, 0.03f, 3.6f);
            foreach (var (x, z) in new[] { (16f, 38f), (22f, 40f), (33f, 34f), (36f, 0f), (30f, -8f), (20f, -10f), (13f, 36f), (38f, 28f) })
                if (D(x, z) > 9f && Inside(x, z)) s.Put(s.Pick("holiday/tree-snow-a", "holiday/tree-snow-b", "holiday/tree-snow-c"), x, z, s.R(4f, 7f));
            s.Scatter(new[] { "holiday/snow-pile", "holiday/snow-bunker" }, 70, 9f, 120f, 0.3f, 0.9f, (x, z) => D(x, z) > 9.5f && Len(x - lake.x, z - lake.y) > 20f, 1.5f);
            s.Scatter(new[] { "holiday/rocks-medium", "holiday/rocks-small", "holiday/rocks-large" }, 30, 30f, 560f, 0.8f, 3.4f, (x, z) => Wild(x, z) && D(x, z) > 16f, 1.3f, null, 0.12f);
            // the village
            var walls = new[] { new Color(0.56f, 0.38f, 0.24f), new Color(0.66f, 0.46f, 0.30f), new Color(0.48f, 0.32f, 0.22f), new Color(0.72f, 0.54f, 0.36f) };
            for (int i = 0; i < 13; i++)
            {
                float a = i / 13f * Mathf.PI * 2f + s.R(-0.2f, 0.2f), d = s.R(13f, 30f);
                float x = village.x + Mathf.Cos(a) * d, z = village.y + Mathf.Sin(a) * d;
                s.PutMesh(SceneryProps.House(rng, walls[i % walls.Length], new Color(0.36f, 0.26f, 0.22f), 1f, true), x, z, 1.1f, Mathf.Atan2(village.x - x, village.y - z) * Mathf.Rad2Deg, 0.2f);
            }
            s.PutMesh(SceneryProps.Church(true), village.x - 4f, village.y + 34f, 1.2f, 170f, 0.2f);
            s.Put("holiday/tree-decorated-snow", village.x, village.y, 9f);
            for (int i = 0; i < 8; i++) { float a = i / 8f * 6.28f; s.Put("holiday/lantern", village.x + Mathf.Cos(a) * 8f, village.y + Mathf.Sin(a) * 8f, 2.6f); }
            for (int i = 0; i < 6; i++) s.Put(s.Pick("holiday/snowman-hat", "holiday/snowman"), village.x + s.R(-10f, 10f), village.y + s.R(-10f, 10f), 1.7f);
            // cabins out in the woods
            foreach (var (x, z) in new[] { (60f, 80f), (-60f, -50f), (110f, -70f), (150f, 60f), (-150f, 20f), (40f, -90f), (-20f, 130f) })
                if (D(x, z) > 20f) { s.PutMesh(SceneryProps.House(rng, walls[rng.Next(4)], new Color(0.36f, 0.26f, 0.22f), 1f, true), x, z, 0.9f, float.NaN, 0.2f); s.Put("nature/log_stackLarge", x + 5f, z + 2f, 1.3f); }
            // the ski lift up the mountain behind the village
            const int Pylons = 9;
            var tops = new List<Vector3>();
            for (int i = 0; i < Pylons; i++)
            {
                var q = Vector2.Lerp(liftA, liftB, i / (float)(Pylons - 1));
                float h = 11f, y = s.H(q.x, q.y);
                s.PutMesh(SceneryProps.SkiPylon(h), q.x, q.y, 1f, YawOf(new Vector3(liftB.x - liftA.x, 0, liftB.y - liftA.y)), 0.3f);
                tops.Add(new Vector3(q.x, y + h + 0.2f, q.y));
            }
            var across = Vector3.Cross(Vector3.up, (tops[tops.Count - 1] - tops[0]).normalized) * 2f;
            for (int i = 0; i < tops.Count - 1; i++)
                foreach (int sgn in new[] { -1, 1 })
                {
                    Vector3 a = tops[i] + across * sgn, b = tops[i + 1] + across * sgn;
                    var mb = s.At(a.x, a.z);
                    mb.Quad(a + Vector3.up * 0.06f, b + Vector3.up * 0.06f, b - Vector3.up * 0.06f, a - Vector3.up * 0.06f, new Color(0.20f, 0.22f, 0.26f));
                    mb.Quad(b + Vector3.up * 0.06f, a + Vector3.up * 0.06f, a - Vector3.up * 0.06f, b - Vector3.up * 0.06f, new Color(0.20f, 0.22f, 0.26f));
                    for (int k = 1; k <= 3; k++)
                    {
                        var c = Vector3.Lerp(a, b, (k - (sgn > 0 ? 0.5f : 0f)) / 3.3f);
                        mb.Append(SceneryProps.SkiChair(k % 2 == 0 ? new Color(0.90f, 0.30f, 0.24f) : new Color(0.96f, 0.80f, 0.26f)), c, Quaternion.Euler(0, YawOf(across), 0), Vector3.one);
                    }
                }
            s.PutMesh(SceneryProps.House(rng, walls[0], new Color(0.36f, 0.26f, 0.22f), 1f, true), liftA.x + 8f, liftA.y - 6f, 0.9f, 0f, 0.2f);          // lift station
            // on the lake: a fishing hut and a hole in the ice
            s.PutMesh(SceneryProps.House(rng, new Color(0.80f, 0.30f, 0.24f), new Color(0.30f, 0.28f, 0.30f), 1f), lake.x + 4f, lake.y - 3f, 0.42f, 40f, 0f, null, -0.6f);
            s.Patch(lake.x + 1f, lake.y - 1f, 0.8f, -0.585f, new Color(0.12f, 0.24f, 0.40f), 9, 0.1f);
            // balloons over the valley
            foreach (var (x, y, z) in new[] { (-120f, 90f, 200f), (180f, 120f, 260f), (60f, 70f, -220f), (-260f, 150f, -60f) })
                s.PutMesh(CreatureMeshes.Balloon(), x, z, s.R(3.5f, 5f), float.NaN, 0f, Hue(s.R(0f, 1f)), y);
            return s.Save("race");
        }

        // Which way the racing kit's pieces face, found by looking at the result.
        // Stands rise toward +Z, and garages, offices and billboards have their fronts on -Z, so each is turned round to face the road.
        const float StandYaw = 180f, PitYaw = 180f, BoardYaw = 180f;
    }
}
