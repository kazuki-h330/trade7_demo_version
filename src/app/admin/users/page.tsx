import { Users } from 'lucide-react';
import Link from 'next/link';
import { Card, PageHeader, Status, Table } from '@/components/ui';
import { fmtDate, yen } from '@/lib/format';
import { members } from '@/server/queries';

export const metadata = { title: '会員・不正対応' };

export default async function UsersPage() {
  const list = await members();
  return (
    <>
      <PageHeader icon={<Users className="size-5" />} title="会員・不正対応" sub="警告 → 利用制限 → アカウント凍結 → 強制退会 の段階対応。強制退会後も取引履歴・監査ログは保持されます" />
      <Card>
        <Table rows={list.length} head={['会員', '本人確認', '出品者', '状態', 'チャージ', '売上', 'NG出品 / 重複 / ブロック', '登録日']}>
          {list.map(u => (
            <tr key={u.id}>
              <td><Link className="font-semibold text-violet-700 hover:underline" href={`/admin/users/${u.id}`}>{u.name}</Link><div className="text-xs text-slate-400">{u.email}</div></td>
              <td><Status kind="kyc" value={u.kyc_status} /></td><td><Status kind="seller" value={u.seller_status} /></td><td><Status kind="user" value={u.status} /></td>
              <td>{yen(u.charge_balance)}</td><td>{yen(u.sales_balance)}</td>
              <td className={u.flag_invalid + u.flag_dup + u.flag_blocked ? 'font-semibold text-rose-600' : 'text-slate-400'}>{u.flag_invalid} / {u.flag_dup} / {u.flag_blocked}</td>
              <td className="text-xs">{fmtDate(u.created_at)}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
