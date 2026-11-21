using UnityEngine;

namespace WishWorld
{
    /// <summary>Slowly circles the scene centre. Used for clouds.</summary>
    public class Drift : MonoBehaviour
    {
        public float degreesPerSecond = 1f;
        void Update() { transform.RotateAround(Vector3.zero, Vector3.up, degreesPerSecond * Time.deltaTime); }
    }
}
