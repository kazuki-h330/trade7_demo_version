/* Read models for pages. All writes go through services/. */
import type { UserRow } from './core';
import { getDb } from './db';

/* eslint-disable @typescript-eslint/no-explicit-any */
const q = async <T = any>(text: string, params: unknown[] = []) => (await (await getDb()).query<T>(text, params)).rows;
const one = async <T = any>(text: string, params: unknown[] = []) => (await q<T>(text, params))[0] as T | undefined;

export type ListingView = { id: string; seller_id: string; seller_name: string; face: number; rate_x10: number; price: number; code_head: string; code_tail: string; status: string; version: number; created_at: Date; check_result: string | null; check_balance: number | null; check_method: string | null; check_note: string | null; check_at: Date | null; staff_name: string | null };
const LISTING_COLS = `l.id, l.seller_id, s.name AS seller_name, l.face, l.rate_x10, l.price, l.code_head, l.code_tail, l.status, l.version, l.created_at,
  l.check_result, l.check_balance, l.check_method, l.check_note, l.check_at, st.name AS staff_name`;
const LISTING_FROM = 'FROM listings l JOIN users s ON s.id = l.seller_id LEFT JOIN users st ON st.id = l.check_staff_id';

export const marketListings = (face?: number) =>
  q<ListingView>(`SELECT ${LISTING_COLS} ${LISTING_FROM} WHERE l.status = 'active' ${face ? 'AND l.face = $1' : ''} ORDER BY l.rate_x10 ASC, l.created_at ASC`, face ? [face] : []);
export const myListings = (userId: string) => q<ListingView>(`SELECT ${LISTING_COLS} ${LISTING_FROM} WHERE l.seller_id = $1 ORDER BY l.created_at DESC`, [userId]);
export const listingsByStatus = (status?: string) =>
  q<ListingView>(`SELECT ${LISTING_COLS} ${LISTING_FROM} ${status ? 'WHERE l.status = $1' : ''} ORDER BY l.created_at DESC LIMIT 300`, status ? [status] : []);

export type TradeView = { id: string; listing_id: string; buyer_id: string; seller_id: string; buyer_name: string; seller_name: string; face: number; rate_x10: number; price: number; fee: number; seller_net: number; status: string; purchased_at: Date; deadline: Date; completed_at: Date | null; completed_by: string | null; payout_id: string | null; dispute_reason: string | null };
const TRADE_SELECT = `SELECT t.*, b.name AS buyer_name, s.name AS seller_name, d.reason AS dispute_reason
  FROM trades t JOIN users b ON b.id = t.buyer_id JOIN users s ON s.id = t.seller_id LEFT JOIN disputes d ON d.trade_id = t.id`;
export const myTrades = (userId: string) => q<TradeView>(`${TRADE_SELECT} WHERE t.buyer_id = $1 OR t.seller_id = $1 ORDER BY t.purchased_at DESC`, [userId]);
export const allTrades = (status?: string) => q<TradeView>(`${TRADE_SELECT} ${status ? 'WHERE t.status = $1' : ''} ORDER BY t.purchased_at DESC LIMIT 300`, status ? [status] : []);
export const disputedTrades = () => q<TradeView & { opened_at: Date; resolution: string | null; msgs: number; shots: number }>(
  `SELECT t.*, b.name AS buyer_name, s.name AS seller_name, d.reason AS dispute_reason, d.opened_at, d.resolution,
     (SELECT count(*)::int FROM dispute_messages m WHERE m.trade_id = t.id) AS msgs,
     (SELECT count(*)::int FROM files f WHERE f.trade_id = t.id) AS shots
   FROM trades t JOIN disputes d ON d.trade_id = t.id JOIN users b ON b.id = t.buyer_id JOIN users s ON s.id = t.seller_id
   ORDER BY (t.status = 'disputed') DESC, d.opened_at DESC`);

export async function tradeDetail(id: string) {
  const t = await one<TradeView>(`${TRADE_SELECT} WHERE t.id = $1`, [id]);
  if (!t) return null;
  const [listing, dispute, messages, files] = await Promise.all([
    one<ListingView>(`SELECT ${LISTING_COLS} ${LISTING_FROM} WHERE l.id = $1`, [t.listing_id]),
    one<{ reason: string; detail: string | null; opened_at: Date; resolution: string | null; resolved_at: Date | null }>('SELECT * FROM disputes WHERE trade_id = $1', [id]),
    q<{ id: string; user_id: string; name: string; role: string; body: string; flagged: boolean; created_at: Date }>(
      'SELECT m.*, u.name FROM dispute_messages m JOIN users u ON u.id = m.user_id WHERE m.trade_id = $1 ORDER BY m.created_at', [id]),
    q<{ id: string }>("SELECT id FROM files WHERE trade_id = $1 AND kind = 'screenshot' ORDER BY created_at", [id]),
  ]);
  return { t, listing: listing!, dispute, messages, files };
}

