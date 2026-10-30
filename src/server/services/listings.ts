import { audit } from '../audit';
import { calcPrice, fail, newId, sellBlockReason, type Ctx } from '../core';
import { codeFingerprint, decryptCode, encryptCode, normalizeCode } from '../crypto';
import { getDb } from '../db';
import { queueMail } from '../mail';
import { getSettings } from '../settings';
import { autoWarn, lockUser, requireActor, requireAdmin } from './common';

const yen = (n: number) => `¥${n.toLocaleString('ja-JP')}`;
const pct = (x10: number) => `${(x10 / 10).toFixed(1)}%`;

export function parseRate(raw: string) {
  const n = Math.round(Number(raw) * 10);
  return Number.isFinite(n) ? n : NaN;
}

export async function createListing(ctx: Ctx, input: { face: number; rateX10: number; code: string }) {
  const actor = requireActor(ctx);
  const code = normalizeCode(input.code);
  if (!/^[A-Z0-9]{16}$/.test(code)) fail('ギフトコードは英数字16桁で入力してください');
  const db = await getDb();
  const s = await getSettings(db);
  if (!Number.isInteger(input.face) || input.face < s.faceMin || input.face > s.faceMax) fail(`額面は ${yen(s.faceMin)}〜${yen(s.faceMax)} の範囲で入力してください`);
  if (!(input.rateX10 >= s.rateMinX10 && input.rateX10 <= s.rateMaxX10)) fail(`販売利率は ${pct(s.rateMinX10)}〜${pct(s.rateMaxX10)} の範囲で設定してください`);
  const fp = codeFingerprint(code);
  const enc = encryptCode(code);

  const result = await db.tx(async q => {
    const u = await lockUser(q, actor.id);
    const why = sellBlockReason(u); if (why) fail(why);
    const { rows: dup } = await q.query<{ id: string }>('SELECT id FROM listings WHERE code_fp = $1', [fp]);
    if (dup[0]) {
      // Record the attempt and commit; the error is raised after the transaction.
      const { rows } = await q.query<{ n: number }>('UPDATE users SET flag_dup = flag_dup + 1 WHERE id = $1 RETURNING flag_dup AS n', [u.id]);
      await audit(q, ctx, 'listing.duplicate_blocked', u.id, `既存出品 ${dup[0].id} と同一コード`);
      if (rows[0].n >= 2) await autoWarn(q, ctx, u.id, '同一ギフトコードの重複出品（自動検知）');
      return { duplicate: true as const };
    }
    const id = newId('LST');
    await q.query(
      `INSERT INTO listings (id, seller_id, face, rate_x10, price, code_ct, code_iv, code_tag, key_version, code_head, code_tail, code_fp)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [id, u.id, input.face, input.rateX10, calcPrice(input.face, input.rateX10), enc.ct, enc.iv, enc.tag, enc.keyVersion, code.slice(0, 4), code.slice(-4), fp]);
    await queueMail(q, { userId: u.id }, 'listing_created', '出品を受け付けました', `${u.name} 様\n\n出品 ${id}（額面 ${yen(input.face)}・販売利率 ${pct(input.rateX10)}）を受け付けました。\n運営による残高確認の完了後、マーケットに掲載されます。`);
    await queueMail(q, 'ops', 'listing_created', '残高確認の依頼', `出品 ${id}（${u.name} 様・額面 ${yen(input.face)}）の残高確認をお願いします。`);
    await audit(q, ctx, 'listing.create', id, `額面 ${yen(input.face)} / 利率 ${pct(input.rateX10)} / コード ${code.slice(0, 4)}…${code.slice(-4)}`);
    return { duplicate: false as const, id };
  });
  if (result.duplicate) fail('このギフトコードは既に出品または取引済みのため出品できません（この操作は記録されました）');
  return result.id;
}

export async function changeRate(ctx: Ctx, listingId: string, rateX10: number) {
  const actor = requireActor(ctx);
  const db = await getDb();
  const s = await getSettings(db);
  if (!(rateX10 >= s.rateMinX10 && rateX10 <= s.rateMaxX10)) fail(`販売利率は ${pct(s.rateMinX10)}〜${pct(s.rateMaxX10)} の範囲で設定してください`);
  await db.tx(async q => {
    const { rows } = await q.query<{ seller_id: string; status: string; rate_x10: number; face: number }>('SELECT seller_id, status, rate_x10, face FROM listings WHERE id = $1 FOR UPDATE', [listingId]);
    const l = rows[0] ?? fail('出品が見つかりません');
    if (l.seller_id !== actor.id) fail('この出品を変更する権限がありません');
    if (!['checking', 'active'].includes(l.status)) fail('売買成立後は販売利率を変更できません');
    await q.query('UPDATE listings SET rate_x10 = $2, price = $3, version = version + 1 WHERE id = $1', [listingId, rateX10, calcPrice(l.face, rateX10)]);
    await audit(q, ctx, 'listing.rate_change', listingId, `${pct(l.rate_x10)} → ${pct(rateX10)}`);
  });
}

export async function withdrawListing(ctx: Ctx, listingId: string) {
  const actor = requireActor(ctx);
  const db = await getDb();
  await db.tx(async q => {
    const { rows } = await q.query<{ seller_id: string; status: string }>('SELECT seller_id, status FROM listings WHERE id = $1 FOR UPDATE', [listingId]);
    const l = rows[0] ?? fail('出品が見つかりません');
    if (l.seller_id !== actor.id && actor.role !== 'admin') fail('権限がありません');
    if (!['checking', 'active'].includes(l.status)) fail('この出品は取り下げできません');
    await q.query("UPDATE listings SET status = 'withdrawn', version = version + 1 WHERE id = $1", [listingId]);
    await audit(q, ctx, 'listing.withdraw', listingId);
  });
}

export const CHECK_METHODS = ['Apple公式サイトで残高照会', 'Apple Store アプリで照会', 'Apple サポートへ照会'] as const;

/** Manual balance verification by staff (base scope — no automatic check). */
export async function recordBalanceCheck(ctx: Ctx, listingId: string, input: { result: 'ok' | 'ng'; balance: number; method: string; note: string }) {
  const admin = requireAdmin(ctx);
  if (!CHECK_METHODS.includes(input.method as (typeof CHECK_METHODS)[number])) fail('確認方法を選択してください');
  if (!Number.isInteger(input.balance) || input.balance < 0) fail('確認できた残高を入力してください');
  const db = await getDb();
  return db.tx(async q => {
    const { rows } = await q.query<{ seller_id: string; status: string; face: number }>('SELECT seller_id, status, face FROM listings WHERE id = $1 FOR UPDATE', [listingId]);
    const l = rows[0] ?? fail('出品が見つかりません');
    if (l.status !== 'checking') fail('この出品は残高確認待ちではありません');
    let result = input.result, note = input.note.trim();
    const forced = result === 'ok' && input.balance < l.face;
    if (forced) { result = 'ng'; note = note || '確認残高が額面に満たないため'; }
    await q.query(
      `UPDATE listings SET status = $2, version = version + 1, check_result = $3, check_balance = $4, check_method = $5, check_note = $6, check_at = now(), check_staff_id = $7 WHERE id = $1`,
      [listingId, result === 'ok' ? 'active' : 'rejected', result, input.balance, input.method, note || null, admin.id]);
    const { rows: su } = await q.query<{ name: string }>('SELECT name FROM users WHERE id = $1', [l.seller_id]);
    if (result === 'ok') {
      await queueMail(q, { userId: l.seller_id }, 'listing_live', '出品が掲載されました', `${su[0].name} 様\n\n出品 ${listingId}（額面 ${yen(l.face)}）の残高確認が完了し、マーケットに掲載しました。`);
    } else {
      const { rows: f } = await q.query<{ n: number }>('UPDATE users SET flag_invalid = flag_invalid + 1 WHERE id = $1 RETURNING flag_invalid AS n', [l.seller_id]);
      await queueMail(q, { userId: l.seller_id }, 'listing_rejected', '出品を掲載できませんでした', `${su[0].name} 様\n\n出品 ${listingId} は残高確認の結果、掲載できませんでした。\n理由：${note || '残高を確認できませんでした'}\n\n無効なコードの繰り返し出品は、利用制限・アカウント凍結の対象となります。`);
      if (f[0].n >= 2) await autoWarn(q, ctx, l.seller_id, '残高確認NGの出品の繰り返し（自動検知）');
    }
    await audit(q, ctx, 'listing.balance_check', listingId, `${result.toUpperCase()} 確認残高 ${yen(input.balance)} / ${input.method}${note ? ' / ' + note : ''}`);
    return { forced };
  });
}

export const DECRYPT_REASONS = ['残高確認のため', 'エラー申請の調査のため', '不正調査のため', '利用者からの問い合わせ対応のため'] as const;

export async function adminDecrypt(ctx: Ctx, listingId: string, reason: string) {
  requireAdmin(ctx);
  if (!DECRYPT_REASONS.includes(reason as (typeof DECRYPT_REASONS)[number])) fail('復号理由を選択してください');
  const db = await getDb();
  const { rows } = await db.query<{ code_ct: string; code_iv: string; code_tag: string; key_version: number }>('SELECT code_ct, code_iv, code_tag, key_version FROM listings WHERE id = $1', [listingId]);
  const l = rows[0] ?? fail('出品が見つかりません');
  await db.tx(q => audit(q, ctx, 'code.decrypt_admin', listingId, reason)); // logged before the plaintext is returned
  return decryptCode({ ct: l.code_ct, iv: l.code_iv, tag: l.code_tag, keyVersion: l.key_version });
}
