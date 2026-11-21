using TMPro;
using UnityEngine;

namespace WishWorld
{
    /// <summary>The fact card: creature name and one fact, shown between the player and the creature.</summary>
    public class FactCardPanel : MonoBehaviour
    {
        static FactCardPanel inst;
        GameObject panel;
        TextMeshPro title, body, badge;
        TypeOn typer;
        float hideAt;

        public static CreatureDefinition Current { get; private set; }
        public static bool Visible => inst != null && inst.panel.activeSelf;

        public static void Show(CreatureDefinition def, Creature source, bool isNew)
        {
            if (inst == null)
            {
                var go = new GameObject("FactCardPanel");
                inst = go.AddComponent<FactCardPanel>();
            }
            inst.Display(def, source, isNew);
        }

        public static void Hide() { if (inst != null) PopIn.Close(inst.panel); }

        void Awake()
        {
            var theme = WWTheme.I;
            panel = WWUI.Panel(transform, "Card", new Vector2(0.74f, 0.36f), theme.panel, 0.045f, 0.008f);
            // The name sits on a ribbon across the top edge of the card, like a storybook page heading.
            title = WWUI.Ribbon(panel.transform, "", 0.052f, new Vector2(0.46f, 0.09f), new Vector3(0, 0.175f, -0.008f), theme.peach, theme.slate);
            body = WWUI.Label(panel.transform, "", 0.036f, new Vector2(0.64f, 0.2f), theme.slate);
            body.transform.localPosition = new Vector3(0, -0.012f, -0.005f);
            badge = WWUI.Label(panel.transform, "", 0.024f, new Vector2(0.3f, 0.04f), theme.slate, TextAlignmentOptions.Right);
            badge.transform.localPosition = new Vector3(0.17f, -0.155f, -0.005f);
            typer = body.gameObject.AddComponent<TypeOn>();
            var pop = panel.AddComponent<PopIn>();
            pop.bob = 0.008f;
            panel.SetActive(false);
        }

        void Display(CreatureDefinition def, Creature source, bool isNew)
        {
            Current = def;
            var rig = XRRig.I;
            Vector3 head = rig != null ? rig.HeadPosition : new Vector3(0, 1.6f, 0);
            Vector3 to = (source != null ? source.transform.position : head + Vector3.forward) - head;
            to.y = 0;
            if (to.sqrMagnitude < 0.01f) to = rig != null ? rig.HeadForwardFlat : Vector3.forward;
            to.Normalize();
            // Slightly to the side of the line of sight so it does not cover the creature.
            var side = Vector3.Cross(Vector3.up, to);
            var pos = head + to * 1.15f + side * 0.22f;
            pos.y = head.y - 0.18f;
            transform.position = pos;
            transform.rotation = Quaternion.LookRotation((pos - head).normalized, Vector3.up);
            title.text = def.displayName;
            body.text = def.fact;
            badge.text = isNew ? "New!" : "";
            if (panel.activeSelf) panel.GetComponent<PopIn>().Replay(); else panel.SetActive(true);
            typer.Play(Mathf.Clamp(def.fact.Length * 0.045f, 1.2f, 5f));     // the words appear at about the pace they are read
            hideAt = Time.time + Mathf.Clamp(3.5f + def.fact.Length * 0.05f, 5f, 10f);
            GuideVoice.ReadNow(def.fact);
        }

        void Update()
        {
            if (!panel.activeSelf) return;
            if (Time.time >= hideAt) { PopIn.Close(panel); return; }
            // the "New!" badge beats like a little heart
            if (badge.text.Length > 0) badge.transform.localScale = Vector3.one * (1f + 0.1f * Mathf.Abs(Mathf.Sin(Time.time * 4f)));
        }
    }
}
