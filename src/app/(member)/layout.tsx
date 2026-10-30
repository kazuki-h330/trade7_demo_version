import { LogOut, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { Logo } from '@/components/brand';
import { MemberNav, type NavItem } from '@/components/nav';
import { Notice, Status } from '@/components/ui';
import { yen } from '@/lib/format';
import { logoutAction } from '@/server/actions/auth';
import { requireMember } from '@/server/auth';
import { unreadCount } from '@/server/queries';

export const dynamic = 'force-dynamic';

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const u = await requireMember();
  const unread = await unreadCount(u.id);
  const items: NavItem[] = [
    { href: '/market', label: 'マーケット', icon: 'market' },
    { href: '/trades', label: '取引', icon: 'trades' },
    { href: '/charge', label: 'チャージ', icon: 'charge' },
    { href: '/sell', label: '出品', icon: 'sell' },
    { href: '/sales', label: '売上', icon: 'sales' },
    { href: '/inbox', label: 'お知らせ', icon: 'inbox', count: unread },
    { href: '/account', label: 'マイページ', icon: 'account' },
  ];
  let banner: React.ReactNode = null;
  if (u.status === 'frozen') banner = <Notice tone="red" icon={<TriangleAlert className="size-4 shrink-0" />}>アカウントは凍結中です。残高・係争中の取引は運営で保全しています。お問い合わせは運営事務局まで。</Notice>;
  else if (u.status === 'restricted') banner = <Notice tone="red" icon={<TriangleAlert className="size-4 shrink-0" />}>アカウントは利用制限中です。新規の出品・購入・チャージはできません。</Notice>;
  else if (u.must_change_password) banner = <Notice tone="amber">仮パスワードでログイン中です。<Link className="font-semibold underline" href="/account">マイページ</Link>で新しいパスワードを設定してください。</Notice>;
  else if (u.kyc_status !== 'approved') banner = <Notice tone="amber">本人確認（<b>{u.kyc_status === 'pending' ? '審査中' : u.kyc_status === 'rejected' ? '差戻し' : '未提出'}</b>）が完了するまで売買・チャージはご利用いただけません。<Link className="font-semibold underline" href="/account">本人確認へ</Link></Notice>;
  else if (u.status === 'warned') banner = <Notice tone="amber">運営より警告が記録されています。利用規約をご確認ください。</Notice>;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-white/60 bg-white/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 pt-3">
          <Logo href="/market" />
          <div className="flex items-center gap-2 text-sm">
            <div className="hidden items-center gap-1 rounded-2xl bg-gradient-to-r from-violet-50 to-fuchsia-50 px-3 py-1.5 ring-1 ring-violet-100 sm:flex">
              <span className="text-xs text-slate-500">チャージ</span><b className="text-violet-700">{yen(u.charge_balance)}</b>
              <span className="mx-1.5 h-4 w-px bg-violet-200" />
              <span className="text-xs text-slate-500">売上</span><b className="text-fuchsia-700">{yen(u.sales_balance)}</b>
            </div>
            <span className="hidden font-semibold md:inline">{u.name}</span>
            {u.status !== 'active' && <Status kind="user" value={u.status} />}
            <form action={logoutAction}><button className="btn-ghost btn-sm" title="ログアウト"><LogOut className="size-4" /></button></form>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-4 pt-3 pb-2"><MemberNav items={items} /></div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        {banner && <div className="mb-5">{banner}</div>}
        {children}
      </main>
      <footer className="mx-auto max-w-6xl px-4 pb-10 text-xs text-slate-400">© trade7 運営事務局 ・ <Link href="/terms" className="hover:underline">利用規約</Link> ・ <Link href="/privacy" className="hover:underline">プライバシーポリシー</Link></footer>
    </div>
  );
}
