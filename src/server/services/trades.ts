import { audit } from '../audit';
import { calcFee, fail, newId, systemCtx, tradeBlockReason, type Ctx } from '../core';
import { decryptCode } from '../crypto';
import { getDb, type Queryable } from '../db';
import { moveBalance } from '../ledger';
import { queueMail } from '../mail';
import { inspectMessage } from '../moderation';
import { getSettings } from '../settings';
import { prepareImage, storeImage, type PreparedImage } from '../storage';
import { autoWarn, lockUser, requireActor, requireAdmin } from './common';

const yen = (n: number) => `¥${n.toLocaleString('ja-JP')}`;

type TradeRow = { id: string; listing_id: string; buyer_id: string; seller_id: string; face: number; price: number; fee: number; seller_net: number; status: string; deadline: Date };
async function lockTrade(q: Queryable, id: string) {
  const { rows } = await q.query<TradeRow>('SELECT * FROM trades WHERE id = $1 FOR UPDATE', [id]);
  return rows[0] ?? fail('取引が見つかりません');
}

/**
 * Purchase with exclusive control:
 *  - listing row locked FOR UPDATE, status + version checked (price lock / stale-page protection)
 *  - buyer row locked, balance debited (CHECK constraint forbids negatives)
 *  - trades.listing_id UNIQUE is a second guard against double sale
 */
export async function purchase(ctx: Ctx, listingId: string, expectedVersion: number) {
  const actor = requireActor(ctx);
  const db = await getDb();
  return db.tx(async q => {
    const s = await getSettings(q);
    const { rows } = await q.query<{ seller_id: string; status: string; version: number; face: number; rate_x10: number; price: number }>(
      'SELECT seller_id, status, version, face, rate_x10, price FROM listings WHERE id = $1 FOR UPDATE', [listingId]);
    const l = rows[0] ?? fail('出品が見つかりません');
    if (l.status !== 'active') fail('この商品は既に購入されたか、出品が停止されています');
    if (l.version !== expectedVersion) fail('価格または出品内容が変更されました。最新の内容をご確認ください');
    if (l.seller_id === actor.id) fail('自分の出品は購入できません');
    const buyer = await lockUser(q, actor.id);
    const why = tradeBlockReason(buyer); if (why) fail(why);
    if (buyer.charge_balance < l.price) fail(`チャージ残高が不足しています（必要 ${yen(l.price)} / 残高 ${yen(buyer.charge_balance)}）`);

    const id = newId('TRD');
    const fee = calcFee(l.price, s.feeBps);
    await q.query("UPDATE listings SET status = 'sold', version = version + 1, sold_at = now() WHERE id = $1", [listingId]);
    await q.query(
      `INSERT INTO trades (id, listing_id, buyer_id, seller_id, face, rate_x10, price, fee, seller_net, deadline)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now() + ($10 || ' minutes')::interval)`,
      [id, listingId, buyer.id, l.seller_id, l.face, l.rate_x10, l.price, fee, l.price - fee, String(s.confirmMinutes)]);
    await moveBalance(q, buyer.id, 'charge', -l.price, 'purchase', id);
    await queueMail(q, { userId: buyer.id }, 'trade_open', '購入が成立しました',
      `${buyer.name} 様\n\nAppleギフトカード（額面 ${yen(l.face)}）を ${yen(l.price)} で購入しました。\n\n${s.confirmMinutes}分以内に取引画面でコードを確認し、「取引完了」または「エラー申請」を行ってください。\n期限内に操作がない場合は自動的に取引完了となります。\n\n取引ID：${id}`);
    await queueMail(q, { userId: l.seller_id }, 'trade_open', '売買が成立しました', `出品 ${listingId}（額面 ${yen(l.face)}）が購入されました。\n買い手の受取確認後、売上に反映されます。\n\n取引ID：${id}`);
    await audit(q, ctx, 'trade.purchase', id, `${listingId} / ${yen(l.price)} / 価格ロック v${l.version}`);
    return id;
  });
}

export async function revealCode(ctx: Ctx, tradeId: string) {
  const actor = requireActor(ctx);
  const db = await getDb();
  const { rows } = await db.query<{ buyer_id: string; status: string; code_ct: string; code_iv: string; code_tag: string; key_version: number }>(
    'SELECT t.buyer_id, t.status, l.code_ct, l.code_iv, l.code_tag, l.key_version FROM trades t JOIN listings l ON l.id = t.listing_id WHERE t.id = $1', [tradeId]);
  const r = rows[0] ?? fail('取引が見つかりません');
  if (r.buyer_id !== actor.id) fail('このコードを表示する権限がありません');
  if (r.status === 'cancelled') fail('取引中止となった取引のコードは表示できません');
  await db.tx(q => audit(q, ctx, 'code.view_buyer', tradeId));
  return decryptCode({ ct: r.code_ct, iv: r.code_iv, tag: r.code_tag, keyVersion: r.key_version });
}

