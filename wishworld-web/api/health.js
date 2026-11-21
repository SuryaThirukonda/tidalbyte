// Liveness check. Reports which services are configured, as booleans only (never values).
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  let db = false;
  if (process.env.DATABASE_URL) {
    try {
      const { neon } = await import('@neondatabase/serverless');
      const sql = neon(process.env.DATABASE_URL);
      const rows = await sql`select count(*)::int as n from rooms`;
      db = rows.length === 1;
    } catch {
      db = false;
    }
  }
  res.status(200).json({
    ok: true,
    db,
    has: {
      anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
      elevenlabs: Boolean(process.env.ELEVENLABS_API_KEY),
      fal: Boolean(process.env.FAL_KEY),
      blob: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    },
  });
}
