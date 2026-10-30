import { CircleCheck, ImagePlus, MessageSquareWarning, ShieldAlert, Timer } from 'lucide-react';
import Link from 'next/link';
import { ActionForm, AdminDecrypt, AutoRefresh, Countdown, ModalButton, RevealCode, SubmitButton } from '@/components/client';
import { Badge, Card, DL, Field, GiftArt, Notice, Status, Table } from '@/components/ui';
import { alias, fmtDate, maskCode, pct, yen } from '@/lib/format';
import { resolveDisputeAction } from '@/server/actions/admin';
import { confirmTradeAction, openDisputeAction, postMessageAction } from '@/server/actions/member';
import type { UserRow } from '@/server/core';
import { auditFor, tradeDetail } from '@/server/queries';
import { DECRYPT_REASONS } from '@/server/services/listings';
import { DISPUTE_REASONS } from '@/server/services/trades';

type Detail = NonNullable<Awaited<ReturnType<typeof tradeDetail>>>;

const STEPS = ['購入（価格ロック）', '受取確認', 'エラー協議', '確定'];

export async function TradeDetail({ user, data }: { user: UserRow; data: Detail }) {
  const { t, listing: l, dispute, messages, files } = data;
  const admin = user.role === 'admin';
  const isBuyer = t.buyer_id === user.id, isSeller = t.seller_id === user.id;
  const deadline = new Date(t.deadline).toISOString();
  const stepIdx = { awaiting: 1, disputed: 2, completed: 4, cancelled: 4 }[t.status] ?? 0;
  const who = (id: string, name: string) => (admin ? <Link className="text-violet-700 hover:underline" href={`/admin/users/${id}`}>{name}</Link> : id === user.id ? 'あなた' : alias(name));
  const logs = admin ? await auditFor([t.id, l.id]) : [];

  return (
    <>
      {(t.status === 'awaiting' || t.status === 'disputed') && <AutoRefresh seconds={10} />}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {STEPS.map((s, i) => {
          if (i === 2 && !dispute) return null;
          const label = i === 3 ? (t.status === 'cancelled' ? '取引中止' : '取引完了') : s;
          const cls = i < stepIdx ? 'bg-emerald-100 text-emerald-700' : i === stepIdx ? 'brand-gradient text-white shadow-md' : 'bg-white/80 text-slate-400 ring-1 ring-slate-200';
          return <span key={i} className={`rounded-full px-3.5 py-1 text-xs font-semibold ${cls}`}>{label}</span>;
        })}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
        <Card title="取引内容">
          <GiftArt face={t.face} className="mb-5 h-28" />
          <DL items={[
            ['取引ID', <span key="i" className="mono">{t.id}</span>],
            ['状態', <Status key="s" kind="trade" value={t.status} />],
            ['販売利率', `${pct(t.rate_x10)}（購入時にロック）`],
            ['取引価格', <b key="p">{yen(t.price)}</b>],
            ...((isBuyer || admin) ? [['買い手手数料', '¥0'] as [string, string]] : []),
            ...((isSeller || admin) ? [['売り手手数料', yen(t.fee)], ['売上（控除後）', yen(t.seller_net)]] as [string, string][] : []),
            ['売り手', who(t.seller_id, t.seller_name)],
            ['買い手', who(t.buyer_id, t.buyer_name)],
            ['購入日時', fmtDate(t.purchased_at)],
            ['確認期限', fmtDate(t.deadline)],
            ['確定', t.completed_at ? `${fmtDate(t.completed_at)}（${{ buyer: '買い手確認', auto: '自動確定', admin: '運営処理' }[t.completed_by ?? 'buyer']}）` : '—'],
            ...(admin ? [
              ['運営残高確認', l.check_result ? `${l.check_result.toUpperCase()} ${yen(l.check_balance)}（${l.staff_name ?? ''} ${fmtDate(l.check_at)}）` : '—'],
              ['支払', t.payout_id ? <span key="po" className="mono">{t.payout_id}</span> : '未'],
            ] as [string, React.ReactNode][] : []),
          ]} />
        </Card>

        <div className="space-y-5">
          {isBuyer && t.status === 'awaiting' && (
            <Card title={<span className="flex items-center gap-2"><Timer className="size-4 text-violet-600" />受取確認</span>}>
              <div className="rounded-2xl bg-gradient-to-br from-violet-50 to-fuchsia-50 p-5 text-center ring-1 ring-violet-100">
                <div className="text-xs font-semibold text-slate-500">自動確定まで</div>
                <Countdown deadline={deadline} big />
              </div>
              <p className="mt-4 text-sm text-slate-600">コードを表示して Apple アカウントで残高を確認してください。期限内に操作がない場合は<b>自動的に取引完了</b>となります。</p>
              <div className="mt-4"><RevealCode tradeId={t.id} masked={maskCode(l.code_head, l.code_tail)} /></div>
              <div className="mt-5 flex flex-wrap gap-2">
                <ActionForm action={confirmTradeAction} hidden={{ id: t.id }} confirm={'ギフト券の残高に問題がないことを確認しましたか？\n取引完了後はエラー申請できません。'}>
                  <SubmitButton className="btn-success"><CircleCheck className="size-4" />取引完了（問題なし）</SubmitButton>
                </ActionForm>
                <ModalButton className="btn-danger" label={<><MessageSquareWarning className="size-4" />エラー申請</>} title="エラー申請">
                  <ActionForm action={openDisputeAction} hidden={{ id: t.id }} className="space-y-4">
                    <Field label="申請理由"><select name="reason" className="input">{DISPUTE_REASONS.map(r => <option key={r}>{r}</option>)}</select></Field>
                    <Field label="詳細"><textarea name="detail" rows={3} maxLength={2000} className="input" placeholder="残高照会の結果など、状況を具体的にご記入ください" /></Field>
                    <Field label="画面のスクリーンショット（最大3枚・各5MBまで）" hint="残高照会画面などを添付してください。当事者と運営のみが閲覧できます。">
                      <input type="file" name="shots" multiple accept="image/png,image/jpeg,image/webp" className="input file:mr-3 file:rounded-lg file:border-0 file:bg-violet-100 file:px-3 file:py-1 file:text-violet-700" />
                    </Field>
                    <Notice tone="amber">申請すると取引と代金は保留（フリーズ）され、当事者と運営のみが参加できる協議ページが作成されます。</Notice>
                    <div className="flex justify-end"><SubmitButton className="btn-danger" pendingText="送信中…"><ImagePlus className="size-4" />申請する</SubmitButton></div>
                  </ActionForm>
                </ModalButton>
              </div>
            </Card>
          )}
          {isBuyer && t.status !== 'awaiting' && t.status !== 'cancelled' && (
            <Card title="ギフトコード"><RevealCode tradeId={t.id} masked={maskCode(l.code_head, l.code_tail)} /></Card>
          )}
          {isSeller && t.status === 'awaiting' && (
            <Card title="受取確認待ち"><p className="text-sm text-slate-600">買い手の受取確認を待っています。自動確定まで <Countdown deadline={deadline} /></p></Card>
          )}
          {admin && (
            <Card title={<span className="flex items-center gap-2"><ShieldAlert className="size-4 text-violet-600" />運営メニュー</span>}>
              <div className="flex flex-wrap items-center gap-3"><AdminDecrypt listingId={l.id} reasons={DECRYPT_REASONS} /><span className="mono text-xs text-slate-400">{maskCode(l.code_head, l.code_tail)}</span></div>
            </Card>
          )}
        </div>
      </div>

      {dispute && (
        <Card className="mt-5" title={<span className="flex items-center gap-2"><MessageSquareWarning className="size-4 text-rose-500" />エラー申請・協議ページ</span>} actions={t.status === 'disputed' ? <Badge tone="red">代金保留中</Badge> : <Badge tone="slate">協議終了</Badge>}>
          <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
            <div className="space-y-4">
              <DL items={[['申請日時', fmtDate(dispute.opened_at)], ['申請理由', dispute.reason], ['詳細', dispute.detail || '—'], ...(dispute.resolution ? [['運営判断', <b key="r">{dispute.resolution}</b>] as [string, React.ReactNode]] : [])]} />
              <div>
                <div className="label">添付スクリーンショット（当事者と運営のみ閲覧可）</div>
                <div className="flex flex-wrap gap-2">
                  {files.length ? files.map(f => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <a key={f.id} href={`/api/files/${f.id}`} target="_blank"><img src={`/api/files/${f.id}`} alt="スクリーンショット" className="h-32 rounded-xl object-cover ring-1 ring-slate-200 transition hover:ring-violet-400" /></a>
                  )) : <span className="text-sm text-slate-400">添付なし</span>}
                </div>
              </div>
              {admin && t.status === 'disputed' && (
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="mb-3 text-sm font-semibold">運営の判断</div>
                  <div className="flex flex-wrap gap-2">
                    <ModalButton className="btn-success" label="取引完了として処理" title="取引完了として処理">
                      <ActionForm action={resolveDisputeAction} hidden={{ id: t.id, decision: 'complete' }} className="space-y-4">
                        <p className="text-sm text-slate-600">売り手に売上（手数料控除後 {yen(t.seller_net)}）を計上します。</p>
                        <Field label="判断理由（当事者へ通知されます）"><textarea name="note" required rows={3} className="input" /></Field>
                        <div className="flex justify-end"><SubmitButton className="btn-success">確定する</SubmitButton></div>
                      </ActionForm>
                    </ModalButton>
                    <ModalButton className="btn-danger" label="取引中止（返還）" title="取引中止として処理">
                      <ActionForm action={resolveDisputeAction} hidden={{ id: t.id, decision: 'cancel' }} className="space-y-4">
                        <p className="text-sm text-slate-600">購入代金 {yen(t.price)} を買い手のチャージ残高へ返還し、出品を取引中止にします。</p>
                        <Field label="判断理由（当事者へ通知されます）"><textarea name="note" required rows={3} className="input" /></Field>
                        <div className="flex justify-end"><SubmitButton className="btn-danger">確定する</SubmitButton></div>
                      </ActionForm>
                    </ModalButton>
                  </div>
                </div>
              )}
            </div>
            <div>
              <Notice tone="amber">ギフトコード・メールアドレス・電話番号・外部SNSのIDなどの送信は禁止されています。送信内容は自動判定（ルール＋AI）され、違反は送信ブロック・記録されます。</Notice>
              <div className="mt-3 flex max-h-[420px] flex-col gap-2.5 overflow-y-auto rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-100">
                {messages.length === 0 && <p className="py-6 text-center text-sm text-slate-400">メッセージはまだありません</p>}
                {messages.map(m => {
                  const mine = m.user_id === user.id;
                  const bubble = m.role === 'admin' ? 'bg-amber-50 ring-amber-200' : mine ? 'bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white ring-transparent' : 'bg-white ring-slate-200';
                  return (
                    <div key={m.id} className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ring-1 ${bubble} ${mine ? 'self-end' : ''}`}>
                      <div className={`mb-0.5 text-[11px] ${mine && m.role !== 'admin' ? 'text-white/80' : 'text-slate-400'}`}>
                        {{ buyer: '買い手', seller: '売り手', admin: '運営' }[m.role]}{admin ? ` ${m.name}` : ''} ・ {fmtDate(m.created_at)} {m.flagged && admin && '⚠ AI注意'}
                      </div>
                      <div className="whitespace-pre-wrap">{m.body}</div>
                    </div>
                  );
                })}
              </div>
              {t.status === 'disputed' && (
                <ActionForm action={postMessageAction} hidden={{ id: t.id }} className="mt-3 flex gap-2">
                  <textarea name="body" required rows={2} maxLength={2000} className="input flex-1" placeholder="メッセージを入力" />
                  <SubmitButton pendingText="判定中…">送信</SubmitButton>
                </ActionForm>
              )}
            </div>
          </div>
        </Card>
      )}

      {admin && (
        <Card className="mt-5" title="この取引の監査ログ">
          <Table rows={logs.length} head={['日時', '操作者', '操作', '内容', 'IP']}>
            {logs.map(a => <tr key={a.seq}><td className="whitespace-nowrap">{fmtDate(a.at)}</td><td>{a.actor_name}</td><td className="mono text-xs">{a.action}</td><td>{a.detail}</td><td className="mono text-xs">{a.ip}</td></tr>)}
          </Table>
        </Card>
      )}
    </>
  );
}
