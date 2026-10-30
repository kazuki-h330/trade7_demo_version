import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ZodError } from 'zod';
import { getCtx } from './auth';
import { AppError, type Ctx } from './core';
import { flushOutbox } from './mail';

export type ActionState = { ok?: boolean; error?: string; message?: string; data?: unknown; ts?: number };
type Result = void | string | { message?: string; data?: unknown; redirect?: string };

/**
 * Wraps a Server Action for use with useActionState:
 * builds the request context, converts domain errors into user-facing messages,
 * revalidates the UI and kicks the mail outbox.
 */
export function action(fn: (ctx: Ctx, fd: FormData) => Promise<Result>) {
  return async (_prev: ActionState, fd: FormData): Promise<ActionState> => {
    let to: string | undefined;
    let out: ActionState;
    try {
      const r = await fn(await getCtx(), fd);
      const o = typeof r === 'string' ? { message: r } : r ?? {};
      to = o.redirect;
      out = { ok: true, message: o.message, data: o.data, ts: Date.now() };
    } catch (e) {
      if (e instanceof AppError) return { error: e.message, ts: Date.now() };
      if (e instanceof ZodError) return { error: e.issues[0]?.message ?? '入力内容をご確認ください', ts: Date.now() };
      if ((e as { digest?: string }).digest?.startsWith('NEXT_REDIRECT')) throw e;
      console.error('[action]', e);
      return { error: '処理中にエラーが発生しました。時間をおいて再度お試しください', ts: Date.now() };
    }
    revalidatePath('/', 'layout');
    void flushOutbox().catch(err => console.error('[mail]', err));
    if (to) redirect(to);
    return out;
  };
}

export const str = (fd: FormData, k: string) => String(fd.get(k) ?? '');
export const int = (fd: FormData, k: string) => Math.trunc(Number(fd.get(k)));
