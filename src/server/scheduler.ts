import { flushOutbox } from './mail';
import { autoConfirmDue } from './services/trades';

const g = globalThis as unknown as { __trade7Scheduler?: NodeJS.Timeout };

export async function runJobs() {
  const confirmed = await autoConfirmDue();
  await flushOutbox();
  return { confirmed };
}

/** In-process scheduler for single-instance deployments. Multi-instance: disable and call /api/cron instead. */
export function startScheduler(intervalMs = 15_000) {
  if (g.__trade7Scheduler) return;
  g.__trade7Scheduler = setInterval(() => {
    runJobs().catch(e => console.error('[scheduler]', e));
  }, intervalMs);
  g.__trade7Scheduler.unref?.();
}
