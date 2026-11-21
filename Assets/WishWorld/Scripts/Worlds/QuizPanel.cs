using System.Collections.Generic;
using TMPro;
using UnityEngine;

namespace WishWorld
{
    /// <summary>End of a world: the collection count, then up to three questions from that world's facts.</summary>
    public class QuizPanel : MonoBehaviour
    {
        public const int Questions = 3;

        GameObject panel;
        TextMeshPro header, question;
        readonly List<WWButton> options = new List<WWButton>();
        readonly List<TextMeshPro> optionLabels = new List<TextMeshPro>();
        List<CreatureDefinition> pool, asked;
        int index, score;
        float nextAt = -1;
        bool finished;
        TypeOn questionType;
        PopIn headerPop;

        public bool Open => panel != null && panel.activeSelf;
        static QuizPanel active;
        /// <summary>True while a quiz is on screen. Looking at a creature does not open its card then, so the quiz is not talked over.</summary>
        public static bool Blocking => active != null && active.Open;
        public int Score => score;
        public string QuestionText => question != null ? question.text : "";

        void Awake()
        {
            active = this;
            var theme = WWTheme.I;
            panel = WWUI.Panel(transform, "Quiz", new Vector2(1.0f, 0.62f), theme.panel, 0.05f, 0.008f);
            header = WWUI.Label(panel.transform, "", 0.044f, new Vector2(0.78f, 0.065f), theme.slate, TextAlignmentOptions.Center, true, WWFont.Heading);
            header.transform.localPosition = new Vector3(0, 0.255f, -0.004f);
            question = WWUI.Label(panel.transform, "", 0.046f, new Vector2(0.9f, 0.17f), theme.slate);
            question.transform.localPosition = new Vector3(0, 0.125f, -0.004f);
            for (int i = 0; i < 3; i++)
            {
                int k = i;
                var b = WWUI.Button(panel.transform, "", new Vector2(0.29f, 0.13f), () => Answer(k), 0.04f);
                b.transform.localPosition = new Vector3((i - 1) * 0.31f, -0.06f, -0.006f);
                options.Add(b);
                optionLabels.Add(b.GetComponentInChildren<TextMeshPro>());
            }
            questionType = question.gameObject.AddComponent<TypeOn>();
            headerPop = header.gameObject.AddComponent<PopIn>();
            panel.AddComponent<PopIn>();
            var close = WWUI.Button(panel.transform, "Close", new Vector2(0.24f, 0.09f), () => { GuideVoice.Hush(); PopIn.Close(panel); }, 0.036f);
            close.transform.localPosition = new Vector3(-0.14f, -0.225f, -0.006f);
            var home = WWUI.Button(panel.transform, "Home", new Vector2(0.24f, 0.09f), () => SceneLoader.GoHub(), 0.036f, theme.peach);
            home.transform.localPosition = new Vector3(0.14f, -0.225f, -0.006f);
        }

        public void Begin(List<CreatureDefinition> creatures, int found, int total)
        {
            pool = creatures;
            asked = new List<CreatureDefinition>(creatures);
            // Shuffle, then keep up to three.
            for (int i = asked.Count - 1; i > 0; i--)
            {
                int j = Random.Range(0, i + 1);
                (asked[i], asked[j]) = (asked[j], asked[i]);
            }
            if (asked.Count > Questions) asked.RemoveRange(Questions, asked.Count - Questions);
            index = 0; score = 0; finished = false; nextAt = -1;
            panel.SetActive(true);
            header.text = "You found " + found + " of " + total + "!";
            if (asked.Count == 0) { ShowResult(); return; }
            ShowQuestion();
        }

        void ShowQuestion()
        {
            var q = asked[index];
            header.text = "Question " + (index + 1) + " of " + asked.Count;
            question.text = q.quizQuestion;
            questionType.Play(Mathf.Clamp(q.quizQuestion.Length * 0.04f, 0.8f, 3f));
            headerPop.Kick(0.18f);
            GuideVoice.ReadNow(q.quizQuestion);
            // Right answer plus two other creatures from this world.
            var names = new List<string> { q.displayName };
            var others = new List<CreatureDefinition>(pool);
            others.Remove(q);
            while (names.Count < 3 && others.Count > 0)
            {
                int j = Random.Range(0, others.Count);
                names.Add(others[j].displayName);
                others.RemoveAt(j);
            }
            for (int i = names.Count - 1; i > 0; i--)
            {
                int j = Random.Range(0, i + 1);
                (names[i], names[j]) = (names[j], names[i]);
            }
            for (int i = 0; i < options.Count; i++)
            {
                bool used = i < names.Count;
                options[i].gameObject.SetActive(used);
                options[i].interactable = true;
                options[i].SetSelected(false);
                if (used) { options[i].label = names[i]; optionLabels[i].text = names[i]; }
            }
        }

        /// <summary>Pick option 0-2. Public so the debug keys can answer.</summary>
        public void Answer(int option)
        {
            if (finished || nextAt > 0 || option >= options.Count || !options[option].gameObject.activeSelf) return;
            var q = asked[index];
            bool right = options[option].label == q.displayName;
            if (right) { score++; Sfx.Play(Sfx.Success, transform.position, 0.6f); options[option].Bounce(); }
            else
            {
                Sfx.Play(Sfx.Buzz, transform.position, 0.4f);
                options[option].Shake();
                int correct = CorrectOption();
                if (correct >= 0) options[correct].Bounce();        // the right one hops, so the answer is shown as well as said
            }
            options[option].SetSelected(true);
            foreach (var o in options) o.interactable = false;
            header.text = right ? VoiceLines.QuizRight(q.displayName) : VoiceLines.QuizWrong(q.displayName);
            headerPop.Kick(0.3f);
            GuideVoice.ReadNow(header.text);
            nextAt = Time.time + 2.2f;
        }

        /// <summary>Index of the correct option for the current question, for automated checks.</summary>
        public int CorrectOption()
        {
            if (finished || asked == null || index >= asked.Count) return -1;
            for (int i = 0; i < options.Count; i++) if (options[i].label == asked[index].displayName) return i;
            return -1;
        }

        void Update()
        {
            if (nextAt > 0 && Time.time >= nextAt)
            {
                nextAt = -1;
                index++;
                if (index >= asked.Count) ShowResult(); else ShowQuestion();
            }
        }

        void ShowResult()
        {
            finished = true;
            foreach (var o in options) o.gameObject.SetActive(false);
            if (asked.Count == 0)
            {
                question.text = VoiceLines.QuizEmpty;
                GuideVoice.ReadNow(question.text);
                return;
            }
            header.text = "Quiz finished";
            question.text = VoiceLines.QuizScore(score, asked.Count);
            questionType.Play(0.6f);
            headerPop.Kick(0.3f);
            GuideVoice.ReadNow(question.text);
            GuideVoice.Say(score == asked.Count ? "Perfect score! You are a real explorer." : "Nice exploring! Want to look around some more?");
        }
    }
}
