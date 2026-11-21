// One shader for every placeholder mesh: colour comes from vertex colours, so all
// creatures and props share a single material. Vertex alpha marks "body" (1) vs detail (0);
// _Tint recolours only the body. _Glow is the fact-card highlight.
Shader "WishWorld/VertexColorLit"
{
    Properties
    {
        _BaseColor ("Base Color", Color) = (1,1,1,1)
        _Tint ("Tint", Color) = (1,1,1,1)
        _TintAmount ("Tint Amount", Range(0,1)) = 0
        _Glow ("Glow", Range(0,2)) = 0
        _GlowColor ("Glow Color", Color) = (1,0.85,0.6,1)
        _Ambient ("Ambient Boost", Range(0,1)) = 0.35
        [Toggle] _Flat ("Faceted shading", Float) = 1
    }
    SubShader
    {
        Tags { "RenderType"="Opaque" "RenderPipeline"="UniversalPipeline" "Queue"="Geometry" }
        Pass
        {
            Name "ForwardLit"
            Tags { "LightMode"="UniversalForward" }
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_instancing
            #pragma multi_compile_fog
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"

            CBUFFER_START(UnityPerMaterial)
                half4 _BaseColor;
                half4 _Tint;
                half _TintAmount;
                half _Glow;
                half4 _GlowColor;
                half _Ambient;
                half _Flat;
            CBUFFER_END

            struct Attributes
            {
                float4 positionOS : POSITION;
                float3 normalOS : NORMAL;
                half4 color : COLOR;
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };
            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                half4 color : COLOR;
                half3 normalWS : TEXCOORD0;
                half fogFactor : TEXCOORD1;
                float3 positionWS : TEXCOORD2;   // float, not half: the facet normal is built from its derivatives
                UNITY_VERTEX_INPUT_INSTANCE_ID
                UNITY_VERTEX_OUTPUT_STEREO
            };

            Varyings vert(Attributes i)
            {
                Varyings o = (Varyings)0;
                UNITY_SETUP_INSTANCE_ID(i);
                UNITY_TRANSFER_INSTANCE_ID(i, o);
                UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(o);
                VertexPositionInputs p = GetVertexPositionInputs(i.positionOS.xyz);
                o.positionCS = p.positionCS;
                o.positionWS = p.positionWS;
                o.normalWS = TransformObjectToWorldNormal(i.normalOS);
                o.color = i.color;
                o.fogFactor = ComputeFogFactor(p.positionCS.z);
                return o;
            }

            half4 frag(Varyings i) : SV_Target
            {
                UNITY_SETUP_INSTANCE_ID(i);
                UNITY_SETUP_STEREO_EYE_INDEX_POST_VERTEX(i);
                half3 albedo = i.color.rgb * _BaseColor.rgb;
                half luma = dot(albedo, half3(0.299, 0.587, 0.114));
                albedo = lerp(albedo, _Tint.rgb * saturate(luma * 1.2 + 0.3), _TintAmount * i.color.a);
                Light l = GetMainLight();
                half3 n = normalize(i.normalWS);
                if (_Flat > 0.5)
                {
                    // One normal per triangle, from how world position changes across the screen: the retro faceted look.
                    // Pointed toward the eye so it is right whichever way the render target is flipped.
                    float3 fn = normalize(cross(ddx(i.positionWS), ddy(i.positionWS)));
                    fn *= sign(dot(fn, GetWorldSpaceNormalizeViewDir(i.positionWS)));
                    n = fn;
                }
                half ndl = saturate(dot(n, l.direction)) * 0.5 + 0.5;
                half3 lit = albedo * (l.color * ndl * ndl * 0.62 + SampleSH(n) * (0.4 + _Ambient * 0.6));
                lit += _GlowColor.rgb * _Glow * (0.3 + 0.7 * albedo);
                lit = MixFog(lit, i.fogFactor);
                return half4(lit, 1);
            }
            ENDHLSL
        }
    }
    FallBack Off
}
