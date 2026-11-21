using UnityEditor;
using UnityEditor.Build;
using UnityEditor.XR.Management;
using UnityEditor.XR.Management.Metadata;
using UnityEngine;
using UnityEngine.XR.Management;
using UnityEngine.XR.OpenXR;

namespace WishWorld.EditorTools
{
    public static partial class WishWorldBuilder
    {
        public const string ServiceConfigPath = Root + "/Config/Resources/" + WishWorldServiceConfig.ResourceName + ".asset";

        /// <summary>Creates the (git-ignored) asset that holds service keys and the mock/real switches.</summary>
        [MenuItem("WishWorld/Create Service Config")]
        public static void CreateServiceConfig()
        {
            var existing = AssetDatabase.LoadAssetAtPath<WishWorldServiceConfig>(ServiceConfigPath);
            if (existing == null)
            {
                EnsureFolder(Root + "/Config/Resources");
                existing = ScriptableObject.CreateInstance<WishWorldServiceConfig>();
                AssetDatabase.CreateAsset(existing, ServiceConfigPath);
                AssetDatabase.SaveAssets();
                Debug.Log("[WishWorld] Created " + ServiceConfigPath + ". It is excluded from version control; all services start on their mocks.");
            }
            Selection.activeObject = existing;
        }

        const string MetaDefine = "WISHWORLD_META_XR";

        /// <summary>
        /// Turns on the Meta XR code path (real passthrough) once the Meta XR Core SDK package is installed,
        /// by adding the WISHWORLD_META_XR scripting define. Run Apply Quest Project Settings afterwards.
        /// </summary>
        [MenuItem("WishWorld/Enable Meta XR Passthrough")]
        public static string EnableMetaXR()
        {
            if (UnityEditor.PackageManager.PackageInfo.FindForAssetPath("Packages/com.meta.xr.sdk.core") == null)
                return "Meta XR Core SDK is not installed (com.meta.xr.sdk.core). Nothing changed.";
            foreach (var target in new[] { NamedBuildTarget.Android, NamedBuildTarget.Standalone })
            {
                PlayerSettings.GetScriptingDefineSymbols(target, out string[] defines);
                var list = new System.Collections.Generic.List<string>(defines);
                if (!list.Contains(MetaDefine)) { list.Add(MetaDefine); PlayerSettings.SetScriptingDefineSymbols(target, list.ToArray()); }
            }
            AssetDatabase.SaveAssets();
            return MetaDefine + " is defined for Android and Standalone.";
        }

        /// <summary>Player and XR settings for a Quest 2 build. Safe to run again.</summary>
        [MenuItem("WishWorld/Apply Quest Project Settings")]
        public static string ApplyProjectSettings()
        {
            var log = new System.Text.StringBuilder();
            PlayerSettings.companyName = "WishWorld";
            PlayerSettings.productName = "WishWorld";
            PlayerSettings.SetApplicationIdentifier(NamedBuildTarget.Android, "com.wishworld.app");
            PlayerSettings.colorSpace = ColorSpace.Linear;
            // Meta's Project Setup Tool requires API 32 or newer, a single GameActivity entry, and no Unity splash for MR apps.
            PlayerSettings.Android.minSdkVersion = (AndroidSdkVersions)32;
            PlayerSettings.Android.targetSdkVersion = (AndroidSdkVersions)34;
            PlayerSettings.Android.applicationEntry = AndroidApplicationEntry.GameActivity;
            PlayerSettings.SplashScreen.show = false;
            PlayerSettings.Android.targetArchitectures = AndroidArchitecture.ARM64;
            PlayerSettings.SetScriptingBackend(NamedBuildTarget.Android, ScriptingImplementation.IL2CPP);
            // Smaller, faster builds that need far less memory; the first full-speed build ran a 22 GB laptop out of RAM.
            PlayerSettings.SetIl2CppCodeGeneration(NamedBuildTarget.Android, Il2CppCodeGeneration.OptimizeSize);
            PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.Android, false);
            PlayerSettings.SetGraphicsAPIs(BuildTarget.Android, new[] { UnityEngine.Rendering.GraphicsDeviceType.Vulkan });
            log.AppendLine("Player: com.wishworld.app, IL2CPP, ARM64, Vulkan, API 32 to 34, GameActivity, linear colour.");

