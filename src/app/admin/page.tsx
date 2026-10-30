import { Banknote, Coins, IdCard, LayoutDashboard, MessageSquareWarning, PiggyBank, ScanSearch, ShieldAlert, Snowflake, TrendingUp, Users, Wallet } from 'lucide-react';
import Link from 'next/link';
import { AutoRefresh } from '@/components/client';
import { Card, PageHeader, Stat, Table } from '@/components/ui';
import { fmtDate, yen } from '@/lib/format';
import { adminCounts, auditSearch, dailyVolume, dashboardStats } from '@/server/queries';

export const metadata = { title: 'ダッシュボード' };

export default async function Dashboard() {
  const [c, s, days, logs] = await Promise.all([adminCounts(), dashboardStats(), dailyVolume(), auditSearch('', 8)]);
  const max = Math.max(1, ...days.map(d => d.amount));
  const queue = [
    { href: '/admin/kyc', label: '本人確認 審査待ち', n: c.kyc, icon: IdCard, color: 'from-violet-500 to-indigo-500' },
    { href: '/admin/sellers', label: '出品者審査 待ち', n: c.sellers, icon: ShieldAlert, color: 'from-fuchsia-500 to-pink-500' },
    { href: '/admin/listings', label: '残高確認 待ち', n: c.listings, icon: ScanSearch, color: 'from-amber-400 to-orange-500' },
    { href: '/admin/charges', label: '着金確認 待ち', n: c.charges, icon: Banknote, color: 'from-emerald-400 to-teal-500' },
    { href: '/admin/disputes', label: 'エラー協議中', n: c.disputes, icon: MessageSquareWarning, color: 'from-rose-500 to-red-500' },
    { href: '/admin/detections', label: '禁止行為 未確認', n: c.detections, icon: ShieldAlert, color: 'from-sky-400 to-blue-500' },
  ];
  return (
    <>
      <AutoRefresh seconds={30} />
      <PageHeader icon={<LayoutDashboard className="size-5" />} title="ダッシュボード" sub="運営タスクと資金の状況" />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {queue.map(q => (
          <Link key={q.href} href={q.href} className={`card flex items-center gap-3 p-4 transition hover:-translate-y-0.5 hover:shadow-xl ${q.n ? 'ring-2 ring-amber-300' : ''}`}>
            <div className={`grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white shadow-md ${q.color}`}><q.icon className="size-5" /></div>
            <div><div className="text-2xl leading-none font-extrabold">{q.n}</div><div className="mt-1 text-xs text-slate-500">{q.label}</div></div>
          </Link>
        ))}
      </div>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat color="violet" label="本日の取引" value={yen(s.today_amount)} sub={`${s.today_count}件`} icon={<TrendingUp className="size-5" />} href="/admin/trades" />
        <Stat color="pink" label="今月の手数料収入" value={yen(s.month_fee)} sub="完了取引ベース" icon={<Coins className="size-5" />} />
        <Stat color="sky" label="預り チャージ残高合計" value={yen(s.charge_total)} sub={`会員 ${s.members}名`} icon={<Wallet className="size-5" />} href="/admin/balances" />
        <Stat color="teal" label="未払 売上合計" value={yen(s.unpaid_total)} sub="支払CSVの対象" icon={<PiggyBank className="size-5" />} href="/admin/payouts" />
        <Stat color="rose" label="係争中の保留額" value={yen(s.disputed_total)} icon={<MessageSquareWarning className="size-5" />} href="/admin/disputes" />
        <Stat color="orange" label="凍結中アカウント" value={`${s.frozen_count}件`} sub={`保全額 ${yen(s.frozen_amount)}`} icon={<Snowflake className="size-5" />} href="/admin/users" />
        <Stat color="violet" label="出品中" value={`${s.active_listings}件`} icon={<ScanSearch className="size-5" />} href="/admin/listings" />
        <Stat color="pink" label="会員数" value={`${s.members}名`} icon={<Users className="size-5" />} href="/admin/users" />
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
        <Card title="取引額の推移（14日間）">
          <div className="flex h-56 items-end gap-1.5">
            {days.map(d => (
              <div key={d.day} className="group flex flex-1 flex-col items-center gap-1">
                <div className="text-[10px] font-semibold text-slate-500 opacity-0 transition group-hover:opacity-100">{yen(d.amount)}</div>
                <div className="w-full rounded-t-lg bg-gradient-to-t from-violet-600 via-fuchsia-500 to-orange-400 transition group-hover:brightness-110" style={{ height: `${Math.max(3, (d.amount / max) * 180)}px`, opacity: d.amount ? 1 : 0.25 }} />
                <div className="text-[10px] text-slate-400">{d.day}</div>
              </div>
            ))}
          </div>
        </Card>
        <Card title="最新の監査ログ" actions={<Link href="/admin/audit" className="btn-secondary btn-sm">すべて表示</Link>}>
          <Table rows={logs.length} head={['日時', '操作者', '操作']}>
            {logs.map(a => <tr key={a.seq}><td className="text-xs whitespace-nowrap text-slate-500">{fmtDate(a.at)}</td><td>{a.actor_name}</td><td className="mono text-xs">{a.action}</td></tr>)}
          </Table>
        </Card>
      </div>
    </>
  );
}
