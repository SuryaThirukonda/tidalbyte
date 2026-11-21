using UnityEngine;
using UnityEngine.Rendering;

namespace WishWorld
{
    public static class WWEnv
    {
        /// <summary>Flat ambient light that the vertex-colour shader reads through the ambient probe.</summary>
        public static void SetAmbient(Color color)
        {
            RenderSettings.ambientMode = AmbientMode.Custom;
            var sh = new SphericalHarmonicsL2();
            sh.AddAmbientLight(color);
            RenderSettings.ambientProbe = sh;
            RenderSettings.ambientLight = color;
        }
    }
}
