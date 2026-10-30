import Link from 'next/link';
import { ActionForm, SubmitButton } from '@/components/client';
import { Field, Notice } from '@/components/ui';
import { resetPasswordAction } from '@/server/actions/auth';

export const metadata = { title: '新しいパスワードの設定' };

export default async function ResetPassword({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <div>
      <h1 className="text-3xl font-extrabold">新しいパスワード</h1>
      <p className="mt-1 text-sm text-slate-500">設定後、すべての端末からログアウトされます</p>
      {!token ? <div className="mt-8"><Notice tone="red">リンクが正しくありません。<Link href="/forgot-password" className="underline">再設定をやり直す</Link></Notice></div> : (
        <ActionForm action={resetPasswordAction} hidden={{ token }} reset={false} className="mt-8 space-y-4">
          <Field label="新しいパスワード" hint="8文字以上"><input name="password" type="password" minLength={8} required autoComplete="new-password" className="input" /></Field>
          <Field label="新しいパスワード（確認）"><input name="confirm" type="password" minLength={8} required autoComplete="new-password" className="input" /></Field>
          <SubmitButton className="btn-primary w-full py-3">パスワードを設定</SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}
