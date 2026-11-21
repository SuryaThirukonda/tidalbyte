#if UNITY_EDITOR
using System.Collections;
using UnityEngine;
using UnityEngine.InputSystem;

namespace WishWorld.DebugTools
{
    /// <summary>Editor-only scripted checks. Each drives the desktop controls, never the game's internals.</summary>
    public static class DebugChecks
    {
        public static string Result = "";

        /// <summary>Freeze game time after a delay so a moment can be photographed. Call Unfreeze after.</summary>
        public static void FreezeAfter(float seconds) => DebugDriver.I.StartCoroutine(Freeze(seconds));
        static IEnumerator Freeze(float seconds) { yield return new WaitForSeconds(seconds); Time.timeScale = 0f; }
        public static void Unfreeze() { Time.timeScale = 1f; }

        /// <summary>Throw one item, wait until it is near its peak, then swing the mouse-driven blade across it.</summary>
        public static void SliceNext(bool leftHand = false, float swingSeconds = 0.12f, bool freezeAfter = false, bool hazard = false)
            => DebugDriver.I.StartCoroutine(SliceRoutine(leftHand, swingSeconds, freezeAfter, hazard));

        static IEnumerator SliceRoutine(bool leftHand, float swingSeconds, bool freezeAfter, bool hazard)
        {
            var g = FrostSliceGame.I;
            Result = "running";
            int before = g.Score, livesBefore = g.Lives, sliced = g.SlicedCount;
            while (g.FlyingCount > 0) yield return null;       // let anything already in the air land
            g.DebugLaunch(hazard);
            yield return new WaitForSeconds(0.95f);
            if (g.FirstFruitPosition == null) { Result = "no fruit"; yield break; }
            var p = g.FirstFruitPosition.Value;
            var right = XRRig.I.head.right;
            DebugDriver.LookAt(p);
            yield return null;
            DebugDriver.Swing(p - right * 0.3f, p + right * 0.3f, swingSeconds, leftHand);
            while (DebugDriver.Busy) yield return null;
            yield return null;
            if (freezeAfter) Time.timeScale = 0f;
            Result = "score " + before + "->" + g.Score + " lives " + livesBefore + "->" + g.Lives + " sliced " + sliced + "->" + g.SlicedCount
                     + " haptics=" + DesktopInputSource.HapticCount;
        }

        /// <summary>Hold the blade still where a fruit will arrive. Nothing should be cut.</summary>
        public static void RestingBlade() => DebugDriver.I.StartCoroutine(RestRoutine());
        static IEnumerator RestRoutine()
        {
            var g = FrostSliceGame.I;
            Result = "running";
            g.debugNoWaves = true;
            while (g.FlyingCount > 0) yield return null;
            var local = new Vector3(0.1f, 1.4f, 0.58f);
            var world = g.transform.TransformPoint(local);
            DebugDriver.LookAt(world);
            yield return null; yield return null;
            DebugKeys.simMouse = (Vector2)XRRig.I.cam.WorldToScreenPoint(world);
            yield return new WaitForSeconds(0.5f);     // blade is now parked on the spot, not moving
            int before = g.SlicedCount;
            g.DebugLaunch(false, local);
            float closest = float.MaxValue;
            var tip = XRRig.I.rightHand.GetComponentInChildren<TrailRenderer>().transform;
            for (float t = 0; t < 2.4f && g.FlyingCount > 0; t += Time.deltaTime)
            {
                var p = g.FirstFruitPosition;
                if (p.HasValue)
                {
                    var a = XRRig.I.rightHand.position; var ab = tip.position - a;
                    float u = Mathf.Clamp01(Vector3.Dot(p.Value - a, ab) / ab.sqrMagnitude);
                    closest = Mathf.Min(closest, Vector3.Distance(p.Value, a + ab * u));
                }
                yield return null;
            }
            Result = "resting blade: sliced " + before + "->" + g.SlicedCount + ", fruit came within " + closest.ToString("F3") + " m of the blade";
            g.debugNoWaves = false;
        }

        /// <summary>
        /// Drive the racer with the desktop keys (A/D/W/S), steering toward a point further along the
        /// track, until the race finishes or time runs out.
        /// </summary>
        public static void AutoDrive(float maxSeconds) => DebugDriver.I.StartCoroutine(DriveRoutine(maxSeconds));
        static IEnumerator DriveRoutine(float maxSeconds)
        {
            var g = SnowCircuitGame.I;
            Result = "driving";
            float worstOff = 0, topSpeed = 0, maxSteer = 0; int offFrames = 0, frames = 0;
            int idx = g.track.Nearest(g.car.position, 0, g.track.points.Length / 2);
            for (float t = 0; t < maxSeconds && g != null && g.State != SnowCircuitGame.Phase.Finished; t += Time.deltaTime)
            {
                if (g.State == SnowCircuitGame.Phase.Racing)
                {
                    idx = g.track.Nearest(g.car.position, idx);
                    int n = g.track.points.Length;
                    var aim = g.track.points[(idx + 9) % n];
                    float angle = Vector3.SignedAngle(g.car.forward, aim - g.car.position, Vector3.up);
                    Set(Key.D, angle > 3f); Set(Key.A, angle < -3f);
                    bool sharp = Mathf.Abs(angle) > 22f && g.Speed > 8f;
                    Set(Key.W, !sharp); Set(Key.S, sharp);
                    float off = Vector3.Distance(g.car.position, g.track.points[idx]);
                    worstOff = Mathf.Max(worstOff, off);
                    topSpeed = Mathf.Max(topSpeed, g.Speed);
                    maxSteer = Mathf.Max(maxSteer, Mathf.Abs(g.Steer));
                    frames++; if (!g.OnTrack) offFrames++;
                }
                yield return null;
            }
            Set(Key.W, false); Set(Key.S, false); Set(Key.A, false); Set(Key.D, false);
            if (g == null) { Result = "left the race scene"; yield break; }
            Result = "state=" + g.State + " lap=" + g.Lap + " raceTime=" + g.RaceTime.ToString("F1") + " bestLap=" + g.BestLap.ToString("F1")
                     + " topSpeed=" + topSpeed.ToString("F1") + " maxSteer=" + maxSteer.ToString("F2") + " worstOffCentre=" + worstOff.ToString("F1")
                     + " offTrackFrames=" + offFrames + "/" + frames;
        }
        static void Set(Key k, bool on) { if (on) DebugKeys.simHeld.Add(k); else DebugKeys.simHeld.Remove(k); }

        /// <summary>Hold keys for a while (for example W to accelerate).</summary>
        public static void HoldKeys(float seconds, params Key[] keys)
        {
            foreach (var k in keys) DebugDriver.Hold(k, seconds);
        }
    }
}
#endif
