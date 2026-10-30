import { audit } from '../audit';
import { fail, newId, systemCtx, type Ctx, type UserRow, type UserStatus } from '../core';
import type { Queryable } from '../db';
import { notify } from '../mail';

export async function lockUser(q: Queryable, id: string): Promise<UserRow> {
  const { rows } = await q.query<UserRow>('SELECT * FROM users WHERE id = $1 FOR UPDATE', [id]);
  return rows[0] ?? fail('会員が見つかりません');
}

export function requireAdmin(ctx: Ctx) {
  if (ctx.actor?.role !== 'admin') fail('管理者権限が必要です');
  return ctx.actor!;
}
export function requireActor(ctx: Ctx) {
  return ctx.actor ?? fail('ログインが必要です');
}

export const SANCTION_LABEL: Record<UserStatus, string> = { active: '措置解除', warned: '警告', restricted: '利用制限', frozen: 'アカウント凍結', expelled: '強制退会' };
const SANCTION_TEXT: Record<UserStatus, string> = {
  warned: 'ご利用状況について運営より警告を記録しました。利用規約をご確認ください。',
  restricted: '出品・購入・チャージを一時的に制限しました。',
  frozen: 'アカウントを凍結しました。残高および係争中の取引は運営で保全しています。',
  expelled: '利用規約に基づき強制退会としました。取引記録は法令に基づき保存されます。',
  active: 'アカウントの利用制限を解除しました。',
};

/** Staged sanctions: warned → restricted → frozen → expelled (or back to active). */
export async function applySanction(q: Queryable, ctx: Ctx, userId: string, level: UserStatus, reason: string, auto = false) {
  const u = await lockUser(q, userId);
  if (u.role === 'admin') fail('管理者アカウントには措置を適用できません');
  if (u.status === level) fail('既にその状態です');
  await q.query('UPDATE users SET status = $2 WHERE id = $1', [userId, level]);
  await q.query('INSERT INTO sanctions (id, user_id, level, reason, by_id) VALUES ($1,$2,$3,$4,$5)', [newId('SNC'), userId, level, reason, auto ? null : ctx.actor?.id ?? null]);
  if (level === 'frozen' || level === 'expelled') {
    await q.query("UPDATE listings SET status = 'withdrawn', version = version + 1 WHERE seller_id = $1 AND status IN ('checking','active')", [userId]);
  }
  if (level === 'expelled') await q.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
  await notify(q, { userId }, 'sanction', `アカウント状態の変更（${SANCTION_LABEL[level]}）`, `${u.name} 様\n\n${SANCTION_TEXT[level]}\n理由：${reason}`);
  await audit(q, auto ? { ...systemCtx, ip: ctx.ip } : ctx, `user.sanction.${level}`, userId, `${auto ? '[自動] ' : ''}${reason}`);
}

/** Automatic first-step warning for clear-cut signals. Never escalates beyond 'warned'. */
export async function autoWarn(q: Queryable, ctx: Ctx, userId: string, reason: string) {
  const { rows } = await q.query<{ status: string }>('SELECT status FROM users WHERE id = $1', [userId]);
  if (rows[0]?.status === 'active') await applySanction(q, ctx, userId, 'warned', reason, true);
}
