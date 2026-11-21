// Database access (Neon serverless driver over HTTPS). Only functions talk to the database.
import { neon } from '@neondatabase/serverless';

let client = null;

/** Tagged-template SQL client: await sql`select ... where id = ${id}` */
export function sql(strings, ...values) {
  if (!client) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
    client = neon(process.env.DATABASE_URL);
  }
  return client(strings, ...values);
}

/** Makes sure a room exists (rooms are created on first use). Returns the room row. */
export async function ensureRoom(code, childName = null) {
  const rows = await sql`
    insert into rooms (code, child_name) values (${code}, ${childName})
    on conflict (code) do update set child_name = coalesce(rooms.child_name, excluded.child_name)
    returning code, child_name, created_at`;
  return rows[0];
}

/** The JSON shape every route returns for a gift (ids as numbers). */
export function giftJson(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    room_code: row.room_code,
    created_at: row.created_at,
    sender: row.sender,
    kind: row.kind,
    wish: row.wish,
    option_id: row.option_id,
    message: row.message,
    image_url: row.image_url,
    audio_url: row.audio_url,
    model_url: row.model_url,
    job_id: row.job_id,
    status: row.status,
    plan: row.plan || null,
    opened_at: row.opened_at,
    profile_id: row.profile_id === null || row.profile_id === undefined ? null : Number(row.profile_id),
  };
}

export async function insertGift(g) {
  const rows = await sql`
    insert into gifts (room_code, sender, kind, wish, option_id, message, image_url, audio_url, model_url, job_id, status, profile_id)
    values (${g.room_code}, ${g.sender ?? null}, ${g.kind}, ${g.wish ?? null}, ${g.option_id ?? null}, ${g.message ?? null},
            ${g.image_url ?? null}, ${g.audio_url ?? null}, ${g.model_url ?? null}, ${g.job_id ?? null}, ${g.status ?? 'ready'},
            ${g.profile_id ?? null})
    returning *`;
  return rows[0];
}

export async function getGift(id) {
  const rows = await sql`select * from gifts where id = ${id}`;
  return rows[0] || null;
}

export async function logEvent(roomCode, type, detail = {}, profileId = null) {
  const rows = await sql`
    insert into events (room_code, type, detail, profile_id)
    values (${roomCode}, ${type}, ${JSON.stringify(detail)}::jsonb, ${profileId})
    returning id`;
  return Number(rows[0].id);
}
