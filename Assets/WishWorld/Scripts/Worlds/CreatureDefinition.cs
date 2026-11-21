using UnityEngine;

namespace WishWorld
{
    /// <summary>One kind of creature or object: its model, how it moves, and its fact card.</summary>
    [CreateAssetMenu(menuName = "WishWorld/Creature")]
    public class CreatureDefinition : ScriptableObject
    {
        public string id;
        public string displayName;
        [Tooltip("Words that select this creature in a command. Plurals are matched automatically.")]
        public string[] keywords;
        public GameObject prefab;
        public MoveType moveType;
        [Tooltip("Metres per second along its path.")]
        public float speed = 0.4f;
        [Tooltip("Ring around the player it stays in, in metres. For Orbit, the orbit radius.")]
        public float minDistance = 1.5f, maxDistance = 4f;
        public float minHeight = 0.8f, maxHeight = 2f;
        [Tooltip("Scale applied when shown in the real room (AR).")]
        public float arScale = 1f;
        [Tooltip("How many appear when added by command.")]
        public int addCount = 1;
        public bool schooling;
        public float voicePitch = 1f;
        [TextArea] public string fact;
        [TextArea] public string quizQuestion;
        public bool factChecked;

        [Header("Toys only (see ToyScan)")]
        [Tooltip("A toy the team prepared ahead of time. It joins the world through \"scan a toy\", stays through world changes, " +
                 "keeps its own colours, and stands in front of the player instead of taking a place among the walkers.")]
        public bool toy;
        [Tooltip("What the toy says when it first appears. {child} is replaced with the child's name.")]
        [TextArea] public string greeting;
        [TextArea] public string greeting2;
    }
}
