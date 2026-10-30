import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { verifyAuditChain } from '@/server/audit';
import { actorOf, type Ctx, type UserRow } from '@/server/core';
import { createPglite, migrate, setDb, type Database } from '@/server/db';
import { ruleCheck } from '@/server/moderation';
import { randomGiftCode, seed } from '@/server/seed';
import { sha256 } from '@/server/crypto';
import { adminResetPassword, changePassword, login, register, RegisterInput } from '@/server/services/accounts';
import { createListing, recordBalanceCheck } from '@/server/services/listings';
import { createPayoutBatch, markPayoutPaid, requestCharge, reviewCharge, sanctionUser } from '@/server/services/money';
import { autoConfirmDue, confirmTrade, openDispute, postDisputeMessage, purchase, resolveDispute, revealCode } from '@/server/services/trades';

let db: Database;
const ctxFor = async (loginId: string): Promise<Ctx> => {
  const { rows } = await db.query<UserRow>('SELECT * FROM users WHERE login_id = $1', [loginId]);
  return { actor: actorOf(rows[0]), ip: '198.51.100.7', ua: 'vitest' };
};
const user = async (loginId: string) => (await db.query<UserRow>('SELECT * FROM users WHERE login_id = $1', [loginId])).rows[0];
const activeListing = async () => (await db.query<{ id: string; version: number; price: number }>("SELECT id, version, price FROM listings WHERE status = 'active' ORDER BY face LIMIT 1")).rows[0];

beforeAll(async () => {
  process.env.CODE_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  process.env.GEMINI_API_KEY = '';
  db = await createPglite();
  await migrate(db);
  setDb(db);
  await seed(db);
});
afterAll(async () => { await db.close(); });

