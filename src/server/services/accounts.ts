import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { audit } from '../audit';
import { fail, newId, tradeBlockReason, type Ctx, type UserRow } from '../core';
import { hashPassword, randomToken, sha256, verifyPassword } from '../crypto';
import { getDb } from '../db';
import { notify } from '../mail';
import { prepareImage, storeImage } from '../storage';
import { lockUser, requireActor, requireAdmin } from './common';

const kanaRe = /^[ァ-ヶー\s　]+$/;

/** Login IDs: 3–30 characters of lowercase letters, digits, "_" and "-" (no email addresses). */
export const LOGIN_ID_RULE = '半角英小文字・数字・「_」「-」の3〜30文字';
export const normalizeLoginId = (raw: string) => raw.normalize('NFKC').trim().toLowerCase();
const LoginId = z.string().transform(normalizeLoginId)
  .refine(v => !v.includes('@'), 'ログインIDにメールアドレスは使用できません')
  .refine(v => /^[a-z0-9_-]{3,30}$/.test(v), `ログインIDは${LOGIN_ID_RULE}で入力してください`);
const Password = z.string().min(8, 'パスワードは8文字以上にしてください').max(128);

export const RegisterInput = z.object({
  name: z.string().trim().min(1, '氏名を入力してください').max(50),
  kana: z.string().trim().regex(kanaRe, '氏名（カナ）は全角カタカナで入力してください').max(50),
  loginId: LoginId,
  password: Password,
});

export async function register(ctx: Ctx, input: z.infer<typeof RegisterInput>) {
  const db = await getDb();
  const pwHash = await hashPassword(input.password);
  return db.tx(async q => {
    const { rows } = await q.query('SELECT 1 FROM users WHERE login_id = $1', [input.loginId]);
    if (rows.length) fail('このログインIDは既に使われています。別のIDを入力してください');
    const id = newId('USR');
    await q.query('INSERT INTO users (id, login_id, password_hash, name, kana) VALUES ($1,$2,$3,$4,$5)', [id, input.loginId, pwHash, input.name, input.kana.replace(/　/g, ' ')]);
    await notify(q, { userId: id }, 'welcome', 'ご登録ありがとうございます', `${input.name} 様\n\ntrade7 へのご登録ありがとうございます。\nログインID：${input.loginId}\n\n売買・チャージをご利用いただくには、マイページから本人確認書類をご提出ください。`);
    await audit(q, { ...ctx, actor: { id, name: input.name, role: 'member' } }, 'user.register', id, input.loginId);
    return id;
  });
}

const LOGIN_WINDOW_MIN = 15, LOGIN_MAX_FAILS = 5;
let dummy: Promise<string> | undefined;
const dummyHash = () => (dummy ??= hashPassword(randomToken()));

