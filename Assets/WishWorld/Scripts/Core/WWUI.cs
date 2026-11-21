using System;
using System.Collections.Generic;
using TMPro;
using UnityEngine;

namespace WishWorld
{
    /// <summary>
    /// Builds world-space UI out of flat rounded panels and TextMeshPro, with no Canvas.
    /// Panels face the viewer along -Z, like a Unity quad. All sizes are in metres.
    /// </summary>
    public enum PanelStyle { Auto, Plain, Frame, Pill, Ribbon, Bubble }

    public static partial class WWUI
    {
        public const int UILayer = 5;
        static readonly Dictionary<string, Mesh> meshCache = new Dictionary<string, Mesh>();

        public static GameObject Panel(Transform parent, string name, Vector2 size, Color fill, float radius = 0.03f, float border = 0.006f,
            PanelStyle style = PanelStyle.Auto, float tail = -0.28f)
        {
            var theme = WWTheme.I;
            if (style == PanelStyle.Auto) style = Mathf.Min(size.x, size.y) >= 0.18f ? PanelStyle.Frame : PanelStyle.Plain;
            var go = new GameObject(name);
            go.layer = UILayer;
            go.transform.SetParent(parent, false);
            go.AddComponent<MeshFilter>().sharedMesh = StyledMesh(style, size.x, size.y, radius, border, fill, tail);
            var mr = go.AddComponent<MeshRenderer>();
            mr.sharedMaterial = theme != null ? theme.uiPanel : null;
            mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            mr.receiveShadows = false;
            return go;
        }

        /// <summary>A swallow-tailed ribbon with a title on it. The tails reach past <paramref name="size"/> on both sides.</summary>
        public static TextMeshPro Ribbon(Transform parent, string text, float textHeight, Vector2 size, Vector3 localPosition,
            Color? fill = null, Color? textColor = null, WWFont font = WWFont.Title)
        {
            var theme = WWTheme.I;
            var holder = new GameObject("Ribbon " + text);
            holder.layer = UILayer;
            holder.transform.SetParent(parent, false);
            holder.transform.localPosition = localPosition;
            Panel(holder.transform, "bg", size, fill ?? (theme != null ? theme.ribbon : Color.blue), 0.006f, 0.006f, PanelStyle.Ribbon);
            return Label(holder.transform, text, textHeight, size - new Vector2(0.05f, 0.012f), textColor ?? (theme != null ? theme.snow : Color.white),
                TextAlignmentOptions.Center, true, font);
        }

        /// <summary>Give a loose, changing text its own snowy plate that follows the text's size and hides when the text is empty.</summary>
        public static TextBackdrop Backdrop(TextMeshPro label, Color? fill = null, float padding = 0.03f)
        {
            var b = label.gameObject.AddComponent<TextBackdrop>();
            b.fill = fill ?? (WWTheme.I != null ? WWTheme.I.panel : Color.white);
            b.padding = padding;
            return b;
        }

        /// <param name="height">Letter size in metres (roughly the height of a capital letter line).</param>
        public static TextMeshPro Label(Transform parent, string text, float height, Vector2 box, Color color,
            TextAlignmentOptions align = TextAlignmentOptions.Center, bool autoSize = true, WWFont font = WWFont.Body)
        {
            height *= font == WWFont.Title ? 1.22f : font == WWFont.Body ? 1.08f : 1f;   // these faces are small for their size
            var go = new GameObject("Label");
            go.layer = UILayer;
            go.transform.SetParent(parent, false);
            go.transform.localPosition = new Vector3(0, 0, -0.004f);
            var t = go.AddComponent<TextMeshPro>();
            var theme = WWTheme.I;
            if (theme != null && theme.Font(font) != null) t.font = theme.Font(font);
            t.rectTransform.sizeDelta = box;
            t.text = text;
            t.color = color;
            t.alignment = align;
            t.textWrappingMode = TextWrappingModes.Normal;
            t.overflowMode = TextOverflowModes.Truncate;
            t.fontSize = height * 10f;
            if (autoSize)
            {
                t.enableAutoSizing = true;
                t.fontSizeMax = height * 10f;
                t.fontSizeMin = height * 5f;
            }
            t.raycastTarget = false;
            return t;
        }

