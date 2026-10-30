import Link from 'next/link';
import { Table } from '@/components/ui';
import { fmtDate, LABEL, signedYen, yen } from '@/lib/format';
import type { LedgerView } from '@/server/queries';

export function LedgerTable({ rows, showUser, showAccount }: { rows: LedgerView[]; showUser?: boolean; showAccount?: boolean }) {
  return (
    <Table rows={rows.length} empty="履歴はありません" head={['日時', ...(showUser ? ['会員'] : []), ...(showAccount ? ['口座'] : []), '種別', '増減', '残高', '参照', 'メモ']}>
      {rows.map(x => (
        <tr key={x.id}>
          <td className="whitespace-nowrap">{fmtDate(x.created_at)}</td>
          {showUser && <td><Link className="text-violet-700 hover:underline" href={`/admin/users/${x.user_id}`}>{x.user_name}</Link></td>}
          {showAccount && <td>{x.account === 'charge' ? 'チャージ' : '売上'}</td>}
          <td>{LABEL.ledger[x.kind as keyof typeof LABEL.ledger] ?? x.kind}</td>
          <td className={`font-semibold ${x.delta < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{signedYen(x.delta)}</td>
          <td>{yen(x.balance_after)}</td>
          <td className="mono text-xs text-slate-500">{x.ref}</td>
          <td className="text-slate-500">{x.note}</td>
        </tr>
      ))}
    </Table>
  );
}
