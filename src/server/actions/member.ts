'use server';

import { action, int, str } from '../action';
import { getCtx } from '../auth';
import { AppError } from '../core';
import { applySeller, BankInput, markMailRead, saveBank, submitKyc } from '../services/accounts';
import { changeRate, createListing, parseRate, withdrawListing } from '../services/listings';
import { requestCharge } from '../services/money';
import { confirmTrade, openDispute, postDisputeMessage, purchase, revealCode } from '../services/trades';

export const submitKycAction = action(async (ctx, fd) => {
  await submitKyc(ctx, str(fd, 'docType'), fd.get('file') as File | null);
  return '本人確認書類を提出しました。審査完了までお待ちください';
});

export const saveBankAction = action(async (ctx, fd) => {
  await saveBank(ctx, BankInput.parse({ bankName: str(fd, 'bankName'), branch: str(fd, 'branch'), type: str(fd, 'type'), number: str(fd, 'number'), holder: str(fd, 'holder') }));
  return '振込先口座を保存しました';
});

export const applySellerAction = action(async ctx => {
  await applySeller(ctx);
  return '出品者審査を申請しました';
});

export const requestChargeAction = action(async (ctx, fd) => {
  if (fd.get('agree') !== 'on') throw new AppError('払い戻しができないことへの同意が必要です');
  await requestCharge(ctx, int(fd, 'amount'), str(fd, 'payerName'));
  return '入金申請を受け付けました。表示の口座へお振込みください';
});

export const createListingAction = action(async (ctx, fd) => {
  await createListing(ctx, { face: int(fd, 'face'), rateX10: parseRate(str(fd, 'rate')), code: str(fd, 'code') });
  return '出品しました。運営の残高確認後にマーケットへ掲載されます';
});

export const changeRateAction = action(async (ctx, fd) => {
  await changeRate(ctx, str(fd, 'id'), parseRate(str(fd, 'rate')));
  return '販売利率を変更しました';
});

export const withdrawListingAction = action(async (ctx, fd) => {
  await withdrawListing(ctx, str(fd, 'id'));
  return '出品を取り下げました';
});

export const purchaseAction = action(async (ctx, fd) => {
  const id = await purchase(ctx, str(fd, 'id'), int(fd, 'version'));
  return { redirect: `/trades/${id}?new=1` };
});

export const confirmTradeAction = action(async (ctx, fd) => {
  await confirmTrade(ctx, str(fd, 'id'));
  return '取引が完了しました。ご利用ありがとうございました';
});

export const openDisputeAction = action(async (ctx, fd) => {
  await openDispute(ctx, str(fd, 'id'), str(fd, 'reason'), str(fd, 'detail'), fd.getAll('shots') as File[]);
  return 'エラー申請を受け付けました。取引は保留され、協議ページが作成されました';
});

export const postMessageAction = action(async (ctx, fd) => {
  const r = await postDisputeMessage(ctx, str(fd, 'id'), str(fd, 'body'));
  if (r.status === 'blocked') throw new AppError(`送信をブロックしました：${r.reasons.join('、')}。サイト外の連絡先・ギフトコードの交換は禁止されています。繰り返すと利用制限の対象になります`);
  return r.status === 'flagged' ? '送信しました（内容は運営の確認対象として記録されました）' : undefined;
});

export async function revealCodeAction(tradeId: string): Promise<{ code?: string; error?: string }> {
  try { return { code: await revealCode(await getCtx(), tradeId) }; }
  catch (e) { return { error: e instanceof AppError ? e.message : 'コードを表示できませんでした' }; }
}

export async function markMailReadAction(id: string) {
  await markMailRead(await getCtx(), id);
}
