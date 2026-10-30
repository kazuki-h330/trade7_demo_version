export async function register() {
  // Serverless (Vercel) has no long-lived process: jobs run lazily on page views and via /api/cron instead.
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.DISABLE_SCHEDULER === 'true' || process.env.VERCEL) return;
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  const { startScheduler } = await import('./server/scheduler');
  startScheduler();
}
