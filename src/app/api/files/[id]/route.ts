import { getCurrentUser } from '@/server/auth';
import { fileRow, tradeParties } from '@/server/queries';

/** Uploaded images are never public: only the owner, the trade parties (screenshots) and admins may read them. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const f = await fileRow(id);
  if (!f?.data) return new Response('Not found', { status: 404 });
  let allowed = user.role === 'admin' || f.owner_id === user.id;
  if (!allowed && f.kind === 'screenshot' && f.trade_id) {
    const p = await tradeParties(f.trade_id);
    allowed = !!p && (p.buyer_id === user.id || p.seller_id === user.id);
  }
  if (!allowed) return new Response('Forbidden', { status: 403 });
  return new Response(new Uint8Array(f.data), {
    headers: { 'content-type': f.mime, 'cache-control': 'private, no-store', 'content-disposition': 'inline', 'x-content-type-options': 'nosniff' },
  });
}
