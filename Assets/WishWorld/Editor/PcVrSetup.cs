using System.Text;
using UnityEditor;
using UnityEditor.XR.Management;
using UnityEditor.XR.Management.Metadata;
using UnityEngine;
using UnityEngine.XR.Management;
using UnityEngine.XR.OpenXR;
using UnityEngine.XR.OpenXR.Features;
using UnityEngine.XR.OpenXR.Features.Interactions;

namespace WishWorld.EditorTools
{
    /// <summary>
    /// Makes the project playable from a Windows PC through Meta Horizon Link (Play mode in the editor, or a Windows build):
    /// gives the PC platform the OpenXR loader, starts XR with the player, and switches on the Oculus Touch controller
    /// profile so the Quest's controllers are recognised. The Android (headset) settings are not touched.
    /// The result is saved in the project, so this normally never needs running again; the menu item is there to repair it.
    /// </summary>
    public static class PcVrSetup
    {
        const BuildTargetGroup Pc = BuildTargetGroup.Standalone;

        [MenuItem("WishWorld/Set Up PC VR (Link)")]
        public static void Menu() { Debug.Log("[WishWorld] " + Run()); }

        public static string Run()
        {
            var log = new StringBuilder();
            if (!EditorBuildSettings.TryGetConfigObject(XRGeneralSettings.k_SettingsKey, out XRGeneralSettingsPerBuildTarget perTarget) || perTarget == null)
                return "No XR Plug-in Management settings in this project. Open Project Settings > XR Plug-in Management once, then run this again.";

            if (!perTarget.HasSettingsForBuildTarget(Pc)) { perTarget.CreateDefaultSettingsForBuildTarget(Pc); log.Append("created PC XR settings; "); }
            if (!perTarget.HasManagerSettingsForBuildTarget(Pc)) { perTarget.CreateDefaultManagerSettingsForBuildTarget(Pc); log.Append("created PC loader list; "); }
            var general = perTarget.SettingsForBuildTarget(Pc);
            var manager = perTarget.ManagerSettingsForBuildTarget(Pc);
            if (general == null || manager == null) return "Could not create the PC XR settings.";
            if (!general.InitManagerOnStart) { general.InitManagerOnStart = true; log.Append("XR starts with the player; "); }

            bool hasOpenXR = false;
            foreach (var l in manager.activeLoaders) if (l is OpenXRLoader) hasOpenXR = true;
            if (!hasOpenXR)
            {
                bool ok = XRPackageMetadataStore.AssignLoader(manager, typeof(OpenXRLoader).FullName, Pc);
                log.Append(ok ? "OpenXR loader added; " : "COULD NOT add the OpenXR loader; ");
            }

            var openxr = OpenXRSettings.GetSettingsForBuildTargetGroup(Pc);
            if (openxr == null) log.Append("no OpenXR settings for PC; ");
            else
            {
                foreach (var f in openxr.GetFeatures())
                {
                    // The Quest 2's controllers. Without this profile OpenXR reports no trigger, grip, stick or buttons.
                    if (f is OculusTouchControllerProfile && !f.enabled) { f.enabled = true; EditorUtility.SetDirty(f); log.Append("Oculus Touch profile on; "); }
                }
                EditorUtility.SetDirty(openxr);
            }

            UseHeadsetRenderSettingsOnPc(log);

            EditorUtility.SetDirty(general);
            EditorUtility.SetDirty(manager);
            EditorUtility.SetDirty(perTarget);
            AssetDatabase.SaveAssets();
            return log.Length == 0 ? "PC VR was already set up." : "PC VR set up: " + log.ToString().TrimEnd(' ', ';') + ".";
        }

        /// <summary>
        /// The "PC" quality level uses Unity's desktop template pipeline (ambient occlusion, depth and colour copies, HDR).
        /// The game was built and checked on the headset's "Mobile" pipeline, so the PC platform uses that one too.
        /// </summary>
        static void UseHeadsetRenderSettingsOnPc(StringBuilder log)
        {
            int mobile = System.Array.IndexOf(QualitySettings.names, "Mobile");
            if (mobile < 0) { log.Append("no Mobile quality level found; "); return; }
            var assets = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/QualitySettings.asset");
            if (assets == null || assets.Length == 0) { log.Append("could not open the quality settings; "); return; }

            bool changed = false;
            var so = new SerializedObject(assets[0]);
            var map = so.FindProperty("m_PerPlatformDefaultQuality");
            for (int i = 0; map != null && i < map.arraySize; i++)
            {
                var entry = map.GetArrayElementAtIndex(i);
                var level = entry.FindPropertyRelative("second");
                if (entry.FindPropertyRelative("first").stringValue == "Standalone" && level.intValue != mobile)
                {
                    level.intValue = mobile;
                    changed = true;
                }
            }

            // The template bars the Mobile level from the PC platform; while it is barred, Play falls back to "PC".
            var levels = so.FindProperty("m_QualitySettings");
            for (int i = 0; levels != null && i < levels.arraySize; i++)
            {
                var level = levels.GetArrayElementAtIndex(i);
                if (level.FindPropertyRelative("name").stringValue != "Mobile") continue;
                var excluded = level.FindPropertyRelative("excludedTargetPlatforms");
                for (int k = excluded.arraySize - 1; k >= 0; k--)
                {
                    if (excluded.GetArrayElementAtIndex(k).stringValue != "Standalone") continue;
                    excluded.DeleteArrayElementAtIndex(k);
                    changed = true;
                }
            }
            if (changed) so.ApplyModifiedPropertiesWithoutUndo();

            // The editor plays with its current quality level, which only follows the platform default on a platform switch.
            if (EditorUserBuildSettings.selectedBuildTargetGroup == Pc && QualitySettings.GetQualityLevel() != mobile)
            {
                QualitySettings.SetQualityLevel(mobile, true);
                changed = true;
            }
            if (changed) log.Append("PC uses the headset's render settings; ");
        }

        /// <summary>One line on the state of the PC settings, for checks.</summary>
        public static string Describe()
        {
            var general = XRGeneralSettingsPerBuildTarget.XRGeneralSettingsForBuildTarget(Pc);
            if (general == null || general.Manager == null) return "PC: no XR settings";
            var sb = new StringBuilder("PC: startWithPlayer=" + general.InitManagerOnStart + " loaders=[");
            foreach (var l in general.Manager.activeLoaders) sb.Append(l != null ? l.GetType().Name : "null").Append(' ');
            sb.Append("] features on: ");
            var openxr = OpenXRSettings.GetSettingsForBuildTargetGroup(Pc);
            if (openxr != null) foreach (var f in openxr.GetFeatures()) if (f != null && f.enabled) sb.Append(f.GetType().Name).Append(' ');
            return sb.ToString();
        }
    }
}
