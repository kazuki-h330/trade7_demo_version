import { Settings } from 'lucide-react';
import { ActionForm, SubmitButton } from '@/components/client';
import { Card, Field, Notice, PageHeader } from '@/components/ui';
import { updateSettingsAction } from '@/server/actions/admin';
import { getDb } from '@/server/db';
import { getSettings } from '@/server/settings';

export const metadata = { title: '設定' };

export default async function SettingsPage() {
  const s = await getSettings(await getDb());
  const b = s.depositBank;
  return (
    <>
      <PageHeader icon={<Settings className="size-5" />} title="設定" sub="仕様未確定の値（上限・手数料・確認時間など）は管理画面から変更できます。変更は監査ログに記録されます" />
      <ActionForm action={updateSettingsAction} reset={false} confirm="設定を保存します。新しい値は以後の取引から適用されます。">
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="取引ルール">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="売り手手数料（%）"><input name="feePct" type="number" step={0.01} min={0} max={20} defaultValue={s.feeBps / 100} className="input" /></Field>
              <Field label="受取確認時間（分）"><input name="confirmMinutes" type="number" min={1} max={1440} defaultValue={s.confirmMinutes} className="input" /></Field>
              <Field label="販売利率 下限（%）"><input name="rateMin" type="number" step={0.1} defaultValue={s.rateMinX10 / 10} className="input" /></Field>
              <Field label="販売利率 上限（%）"><input name="rateMax" type="number" step={0.1} defaultValue={s.rateMaxX10 / 10} className="input" /></Field>
              <Field label="出品 額面 最低（円）"><input name="faceMin" type="number" defaultValue={s.faceMin} className="input" /></Field>
              <Field label="出品 額面 上限（円）"><input name="faceMax" type="number" defaultValue={s.faceMax} className="input" /></Field>
            </div>
          </Card>
          <Card title="チャージ">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="1回の最低額（円）"><input name="chargeMin" type="number" defaultValue={s.chargeMin} className="input" /></Field>
              <Field label="1回の上限（円）"><input name="chargeMax" type="number" defaultValue={s.chargeMax} className="input" /></Field>
              <Field label="入金先 銀行"><input name="bankName" defaultValue={b.name} className="input" /></Field>
              <Field label="入金先 支店"><input name="bankBranch" defaultValue={b.branch} className="input" /></Field>
              <Field label="入金先 口座番号"><input name="bankNumber" defaultValue={b.number} className="input" /></Field>
              <Field label="入金先 口座名義"><input name="bankHolder" defaultValue={b.holder} className="input" /></Field>
            </div>
          </Card>
          <Card title="禁止行為検知">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="aiCheck" defaultChecked={s.aiCheck} className="accent-violet-600" />AI判定（Gemini）を有効にする</label>
            <div className="mt-4"><Notice>ルール判定は常に有効です。AI判定を無効にした場合、ルールに該当しないメッセージはそのまま送信されます。</Notice></div>
          </Card>
        </div>
        <div className="mt-5 flex justify-end"><SubmitButton>設定を保存</SubmitButton></div>
      </ActionForm>
    </>
  );
}
