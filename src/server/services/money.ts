import { audit } from '../audit';
import { fail, newId, tradeBlockReason, type Ctx, type UserStatus } from '../core';
import { getDb, type Queryable } from '../db';
import { moveBalance, type Account } from '../ledger';
import { queueMail } from '../mail';
import { getSettings } from '../settings';
import { applySanction, lockUser, requireActor, requireAdmin, SANCTION_LABEL } from './common';

const yen = (n: number) => `¥${n.toLocaleString('ja-JP')}`;

/* ---------- charge (deposit) ---------- */
export async function requestCharge(ctx: Ctx, amount: number, payerName: string) {
  const actor = requireActor(ctx);
  const db = await getDb();
  const s = await getSettings(db);
  if (!Number.isInteger(amount) || amount < s.chargeMin || amount > s.chargeMax) fail(`チャージ金額は ${yen(s.chargeMin)}〜${yen(s.chargeMax)} の範囲で入力してください`);
  if (!/^[ァ-ヶー\s　]+$/.test(payerName.trim())) fail('振込名義は全角カタカナで入力してください');
  return db.tx(async q => {
    const u = await lockUser(q, actor.id);
    const why = tradeBlockReason(u); if (why) fail(why);
    const { rows } = await q.query<{ n: number }>("SELECT count(*)::int AS n FROM charges WHERE user_id = $1 AND status = 'pending'", [u.id]);
    if (rows[0].n >= 3) fail('未処理の入金申請が3件あります。反映をお待ちください');
    const id = newId('CHG');
    await q.query('INSERT INTO charges (id, user_id, amount, payer_name) VALUES ($1,$2,$3,$4)', [id, u.id, amount, payerName.trim()]);
    const b = s.depositBank;
    await queueMail(q, { userId: u.id }, 'charge_request', '入金申請を受け付けました',
      `${u.name} 様\n\n入金申請（${yen(amount)}）を受け付けました。下記口座へお振込みください。\n\n${b.name} ${b.branch}\n${b.type} ${b.number}\n口座名義：${b.holder}\n振込名義：${payerName}\n\n※ご本人名義以外からのお振込みは反映できません。\n※チャージ残高は商品購入にのみご利用いただけます（払い戻し不可）。`);
    await queueMail(q, 'ops', 'charge_request', '入金申請', `${u.name} 様 ${yen(amount)}（振込名義 ${payerName}）申請ID ${id}`);
    await audit(q, ctx, 'charge.request', id, yen(amount));
    return id;
  });
}

export async function reviewCharge(ctx: Ctx, chargeId: string, decision: 'approved' | 'rejected', input: { received?: number; note: string }) {
  requireAdmin(ctx);
  const db = await getDb();
  await db.tx(async q => {
    const { rows } = await q.query<{ user_id: string; amount: number; status: string }>('SELECT user_id, amount, status FROM charges WHERE id = $1 FOR UPDATE', [chargeId]);
    const c = rows[0] ?? fail('入金申請が見つかりません');
    if (c.status !== 'pending') fail('この申請は処理済みです');
    const { rows: ur } = await q.query<{ name: string }>('SELECT name FROM users WHERE id = $1', [c.user_id]);
    if (decision === 'approved') {
      const received = input.received ?? 0;
      if (!Number.isInteger(received) || received <= 0) fail('着金額を入力してください');
      await q.query("UPDATE charges SET status = 'approved', received = $2, reviewed_at = now(), reviewer_id = $3, note = $4 WHERE id = $1", [chargeId, received, ctx.actor!.id, input.note]);
      const bal = await moveBalance(q, c.user_id, 'charge', received, 'charge', chargeId, received !== c.amount ? `申請額 ${yen(c.amount)} と相違` : '');
      await queueMail(q, { userId: c.user_id }, 'charge_done', 'チャージが反映されました', `${ur[0].name} 様\n\n${yen(received)} をチャージ残高に反映しました。\n現在のチャージ残高：${yen(bal)}`);
      await audit(q, ctx, 'charge.approve', chargeId, `${yen(received)}${received !== c.amount ? `（申請 ${yen(c.amount)}）` : ''}`);
    } else {
      if (!input.note.trim()) fail('却下理由を入力してください');
      await q.query("UPDATE charges SET status = 'rejected', reviewed_at = now(), reviewer_id = $2, note = $3 WHERE id = $1", [chargeId, ctx.actor!.id, input.note]);
      await queueMail(q, { userId: c.user_id }, 'charge_rejected', '入金申請について', `${ur[0].name} 様\n\n入金申請 ${chargeId} を反映できませんでした。\n理由：${input.note}\n\nご不明な点は運営事務局までお問い合わせください。`);
      await audit(q, ctx, 'charge.reject', chargeId, input.note);
    }
  });
}

