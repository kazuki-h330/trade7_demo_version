import { LogOut } from 'lucide-react';
import { Logo } from '@/components/brand';
import { AdminNav, MobileCollapse } from '@/components/nav';
import { logoutAction } from '@/server/actions/auth';
import { requireAdminUser } from '@/server/auth';
import { adminCounts } from '@/server/queries';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const u = await requireAdminUser();
  const c = await adminCounts();
  const groups = [
    { title: '概要', items: [{ href: '/admin', label: 'ダッシュボード', icon: 'dash' as const }] },
    { title: '審査', items: [
      { href: '/admin/kyc', label: '本人確認審査', icon: 'kyc' as const, count: c.kyc },
      { href: '/admin/sellers', label: '出品者審査', icon: 'sellers' as const, count: c.sellers },
      { href: '/admin/listings', label: '出品・残高確認', icon: 'listings' as const, count: c.listings },
    ] },
    { title: '取引・資金', items: [
      { href: '/admin/trades', label: '取引管理', icon: 'atrades' as const },
      { href: '/admin/disputes', label: 'エラー・協議', icon: 'disputes' as const, count: c.disputes },
      { href: '/admin/charges', label: 'チャージ承認', icon: 'charges' as const, count: c.charges },
      { href: '/admin/balances', label: '残高・調整', icon: 'balances' as const },
      { href: '/admin/payouts', label: '売上支払CSV', icon: 'payouts' as const },
    ] },
    { title: '不正対策・記録', items: [
      { href: '/admin/users', label: '会員・不正対応', icon: 'users' as const },
      { href: '/admin/detections', label: '禁止行為検知', icon: 'detections' as const, count: c.detections },
      { href: '/admin/audit', label: '監査ログ', icon: 'audit' as const },
      { href: '/admin/emails', label: 'メール送信ログ', icon: 'emails' as const },
      { href: '/admin/settings', label: '設定', icon: 'settings' as const },
    ] },
  ];
  return (
    <div className="min-h-screen lg:flex">
      <aside className="bg-[linear-gradient(180deg,#1e1038_0%,#2a1050_55%,#3b0d45_100%)] px-3 py-5 lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0 lg:overflow-y-auto">
        <div className="mb-4 flex items-center justify-between px-2 lg:mb-6">
          <Logo href="/admin" light />
          <span className="rounded-lg bg-amber-400 px-2 py-0.5 text-[11px] font-bold text-slate-900">運営</span>
        </div>
        <MobileCollapse badge={Object.values(c).reduce((a, b) => a + b, 0)}>
          <AdminNav groups={groups} />
          <div className="mt-6 flex items-center justify-between rounded-2xl bg-white/10 px-3 py-2.5 text-sm text-white">
            <div><div className="font-semibold">{u.name}</div><div className="text-xs text-violet-200/70">{u.email}</div></div>
            <form action={logoutAction}><button className="rounded-lg p-1.5 text-violet-100 hover:bg-white/10" title="ログアウト"><LogOut className="size-4" /></button></form>
          </div>
        </MobileCollapse>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 lg:px-8">{children}</main>
    </div>
  );
}
