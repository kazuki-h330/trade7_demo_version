import { ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { ActionForm, SubmitButton } from '@/components/client';
import { Badge, Card, Notice, PageHeader, Table } from '@/components/ui';
import { fmtDate } from '@/lib/format';
import { reviewDetectionAction } from '@/server/actions/admin';
import { detections } from '@/server/queries';

export const metadata = { title: '禁止行為検知' };

export default async function Detections() {
  const list = await detections();
  return (
    <>
      <PageHeader icon={<ShieldAlert className="size-5" />} title="禁止行為検知" sub="協議ページのメッセージを ①ルール判定 → ②AI判定（Gemini）の順で検査します" />
      <div className="mb-5"><Notice>ルール（ギフトコード・メール・電話・URL・外部SNS・ID）に該当したメッセージは <b>AIへ送信せず</b> ブロックします。AI判定が「warn」の場合は送信したうえで要確認として記録します。{!process.env.GEMINI_API_KEY && ' 現在 GEMINI_API_KEY が未設定のため、AI判定はローカルのヒューリスティックで代替しています。'}</Notice></div>
      <Card>
        <Table rows={list.length} empty="検知はありません" head={['日時', '取引', '送信者', '内容', 'ルール判定', 'AI判定', '処理', '確認']}>
          {list.map(d => (
            <tr key={d.id} className={d.reviewed_at ? 'opacity-60' : ''}>
              <td className="text-xs whitespace-nowrap">{fmtDate(d.created_at)}</td>
              <td><Link className="mono text-xs text-violet-700" href={`/admin/trades/${d.trade_id}`}>{d.trade_id}</Link></td>
              <td><Link href={`/admin/users/${d.user_id}`}>{d.user_name}</Link></td>
              <td className="max-w-xs">{d.body}</td>
              <td><div className="flex flex-wrap gap-1">{d.rule_hits.length ? d.rule_hits.map(h => <Badge key={h} tone="red">{h}</Badge>) : '—'}</div></td>
              <td className="text-xs">{d.ai ? <><Badge tone={d.ai.verdict === 'block' ? 'red' : d.ai.verdict === 'warn' ? 'amber' : 'green'}>{d.ai.verdict} {d.ai.score.toFixed(2)}</Badge><div className="mt-1 text-slate-500">{d.ai.reasons.join('、')}</div><div className="text-slate-400">{d.ai.model}{d.ai.error ? '（フォールバック）' : ''}</div></> : <span className="text-slate-400">未送信</span>}</td>
              <td>{d.action === 'block' ? <Badge tone="red">送信ブロック</Badge> : <Badge tone="amber">送信・要確認</Badge>}</td>
              <td>{d.reviewed_at ? <span className="text-xs text-slate-400">確認済</span> : <ActionForm action={reviewDetectionAction} hidden={{ id: d.id }}><SubmitButton className="btn-secondary btn-sm">確認済にする</SubmitButton></ActionForm>}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
