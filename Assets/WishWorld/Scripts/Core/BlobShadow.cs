using UnityEngine;

namespace WishWorld
{
    /// <summary>
    /// A soft dark disc on the floor under an object: a cheap stand-in for a real shadow (shadow maps cost
    /// too much on a Quest 2). It shrinks and disappears as its owner rises. All discs share one material.
    /// </summary>
    public class BlobShadow : MonoBehaviour
    {
        public Transform owner;
        public float radius = 0.3f;
        public float groundY;
        public float maxHeight = 4f;

        static Mesh quad;
        Renderer rend;

        /// <param name="radius">Disc radius in metres when the owner is on the ground. 0 = work it out from the owner's size.</param>
        public static BlobShadow Attach(Transform owner, float groundY, float radius = 0f, float maxHeight = 4f, Transform parent = null)
        {
            var theme = WWTheme.I;
            if (owner == null || theme == null || theme.shadow == null) return null;
            if (radius <= 0f)
            {
                var r = owner.GetComponentInChildren<Renderer>();
                radius = r != null ? Mathf.Max(r.bounds.extents.x, r.bounds.extents.z) * 0.85f : 0.3f;
            }
            if (quad == null) quad = Resources.GetBuiltinResource<Mesh>("Quad.fbx");
            var go = new GameObject("BlobShadow");
            go.layer = 2;   // Ignore Raycast
            go.transform.SetParent(parent != null ? parent : owner.parent, false);
            go.transform.rotation = Quaternion.Euler(90f, 0, 0);
            go.AddComponent<MeshFilter>().sharedMesh = quad;
            var mr = go.AddComponent<MeshRenderer>();
            mr.sharedMaterial = theme.shadow;
            mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            mr.receiveShadows = false;
            var s = go.AddComponent<BlobShadow>();
            s.owner = owner; s.radius = radius; s.groundY = groundY; s.maxHeight = maxHeight; s.rend = mr;
            s.LateUpdate();
            return s;
        }

        void LateUpdate()
        {
            if (owner == null) { Destroy(gameObject); return; }
            if (!owner.gameObject.activeInHierarchy) { rend.enabled = false; return; }
            var p = owner.position;
            float k = Mathf.Clamp01(1f - Mathf.Max(0f, p.y - groundY - radius) / maxHeight);
            rend.enabled = k > 0.06f;
            if (!rend.enabled) return;
            transform.position = new Vector3(p.x, groundY + 0.012f, p.z);
            float d = radius * 2f * (0.45f + 0.55f * k);
            transform.localScale = new Vector3(d, d, 1f);
        }
    }
}
