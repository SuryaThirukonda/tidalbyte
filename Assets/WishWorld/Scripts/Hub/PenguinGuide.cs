using UnityEngine;

namespace WishWorld
{
    /// <summary>The guide: an original penguin character that turns to the player, bobs, and waves.</summary>
    public class PenguinGuide : MonoBehaviour
    {
        public Transform leftWing, rightWing;
        public float waveSeconds = 3f;
        float waveUntil;
        Vector3 basePos;
        Quaternion leftRest, rightRest;
        string lastLine;

        void Start()
        {
            basePos = transform.localPosition;
            if (leftWing != null) leftRest = leftWing.localRotation;
            if (rightWing != null) rightRest = rightWing.localRotation;
            Wave();
            BlobShadow.Attach(transform, transform.position.y, 0.3f * transform.lossyScale.x, 2f);
        }

        public void Wave() { waveUntil = Time.time + waveSeconds; }

        void Update()
        {
            // Wave again whenever the guide starts a new line.
            if (GuideVoice.LastLine != lastLine) { lastLine = GuideVoice.LastLine; Wave(); }

            var rig = XRRig.I;
            if (rig != null)
            {
                var to = rig.HeadPosition - transform.position; to.y = 0;
                if (to.sqrMagnitude > 0.01f)
                    transform.rotation = Quaternion.Slerp(transform.rotation, Quaternion.LookRotation(to.normalized, Vector3.up), Time.deltaTime * 2f);
            }
            transform.localPosition = basePos + Vector3.up * (Mathf.Abs(Mathf.Sin(Time.time * 2.2f)) * 0.015f * transform.localScale.y);

            bool waving = Time.time < waveUntil;
            if (rightWing != null)
            {
                var target = waving ? rightRest * Quaternion.Euler(0, 0, 105f + Mathf.Sin(Time.time * 9f) * 22f) : rightRest;
                rightWing.localRotation = Quaternion.Slerp(rightWing.localRotation, target, Time.deltaTime * 10f);
            }
            if (leftWing != null)
            {
                var target = leftRest * Quaternion.Euler(0, 0, -Mathf.Sin(Time.time * 2.2f) * 5f);
                leftWing.localRotation = Quaternion.Slerp(leftWing.localRotation, target, Time.deltaTime * 6f);
            }
        }
    }
}
