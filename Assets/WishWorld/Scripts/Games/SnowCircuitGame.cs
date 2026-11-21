using System.Collections;
using System.Collections.Generic;
using TMPro;
using UnityEngine;

namespace WishWorld
{
    /// <summary>
    /// Snow Circuit: seated cockpit racing. Hold both controllers like a steering wheel;
    /// the tilt of the line between the hands steers. Right trigger accelerates, left trigger brakes.
    /// Arcade handling only: no tyre model.
    /// </summary>
    public class SnowCircuitGame : MonoBehaviour
    {
        public enum Phase { Ready, Countdown, Racing, Finished }
        public static SnowCircuitGame I { get; private set; }

        [Header("Scene")]
        public TrackData track;
        public Transform car;
        public Transform wheel;
        public TextMeshPro dashSpeed, dashLap, dashTime;
        public GameObject ghostPrefab;
        [Tooltip("Cars that race against the player. How many is set by WISHWORLD_RACE_RIVALS in .env (default 4).")]
        public GameObject[] rivalPrefabs;
        [Tooltip("The valley around the circuit. Hidden when the game is set to show the real room instead.")]
        public GameObject surroundings;

        [Header("Tuning (kept slow and gentle for comfort)")]
        public int laps = 3;
        public float topSpeed = 13f;
        public float acceleration = 5.5f;
        public float braking = 11f;
        public float offTrackSpeed = 4.5f;
        [Tooltip("Hand tilt, in degrees, that gives full steering lock.")]
        public float fullLockDegrees = 45f;
        public float seatEyeHeight = 1.05f;

        public Phase State { get; private set; } = Phase.Ready;
        public float Speed { get; private set; }
        public float Steer { get; private set; }
        public int Lap { get; private set; }
        public float RaceTime { get; private set; }
        public float LastLapTime { get; private set; }
        public float BestLap { get; private set; }
        public bool OnTrack { get; private set; } = true;
        public float Progress => track != null ? index / (float)track.points.Length : 0f;
        /// <summary>1 for first place. With no rivals the player is always first.</summary>
        public int Place { get; private set; } = 1;
        public int Racers => 1 + (rivals != null ? rivals.Count : 0);
        public RaceRivals Rivals => rivals;

        const string BestKey = "SnowCircuitBestLap";
        GameObject menu;
        TextMeshPro menuTitle, menuInfo, bigText;
        WWButton startButton;
        AudioSource engine;
        int index, nextCheckpoint;
        float lapStart, yaw;
        Vector3 startPos; float startYaw;
        readonly List<Vector4> lapTrace = new List<Vector4>();   // x, z, yaw, time
        List<Vector4> ghostTrace;
        Transform ghost;
        float traceTimer, sessionBest, bumpCooldown;
        RaceRivals rivals;

        void Awake()
        {
            I = this;
            BestLap = PlayerPrefs.GetFloat(BestKey, 0f);
        }

        void OnDestroy()
        {
            if (I == this) I = null;
            WWInput.SteeringMode = false;
        }

        IEnumerator Start()
        {
            // Default: a full valley around the track. WISHWORLD_RACE_VIEW=room in .env shows the real room instead (the original plan).
            if (EnvConfig.Get("WISHWORLD_RACE_VIEW", "world").ToLowerInvariant() == "room")
            {
                if (surroundings != null) surroundings.SetActive(false);
                RenderSettings.fog = false;
                if (PassthroughToggle.I != null) PassthroughToggle.I.Set(true);
            }
            startPos = car.position;
            startYaw = car.eulerAngles.y;
            int rivalCount = 4;
            int.TryParse(EnvConfig.Get("WISHWORLD_RACE_RIVALS", "4"), out rivalCount);
            if (rivalCount > 0 && rivalPrefabs != null && rivalPrefabs.Length > 0)
            {
                rivals = gameObject.AddComponent<RaceRivals>();
                rivals.Setup(track, rivalPrefabs, rivalCount);
            }
            yaw = startYaw;
            yield return null;
            yield return null;
            Seat();
            engine = gameObject.AddComponent<AudioSource>();
            engine.clip = Sfx.Engine;
            engine.loop = true;
            engine.volume = 0f;
            engine.spatialBlend = 0f;
            engine.Play();
            BuildUi();
            ShowMenu("Snow Circuit", "Hold both controllers like a steering wheel.\nRight trigger: go.   Left trigger: brake.", "Start");
            GuideVoice.Read(VoiceLines.SnowIntro);
        }

