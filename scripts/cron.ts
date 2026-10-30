/* Calls the scheduled-jobs endpoint once. Use from an external scheduler when running several app instances. */
const url = `${process.env.APP_URL ?? 'http://localhost:3000'}/api/cron`;
const res = await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? ''}` } });
console.log(res.status, await res.text());
export {};
