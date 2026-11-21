using System;
using System.Collections.Generic;

namespace WishWorld
{
    /// <summary>Everything a command can change. Copied before each command so "undo" can restore it.</summary>
    [Serializable]
    public class WorldState
    {
        [Serializable]
        public class Entry
        {
            public string creatureId;
            public int count = 1;
            public string color = "";
            public float scale = 1f;
        }

        public string worldId = "";
        public List<Entry> entries = new List<Entry>();
        public bool ar, snow, night;

        public Entry Find(string creatureId)
        {
            foreach (var e in entries) if (e.creatureId == creatureId) return e;
            return null;
        }

        public WorldState Clone()
        {
            var s = new WorldState { worldId = worldId, ar = ar, snow = snow, night = night };
            foreach (var e in entries) s.entries.Add(new Entry { creatureId = e.creatureId, count = e.count, color = e.color, scale = e.scale });
            return s;
        }
    }
}
