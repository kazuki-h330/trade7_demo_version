import { randomBytes } from 'node:crypto';

export class AppError extends Error {}
export const fail = (message: string): never => { throw new AppError(message); };

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export function newId(prefix: string) {
  let s = '';
  for (const b of randomBytes(10)) s += ALPHABET[b & 31];
  return `${prefix}-${s}`;
}

export type Role = 'member' | 'admin';
export type Actor = { id: string; name: string; role: Role } | null;
/** Who is acting and from where — passed to every service so the audit log can record it. */
export type Ctx = { actor: Actor; ip: string; ua: string };
export const systemCtx: Ctx = { actor: null, ip: '-', ua: 'system' };

export type UserStatus = 'active' | 'warned' | 'restricted' | 'frozen' | 'expelled';
export interface UserRow {
  id: string;
  login_id: string;
  must_change_password: boolean;
  password_hash: string;
  name: string;
  kana: string;
  role: Role;
  status: UserStatus;
  kyc_status: 'none' | 'pending' | 'approved' | 'rejected';
  seller_status: 'none' | 'pending' | 'approved' | 'rejected';
  seller_applied_at: Date | null;
  seller_note: string | null;
  charge_balance: number;
  sales_balance: number;
  flag_invalid: number;
  flag_dup: number;
  flag_blocked: number;
  created_at: Date;
}

export const actorOf = (u: UserRow): Actor => ({ id: u.id, name: u.name, role: u.role });

export function tradeBlockReason(u: UserRow): string | null {
  if (u.kyc_status !== 'approved') return '本人確認が完了するまで売買・チャージはご利用いただけません';
  if (u.status === 'restricted') return 'アカウントが利用制限中のため、この操作はできません';
  if (u.status === 'frozen') return 'アカウントが凍結中のため、この操作はできません';
  if (u.status === 'expelled') return 'このアカウントは利用できません';
  return null;
}
export function sellBlockReason(u: UserRow): string | null {
  return tradeBlockReason(u) ?? (u.seller_status !== 'approved' ? '出品者審査が完了していません' : null);
}

export const calcPrice = (face: number, rateX10: number) => Math.floor((face * rateX10) / 1000);
export const calcFee = (price: number, feeBps: number) => Math.round((price * feeBps) / 10000);
