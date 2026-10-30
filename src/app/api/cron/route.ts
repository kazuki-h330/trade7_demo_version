import { runJobs } from '@/server/scheduler';

/** For external schedulers (multi-instance deployments): POST with `Authorization: Bearer $CRON_SECRET`. */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return new Response('Unauthorized', { status: 401 });
  return Response.json(await runJobs());
}
