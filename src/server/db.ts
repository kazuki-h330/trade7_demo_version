import fs from 'node:fs';
import path from 'node:path';
import { MIGRATIONS } from './migrations';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Row = Record<string, any>;
export interface Queryable {
  query<T = Row>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
  /** Multi-statement SQL without parameters (available inside transactions). */
  exec?(sql: string): Promise<void>;
}
export interface Database extends Queryable {
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
  kind: 'pglite' | 'postgres';
}

export const databaseUrl = () => process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
const onVercel = () => !!process.env.VERCEL;

/** How the app is storing data — surfaced on the login page and /api/health so misconfiguration is obvious. */
export function dbMode() {
  const url = databaseUrl();
  return { kind: url ? 'postgres' : 'pglite', persistent: !!url || !onVercel() } as const;
}

/** Embedded Postgres (WASM) for development and tests. `dataDir` undefined = in-memory. */
export async function createPglite(dataDir?: string): Promise<Database> {
  const { PGlite } = await import('@electric-sql/pglite');
  if (dataDir) fs.mkdirSync(dataDir, { recursive: true });
  const pg = dataDir ? new PGlite(dataDir) : new PGlite();
  await pg.waitReady;
  return {
    kind: 'pglite',
    query: (text, params) => pg.query(text, params as any[]) as any,
    // PGlite runs transactions exclusively (single connection + internal mutex).
    tx: fn => pg.transaction(t => fn({
      query: (text, params) => t.query(text, params as any[]) as any,
      exec: async sql => { await t.exec(sql); },
    })),
    exec: async sql => { await pg.exec(sql); },
    close: () => pg.close(),
  };
}

export async function createPostgres(url: string): Promise<Database> {
  const { Pool } = await import('pg');
  // Serverless hosts run many small instances: keep the per-instance pool small (use the provider's pooled URL).
  const pool = new Pool({ connectionString: url, max: Number(process.env.PG_POOL_MAX ?? (onVercel() ? 3 : 10)) });
  return {
    kind: 'postgres',
    query: (text, params) => pool.query(text, params as any[]) as any,
    async tx(fn) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const r = await fn({
          query: (text, params) => c.query(text, params as any[]) as any,
          exec: async sql => { await c.query(sql); },
        });
        await c.query('COMMIT');
        return r;
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      } finally {
        c.release();
      }
    },
    exec: async sql => { await pool.query(sql); },
    close: () => pool.end(),
  };
}

/** Applies pending migrations under an advisory lock, so concurrent cold starts cannot race. */
export async function migrate(db: Database) {
  await db.tx(async q => {
    await q.query('SELECT pg_advisory_xact_lock(9000)');
    await q.exec!('CREATE TABLE IF NOT EXISTS _migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const { rows } = await q.query<{ name: string }>('SELECT name FROM _migrations');
    const done = new Set(rows.map(r => r.name));
    for (const m of MIGRATIONS) {
      if (done.has(m.name)) continue;
      await q.exec!(m.sql);
      await q.query('INSERT INTO _migrations (name) VALUES ($1)', [m.name]);
    }
  });
}

const g = globalThis as unknown as { __trade7db?: Promise<Database> };

async function init(): Promise<Database> {
  const url = databaseUrl();
  let db: Database;
  if (url) db = await createPostgres(url);
  else {
    // Vercel's filesystem is read-only except /tmp. Without DATABASE_URL the data lives only as long as this instance.
    const dir = process.env.PGLITE_DIR ?? (onVercel() ? '/tmp/trade7-pglite' : path.join(process.cwd(), '.data', 'pglite'));
    if (onVercel()) console.warn('[trade7] DATABASE_URL is not set — using a temporary database. Connect Postgres (e.g. Neon) in Vercel → Storage.');
    db = await createPglite(dir);
  }
  await migrate(db);
  // Explicit opt-in only (dev / client-demo staging). Never set AUTO_SEED on the real production server.
  if (process.env.AUTO_SEED === 'true') {
    const { seedIfEmpty } = await import('./seed');
    await seedIfEmpty(db);
  }
  return db;
}

export function getDb(): Promise<Database> {
  return (g.__trade7db ??= init().catch(e => { g.__trade7db = undefined; throw e; }));
}

/** Tests inject their own (in-memory) database. */
export function setDb(db: Database) {
  g.__trade7db = Promise.resolve(db);
}
