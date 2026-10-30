import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { verifyAuditChain } from '@/server/audit';
import { actorOf, type Ctx, type UserRow } from '@/server/core';
import { createPglite, migrate, setDb, type Database } from '@/server/db';
import { ruleCheck } from '@/server/moderation';
import { randomGiftCode, seed } from '@/server/seed';
import { sha256 } from '@/server/crypto';
import { login, requestPasswordReset, resetPassword } from '@/server/services/accounts';
import { createListing, recordBalanceCheck } from '@/server/services/listings';
import { createPayoutBatch, markPayoutPaid, requestCharge, reviewCharge, sanctionUser } from '@/server/services/money';
import { autoConfirmDue, confirmTrade, openDispute, postDisputeMessage, purchase, resolveDispute, revealCode } from '@/server/services/trades';

let db: Database;
const ctxFor = async (email: string): Promise<Ctx> => {
  const { rows } = await db.query<UserRow>('SELECT * FROM users WHERE email = $1', [email]);
  return { actor: actorOf(rows[0]), ip: '198.51.100.7', ua: 'vitest' };
};
const user = async (email: string) => (await db.query<UserRow>('SELECT * FROM users WHERE email = $1', [email])).rows[0];
const activeListing = async () => (await db.query<{ id: string; version: number; price: number }>("SELECT id, version, price FROM listings WHERE status = 'active' ORDER BY face LIMIT 1")).rows[0];

beforeAll(async () => {
  process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 't7-'));
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
    const buyer = await ctxFor('buyer@trade7.example');
    const before = (await user('buyer@trade7.example')).charge_balance;
    const l = await activeListing();
    const id = await purchase(buyer, l.id, l.version);
    expect((await user('buyer@trade7.example')).charge_balance).toBe(before - l.price);
    expect(await revealCode(buyer, id)).toMatch(/^X[A-Z0-9]{15}$/);
    await expect(purchase(await ctxFor('buyer2@trade7.example'), l.id, l.version + 1)).rejects.toThrow(/既に購入/);
  });

  it('lets exactly one of two simultaneous buyers win', async () => {
    const l = await activeListing();
    const results = await Promise.allSettled([
      purchase(await ctxFor('buyer@trade7.example'), l.id, l.version),
      purchase(await ctxFor('buyer2@trade7.example'), l.id, l.version),
    ]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const { rows } = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM trades WHERE listing_id = $1', [l.id]);
    expect(rows[0].n).toBe(1);
  });

  it('rejects a stale price (version mismatch)', async () => {
    const l = await activeListing();
    await expect(purchase(await ctxFor('buyer@trade7.example'), l.id, l.version - 1)).rejects.toThrow(/変更されました/);
  });

  it('refuses when the balance is insufficient (CHECK constraint backs it up)', async () => {
    await expect(db.query("UPDATE users SET charge_balance = -1 WHERE email = 'buyer@trade7.example'")).rejects.toThrow();
  });
});

describe('dispute flow', () => {
  it('freezes funds, blocks contact exchange, refunds on cancel', async () => {
    const buyerCtx = await ctxFor('buyer2@trade7.example');
    const l = await activeListing();
    const tradeId = await purchase(buyerCtx, l.id, l.version);
    const balAfterBuy = (await user('buyer2@trade7.example')).charge_balance;
    const png = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#f0f' } }).png().toBuffer();
    await openDispute(buyerCtx, tradeId, '残高が表示額と異なる', '0円でした', [new File([new Uint8Array(png)], 's.png', { type: 'image/png' })]);

    expect((await postDisputeMessage(buyerCtx, tradeId, 'LINEで連絡ください')).status).toBe('blocked');
    expect((await postDisputeMessage(buyerCtx, tradeId, 'XAB1 C2D3 E4F5 G6H7')).status).toBe('blocked');
    expect((await postDisputeMessage(buyerCtx, tradeId, '直接やり取りしたいので連絡先ください')).status).toBe('blocked');
    expect((await user('buyer2@trade7.example')).status).toBe('warned'); // auto-warning after 3 blocks
    expect((await postDisputeMessage(buyerCtx, tradeId, '残高照会で0円と表示されました')).status).toBe('posted');

    // completed trades never auto-confirm while disputed
    await db.query("UPDATE trades SET deadline = now() - interval '1 minute' WHERE id = $1", [tradeId]);
    await autoConfirmDue();
    expect((await db.query<{ status: string }>('SELECT status FROM trades WHERE id = $1', [tradeId])).rows[0].status).toBe('disputed');

    await resolveDispute(await ctxFor('admin@trade7.example'), tradeId, 'cancel', '売り手過失');
    expect((await user('buyer2@trade7.example')).charge_balance).toBe(balAfterBuy + l.price);
  });
});

