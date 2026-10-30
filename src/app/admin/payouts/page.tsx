import { Download, FileSpreadsheet } from 'lucide-react';
import Link from 'next/link';
import { ActionForm, SubmitButton } from '@/components/client';
import { Badge, Card, Notice, PageHeader, Status, Table } from '@/components/ui';
import { fmtDate, yen } from '@/lib/format';
import { createPayoutAction, markPaidAction } from '@/server/actions/admin';
import { payoutsList } from '@/server/queries';
import { payoutCandidates } from '@/server/services/money';

export const metadata = { title: '売上支払CSV' };

export default async function Payouts() {
  const [cands, batches] = await Promise.all([payoutCandidates(), payoutsList()]);
  const payable = cands.filter(c => !c.hold);
  return (
    <>
      <PageHeader icon={<FileSpreadsheet className="size-5" />} title="売上支払CSV" sub="システムは支払対象の一覧を CSV 出力するのみで、振込は運営が実施します。振込後に「振込完了を記録」してください" />
      <Card title="支払対象（未払の確定売上）" actions={
        <ActionForm action={createPayoutAction} confirm={`${payable.length}名・合計 ${yen(payable.reduce((s, c) => s + c.amount, 0))} の支払バッチを作成します。`}>
          <SubmitButton className="btn-primary">支払バッチを作成</SubmitButton>
        </ActionForm>
      }>
        <Table rows={cands.length} empty="未払の売上はありません" head={['売り手', '振込先', '対象取引', '支払額', '判定']}>
          {cands.map(c => (
            <tr key={c.sellerId}>
              <td><Link className="text-violet-700 hover:underline" href={`/admin/users/${c.sellerId}`}>{c.name}</Link></td>
              <td className="text-xs">{c.bank ? `${c.bank.bankName} ${c.bank.branch} ${c.bank.type} ${c.bank.number} ${c.bank.holder}` : '—'}</td>
              <td>{c.tradeIds.length}件</td><td className="font-bold">{yen(c.amount)}</td>
              <td>{c.hold ? <Badge tone="red">保留：{c.hold}</Badge> : <Badge tone="green">支払対象</Badge>}</td>
            </tr>
          ))}
        </Table>
        <div className="mt-8"><Notice>凍結・利用制限中の売り手、振込先口座が未登録の売り手は自動的に支払対象から除外（保留）されます。</Notice></div>
      </Card>
      <Card className="mt-5" title="支払バッチ履歴">
        <Table rows={batches.length} empty="バッチはありません" head={['バッチID', '作成日時', '人数', '合計', '状態', '振込日', '操作']}>
          {batches.map(p => (
            <tr key={p.id}>
              <td className="mono text-xs">{p.id}</td><td className="text-xs">{fmtDate(p.created_at)}</td><td>{p.sellers}名</td><td className="font-bold">{yen(p.total)}</td>
              <td><Status kind="payout" value={p.status} /></td><td className="text-xs">{fmtDate(p.paid_at)}</td>
              <td>
                <div className="flex gap-1.5">
                  <a href={`/api/export/payout?id=${p.id}`} className="btn-secondary btn-sm"><Download className="size-3.5" />CSV</a>
                  {p.status === 'exported' && (
                    <ActionForm action={markPaidAction} hidden={{ id: p.id }} confirm={'このバッチの全件について振込が完了したことを記録し、各売り手の売上残高から減算します。'}>
                      <SubmitButton className="btn-success btn-sm">振込完了を記録</SubmitButton>
                    </ActionForm>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
