import Link from 'next/link';
import { ActionForm, SubmitButton } from '@/components/client';
import { Field } from '@/components/ui';
import { registerAction } from '@/server/actions/auth';

export const metadata = { title: '新規会員登録' };

export default function RegisterPage() {
  return (
    <div>
      <h1 className="text-3xl font-extrabold">新規会員登録</h1>
      <p className="mt-1 text-sm text-slate-500">登録後、メール認証と本人確認を行います</p>
      <ActionForm action={registerAction} reset={false} className="mt-8 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="氏名"><input name="name" required maxLength={50} placeholder="山田 太郎" className="input" autoComplete="name" /></Field>
          <Field label="氏名（全角カナ）"><input name="kana" required maxLength={50} placeholder="ヤマダ タロウ" className="input" /></Field>
        </div>
        <Field label="メールアドレス"><input name="email" type="email" required className="input" autoComplete="email" /></Field>
        <Field label="パスワード" hint="8文字以上"><input name="password" type="password" minLength={8} required className="input" autoComplete="new-password" /></Field>
        <label className="flex items-start gap-2 text-sm text-slate-600"><input type="checkbox" name="agree" required className="mt-1 accent-violet-600" /><span><Link href="/terms" className="text-violet-700 underline" target="_blank">利用規約</Link>および<Link href="/privacy" className="text-violet-700 underline" target="_blank">プライバシーポリシー</Link>に同意します</span></label>
        <SubmitButton className="btn-primary w-full py-3">登録して認証メールを受け取る</SubmitButton>
      </ActionForm>
      <p className="mt-6 text-center text-sm text-slate-500">登録済みの方は <Link href="/login" className="font-semibold text-violet-700 hover:underline">ログイン</Link></p>
    </div>
  );
}