        /// <summary>Put the player's head at the driving position, facing down the car.</summary>
        void Seat()
        {
            var rig = XRRig.I;
            if (rig == null) return;
            rig.Recenter(car, true, seatEyeHeight);
            if (wheel != null) WWInput.SteeringWheelCenter = rig.transform.InverseTransformPoint(wheel.position);
        }

        void BuildUi()
        {
            var theme = WWTheme.I;
            // The menu rides with the car, above the nose.
            menu = WWUI.Panel(car, "Menu", new Vector2(1.0f, 0.56f), theme.panel, 0.05f, 0.008f);
            menu.AddComponent<PopIn>();
            menu.transform.localPosition = new Vector3(0, 1.3f, 1.7f);
            menuTitle = WWUI.Label(menu.transform, "", 0.085f, new Vector2(0.78f, 0.12f), theme.slate, TextAlignmentOptions.Center, true, WWFont.Title);
            menuTitle.transform.localPosition = new Vector3(0, 0.185f, -0.004f);
            menuInfo = WWUI.Label(menu.transform, "", 0.05f, new Vector2(0.92f, 0.18f), theme.slate);
            menuInfo.transform.localPosition = new Vector3(0, 0.03f, -0.004f);
            startButton = WWUI.Button(menu.transform, "Start", new Vector2(0.36f, 0.13f), StartRace, 0.05f, theme.peach);
            startButton.transform.localPosition = new Vector3(-0.21f, -0.17f, -0.006f);
            WWUI.Button(menu.transform, "Hub", new Vector2(0.36f, 0.13f), () => SceneLoader.GoHub(), 0.05f)
                .transform.localPosition = new Vector3(0.21f, -0.17f, -0.006f);

            bigText = WWUI.Label(car, "", 0.26f, new Vector2(1.6f, 0.8f), theme.slate, TextAlignmentOptions.Center, false, WWFont.Title);
            WWUI.Backdrop(bigText, null, 0.09f);
            bigPop = bigText.gameObject.AddComponent<PopIn>();
            bigText.transform.localPosition = new Vector3(0, 1.45f, 2.6f);
            bigText.gameObject.SetActive(false);
        }

        PopIn bigPop;

        void ShowMenu(string title, string info, string button)
        {
            menu.SetActive(true);
            menuTitle.text = title;
            menuInfo.text = info;
            startButton.label = button;
            startButton.GetComponentInChildren<TextMeshPro>().text = button;
            WWInput.SteeringMode = false;
            if (XRRig.I != null) XRRig.I.pointersEnabled = true;
        }

        public void StartRace()
        {
            if (State == Phase.Countdown || State == Phase.Racing) return;
            StartCoroutine(Countdown());
        }

        IEnumerator Countdown()
        {
            State = Phase.Countdown;
            menu.SetActive(false);
            car.position = startPos;
            yaw = startYaw;
            car.rotation = Quaternion.Euler(0, yaw, 0);
            Seat();
            Speed = 0; Lap = 1; RaceTime = 0; lapStart = 0; nextCheckpoint = 1; Place = Racers;
            if (rivals != null) rivals.ResetGrid();
            index = track.Nearest(car.position, 0, track.points.Length / 2);
            lapTrace.Clear();
            WWInput.SteeringMode = true;
            if (XRRig.I != null) XRRig.I.pointersEnabled = false;
            bigText.gameObject.SetActive(true);
            GuideVoice.Hush();
            int count = 0;
            foreach (var s in new[] { "3", "2", "1" })
            {
                bigText.text = s;
                bigPop.Kick(0.45f);                                  // each number lands with a thump
                GuideVoice.ReadNow(VoiceLines.Countdown[count++]);
                Sfx.Play(Sfx.Click, car.position + Vector3.up, 0.7f);
                yield return new WaitForSeconds(0.8f);
            }
            bigText.text = "Go!";
            bigPop.Kick(0.6f);
            GuideVoice.ReadNow(VoiceLines.Countdown[3]);
            Sfx.Play(Sfx.Chime, car.position + Vector3.up, 0.7f);
            State = Phase.Racing;
            yield return new WaitForSeconds(0.8f);
            bigText.gameObject.SetActive(false);
        }

