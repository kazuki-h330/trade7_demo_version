import fs from 'node:fs';
import path from 'node:path';
import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';

export const sha256 = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');

/* ---------- master key (kept outside the database) ---------- */
let cachedKey: Buffer | null = null;
function masterKey(): Buffer {
  if (cachedKey) return cachedKey;
  const env = process.env.CODE_ENCRYPTION_KEY;
  if (env) {
    const k = Buffer.from(env, 'base64');
    if (k.length !== 32) throw new Error('CODE_ENCRYPTION_KEY must be 32 bytes (base64)');
    return (cachedKey = k);
  }
  if (process.env.NODE_ENV === 'production') throw new Error('CODE_ENCRYPTION_KEY is required in production');
  const file = path.join(process.cwd(), '.data', 'dev-code.key');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, randomBytes(32).toString('base64'), { mode: 0o600 });
  return (cachedKey = Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'base64'));
}
const KEY_VERSION = 1;
const AAD = Buffer.from('trade7:giftcode:v1');

export function normalizeCode(raw: string) {
  return raw.normalize('NFKC').toUpperCase().replace(/[\s\-‐－]/g, '');
}
export const spacedCode = (c: string) => normalizeCode(c).replace(/(.{4})(?=.)/g, '$1 ');

export function encryptCode(code: string) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', masterKey(), iv);
  c.setAAD(AAD);
  const ct = Buffer.concat([c.update(normalizeCode(code), 'utf8'), c.final()]);
  return { ct: ct.toString('base64'), iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), keyVersion: KEY_VERSION };
}

export function decryptCode(enc: { ct: string; iv: string; tag: string; keyVersion: number }) {
  if (enc.keyVersion !== KEY_VERSION) throw new Error(`unknown key version ${enc.keyVersion}`);
  const d = createDecipheriv('aes-256-gcm', masterKey(), Buffer.from(enc.iv, 'base64'));
  d.setAAD(AAD);
  d.setAuthTag(Buffer.from(enc.tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(enc.ct, 'base64')), d.final()]).toString('utf8');
}

/** Keyed fingerprint so duplicates can be detected without storing the code in a reversible form. */
export function codeFingerprint(code: string) {
  const pepper = process.env.CODE_HASH_PEPPER
    ? Buffer.from(process.env.CODE_HASH_PEPPER, 'base64')
    : Buffer.from(hkdfSync('sha256', masterKey(), Buffer.alloc(0), 'trade7:code-fingerprint', 32));
  return createHmac('sha256', pepper).update(normalizeCode(code)).digest('hex');
}

/* ---------- passwords & one-time codes ---------- */
export const hashPassword = (pw: string) => bcrypt.hash(pw, 11);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);
export const sixDigitCode = () => String(randomInt(100000, 1000000));
export function safeEqualHex(a: string, b: string) {
  const x = Buffer.from(a, 'hex'), y = Buffer.from(b, 'hex');
  return x.length === y.length && timingSafeEqual(x, y);
}
export const randomToken = () => randomBytes(32).toString('base64url');
