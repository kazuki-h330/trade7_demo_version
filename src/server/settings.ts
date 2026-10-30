import type { Queryable } from './db';

export type Settings = {
  feeBps: number;          // seller fee in basis points (150 = 1.5%)
  confirmMinutes: number;  // buyer confirmation window
  chargeMin: number;
  chargeMax: number;
  faceMin: number;
  faceMax: number;
  rateMinX10: number;
  rateMaxX10: number;
  aiCheck: boolean;
  depositBank: { name: string; branch: string; type: string; number: string; holder: string };
};

export const DEFAULT_SETTINGS: Settings = {
  feeBps: 150,
  confirmMinutes: 30,
  chargeMin: 1000,
  chargeMax: 200000,
  faceMin: 1000,
  faceMax: 100000,
  rateMinX10: 700,
  rateMaxX10: 950,
  aiCheck: true,
  depositBank: { name: 'ゆうちょ銀行', branch: '〇一八（ゼロイチハチ）店', type: '普通', number: '1234567', holder: 'トレードセブン' },
};

export async function getSettings(q: Queryable): Promise<Settings> {
  const { rows } = await q.query<{ value: Partial<Settings> }>("SELECT value FROM settings WHERE key = 'app'");
  return { ...DEFAULT_SETTINGS, ...(rows[0]?.value ?? {}) };
}

export async function saveSettings(q: Queryable, s: Settings) {
  await q.query(
    "INSERT INTO settings (key, value, updated_at) VALUES ('app', $1, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()",
    [JSON.stringify(s)],
  );
}