        void Update()
        {
            float dt = Time.deltaTime;
            ReadSteering();
            if (State == Phase.Racing) Drive(dt);
            else Speed = Mathf.MoveTowards(Speed, 0, braking * dt);

            if (State == Phase.Finished || State == Phase.Ready) car.position += car.forward * (Speed * dt);
            if (wheel != null) wheel.localRotation = Quaternion.Euler(0, 0, -Steer * 80f);
            if (engine != null)
            {
                engine.pitch = 0.6f + Speed / topSpeed * 1.3f;
                engine.volume = State == Phase.Racing ? 0.22f : Mathf.MoveTowards(engine.volume, 0.06f, dt);
            }
            UpdateRivals(dt);
            UpdateGhost();
            UpdateDash();
        }

        /// <summary>Steering comes from how far the line between the two hands is tilted.</summary>
        void ReadSteering()
        {
            var l = WWInput.Hand(true);
            var r = WWInput.Hand(false);
            float target = 0f;
            var d = r.position - l.position;   // rig space: x to the right, y up
            if (l.tracked && r.tracked && d.x > 0.06f)
            {
                float angle = Mathf.Atan2(-d.y, d.x) * Mathf.Rad2Deg;   // right hand lower = positive = turn right
                if (Mathf.Abs(angle) < 3f) angle = 0f;
                target = Mathf.Clamp(angle / fullLockDegrees, -1f, 1f);
            }
            else if (Mathf.Abs(r.stick.x) > 0.15f) target = r.stick.x;   // one-handed fallback: right thumbstick
            Steer = Mathf.MoveTowards(Steer, target, Time.deltaTime * 6f);
        }

        void Drive(float dt)
        {
            float throttle = WWInput.Hand(false).trigger;
            float brake = WWInput.Hand(true).trigger;
            RaceTime += dt;

            index = track.Nearest(car.position, index);
            var centre = track.points[index];
            var toCar = car.position - centre; toCar.y = 0;
            float off = toCar.magnitude;
            float half = track.width * 0.5f;
            OnTrack = off <= half;

            float cap = OnTrack ? topSpeed : offTrackSpeed;
            Speed += throttle * acceleration * dt;
            Speed -= brake * braking * dt;
            Speed -= Speed * 0.3f * dt;                               // rolling drag
            if (Speed > cap) Speed = Mathf.MoveTowards(Speed, cap, braking * dt);
            Speed = Mathf.Max(0, Speed);

            // Turn rate drops as speed rises, and there is no turning on the spot.
            float turn = Steer * Mathf.Lerp(75f, 34f, Speed / topSpeed) * Mathf.Clamp01(Speed / 2.5f);
            yaw += turn * dt;
            var rot = Quaternion.Euler(0, yaw, 0);
            var pos = car.position + rot * Vector3.forward * (Speed * dt);

            // Snow banks: never let the car leave the corridor.
            var rel = pos - centre; rel.y = 0;
            float limit = half + 1.2f;
            if (rel.magnitude > limit)
            {
                pos = centre + rel.normalized * limit;
                pos.y = car.position.y;
                Speed *= 1f - 1.5f * dt;
            }
            car.SetPositionAndRotation(pos, rot);

            // Checkpoints at each quarter stop a lap being counted by reversing over the line.
            int n = track.points.Length;
            int quarter = index * 4 / n;
            if (nextCheckpoint == 0) { if (quarter == 0) CompleteLap(); }
            else if (quarter == nextCheckpoint) nextCheckpoint = (nextCheckpoint + 1) % 4;

            traceTimer -= dt;
            if (traceTimer <= 0) { traceTimer = 0.1f; lapTrace.Add(new Vector4(pos.x, pos.z, yaw, RaceTime - lapStart)); }
        }

        /// <summary>The player's distance from the start line, counting laps. Negative on the grid, before the line is first crossed.</summary>
        float PlayerDistance()
        {
            int n = track.points.Length;
            float along = index / (float)n * track.length;
            if (Lap == 1 && nextCheckpoint == 1 && index > n * 3 / 4) along -= track.length;      // still behind the line at the start
            return (Lap - 1) * track.length + along;
        }

