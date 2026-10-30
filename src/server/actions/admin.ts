'use server';

import { action, int, str } from '../action';
import { getCtx } from '../auth';
import { AppError, type UserStatus } from '../core';
import type { Account } from '../ledger';
import { getDb } from '../db';
import { adminResetPassword, reviewKyc, reviewSeller } from '../services/accounts';
import { runAuditVerification, updateSettings } from '../services/admin';
import { adminDecrypt, recordBalanceCheck } from '../services/listings';
import { adjustBalance, createPayoutBatch, markPayoutPaid, reviewCharge, reviewDetection, sanctionUser } from '../services/money';
import { resolveDispute } from '../services/trades';
import { getSettings } from '../settings';

const decision = (fd: FormData) => (str(fd, 'decision') === 'approved' ? 'approved' : 'rejected') as 'approved' | 'rejected';

export const reviewKycAction = action(async (ctx, fd) => {
  await reviewKyc(ctx, str(fd, 'id'), decision(fd), str(fd, 'note'));
  return '審査結果を記録し、会員へ通知しました';
});

export const reviewSellerAction = action(async (ctx, fd) => {
  await reviewSeller(ctx, str(fd, 'id'), decision(fd), str(fd, 'note'));
  return '出品者審査の結果を記録しました';
});

export const balanceCheckAction = action(async (ctx, fd) => {
  const r = await recordBalanceCheck(ctx, str(fd, 'id'), { result: str(fd, 'result') === 'ok' ? 'ok' : 'ng', balance: int(fd, 'balance'), method: str(fd, 'method'), note: str(fd, 'note') });
  return r.forced ? '確認残高が額面に満たないため NG として記録しました' : '残高確認の結果を記録しました';
});

export const reviewChargeAction = action(async (ctx, fd) => {
  const d = decision(fd);
  if (d === 'approved' && fd.get('nameOk') !== 'on') throw new AppError('振込名義が本人名義であることを確認してください');
  await reviewCharge(ctx, str(fd, 'id'), d, { received: int(fd, 'received'), note: str(fd, 'note') });
  return d === 'approved' ? 'チャージを承認し、残高に反映しました' : '入金申請を却下しました';
});

export const resolveDisputeAction = action(async (ctx, fd) => {
  await resolveDispute(ctx, str(fd, 'id'), str(fd, 'decision') === 'complete' ? 'complete' : 'cancel', str(fd, 'note'));
  return '協議の結果を確定し、当事者へ通知しました';
});

export const adjustBalanceAction = action(async (ctx, fd) => {
  await adjustBalance(ctx, str(fd, 'userId'), (str(fd, 'account') === 'sales' ? 'sales' : 'charge') as Account, int(fd, 'delta'), str(fd, 'reason'));
  return '残高を訂正しました';
});

export const createPayoutAction = action(async ctx => {
  const id = await createPayoutBatch(ctx);
  return { message: `支払バッチ ${id} を作成しました。CSV をダウンロードしてください`, data: { id } };
});

export const markPaidAction = action(async (ctx, fd) => {
  await markPayoutPaid(ctx, str(fd, 'id'));
  return '振込完了を記録しました';
});

export const sanctionAction = action(async (ctx, fd) => {
  const level = str(fd, 'level') as UserStatus;
  if (!['active', 'warned', 'restricted', 'frozen', 'expelled'].includes(level)) throw new AppError('措置を選択してください');
  await sanctionUser(ctx, str(fd, 'id'), level, [str(fd, 'preset'), str(fd, 'reason')].filter(Boolean).join(' / '));
  return '措置を実施し、会員へ通知しました';
});

export const reviewDetectionAction = action(async (ctx, fd) => {
  await reviewDetection(ctx, str(fd, 'id'));
});

export const updateSettingsAction = action(async (ctx, fd) => {
  const cur = await getSettings(await getDb());
  const num = (k: string) => Number(fd.get(k));
  await updateSettings(ctx, {
    feeBps: Math.round(num('feePct') * 100),
    confirmMinutes: Math.trunc(num('confirmMinutes')),
    chargeMin: num('chargeMin'), chargeMax: num('chargeMax'),
    faceMin: num('faceMin'), faceMax: num('faceMax'),
    rateMinX10: Math.round(num('rateMin') * 10), rateMaxX10: Math.round(num('rateMax') * 10),
    aiCheck: fd.get('aiCheck') === 'on',
    depositBank: { ...cur.depositBank, name: str(fd, 'bankName'), branch: str(fd, 'bankBranch'), number: str(fd, 'bankNumber'), holder: str(fd, 'bankHolder') },
  });
  return '設定を保存しました';
});

export const verifyAuditAction = action(async ctx => {
  const r = await runAuditVerification(ctx);
  if (!r.ok) throw new AppError(`改ざんを検出しました（seq ${r.brokenAt}）。直ちにバックアップと照合してください`);
  return `監査ログ ${r.count} 件のハッシュチェーンはすべて整合しています`;
});

/** Returns the one-time temporary password so the admin can tell the member (it is never stored in plain text). */
export async function adminResetPasswordAction(userId: string): Promise<{ password?: string; error?: string }> {
  try { return { password: await adminResetPassword(await getCtx(), userId) }; }
  catch (e) { return { error: e instanceof AppError ? e.message : '再発行できませんでした' }; }
}

export async function adminDecryptAction(listingId: string, reason: string): Promise<{ code?: string; error?: string }> {
  try { return { code: await adminDecrypt(await getCtx(), listingId, reason) }; }
  catch (e) { return { error: e instanceof AppError ? e.message : '復号できませんでした' }; }
}
