using System;
using System.Collections.Generic;
using UnityEngine;

namespace WishWorld
{
    /// <summary>A box of the mesh that becomes one moving part, and the point it turns about.</summary>
    public struct ReactionPart
    {
        public string name;
        public Vector3 min, max, pivot;
        /// <summary>True: min, max and pivot are fractions (0..1) of the mesh's bounds. False: mesh metres.</summary>
        public bool normalized;
    }

    /// <summary>One creature's touch reaction: its parts and how they move over time.</summary>
    public class Reaction
    {
        public string name;
        public float duration;
        public ReactionPart[] parts = new ReactionPart[0];
        /// <summary>Called every frame while playing with the time since it started. Leave out a call and that piece rests.</summary>
        public Action<CreatureReaction, float> eval;
    }

    /// <summary>
    /// Every creature's touch reaction, by creature id. Coordinates are in the creature's own mesh space: metres, +Z is
    /// the front, +Y up, walkers stand on y = 0 (see CreatureMeshes). The baked farm models (cow, horse, pig, sheep,
    /// zebra, Saturn) use fractions of their bounds instead, since their shapes come from outside.
    ///
    /// Turning rules of thumb: +X pitches the front down, -X lifts it; +Z raises a part that sticks out to the
    /// creature's right (+X side) and -Z raises one on its left; a part hanging down swings sideways with Z.
    /// </summary>
    public static class CreatureReactions
    {
        static readonly Dictionary<string, Reaction> byId = new Dictionary<string, Reaction>();
        static Reaction walk, swim, fly, floaty, orbit;

        public static Reaction For(CreatureDefinition def)
        {
            if (byId.Count == 0) Register();
            if (def != null && !string.IsNullOrEmpty(def.id) && byId.TryGetValue(def.id, out var r)) return r;
            switch (def != null ? def.moveType : MoveType.Walk)
            {
                case MoveType.Swim: return swim;
                case MoveType.Fly: return fly;
                case MoveType.Float: return floaty;
                case MoveType.Orbit: return orbit;
                default: return walk;
            }
        }

        /// <summary>Every creature id that has its own reaction (the rest share one by how they move).</summary>
        public static IEnumerable<string> Ids { get { if (byId.Count == 0) Register(); return byId.Keys; } }

        // ---- timing helpers: t is seconds since the reaction began ----

        static float Smooth(float u) { u = Mathf.Clamp01(u); return u * u * (3f - 2f * u); }
        /// <summary>0 before a, eases up to 1 by b, holds to c, eases back to 0 by d.</summary>
        static float Env(float t, float a, float b, float c, float d) => t < c ? Smooth((t - a) / Mathf.Max(1e-4f, b - a)) : 1f - Smooth((t - c) / Mathf.Max(1e-4f, d - c));
        /// <summary>A smooth bump: 0 at a, 1 halfway, 0 at b.</summary>
        static float Bell(float t, float a, float b) { if (t <= a || t >= b) return 0f; return Mathf.Sin((t - a) / (b - a) * Mathf.PI); }
        /// <summary>A jump arc: 0 at a, 1 halfway, 0 at b (a parabola, so it falls like a body would).</summary>
        static float Hop(float t, float a, float b) { if (t <= a || t >= b) return 0f; float u = (t - a) / (b - a); return 4f * u * (1f - u); }
        /// <summary>Eased progress from 0 at a to 1 at b; for whole turns.</summary>
        static float Prog(float t, float a, float b) => Smooth((t - a) / Mathf.Max(1e-4f, b - a));
        static float Osc(float t, float hz, float phase = 0f) => Mathf.Sin((t * hz + phase) * Mathf.PI * 2f);
        /// <summary>0..1 flapping, for wings and flippers.</summary>
        static float Flap(float t, float hz) => 0.5f - 0.5f * Mathf.Cos(t * hz * Mathf.PI * 2f);

        static Vector3 V(float x, float y, float z) => new Vector3(x, y, z);
        const float Far = 99f;

        static ReactionPart M(string name, Vector3 min, Vector3 max, Vector3 pivot) => new ReactionPart { name = name, min = min, max = max, pivot = pivot };
        static ReactionPart N(string name, Vector3 min, Vector3 max, Vector3 pivot) => new ReactionPart { name = name, min = min, max = max, pivot = pivot, normalized = true };
        /// <summary>The same box and pivot on the creature's other side.</summary>
        static ReactionPart Mirror(string name, ReactionPart p) =>
            new ReactionPart { name = name, min = V(-p.max.x, p.min.y, p.min.z), max = V(-p.min.x, p.max.y, p.max.z), pivot = V(-p.pivot.x, p.pivot.y, p.pivot.z), normalized = p.normalized };

