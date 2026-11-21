// Child profiles: a room can hold several children, each with their own buddies, mailbox and settings.
// Table `profiles` (id, room_code, name, icon, settings jsonb, created_at); gifts, events and companions carry a
// nullable profile_id. Rows from before profiles existed (profile_id null) belong to the room's default profile,
// which is its oldest one. A room with no profile gets one the first time anyone asks.
import { sql, ensureRoom } from './db.js';
import { UserError, text } from './http.js';

export const MAX_PROFILES = 8;
export const MAX_FOLLOWING = 3;

/** Icons are a colour ("color:#ffb88c") or an animal ("animal:fox"). */
export const ANIMALS = ['fox', 'owl', 'bear', 'cat', 'whale', 'turtle', 'penguin', 'rabbit', 'dog', 'unicorn'];
const COLOUR = /^color:#[0-9a-f]{6}$/i;

export function cleanIcon(value, fallback = 'color:#ffb88c') {
  const v = String(value || '').trim();
  if (COLOUR.test(v)) return v.toLowerCase();
  if (v.startsWith('animal:') && ANIMALS.includes(v.slice(7))) return v;
  return fallback;
}

/** Only known settings, each in range. Unknown keys are dropped, so a client cannot store anything else. */
export function cleanSettings(raw) {
  const s = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const out = {};
  if (s.volume !== undefined) out.volume = Math.min(1, Math.max(0, Number(s.volume) || 0));
  if (s.guideVoice !== undefined) out.guideVoice = Boolean(s.guideVoice);
  if (s.micSensitivity !== undefined) out.micSensitivity = Math.min(1, Math.max(0, Number(s.micSensitivity) || 0));
  if (s.following !== undefined) {
    const list = Array.isArray(s.following) ? s.following : [];
    out.following = [...new Set(list.map(Number).filter((n) => Number.isSafeInteger(n) && n > 0))].slice(0, MAX_FOLLOWING);
  }
  // Scans by key ("bubby", or "g<gift id>"): hidden from the games and followers, or thrown as Frost Slice fruit.
  const keys = (v) => [...new Set((Array.isArray(v) ? v : []).map(String).filter((k) => /^(bubby|g\d{1,15})$/.test(k)))].slice(0, 40);
  if (s.hiddenScans !== undefined) out.hiddenScans = keys(s.hiddenScans);
  if (s.sliceToys !== undefined) out.sliceToys = keys(s.sliceToys);
  return out;
}

export const DEFAULT_SETTINGS = { volume: 0.8, guideVoice: true, micSensitivity: 0.5, following: null, hiddenScans: [], sliceToys: [] };

export function profileJson(row, defaultId) {
  return {
    id: Number(row.id),
    room_code: row.room_code,
    name: row.name,
    icon: row.icon,
    settings: { ...DEFAULT_SETTINGS, ...(row.settings || {}) },
    created_at: row.created_at,
    is_default: Number(row.id) === Number(defaultId),
  };
}

/** The room's profiles, oldest first; makes the default one if there are none. */
export async function listProfiles(room) {
  let rows = await sql`select * from profiles where room_code = ${room} order by id asc`;
  if (!rows.length) {
    const r = await ensureRoom(room);
    const name = text(r && r.child_name ? r.child_name : '', 24) || 'Explorer';
    await sql`insert into profiles (room_code, name, icon) values (${room}, ${name}, 'animal:fox')`;
    rows = await sql`select * from profiles where room_code = ${room} order by id asc`;
  }
  return rows;
}

/**
 * The profile a request is about: the one given (it must be in the room), else the room's default.
 * -> { id, isDefault }
 */
export async function resolveProfile(room, raw) {
  const rows = await listProfiles(room);
  const defaultId = Number(rows[0].id);
  if (raw === undefined || raw === null || raw === '') return { id: defaultId, isDefault: true, defaultId };
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id <= 0) throw new UserError('That profile id does not look right.');
  if (!rows.some((r) => Number(r.id) === id)) throw new UserError('That profile is not in this room.', 404);
  return { id, isDefault: id === defaultId, defaultId };
}
