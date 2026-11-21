using System.Collections.Generic;
using UnityEngine;

namespace WishWorld
{
    /// <summary>
    /// The other cars in Snow Circuit. Each drives itself round the track: it slows for corners according to how tight
    /// they are, keeps to a lane, pulls out to pass a slower car (or the player) and tucks back in afterwards.
    /// They are tuned for young players: a car far ahead eases off and a car far behind pushes on, so the race stays close.
    /// There is no physics: positions come from distance along the track's centre line plus a sideways lane offset.
    /// </summary>
    public class RaceRivals : MonoBehaviour
    {
        public class Car
        {
            public Transform t;
            public string name;
            public float distance;        // metres from the start line, counting laps
            public float lane, homeLane, targetLane;
            public float speed, skill;
            public bool finished;
            public float finishTime;
        }

        public readonly List<Car> Cars = new List<Car>();
        TrackData track;
        float length;
        static readonly string[] Names = { "Pip", "Juno", "Rex", "Skye", "Bo" };
        static readonly float[] Lanes = { -1.7f, 1.7f, -1.7f, 1.7f, 0f };
        const float CarLength = 4.0f, CarWidth = 1.9f;

        public int Count => Cars.Count;

        public void Setup(TrackData data, GameObject[] prefabs, int count)
        {
            track = data;
            length = data.length;
            foreach (var c in Cars) if (c.t != null) Destroy(c.t.gameObject);
            Cars.Clear();
            if (prefabs == null || prefabs.Length == 0) return;
            for (int i = 0; i < Mathf.Clamp(count, 0, 5); i++)
            {
                var prefab = prefabs[i % prefabs.Length];
                if (prefab == null) continue;
                var go = Instantiate(prefab, transform);
                go.name = "Rival " + Names[i];
                BlobShadow.Attach(go.transform, data.points[0].y + 0.02f, 1.5f, 3f, transform);
                Cars.Add(new Car { t = go.transform, name = Names[i], homeLane = Lanes[i], skill = Mathf.Lerp(0.86f, 0.72f, i / 4f) });
            }
            ResetGrid();
        }

        /// <summary>Line the cars up on the grid ahead of the player, who starts at the back.</summary>
        public void ResetGrid()
        {
            for (int i = 0; i < Cars.Count; i++)
            {
                var c = Cars[i];
                c.distance = 3f + i * 5f;
                c.lane = c.targetLane = c.homeLane;
                c.speed = 0f; c.finished = false; c.finishTime = 0f;
                Place(c);
            }
        }

        // ---- the centre line, by distance
        Vector3 PointAt(float d, out Vector3 dir)
        {
            int n = track.points.Length;
            float f = Mathf.Repeat(d, length) / length * n;
            int i = Mathf.FloorToInt(f) % n, j = (i + 1) % n;
            dir = (track.points[j] - track.points[i]).normalized;
            return Vector3.Lerp(track.points[i], track.points[j], f - Mathf.Floor(f));
        }

        /// <summary>How sharply the road bends over the next few metres (1 / radius).</summary>
        float Bend(float d)
        {
            PointAt(d, out var a); PointAt(d + 7f, out var b);
            return Vector3.Angle(a, b) * Mathf.Deg2Rad / 7f;
        }

        void Place(Car c)
        {
            var p = PointAt(c.distance, out var dir);
            var side = Vector3.Cross(Vector3.up, dir);
            // look a little ahead so the nose swings into the corner
            PointAt(c.distance + 2.5f, out var ahead);
            c.t.SetPositionAndRotation(p + side * c.lane, Quaternion.LookRotation(Vector3.Slerp(dir, ahead, 0.5f), Vector3.up));
        }