export const auditFor = (targets: string[]) => q<AuditView>('SELECT * FROM audit_logs WHERE target = ANY($1::text[]) ORDER BY seq DESC LIMIT 100', [targets]);
export type AuditView = { seq: number; at: Date; actor_id: string; actor_name: string; actor_role: string; action: string; target: string; detail: string; ip: string; ua: string; hash: string };
export function auditSearch(term: string, limit = 300) {
  return term
    ? q<AuditView>(`SELECT * FROM audit_logs WHERE actor_name ILIKE $1 OR action ILIKE $1 OR target ILIKE $1 OR detail ILIKE $1 OR ip ILIKE $1 ORDER BY seq DESC LIMIT ${limit}`, [`%${term}%`])
    : q<AuditView>(`SELECT * FROM audit_logs ORDER BY seq DESC LIMIT ${limit}`);
}

export type LedgerView = { id: number; user_id: string; user_name?: string; account: string; delta: number; balance_after: number; kind: string; ref: string; note: string; created_at: Date };
export const ledgerFor = (userId: string, account?: string) =>
  q<LedgerView>(`SELECT * FROM ledger WHERE user_id = $1 ${account ? 'AND account = $2' : ''} ORDER BY id DESC LIMIT 200`, account ? [userId, account] : [userId]);
export const ledgerRecent = () => q<LedgerView>('SELECT l.*, u.name AS user_name FROM ledger l JOIN users u ON u.id = l.user_id ORDER BY l.id DESC LIMIT 100');

export type ChargeView = { id: string; user_id: string; user_name: string; kana: string; amount: number; received: number | null; payer_name: string; status: string; created_at: Date; reviewed_at: Date | null; reviewer_name: string | null; note: string | null };
const CHARGE_SELECT = 'SELECT c.*, u.name AS user_name, u.kana, r.name AS reviewer_name FROM charges c JOIN users u ON u.id = c.user_id LEFT JOIN users r ON r.id = c.reviewer_id';
export const myCharges = (userId: string) => q<ChargeView>(`${CHARGE_SELECT} WHERE c.user_id = $1 ORDER BY c.created_at DESC`, [userId]);
export const chargesByStatus = (pending: boolean) => q<ChargeView>(`${CHARGE_SELECT} WHERE c.status ${pending ? "= 'pending'" : "<> 'pending'"} ORDER BY c.created_at ${pending ? 'ASC' : 'DESC'} LIMIT 200`);

export type BankView = { bank_name: string; branch: string; account_type: string; account_number: string; holder: string };
export const bankOf = (userId: string) => one<BankView>('SELECT * FROM bank_accounts WHERE user_id = $1', [userId]);
export const latestKyc = (userId: string) => one<{ id: string; doc_type: string; file_id: string; status: string; submitted_at: Date; reviewed_at: Date | null; note: string | null; reviewer_name: string | null }>(
  'SELECT k.*, r.name AS reviewer_name FROM kyc_submissions k LEFT JOIN users r ON r.id = k.reviewer_id WHERE k.user_id = $1 ORDER BY k.submitted_at DESC LIMIT 1', [userId]);
export const sanctionsOf = (userId: string) => q<{ level: string; reason: string; created_at: Date; by_name: string | null }>(
  'SELECT s.*, u.name AS by_name FROM sanctions s LEFT JOIN users u ON u.id = s.by_id WHERE s.user_id = $1 ORDER BY s.created_at DESC', [userId]);

export async function salesInfo(userId: string) {
  const [unpaid, pending, payouts] = await Promise.all([
    q<TradeView>(`${TRADE_SELECT} WHERE t.seller_id = $1 AND t.status = 'completed' AND t.payout_id IS NULL ORDER BY t.completed_at DESC`, [userId]),
    one<{ amount: number }>("SELECT coalesce(sum(seller_net),0)::int AS amount FROM trades WHERE seller_id = $1 AND status IN ('awaiting','disputed')", [userId]),
    q<{ id: string; status: string; created_at: Date; paid_at: Date | null; amount: number; trade_count: number }>(
      'SELECT p.id, p.status, p.created_at, p.paid_at, i.amount, i.trade_count FROM payout_items i JOIN payouts p ON p.id = i.payout_id WHERE i.seller_id = $1 ORDER BY p.created_at DESC', [userId]),
  ]);
  return { unpaid, pendingAmount: pending?.amount ?? 0, payouts };
}

export const inbox = (userId: string) => q<{ id: string; event: string; subject: string; body: string; created_at: Date; read_at: Date | null }>('SELECT * FROM emails WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200', [userId]);
export const unreadCount = async (userId: string) => (await one<{ n: number }>('SELECT count(*)::int AS n FROM emails WHERE user_id = $1 AND read_at IS NULL', [userId]))?.n ?? 0;
export const allEmails = () => q<{ id: string; to_addr: string; event: string; subject: string; body: string; status: string; error: string | null; created_at: Date }>('SELECT * FROM emails ORDER BY created_at DESC LIMIT 300');