/** Returns a raw session token; the caller sets it as an httpOnly cookie. */
export async function login(ctx: Ctx, loginIdRaw: string, password: string) {
  const loginId = normalizeLoginId(loginIdRaw);
  const db = await getDb();
  const { rows: fails } = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM audit_logs WHERE action = 'auth.login_failed' AND target = $1 AND at > now() - interval '${LOGIN_WINDOW_MIN} minutes'`, [loginId]);
  if (fails[0].n >= LOGIN_MAX_FAILS) fail(`ログインに${LOGIN_MAX_FAILS}回失敗したため、${LOGIN_WINDOW_MIN}分間ログインできません`);
  const { rows } = await db.query<UserRow>('SELECT * FROM users WHERE login_id = $1', [loginId]);
  const u = rows[0];
  // compare even when the user does not exist, so timing does not reveal registered IDs
  const ok = await verifyPassword(password, u?.password_hash ?? (await dummyHash()));
  if (!u || !ok || u.status === 'expelled') {
    await db.tx(q => audit(q, ctx, 'auth.login_failed', loginId, u?.status === 'expelled' ? '強制退会済み' : '認証失敗'));
    fail('ログインIDまたはパスワードが違います');
  }
  const token = randomToken();
  const hours = u!.role === 'admin' ? 12 : 24 * 7;
  await db.tx(async q => {
    await q.query(`INSERT INTO sessions (id, user_id, ip, ua, expires_at) VALUES ($1,$2,$3,$4, now() + interval '${hours} hours')`, [sha256(token), u!.id, ctx.ip, ctx.ua]);
    await audit(q, { ...ctx, actor: { id: u!.id, name: u!.name, role: u!.role } }, 'auth.login', u!.id);
  });
  return { token, user: u!, maxAge: hours * 3600 };
}

/** Member changes their own password. Other sessions are signed out; the current one stays. */
export async function changePassword(ctx: Ctx, current: string, next: string, keepSession: string) {
  const actor = requireActor(ctx);
  Password.parse(next);
  if (current === next) fail('現在と異なるパスワードを入力してください');
  const db = await getDb();
  const u0 = (await db.query<UserRow>('SELECT * FROM users WHERE id = $1', [actor.id])).rows[0];
  if (!(await verifyPassword(current, u0.password_hash))) {
    await db.tx(q => audit(q, ctx, 'auth.password_change_failed', actor.id));
    fail('現在のパスワードが違います');
  }
  const pwHash = await hashPassword(next);
  await db.tx(async q => {
    await q.query('UPDATE users SET password_hash = $2, must_change_password = false WHERE id = $1', [actor.id, pwHash]);
    await q.query('DELETE FROM sessions WHERE user_id = $1 AND id <> $2', [actor.id, sha256(keepSession)]);
    await notify(q, { userId: actor.id }, 'password_changed', 'パスワードが変更されました', `${actor.name} 様\n\nパスワードが変更されました。他の端末はログアウトされました。\nお心当たりがない場合は至急運営までお問い合わせください。`);
    await audit(q, ctx, 'auth.password_change', actor.id);
  });
}

const TEMP_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
/**
 * Forgotten passwords are handled by staff (there is no email to send a reset link to):
 * issues a one-time temporary password, signs the member out everywhere and forces a change at next login.
 */
export async function adminResetPassword(ctx: Ctx, userId: string) {
  requireAdmin(ctx);
  const temp = Array.from({ length: 10 }, () => TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)]).join('');
  const pwHash = await hashPassword(temp);
  const db = await getDb();
  await db.tx(async q => {
    const u = await lockUser(q, userId);
    if (u.role === 'admin') fail('管理者のパスワードはこの画面から再発行できません');
    await q.query('UPDATE users SET password_hash = $2, must_change_password = true WHERE id = $1', [userId, pwHash]);
    await q.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
    await notify(q, { userId }, 'password_reset', '仮パスワードが発行されました', `${u.name} 様\n\n運営により仮パスワードが発行されました。ログイン後、新しいパスワードに変更してください。`);
    await audit(q, ctx, 'auth.password_reset_by_admin', userId);
  });
  return temp;
}

export async function logout(ctx: Ctx, token: string) {
  const db = await getDb();
  await db.tx(async q => {
    await q.query('DELETE FROM sessions WHERE id = $1', [sha256(token)]);
    if (ctx.actor) await audit(q, ctx, 'auth.logout', ctx.actor.id);
  });
}

export const DOC_TYPES = ['運転免許証', 'マイナンバーカード（表面のみ）', 'パスポート', '在留カード', '住民基本台帳カード'] as const;

export async function submitKyc(ctx: Ctx, docType: string, file: File | null) {
  const actor = requireActor(ctx);
  if (!DOC_TYPES.includes(docType as (typeof DOC_TYPES)[number])) fail('書類の種類を選択してください');
  const img = (await prepareImage(file)) ?? fail('身分証の画像を選択してください');
  const db = await getDb();
  await db.tx(async q => {
    const u = await lockUser(q, actor.id);
    if (u.kyc_status === 'pending' || u.kyc_status === 'approved') fail('本人確認書類は提出済みです');
    const fileId = await storeImage(q, img, u.id, 'kyc');
    await q.query('INSERT INTO kyc_submissions (id, user_id, doc_type, file_id) VALUES ($1,$2,$3,$4)', [newId('KYC'), u.id, docType, fileId]);
    await q.query("UPDATE users SET kyc_status = 'pending' WHERE id = $1", [u.id]);
    await notify(q, { userId: u.id }, 'kyc_submit', '本人確認書類を受け付けました', `${u.name} 様\n\n本人確認書類（${docType}）を受け付けました。審査完了までしばらくお待ちください。`);
    await notify(q, 'ops', 'kyc_submit', '本人確認の審査依頼', `${u.name} 様（${u.id}）から本人確認書類が提出されました。`);
    await audit(q, ctx, 'kyc.submit', u.id, docType);
  });
}

export async function reviewKyc(ctx: Ctx, userId: string, decision: 'approved' | 'rejected', note: string) {
  requireAdmin(ctx);
  if (decision === 'rejected' && !note.trim()) fail('差戻し理由を入力してください');
  const db = await getDb();
  await db.tx(async q => {
    const u = await lockUser(q, userId);
    const { rows } = await q.query<{ id: string }>("SELECT id FROM kyc_submissions WHERE user_id = $1 AND status = 'pending' ORDER BY submitted_at DESC LIMIT 1", [userId]);
    if (!rows[0]) fail('審査待ちの提出がありません');
    await q.query('UPDATE kyc_submissions SET status = $2, reviewed_at = now(), reviewer_id = $3, note = $4 WHERE id = $1', [rows[0].id, decision, ctx.actor!.id, note]);
    await q.query('UPDATE users SET kyc_status = $2 WHERE id = $1', [userId, decision]);
    if (decision === 'approved') await notify(q, { userId }, 'kyc_result', '本人確認が完了しました', `${u.name} 様\n\n本人確認が完了しました。チャージ・購入がご利用いただけます。\n出品をご希望の場合は「出品管理」から出品者審査を申請してください。`);
    else await notify(q, { userId }, 'kyc_result', '本人確認書類の再提出のお願い', `${u.name} 様\n\n提出いただいた書類では本人確認ができませんでした。\n理由：${note}\n\nマイページから再提出してください。`);
    await audit(q, ctx, `kyc.${decision === 'approved' ? 'approve' : 'reject'}`, userId, note);
  });
}

export async function applySeller(ctx: Ctx) {
  const actor = requireActor(ctx);
  const db = await getDb();
  await db.tx(async q => {
    const u = await lockUser(q, actor.id);
    const why = tradeBlockReason(u); if (why) fail(why);
    if (u.seller_status === 'pending' || u.seller_status === 'approved') fail('既に申請済みです');
    await q.query("UPDATE users SET seller_status = 'pending', seller_applied_at = now(), seller_note = NULL WHERE id = $1", [u.id]);
    await notify(q, 'ops', 'seller_apply', '出品者審査の申請', `${u.name} 様（${u.id}）から出品者審査の申請がありました。`);
    await audit(q, ctx, 'seller.apply', u.id);
  });
}

export async function reviewSeller(ctx: Ctx, userId: string, decision: 'approved' | 'rejected', note: string) {
  requireAdmin(ctx);
  if (decision === 'rejected' && !note.trim()) fail('理由を入力してください');
  const db = await getDb();
  await db.tx(async q => {
    const u = await lockUser(q, userId);
    await q.query('UPDATE users SET seller_status = $2, seller_note = $3 WHERE id = $1', [userId, decision, note || null]);
    if (decision === 'rejected') await q.query("UPDATE listings SET status = 'withdrawn', version = version + 1 WHERE seller_id = $1 AND status IN ('checking','active')", [userId]);
    await notify(q, { userId }, 'seller_result', decision === 'approved' ? '出品者審査に通過しました' : '出品者審査の結果について',
      decision === 'approved' ? `${u.name} 様\n\n出品者審査に通過しました。「出品管理」から出品できます。` : `${u.name} 様\n\n出品者審査の結果、出品権限を付与できませんでした。\n理由：${note}`);
    await audit(q, ctx, `seller.${decision === 'approved' ? 'approve' : 'reject'}`, userId, note);
  });
}

export const BankInput = z.object({
  bankName: z.string().trim().min(1).max(50),
  branch: z.string().trim().min(1).max(50),
  type: z.enum(['普通', '当座']),
  number: z.string().trim().regex(/^\d{7}$/, '口座番号は7桁の数字で入力してください'),
  holder: z.string().trim().regex(kanaRe, '口座名義は全角カタカナで入力してください'),
});

export async function saveBank(ctx: Ctx, input: z.infer<typeof BankInput>) {
  const actor = requireActor(ctx);
  const db = await getDb();
  await db.tx(async q => {
    const u = await lockUser(q, actor.id);
    const norm = (s: string) => s.replace(/[\s　]/g, '');
    if (norm(input.holder) !== norm(u.kana)) fail('口座名義は登録氏名（カナ）と同一の本人名義のみ登録できます');
    await q.query(
      `INSERT INTO bank_accounts (user_id, bank_name, branch, account_type, account_number, holder) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (user_id) DO UPDATE SET bank_name = $2, branch = $3, account_type = $4, account_number = $5, holder = $6, updated_at = now()`,
      [u.id, input.bankName, input.branch, input.type, input.number, input.holder]);
    await notify(q, { userId: u.id }, 'bank_update', '振込先口座が変更されました', `${u.name} 様\n\n売上の振込先口座が登録・変更されました（${input.bankName} ****${input.number.slice(-3)}）。\nお心当たりがない場合は至急お問い合わせください。`);
    await audit(q, ctx, 'user.bank_update', u.id, `${input.bankName} ****${input.number.slice(-3)}`);
  });
}

export async function markMailRead(ctx: Ctx, mailId: string) {
  const actor = requireActor(ctx);
  const db = await getDb();
  await db.query('UPDATE emails SET read_at = now() WHERE id = $1 AND user_id = $2 AND read_at IS NULL', [mailId, actor.id]);
}