        public static WWButton Button(Transform parent, string text, Vector2 size, Action onClick, float textHeight = 0.045f, Color? fill = null,
            PanelStyle style = PanelStyle.Pill)
        {
            var theme = WWTheme.I;
            var root = new GameObject("Button " + text);
            root.layer = UILayer;
            root.transform.SetParent(parent, false);
            float r = style == PanelStyle.Pill ? Mathf.Min(size.x, size.y) * 0.3f : 0.05f;
            var bg = Panel(root.transform, "bg", size, fill ?? (theme != null ? theme.button : Color.white), r, style == PanelStyle.Pill ? 0.006f : 0.008f, style);
            var glow = Panel(root.transform, "glow", size + new Vector2(0.026f, 0.026f), new Color(1f, 0.93f, 0.70f), r + 0.013f, 0f, PanelStyle.Plain);
            glow.transform.localPosition = new Vector3(0, -0.003f, 0.004f);
            glow.SetActive(false);
            var col = root.AddComponent<BoxCollider>();
            col.size = new Vector3(size.x, size.y, 0.03f);
            col.isTrigger = true;
            var b = root.AddComponent<WWButton>();
            b.background = bg.GetComponent<Renderer>();
            b.glow = glow;
            b.onClick = onClick;
            b.label = text;
            Label(root.transform, text, textHeight, size - new Vector2(0.04f, 0.02f), theme != null ? theme.slate : Color.black,
                TextAlignmentOptions.Center, true, WWFont.Heading);
            return b;
        }

        /// <summary>Turn a transform to face the player's head, upright, as a panel should.</summary>
        public static void FaceHead(Transform panel, Vector3 headPosition)
        {
            var dir = panel.position - headPosition;
            dir.y = 0;
            if (dir.sqrMagnitude < 1e-6f) return;
            panel.rotation = Quaternion.LookRotation(dir.normalized, Vector3.up);
        }

        /// <summary>Rounded rectangle with a darker outline baked into vertex colours.</summary>
        public static Mesh RoundedRect(float w, float h, float r, float border, Color fill, Color outline)
        {
            string key = $"{w:F3}|{h:F3}|{r:F3}|{border:F3}|{ColorUtility.ToHtmlStringRGB(fill)}|{ColorUtility.ToHtmlStringRGB(outline)}";
            if (meshCache.TryGetValue(key, out var cached) && cached != null) return cached;

            var verts = new List<Vector3>();
            var cols = new List<Color>();
            var tris = new List<int>();
            AddFan(verts, cols, tris, w, h, Mathf.Min(r, Mathf.Min(w, h) * 0.5f), 0f, outline);
            if (border > 0 && w > border * 2 && h > border * 2)
                AddFan(verts, cols, tris, w - border * 2, h - border * 2, Mathf.Max(0.001f, Mathf.Min(r - border, Mathf.Min(w, h) * 0.5f - border)), -0.0015f, fill);

            var m = new Mesh { name = "RoundedRect" };
            m.SetVertices(verts);
            m.SetColors(cols);
            m.SetTriangles(tris, 0);
            m.RecalculateBounds();
            m.hideFlags = HideFlags.DontSave;
            meshCache[key] = m;
            return m;
        }

        static void AddFan(List<Vector3> verts, List<Color> cols, List<int> tris, float w, float h, float r, float z, Color c)
        {
            const int seg = 6;
            int start = verts.Count;
            c = c.linear;   // vertex colours are raw; convert so panels match the theme colours
            verts.Add(new Vector3(0, 0, z)); cols.Add(c);
            float hx = w * 0.5f - r, hy = h * 0.5f - r;
            Vector2[] centers = { new Vector2(hx, hy), new Vector2(-hx, hy), new Vector2(-hx, -hy), new Vector2(hx, -hy) };
            for (int corner = 0; corner < 4; corner++)
            {
                for (int i = 0; i <= seg; i++)
                {
                    float a = (corner * 90f + i * 90f / seg) * Mathf.Deg2Rad;
                    verts.Add(new Vector3(centers[corner].x + Mathf.Cos(a) * r, centers[corner].y + Mathf.Sin(a) * r, z));
                    cols.Add(c);
                }
            }
            int n = verts.Count - start - 1;
            for (int i = 0; i < n; i++)
            {
                tris.Add(start);
                tris.Add(start + 1 + (i + 1) % n);
                tris.Add(start + 1 + i);
            }
        }
    }
}
