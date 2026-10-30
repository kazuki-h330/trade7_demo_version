import { notFound } from 'next/navigation';
import { Receipt } from 'lucide-react';
import { TradeDetail } from '@/components/trade-detail';
import { PageHeader } from '@/components/ui';
import { requireMember } from '@/server/auth';
import { tradeDetail } from '@/server/queries';

export const metadata = { title: '取引詳細' };

export default async function TradePage({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireMember();
  const data = await tradeDetail((await params).id);
  if (!data || (data.t.buyer_id !== u.id && data.t.seller_id !== u.id)) notFound();
  return (
    <>
      <PageHeader icon={<Receipt className="size-5" />} title="取引詳細" sub={<span className="mono">{data.t.id}</span>} />
      <TradeDetail user={u} data={data} />
    </>
  );
}
