import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ActionForm, SubmitButton } from '@/components/client';
import { Field, Notice } from '@/components/ui';
import { loginAction } from '@/server/actions/auth';
import { getCurrentUser } from '@/server/auth';
import { configProblems } from '@/server/config';

export const metadata = { title: 'ログイン' };
export const dynamic = 'force-dynamic';

const DEMO = [
  ['admin', 'admin1234', '運営 管理者'],
  ['seller', 'demo1234', '売り手 田中'],
  ['buyer', 'demo1234', '買い手 佐藤'],
  ['buyer2', 'demo1234', '買い手 鈴木'],
  ['new', 'demo1234', '新規 高橋'],
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const u = await getCurrentUser().catch(e => { console.error('[login]', e); return null; }); // still render the setup banner if the DB is down
  if (u) redirect(u.role === 'admin' ? '/admin' : '/market');
  const { next = '' } = await searchParams;
  const showDemo = process.env.AUTO_SEED === 'true';
  return (
    <div>
      <h1 className="text-3xl font-extrabold">おかえりなさい</h1>
      <p className="mt-1 text-sm text-slate-500">ログインIDとパスワードを入力してください</p>
      {configProblems().map(p => <div key={p.text} className="mt-6"><Notice tone="red"><b>設定エラー：</b>{p.text}</Notice></div>)}
      <ActionForm action={loginAction} reset={false} hidden={{ next }} className="mt-8 space-y-4">
        <Field label="ログインID"><input name="loginId" required autoComplete="username" autoCapitalize="none" spellCheck={false} className="input mono" /></Field>
        <Field label="パスワード" hint={<Link href="/forgot-password" className="text-violet-700 hover:underline">パスワードをお忘れの方</Link>}><input name="password" type="password" required autoComplete="current-password" className="input" /></Field>
        <SubmitButton className="btn-primary w-full py-3">ログイン</SubmitButton>
      </ActionForm>
      <p className="mt-6 text-center text-sm text-slate-500">アカウントをお持ちでない方は <Link href="/register" className="font-semibold text-violet-700 hover:underline">新規会員登録</Link></p>
      {showDemo && (
        <div className="card mt-8 p-4">
          <div className="mb-2 text-xs font-bold text-amber-600">デモ環境のみ表示 — テストアカウント</div>
          <div className="grid gap-1.5">
            {DEMO.map(([loginId, pw, label]) => (
              <ActionForm key={loginId} action={loginAction} reset={false} hidden={{ loginId, password: pw, next }}>
                <SubmitButton className="btn-secondary btn-sm w-full justify-between"><span>{label}</span><span className="mono text-slate-400">{loginId} / {pw}</span></SubmitButton>
              </ActionForm>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
