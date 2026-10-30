export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.DISABLE_SCHEDULER === 'true') return;
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  const { startScheduler } = await import('./server/scheduler');
  startScheduler();
}