/* ---------- admin balance correction ---------- */
export async function adjustBalance(ctx: Ctx, userId: string, account: Account, delta: number, reason: string) {
  requireAdmin(ctx);
  if (!Number.isInteger(delta) || delta === 0) fail('増減額を入力してください');
  if (!reason.trim()) fail('理由を入力してください');
  const db = await getDb();
  await db.tx(async q => {
    const u = await lockUser(q, userId);
    await moveBalance(q, userId, account, delta, 'adjust', 'ADMIN', reason);
    await queueMail(q, { userId }, 'balance_adjust', '残高が訂正されました', `${u.name} 様\n\n${account === 'charge' ? 'チャージ' : '売上'}残高を ${delta > 0 ? '+' : ''}${delta.toLocaleString('ja-JP')}円 訂正しました。\n理由：${reason}`);
    await audit(q, ctx, 'balance.adjust', userId, `${account} ${delta > 0 ? '+' : ''}${delta} / ${reason}`);
  });
}

/* ---------- seller payouts (CSV only; staff transfers manually) ---------- */
export type PayoutCandidate = { sellerId: string; name: string; amount: number; tradeIds: string[]; bank: Record<string, string> | null; hold: string | null; status: UserStatus };

export async function payoutCandidates(q?: Queryable): Promise<PayoutCandidate[]> {
  const db = q ?? (await getDb());
  const { rows } = await db.query<{ seller_id: string; name: string; status: UserStatus; amount: number; ids: string[]; bank_name: string | null; branch: string; account_type: string; account_number: string; holder: string }>(
    `SELECT t.seller_id, u.name, u.status, sum(t.seller_net)::int AS amount, array_agg(t.id ORDER BY t.completed_at) AS ids,
            b.bank_name, b.branch, b.account_type, b.account_number, b.holder
       FROM trades t JOIN users u ON u.id = t.seller_id LEFT JOIN bank_accounts b ON b.user_id = t.seller_id
      WHERE t.status = 'completed' AND t.payout_id IS NULL
      GROUP BY t.seller_id, u.name, u.status, b.bank_name, b.branch, b.account_type, b.account_number, b.holder
      ORDER BY u.name`);
  return rows.map(r => ({
    sellerId: r.seller_id, name: r.name, amount: r.amount, tradeIds: r.ids, status: r.status,
    bank: r.bank_name ? { bankName: r.bank_name, branch: r.branch, type: r.account_type, number: r.account_number, holder: r.holder } : null,
    hold: ['frozen', 'expelled', 'restricted'].includes(r.status) ? `アカウント${SANCTION_LABEL[r.status]}中` : !r.bank_name ? '振込先口座 未登録' : null,
  }));
}

