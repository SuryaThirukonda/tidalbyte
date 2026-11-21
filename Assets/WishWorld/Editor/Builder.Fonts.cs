using System.Text;
using TMPro;
using UnityEditor;
using UnityEngine;
using UnityEngine.TextCore.LowLevel;

namespace WishWorld.EditorTools
{
    /// <summary>
    /// Turns the three storybook fonts in Assets/ThirdParty/Fonts into TextMesh Pro font assets with fixed atlases.
    /// Fixed (static) atlases are used because the project's TMP settings clear dynamic font data at build time.
    /// </summary>
    public static partial class WishWorldBuilder
    {
        const string FontSrc = "Assets/ThirdParty/Fonts";
        const string FontOut = Gen + "/Fonts";

        static string FontChars()
        {
            var sb = new StringBuilder();
            for (char c = ' '; c <= '~'; c++) sb.Append(c);
            sb.Append("‘’“”–—…°×éèñç");
            return sb.ToString();
        }

        [MenuItem("WishWorld/Rebuild Fonts")]
        public static void RebuildFonts() => BuildFonts(true);

        /// <returns>title, heading, body (any may be null if its file is missing)</returns>
        public static TMP_FontAsset[] BuildFonts(bool force)
        {
            var plain = AssetDatabase.LoadAssetAtPath<TMP_FontAsset>(FontPath);
            return new[]
            {
                BuildFont("MountainsofChristmas-Bold", "F_Title", force, plain),
                BuildFont("BerkshireSwash-Regular", "F_Heading", force, plain),
                BuildFont("Almendra-Regular", "F_Body", force, plain),
            };
        }

        static TMP_FontAsset BuildFont(string ttf, string name, bool force, TMP_FontAsset fallback)
        {
            string outPath = FontOut + "/" + name + ".asset";
            var existing = AssetDatabase.LoadAssetAtPath<TMP_FontAsset>(outPath);
            if (existing != null && !force) return existing;

            var font = AssetDatabase.LoadAssetAtPath<Font>(FontSrc + "/" + ttf + ".ttf");
            if (font == null)
            {
                Debug.LogWarning("[WishWorld] Font file missing: " + ttf + ".ttf; the plain font is used instead.");
                return null;
            }
            if (existing != null) AssetDatabase.DeleteAsset(outPath);
            EnsureFolder(FontOut);

            var fa = TMP_FontAsset.CreateFontAsset(font, 72, 8, GlyphRenderMode.SDFAA, 1024, 1024, AtlasPopulationMode.Dynamic, false);
            if (fa == null)
            {
                Debug.LogWarning("[WishWorld] Could not create a font asset from " + ttf);
                return null;
            }
            fa.name = name;
            AssetDatabase.CreateAsset(fa, outPath);

            fa.TryAddCharacters(FontChars(), out string missing);
            if (!string.IsNullOrEmpty(missing)) Debug.Log("[WishWorld] " + name + " has no glyphs for: " + missing + " (the plain font fills in)");

            var tex = fa.atlasTextures[0];
            tex.name = name + " Atlas";
            AssetDatabase.AddObjectToAsset(tex, fa);
            fa.material.name = name + " Material";
            AssetDatabase.AddObjectToAsset(fa.material, fa);

            fa.atlasPopulationMode = AtlasPopulationMode.Static;
            if (fallback != null) fa.fallbackFontAssetTable = new System.Collections.Generic.List<TMP_FontAsset> { fallback };
            EditorUtility.SetDirty(fa);
            EditorUtility.SetDirty(tex);
            EditorUtility.SetDirty(fa.material);
            AssetDatabase.SaveAssets();
            Debug.Log($"[WishWorld] Font {name}: {fa.characterTable.Count} characters, atlas {tex.width}x{tex.height}");
            return fa;
        }
    }
}
