// Child profile icons, shared by the phone and the headset view. An icon is a colour ("color:#ffb88c") or an
// animal ("animal:fox"); the server accepts the same list (api/_lib/profiles.js).

export const ANIMALS = {
  fox: '\u{1F98A}', owl: '\u{1F989}', bear: '\u{1F43B}', cat: '\u{1F431}', whale: '\u{1F433}',
  turtle: '\u{1F422}', penguin: '\u{1F427}', rabbit: '\u{1F430}', dog: '\u{1F436}', unicorn: '\u{1F984}',
};

export const COLOURS = ['#ffb88c', '#8fb0d4', '#a8d8a0', '#f5d36b', '#d7a6e8', '#f29b9b', '#7fd1c7', '#c9b28f'];

/** { kind: 'animal' | 'color', value, emoji, colour } for an icon string. Unknown icons are peach. */
export function parseIcon(icon) {
  const s = String(icon || '');
  if (s.startsWith('animal:') && ANIMALS[s.slice(7)]) return { kind: 'animal', value: s.slice(7), emoji: ANIMALS[s.slice(7)], colour: '#edf2f7' };
  if (/^color:#[0-9a-f]{6}$/i.test(s)) return { kind: 'color', value: s.slice(6), emoji: '', colour: s.slice(6) };
  return { kind: 'color', value: COLOURS[0], emoji: '', colour: COLOURS[0] };
}

/** Every icon a child can pick: the animals first, then the colours. */
export function allIcons() {
  return [...Object.keys(ANIMALS).map((a) => 'animal:' + a), ...COLOURS.map((c) => 'color:' + c)];
}

/** A round badge element for an icon (size in px). The first letter of the name stands in a colour badge. */
export function iconBadge(icon, name, size = 48) {
  const info = parseIcon(icon);
  const el = document.createElement('span');
  el.className = 'pf-badge';
  el.setAttribute('aria-hidden', 'true');
  Object.assign(el.style, {
    display: 'inline-grid', placeItems: 'center', width: size + 'px', height: size + 'px', borderRadius: '50%',
    background: info.colour, border: '3px solid #334052', fontSize: Math.round(size * 0.55) + 'px', lineHeight: '1',
    color: '#334052', fontWeight: '700', flex: 'none',
  });
  el.textContent = info.emoji || String(name || '?').trim().charAt(0).toUpperCase();
  return el;
}
