using System.Collections.Generic;
using UnityEngine;

namespace WishWorld
{
    /// <summary>Places creatures from a definition on a ring around the player.</summary>
    public static class Spawner
    {
        public const float MinRing = 1f, MaxRing = 6f;

        public class Context
        {
            public Vector3 playerFloor;   // point on the floor under the player
            public Vector3 forward;       // direction the scene faces
            public bool ar;
            public Transform parent;
            /// <summary>How many walkers the whole world has, and how many have been placed so far.</summary>
            public int walkerTotal, walkerIndex;
            /// <summary>Put a blob shadow on the floor under each creature (worlds with a floor, and the real room).</summary>
            public bool shadows;
        }

        public static List<Creature> Spawn(CreatureDefinition def, int count, float scale, Context ctx)
        {
            var list = new List<Creature>();
            if (def == null || def.prefab == null || count <= 0) return list;

            // Same creature, same places every time: rebuilding after a command does not shuffle the world.
            var rng = new System.Random(def.id.GetHashCode());
            float Rand(float a, float b) => a + (float)rng.NextDouble() * (b - a);

            float size = scale * (ctx.ar ? def.arScale : 1f);
            float baseAngle = Mathf.Atan2(ctx.forward.z, ctx.forward.x) + (def.schooling ? Rand(-0.7f, 0.1f) : Rand(-1.2f, 1.2f));
            float schoolRadius = Rand(def.minDistance, def.maxDistance);
            float schoolHeight = Rand(def.minHeight, def.maxHeight);
            int dir = rng.Next(2) == 0 ? 1 : -1;

            for (int i = 0; i < count; i++)
            {
                var go = Object.Instantiate(def.prefab, ctx.parent);
                go.name = def.displayName;
                go.transform.localScale = def.prefab.transform.localScale * size;

                var m = go.GetComponent<Mover>();
                if (m == null) m = go.AddComponent<Mover>();
                m.type = def.moveType;
                m.speed = def.speed * Rand(0.8f, 1.2f) * (ctx.ar ? Mathf.Lerp(def.arScale, 1f, 0.5f) : 1f);
                m.phase = Rand(0f, 6.283f);
                m.bob = (def.moveType == MoveType.Fly ? 0.25f : 0.15f) * (ctx.ar ? 0.5f : 1f);

                float radius, height, angle;
                if (def.moveType == MoveType.Orbit)
                {
                    // A little solar system in front of the player: tabletop sized in AR.
                    float k = ctx.ar ? 0.3f : 1f;
                    m.center = ctx.playerFloor + ctx.forward * (ctx.ar ? 0.85f : 3.2f);
                    radius = Mathf.Lerp(def.minDistance, def.maxDistance, count > 1 ? i / (float)(count - 1) : Rand(0f, 1f)) * k;
                    height = ctx.ar ? 1.05f : 1.45f;
                    angle = Rand(0f, 6.283f);
                    m.direction = 1;
                    m.bob = radius * 0.18f;
                }
                else
                {
                    m.center = ctx.playerFloor;
                    if (def.schooling)
                    {
                        radius = schoolRadius + Rand(-0.35f, 0.35f);
                        height = schoolHeight + Rand(-0.3f, 0.3f);
                        angle = baseAngle + i * 0.16f + Rand(-0.05f, 0.05f);
                        m.direction = dir;
                    }
                    else
                    {
                        radius = Rand(def.minDistance, def.maxDistance);
                        height = Rand(def.minHeight, def.maxHeight);
                        angle = baseAngle + i * (6.283f / Mathf.Max(count, 3)) + Rand(-0.3f, 0.3f);
                        m.direction = rng.Next(2) == 0 ? 1 : -1;
                    }
                    if (ctx.ar) { radius = Mathf.Clamp(radius * 0.45f, 0.9f, 2.4f); height = Mathf.Clamp(height * 0.8f, 0f, 1.9f); }
                    // Bigger creatures stand further back so they never crowd the head.
                    radius = Mathf.Clamp(Mathf.Max(radius, MinRing + 0.4f * (size - 1f)), MinRing, MaxRing);
                    if (def.moveType == MoveType.Walk)
                    {
                        // Each walker gets its own slice of the circle and paces inside it.
                        height = 0f;
                        int total = Mathf.Max(1, ctx.walkerTotal);
                        float slice = 6.283f / total;
                        angle = Mathf.Atan2(ctx.forward.z, ctx.forward.x) + slice * (ctx.walkerIndex + 0.5f);
                        m.arc = Mathf.Min(0.45f, slice * 0.32f);
                        ctx.walkerIndex++;
                    }
                }
                m.radius = radius;
                m.height = height;
                m.Place(angle);

                var c = go.GetComponent<Creature>();
                if (c == null) c = go.AddComponent<Creature>();
                c.def = def;
                c.mover = m;
                c.renderers = go.GetComponentsInChildren<Renderer>();
                c.hitCollider = go.GetComponentInChildren<Collider>();
                list.Add(c);
                if (ctx.shadows) BlobShadow.Attach(go.transform, ctx.playerFloor.y, 0f, def.moveType == MoveType.Walk ? 2f : 3.5f, ctx.parent);
            }
            return list;
        }
    }
}
