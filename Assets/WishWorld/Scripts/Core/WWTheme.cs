using TMPro;
using UnityEngine;

namespace WishWorld
{
    public enum WWFont { Body, Heading, Title, Plain }

    /// <summary>Shared look: materials, font and the palette taken from the event site.</summary>
    [CreateAssetMenu(menuName = "WishWorld/Theme")]
    public class WWTheme : ScriptableObject
    {
        public Material vertexLit;      // every placeholder mesh
        public Material uiPanel;        // flat panels and buttons
        public Material overlay;        // fade quad
        public Material particle;       // snow, juice, sparkles
        public Material line;           // pointer rays, trails
        public Material shadow;         // blob shadows under creatures and props
        public TMP_FontAsset font;          // plain: numbers on the dashboard and score panel
        public TMP_FontAsset fontTitle;     // Mountains of Christmas Bold: titles
        public TMP_FontAsset fontHeading;   // Berkshire Swash: headings and buttons
        public TMP_FontAsset fontBody;      // Almendra: body text

        public Color sky = new Color(0.72f, 0.80f, 0.88f);
        public Color snow = new Color(0.96f, 0.97f, 0.98f);
        public Color slate = new Color(0.20f, 0.25f, 0.32f);
        public Color peach = new Color(1.00f, 0.78f, 0.62f);
        public Color panel = new Color(0.93f, 0.95f, 0.97f);
        public Color button = new Color(0.82f, 0.88f, 0.94f);
        public Color ice = new Color(0.56f, 0.69f, 0.83f);        // thin frame line, snowflakes, icicle tips
        public Color ribbon = new Color(0.27f, 0.38f, 0.55f);     // title ribbons
        public Color shade = new Color(0.47f, 0.55f, 0.66f);      // drop shadows under panels

        public TMP_FontAsset Font(WWFont role)
        {
            TMP_FontAsset f = role == WWFont.Title ? fontTitle : role == WWFont.Heading ? fontHeading : role == WWFont.Body ? fontBody : font;
            return f != null ? f : font;
        }

        static WWTheme cached;
        public static WWTheme I
        {
            get
            {
                if (cached == null) cached = Resources.Load<WWTheme>("WWTheme");
                return cached;
            }
        }
    }
}
