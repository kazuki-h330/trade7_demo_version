import { Receipt } from 'lucide-react';
import Link from 'next/link';
import { Countdown } from '@/components/client';
import { Badge, Card, PageHeader, Status, Table } from '@/components/ui';
import { fmtDate, pct, yen } from '@/lib/format';
import { requireMember } from '@/server/auth';
import { myTrades } from '@/server/queries';

export const metadata = { title: '取引' };

export default async function Trades() {
  const u = await requireMember();
  const list = await myTrades(u.id);
  return (
    <>
      <PageHeader icon={<Receipt className="size-5" />} title="取引" sub="購入・販売したすべての取引" />
      <Card pad>
        <Table rows={list.length} empty="まだ取引はありません" head={['取引ID', '区分', '額面', '利率', '取引価格', '売上（控除後）', '状態', '残り時間 / 確定', '購入日時']}>
          {list.map(t => {
            const buy = t.buyer_id === u.id;
            return (
              <tr key={t.id}>
                <td><Link className="mono font-semibold text-violet-700 hover:underline" href={`/trades/${t.id}`}>{t.id}</Link></td>
                <td>{buy ? <Badge tone="blue">購入</Badge> : <Badge tone="violet">販売</Badge>}</td>
                <td>{yen(t.face)}</td><td>{pct(t.rate_x10)}</td><td className="font-semibold">{yen(t.price)}</td>
                <td>{buy ? '—' : yen(t.seller_net)}</td>
                <td><Status kind="trade" value={t.status} /></td>
                <td>{t.status === 'awaiting' ? <Countdown deadline={new Date(t.deadline).toISOString()} /> : fmtDate(t.completed_at)}</td>
                <td className="text-slate-500">{fmtDate(t.purchased_at)}</td>
              </tr>
            );
          })}
        </Table>
      </Card>
    </>
  );
}
