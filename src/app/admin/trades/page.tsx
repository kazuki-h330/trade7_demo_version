import { ArrowLeftRight, Download } from 'lucide-react';
import Link from 'next/link';
import { Countdown } from '@/components/client';
import { Card, PageHeader, Status, Table } from '@/components/ui';
import { fmtDate, pct, yen } from '@/lib/format';
import { allTrades } from '@/server/queries';

export const metadata = { title: '取引管理' };

export default async function TradesAdmin({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const status = (await searchParams).status;
  const list = await allTrades(status);
  const tabs = [['', 'すべて'], ['awaiting', '受取確認待ち'], ['disputed', 'エラー申請中'], ['completed', '完了'], ['cancelled', '中止']];
  return (
    <>
      <PageHeader icon={<ArrowLeftRight className="size-5" />} title="取引管理" actions={<a href="/api/export/trades" className="btn-secondary"><Download className="size-4" />取引CSV</a>} />
      <Card actions={<div className="flex flex-wrap gap-1">{tabs.map(([k, v]) => <Link key={k} href={k ? `?status=${k}` : '?'} className={(status ?? '') === k ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}>{v}</Link>)}</div>} title={`${list.length}件`}>
        <Table rows={list.length} head={['取引ID', '買い手', '売り手', '額面', '利率', '価格', '手数料', '状態', '購入日時', '確定']}>
          {list.map(t => (
            <tr key={t.id}>
              <td><Link className="mono font-semibold text-violet-700 hover:underline" href={`/admin/trades/${t.id}`}>{t.id}</Link></td>
              <td><Link href={`/admin/users/${t.buyer_id}`} className="hover:underline">{t.buyer_name}</Link></td>
              <td><Link href={`/admin/users/${t.seller_id}`} className="hover:underline">{t.seller_name}</Link></td>
              <td>{yen(t.face)}</td><td>{pct(t.rate_x10)}</td><td className="font-semibold">{yen(t.price)}</td><td>{yen(t.fee)}</td>
              <td><Status kind="trade" value={t.status} /></td><td className="text-xs">{fmtDate(t.purchased_at)}</td>
              <td className="text-xs">{t.status === 'awaiting' ? <>残り <Countdown deadline={new Date(t.deadline).toISOString()} /></> : t.completed_at ? <>{fmtDate(t.completed_at)}<div className="text-slate-400">{{ buyer: '買い手確認', auto: '自動確定', admin: '運営処理' }[t.completed_by ?? ''] ?? ''}</div></> : '—'}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