/* ---------- admin ---------- */
export async function adminCounts() {
  return (await one<Record<string, number>>(`SELECT
    (SELECT count(*)::int FROM users WHERE kyc_status = 'pending') AS kyc,
    (SELECT count(*)::int FROM users WHERE seller_status = 'pending') AS sellers,
    (SELECT count(*)::int FROM listings WHERE status = 'checking') AS listings,
    (SELECT count(*)::int FROM trades WHERE status = 'disputed') AS disputes,
    (SELECT count(*)::int FROM charges WHERE status = 'pending') AS charges,
    (SELECT count(*)::int FROM detections WHERE reviewed_at IS NULL) AS detections`))!;
}

export async function dashboardStats() {
  return (await one<Record<string, number>>(`SELECT
    (SELECT count(*)::int FROM trades WHERE purchased_at >= date_trunc('day', now())) AS today_count,
    (SELECT coalesce(sum(price),0)::int FROM trades WHERE purchased_at >= date_trunc('day', now()) AND status <> 'cancelled') AS today_amount,
    (SELECT coalesce(sum(fee),0)::int FROM trades WHERE status = 'completed' AND completed_at >= date_trunc('month', now())) AS month_fee,
    (SELECT coalesce(sum(charge_balance),0)::int FROM users) AS charge_total,
    (SELECT coalesce(sum(seller_net),0)::int FROM trades WHERE status = 'completed' AND payout_id IS NULL) AS unpaid_total,
    (SELECT coalesce(sum(price),0)::int FROM trades WHERE status = 'disputed') AS disputed_total,
    (SELECT count(*)::int FROM users WHERE status = 'frozen') AS frozen_count,
    (SELECT coalesce(sum(charge_balance + sales_balance),0)::int FROM users WHERE status = 'frozen') AS frozen_amount,
    (SELECT count(*)::int FROM users WHERE role = 'member') AS members,
    (SELECT count(*)::int FROM listings WHERE status = 'active') AS active_listings`))!;
}

export const dailyVolume = () => q<{ day: string; count: number; amount: number }>(
  `SELECT to_char(d, 'MM/DD') AS day, count(t.id)::int AS count, coalesce(sum(t.price),0)::int AS amount
     FROM generate_series(date_trunc('day', now()) - interval '13 days', date_trunc('day', now()), interval '1 day') d
     LEFT JOIN trades t ON date_trunc('day', t.purchased_at) = d AND t.status <> 'cancelled'
    GROUP BY d ORDER BY d`);

export const pendingKyc = () => q<UserRow & { doc_type: string; file_id: string; submitted_at: Date }>(
  `SELECT u.*, k.doc_type, k.file_id, k.submitted_at FROM users u JOIN kyc_submissions k ON k.user_id = u.id AND k.status = 'pending' ORDER BY k.submitted_at`);
export const kycHistory = () => q<{ user_id: string; name: string; doc_type: string; status: string; reviewed_at: Date; reviewer_name: string | null; note: string | null }>(
  `SELECT k.user_id, u.name, k.doc_type, k.status, k.reviewed_at, r.name AS reviewer_name, k.note FROM kyc_submissions k JOIN users u ON u.id = k.user_id LEFT JOIN users r ON r.id = k.reviewer_id
   WHERE k.status <> 'pending' ORDER BY k.reviewed_at DESC NULLS LAST LIMIT 100`);
export const sellerApplicants = () => q<UserRow & { completed_buys: number; sanction_count: number }>(
  `SELECT u.*, (SELECT count(*)::int FROM trades t WHERE t.buyer_id = u.id AND t.status = 'completed') AS completed_buys,
     (SELECT count(*)::int FROM sanctions s WHERE s.user_id = u.id) AS sanction_count
   FROM users u WHERE u.seller_status <> 'none' ORDER BY (u.seller_status = 'pending') DESC, u.seller_applied_at DESC`);
export const members = () => q<UserRow & { disputed: number }>(
  `SELECT u.*, (SELECT coalesce(sum(t.price),0)::int FROM trades t WHERE t.status = 'disputed' AND (t.buyer_id = u.id OR t.seller_id = u.id)) AS disputed
   FROM users u WHERE u.role = 'member' ORDER BY u.created_at DESC`);
export const userById = (id: string) => one<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
export const payoutsList = () => q<{ id: string; status: string; created_at: Date; paid_at: Date | null; sellers: number; total: number }>(
  `SELECT p.*, count(i.seller_id)::int AS sellers, coalesce(sum(i.amount),0)::int AS total FROM payouts p LEFT JOIN payout_items i ON i.payout_id = p.id GROUP BY p.id ORDER BY p.created_at DESC`);
export const detections = () => q<{ id: string; trade_id: string; user_id: string; user_name: string; body: string; rule_hits: string[]; ai: { model: string; verdict: string; reasons: string[]; score: number; error?: string } | null; action: string; reviewed_at: Date | null; created_at: Date }>(
  'SELECT d.*, u.name AS user_name FROM detections d JOIN users u ON u.id = d.user_id ORDER BY d.created_at DESC LIMIT 300');
export const fileRow = (id: string) => one<{ id: string; owner_id: string; kind: string; trade_id: string | null; path: string; mime: string }>('SELECT * FROM files WHERE id = $1', [id]);
export const tradeParties = (id: string) => one<{ buyer_id: string; seller_id: string }>('SELECT buyer_id, seller_id FROM trades WHERE id = $1', [id]);
