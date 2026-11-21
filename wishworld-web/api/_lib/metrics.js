// Numbers for the Judge view (/judge/): how fast wishes become models, cache hits, safety results, triangle
// counts and the headset's frame rate. One small table, created on first use; nothing here is shown to a child.
//
//   kind                 value
//   wish_first_ms        { ms }                       wish received -> library creature stored (what the child sees first)
//   wish_model_ms        { ms, route, triangles }     wish received -> generated model stored
//   wish_cache           { hit: true | false }
//   wish_route_failed    { route, why }
//   safety               { by, verdict, what }        what = "wish" | "letter" | "scan"
//   model_triangles      { before, after, bytes, what }
//   headset_fps          { fps, ms, scale, device }   sent by the headset every few seconds
import { sql } from './db.js';

let ready = null;
function ensure() {
  if (!ready) {
    ready = sql`
      create table if not exists metrics (
        id bigserial primary key,
        room_code text not null,
        kind text not null,
        value jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now()
      )`
      .then(() => sql`create index if not exists metrics_room_kind on metrics (room_code, kind, created_at desc)`)
      .catch((err) => { ready = null; throw err; });
  }
  return ready;
}

/** Records one number. Never throws: a metric must never break the thing it measures. */
export async function record(room, kind, value = {}) {
  try {
    await ensure();
    await sql`insert into metrics (room_code, kind, value) values (${room || 'WISH'}, ${kind}, ${JSON.stringify(value)}::jsonb)`;
  } catch (err) {
    console.warn('[metrics] could not record', kind, err && err.message);
  }
}

/** The newest rows of a room, newest first (the Judge view). */
export async function recent(room, { limit = 400 } = {}) {
  await ensure();
  return sql`select kind, value, created_at from metrics where room_code = ${room} order by created_at desc limit ${limit}`;
}