async function complete(q: Queryable, ctx: Ctx, t: TradeRow, by: 'buyer' | 'auto' | 'admin', note = '') {
  await q.query("UPDATE trades SET status = 'completed', completed_at = now(), completed_by = $2 WHERE id = $1", [t.id, by]);
  await moveBalance(q, t.seller_id, 'sales', t.seller_net, 'sale', t.id, `手数料 ${yen(t.fee)} 控除後`);
  const how = { buyer: '買い手の受取確認', auto: '受取確認期限の経過による自動確定', admin: '運営の判断' }[by];
  await queueMail(q, { userId: t.seller_id }, 'trade_complete', '取引が完了しました', `取引 ${t.id}（額面 ${yen(t.face)}）が完了しました（${how}）。\n売上 ${yen(t.seller_net)} を売上残高に反映しました。お支払いは運営より所定の日程で行います。${note ? `\n\n運営より：${note}` : ''}`);
  await queueMail(q, { userId: t.buyer_id }, 'trade_complete', '取引が完了しました', `取引 ${t.id} が完了しました（${how}）。${note ? `\n\n運営より：${note}` : ''}`);
  await audit(q, ctx, 'trade.complete', t.id, how + (note ? ` / ${note}` : ''));
}

export async function confirmTrade(ctx: Ctx, tradeId: string) {
  const actor = requireActor(ctx);
  const db = await getDb();
  await db.tx(async q => {
    const t = await lockTrade(q, tradeId);
    if (t.buyer_id !== actor.id) fail('権限がありません');
    if (t.status !== 'awaiting') fail('この取引は既に確定しています');
    await complete(q, ctx, t, 'buyer');
  });
}

/** Scheduler job: confirm every trade whose window has elapsed. Safe to run from several instances. */
export async function autoConfirmDue(limit = 50) {
  const db = await getDb();
  const { rows } = await db.query<{ id: string }>("SELECT id FROM trades WHERE status = 'awaiting' AND deadline <= now() ORDER BY deadline LIMIT $1", [limit]);
  let n = 0;
  for (const { id } of rows) {
    await db.tx(async q => {
      const { rows: r } = await q.query<TradeRow>("SELECT * FROM trades WHERE id = $1 AND status = 'awaiting' AND deadline <= now() FOR UPDATE SKIP LOCKED", [id]);
      if (r[0]) { await complete(q, systemCtx, r[0], 'auto'); n++; }
    });
  }
  return n;
}

export const DISPUTE_REASONS = ['残高が表示額と異なる', 'コードが無効（存在しない）', '既に使用済み（引換済み）', 'その他'] as const;

export async function openDispute(ctx: Ctx, tradeId: string, reason: string, detail: string, files: File[]) {
  const actor = requireActor(ctx);
  if (!DISPUTE_REASONS.includes(reason as (typeof DISPUTE_REASONS)[number])) fail('申請理由を選択してください');
  const imgs: PreparedImage[] = [];
  for (const f of files.filter(f => f && f.size).slice(0, 3)) imgs.push((await prepareImage(f))!);
  const db = await getDb();
  await db.tx(async q => {
    const t = await lockTrade(q, tradeId);
    if (t.buyer_id !== actor.id) fail('権限がありません');
    if (t.status !== 'awaiting') fail('この取引はエラー申請できません');
    if (new Date(t.deadline).getTime() <= Date.now()) fail('受取確認の期限を過ぎているため申請できません');
    await q.query("UPDATE trades SET status = 'disputed' WHERE id = $1", [tradeId]);
    await q.query('INSERT INTO disputes (trade_id, reason, detail) VALUES ($1,$2,$3)', [tradeId, reason, detail.slice(0, 2000)]);
    for (const img of imgs) await storeImage(q, img, actor.id, 'screenshot', tradeId);
    await queueMail(q, { userId: t.seller_id }, 'dispute_open', 'エラー申請がありました', `取引 ${tradeId} について買い手からエラー申請がありました（${reason}）。\n取引と代金は保留されました。協議ページをご確認ください。`);
    await queueMail(q, { userId: t.buyer_id }, 'dispute_open', 'エラー申請を受け付けました', `取引 ${tradeId} のエラー申請を受け付けました。取引と代金は保留されています。\n協議ページで状況をお知らせください。`);
    await queueMail(q, 'ops', 'dispute_open', 'エラー申請', `取引 ${tradeId}：${reason}（添付 ${imgs.length} 枚）`);
    await audit(q, ctx, 'dispute.open', tradeId, `${reason} / 添付${imgs.length}枚`);
  });
}

