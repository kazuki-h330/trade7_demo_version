import { ScanSearch } from 'lucide-react';
import Link from 'next/link';
import { ActionForm, AdminDecrypt, ModalButton, SubmitButton } from '@/components/client';
import { Card, Field, GiftArt, Notice, PageHeader, Status, Table } from '@/components/ui';
import { fmtDate, maskCode, pct, yen } from '@/lib/format';
import { balanceCheckAction } from '@/server/actions/admin';
import { listingsByStatus } from '@/server/queries';
import { CHECK_METHODS, DECRYPT_REASONS } from '@/server/services/listings';

export const metadata = { title: '出品・残高確認' };

export default async function ListingsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const status = (await searchParams).status;
  const [checking, all] = await Promise.all([listingsByStatus('checking'), listingsByStatus(status)]);
  const tabs = [['', 'すべて'], ['active', '出品中'], ['sold', '売約済'], ['rejected', '確認NG'], ['withdrawn', '取下げ'], ['cancelled', '取引中止']];
  return (
    <>
      <PageHeader icon={<ScanSearch className="size-5" />} title="出品・残高確認" sub="運営が Apple の照会画面等でギフト券の残高を目視確認し、結果を記録します（自動確認は追加2で対応）" />
      <Card title={`残高確認待ち（${checking.length}件）`}>
        {checking.length === 0 ? <p className="text-sm text-slate-500">確認待ちの出品はありません</p> : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {checking.map(l => (
              <div key={l.id} className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <div className="flex items-start gap-3">
                  <GiftArt face={l.face} small className="w-32 shrink-0" />
                  <div className="min-w-0 text-sm">
                    <div className="mono text-xs text-slate-500">{l.id}</div>
                    <div>出品者 <Link className="text-violet-700" href={`/admin/users/${l.seller_id}`}>{l.seller_name}</Link></div>
                    <div>利率 {pct(l.rate_x10)} / {yen(l.price)}</div>
                    <div className="text-xs text-slate-400">{fmtDate(l.created_at)}</div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <AdminDecrypt listingId={l.id} reasons={DECRYPT_REASONS} />
                  <ModalButton className="btn-primary btn-sm" label="確認結果を記録" title={`残高確認の記録（${l.id}）`}>
                    <ActionForm action={balanceCheckAction} hidden={{ id: l.id }} className="space-y-4">
                      <p className="text-sm">額面 <b>{yen(l.face)}</b> ／ コード <span className="mono">{maskCode(l.code_head, l.code_tail)}</span></p>
                      <Field label="確認方法"><select name="method" className="input">{CHECK_METHODS.map(m => <option key={m}>{m}</option>)}</select></Field>
                      <Field label="確認結果"><select name="result" className="input"><option value="ok">OK（マーケットに掲載する）</option><option value="ng">NG（無効・残高不足・使用済み）</option></select></Field>
                      <Field label="確認できた残高（円）" hint="額面未満の場合は自動的に NG になります"><input name="balance" type="number" min={0} required defaultValue={l.face} className="input" /></Field>
                      <Field label="備考（NGの場合は出品者へ通知）"><input name="note" className="input" /></Field>
                      <div className="flex justify-end"><SubmitButton>記録する</SubmitButton></div>
                    </ActionForm>
                  </ModalButton>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-4"><Notice>コードの復号はすべて監査ログに記録されます。確認作業は必要最小限の担当者で行ってください。</Notice></div>
      </Card>
      <Card className="mt-5" title="出品一覧" actions={<div className="flex flex-wrap gap-1">{tabs.map(([k, v]) => <Link key={k} href={k ? `?status=${k}` : '?'} className={(status ?? '') === k ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}>{v}</Link>)}</div>}>
        <Table rows={all.length} head={['出品ID', '出品者', '額面', '利率', '価格', '状態', '残高確認', '確認者']}>
          {all.map(l => (
            <tr key={l.id}>
              <td className="mono text-xs">{l.id}</td><td><Link className="text-violet-700" href={`/admin/users/${l.seller_id}`}>{l.seller_name}</Link></td>
              <td className="font-semibold">{yen(l.face)}</td><td>{pct(l.rate_x10)}</td><td>{yen(l.price)}</td><td><Status kind="listing" value={l.status} /></td>
              <td className="text-xs">{l.check_result ? <><b className={l.check_result === 'ok' ? 'text-emerald-600' : 'text-rose-600'}>{l.check_result.toUpperCase()}</b> {yen(l.check_balance)}<div className="text-slate-400">{l.check_method}{l.check_note ? ` / ${l.check_note}` : ''}</div></> : '—'}</td>
              <td className="text-xs">{l.staff_name ?? '—'}<div className="text-slate-400">{fmtDate(l.check_at)}</div></td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
