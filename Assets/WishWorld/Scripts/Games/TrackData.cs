using UnityEngine;

namespace WishWorld
{
    /// <summary>The centre line of a closed race track, sampled evenly, with its width.</summary>
    public class TrackData : ScriptableObject
    {
        public Vector3[] points;
        public float width = 7f;
        public float length;

        /// <summary>Index of the nearest centre-line sample, searching near a previous index.</summary>
        public int Nearest(Vector3 pos, int hint, int window = 14)
        {
            int n = points.Length, best = hint;
            float bestD = float.MaxValue;
            for (int k = -window; k <= window; k++)
            {
                int i = ((hint + k) % n + n) % n;
                float d = (points[i] - pos).sqrMagnitude;
                if (d < bestD) { bestD = d; best = i; }
            }
            return best;
        }

        public Vector3 Direction(int i)
        {
            int n = points.Length;
            return (points[(i + 1) % n] - points[(i - 1 + n) % n]).normalized;
        }
    }
}