export type PostResult = { status: 'posted' | 'flagged' | 'blocked'; reasons: string[] };

export async function postDisputeMessage(ctx: Ctx, tradeId: string, bodyRaw: string): Promise<PostResult> {
  const actor = requireActor(ctx);
  const body = bodyRaw.trim().slice(0, 2000);
  if (!body) fail('メッセージを入力してください');
  const db = await getDb();
  const { rows: pre } = await db.query<TradeRow>('SELECT * FROM trades WHERE id = $1', [tradeId]);
  const t0 = pre[0] ?? fail('取引が見つかりません');
  const role = actor.role === 'admin' ? 'admin' : t0.buyer_id === actor.id ? 'buyer' : t0.seller_id === actor.id ? 'seller' : fail('権限がありません');
  const s = await getSettings(db);
  const insp = role === 'admin' ? { action: 'pass' as const, ruleHits: [], ai: null } : await inspectMessage(body, s.aiCheck);
  const reasons = [...insp.ruleHits, ...(insp.ai?.reasons ?? [])];

  return db.tx(async q => {
    const t = await lockTrade(q, tradeId);
    if (t.status !== 'disputed') fail('この取引の協議は終了しています');
    if (insp.action !== 'pass') {
      await q.query('INSERT INTO detections (id, trade_id, user_id, body, rule_hits, ai, action) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [newId('DET'), tradeId, actor.id, body, JSON.stringify(insp.ruleHits), insp.ai ? JSON.stringify(insp.ai) : null, insp.action]);
      await audit(q, ctx, insp.action === 'block' ? 'dispute.message_blocked' : 'dispute.message_flagged', tradeId, reasons.join('、'));
    }
    if (insp.action === 'block') {
      const { rows } = await q.query<{ n: number }>('UPDATE users SET flag_blocked = flag_blocked + 1 WHERE id = $1 RETURNING flag_blocked AS n', [actor.id]);
      if (rows[0].n >= 3) await autoWarn(q, ctx, actor.id, '協議ページでの禁止行為（連絡先・コード交換）の繰り返し（自動検知）');
      return { status: 'blocked', reasons };
    }
    await q.query('INSERT INTO dispute_messages (id, trade_id, user_id, role, body, flagged) VALUES ($1,$2,$3,$4,$5,$6)', [newId('MSG'), tradeId, actor.id, role, body, insp.action === 'flag']);
    if (insp.action === 'pass') await audit(q, ctx, 'dispute.message', tradeId, body.slice(0, 60));
    const notify = role === 'admin' ? [t.buyer_id, t.seller_id] : [role === 'buyer' ? t.seller_id : t.buyer_id];
    for (const uid of notify) await queueMail(q, { userId: uid }, 'dispute_message', `協議ページに${role === 'admin' ? '運営から' : '新しい'}メッセージがあります`, `取引 ${tradeId} の協議ページをご確認ください。`);
    return { status: insp.action === 'flag' ? 'flagged' : 'posted', reasons };
  });
}

export async function resolveDispute(ctx: Ctx, tradeId: string, decision: 'complete' | 'cancel', note: string) {
  const admin = requireAdmin(ctx);
  if (!note.trim()) fail('判断理由を入力してください');
  const db = await getDb();
  await db.tx(async q => {
    const t = await lockTrade(q, tradeId);
    if (t.status !== 'disputed') fail('この取引は協議中ではありません');
    await q.query('UPDATE disputes SET resolution = $2, resolved_at = now(), resolved_by = $3 WHERE trade_id = $1', [tradeId, `${decision === 'complete' ? '取引完了' : '取引中止'}：${note}`, admin.id]);
    if (decision === 'complete') {
      await complete(q, ctx, t, 'admin', note);
      return;
    }
    await q.query("UPDATE trades SET status = 'cancelled', completed_at = now(), completed_by = 'admin' WHERE id = $1", [tradeId]);
    await q.query("UPDATE listings SET status = 'cancelled', version = version + 1 WHERE id = $1", [t.listing_id]);
    await moveBalance(q, t.buyer_id, 'charge', t.price, 'refund', tradeId, '取引中止による購入代金の返還');
    await queueMail(q, { userId: t.buyer_id }, 'trade_cancel', '取引中止のお知らせ', `取引 ${tradeId} は運営の判断により取引中止となりました。\n購入代金 ${yen(t.price)} をチャージ残高へ戻しました。\n\n運営より：${note}`);
    await queueMail(q, { userId: t.seller_id }, 'trade_cancel', '取引中止のお知らせ', `取引 ${tradeId} は運営の判断により取引中止となりました。売上は計上されません。\n\n運営より：${note}`);
    await audit(q, ctx, 'trade.cancel', tradeId, note);
  });
}
