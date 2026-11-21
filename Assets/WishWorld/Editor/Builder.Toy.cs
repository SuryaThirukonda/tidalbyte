using System;
using System.Collections.Generic;
using UnityEditor;
using UnityEngine;

namespace WishWorld.EditorTools
{
    /// <summary>
    /// The toys behind "scan a toy". Each one is a model the team made ahead of time from its own photographs of
    /// the toy, built here the same way as every other creature (a generated low-poly mesh, see CreatureMeshes).
    /// Nothing is captured by the headset: the scan in the app is a staged animation that ends with this model.
    /// Toys go into WorldLibrary.toys, not WorldLibrary.creatures, so the menu and the command matcher cannot
    /// reach one before it has been scanned. WISHWORLD_TOY=off in .env leaves them out altogether.
    /// </summary>
    public static partial class WishWorldBuilder
    {
        class ToySpec
        {
            public string id, name, greeting, greeting2, fact; public string[] keys; public Func<MeshBuilder> mesh;
            public MoveType move = MoveType.Walk; public float speed = 0.25f, minD = 1.8f, maxD = 2.1f, ar = 0.6f, pitch = 1f;
            /// <summary>
            /// Size in a world, as a multiple of the real toy. The model itself is built at real size, which is small
            /// next to the other creatures, so a toy is shown larger in a world. In the real room the "ar" scale
            /// brings it back to about its true size (1.7 x 0.6 is close to 1).
            /// </summary>
            public float worldScale = 1f;
        }

        // The words are the team's own, written for this toy; the species is deliberately not named.
        // {child} in a greeting is replaced with the child's name when it is spoken (see ToyScan).
        static readonly ToySpec[] Toys =
        {
            new ToySpec
            {
                id = "bubby", name = "Bubby", keys = new[] { "bubby", "my toy", "my friend" }, mesh = CreatureMeshes.Bubby,
                greeting = "Hi {child}! I'm Bubby! I'm so excited to be on this adventure with you!",
                greeting2 = "I can't wait to learn new things together. Where should we go first?",
                fact = "Bubby is soft and fuzzy, and loves exploring and learning new things with you.",
                move = MoveType.Walk, speed = 0.25f, ar = 0.6f, worldScale = 1.7f,
            },
        };

        public static bool ToysEnabled => EnvSync.Read("WISHWORLD_TOY", "on").ToLowerInvariant() != "off";

        static string ToyPrefabName(ToySpec t) => "Model_" + t.name.Replace(" ", "").Replace(".", "").Replace("-", "");

        /// <summary>Builds each toy's mesh, prefab and definition. With WISHWORLD_TOY=off it removes them instead and returns none.</summary>
        static CreatureDefinition[] BuildToys()
        {
            var list = new List<CreatureDefinition>();
            bool on = ToysEnabled;
            foreach (var t in Toys)
            {
                string pname = ToyPrefabName(t);
                string defPath = Root + "/Definitions/Creatures/" + t.id + ".asset";
                if (!on)
                {
                    foreach (var stale in new[] { Gen + "/Prefabs/" + pname + ".prefab", Gen + "/Meshes/" + pname + ".asset", defPath })
                        if (System.IO.File.Exists(stale)) AssetDatabase.DeleteAsset(stale);
                    continue;
                }

                var mb = t.mesh();
                var mesh = SaveMesh(mb, pname);
                var go = MeshObject(pname, mesh);
                go.transform.localScale = Vector3.one * t.worldScale;
                var box = go.AddComponent<BoxCollider>();
                box.center = mesh.bounds.center;
                box.size = Vector3.Max(mesh.bounds.size, Vector3.one * 0.12f);
                box.isTrigger = true;
                var prefab = SavePrefab(go, pname);

                var d = ScriptableObject.CreateInstance<CreatureDefinition>();
                d.id = t.id; d.displayName = t.name; d.keywords = t.keys; d.prefab = prefab; d.moveType = t.move; d.speed = t.speed;
                d.minDistance = t.minD; d.maxDistance = t.maxD; d.minHeight = 0f; d.maxHeight = 0f; d.arScale = t.ar;
                d.addCount = 1; d.schooling = false; d.voicePitch = t.pitch;
                d.fact = t.fact; d.quizQuestion = "";
                d.factChecked = true;      // written by the team about its own toy, not taken from general knowledge
                d.toy = true; d.greeting = t.greeting; d.greeting2 = t.greeting2;
                list.Add(Save(d, defPath));
                Debug.Log("[WishWorld] Toy " + t.name + ": " + mb.TriangleCount + " triangles, " + mesh.bounds.size.z.ToString("F2") + " m long.");
            }
            if (!on) Debug.Log("[WishWorld] WISHWORLD_TOY=off: no toy was built, and \"scan a toy\" is left out of the app.");
            return list.ToArray();
        }
    }
}
