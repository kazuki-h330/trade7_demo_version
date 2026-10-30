import { IdCard } from 'lucide-react';
import Link from 'next/link';
import { ActionForm, ModalButton, SubmitButton } from '@/components/client';
import { Card, DL, Empty, Field, Notice, PageHeader, Status, Table } from '@/components/ui';
import { fmtDate } from '@/lib/format';
import { reviewKycAction } from '@/server/actions/admin';
import { kycHistory, pendingKyc } from '@/server/queries';

export const metadata = { title: '本人確認審査' };

export default async function KycPage() {
  const [pend, done] = await Promise.all([pendingKyc(), kycHistory()]);
  return (
    <>
      <PageHeader icon={<IdCard className="size-5" />} title="本人確認審査" sub="身分証画像と登録情報（氏名・カナ）を目視で照合し、承認・差戻しを行います" />
      <div className="space-y-5">
        {pend.length === 0 && <Card><Empty>審査待ちの申請はありません 🎉</Empty></Card>}
        {pend.map(u => (
          <Card key={u.id} title={`${u.name}（${u.kana}）`} actions={<Status kind="kyc" value="pending" />}>
            <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
              <a href={`/api/files/${u.file_id}`} target="_blank">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/files/${u.file_id}`} alt="身分証" className="w-full rounded-2xl ring-1 ring-slate-200" />
              </a>
              <div className="space-y-4">
                <DL items={[['会員ID', <Link key="i" className="mono text-violet-700" href={`/admin/users/${u.id}`}>{u.id}</Link>], ['ログインID', <span key="l" className="mono">{u.login_id}</span>], ['書類', u.doc_type], ['提出日時', fmtDate(u.submitted_at)], ['登録日時', fmtDate(u.created_at)]]} />
                <Notice>確認項目：氏名・生年月日・住所の一致 / 有効期限内 / 画像の加工・合成の有無 / 同一人物の多重登録</Notice>
                <div className="flex gap-2">
                  <ActionForm action={reviewKycAction} hidden={{ id: u.id, decision: 'approved', note: '' }} confirm={`${u.name} 様の本人確認を承認しますか？`}>
                    <SubmitButton className="btn-success">承認</SubmitButton>
                  </ActionForm>
                  <ModalButton className="btn-danger" label="差戻し" title="本人確認の差戻し">
                    <ActionForm action={reviewKycAction} hidden={{ id: u.id, decision: 'rejected' }} className="space-y-4">
                      <Field label="差戻し理由（会員へ通知されます）"><select name="note" className="input"><option>画像が不鮮明で確認できません</option><option>登録氏名と書類の氏名が一致しません</option><option>有効期限が切れています</option><option>書類の一部が隠れています</option><option>対象外の書類です</option></select></Field>
                      <div className="flex justify-end"><SubmitButton className="btn-danger">差戻す</SubmitButton></div>
                    </ActionForm>
                  </ModalButton>
                </div>
              </div>
            </div>
          </Card>
        ))}
        <Card title="審査履歴">
          <Table rows={done.length} head={['会員', '書類', '結果', '審査者', '審査日時', '備考']}>
            {done.map((k, i) => <tr key={i}><td><Link className="text-violet-700 hover:underline" href={`/admin/users/${k.user_id}`}>{k.name}</Link></td><td>{k.doc_type}</td><td><Status kind="kyc" value={k.status} /></td><td>{k.reviewer_name ?? '—'}</td><td>{fmtDate(k.reviewed_at)}</td><td className="text-slate-500">{k.note}</td></tr>)}
          </Table>
        </Card>
      </div>
    </>
  );
}
