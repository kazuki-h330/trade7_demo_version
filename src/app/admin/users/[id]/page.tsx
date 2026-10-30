import { Ban, Snowflake, TriangleAlert, UserRound } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionForm, AdminResetPassword, ModalButton, SubmitButton } from '@/components/client';
import { LedgerTable } from '@/components/ledger-table';
import { Card, DL, Field, Notice, PageHeader, Status, Table } from '@/components/ui';
import { fmtDate, uaShort, yen } from '@/lib/format';
import { sanctionAction } from '@/server/actions/admin';
import { auditSearch, bankOf, latestKyc, ledgerFor, myTrades, sanctionsOf, userById } from '@/server/queries';

export const metadata = { title: '会員詳細' };

const LEVELS = [
  { level: 'warned', label: '警告', cls: 'btn-secondary text-amber-700', icon: TriangleAlert },
  { level: 'restricted', label: '利用制限', cls: 'btn-secondary text-orange-700', icon: Ban },
  { level: 'frozen', label: 'アカウント凍結', cls: 'btn-danger', icon: Snowflake },
  { level: 'expelled', label: '強制退会', cls: 'btn-danger', icon: Ban },
  { level: 'active', label: '措置解除', cls: 'btn-success', icon: UserRound },
] as const;

export default async function UserDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await userById(id);
  if (!u) notFound();
  const [bank, kyc, sanctions, trades, ledger, logs] = await Promise.all([bankOf(id), latestKyc(id), sanctionsOf(id), myTrades(id), ledgerFor(id), auditSearch(id, 100)]);
  return (
    <>
      <PageHeader icon={<UserRound className="size-5" />} title={<span className="flex items-center gap-3">{u.name}<Status kind="user" value={u.status} /></span>} sub={<>ログインID：<span className="mono">{u.login_id}</span></>} actions={<><AdminResetPassword userId={u.id} name={u.name} /><Link href="/admin/users" className="btn-secondary">一覧へ</Link></>} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="会員情報">
          <DL items={[
            ['会員ID', <span key="i" className="mono">{u.id}</span>], ['氏名（カナ）', `${u.name}（${u.kana}）`],
            ['ログインID', <span key="l" className="mono">{u.login_id}</span>],
            ['パスワード', u.must_change_password ? <span key="p" className="text-amber-600">仮パスワード（未変更）</span> : '設定済'],
            ['本人確認', <Status key="k" kind="kyc" value={u.kyc_status} />], ['出品者', <Status key="s" kind="seller" value={u.seller_status} />],
            ['チャージ残高', <b key="c">{yen(u.charge_balance)}</b>], ['売上残高', <b key="sb">{yen(u.sales_balance)}</b>],
            ['振込先', bank ? `${bank.bank_name} ${bank.branch} ${bank.account_type} ${bank.account_number} ${bank.holder}` : '未登録'],
            ['不正指標', `残高NG出品 ${u.flag_invalid}件 / 重複コード ${u.flag_dup}件 / 送信ブロック ${u.flag_blocked}件`],
            ['登録日', fmtDate(u.created_at)],
          ]} />
          {kyc && (
            <a href={`/api/files/${kyc.file_id}`} target="_blank" className="mt-4 block w-fit">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/files/${kyc.file_id}`} alt="身分証" className="h-32 rounded-xl ring-1 ring-slate-200" />
            </a>
          )}
        </Card>
        <Card title="段階対応（措置）">
          <div className="flex flex-wrap gap-2">
            {LEVELS.map(l => (
              <ModalButton key={l.level} className={l.cls} label={<><l.icon className="size-4" />{l.label}</>} title={l.label}>
                <ActionForm action={sanctionAction} hidden={{ id: u.id, level: l.level }} className="space-y-4">
                  <Field label="理由"><select name="preset" className="input"><option value="">（選択または下に入力）</option><option>無効なギフトコードの繰り返し出品</option><option>売却後のリデイーム（事後利用）の疑い</option><option>多重登録・なりすましの疑い</option><option>協議ページでの禁止行為</option><option>調査完了のため解除</option></select></Field>
                  <Field label="詳細（会員へ通知・記録）"><input name="reason" className="input" /></Field>
                  {(l.level === 'frozen' || l.level === 'expelled') && <Notice tone="red">出品中の商品はすべて取り下げられ、売上の支払いは保留されます。{l.level === 'expelled' && 'ログイン中のセッションも無効化されます。'}</Notice>}
                  <div className="flex justify-end"><SubmitButton className={l.level === 'active' ? 'btn-success' : 'btn-danger'}>{l.label}を実施</SubmitButton></div>
                </ActionForm>
              </ModalButton>
            ))}
          </div>
          <div className="mt-4 mb-5"><Notice>警告：記録と通知のみ ／ 利用制限：出品・購入・チャージ停止 ／ 凍結：全操作停止・出品取下げ・残高保全 ／ 強制退会：ログイン不可・記録は保持</Notice></div>
          <Table rows={sanctions.length} empty="措置履歴はありません" head={['日時', '措置', '理由', '実施者']}>
            {sanctions.map((s, i) => <tr key={i}><td className="text-xs">{fmtDate(s.created_at)}</td><td><Status kind="user" value={s.level} /></td><td>{s.reason}</td><td>{s.by_name ?? '自動'}</td></tr>)}
          </Table>
        </Card>
      </div>
      <Card className="mt-5" title="取引">
        <Table rows={trades.length} head={['取引ID', '区分', '価格', '状態', '購入日時']}>
          {trades.map(t => <tr key={t.id}><td><Link className="mono text-violet-700" href={`/admin/trades/${t.id}`}>{t.id}</Link></td><td>{t.buyer_id === id ? '購入' : '販売'}</td><td>{yen(t.price)}</td><td><Status kind="trade" value={t.status} /></td><td className="text-xs">{fmtDate(t.purchased_at)}</td></tr>)}
        </Table>
      </Card>
      <Card className="mt-5" title="残高履歴"><LedgerTable rows={ledger} showAccount /></Card>
      <Card className="mt-5" title="関連する監査ログ">
        <Table rows={logs.length} head={['日時', '操作者', '操作', '内容', 'IP', '端末']}>
          {logs.map(a => <tr key={a.seq}><td className="text-xs whitespace-nowrap">{fmtDate(a.at)}</td><td>{a.actor_name}</td><td className="mono text-xs">{a.action}</td><td>{a.detail}</td><td className="mono text-xs">{a.ip}</td><td className="text-xs" title={a.ua}>{uaShort(a.ua)}</td></tr>)}
        </Table>
      </Card>
    </>
  );
}
