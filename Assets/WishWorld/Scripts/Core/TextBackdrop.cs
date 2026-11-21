using TMPro;
using UnityEngine;

namespace WishWorld
{
    /// <summary>
    /// A small snowy plate behind a loose text (countdown, score pop-ups), sized to the text
    /// and hidden while the text is empty. Added with <see cref="WWUI.Backdrop"/>.
    /// </summary>
    public class TextBackdrop : MonoBehaviour
    {
        public Color fill = Color.white;
        public float padding = 0.03f;

        TextMeshPro label;
        GameObject plate;
        MeshFilter filter;
        string shownText;
        float shownSize = -1f;

        void Awake()
        {
            label = GetComponent<TextMeshPro>();
            plate = new GameObject("Backdrop");
            plate.layer = WWUI.UILayer;
            plate.transform.SetParent(transform, false);
            filter = plate.AddComponent<MeshFilter>();
            var mr = plate.AddComponent<MeshRenderer>();
            mr.sharedMaterial = WWTheme.I != null ? WWTheme.I.uiPanel : null;
            mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            mr.receiveShadows = false;
            plate.SetActive(false);
        }

        void LateUpdate()
        {
            if (label == null) return;
            bool visible = label.enabled && !string.IsNullOrEmpty(label.text) && label.color.a > 0.02f;
            if (!visible)
            {
                if (plate.activeSelf) plate.SetActive(false);
                shownText = null;
                return;
            }
            plate.transform.localScale = Vector3.one * Mathf.Lerp(0.5f, 1f, Mathf.Clamp01(label.color.a));   // shrinks away as the text fades
            if (label.text == shownText && Mathf.Approximately(label.fontSize, shownSize)) return;
            shownText = label.text;
            shownSize = label.fontSize;

            label.ForceMeshUpdate();
            var b = label.textBounds;
            if (b.size.x < 0.0001f) { plate.SetActive(false); return; }
            // round up to whole centimetres so only a handful of plate meshes are ever built
            float w = Mathf.Ceil((b.size.x + padding * 2f) * 100f) / 100f;
            float h = Mathf.Ceil((b.size.y + padding * 1.3f) * 100f) / 100f;
            filter.sharedMesh = WWUI.PlateMesh(w, h, fill);
            plate.transform.localPosition = new Vector3(b.center.x, b.center.y, 0.005f);
            plate.SetActive(true);
        }
    }
}
