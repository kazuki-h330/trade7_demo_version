import { MessageSquareWarning } from 'lucide-react';
import Link from 'next/link';
import { AutoRefresh } from '@/components/client';
import { Card, PageHeader, Status, Table } from '@/components/ui';
import { fmtDate, yen } from '@/lib/format';
import { disputedTrades } from '@/server/queries';

export const metadata = { title: 'エラー・協議' };

export default async function Disputes() {
  const list = await disputedTrades();
  return (
    <>
      <AutoRefresh seconds={20} />
      <PageHeader icon={<MessageSquareWarning className="size-5" />} title="エラー申請・協議" sub="エラー申請中の取引は代金が保留され、運営が「取引完了」または「取引中止」を判断するまで売上に計上されません" />
      <Card>
        <Table rows={list.length} empty="エラー申請はありません" head={['取引ID', '申請日時', '理由', '買い手', '売り手', '保留額', '添付', 'メッセージ', '状態']}>
          {list.map(t => (
            <tr key={t.id} className={t.status === 'disputed' ? 'bg-rose-50/40' : ''}>
              <td><Link className="mono font-semibold text-violet-700 hover:underline" href={`/admin/trades/${t.id}`}>{t.id}</Link></td>
              <td className="text-xs">{fmtDate(t.opened_at)}</td><td>{t.dispute_reason}</td>
              <td><Link href={`/admin/users/${t.buyer_id}`}>{t.buyer_name}</Link></td><td><Link href={`/admin/users/${t.seller_id}`}>{t.seller_name}</Link></td>
              <td className="font-semibold">{yen(t.price)}</td><td>{t.shots}枚</td><td>{t.msgs}件</td><td><Status kind="trade" value={t.status} /></td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
