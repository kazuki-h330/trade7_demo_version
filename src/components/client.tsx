'use client';

import { CircleCheck, CircleX, Copy, Eye, KeyRound, LoaderCircle, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import type { ActionState } from '@/server/action';
import { adminDecryptAction } from '@/server/actions/admin';
import { markMailReadAction, revealCodeAction } from '@/server/actions/member';

/* ---------- toasts ---------- */
type ToastMsg = { id: number; kind: 'ok' | 'err' | 'info'; text: string };
const TOAST_EVENT = 't7:toast';
export function toast(text: string, kind: ToastMsg['kind'] = 'info') {
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: { text, kind } }));
}
export function Toaster() {
  const [items, setItems] = useState<ToastMsg[]>([]);
  useEffect(() => {
    const on = (e: Event) => {
      const { text, kind } = (e as CustomEvent).detail;
      const id = Date.now() + Math.random();
      setItems(s => [...s, { id, text, kind }]);
      setTimeout(() => setItems(s => s.filter(t => t.id !== id)), kind === 'err' ? 7000 : 4200);
    };
    window.addEventListener(TOAST_EVENT, on);
    return () => window.removeEventListener(TOAST_EVENT, on);
  }, []);
  return (
    <div className="fixed right-4 bottom-4 z-[60] flex w-[min(420px,calc(100vw-2rem))] flex-col gap-2">
      {items.map(t => (
        <div key={t.id} className={`toast-in flex items-start gap-2 rounded-2xl px-4 py-3 text-sm text-white shadow-xl ${t.kind === 'err' ? 'bg-rose-600' : t.kind === 'ok' ? 'bg-emerald-600' : 'bg-slate-800'}`}>
          {t.kind === 'err' ? <CircleX className="mt-0.5 size-4 shrink-0" /> : <CircleCheck className="mt-0.5 size-4 shrink-0" />}
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------- modal ---------- */
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className={`toast-in max-h-[92vh] w-full overflow-auto rounded-3xl bg-white shadow-2xl ${wide ? 'max-w-3xl' : 'max-w-lg'}`}>
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-lg font-bold">{title}</h3>
          <button type="button" onClick={onClose} className="btn-ghost btn-sm" aria-label="閉じる"><X className="size-4" /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

/** Button that opens a modal containing (usually) an ActionForm. The modal closes when that form succeeds. */
export function ModalButton({ label, title, children, className = 'btn-secondary', wide }: { label: ReactNode; title: ReactNode; children: ReactNode; className?: string; wide?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const done = () => setOpen(false);
    el.addEventListener('t7:success', done);
    return () => el.removeEventListener('t7:success', done);
  });
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>{label}</button>
      <Modal open={open} onClose={() => setOpen(false)} title={title} wide={wide}><div ref={ref}>{children}</div></Modal>
    </>
  );
}

/* ---------- forms ---------- */
export function SubmitButton({ children, className = 'btn-primary', pendingText }: { children: ReactNode; className?: string; pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending && <LoaderCircle className="size-4 animate-spin" />}
      {pending && pendingText ? pendingText : children}
    </button>
  );
}

type ServerAction = (prev: ActionState, fd: FormData) => Promise<ActionState>;

/**
 * Form bound to a Server Action. Shows the result as a toast, optionally asks for confirmation,
 * resets on success and notifies an enclosing ModalButton.
 */
export function ActionForm({ action, children, className, confirm, reset = true, hidden }: {
  action: ServerAction; children: ReactNode; className?: string; confirm?: string; reset?: boolean; hidden?: Record<string, string | number>;
}) {
  // Toast straight from the result: the form may unmount once the refreshed page no longer shows its row.
  const [state, formAction] = useActionState(async (prev: ActionState, fd: FormData) => {
    const r = await action(prev, fd);
    if (r.error) toast(r.error, 'err');
    else if (r.message) toast(r.message, 'ok');
    return r;
  }, {} as ActionState);
  const ref = useRef<HTMLFormElement>(null);
  const confirmed = useRef(false);
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    if (!state.ts || state.error) return;
    {
      if (reset) ref.current?.reset();
      ref.current?.dispatchEvent(new CustomEvent('t7:success', { bubbles: true }));
    }
  }, [state.ts]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <form
        ref={ref}
        action={formAction}
        className={className}
        onSubmit={e => {
          if (confirm && !confirmed.current) { e.preventDefault(); setAsking(true); }
          confirmed.current = false;
        }}
      >
        {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        {children}
      </form>
      <Modal open={asking} onClose={() => setAsking(false)} title="確認">
        <p className="text-sm whitespace-pre-line text-slate-600">{confirm}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={() => setAsking(false)}>キャンセル</button>
          <button type="button" className="btn-primary" onClick={() => { setAsking(false); confirmed.current = true; ref.current?.requestSubmit(); }}>実行する</button>
        </div>
      </Modal>
    </>
  );
}

/* ---------- live helpers ---------- */
export function Countdown({ deadline, big }: { deadline: string; big?: boolean }) {
  const router = useRouter();
  const end = new Date(deadline).getTime();
  const [now, setNow] = useState(() => Date.now());
  const fired = useRef(false);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = end - now;
  useEffect(() => {
    if (ms <= 0 && !fired.current) { fired.current = true; setTimeout(() => router.refresh(), 16000); }
  }, [ms, router]);
  const s = Math.max(0, Math.floor(ms / 1000));
  const text = ms > 0 ? `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : '自動確定中…';
  const urgent = ms < 5 * 60_000;
  return <span className={`mono font-bold tabular-nums ${big ? 'text-4xl' : ''} ${urgent ? 'text-rose-600' : 'text-violet-700'}`}>{text}</span>;
}

export function AutoRefresh({ seconds = 15 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') router.refresh(); }, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}

function CodeBox({ code }: { code: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-lg tracking-[.2em] text-white">
      <span className="mono">{code}</span>
      <button type="button" className="text-white/70 hover:text-white" title="コピー" onClick={() => { navigator.clipboard?.writeText(code.replace(/\s/g, '')); toast('コピーしました', 'ok'); }}><Copy className="size-4" /></button>
    </span>
  );
}

export function RevealCode({ tradeId, masked }: { tradeId: string; masked: string }) {
  const [code, setCode] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (code) return <CodeBox code={code} />;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="mono rounded-xl bg-slate-100 px-4 py-2.5 text-lg tracking-[.2em] text-slate-500">{masked}</span>
      <button type="button" className="btn-primary" disabled={pending} onClick={() => start(async () => {
        const r = await revealCodeAction(tradeId);
        if (r.code) setCode(r.code.replace(/(.{4})(?=.)/g, '$1 ')); else toast(r.error ?? 'エラー', 'err');
      })}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Eye className="size-4" />}コードを表示</button>
    </div>
  );
}

export function AdminDecrypt({ listingId, reasons }: { listingId: string; reasons: readonly string[] }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [reason, setReason] = useState(reasons[0]);
  const [pending, start] = useTransition();
  return (
    <>
      {code ? <CodeBox code={code} /> : <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(true)}><KeyRound className="size-3.5" />コードを復号</button>}
      <Modal open={open} onClose={() => setOpen(false)} title="ギフトコードの復号">
        <p className="mb-4 text-sm text-slate-600">復号操作は理由・日時・IP とともに監査ログへ記録されます。</p>
        <label className="label">復号理由</label>
        <select className="input" value={reason} onChange={e => setReason(e.target.value)}>{reasons.map(r => <option key={r}>{r}</option>)}</select>
        <div className="mt-6 flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => setOpen(false)}>キャンセル</button>
          <button className="btn-danger" disabled={pending} onClick={() => start(async () => {
            const r = await adminDecryptAction(listingId, reason);
            if (r.code) { setCode(r.code.replace(/(.{4})(?=.)/g, '$1 ')); setOpen(false); } else toast(r.error ?? 'エラー', 'err');
          })}>{pending && <LoaderCircle className="size-4 animate-spin" />}復号して表示</button>
        </div>
      </Modal>
    </>
  );
}

export function MailItem({ id, unread, subject, meta, body }: { id: string; unread: boolean; subject: string; meta: ReactNode; body: string }) {
  const [isUnread, setUnread] = useState(unread);
  return (
    <details className="group border-t border-slate-100 first:border-t-0" onToggle={e => {
      if ((e.target as HTMLDetailsElement).open && isUnread) { setUnread(false); void markMailReadAction(id); }
    }}>
      <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3.5 hover:bg-violet-50/40">
        <span className={`size-2 shrink-0 rounded-full ${isUnread ? 'bg-fuchsia-500' : 'bg-transparent'}`} />
        <span className={`min-w-0 flex-1 truncate ${isUnread ? 'font-semibold' : ''}`}>{subject}</span>
        <span className="shrink-0 text-xs text-slate-400">{meta}</span>
      </summary>
      <pre className="mx-5 mb-4 rounded-xl bg-slate-50 p-4 font-sans text-sm whitespace-pre-wrap text-slate-700">{body}</pre>
    </details>
  );
}

export function FillDemoCode() {
  return (
    <button type="button" className="btn-ghost btn-sm" onClick={e => {
      const form = (e.currentTarget as HTMLButtonElement).form!;
      const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const code = 'X' + Array.from({ length: 15 }, () => A[Math.floor(Math.random() * A.length)]).join('');
      (form.elements.namedItem('code') as HTMLInputElement).value = code.replace(/(.{4})(?=.)/g, '$1 ');
      const face = form.elements.namedItem('face') as HTMLInputElement;
      if (!face.value) face.value = '10000';
    }}>テスト用コードを生成</button>
  );
}
