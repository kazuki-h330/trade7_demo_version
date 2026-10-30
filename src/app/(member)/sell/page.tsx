import { ShieldCheck, Tag } from 'lucide-react';
import { ActionForm, FillDemoCode, ModalButton, SubmitButton } from '@/components/client';
import { Card, Empty, Field, PageHeader, Status, Table } from '@/components/ui';
import { fmtDate, maskCode, pct, yen } from '@/lib/format';
import { applySellerAction, changeRateAction, createListingAction, withdrawListingAction } from '@/server/actions/member';
import { requireMember } from '@/server/auth';
import { calcFee, sellBlockReason, tradeBlockReason } from '@/server/core';
import { getDb } from '@/server/db';
import { myListings } from '@/server/queries';
import { getSettings } from '@/server/settings';

export const metadata = { title: '出品' };

export default async function Sell() {
  const u = await requireMember();
  const s = await getSettings(await getDb());
  if (u.seller_status !== 'approved') {
    const why = tradeBlockReason(u);
    return (
      <>
        <PageHeader icon={<Tag className="size-5" />} title="出品" />
        <Card>
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <div className="brand-gradient grid size-16 place-items-center rounded-3xl text-white shadow-xl shadow-fuchsia-500/30"><ShieldCheck className="size-8" /></div>
            <h2 className="text-xl font-bold">出品者審査</h2>
            <p className="max-w-md text-sm text-slate-600">出品するには、本人確認の完了に加えて運営による<b>出品者審査</b>の通過が必要です。</p>
            <div>現在の状態：<Status kind="seller" value={u.seller_status} /></div>
            {u.seller_note && <p className="text-sm text-rose-600">{u.seller_note}</p>}
            {(u.seller_status === 'none' || u.seller_status === 'rejected') && (
              why ? <p className="text-sm text-slate-500">{why}</p> : <ActionForm action={applySellerAction}><SubmitButton>出品者審査を申請する</SubmitButton></ActionForm>
            )}
          </div>
        </Card>
      </>
    );
  }
  const why = sellBlockReason(u);
  const list = await myListings(u.id);
  return (
    <>
      <PageHeader icon={<Tag className="size-5" />} title="出品" sub="出品後、運営がギフト券の残高を確認してからマーケットに掲載されます。売買成立前は販売利率を変更できます。" />
      <Card title="新規出品">
        {why ? <Empty>{why}</Empty> : (
          <ActionForm action={createListingAction} className="grid gap-4 md:grid-cols-[150px_150px_1fr_auto] md:items-end">
            <Field label="額面（円）"><input name="face" type="number" required min={s.faceMin} max={s.faceMax} step={1} className="input" placeholder="10000" /></Field>
            <Field label={`販売利率（${pct(s.rateMinX10)}〜${pct(s.rateMaxX10)}）`}><input name="rate" type="number" required min={s.rateMinX10 / 10} max={s.rateMaxX10 / 10} step={0.1} defaultValue={88} className="input" /></Field>
            <Field label="ギフトコード（16桁）"><input name="code" required autoComplete="off" spellCheck={false} placeholder="XXXX XXXX XXXX XXXX" className="input mono tracking-wider" /></Field>
            <div className="flex gap-2"><SubmitButton>出品する</SubmitButton>{process.env.NODE_ENV !== 'production' && <FillDemoCode />}</div>
          </ActionForm>
        )}
        <p className="mt-3 text-xs text-slate-500">コードは暗号化して保存され、画面には先頭4桁・末尾4桁のみ表示されます。同一コードの重複出品は自動で拒否・記録されます。手数料 {(s.feeBps / 100).toFixed(1)}% は取引完了時に売上から控除されます。</p>
      </Card>
      <Card className="mt-5" title="出品一覧">
        <Table rows={list.length} empty="まだ出品はありません" head={['出品ID', '額面', '販売利率', '販売価格', '想定売上', 'コード', '状態', '運営残高確認', '操作']}>
          {list.map(l => {
            const editable = ['checking', 'active'].includes(l.status) && !why;
            return (
              <tr key={l.id}>
                <td className="mono text-xs">{l.id}</td><td className="font-semibold">{yen(l.face)}</td><td>{pct(l.rate_x10)}</td><td>{yen(l.price)}</td>
                <td className="text-emerald-700">{yen(l.price - calcFee(l.price, s.feeBps))}</td>
                <td className="mono text-xs">{maskCode(l.code_head, l.code_tail)}</td>
                <td><Status kind="listing" value={l.status} /></td>
                <td className="text-xs">{l.check_result ? <><b className={l.check_result === 'ok' ? 'text-emerald-600' : 'text-rose-600'}>{l.check_result.toUpperCase()}</b> {fmtDate(l.check_at)}{l.check_note && <div className="text-rose-600">{l.check_note}</div>}</> : <span className="text-slate-400">確認待ち</span>}</td>
                <td>
                  {editable && (
                    <div className="flex gap-1.5">
                      <ModalButton className="btn-secondary btn-sm" label="利率変更" title="販売利率の変更">
                        <ActionForm action={changeRateAction} hidden={{ id: l.id }} className="space-y-4">
                          <p className="text-sm text-slate-600">額面 {yen(l.face)}・現在 {pct(l.rate_x10)}</p>
                          <Field label="新しい販売利率（%）"><input name="rate" type="number" step={0.1} min={s.rateMinX10 / 10} max={s.rateMaxX10 / 10} defaultValue={l.rate_x10 / 10} required className="input" /></Field>
                          <div className="flex justify-end"><SubmitButton>変更する</SubmitButton></div>
                        </ActionForm>
                      </ModalButton>
                      <ActionForm action={withdrawListingAction} hidden={{ id: l.id }} confirm="この出品を取り下げますか？"><SubmitButton className="btn-ghost btn-sm text-rose-600">取下げ</SubmitButton></ActionForm>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </Table>
      </Card>
    </>
  );
}
