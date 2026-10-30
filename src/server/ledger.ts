import { AppError } from './core';
import type { Queryable } from './db';

export type Account = 'charge' | 'sales';
export type LedgerKind = 'charge' | 'purchase' | 'refund' | 'sale' | 'payout' | 'adjust';

/** Atomically change a balance and record it. A DB CHECK constraint prevents negative balances. */
export async function moveBalance(q: Queryable, userId: string, account: Account, delta: number, kind: LedgerKind, ref: string, note = '') {
  const col = account === 'charge' ? 'charge_balance' : 'sales_balance';
  let bal: number;
  try {
    const { rows } = await q.query<{ bal: number }>(`UPDATE users SET ${col} = ${col} + $2 WHERE id = $1 RETURNING ${col} AS bal`, [userId, delta]);
    if (!rows[0]) throw new AppError('会員が見つかりません');
    bal = rows[0].bal;
  } catch (e) {
    if ((e as { code?: string }).code === '23514') throw new AppError(account === 'charge' ? 'チャージ残高が不足しています' : '売上残高が不足しています');
    throw e;
  }
  await q.query('INSERT INTO ledger (user_id, account, delta, balance_after, kind, ref, note) VALUES ($1,$2,$3,$4,$5,$6,$7)', [userId, account, delta, bal, kind, ref, note]);
  return bal;
}
