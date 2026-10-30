import { getDb } from '@/server/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = await getDb();
    await db.query('SELECT 1');
    return Response.json({ ok: true, db: db.kind });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
