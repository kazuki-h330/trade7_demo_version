import Link from 'next/link';
import { ActionForm, SubmitButton } from '@/components/client';
import { Field } from '@/components/ui';
import { requestResetAction } from '@/server/actions/auth';

export const metadata = { title: 'パスワード再設定' };

export default function ForgotPassword() {
  return (
    <div>
      <h1 className="text-3xl font-extrabold">パスワード再設定</h1>
      <p className="mt-1 text-sm text-slate-500">ご登録のメールアドレスに再設定用のリンクをお送りします</p>
      <ActionForm action={requestResetAction} className="mt-8 space-y-4">
        <Field label="メールアドレス"><input name="email" type="email" required autoComplete="email" className="input" /></Field>
        <SubmitButton className="btn-primary w-full py-3">再設定メールを送信</SubmitButton>
      </ActionForm>
      <p className="mt-6 text-center text-sm"><Link href="/login" className="font-semibold text-violet-700 hover:underline">ログインへ戻る</Link></p>
    </div>
  );
}
