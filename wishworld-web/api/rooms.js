// POST /api/rooms { childName? } -> { code, child_name }
// Makes a new room with a short, friendly join code.
import { randomInt } from 'node:crypto';
import { route, send, body, text, UserError } from './_lib/http.js';
import { sql } from './_lib/db.js';
import { looksUnsafe } from './_lib/safety.js';

// Easy to say, easy to type, nothing a child should not read.
const WORDS = [
  'FISH', 'REEF', 'STAR', 'MOON', 'WAVE', 'KELP', 'CRAB', 'SEAL', 'DUCK', 'FROG', 'BEAR', 'LION', 'DEER', 'OTTER', 'WHALE',
  'SHELL', 'CORAL', 'PEARL', 'SUNNY', 'CLOUD', 'SNOW', 'RAIN', 'LEAF', 'TREE', 'NEST', 'BIRD', 'PUFFIN', 'TURTLE', 'PANDA',
  'KOALA', 'TIGER', 'ZEBRA', 'BUNNY', 'PONY', 'KITE', 'BOAT', 'SAIL', 'SAND', 'TIDE', 'GLOW', 'HAPPY', 'MAGIC',
  'COMET', 'ROCKET', 'PLANET', 'DINO', 'ROBIN', 'MAPLE', 'DAISY', 'TULIP', 'BERRY', 'PEACH', 'LEMON', 'MANGO', 'HONEY',
];
const LETTERS = 'BCDFGHJKLMNPQRSTVWXZ'; // no vowels: random letters cannot spell a word

function candidate(attempt) {
  const word = WORDS[randomInt(WORDS.length)];
  if (attempt === 0) return word;
  if (attempt < 4) return (word.slice(0, 6) + String(randomInt(10, 100))).slice(0, 8);
  let code = '';
  for (let i = 0; i < 5; i++) code += LETTERS[randomInt(LETTERS.length)];
  return code + String(randomInt(10, 100));
}

export default route('POST', async (req, res) => {
  const b = body(req);
  let childName = text(b.childName, 40) || null;
  if (childName && looksUnsafe(childName)) childName = null;

  for (let attempt = 0; attempt < 8; attempt++) {
    const code = candidate(attempt);
    const rows = await sql`
      insert into rooms (code, child_name) values (${code}, ${childName})
      on conflict (code) do nothing
      returning code, child_name`;
    if (rows.length) return send(res, 200, { code: rows[0].code, child_name: rows[0].child_name });
  }
  throw new UserError('Could not make a room just now. Please try again.', 503);
});
