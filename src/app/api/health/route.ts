import { configProblems } from '@/server/config';
import { dbMode, getDb } from '@/server/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const problems = configProblems().map(p => p.text);
  try {
    const db = await getDb();
    await db.query('SELECT 1');
    return Response.json({ ok: problems.length === 0, db: dbMode(), problems });
  } catch (e) {
    console.error('[health]', e);
    return Response.json({ ok: false, db: dbMode(), problems, error: String(e).slice(0, 300) }, { status: 503 });
  }
}