            // XR Plug-in Management: OpenXR loader for Android only. Standalone stays without XR so the editor uses the desktop fallback.
            XRGeneralSettingsPerBuildTarget perTarget;
            EditorBuildSettings.TryGetConfigObject(XRGeneralSettings.k_SettingsKey, out perTarget);
            if (perTarget == null)
            {
                EnsureFolder("Assets/XR");
                perTarget = ScriptableObject.CreateInstance<XRGeneralSettingsPerBuildTarget>();
                AssetDatabase.CreateAsset(perTarget, "Assets/XR/XRGeneralSettingsPerBuildTarget.asset");
                EditorBuildSettings.AddConfigObject(XRGeneralSettings.k_SettingsKey, perTarget, true);
            }
            if (!perTarget.HasSettingsForBuildTarget(BuildTargetGroup.Android)) perTarget.CreateDefaultSettingsForBuildTarget(BuildTargetGroup.Android);
            if (!perTarget.HasManagerSettingsForBuildTarget(BuildTargetGroup.Android)) perTarget.CreateDefaultManagerSettingsForBuildTarget(BuildTargetGroup.Android);
            var general = perTarget.SettingsForBuildTarget(BuildTargetGroup.Android);
            general.InitManagerOnStart = true;
            bool assigned = XRPackageMetadataStore.AssignLoader(general.Manager, "UnityEngine.XR.OpenXR.OpenXRLoader", BuildTargetGroup.Android);
            EditorUtility.SetDirty(general);
            EditorUtility.SetDirty(perTarget);
            log.AppendLine("XR: OpenXR loader for Android " + (assigned ? "assigned" : "already assigned or not assignable") + ".");

            var oxr = OpenXRSettings.GetSettingsForBuildTargetGroup(BuildTargetGroup.Android);
            if (oxr != null)
            {
                oxr.renderMode = OpenXRSettings.RenderMode.SinglePassInstanced;
                foreach (var f in oxr.GetFeatures())
                {
                    if (f == null) continue;
                    string n = f.GetType().Name;
                    if (n == "MetaQuestFeature" || n == "OculusTouchControllerProfile" || n == "MetaXRFeature")
                    {
                        f.enabled = true;
                        EditorUtility.SetDirty(f);
                        log.AppendLine("OpenXR feature on: " + n);
                    }
                }
                EditorUtility.SetDirty(oxr);
            }
            else log.AppendLine("OpenXR settings for Android not found.");

#if WISHWORLD_META_XR
            // Meta project config: target the Quest 2 and declare passthrough, which adds the manifest entries it needs.
            var meta = OVRProjectConfig.CachedProjectConfig;
            if (meta != null)
            {
                if (!meta.targetDeviceTypes.Contains(OVRProjectConfig.DeviceType.Quest2)) meta.targetDeviceTypes.Add(OVRProjectConfig.DeviceType.Quest2);
                meta.insightPassthroughSupport = OVRProjectConfig.FeatureSupport.Supported;
                meta.systemLoadingScreenBackground = OVRProjectConfig.SystemLoadingScreenBackground.ContextualPassthrough;
                OVRProjectConfig.CommitProjectConfig(meta);
                // Meta's Android manifest (GameActivity entry, passthrough feature) in Assets/Plugins/Android.
                OVRManifestPreprocessor.GenerateOrUpdateAndroidManifest(true);
                log.AppendLine("Meta project config: Quest 2 targeted, passthrough declared as supported, Android manifest generated.");
            }
            else log.AppendLine("Meta project config was not ready; run this again.");
#else
            log.AppendLine("Meta XR code path is off (WISHWORLD_META_XR not defined). Run WishWorld > Enable Meta XR Passthrough.");
#endif

            // Render settings for a Quest 2: no HDR (also needed for passthrough alpha), 4x MSAA, full render
            // scale so text stays sharp, no shadows or extra lights (nothing in the app uses them).
            var urp = AssetDatabase.LoadAssetAtPath<UnityEngine.Rendering.Universal.UniversalRenderPipelineAsset>("Assets/Settings/Mobile_RPAsset.asset");
            if (urp != null)
            {
                urp.supportsHDR = false;
                urp.msaaSampleCount = 4;
                urp.renderScale = 1f;
                var so = new SerializedObject(urp);
                var p1 = so.FindProperty("m_MainLightShadowsSupported"); if (p1 != null) p1.boolValue = false;
                var p2 = so.FindProperty("m_AdditionalLightsRenderingMode"); if (p2 != null) p2.intValue = 0;
                so.ApplyModifiedPropertiesWithoutUndo();
                EditorUtility.SetDirty(urp);
                log.AppendLine("Mobile render asset: HDR off, MSAA 4x, render scale 1, shadows and extra lights off.");
            }

            // Android uses the template's Mobile quality level (Mobile_RPAsset).
            string[] names = QualitySettings.names;
            for (int i = 0; i < names.Length; i++)
                if (names[i] == "Mobile") { log.AppendLine("Quality level 'Mobile' is index " + i + "."); }
            AssetDatabase.SaveAssets();
            Debug.Log("[WishWorld] " + log);
            return log.ToString();
        }
    }
}
