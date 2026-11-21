using UnityEngine;

namespace WishWorld
{
    /// <summary>Per-scene ambient light. Applied on load because a custom ambient probe is not saved with the scene.</summary>
    [DefaultExecutionOrder(-150)]
    public class SceneEnvironment : MonoBehaviour
    {
        public Color ambient = new Color(0.7f, 0.74f, 0.8f);
        void Awake() { WWEnv.SetAmbient(ambient); }
    }
}
