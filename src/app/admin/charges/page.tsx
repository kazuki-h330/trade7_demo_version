import { Banknote } from 'lucide-react';
import Link from 'next/link';
import { ActionForm, ModalButton, SubmitButton } from '@/components/client';
import { Badge, Card, DL, Field, PageHeader, Status, Table } from '@/components/ui';
import { fmtDate, yen } from '@/lib/format';
import { reviewChargeAction } from '@/server/actions/admin';
import { getDb } from '@/server/db';
import { chargesByStatus } from '@/server/queries';
import { getSettings } from '@/server/settings';

export const metadata = { title: 'チャージ承認' };
const norm = (s: string) => s.replace(/[\s　]/g, '');

export default async function Charges() {
  const [pend, done, s] = await Promise.all([chargesByStatus(true), chargesByStatus(false), getSettings(await getDb())]);
  return (
    <>
      <PageHeader icon={<Banknote className="size-5" />} title="チャージ承認" sub={`${s.depositBank.name} ${s.depositBank.branch} の入金明細と照合し、名義・金額が一致したものを承認します`} />
      <Card title={`着金確認待ち（${pend.length}件）`}>
        <Table rows={pend.length} empty="確認待ちの申請はありません" head={['申請ID', '会員', '登録カナ', '振込名義', '申請金額', '申請日時', '操作']}>
          {pend.map(c => {
            const match = norm(c.kana) === norm(c.payer_name);
            return (
              <tr key={c.id}>
                <td className="mono text-xs">{c.id}</td><td><Link className="text-violet-700" href={`/admin/users/${c.user_id}`}>{c.user_name}</Link></td><td>{c.kana}</td>
                <td>{c.payer_name} {match ? <Badge tone="green">一致</Badge> : <Badge tone="red">不一致</Badge>}</td>
                <td className="text-base font-bold">{yen(c.amount)}</td><td className="text-xs">{fmtDate(c.created_at)}</td>
                <td>
                  <div className="flex gap-1.5">
                    <ModalButton className="btn-success btn-sm" label="着金確認・承認" title="着金確認・承認">
                      <ActionForm action={reviewChargeAction} hidden={{ id: c.id, decision: 'approved' }} className="space-y-4">
                        <DL items={[['会員', `${c.user_name}（${c.kana}）`], ['申請金額', yen(c.amount)], ['振込名義', c.payer_name]]} />
                        <Field label="実際の着金額（円）"><input name="received" type="number" min={1} required defaultValue={c.amount} className="input text-lg font-semibold" /></Field>
                        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="nameOk" required className="accent-emerald-600" />振込名義が会員本人の名義であることを確認した</label>
                        <Field label="備考"><input name="note" defaultValue="名義・金額一致" className="input" /></Field>
                        <div className="flex justify-end"><SubmitButton className="btn-success">承認して残高に反映</SubmitButton></div>
                      </ActionForm>
                    </ModalButton>
                    <ModalButton className="btn-secondary btn-sm text-rose-600" label="却下" title="入金申請の却下">
                      <ActionForm action={reviewChargeAction} hidden={{ id: c.id, decision: 'rejected' }} className="space-y-4">
                        <Field label="却下理由（会員へ通知）"><select name="note" className="input"><option>本人名義以外からのお振込みのため</option><option>期限内に着金が確認できなかったため</option><option>申請内容と着金内容が一致しないため</option></select></Field>
                        <div className="flex justify-end"><SubmitButton className="btn-danger">却下する</SubmitButton></div>
                      </ActionForm>
                    </ModalButton>
                  </div>
                </td>
              </tr>
            );
          })}
        </Table>
      </Card>
      <Card className="mt-5" title="処理済み">
        <Table rows={done.length} head={['申請ID', '会員', '申請金額', '反映額', '状態', '処理者', '処理日時', '備考']}>
          {done.map(c => <tr key={c.id}><td className="mono text-xs">{c.id}</td><td>{c.user_name}</td><td>{yen(c.amount)}</td><td className="font-semibold">{yen(c.received)}</td><td><Status kind="charge" value={c.status} /></td><td>{c.reviewer_name}</td><td className="text-xs">{fmtDate(c.reviewed_at)}</td><td className="text-slate-500">{c.note}</td></tr>)}
        </Table>
      </Card>
    </>
  );
}
