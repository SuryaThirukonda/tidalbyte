using System;
using System.Collections.Generic;
using UnityEngine;

namespace WishWorld
{
    /// <summary>A world is data: a backdrop, a mood and a creature list. No scene of its own.</summary>
    [CreateAssetMenu(menuName = "WishWorld/World")]
    public class WorldDefinition : ScriptableObject
    {
        [Serializable]
        public class Entry
        {
            public CreatureDefinition creature;
            public int count = 1;
        }

        public string id;
        public string displayName;
        public string[] keywords;
        [Tooltip("Pre-made 360 panorama (equirectangular).")]
        public Texture2D skyTexture;
        [Tooltip("Prompt used if live skybox generation is switched on.")]
        public string skyPrompt;
        public GroundMode ground = GroundMode.Full;
        public Color groundColor = Color.white;
        [Tooltip("Surroundings prefab under Resources (terrain and props to the horizon), loaded only while this world is shown. Empty for none.")]
        public string scenery;
        [Tooltip("Direction the sun's light travels, matched to the sun in the sky photograph. Zero keeps the scene's own.")]
        public Vector3 sunDirection;
        [Tooltip("Where fog starts, as a fraction of fogEnd.")]
        public float fogStart = 0.2f;
        public Color fogColor = Color.white;
        [Tooltip("Distance in metres where fog is full. 0 turns fog off.")]
        public float fogEnd = 0f;
        public Color lightColor = Color.white;
        public float lightIntensity = 1f;
        public Color ambientColor = new Color(0.6f, 0.6f, 0.6f);
        [Tooltip("0 underwater, 1 wind, 2 space hum, 3 outdoors")]
        public int ambientKind = 1;
        public string guideIntro;
        public bool showInMenu = true;
        public List<Entry> creatures = new List<Entry>();
    }
}
