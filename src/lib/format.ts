export const yen = (n: number | null | undefined) => (n == null ? '—' : `¥${Math.round(n).toLocaleString('ja-JP')}`);
export const signedYen = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}¥${Math.abs(n).toLocaleString('ja-JP')}`;
export const pct = (x10: number) => `${(x10 / 10).toFixed(1)}%`;

const dtf = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const dtfs = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
export const fmtDate = (d: Date | string | null | undefined) => (d ? dtf.format(new Date(d)) : '—');
export const fmtShort = (d: Date | string | null | undefined) => (d ? dtfs.format(new Date(d)) : '—');

export const maskCode = (head: string, tail: string) => `${head} •••• •••• ${tail}`;
export const alias = (name: string) => `${name.slice(0, 1)}**さん`;
export function uaShort(ua: string) {
  if (!ua || ua === 'system' || ua === 'seed') return ua || '—';
  const b = (ua.match(/(Edg|Chrome|Firefox|Version)\/(\d+)/) ?? [])[0]?.replace('Version', 'Safari').replace('/', ' ') ?? 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS/.test(ua) ? 'macOS' : 'Other';
  return `${b} / ${os}`;
}

export const LABEL = {
  kyc: { none: '未提出', pending: '審査中', approved: '承認済', rejected: '差戻し' },
  seller: { none: '未申請', pending: '審査中', approved: '承認済', rejected: '否認' },
  user: { active: '通常', warned: '警告', restricted: '利用制限', frozen: '凍結', expelled: '強制退会' },
  listing: { checking: '残高確認待ち', active: '出品中', sold: '売約済', rejected: '確認NG', withdrawn: '取下げ', cancelled: '取引中止' },
  trade: { awaiting: '受取確認待ち', completed: '取引完了', disputed: 'エラー申請中', cancelled: '取引中止' },
  charge: { pending: '着金確認待ち', approved: '反映済', rejected: '却下' },
  payout: { exported: 'CSV出力済・未払', paid: '支払済' },
  ledger: { charge: 'チャージ', purchase: '購入代金', refund: '返還', sale: '売上', payout: '支払済', adjust: '管理者調整' },
  mail: { queued: '送信待ち', sent: '送信済', logged: '記録のみ（SMTP未設定）', failed: '送信失敗' },
} as const;

export type Tone = 'green' | 'amber' | 'red' | 'slate' | 'blue' | 'violet';
const TONES: Record<string, Tone> = {
  approved: 'green', active: 'green', completed: 'green', paid: 'green', sent: 'green',
  pending: 'amber', checking: 'amber', awaiting: 'blue', warned: 'amber', exported: 'violet', queued: 'amber', logged: 'slate',
  rejected: 'red', disputed: 'red', frozen: 'red', expelled: 'red', cancelled: 'red', restricted: 'red', failed: 'red',
};
export const toneOf = (k: string): Tone => TONES[k] ?? 'slate';
