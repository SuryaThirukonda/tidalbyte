// The safety net under the safety net. Every piece of text bound for a child is checked by Claude Haiku
// (see haiku.js). This word list is only used when Claude cannot be reached or declines to answer, so a
// route still answers and still never passes on something plainly unsuitable.
// It is deliberately blunt: a false alarm costs a friendly default line, nothing more.

// Matched anywhere, even inside a longer word ("shithead").
const ANYWHERE = ['fuck', 'shit', 'bitch', 'cunt', 'asshole', 'arsehole', 'bastard', 'whore', 'slut', 'porn', 'wank', 'nigg', 'faggot', 'retard', 'dickhead', 'jackass', 'dumbass'];

// Matched as whole words only.
const WORDS = [
  // rude
  'arse', 'ass', 'dick', 'cock', 'pussy', 'piss', 'crap', 'damn', 'goddamn', 'wtf', 'stfu', 'douche',
  // unkind
  'stupid', 'idiot', 'dumb', 'ugly', 'loser', 'hate', 'hates', 'moron', 'worthless', 'shut up', 'brat', 'fat',
  // violence and death
  'kill', 'kills', 'killed', 'killing', 'killer', 'murder', 'murdered', 'die', 'dies', 'died', 'dying', 'dead', 'death',
  'blood', 'bloody', 'gore', 'gun', 'guns', 'knife', 'knives', 'stab', 'stabbed', 'shoot', 'shooting', 'shot', 'bomb',
  'explode', 'explosion', 'weapon', 'weapons', 'corpse', 'suicide', 'strangle', 'choke', 'torture', 'war', 'attack',
  'hurt', 'hurts', 'pain', 'painful', 'poison', 'drown', 'drowned', 'burn', 'burned', 'crash', 'crashed', 'bite', 'bites',
  // frightening
  'demon', 'demons', 'devil', 'satan', 'hell', 'zombie', 'zombies', 'nightmare', 'nightmares', 'haunted', 'evil',
  'scary', 'terrifying', 'horror', 'creepy', 'monster', 'monsters', 'ghost', 'ghosts', 'vampire', 'kidnap', 'kidnapped',
  // illness and procedures (the game never talks about these to the child)
  'cancer', 'tumor', 'tumour', 'chemo', 'chemotherapy', 'surgery', 'operation', 'needle', 'needles', 'injection',
  'disease', 'terminal', 'leukemia', 'leukaemia', 'infection', 'sick', 'sicker', 'vomit', 'funeral', 'coffin', 'grave',
  // adult
  'sex', 'sexy', 'sexual', 'naked', 'nude', 'boobs', 'penis', 'vagina', 'rape',
  // drugs and drink
  'drug', 'drugs', 'cocaine', 'heroin', 'meth', 'weed', 'marijuana', 'drunk', 'beer', 'vodka', 'whiskey', 'wine',
  'cigarette', 'cigarettes', 'vape', 'smoking',
];

const PATTERN = new RegExp(
  '(' + ANYWHERE.join('|') + ')|(^|[^a-z])(' + WORDS.map((w) => w.replace(/ /g, '\\s+')).join('|') + ')(?![a-z])',
  'i',
);
const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|ru|xyz|app|gg|ly)\b|@[a-z0-9_]{2,}|\b\d[\d\s().-]{7,}\d\b)/i;

/** True when the text contains a word from the list, a link, a handle or a phone number. */
export function looksUnsafe(value) {
  if (typeof value !== 'string' || !value) return false;
  const s = value.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  return PATTERN.test(s) || LINK.test(s);
}

export const DEFAULT_SENDER = 'Someone who loves you';

/** A name to put on a gift card: the sender's own if it is fine, otherwise a kind stand-in. */
export function safeSender(value) {
  const s = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 40) : '';
  if (!s || looksUnsafe(s)) return DEFAULT_SENDER;
  return s;
}
