import { audit, verifyAuditChain } from '../audit';
import { fail, type Ctx } from '../core';
import { getDb } from '../db';
import { getSettings, saveSettings, type Settings } from '../settings';
import { requireAdmin } from './common';

export async function updateSettings(ctx: Ctx, next: Settings) {
  requireAdmin(ctx);
  if (next.chargeMin > next.chargeMax || next.faceMin > next.faceMax || next.rateMinX10 > next.rateMaxX10) fail('下限が上限を超えています');
  if (next.feeBps < 0 || next.feeBps > 2000) fail('手数料は 0〜20% の範囲で設定してください');
  if (next.confirmMinutes < 1 || next.confirmMinutes > 1440) fail('受取確認時間は 1〜1440 分で設定してください');
  const db = await getDb();
  await db.tx(async q => {
    const before = await getSettings(q);
    await saveSettings(q, next);
    const diff = (Object.keys(next) as (keyof Settings)[])
      .filter(k => JSON.stringify(before[k]) !== JSON.stringify(next[k]))
      .map(k => `${k}: ${JSON.stringify(before[k])} → ${JSON.stringify(next[k])}`).join(' / ');
    await audit(q, ctx, 'settings.update', 'settings', diff || '変更なし');
  });
}

export async function runAuditVerification(ctx: Ctx) {
  requireAdmin(ctx);
  const db = await getDb();
  const r = await verifyAuditChain(db);
  await db.tx(q => audit(q, ctx, 'audit.verify', 'audit_logs', r.ok ? `OK ${r.count}件` : `NG seq=${r.brokenAt}`));
  return r;
}