        /// <param name="playerDistance">The player's distance from the start line, counting laps.</param>
        /// <param name="playerLane">The player's sideways offset from the centre line (+ is the inside of this clockwise track).</param>
        public void Tick(float dt, bool racing, float playerDistance, float playerLane, float playerSpeed, float topSpeed, int laps, float raceTime)
        {
            for (int k = 0; k < Cars.Count; k++)
            {
                var c = Cars[k];
                float vmax = topSpeed * c.skill;
                // Keep the race close: ease off when well ahead of the player, push on when well behind.
                float gap = c.distance - playerDistance;
                if (gap > 12f) vmax *= Mathf.Lerp(1f, 0.72f, Mathf.InverseLerp(12f, 50f, gap));
                else if (gap < -15f) vmax *= Mathf.Lerp(1f, 1.06f, Mathf.InverseLerp(-15f, -60f, gap));
                float bend = Mathf.Max(Bend(c.distance), Bend(c.distance + 5f));
                float corner = bend > 0.001f ? Mathf.Sqrt(6.5f * c.skill / bend) : 99f;
                float target = racing ? Mathf.Min(vmax, corner) : 0f;
                if (c.finished) target = Mathf.Min(target, topSpeed * 0.45f);          // the cool-down lap

                // Who is in the way? The nearest car ahead within a few lengths, the player included.
                float blockGap = float.MaxValue, blockLane = 0f, blockSpeed = 0f;
                void Consider(float d, float lane, float speed)
                {
                    float ahead = d - c.distance;
                    if (ahead > 0.2f && ahead < blockGap && ahead < 9f) { blockGap = ahead; blockLane = lane; blockSpeed = speed; }
                }
                for (int m = 0; m < Cars.Count; m++) if (m != k) Consider(Cars[m].distance, Cars[m].lane, Cars[m].speed);
                Consider(playerDistance, playerLane, playerSpeed);

                c.targetLane = c.homeLane;
                if (blockGap < 9f && Mathf.Abs(blockLane - c.lane) < CarWidth)
                {
                    // pull out to whichever side has more road
                    c.targetLane = blockLane > 0f ? blockLane - CarWidth * 1.15f : blockLane + CarWidth * 1.15f;
                    if (blockGap < CarLength + 1.2f) target = Mathf.Min(target, Mathf.Max(blockSpeed - 0.3f, 1.5f));
                }
                float room = track.width * 0.5f - CarWidth * 0.5f - 0.2f;
                c.targetLane = Mathf.Clamp(c.targetLane, -room, room);
                c.lane = Mathf.MoveTowards(c.lane, c.targetLane, 1.8f * dt);

                c.speed = Mathf.MoveTowards(c.speed, target, (target > c.speed ? 4.6f * c.skill : 9f) * dt);
                c.distance += c.speed * dt;
            }

            // No car may sit inside another: whichever is behind in an overlapping pair is held on the other's tail.
            for (int pass = 0; pass < 2; pass++)
                for (int a = 0; a < Cars.Count; a++)
                {
                    var rear = Cars[a];
                    for (int b = 0; b < Cars.Count; b++)
                    {
                        if (a == b) continue;
                        var front = Cars[b];
                        float ahead = front.distance - rear.distance;
                        if (ahead < 0f || (ahead == 0f && a < b)) continue;
                        if (ahead < CarLength + 0.3f && Mathf.Abs(front.lane - rear.lane) < CarWidth)
                        {
                            rear.distance = front.distance - (CarLength + 0.3f);
                            rear.speed = Mathf.Min(rear.speed, front.speed);
                        }
                    }
                    float toPlayer = playerDistance - rear.distance;       // and none may drive through the player from behind
                    if (toPlayer >= 0f && toPlayer < CarLength + 0.2f && Mathf.Abs(playerLane - rear.lane) < CarWidth)
                    {
                        rear.distance = playerDistance - (CarLength + 0.2f);
                        rear.speed = Mathf.Min(rear.speed, playerSpeed);
                    }
                }

            foreach (var c in Cars)
            {
                if (!c.finished && c.distance >= laps * length) { c.finished = true; c.finishTime = raceTime; }
                Place(c);
            }
        }

        /// <summary>1 for first. Counts every rival that is further round than the player, or already home.</summary>
        public int PlayerPlace(float playerDistance)
        {
            int place = 1;
            foreach (var c in Cars) if (c.finished || c.distance > playerDistance) place++;
            return place;
        }

        /// <summary>
        /// Is the player's car touching a rival? If so the rival is nudged aside, and the caller is told how fast the
        /// car in front is going so it can take the knock.
        /// </summary>
        public bool Touching(Vector3 playerPos, Vector3 playerForward, out float otherSpeed, out bool playerBehind)
        {
            otherSpeed = 0f; playerBehind = false;
            foreach (var c in Cars)
            {
                var rel = playerPos - c.t.position; rel.y = 0;
                float along = Vector3.Dot(rel, c.t.forward), across = Vector3.Dot(rel, c.t.right);
                if (Mathf.Abs(along) > CarLength * 0.95f || Mathf.Abs(across) > CarWidth * 0.92f) continue;
                c.lane = Mathf.MoveTowards(c.lane, c.lane - Mathf.Sign(across) * 2f, 4f * Time.deltaTime);
                otherSpeed = c.speed;
                playerBehind = along < 0f;
                if (!playerBehind) c.speed = Mathf.Min(c.speed, Mathf.Max(2f, c.speed - 6f * Time.deltaTime));   // it ran into the player's tail
                return true;
            }
            return false;
        }
    }
}