describe('purchase', () => {
  it('debits the buyer and locks the listing', async () => {
    const buyer = await ctxFor('buyer');
    const before = (await user('buyer')).charge_balance;
    const l = await activeListing();
    const id = await purchase(buyer, l.id, l.version);
    expect((await user('buyer')).charge_balance).toBe(before - l.price);
    expect(await revealCode(buyer, id)).toMatch(/^X[A-Z0-9]{15}$/);
    await expect(purchase(await ctxFor('buyer2'), l.id, l.version + 1)).rejects.toThrow(/既に購入/);
  });

  it('lets exactly one of two simultaneous buyers win', async () => {
    const l = await activeListing();
    const results = await Promise.allSettled([
      purchase(await ctxFor('buyer'), l.id, l.version),
      purchase(await ctxFor('buyer2'), l.id, l.version),
    ]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const { rows } = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM trades WHERE listing_id = $1', [l.id]);
    expect(rows[0].n).toBe(1);
  });

  it('rejects a stale price (version mismatch)', async () => {
    const l = await activeListing();
    await expect(purchase(await ctxFor('buyer'), l.id, l.version - 1)).rejects.toThrow(/変更されました/);
  });

  it('refuses when the balance is insufficient (CHECK constraint backs it up)', async () => {
    await expect(db.query("UPDATE users SET charge_balance = -1 WHERE login_id = 'buyer'")).rejects.toThrow();
  });
});

describe('dispute flow', () => {
  it('freezes funds, blocks contact exchange, refunds on cancel', async () => {
    const buyerCtx = await ctxFor('buyer2');
    const l = await activeListing();
    const tradeId = await purchase(buyerCtx, l.id, l.version);
    const balAfterBuy = (await user('buyer2')).charge_balance;
    const png = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#f0f' } }).png().toBuffer();
    await openDispute(buyerCtx, tradeId, '残高が表示額と異なる', '0円でした', [new File([new Uint8Array(png)], 's.png', { type: 'image/png' })]);

    expect((await postDisputeMessage(buyerCtx, tradeId, 'LINEで連絡ください')).status).toBe('blocked');
    expect((await postDisputeMessage(buyerCtx, tradeId, 'XAB1 C2D3 E4F5 G6H7')).status).toBe('blocked');
    expect((await postDisputeMessage(buyerCtx, tradeId, '直接やり取りしたいので連絡先ください')).status).toBe('blocked');
    expect((await user('buyer2')).status).toBe('warned'); // auto-warning after 3 blocks
    expect((await postDisputeMessage(buyerCtx, tradeId, '残高照会で0円と表示されました')).status).toBe('posted');
    const { rows: shots } = await db.query<{ data: Uint8Array }>("SELECT data FROM files WHERE trade_id = $1 AND kind = 'screenshot'", [tradeId]);
    expect(shots).toHaveLength(1);
    expect((await sharp(Buffer.from(shots[0].data)).metadata()).format).toBe('jpeg'); // stored in the DB, re-encoded

    // completed trades never auto-confirm while disputed
    await db.query("UPDATE trades SET deadline = now() - interval '1 minute' WHERE id = $1", [tradeId]);
    await autoConfirmDue();
    expect((await db.query<{ status: string }>('SELECT status FROM trades WHERE id = $1', [tradeId])).rows[0].status).toBe('disputed');

    await resolveDispute(await ctxFor('admin'), tradeId, 'cancel', '売り手過失');
    expect((await user('buyer2')).charge_balance).toBe(balAfterBuy + l.price);
  });
});

describe('listing, charge, auto-confirm, payout', () => {
  it('rejects duplicate gift codes', async () => {
    const seller = await ctxFor('seller');
    const code = randomGiftCode();
    await createListing(seller, { face: 10000, rateX10: 880, code });
    await expect(createListing(seller, { face: 10000, rateX10: 880, code: code.toLowerCase().replace(/(.{4})/g, '$1 ') })).rejects.toThrow(/既に出品/);
    expect((await user('seller')).flag_dup).toBe(1);
  });

  it('forces NG when the confirmed balance is below face value', async () => {
    const { rows } = await db.query<{ id: string }>("SELECT id FROM listings WHERE status = 'checking' LIMIT 1");
    const r = await recordBalanceCheck(await ctxFor('admin'), rows[0].id, { result: 'ok', balance: 10, method: 'Apple公式サイトで残高照会', note: '' });
    expect(r.forced).toBe(true);
  });

  it('charges, auto-confirms after the deadline and pays out', async () => {
    const admin = await ctxFor('admin');
    const buyer = await ctxFor('buyer');
    const chargeId = await requestCharge(buyer, 5000, 'サトウ ハナコ');
    await reviewCharge(admin, chargeId, 'approved', { received: 5000, note: '' });
    const l = await activeListing();
    const tradeId = await purchase(buyer, l.id, l.version);
    await db.query("UPDATE trades SET deadline = now() - interval '1 second' WHERE id = $1", [tradeId]);
    expect(await autoConfirmDue()).toBeGreaterThanOrEqual(1);
    await expect(confirmTrade(buyer, tradeId)).rejects.toThrow();
    const payoutId = await createPayoutBatch(admin);
    await markPayoutPaid(admin, payoutId);
    expect((await user('seller')).sales_balance).toBe(0);
  });

  it('excludes frozen sellers from payouts', async () => {
    const admin = await ctxFor('admin');
    const seller = await user('seller');
    await sanctionUser(admin, seller.id, 'frozen', 'test');
    const { rows } = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM listings WHERE seller_id = $1 AND status = 'active'", [seller.id]);
    expect(rows[0].n).toBe(0);
  });
});

describe('audit log', () => {
  it('has an intact hash chain', async () => {
    const r = await verifyAuditChain(db);
    expect(r.ok).toBe(true);
    expect(r.count).toBeGreaterThan(20);
  });
  it('is append-only at the database level', async () => {
    await expect(db.query("UPDATE audit_logs SET detail = 'tampered' WHERE seq = 1")).rejects.toThrow(/append-only/);
    await expect(db.query('DELETE FROM audit_logs WHERE seq = 1')).rejects.toThrow(/append-only/);
  });
});

describe('login ID accounts', () => {
  const ctx: Ctx = { actor: null, ip: '198.51.100.9', ua: 'vitest' };

  it('registers with a login ID and rejects email-style or duplicate IDs', async () => {
    expect(() => RegisterInput.parse({ name: '山田 太郎', kana: 'ヤマダ タロウ', loginId: 'taro@example.com', password: 'password1' })).toThrow(/メールアドレス/);
    expect(() => RegisterInput.parse({ name: '山田 太郎', kana: 'ヤマダ タロウ', loginId: 'ab', password: 'password1' })).toThrow(/ログインID/);
    const input = RegisterInput.parse({ name: '山田 太郎', kana: 'ヤマダ タロウ', loginId: ' Yamada_Taro ', password: 'password1' });
    expect(input.loginId).toBe('yamada_taro'); // normalised
    await register(ctx, input);
    await expect(register(ctx, input)).rejects.toThrow(/既に使われています/);
    expect((await login(ctx, 'YAMADA_TARO', 'password1')).user.login_id).toBe('yamada_taro');
    await expect(login(ctx, 'nobody', 'whatever1')).rejects.toThrow(/ログインIDまたはパスワードが違います/);
    // KYC no longer waits for email verification
    expect((await user('yamada_taro')).kyc_status).toBe('none');
  });

  it('changes own password and signs out other sessions', async () => {
    const a = await login(ctx, 'new', 'demo1234');
    const b = await login(ctx, 'new', 'demo1234');
    const me = await ctxFor('new');
    await expect(changePassword(me, 'wrong-pass', 'brand-new-pass', a.token)).rejects.toThrow(/現在のパスワード/);
    await changePassword(me, 'demo1234', 'brand-new-pass', a.token);
    expect((await db.query('SELECT 1 FROM sessions WHERE id = $1', [sha256(a.token)])).rows).toHaveLength(1);
    expect((await db.query('SELECT 1 FROM sessions WHERE id = $1', [sha256(b.token)])).rows).toHaveLength(0);
    await expect(login(ctx, 'new', 'demo1234')).rejects.toThrow();
  });

  it('admin issues a temporary password that must be changed', async () => {
    const admin = await ctxFor('admin');
    const target = await user('new');
    await expect(adminResetPassword(await ctxFor('buyer'), target.id)).rejects.toThrow(/管理者権限/);
    const temp = await adminResetPassword(admin, target.id);
    expect(temp).toMatch(/^[a-z2-9]{10}$/);
    expect((await db.query<{ n: number }>('SELECT count(*)::int AS n FROM sessions WHERE user_id = $1', [target.id])).rows[0].n).toBe(0);
    const { token, user: u } = await login(ctx, 'new', temp);
    expect(u.must_change_password).toBe(true);
    await changePassword(await ctxFor('new'), temp, 'my-own-pass', token);
    expect((await user('new')).must_change_password).toBe(false);
  });
});


describe('moderation rules', () => {
  it.each([
    ['ＬＩＮＥ交換しませんか', true],
    ['090-1234-5678 に電話して', true],
    ['abc@example.com', true],
    ['ｘａｂ１ｃ２ｄ３ｅ４ｆ５ｇ６ｈ７', true],
    ['残高が0円でした。スクショを添付します', false],
  ])('%s → blocked=%s', (text, blocked) => {
    expect(ruleCheck(text).length > 0).toBe(blocked);
  });
});

describe('migration 004 (email → login ID)', () => {
  it('converts existing email accounts to valid, unique login IDs', async () => {
    const { MIGRATIONS } = await import('@/server/migrations');
    const old = await createPglite();
    for (const m of MIGRATIONS.slice(0, 3)) await old.exec(m.sql);
    const ins = (id: string, email: string) => old.query("INSERT INTO users (id, email, password_hash, name, kana) VALUES ($1,$2,'x','n','ナ')", [id, email]);
    await ins('USR-AAAA', 'admin@trade7.example');
    await ins('USR-BBBB', 'Taro.Yamada+test@gmail.com');
    await ins('USR-CCCC', 'admin@other.example'); // same local part
    await ins('USR-DDDD', 'x@y.jp');              // too short
    await old.exec(MIGRATIONS[3].sql);
    const { rows } = await old.query<{ id: string; login_id: string }>('SELECT id, login_id FROM users ORDER BY id');
    expect(rows.map(r => r.login_id)).toEqual(['admin', 'taro_yamada_test', 'admin-cccc', 'x_dddd']);
    await old.close();
  });
});
