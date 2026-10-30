/* Deletes the local development database and uploaded files. Refuses to run against DATABASE_URL. */
import fs from 'node:fs';
import path from 'node:path';

if (process.env.DATABASE_URL) {
  console.error('DATABASE_URL is set — refusing to reset. This script only clears the local PGlite dev database.');
  process.exit(1);
}
for (const p of ['.data', 'storage']) {
  fs.rmSync(path.resolve(p), { recursive: true, force: true });
  console.log('removed', p);
}
console.log('Done. The database is recreated (and seeded when AUTO_SEED=true) on the next start.');
