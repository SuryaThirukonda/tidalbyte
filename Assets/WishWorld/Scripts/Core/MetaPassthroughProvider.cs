// Compiled only when the Meta XR Core SDK is installed and WISHWORLD_META_XR is in
// Player Settings > Scripting Define Symbols. Uses OVRManager and OVRPassthroughLayer (Meta XR Core SDK 209,
// where the passthrough layer is always drawn behind the scene). Compiles; never run on a headset.
#if WISHWORLD_META_XR
using UnityEngine;

namespace WishWorld
{
    public class MetaPassthroughProvider : IPassthroughProvider
    {
        readonly OVRPassthroughLayer layer;

        public bool Available => layer != null;

        public MetaPassthroughProvider(GameObject rig)
        {
            var manager = MetaRuntime.EnsureManager();
            if (manager == null) manager = rig.AddComponent<OVRManager>();
            manager.isInsightPassthroughEnabled = true;
            layer = rig.GetComponent<OVRPassthroughLayer>();
            if (layer == null) layer = rig.AddComponent<OVRPassthroughLayer>();
            layer.hidden = true;
        }

        public void SetEnabled(bool on)
        {
            if (layer != null) layer.hidden = !on;
        }
    }
}
#endif
