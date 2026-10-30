import { sha256 } from './crypto';
import type { Ctx } from './core';
import type { Queryable } from './db';

type Rec = { at: string; actorId: string; action: string; target: string; detail: string; ip: string; ua: string };
const hashOf = (prev: string, r: Rec) => sha256(prev + JSON.stringify([r.at, r.actorId, r.action, r.target, r.detail, r.ip, r.ua]));

/**
 * Append one record to the hash-chained audit log. Must run inside a transaction:
 * the advisory lock serialises writers so the chain never forks.
 */
export async function audit(q: Queryable, ctx: Ctx, action: string, target = '', detail = '') {
  await q.query('SELECT pg_advisory_xact_lock(7007)');
  const { rows } = await q.query<{ hash: string }>('SELECT hash FROM audit_logs ORDER BY seq DESC LIMIT 1');
  const prev = rows[0]?.hash ?? 'GENESIS';
  const rec: Rec = {
    at: new Date().toISOString(),
    actorId: ctx.actor?.id ?? 'system',
    action, target, detail: detail.slice(0, 1000),
    ip: ctx.ip, ua: ctx.ua.slice(0, 400),
  };
  await q.query(
    `INSERT INTO audit_logs (at, actor_id, actor_name, actor_role, action, target, detail, ip, ua, prev_hash, hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [rec.at, rec.actorId, ctx.actor?.name ?? 'システム', ctx.actor?.role ?? 'system', action, target, rec.detail, rec.ip, rec.ua, prev, hashOf(prev, rec)],
  );
}

export async function verifyAuditChain(q: Queryable): Promise<{ ok: boolean; count: number; brokenAt?: number }> {
  const { rows } = await q.query<{ seq: number; at: Date; actor_id: string; action: string; target: string; detail: string; ip: string; ua: string; prev_hash: string; hash: string }>(
    'SELECT seq, at, actor_id, action, target, detail, ip, ua, prev_hash, hash FROM audit_logs ORDER BY seq',
  );
  let prev = 'GENESIS';
  for (const r of rows) {
    const rec: Rec = { at: new Date(r.at).toISOString(), actorId: r.actor_id, action: r.action, target: r.target, detail: r.detail, ip: r.ip, ua: r.ua };
    if (r.prev_hash !== prev || hashOf(prev, rec) !== r.hash) return { ok: false, count: rows.length, brokenAt: r.seq };
    prev = r.hash;
  }
  return { ok: true, count: rows.length };
}
