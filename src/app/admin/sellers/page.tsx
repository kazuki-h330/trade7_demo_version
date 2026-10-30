import { ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { ActionForm, ModalButton, SubmitButton } from '@/components/client';
import { Card, Field, PageHeader, Status, Table } from '@/components/ui';
import { fmtDate } from '@/lib/format';
import { reviewSellerAction } from '@/server/actions/admin';
import { sellerApplicants } from '@/server/queries';

export const metadata = { title: '出品者審査' };

export default async function SellersPage() {
  const list = await sellerApplicants();
  return (
    <>
      <PageHeader icon={<ShieldAlert className="size-5" />} title="出品者審査" sub="本人確認済みであっても、出品者審査を通過した会員のみ出品できます" />
      <Card>
        <Table rows={list.length} empty="申請はありません" head={['会員', '本人確認', '申請日時', '購入実績', '措置履歴', '不正指標', '状態', '操作']}>
          {list.map(u => (
            <tr key={u.id}>
              <td><Link className="font-semibold text-violet-700 hover:underline" href={`/admin/users/${u.id}`}>{u.name}</Link><div className="text-xs text-slate-400">{u.login_id}</div></td>
              <td><Status kind="kyc" value={u.kyc_status} /></td>
              <td>{fmtDate(u.seller_applied_at)}</td>
              <td>{u.completed_buys}件</td>
              <td>{u.sanction_count}件</td>
              <td className="text-xs">NG出品 {u.flag_invalid} / 重複 {u.flag_dup} / ブロック {u.flag_blocked}</td>
              <td><Status kind="seller" value={u.seller_status} /></td>
              <td>
                <div className="flex gap-1.5">
                  {u.seller_status === 'pending' && (
                    <ActionForm action={reviewSellerAction} hidden={{ id: u.id, decision: 'approved', note: '' }} confirm={`${u.name} 様に出品権限を付与しますか？`}><SubmitButton className="btn-success btn-sm">承認</SubmitButton></ActionForm>
                  )}
                  {(u.seller_status === 'pending' || u.seller_status === 'approved') && (
                    <ModalButton className="btn-secondary btn-sm text-rose-600" label={u.seller_status === 'pending' ? '否認' : '権限取消'} title="出品者審査の否認／取消">
                      <ActionForm action={reviewSellerAction} hidden={{ id: u.id, decision: 'rejected' }} className="space-y-4">
                        <Field label="理由（会員へ通知されます）"><input name="note" required className="input" /></Field>
                        <p className="text-xs text-slate-500">出品中・確認待ちの出品はすべて取り下げられます。</p>
                        <div className="flex justify-end"><SubmitButton className="btn-danger">確定</SubmitButton></div>
                      </ActionForm>
                    </ModalButton>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
