import { Download, ScrollText, Search } from 'lucide-react';
import { ActionForm, SubmitButton } from '@/components/client';
import { Badge, Card, Notice, PageHeader, Table } from '@/components/ui';
import { fmtDate, uaShort } from '@/lib/format';
import { verifyAuditAction } from '@/server/actions/admin';
import { auditSearch } from '@/server/queries';

export const metadata = { title: '監査ログ' };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const term = ((await searchParams).q ?? '').trim();
  const rows = await auditSearch(term);
  return (
    <>
      <PageHeader icon={<ScrollText className="size-5" />} title="監査ログ" sub="全操作を日時・操作者・IP・端末情報とともに記録します"
        actions={<>
          <ActionForm action={verifyAuditAction}><SubmitButton pendingText="検証中…">改ざん検証</SubmitButton></ActionForm>
          <a href={`/api/export/audit?q=${encodeURIComponent(term)}`} className="btn-secondary"><Download className="size-4" />CSV</a>
        </>} />
      <div className="mb-5"><Notice>各レコードは直前レコードのハッシュ（SHA-256）を含むチェーン構造です。さらにデータベースのトリガーで UPDATE / DELETE を禁止しています。本番では定期的に追記専用ストレージ（WORM）へ退避してください。</Notice></div>
      <form className="mb-5 flex gap-2">
        <div className="relative max-w-md flex-1"><Search className="absolute top-2.5 left-3 size-4 text-slate-400" /><input name="q" defaultValue={term} placeholder="操作者・操作・対象・内容・IP で検索" className="input pl-9" /></div>
        <button className="btn-secondary">検索</button>
      </form>
      <Card title={`${rows.length}件${rows.length >= 300 ? '（最新300件）' : ''}`}>
        <Table rows={rows.length} head={['#', '日時', '操作者', '操作', '対象', '内容', 'IP', '端末', 'hash']}>
          {rows.map(a => (
            <tr key={a.seq}>
              <td className="text-xs text-slate-400">{a.seq}</td>
              <td className="text-xs whitespace-nowrap">{fmtDate(a.at)}</td>
              <td className="whitespace-nowrap">{a.actor_name}{a.actor_role === 'admin' && <> <Badge tone="violet">運営</Badge></>}{a.actor_role === 'system' && <> <Badge>自動</Badge></>}</td>
              <td className="mono text-xs">{a.action}</td><td className="mono text-xs">{a.target}</td><td className="max-w-sm">{a.detail}</td>
              <td className="mono text-xs">{a.ip}</td><td className="text-xs whitespace-nowrap" title={a.ua}>{uaShort(a.ua)}</td><td className="mono text-xs text-slate-400">{a.hash.slice(0, 10)}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
