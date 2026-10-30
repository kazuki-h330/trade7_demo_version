import { ArrowLeftRight } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { TradeDetail } from '@/components/trade-detail';
import { PageHeader } from '@/components/ui';
import { requireAdminUser } from '@/server/auth';
import { tradeDetail } from '@/server/queries';

export const metadata = { title: '取引詳細' };

export default async function AdminTrade({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireAdminUser();
  const data = await tradeDetail((await params).id);
  if (!data) notFound();
  return (
    <>
      <PageHeader icon={<ArrowLeftRight className="size-5" />} title="取引詳細" sub={<span className="mono">{data.t.id}</span>} actions={<Link href="/admin/trades" className="btn-secondary">一覧へ</Link>} />
      <TradeDetail user={u} data={data} />
    </>
  );
}
