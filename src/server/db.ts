import fs from 'node:fs';
import path from 'node:path';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Row = Record<string, any>;
export interface Queryable {
  query<T = Row>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}
export interface Database extends Queryable {
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
  kind: 'pglite' | 'postgres';
}

/** Embedded Postgres (WASM) for development and tests. `dataDir` undefined = in-memory. */
export async function createPglite(dataDir?: string): Promise<Database> {
  const { PGlite } = await import('@electric-sql/pglite');
  if (dataDir) fs.mkdirSync(dataDir, { recursive: true });
  const pg = dataDir ? new PGlite(dataDir) : new PGlite();
  await pg.waitReady;
  const wrap = (t: { query: (s: string, p?: any[]) => Promise<any> }): Queryable => ({
    query: (text, params) => t.query(text, params as any[]),
  });
  return {
    kind: 'pglite',
    ...wrap(pg),
    // PGlite runs transactions exclusively (single connection + internal mutex).
    tx: fn => pg.transaction(t => fn(wrap(t))),
    exec: async sql => { await pg.exec(sql); },
    close: () => pg.close(),
  };
}

export async function createPostgres(url: string): Promise<Database> {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: url, max: Number(process.env.PG_POOL_MAX ?? 10) });
  return {
    kind: 'postgres',
    query: (text, params) => pool.query(text, params as any[]) as any,
    async tx(fn) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const r = await fn({ query: (text, params) => c.query(text, params as any[]) as any });
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

export async function migrate(db: Database, dir = path.join(process.cwd(), 'db', 'migrations')) {
  await db.exec('CREATE TABLE IF NOT EXISTS _migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const { rows } = await db.query<{ name: string }>('SELECT name FROM _migrations');
  const done = new Set(rows.map(r => r.name));
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    await db.exec(`BEGIN;\n${sql}\n;INSERT INTO _migrations (name) VALUES ('${file}');\nCOMMIT;`);
  }
}

const g = globalThis as unknown as { __trade7db?: Promise<Database> };

async function init(): Promise<Database> {
  const url = process.env.DATABASE_URL;
  const db = url ? await createPostgres(url) : await createPglite(process.env.PGLITE_DIR ?? path.join(process.cwd(), '.data', 'pglite'));
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