describe('listing, charge, auto-confirm, payout', () => {
  it('rejects duplicate gift codes', async () => {
    const seller = await ctxFor('seller@trade7.example');
    const code = randomGiftCode();
    await createListing(seller, { face: 10000, rateX10: 880, code });
    await expect(createListing(seller, { face: 10000, rateX10: 880, code: code.toLowerCase().replace(/(.{4})/g, '$1 ') })).rejects.toThrow(/既に出品/);
    expect((await user('seller@trade7.example')).flag_dup).toBe(1);
  });

  it('forces NG when the confirmed balance is below face value', async () => {
    const { rows } = await db.query<{ id: string }>("SELECT id FROM listings WHERE status = 'checking' LIMIT 1");
    const r = await recordBalanceCheck(await ctxFor('admin@trade7.example'), rows[0].id, { result: 'ok', balance: 10, method: 'Apple公式サイトで残高照会', note: '' });
    expect(r.forced).toBe(true);
  });

  it('charges, auto-confirms after the deadline and pays out', async () => {
    const admin = await ctxFor('admin@trade7.example');
    const buyer = await ctxFor('buyer@trade7.example');
    const chargeId = await requestCharge(buyer, 5000, 'サトウ ハナコ');
    await reviewCharge(admin, chargeId, 'approved', { received: 5000, note: '' });
    const l = await activeListing();
    const tradeId = await purchase(buyer, l.id, l.version);
    await db.query("UPDATE trades SET deadline = now() - interval '1 second' WHERE id = $1", [tradeId]);
    expect(await autoConfirmDue()).toBeGreaterThanOrEqual(1);
    await expect(confirmTrade(buyer, tradeId)).rejects.toThrow();
    const payoutId = await createPayoutBatch(admin);
    await markPayoutPaid(admin, payoutId);
    expect((await user('seller@trade7.example')).sales_balance).toBe(0);
  });

  it('excludes frozen sellers from payouts', async () => {
    const admin = await ctxFor('admin@trade7.example');
    const seller = await user('seller@trade7.example');
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

describe('password reset', () => {
  it('resets with a one-time link and signs out all sessions', async () => {
    const ctx: Ctx = { actor: null, ip: '198.51.100.9', ua: 'vitest' };
    await requestPasswordReset(ctx, 'new@trade7.example');
    await requestPasswordReset(ctx, 'nobody@example.com'); // unknown email: silently ignored
    await expect(login(ctx, 'nobody@example.com', 'whatever1')).rejects.toThrow(/パスワードが違います/);
    const { rows } = await db.query<{ body: string }>("SELECT body FROM emails WHERE event = 'password_reset' ORDER BY created_at DESC LIMIT 1");
    const token = rows[0].body.match(/token=([\w-]+)/)![1];
    const { token: session } = await login(ctx, 'new@trade7.example', 'demo1234');
    await resetPassword(ctx, token, 'brand-new-pass');
    await expect(resetPassword(ctx, token, 'again-again')).rejects.toThrow(/無効/);
    await expect(login(ctx, 'new@trade7.example', 'demo1234')).rejects.toThrow();
    expect((await login(ctx, 'new@trade7.example', 'brand-new-pass')).token).toBeTruthy();
    expect((await db.query('SELECT 1 FROM sessions WHERE id = $1', [sha256(session)])).rows).toHaveLength(0);
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