        void UpdateRivals(float dt)
        {
            if (rivals == null) return;
            float distance = State == Phase.Finished ? laps * track.length + 5f : PlayerDistance();
            var centre = track.points[index];
            float lane = Vector3.Dot(car.position - centre, Vector3.Cross(Vector3.up, track.Direction(index)));
            rivals.Tick(dt, State == Phase.Racing || State == Phase.Finished, distance, lane, Speed, topSpeed, laps, RaceTime);
            if (State != Phase.Racing) return;
            Place = rivals.PlayerPlace(distance);
            bumpCooldown -= dt;
            if (rivals.Touching(car.position, car.forward, out float other, out bool behind))
            {
                // No crash, just a knock: running into the back of a car costs speed, being run into does not.
                if (behind && Speed > other) Speed = Mathf.MoveTowards(Speed, Mathf.Max(other - 0.5f, 0f), 30f * dt);
                if (bumpCooldown <= 0f)
                {
                    bumpCooldown = 0.5f;
                    Sfx.Play(Sfx.Click, car.position + Vector3.up, 0.8f);
                    WWInput.Haptic(true, 0.5f, 0.12f); WWInput.Haptic(false, 0.5f, 0.12f);
                }
            }
        }

        static readonly string[] Ordinals = { "first", "second", "third", "fourth", "fifth", "sixth" };

        void CompleteLap()
        {
            nextCheckpoint = 1;
            LastLapTime = RaceTime - lapStart;
            lapStart = RaceTime;
            bool best = BestLap <= 0 || LastLapTime < BestLap;
            if (best)
            {
                BestLap = LastLapTime;
                PlayerPrefs.SetFloat(BestKey, BestLap);
                PlayerPrefs.Save();
            }
            // The fastest lap since the game was opened becomes the ghost car to chase.
            if (sessionBest <= 0 || LastLapTime < sessionBest)
            {
                sessionBest = LastLapTime;
                ghostTrace = new List<Vector4>(lapTrace);
            }
            lapTrace.Clear();
            Sfx.Play(Sfx.Chime, car.position + Vector3.up, 0.7f);
            if (Lap >= laps)
            {
                State = Phase.Finished;
                Sfx.Play(Sfx.Success, car.position + Vector3.up, 0.7f);
                if (rivals != null)
                {
                    Place = rivals.PlayerPlace(laps * track.length + 5f);
                    string place = Ordinals[Mathf.Clamp(Place - 1, 0, Ordinals.Length - 1)];
                    ShowMenu(Place == 1 ? "You won!" : "Finished " + place + "!", "of " + Racers + " cars.  Time " + Format(RaceTime) + "\nBest lap " + Format(BestLap), "Race again");
                    GuideVoice.Say("You finished " + place + "!");
                }
                else
                {
                    ShowMenu("Finished!", "Time " + Format(RaceTime) + "\nBest lap " + Format(BestLap), "Race again");
                    GuideVoice.Say(best ? "A new best lap! Great driving." : "Great driving! Want another race?");
                }
            }
            else
            {
                Lap++;
                GuideVoice.Say(Lap == laps ? "Last lap!" : "Lap " + Lap + "!");
            }
        }

        void UpdateGhost()
        {
            // With real cars to race there is no ghost: it would only be one more shape on the road.
            if (rivals != null || ghostPrefab == null || ghostTrace == null || ghostTrace.Count < 2 || State != Phase.Racing)
            {
                if (ghost != null) ghost.gameObject.SetActive(false);
                return;
            }
            if (ghost == null) ghost = Instantiate(ghostPrefab, transform).transform;
            float t = RaceTime - lapStart;
            int i = Mathf.Clamp(Mathf.FloorToInt(t / 0.1f), 0, ghostTrace.Count - 2);
            float u = Mathf.Clamp01(t / 0.1f - i);
            var a = ghostTrace[i]; var b = ghostTrace[i + 1];
            ghost.gameObject.SetActive(t < ghostTrace[ghostTrace.Count - 1].w);
            ghost.position = new Vector3(Mathf.Lerp(a.x, b.x, u), car.position.y, Mathf.Lerp(a.y, b.y, u));
            ghost.rotation = Quaternion.Euler(0, Mathf.LerpAngle(a.z, b.z, u), 0);
        }

        void UpdateDash()
        {
            if (dashSpeed != null) dashSpeed.text = Mathf.RoundToInt(Speed * 3.6f) + " km/h";
            if (dashLap != null)
                dashLap.text = State == Phase.Ready ? "Lap -"
                    : rivals != null ? "L" + Mathf.Min(Lap, laps) + "/" + laps + "  P" + Place + "/" + Racers
                    : "Lap " + Mathf.Min(Lap, laps) + "/" + laps;
            if (dashTime != null) dashTime.text = Format(State == Phase.Racing ? RaceTime - lapStart : LastLapTime);
        }

        static string Format(float seconds)
        {
            int m = (int)(seconds / 60f);
            return m + ":" + (seconds - m * 60f).ToString("00.0");
        }
    }
}