        static void Add(string id, float duration, Action<CreatureReaction, float> eval, params ReactionPart[] parts) =>
            byId[id] = new Reaction { name = id, duration = duration, eval = eval, parts = parts };

        static void Register()
        {
            // ================= zoo =================

            // Elephant: lifts its trunk high and trumpets, ears fanning, tail swishing.
            var earR = M("EarR", V(0.35f, 1.9f, 1.1f), V(Far, Far, 1.8f), V(0.42f, 2.23f, 1.3f));
            Add("elephant", 3.4f, (r, t) =>
            {
                float lift = Env(t, 0.1f, 0.7f, 2.4f, 3.2f);
                float on = Env(t, 0.1f, 0.3f, 2.8f, 3.3f);
                r.Part(0, V(-115f * lift + 8f * Osc(t, 3f) * lift, 0, 0));
                float ear = 35f * Flap(t, 2.2f) * on;
                r.Part(1, V(0, -ear, 0));
                r.Part(2, V(0, ear, 0));
                r.Part(3, V(0, 0, 25f * Osc(t, 3f) * on));
                r.Body(V(0, 0, -0.9f), V(-7f * lift, 0, 0));
            },
            M("Trunk", V(-0.15f, -Far, 1.9f), V(0.15f, 2.2f, Far), V(0, 2.15f, 1.95f)),
            earR, Mirror("EarL", earR),
            M("Tail", V(-0.2f, 1f, -Far), V(0.2f, 2f, -1.1f), V(0, 1.85f, -1.2f)));

            // Giraffe: bows its long neck right down towards the child for a closer look, then straightens up.
            Add("giraffe", 3.4f, (r, t) =>
            {
                float bow = Env(t, 0.2f, 1.1f, 2.2f, 3.2f);
                r.Part(0, V(38f * bow + 4f * Osc(t, 2.5f) * bow, 8f * Osc(t, 1.2f) * bow, 0));
                r.Part(1, V(0, 0, 25f * Osc(t, 2.5f) * Env(t, 0, 0.3f, 2.9f, 3.4f)));
            },
            M("Neck", V(-Far, 2.6f, 0.4f), V(Far, Far, Far), V(0, 2.4f, 0.7f)),
            M("Tail", V(-0.2f, 1.4f, -Far), V(0.2f, 2.6f, -0.75f), V(0, 2.35f, -0.82f)));

            // Lion: crouches, then throws its head up in a big roar with a shake of the mane, tail lashing.
            Add("lion", 3.0f, (r, t) =>
            {
                float crouch = Bell(t, 0f, 0.6f);
                float roar = Env(t, 0.45f, 0.8f, 1.9f, 2.5f);
                r.Part(0, V(-30f * roar + 10f * crouch, 10f * Osc(t, 6f) * roar, 0));
                r.Part(1, V(0, 35f * Osc(t, 1.6f) * Env(t, 0, 0.3f, 2.5f, 3f), 0));
                r.Body(r.Floor, V(-6f * roar, 0, 0), V(0, 0, 0.08f * roar), -0.12f * crouch + 0.05f * roar);
            },
            M("Head", V(-Far, 0.85f, 0.45f), V(Far, Far, Far), V(0, 1.0f, 0.5f)),
            M("Tail", V(-Far, -Far, -Far), V(Far, Far, -0.6f), V(0, 1.05f, -0.6f)));

            // Flamingo: tucks one leg up and stands on the other, then dips its head as if to feed.
            var legR = M("LegR", V(0.02f, -Far, -0.2f), V(0.2f, 0.62f, 0.2f), V(0.06f, 0.66f, 0));
            Add("flamingo", 3.2f, (r, t) =>
            {
                float lift = Env(t, 0.2f, 0.7f, 2.4f, 3.0f);
                r.Part(0, V(65f * lift, 0, 0));
                r.Part(1, V(45f * Bell(t, 0.9f, 2.2f), 0, 0));
                r.Body(V(-0.06f, 0, 0), V(0, 0, -5f * lift));
            },
            legR,
            M("Neck", V(-0.2f, 0.9f, 0f), V(0.2f, Far, Far), V(0, 0.88f, 0.12f)));

            // Zebra (baked model): bucks twice, kicking up its back legs, then a happy hop.
            Add("zebra", 2.8f, (r, t) =>
            {
                float buck = Hop(t, 0.2f, 0.75f) + Hop(t, 0.9f, 1.45f);
                float hop = Hop(t, 1.7f, 2.4f);
                r.Body(r.N(0.5f, 0f, 0.82f), V(24f * buck, 0, 0), V(0, 0.12f * r.H * hop, 0), -0.08f * Bell(t, 2.35f, 2.8f));
            });

            // ================= farm (baked models) =================

            // Horse: rears up on its back legs, front hooves pawing the air.
            Add("horse", 3.0f, (r, t) =>
            {
                float rear = Env(t, 0.2f, 0.8f, 1.8f, 2.6f);
                r.Body(r.N(0.5f, 0f, 0.12f), V(-38f * rear + 4f * Osc(t, 3f) * rear, 0, 0), default, -0.05f * Bell(t, 2.5f, 3f));
            });

            // Cow: two slow nods of the head as it moos, swaying from side to side.
            Add("cow", 3.0f, (r, t) =>
            {
                float nod = Bell(t, 0.2f, 1.1f) + Bell(t, 1.3f, 2.2f);
                float on = Env(t, 0, 0.4f, 2.4f, 3f);
                r.Part(0, V(22f * nod, 0, 0));
                r.Body(r.Floor, V(0, 0, 4f * Osc(t, 0.9f) * on), default, 0.05f * Bell(t, 0.1f, 2.6f));
            },
            N("Head", V(0f, 0.45f, 0.8f), V(1.01f, 1.01f, 1.01f), V(0.5f, 0.72f, 0.8f)));

            // Pig: a happy hop and a full spin in the air, then a waggle.
            Add("pig", 2.4f, (r, t) =>
            {
                float hop = Hop(t, 0.2f, 1.0f);
                float land = Bell(t, 0.95f, 1.25f);
                float wag = Env(t, 1.1f, 1.3f, 2.0f, 2.3f);
                r.Body(r.Floor, V(0, 360f * Prog(t, 0.2f, 1.0f), 10f * Osc(t, 2.5f) * wag), V(0, 0.3f * r.H * hop, 0), 0.08f * hop - 0.15f * land);
            });

            // Sheep: three stiff-legged springs straight up, the way lambs pronk.
            Add("sheep", 2.4f, (r, t) =>
            {
                float hop = Hop(t, 0.1f, 0.6f) + Hop(t, 0.75f, 1.25f) + Hop(t, 1.4f, 1.9f);
                float land = Bell(t, 0.55f, 0.75f) + Bell(t, 1.2f, 1.4f) + Bell(t, 1.85f, 2.2f);
                r.Body(r.Floor, V(-6f * hop, 0, 0), V(0, 0.3f * r.H * hop, 0), 0.1f * hop - 0.12f * land);
            });

            // Chicken: three quick pecks at the ground, then a flap of the wings with a little hop.
            var wingC = M("WingR", V(0.07f, 0.2f, -0.3f), V(Far, 0.6f, 0.3f), V(0.07f, 0.38f, 0));
            Add("chicken", 2.6f, (r, t) =>
            {
                float peck = Bell(t, 0.1f, 0.45f) + Bell(t, 0.55f, 0.9f) + Bell(t, 1.0f, 1.35f);
                float flap = 60f * Flap(t, 6f) * Env(t, 1.45f, 1.55f, 2.3f, 2.5f);
                r.Part(0, V(0, 0, flap));
                r.Part(1, V(0, 0, -flap));
                r.Body(V(0, 0, 0), V(40f * peck, 0, 0), V(0, 0.1f * Hop(t, 1.5f, 2.3f), 0));
            },
            wingC, Mirror("WingL", wingC));

            // ================= dinosaurs =================

            // T. rex: rears back its head and ROARS, shaking, little arms waving, tail swinging.
            var armT = M("ArmR", V(0.25f, 1.8f, 0.8f), V(Far, 2.6f, 1.5f), V(0.36f, 2.35f, 0.9f));
            Add("trex", 3.2f, (r, t) =>
            {
                float wind = Bell(t, 0f, 0.5f);
                float roar = Env(t, 0.4f, 0.8f, 2.0f, 2.6f);
                r.Part(0, V(-30f * roar + 12f * wind, 6f * Osc(t, 7f) * roar, 0));
                float arm = 30f * Osc(t, 5f) * roar;
                r.Part(1, V(arm, 0, 0));
                r.Part(2, V(-arm, 0, 0));
                r.Part(3, V(0, 20f * Osc(t, 1.2f) * Env(t, 0, 0.4f, 2.6f, 3.2f), 0));
                r.Body(V(0, 0, 0), V(6f * roar - 4f * wind, 0, 1.5f * Osc(t, 9f) * roar));
            },
            M("Head", V(-Far, 2.6f, 0.7f), V(Far, Far, Far), V(0, 2.5f, 0.8f)),
            armT, Mirror("ArmL", armT),
            M("Tail", V(-Far, -Far, -Far), V(Far, Far, -1.2f), V(0, 1.9f, -1.0f)));

            // Triceratops: lowers its horns and charges a step forward, then tosses its head twice.
            Add("triceratops", 2.8f, (r, t) =>
            {
                float charge = Env(t, 0.1f, 0.4f, 1.3f, 1.7f);
                float toss = Bell(t, 1.5f, 1.95f) + Bell(t, 2.05f, 2.5f);
                r.Part(0, V(20f * charge - 25f * toss, 0, 0));
                r.Part(1, V(0, 25f * Osc(t, 2f) * Env(t, 0, 0.3f, 2.3f, 2.8f), 0));
                r.Body(r.Floor, V(4f * charge, 0, 0), V(0, 0, 0.4f * Bell(t, 0.3f, 1.5f)), -0.05f * (Bell(t, 1.5f, 1.8f) + Bell(t, 2.05f, 2.35f)));
            },
            M("Head", V(-Far, 1.2f, 1.05f), V(Far, Far, Far), V(0, 1.7f, 1.1f)),
            M("Tail", V(-Far, -Far, -Far), V(Far, Far, -1.5f), V(0, 1.4f, -1.4f)));

            // Stegosaurus: swings its spiky tail side to side while its back plates flush and stand up.
            Add("stegosaurus", 3.0f, (r, t) =>
            {
                float on = Env(t, 0.1f, 0.4f, 2.4f, 3.0f);
                r.Part(0, V(0, 35f * Osc(t, 1.5f) * on, 0));
                r.Part(1, default, default, 1f + 0.18f * on);
                r.Body(r.Floor, V(0, 0, 3f * Osc(t, 1.5f, 0.25f) * on));
            },
            M("Tail", V(-Far, -Far, -Far), V(Far, Far, -1.75f), V(0, 1.3f, -1.5f)),
            M("Plates", V(-0.1f, 2.05f, -1.6f), V(0.1f, Far, Far), V(0, 2.1f, 0f)));

            // Pterosaur: three huge wingbeats and a swoop upward.
            var wingP = M("WingR", V(0.3f, -Far, -Far), V(Far, Far, Far), V(0.25f, 0.02f, 0));
            Add("pterosaur", 3.0f, (r, t) =>
            {
                float on = Env(t, 0, 0.3f, 2.4f, 3.0f);
                float flap = 45f * Osc(t, 1.3f) * on;
                r.Part(0, V(0, 0, flap));
                r.Part(1, V(0, 0, -flap));
                r.Body(V(0, 0, 0), V(-15f * Bell(t, 0, 3f), 0, 0), V(0, 0.4f * Bell(t, 0, 3f), 0));
            },
            wingP, Mirror("WingL", wingP));

            // ================= arctic =================

            // Penguin: flaps its flippers in excitement and hops twice, waddling.
            var flipP = M("FlipperR", V(0.19f, 0.15f, -0.3f), V(Far, 0.7f, 0.3f), V(0.21f, 0.58f, 0));
            Add("penguin", 2.6f, (r, t) =>
            {
                float f = 70f * Flap(t, 4f) * Env(t, 0, 0.2f, 2.2f, 2.6f);
                r.Part(0, V(0, 0, f));
                r.Part(1, V(0, 0, -f));
                float hop = Hop(t, 0.3f, 0.7f) + Hop(t, 1.0f, 1.4f);
                r.Body(V(0, 0, 0), V(0, 0, 8f * Osc(t, 2f) * Env(t, 0, 0.2f, 2.2f, 2.6f)), V(0, 0.12f * hop, 0), 0.06f * hop);
            },
            flipP, Mirror("FlipperL", flipP));

            // Polar bear: stands right up on its back legs and looks around, then drops down.
            Add("polarbear", 3.6f, (r, t) =>
            {
                float stand = Env(t, 0.2f, 1.0f, 2.4f, 3.2f);
                r.Part(0, V(-10f * stand, 25f * Osc(t, 0.6f) * stand, 0));
                r.Body(V(0, 0, -0.65f), V(-55f * stand, 0, 0), default, -0.08f * Bell(t, 3.1f, 3.6f));
            },
            M("Head", V(-Far, 1.0f, 0.8f), V(Far, Far, Far), V(0, 1.25f, 0.8f)));

            // Seal: lifts its chest, throws its head back and claps its front flippers.
            var flipS = M("FlipperR", V(0.18f, -Far, 0f), V(Far, 0.2f, Far), V(0.18f, 0.08f, 0.25f));
            Add("seal", 3.0f, (r, t) =>
            {
                float on = Env(t, 0.1f, 0.4f, 2.4f, 3.0f);
                float clap = 50f * Flap(t, 3.5f) * on;
                r.Part(0, V(-20f * on + 10f * Osc(t, 3.5f) * on, 0, 0));
                r.Part(1, V(0, 0, clap));
                r.Part(2, V(0, 0, -clap));
                r.Body(V(0, 0, -0.4f), V(-15f * on, 0, 0));
            },
            M("Head", V(-0.3f, 0.36f, 0.42f), V(0.3f, Far, Far), V(0, 0.38f, 0.42f)),
            flipS, Mirror("FlipperL", flipS));

            // Snowy owl: turns its head right round to look behind it, back again, then a curious tilt.
            var wingO = M("WingR", V(0.125f, -Far, -Far), V(Far, Far, Far), V(0.12f, 0.05f, 0));
            Add("snowyowl", 3.0f, (r, t) =>
            {
                r.Part(0, V(0, 180f * Env(t, 0.2f, 0.75f, 1.3f, 1.85f), 25f * Bell(t, 1.9f, 2.7f)));
                float flap = 40f * Osc(t, 3f) * Env(t, 2.3f, 2.45f, 2.8f, 3.0f);
                r.Part(1, V(0, 0, flap));
                r.Part(2, V(0, 0, -flap));
            },
            M("Head", V(-0.125f, 0.05f, 0.1f), V(0.125f, Far, Far), V(0, 0.1f, 0.125f)),
            wingO, Mirror("WingL", wingO));

            // ================= ocean =================

            // Clownfish: a quick barrel roll and dart forward, tail wiggling.
            Add("clownfish", 1.6f, (r, t) =>
            {
                float on = Env(t, 0, 0.2f, 1.2f, 1.6f);
                r.Body(V(0, 0, 0), V(0, 15f * Osc(t, 8f) * on, 360f * Prog(t, 0f, 0.9f)), V(0, 0, 0.1f * Bell(t, 0, 0.9f)));
            });

            // Shark: thrashes side to side and lunges forward, tail beating hard.
            Add("shark", 2.4f, (r, t) =>
            {
                float on = Env(t, 0, 0.3f, 1.8f, 2.4f);
                r.Part(0, V(0, 30f * Osc(t, 3f, 0.25f) * on, 0));
                r.Body(V(0, 0, 0), V(0, 18f * Osc(t, 3f) * on, 0), V(0, 0, 0.4f * Bell(t, 0.2f, 1.2f)));
            },
            M("Tail", V(-Far, -Far, -Far), V(Far, Far, -0.75f), V(0, 0.05f, -0.62f)));

            // Sea turtle: pulls its head into its shell, peeks back out, then waves its flippers.
            var flipT = M("FlipperR", V(0.25f, -Far, 0f), V(Far, Far, 0.5f), V(0.25f, -0.03f, 0.15f));
            Add("turtle", 3.0f, (r, t) =>
            {
                float hide = Env(t, 0.1f, 0.4f, 1.3f, 1.8f);
                r.Part(0, V(-10f * Bell(t, 1.6f, 2.4f), 0, 0), V(0, 0, -0.12f * hide), 1f - 0.4f * hide);
                float wave = 30f * Osc(t, 2f) * Env(t, 1.6f, 1.9f, 2.6f, 3.0f);
                r.Part(1, V(0, 0, wave));
                r.Part(2, V(0, 0, -wave));
                r.Body(V(0, 0, 0), default, default, -0.1f * hide);
            },
            M("Head", V(-0.12f, -Far, 0.32f), V(0.12f, Far, Far), V(0, 0.02f, 0.3f)),
            flipT, Mirror("FlipperL", flipT));

            // Ray: three slow, deep wingbeats that lift it in a glide.
            var wingR = M("WingR", V(0.18f, -Far, -Far), V(Far, Far, Far), V(0.17f, 0, 0));
            Add("ray", 3.0f, (r, t) =>
            {
                float flap = 40f * Osc(t, 1.2f) * Env(t, 0, 0.3f, 2.5f, 3.0f);
                r.Part(0, V(0, 0, flap));
                r.Part(1, V(0, 0, -flap));
                r.Body(V(0, 0, 0), V(-10f * Bell(t, 0, 3f), 0, 0), V(0, 0.15f * Bell(t, 0, 3f), 0));
            },
            wingR, Mirror("WingL", wingR));

            // Blue whale: noses up in a slow breach and beats its huge tail flukes.
            Add("whale", 3.4f, (r, t) =>
            {
                float rise = Env(t, 0.2f, 0.9f, 2.2f, 3.2f);
                r.Part(0, V(35f * Osc(t, 1.1f) * Env(t, 0, 0.3f, 2.8f, 3.4f), 0, 0));
                r.Body(V(0, 0, 0), V(-18f * rise, 0, 0), V(0, 0.3f * rise, 0));
            },
            M("Flukes", V(-Far, -Far, -Far), V(Far, Far, -1.6f), V(0, 0, -1.5f)));

            // Jellyfish: three pulses of its bell that push it upward, tentacles trailing.
            Add("jellyfish", 3.0f, (r, t) =>
            {
                float pulse = Bell(t, 0.1f, 0.5f) + Bell(t, 1.0f, 1.4f) + Bell(t, 1.9f, 2.3f);
                r.Part(0, default, default, 1f + 0.25f * pulse);
                r.Body(V(0, 0, 0), default, V(0, 0.3f * Bell(t, 0, 3f), 0), -0.25f * pulse);
            },
            M("Tentacles", V(-Far, -Far, -Far), V(Far, -0.05f, Far), V(0, -0.03f, 0)));

            // ================= rainforest =================

            // Monkey: throws both arms up and jumps for joy three times, tail swinging.
            var armM = M("ArmR", V(0.14f, 0.3f, -0.12f), V(Far, 0.68f, 0.15f), V(0.17f, 0.585f, 0));
            Add("monkey", 2.8f, (r, t) =>
            {
                float up = Env(t, 0.1f, 0.4f, 2.2f, 2.7f);
                float arm = 150f * up + 15f * Osc(t, 4f) * up;
                r.Part(0, V(0, 0, arm));
                r.Part(1, V(0, 0, -arm));
                r.Part(2, V(0, 30f * Osc(t, 2f) * up, 0));
                float hop = Hop(t, 0.4f, 0.85f) + Hop(t, 1.1f, 1.55f) + Hop(t, 1.8f, 2.25f);
                r.Body(V(0, 0, 0), default, V(0, 0.12f * hop, 0), 0.06f * hop);
            },
            armM, Mirror("ArmL", armM),
            M("Tail", V(-0.2f, -Far, -Far), V(0.2f, 0.9f, -0.15f), V(0, 0.42f, -0.15f)));

            // Tree frog: crouches, leaps, lands with a squish and puffs its throat to ribbit twice.
            Add("frog", 2.4f, (r, t) =>
            {
                float crouch = Bell(t, 0f, 0.3f), leap = Hop(t, 0.3f, 0.9f), land = Bell(t, 0.9f, 1.15f);
                float puff = Bell(t, 1.35f, 1.75f) + Bell(t, 1.85f, 2.25f);
                r.Body(V(0, 0, 0), V(-20f * leap, 0, 0), V(0, 0.25f * leap, 0), -0.2f * crouch + 0.25f * leap - 0.2f * land, 1f + 0.12f * puff);
            });

            // Parrot: dances to a beat, swaying side to side and bobbing its head, wings flicking.
            var wingPa = M("WingR", V(0.09f, -Far, -Far), V(Far, Far, Far), V(0.08f, 0.036f, 0));
            Add("parrot", 2.8f, (r, t) =>
            {
                float on = Env(t, 0, 0.3f, 2.3f, 2.8f);
                r.Part(0, V(18f * Flap(t, 3.2f) * on, 0, 0));
                float flick = 25f * Flap(t, 1.6f) * on;
                r.Part(1, V(0, 0, flick));
                r.Part(2, V(0, 0, -flick));
                r.Body(V(0, -0.1f, 0), V(0, 0, 14f * Osc(t, 1.6f) * on));
            },
            M("Head", V(-0.09f, 0.036f, 0.072f), V(0.09f, Far, Far), V(0, 0.07f, 0.09f)),
            wingPa, Mirror("WingL", wingPa));

            // Butterfly: flutters its wings fast and loops up in a little circle.
            var wingB = M("WingR", V(0.008f, -Far, -Far), V(Far, Far, Far), V(0.006f, 0.012f, 0));
            Add("butterfly", 2.0f, (r, t) =>
            {
                float on = Env(t, 0, 0.15f, 1.7f, 2.0f);
                float flap = 50f * Osc(t, 7f) * on;
                r.Part(0, V(0, 0, flap));
                r.Part(1, V(0, 0, -flap));
                r.Body(V(0, 0, 0), V(0, 360f * Prog(t, 0.2f, 1.7f), 0), V(0, 0.12f * Bell(t, 0, 2f), 0));
            },
            wingB, Mirror("WingL", wingB));

            // Sloth: very slowly swings itself all the way round its branch.
            Add("sloth", 3.8f, (r, t) =>
            {
                r.Body(V(0, 0.42f, 0), V(-360f * Prog(t, 0.2f, 3.6f), 0, 0));
            });

            // ================= sky =================

            // Bird: a barrel roll with quick wingbeats.
            var wingSky = M("WingR", V(0.08f, -Far, -Far), V(Far, Far, Far), V(0.075f, 0.032f, 0));
            Add("bird", 2.2f, (r, t) =>
            {
                float flap = 40f * Osc(t, 5f) * Env(t, 0, 0.2f, 1.8f, 2.2f);
                r.Part(0, V(0, 0, flap));
                r.Part(1, V(0, 0, -flap));
                r.Body(V(0, 0, 0), V(0, 0, 360f * Prog(t, 0.1f, 1.2f)), V(0, 0.15f * Bell(t, 0, 2.2f), 0));
            },
            wingSky, Mirror("WingL", wingSky));

            // Hot air balloon: the burner roars, the envelope swells and it rises, gently swaying.
            Add("balloon", 3.2f, (r, t) =>
            {
                float on = Env(t, 0, 0.5f, 2.4f, 3.2f);
                r.Body(r.Floor, V(0, 0, 6f * Osc(t, 0.8f) * on), V(0, 0.6f * Bell(t, 0, 3.2f), 0), 0f, 1f + 0.06f * Bell(t, 0.1f, 0.8f));
            });

            // Kite: loops the loop and swoops up.
            Add("kite", 2.6f, (r, t) =>
            {
                r.Body(V(0, 0, 0), V(0, 0, 360f * Prog(t, 0.2f, 1.6f) + 10f * Osc(t, 2f) * Env(t, 1.6f, 1.8f, 2.2f, 2.6f)), V(0, 0.3f * Bell(t, 0, 2.6f), 0));
            });

            // Plane: noses up and does a barrel roll.
            Add("plane", 2.4f, (r, t) =>
            {
                r.Body(V(0, 0, 0), V(-15f * Bell(t, 0, 2.2f), 0, 360f * Prog(t, 0.2f, 1.6f)), V(0, 0.4f * Bell(t, 0, 2.2f), 0));
            });

            // ================= space =================

            // Astronaut: a zero-gravity backflip, then a big wave.
            var armA = M("ArmR", V(0.22f, 0.45f, -0.3f), V(Far, 1.0f, 0.3f), V(0.3f, 0.96f, 0));
            Add("astronaut", 3.6f, (r, t) =>
            {
                float wave = Env(t, 1.8f, 2.1f, 3.1f, 3.5f);
                r.Part(0, V(0, 0, 150f * wave + 20f * Osc(t, 3f) * wave));
                r.Body(r.Center, V(-360f * Prog(t, 0.2f, 1.8f), 0, 0));
            },
            armA);

            // Rocket: fires its engine (the flame grows and flickers), spins and boosts forward.
            Add("rocket", 2.8f, (r, t) =>
            {
                float boost = Env(t, 0, 0.3f, 1.6f, 2.4f);
                r.Part(0, default, default, 1f + boost * (1f + 0.25f * Osc(t, 12f)));
                r.Body(V(0, 0, 0), V(0, 0, 720f * Prog(t, 0.1f, 2.2f)), V(0, 0, 0.5f * Bell(t, 0.1f, 2.6f)));
            },
            M("Flame", V(-Far, -Far, -Far), V(Far, Far, -0.65f), V(0, 0, -0.65f)));

            // Satellite: turns its solar panels right over to catch the sun, rocking a little.
            var panel = M("PanelR", V(0.3f, -Far, -Far), V(Far, Far, Far), V(0.3f, 0, 0));
            Add("satellite", 3.0f, (r, t) =>
            {
                float turn = 180f * Env(t, 0.2f, 1.2f, 1.8f, 2.8f);
                r.Part(0, V(turn, 0, 0));
                r.Part(1, V(-turn, 0, 0));
                r.Body(V(0, 0, 0), V(0, 0, 10f * Osc(t, 0.7f) * Env(t, 0, 0.3f, 2.5f, 3f)));
            },
            panel, Mirror("PanelL", panel));

            // Comet: whirls round twice, its tail flaring out long and bright.
            Add("comet", 2.4f, (r, t) =>
            {
                r.Part(0, default, default, 1f + 0.5f * Env(t, 0, 0.3f, 1.8f, 2.4f));
                r.Body(V(0, 0, 0), V(0, 0, 720f * Prog(t, 0, 1.9f)), default, 0f, 1f + 0.12f * Bell(t, 0, 0.6f));
            },
            M("Tail", V(-Far, -Far, -Far), V(Far, Far, -0.3f), V(0, 0, -0.2f)));

            // Earth: spins quickly twice on its axis with a little bounce.
            Add("earth", 3.0f, (r, t) =>
            {
                r.Body(V(0, 0, 0), V(0, 720f * Prog(t, 0, 2.6f), 0), default, 0f, 1f + 0.1f * Bell(t, 0, 0.5f));
            });

            // Venus: spins too, but backwards, because Venus really does turn the other way from most planets.
            Add("venus", 3.0f, (r, t) =>
            {
                r.Body(V(0, 0, 0), V(0, -720f * Prog(t, 0, 2.6f), 0), default, 0f, 1f + 0.1f * Bell(t, 0, 0.5f));
            });

            // Saturn: wobbles its rings like a spinning top and turns once round.
            Add("saturn", 3.2f, (r, t) =>
            {
                float on = Env(t, 0, 0.4f, 2.6f, 3.2f);
                r.Body(V(0, 0, 0), V(25f * Osc(t, 1f) * on, 360f * Prog(t, 0, 3f), 15f * Osc(t, 1f, 0.25f) * on));
            });

            // ================= the team's toy =================

            // Bubby: tilts its head side to side like a curious puppy and bounces happily.
            Add("bubby", 2.6f, (r, t) =>
            {
                float on = Env(t, 0, 0.3f, 2.1f, 2.6f);
                r.Part(0, V(0, 0, 20f * Osc(t, 1.2f) * on));
                float hop = Hop(t, 0.5f, 0.9f) + Hop(t, 1.1f, 1.5f);
                r.Body(V(0, 0, 0), V(0, 12f * Osc(t, 3f) * on, 0), V(0, 0.04f * hop, 0), 0.1f * hop - 0.1f * (Bell(t, 0.85f, 1.05f) + Bell(t, 1.45f, 1.65f)));
            },
            M("Head", V(-0.06f, 0.035f, 0.035f), V(0.06f, Far, Far), V(0, 0.05f, 0.04f)));

            // ================= anything else, by how it moves =================

            walk = new Reaction { name = "_walk", duration = 1.8f, eval = (r, t) =>
            {
                float hop = Hop(t, 0.2f, 0.8f) + Hop(t, 0.9f, 1.5f);
                r.Body(r.Floor, V(0, 10f * Osc(t, 3f) * Env(t, 0, 0.2f, 1.4f, 1.8f), 0), V(0, 0.25f * r.H * hop, 0), 0.1f * hop);
            } };
            swim = new Reaction { name = "_swim", duration = 1.6f, eval = (r, t) =>
                r.Body(r.Center, V(0, 0, 360f * Prog(t, 0, 1.2f)), V(0, 0, 0.1f * Bell(t, 0, 1.2f))) };
            fly = new Reaction { name = "_fly", duration = 2.0f, eval = (r, t) =>
                r.Body(r.Center, V(-360f * Prog(t, 0.1f, 1.6f), 0, 0), V(0, 0.2f * Bell(t, 0, 2f), 0)) };
            floaty = new Reaction { name = "_float", duration = 2.4f, eval = (r, t) =>
                r.Body(r.Center, V(0, 360f * Prog(t, 0.1f, 2f), 0), V(0, 0.2f * Bell(t, 0, 2.4f), 0)) };
            orbit = new Reaction { name = "_orbit", duration = 2.6f, eval = (r, t) =>
                r.Body(r.Center, V(0, 720f * Prog(t, 0, 2.3f), 0), default, 0f, 1f + 0.1f * Bell(t, 0, 0.5f)) };
        }
    }
}