export async function createPayoutBatch(ctx: Ctx) {
  const admin = requireAdmin(ctx);
  const db = await getDb();
  return db.tx(async q => {
    // lock the candidate trades so a concurrent batch cannot include them twice
    const { rows: locked } = await q.query<{ id: string; seller_id: string }>("SELECT id, seller_id FROM trades WHERE status = 'completed' AND payout_id IS NULL FOR UPDATE");
    const cands = (await payoutCandidates(q)).filter(c => !c.hold);
    const lockedIds = new Set(locked.map(r => r.id));
    const items = cands.map(c => ({ ...c, tradeIds: c.tradeIds.filter(id => lockedIds.has(id)) })).filter(c => c.tradeIds.length);
    if (!items.length) fail('支払対象の売上がありません');
    const id = newId('PAY');
    await q.query('INSERT INTO payouts (id, created_by) VALUES ($1,$2)', [id, admin.id]);
    for (const c of items) {
      const { rows } = await q.query<{ amount: number }>('UPDATE trades SET payout_id = $1 WHERE id = ANY($2::text[]) RETURNING seller_net AS amount', [id, c.tradeIds]);
      const amount = rows.reduce((s, r) => s + r.amount, 0);
      await q.query('INSERT INTO payout_items (payout_id, seller_id, amount, trade_count, bank) VALUES ($1,$2,$3,$4,$5)', [id, c.sellerId, amount, rows.length, JSON.stringify(c.bank)]);
    }
    await audit(q, ctx, 'payout.export', id, `${items.length}名`);
    return id;
  });
}

export async function markPayoutPaid(ctx: Ctx, payoutId: string) {
  requireAdmin(ctx);
  const db = await getDb();
  await db.tx(async q => {
    const { rows } = await q.query<{ status: string }>('SELECT status FROM payouts WHERE id = $1 FOR UPDATE', [payoutId]);
    if (!rows[0]) fail('支払バッチが見つかりません');
    if (rows[0].status === 'paid') fail('既に振込完了として記録されています');
    const { rows: items } = await q.query<{ seller_id: string; amount: number; trade_count: number; bank: { bankName: string; branch: string } }>('SELECT seller_id, amount, trade_count, bank FROM payout_items WHERE payout_id = $1', [payoutId]);
    for (const i of items) {
      await moveBalance(q, i.seller_id, 'sales', -i.amount, 'payout', payoutId, `${i.trade_count}件分`);
      await queueMail(q, { userId: i.seller_id }, 'payout', '売上をお振込みしました', `売上 ${yen(i.amount)}（${i.trade_count}件分）を ${i.bank.bankName} ${i.bank.branch} へお振込みしました。`);
    }
    await q.query("UPDATE payouts SET status = 'paid', paid_at = now(), paid_by = $2 WHERE id = $1", [payoutId, ctx.actor!.id]);
    await audit(q, ctx, 'payout.paid', payoutId, `${items.length}名 / ${yen(items.reduce((s, i) => s + i.amount, 0))}`);
  });
}

export async function payoutCsvRows(payoutId: string) {
  const db = await getDb();
  const { rows } = await db.query<{ seller_id: string; name: string; amount: number; trade_count: number; bank: Record<string, string> }>(
    'SELECT p.seller_id, u.name, p.amount, p.trade_count, p.bank FROM payout_items p JOIN users u ON u.id = p.seller_id WHERE p.payout_id = $1 ORDER BY u.name', [payoutId]);
  const { rows: tr } = await db.query<{ seller_id: string; id: string }>('SELECT seller_id, id FROM trades WHERE payout_id = $1 ORDER BY completed_at', [payoutId]);
  return [
    ['支払ID', '売り手ID', '氏名', '銀行名', '支店名', '口座種別', '口座番号', '口座名義', '支払額', '対象取引数', '対象取引ID'],
    ...rows.map(r => [payoutId, r.seller_id, r.name, r.bank.bankName, r.bank.branch, r.bank.type, r.bank.number, r.bank.holder, r.amount, r.trade_count, tr.filter(t => t.seller_id === r.seller_id).map(t => t.id).join(' ')]),
  ];
}

/* ---------- sanctions & detections ---------- */
export async function sanctionUser(ctx: Ctx, userId: string, level: UserStatus, reason: string) {
  requireAdmin(ctx);
  if (!reason.trim()) fail('理由を入力してください');
  const db = await getDb();
  await db.tx(q => applySanction(q, ctx, userId, level, reason));
}

export async function reviewDetection(ctx: Ctx, id: string) {
  requireAdmin(ctx);
  const db = await getDb();
  await db.tx(async q => {
    await q.query('UPDATE detections SET reviewed_at = now(), reviewed_by = $2 WHERE id = $1 AND reviewed_at IS NULL', [id, ctx.actor!.id]);
    await audit(q, ctx, 'detection.review', id);
  });
}
