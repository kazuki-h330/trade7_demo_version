import { Clock, Landmark, PiggyBank } from 'lucide-react';
import Link from 'next/link';
import { LedgerTable } from '@/components/ledger-table';
import { Card, PageHeader, Stat, Status, Table } from '@/components/ui';
import { fmtDate, yen } from '@/lib/format';
import { requireMember } from '@/server/auth';
import { bankOf, ledgerFor, salesInfo } from '@/server/queries';

export const metadata = { title: '売上' };

export default async function Sales() {
  const u = await requireMember();
  const [info, bank, ledger] = await Promise.all([salesInfo(u.id), bankOf(u.id), ledgerFor(u.id, 'sales')]);
  return (
    <>
      <PageHeader icon={<PiggyBank className="size-5" />} title="売上" sub="売上は運営が登録口座へお振込みします（出金申請は不要です）" />
      <div className="mb-5 grid gap-4 md:grid-cols-3">
        <Stat color="pink" label="売上残高（未払）" value={yen(u.sales_balance)} icon={<PiggyBank className="size-5" />} />
        <Stat color="sky" label="確定待ち（受取確認・協議中）" value={yen(info.pendingAmount)} icon={<Clock className="size-5" />} />
        <Stat color="teal" label="振込先口座" value={<span className="text-base">{bank ? `${bank.bank_name} ${bank.branch}` : '未登録'}</span>} sub={bank ? `${bank.account_type} ****${bank.account_number.slice(-3)}` : <Link href="/account" className="underline">マイページで登録する</Link>} icon={<Landmark className="size-5" />} />
      </div>
      <Card title="支払対象（未払の確定売上）">
        <Table rows={info.unpaid.length} empty="未払の売上はありません" head={['取引ID', '確定日時', '取引価格', '手数料', '売上']}>
          {info.unpaid.map(t => <tr key={t.id}><td><Link className="mono text-violet-700 hover:underline" href={`/trades/${t.id}`}>{t.id}</Link></td><td>{fmtDate(t.completed_at)}</td><td>{yen(t.price)}</td><td>{yen(t.fee)}</td><td className="font-semibold text-emerald-700">{yen(t.seller_net)}</td></tr>)}
        </Table>
      </Card>
      <Card className="mt-5" title="お振込み履歴">
        <Table rows={info.payouts.length} empty="お振込み履歴はありません" head={['支払ID', '作成日', '金額', '件数', '状態', '振込日']}>
          {info.payouts.map(p => <tr key={p.id}><td className="mono text-xs">{p.id}</td><td>{fmtDate(p.created_at)}</td><td className="font-semibold">{yen(p.amount)}</td><td>{p.trade_count}件</td><td><Status kind="payout" value={p.status} /></td><td>{fmtDate(p.paid_at)}</td></tr>)}
        </Table>
      </Card>
      <Card className="mt-5" title="売上残高の履歴"><LedgerTable rows={ledger} /></Card>
    </>
  );
}
