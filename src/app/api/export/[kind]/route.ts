import { audit } from '@/server/audit';
import { getCtx, getCurrentUser } from '@/server/auth';
import { getDb } from '@/server/db';
import { allTrades, auditSearch } from '@/server/queries';
import { payoutCsvRows } from '@/server/services/money';
import { fmtDate, LABEL } from '@/lib/format';

function csv(rows: unknown[][]) {
  return '﻿' + rows.map(r => r.map(v => {
    const s = v instanceof Date ? fmtDate(v) : String(v ?? '');
    // prevent CSV/formula injection when opened in Excel
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  }).join(',')).join('\r\n');
}

export async function GET(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const user = await getCurrentUser();
  if (user?.role !== 'admin') return new Response('Forbidden', { status: 403 });
  const { kind } = await params;
  const url = new URL(req.url);
  let rows: unknown[][];
  let name: string;
  if (kind === 'payout') {
    const id = url.searchParams.get('id') ?? '';
    rows = await payoutCsvRows(id);
    name = `trade7_payout_${id}.csv`;
  } else if (kind === 'trades') {
    const list = await allTrades();
    rows = [['取引ID', '出品ID', '買い手', '売り手', '額面', '販売利率', '取引価格', '手数料', '売上', '状態', '購入日時', '確定日時', '確定方法', '支払ID'],
      ...list.map(t => [t.id, t.listing_id, t.buyer_name, t.seller_name, t.face, (t.rate_x10 / 10).toFixed(1), t.price, t.fee, t.seller_net, LABEL.trade[t.status as keyof typeof LABEL.trade], t.purchased_at, t.completed_at, t.completed_by ?? '', t.payout_id ?? ''])];
    name = 'trade7_trades.csv';
  } else if (kind === 'audit') {
    const list = await auditSearch(url.searchParams.get('q') ?? '', 100000);
    rows = [['seq', '日時', '操作者ID', '操作者', '権限', '操作', '対象', '内容', 'IP', 'UserAgent', 'hash'], ...list.map(a => [a.seq, a.at, a.actor_id, a.actor_name, a.actor_role, a.action, a.target, a.detail, a.ip, a.ua, a.hash])];
    name = 'trade7_audit.csv';
  } else return new Response('Not found', { status: 404 });

  const db = await getDb();
  const ctx = await getCtx();
  await db.tx(q => audit(q, ctx, `export.${kind}`, url.searchParams.get('id') ?? kind, `${rows.length - 1}行`));
  return new Response(csv(rows), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${name}"`, 'cache-control': 'no-store' } });
}
