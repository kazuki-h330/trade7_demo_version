import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { fail, newId } from './core';
import { sha256 } from './crypto';
import type { Queryable } from './db';

const MAX_BYTES = 5 * 1024 * 1024;
const root = () => path.resolve(process.env.STORAGE_DIR ?? path.join(process.cwd(), 'storage'));

export type PreparedImage = { buf: Buffer; sha: string };

/**
 * Decode and re-encode an uploaded image. Re-encoding rejects non-images (whatever the
 * declared MIME type), normalises orientation and strips EXIF/GPS metadata.
 */
export async function prepareImage(file: File | null | undefined): Promise<PreparedImage | null> {
  if (!file || typeof file === 'string' || file.size === 0) return null;
  if (file.size > MAX_BYTES) fail('画像は 5MB までです');
  if (!/^image\/(png|jpeg|webp|heic|heif)$/.test(file.type)) fail('画像は PNG / JPEG / WebP 形式でアップロードしてください');
  let buf: Buffer;
  try {
    buf = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
  } catch {
    return fail('画像を読み込めませんでした（破損しているか、対応していない形式です）');
  }
  return { buf, sha: sha256(buf) };
}

export async function storeImage(q: Queryable, img: PreparedImage, ownerId: string, kind: 'kyc' | 'screenshot', tradeId?: string) {
  const id = newId('FILE');
  const d = new Date();
  const rel = path.join(kind, `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`, `${id}.jpg`);
  await fs.mkdir(path.join(root(), path.dirname(rel)), { recursive: true });
  await fs.writeFile(path.join(root(), rel), img.buf, { mode: 0o600 });
  await q.query('INSERT INTO files (id, owner_id, kind, trade_id, path, mime, size, sha256) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    [id, ownerId, kind, tradeId ?? null, rel, 'image/jpeg', img.buf.length, img.sha]);
  return id;
}

export async function readStored(rel: string) {
  const full = path.resolve(root(), rel);
  if (!full.startsWith(root())) fail('invalid path');
  return fs.readFile(full);
}
