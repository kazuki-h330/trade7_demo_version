import { Wallet } from 'lucide-react';
import Link from 'next/link';
import { ActionForm, SubmitButton } from '@/components/client';
import { LedgerTable } from '@/components/ledger-table';
import { Card, Field, PageHeader, Status, Table } from '@/components/ui';
import { yen } from '@/lib/format';
import { adjustBalanceAction } from '@/server/actions/admin';
import { ledgerRecent, members } from '@/server/queries';

export const metadata = { title: '残高・調整' };

export default async function Balances() {
  const [list, ledger] = await Promise.all([members(), ledgerRecent()]);
  return (
    <>
      <PageHeader icon={<Wallet className="size-5" />} title="残高・調整" sub="誤入金・取引中止などの例外時に、理由を記録したうえで残高を訂正できます（全操作が監査ログに残ります）" />
      <Card title="残高訂正">
        <ActionForm action={adjustBalanceAction} className="grid gap-4 md:grid-cols-[1fr_160px_150px_2fr_auto] md:items-end" confirm="残高を訂正します。よろしいですか？">
          <Field label="会員"><select name="userId" className="input">{list.map(u => <option key={u.id} value={u.id}>{u.name}（{u.login_id}）</option>)}</select></Field>
          <Field label="対象"><select name="account" className="input"><option value="charge">チャージ残高</option><option value="sales">売上残高</option></select></Field>
          <Field label="増減額（例 -500）"><input name="delta" type="number" step={1} required className="input" /></Field>
          <Field label="理由（必須・会員へ通知）"><input name="reason" required className="input" /></Field>
          <SubmitButton>訂正を記録</SubmitButton>
        </ActionForm>
      </Card>
      <Card className="mt-5" title="会員別残高">
        <Table rows={list.length} head={['会員', '状態', 'チャージ残高', '売上残高（未払）', '係争中の保留']}>
          {list.map(u => <tr key={u.id}><td><Link className="text-violet-700 hover:underline" href={`/admin/users/${u.id}`}>{u.name}</Link></td><td><Status kind="user" value={u.status} /></td><td className="font-semibold">{yen(u.charge_balance)}</td><td>{yen(u.sales_balance)}</td><td className={u.disputed ? 'font-semibold text-rose-600' : ''}>{yen(u.disputed)}</td></tr>)}
        </Table>
      </Card>
      <Card className="mt-5" title="残高変動履歴（直近100件）"><LedgerTable rows={ledger} showUser showAccount /></Card>
    </>
  );
}
