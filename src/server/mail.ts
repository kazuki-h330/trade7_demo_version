import { newId } from './core';
import type { Queryable } from './db';

/**
 * In-app notifications (お知らせ). Nothing is emailed: members sign in with a login ID and no email
 * address is collected. Rows are written in the same transaction as the business change, so a
 * rolled-back action never leaves a notification behind. `'ops'` notifications go to the admin log.
 * (The table is still named `emails` for migration compatibility.)
 */
export async function notify(q: Queryable, to: { userId: string } | 'ops', event: string, subject: string, body: string) {
  let addr = '運営';
  let userId: string | null = null;
  if (to !== 'ops') {
    const { rows } = await q.query<{ login_id: string }>('SELECT login_id FROM users WHERE id = $1', [to.userId]);
    addr = rows[0]?.login_id ?? '—';
    userId = to.userId;
  }
  await q.query("INSERT INTO emails (id, user_id, to_addr, event, subject, body, status, sent_at) VALUES ($1,$2,$3,$4,$5,$6,'sent',now())",
    [newId('NTF'), userId, addr, event, subject, body]);
}
