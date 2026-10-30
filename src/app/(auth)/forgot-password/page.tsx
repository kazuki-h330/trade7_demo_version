import Link from 'next/link';
import { Notice } from '@/components/ui';

export const metadata = { title: 'パスワードをお忘れの方' };

export default function ForgotPassword() {
  return (
    <div>
      <h1 className="text-3xl font-extrabold">パスワードをお忘れの方</h1>
      <p className="mt-1 text-sm text-slate-500">trade7 はメールアドレスを登録しないため、パスワードの再発行は運営が行います</p>
      <div className="mt-8 space-y-4 text-sm text-slate-600">
        <ol className="list-decimal space-y-2 pl-5">
          <li>運営事務局へ <b>ログインID</b> と <b>登録した氏名</b> をお知らせください。</li>
          <li>運営が本人確認書類の登録内容と照合し、<b>仮パスワード</b> を発行します。</li>
          <li>仮パスワードでログインすると、新しいパスワードの設定画面が表示されます。</li>
        </ol>
        <Notice>なりすまし防止のため、本人確認が取れない場合は再発行できません。仮パスワードの発行時、すべての端末からログアウトされます。</Notice>
      </div>
      <p className="mt-8 text-center text-sm"><Link href="/login" className="font-semibold text-violet-700 hover:underline">ログインへ戻る</Link></p>
    </div>
  );
}
