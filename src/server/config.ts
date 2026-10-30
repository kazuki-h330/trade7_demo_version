import { dbMode } from './db';

/** Deployment problems that break or degrade the app, in plain language for whoever deploys it. */
export function configProblems() {
  const p: { level: 'error' | 'warn'; text: string }[] = [];
  if (process.env.NODE_ENV === 'production' && !process.env.CODE_ENCRYPTION_KEY) {
    p.push({ level: 'error', text: '環境変数 CODE_ENCRYPTION_KEY が未設定です（ギフトコードの暗号化に必須）。Vercel → Settings → Environment Variables で設定してください。' });
  }
  if (!dbMode().persistent) {
    p.push({ level: 'error', text: 'データベースが接続されていません。一時的なDBで動作しているため、データが消えたりログインが維持されなかったりします。Vercel → Storage から Postgres（Neon）を接続してください。' });
  }
  return p;
}
