import { runJobs } from '@/server/scheduler';

export const dynamic = 'force-dynamic';

/**
 * Scheduled jobs (auto-confirm + mail outbox). Requires `Authorization: Bearer $CRON_SECRET`.
 * Vercel Cron sends exactly that header (GET) when CRON_SECRET is set; other schedulers may POST.
 */
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return new Response('Unauthorized', { status: 401 });
  return Response.json(await runJobs());
}

export const GET = handle;
export const POST = handle;
