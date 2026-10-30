import { newId } from './core';
import { getDb, type Queryable } from './db';

const APP_URL = () => process.env.APP_URL ?? 'http://localhost:3000';

/**
 * Transactional outbox: the email row is written in the same transaction as the business change,
 * and delivered afterwards by flushOutbox(). A rolled-back action never sends mail.
 */
export async function queueMail(q: Queryable, to: { userId: string } | 'ops', event: string, subject: string, body: string) {
  let addr = process.env.OPS_EMAIL ?? 'ops@example.com';
  let userId: string | null = null;
  if (to !== 'ops') {
    const { rows } = await q.query<{ email: string }>('SELECT email FROM users WHERE id = $1', [to.userId]);
    addr = rows[0]?.email ?? addr;
    userId = to.userId;
  }
  const footer = `\n\n──────────\ntrade7 運営事務局\n${APP_URL()}\n※このメールは送信専用です。`;
  await q.query('INSERT INTO emails (id, user_id, to_addr, event, subject, body) VALUES ($1,$2,$3,$4,$5,$6)', [newId('ML'), userId, addr, event, `【trade7】${subject}`, body + footer]);
}

type Transport = { sendMail(o: { from: string; to: string; subject: string; text: string }): Promise<unknown> };
let transport: Transport | null | undefined;
async function getTransport(): Promise<Transport | null> {
  if (transport !== undefined) return transport;
  if (!process.env.SMTP_URL) return (transport = null);
  const nodemailer = await import('nodemailer');
  return (transport = nodemailer.createTransport(process.env.SMTP_URL));
}

let flushing = false;
export async function flushOutbox(limit = 25) {
  if (flushing) return;
  flushing = true;
  try {
    const db = await getDb();
    const t = await getTransport();
    const { rows } = await db.query<{ id: string; to_addr: string; subject: string; body: string; attempts: number }>(
      "SELECT id, to_addr, subject, body, attempts FROM emails WHERE status = 'queued' ORDER BY created_at LIMIT $1", [limit]);
    for (const m of rows) {
      if (!t) {
        await db.query("UPDATE emails SET status = 'logged', sent_at = now() WHERE id = $1", [m.id]);
        continue;
      }
      try {
        await t.sendMail({ from: process.env.MAIL_FROM ?? 'trade7 <no-reply@example.com>', to: m.to_addr, subject: m.subject, text: m.body });
        await db.query("UPDATE emails SET status = 'sent', sent_at = now(), attempts = attempts + 1 WHERE id = $1", [m.id]);
      } catch (e) {
        const failed = m.attempts + 1 >= 5;
        await db.query('UPDATE emails SET status = $2, error = $3, attempts = attempts + 1 WHERE id = $1', [m.id, failed ? 'failed' : 'queued', String(e).slice(0, 500)]);
      }
    }
  } finally {
    flushing = false;
  }
}
