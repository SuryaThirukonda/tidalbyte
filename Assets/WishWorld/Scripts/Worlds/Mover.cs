using UnityEngine;

namespace WishWorld
{
    /// <summary>
    /// Movement in code, so models need no rigging. Every type keeps the creature on a ring
    /// around a centre point, which is what keeps it in view and away from the player's head.
    /// </summary>
    public class Mover : MonoBehaviour
    {
        public MoveType type;
        public Vector3 center;
        public float radius = 3f;
        public float height = 1.2f;
        public float speed = 0.4f;
        public float bob = 0.15f;
        public float phase;
        public int direction = 1;
        [Tooltip("Slows to a crawl while the fact card is showing, so it can be touched.")]
        public float speedScale = 1f;

        [Tooltip("Walkers pace back and forth over this arc (radians) around their own spot, so they never walk through each other.")]
        public float arc = 0.4f;

        /// <summary>Extra offset used when a creature shies away from a reaching hand. Fades back to zero.</summary>
        [System.NonSerialized] public Vector3 nudge;

        float angle;
        float t, home, walkT;

        public void Place(float startAngle)
        {
            angle = startAngle;
            home = startAngle;
            walkT = phase;
            Step(0f);
        }

        void Update()
        {
            Step(Time.deltaTime);
            if (nudge.sqrMagnitude > 1e-6f)
            {
                transform.position += nudge;
                nudge = Vector3.MoveTowards(nudge, Vector3.zero, Time.deltaTime * 0.35f);
            }
        }

        void Step(float dt)
        {
            t += dt;
            switch (type)
            {
                case MoveType.Float:
                {
                    var p = center + new Vector3(Mathf.Cos(angle) * radius, height + Mathf.Sin(t * 0.6f + phase) * bob, Mathf.Sin(angle) * radius);
                    transform.position = p;
                    transform.rotation = Quaternion.Euler(Mathf.Sin(t * 0.4f + phase) * 6f, phase * Mathf.Rad2Deg + t * 12f * direction * speedScale, 0);
                    break;
                }
                case MoveType.Walk:
                {
                    // Pace along a short arc; top speed in the middle, slowing to turn at each end.
                    walkT += dt * speed * speedScale / Mathf.Max(0.05f, radius * arc);
                    angle = home + arc * Mathf.Sin(walkT);
                    float sign = Mathf.Cos(walkT) >= 0 ? 1f : -1f;
                    float step = Mathf.Abs(Mathf.Cos(walkT));
                    var p = center + new Vector3(Mathf.Cos(angle) * radius, height + Mathf.Abs(Mathf.Sin(t * 5f + phase)) * 0.02f * step * transform.lossyScale.y, Mathf.Sin(angle) * radius);
                    var facing = Quaternion.LookRotation(new Vector3(-Mathf.Sin(angle), 0, Mathf.Cos(angle)) * sign, Vector3.up)
                                 * Quaternion.Euler(0, 0, Mathf.Sin(t * 5f + phase) * 2f * step);
                    transform.position = p;
                    transform.rotation = dt <= 0f ? facing : Quaternion.Slerp(transform.rotation, facing, dt * 2.5f);
                    break;
                }
                default:
                {
                    angle += direction * (speed * speedScale / Mathf.Max(radius, 0.2f)) * dt;
                    float y = height;
                    float pitch = 0, roll = 0, yawWiggle = 0;
                    if (type == MoveType.Swim)
                    {
                        y += Mathf.Sin(t * 0.6f + phase) * bob;
                        pitch = -Mathf.Cos(t * 0.6f + phase) * 6f;
                        yawWiggle = Mathf.Sin(t * 5f + phase) * 7f * speedScale;
                    }
                    else if (type == MoveType.Fly)
                    {
                        y += Mathf.Sin(t * 0.9f + phase) * bob;
                        pitch = -Mathf.Cos(t * 0.9f + phase) * 8f;
                        roll = -direction * 14f;
                    }
                    else if (type == MoveType.Orbit)
                    {
                        y += Mathf.Sin(angle + phase) * bob;
                    }
                    var p = center + new Vector3(Mathf.Cos(angle) * radius, y, Mathf.Sin(angle) * radius);
                    var tangent = new Vector3(-Mathf.Sin(angle), 0, Mathf.Cos(angle)) * direction;
                    transform.position = p;
                    if (type == MoveType.Orbit)
                        transform.rotation = Quaternion.Euler(12f, t * 20f + phase * Mathf.Rad2Deg, 0);
                    else
                        transform.rotation = Quaternion.LookRotation(tangent, Vector3.up) * Quaternion.Euler(pitch, yawWiggle, roll);
                    break;
                }
            }
        }
    }
}
