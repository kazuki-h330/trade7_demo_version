import Link from 'next/link';
import { ActionForm, SubmitButton } from '@/components/client';
import { Field, Notice } from '@/components/ui';
import { registerAction } from '@/server/actions/auth';
import { configProblems } from '@/server/config';
import { LOGIN_ID_RULE } from '@/server/services/accounts';

export const metadata = { title: '新規会員登録' };
export const dynamic = 'force-dynamic';

export default function RegisterPage() {
  return (
    <div>
      <h1 className="text-3xl font-extrabold">新規会員登録</h1>
      <p className="mt-1 text-sm text-slate-500">ログインIDとパスワードを決めて登録します。登録後、本人確認書類を提出してください</p>
      {configProblems().map(p => <div key={p.text} className="mt-6"><Notice tone="red"><b>設定エラー：</b>{p.text}</Notice></div>)}
      <ActionForm action={registerAction} reset={false} className="mt-8 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="氏名"><input name="name" required maxLength={50} placeholder="山田 太郎" className="input" autoComplete="name" /></Field>
          <Field label="氏名（全角カナ）"><input name="kana" required maxLength={50} placeholder="ヤマダ タロウ" className="input" /></Field>
        </div>
        <Field label="ログインID" hint={`${LOGIN_ID_RULE}（例：yamada_taro）。メールアドレスは使用できません`}>
          <input name="loginId" required minLength={3} maxLength={30} pattern="[A-Za-z0-9_\-]{3,30}" title={LOGIN_ID_RULE} placeholder="yamada_taro" autoComplete="username" autoCapitalize="none" spellCheck={false} className="input mono" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="パスワード" hint="8文字以上"><input name="password" type="password" minLength={8} required className="input" autoComplete="new-password" /></Field>
          <Field label="パスワード（確認）"><input name="confirm" type="password" minLength={8} required className="input" autoComplete="new-password" /></Field>
        </div>
        <Notice tone="amber">ログインIDとパスワードは忘れないよう保管してください。パスワードを忘れた場合は運営による本人確認のうえ再発行となります。</Notice>
        <label className="flex items-start gap-2 text-sm text-slate-600"><input type="checkbox" name="agree" required className="mt-1 accent-violet-600" /><span><Link href="/terms" className="text-violet-700 underline" target="_blank">利用規約</Link>および<Link href="/privacy" className="text-violet-700 underline" target="_blank">プライバシーポリシー</Link>に同意します</span></label>
        <SubmitButton className="btn-primary w-full py-3">登録する</SubmitButton>
      </ActionForm>
      <p className="mt-6 text-center text-sm text-slate-500">登録済みの方は <Link href="/login" className="font-semibold text-violet-700 hover:underline">ログイン</Link></p>
    </div>
  );
}
