import { BadgeCheck, ShoppingBag, Store } from 'lucide-react';
import Link from 'next/link';
import { ActionForm, AutoRefresh, ModalButton, SubmitButton } from '@/components/client';
import { DL, Empty, GiftArt, Notice, PageHeader } from '@/components/ui';
import { alias, fmtShort, maskCode, pct, yen } from '@/lib/format';
import { purchaseAction } from '@/server/actions/member';
import { requireMember } from '@/server/auth';
import { tradeBlockReason } from '@/server/core';
import { getDb } from '@/server/db';
import { marketListings } from '@/server/queries';
import { getSettings } from '@/server/settings';

export const metadata = { title: 'マーケット' };
const FACES = [1000, 3000, 5000, 10000, 20000, 50000];

export default async function Market({ searchParams }: { searchParams: Promise<{ face?: string }> }) {
  const u = await requireMember();
  const face = Number((await searchParams).face) || undefined;
  const [items, s] = await Promise.all([marketListings(face), getSettings(await getDb())]);
  const why = tradeBlockReason(u);
  return (
    <>
      <AutoRefresh seconds={20} />
      <PageHeader icon={<Store className="size-5" />} title="マーケット" sub="運営が残高を確認済みの出品のみ掲載しています。買い手手数料は0%です。"
        actions={<div className="card flex items-center gap-3 px-4 py-2 text-sm"><span className="text-slate-500">利用可能残高</span><b className="text-lg text-violet-700">{yen(u.charge_balance)}</b><Link href="/charge" className="btn-primary btn-sm">チャージ</Link></div>} />
      <div className="mb-5 flex flex-wrap gap-2">
        <Link href="/market" className={!face ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}>すべて</Link>
        {FACES.map(f => <Link key={f} href={`/market?face=${f}`} className={face === f ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}>{yen(f)}</Link>)}
      </div>
      {items.length === 0 ? <Empty icon={<ShoppingBag className="size-8 text-slate-300" />}>現在、条件に合う出品はありません</Empty> : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(l => {
            const own = l.seller_id === u.id;
            const short = u.charge_balance < l.price;
            const disabled = own || !!why || short;
            return (
              <div key={l.id} className="card group p-4 transition hover:-translate-y-1 hover:shadow-xl">
                <GiftArt face={l.face} className="h-32" />
                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <div className="text-xs text-slate-500">販売価格</div>
                    <div className="text-2xl font-extrabold text-ink">{yen(l.price)}</div>
                  </div>
                  <div className="text-right">
                    <span className="rounded-lg bg-gradient-to-r from-violet-100 to-fuchsia-100 px-2.5 py-1 text-sm font-bold text-violet-700">{pct(l.rate_x10)}</span>
                    <div className="mt-1 text-xs font-semibold text-emerald-600">{yen(l.face - l.price)} おトク</div>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                  <span className="mono">{maskCode(l.code_head, l.code_tail)}</span>
                  <span className="flex items-center gap-1 text-emerald-600"><BadgeCheck className="size-3.5" />残高確認済 {fmtShort(l.check_at)}</span>
                </div>
                <div className="mt-1 text-xs text-slate-400">出品者 {alias(l.seller_name)}</div>
                <div className="mt-4">
                  {disabled ? (
                    <button disabled className="btn-secondary w-full" title={why ?? ''}>{own ? '自分の出品' : why ? '購入できません' : '残高が不足しています'}</button>
                  ) : (
                    <ModalButton className="btn-primary w-full" label="購入する" title="購入内容の確認">
                      <GiftArt face={l.face} small className="mb-5" />
                      <DL items={[
                        ['販売利率', pct(l.rate_x10)],
                        ['お支払い', <b key="p" className="text-lg">{yen(l.price)}</b>],
                        ['手数料', '¥0'],
                        ['購入後の残高', yen(u.charge_balance - l.price)],
                      ]} />
                      <div className="mt-5"><Notice>購入確定時点の価格でロックされます。購入後 <b>{s.confirmMinutes}分以内</b>にコードを確認し「取引完了」または「エラー申請」を行ってください。期限内に操作がない場合は自動的に取引完了となります。</Notice></div>
                      <ActionForm action={purchaseAction} hidden={{ id: l.id, version: l.version }} className="mt-6 flex justify-end">
                        <SubmitButton pendingText="処理中…">購入を確定する</SubmitButton>
                      </ActionForm>
                    </ModalButton>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
