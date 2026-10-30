import { BadgeCheck, IdCard, Landmark, UserRound } from 'lucide-react';
import { ActionForm, ImageInput, SubmitButton } from '@/components/client';
import { Card, DL, Field, Notice, PageHeader, Status, Table } from '@/components/ui';
import { fmtDate } from '@/lib/format';
import { resendVerificationAction, verifyEmailAction } from '@/server/actions/auth';
import { saveBankAction, submitKycAction } from '@/server/actions/member';
import { requireMember } from '@/server/auth';
import { bankOf, latestKyc, sanctionsOf } from '@/server/queries';
import { DOC_TYPES } from '@/server/services/accounts';

export const metadata = { title: 'マイページ' };

export default async function Account({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const u = await requireMember();
  const [kyc, bank, sanctions] = await Promise.all([latestKyc(u.id), bankOf(u.id), sanctionsOf(u.id)]);
  const welcome = (await searchParams).welcome;
  return (
    <>
      <PageHeader icon={<UserRound className="size-5" />} title="マイページ" />
      {welcome && !u.email_verified_at && <div className="mb-5"><Notice tone="green">ご登録ありがとうございます！メールに届いた6桁の認証コードを入力してください。</Notice></div>}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="会員情報">
          <DL items={[
            ['会員ID', <span key="i" className="mono">{u.id}</span>],
            ['氏名', `${u.name}（${u.kana}）`],
            ['メール', u.email],
            ['メール認証', u.email_verified_at ? <span key="v" className="flex items-center gap-1 text-emerald-600"><BadgeCheck className="size-4" />認証済</span> : <span key="v" className="text-amber-600">未認証</span>],
            ['アカウント状態', <Status key="s" kind="user" value={u.status} />],
            ['本人確認', <Status key="k" kind="kyc" value={u.kyc_status} />],
            ['出品者審査', <Status key="sl" kind="seller" value={u.seller_status} />],
            ['登録日', fmtDate(u.created_at)],
          ]} />
          {!u.email_verified_at && (
            <div className="mt-5 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
              <ActionForm action={verifyEmailAction} className="flex flex-wrap items-end gap-2">
                <Field label="認証コード（6桁）"><input name="code" required inputMode="numeric" maxLength={6} className="input mono w-40 text-lg tracking-[.3em]" /></Field>
                <SubmitButton>認証する</SubmitButton>
              </ActionForm>
              <ActionForm action={resendVerificationAction} className="mt-2"><SubmitButton className="btn-ghost btn-sm">認証コードを再送する</SubmitButton></ActionForm>
            </div>
          )}
        </Card>

        <Card title={<span className="flex items-center gap-2"><IdCard className="size-4 text-violet-600" />本人確認</span>}>
          <div className="mb-3 flex items-center gap-2">状態：<Status kind="kyc" value={u.kyc_status} /></div>
          {kyc && (
            <div className="mb-4 flex flex-wrap items-start gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/files/${kyc.file_id}`} alt="提出書類" className="h-28 rounded-xl object-cover ring-1 ring-slate-200" />
              <div className="text-sm text-slate-600">
                <div>{kyc.doc_type}</div><div className="text-xs text-slate-400">提出 {fmtDate(kyc.submitted_at)}</div>
                {kyc.status === 'rejected' && kyc.note && <div className="mt-2 font-semibold text-rose-600">差戻し理由：{kyc.note}</div>}
              </div>
            </div>
          )}
          {(u.kyc_status === 'none' || u.kyc_status === 'rejected') && (
            u.email_verified_at ? (
              <ActionForm action={submitKycAction} className="space-y-4">
                <Field label="書類の種類"><select name="docType" className="input">{DOC_TYPES.map(d => <option key={d}>{d}</option>)}</select></Field>
                <Field label="身分証画像（PNG / JPEG / WebP・5MBまで）" hint="氏名・生年月日・住所・有効期限が鮮明に写るように撮影してください。画像は再エンコードされ、位置情報などのメタデータは削除されます。">
                  <ImageInput name="file" required max={1} />
                </Field>
                <SubmitButton pendingText="アップロード中…">提出する</SubmitButton>
              </ActionForm>
            ) : <Notice tone="amber">先にメール認証を完了してください。</Notice>
          )}
          {u.kyc_status === 'pending' && <Notice>運営が審査中です。完了するとメールでお知らせします。</Notice>}
        </Card>

        <Card title={<span className="flex items-center gap-2"><Landmark className="size-4 text-violet-600" />売上の振込先口座</span>}>
          <ActionForm action={saveBankAction} reset={false} className="grid gap-4 sm:grid-cols-2">
            <Field label="銀行名"><input name="bankName" required defaultValue={bank?.bank_name} className="input" /></Field>
            <Field label="支店名"><input name="branch" required defaultValue={bank?.branch} className="input" /></Field>
            <Field label="口座種別"><select name="type" defaultValue={bank?.account_type ?? '普通'} className="input"><option>普通</option><option>当座</option></select></Field>
            <Field label="口座番号（7桁）"><input name="number" required pattern="\d{7}" defaultValue={bank?.account_number} className="input mono" /></Field>
            <Field label="口座名義（全角カナ・本人名義のみ）" className="sm:col-span-2"><input name="holder" required defaultValue={bank?.holder ?? u.kana} className="input" /></Field>
            <div className="sm:col-span-2"><SubmitButton>保存</SubmitButton></div>
          </ActionForm>
        </Card>

        <Card title="運営からの措置履歴">
          <Table rows={sanctions.length} empty="措置はありません" head={['日時', '措置', '理由']}>
            {sanctions.map((s, i) => <tr key={i}><td>{fmtDate(s.created_at)}</td><td><Status kind="user" value={s.level} /></td><td>{s.reason}</td></tr>)}
          </Table>
        </Card>
      </div>
    </>
  );
}
