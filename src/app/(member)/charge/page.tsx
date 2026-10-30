import { Landmark, Wallet } from 'lucide-react';
import { ActionForm, SubmitButton } from '@/components/client';
import { Card, DL, Empty, Field, Notice, PageHeader, Status, Table } from '@/components/ui';
import { LedgerTable } from '@/components/ledger-table';
import { fmtDate, yen } from '@/lib/format';
import { requestChargeAction } from '@/server/actions/member';
import { requireMember } from '@/server/auth';
import { tradeBlockReason } from '@/server/core';
import { getDb } from '@/server/db';
import { ledgerFor, myCharges } from '@/server/queries';
import { getSettings } from '@/server/settings';

export const metadata = { title: 'チャージ' };

export default async function Charge() {
  const u = await requireMember();
  const [s, charges, ledger] = await Promise.all([getSettings(await getDb()), myCharges(u.id), ledgerFor(u.id, 'charge')]);
  const b = s.depositBank;
  const why = tradeBlockReason(u);
  return (
    <>
      <PageHeader icon={<Wallet className="size-5" />} title="チャージ" sub="チャージ残高は商品購入にのみ使用できます（払い戻し・出金はできません）" />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="① 入金申請">
          {why ? <Empty>{why}</Empty> : (
            <ActionForm action={requestChargeAction} className="space-y-4">
              <Field label={`チャージ金額（${yen(s.chargeMin)}〜${yen(s.chargeMax)}）`}><input name="amount" type="number" required min={s.chargeMin} max={s.chargeMax} step={1} className="input text-lg font-semibold" placeholder="10000" /></Field>
              <Field label="振込名義（全角カナ・登録氏名と同一）"><input name="payerName" required defaultValue={u.kana} className="input" /></Field>
              <label className="flex items-start gap-2 text-sm text-slate-600"><input type="checkbox" name="agree" required className="mt-1 accent-violet-600" />チャージ残高は払い戻しできないことに同意します</label>
              <SubmitButton className="btn-primary w-full">入金申請する</SubmitButton>
            </ActionForm>
          )}
        </Card>
        <Card title={<span className="flex items-center gap-2"><Landmark className="size-4 text-violet-600" />② 下記口座へお振込み</span>}>
          <div className="rounded-2xl bg-gradient-to-br from-sky-50 to-violet-50 p-5 ring-1 ring-sky-100">
            <DL items={[['銀行', b.name], ['支店', b.branch], ['種別', b.type], ['口座番号', <span key="n" className="mono text-lg font-bold">{b.number}</span>], ['口座名義', b.holder]]} />
          </div>
          <div className="mt-4"><Notice>③ 運営が名義・金額を確認して承認すると残高に反映され、メールでお知らせします。ご本人名義以外からのお振込みは反映できません。</Notice></div>
        </Card>
      </div>
      <Card className="mt-5" title="入金申請履歴">
        <Table rows={charges.length} head={['申請ID', '申請日時', '申請金額', '振込名義', '状態', '反映額', '備考']}>
          {charges.map(c => <tr key={c.id}><td className="mono text-xs">{c.id}</td><td>{fmtDate(c.created_at)}</td><td className="font-semibold">{yen(c.amount)}</td><td>{c.payer_name}</td><td><Status kind="charge" value={c.status} /></td><td>{yen(c.received)}</td><td className="text-slate-500">{c.note}</td></tr>)}
        </Table>
      </Card>
      <Card className="mt-5" title="チャージ残高の履歴"><LedgerTable rows={ledger} /></Card>
    </>
  );
}
