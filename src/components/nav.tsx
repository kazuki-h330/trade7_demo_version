'use client';

import {
  ArrowLeftRight, Banknote, FileSpreadsheet, IdCard, LayoutDashboard, Mail, MessageSquareWarning, PiggyBank, Receipt,
  ScanSearch, ScrollText, Send, Settings, ShieldAlert, Store, Tag, UserRound, Users, Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

/** Sidebar body that collapses behind a menu button below the lg breakpoint. */
export function MobileCollapse({ children, badge }: { children: ReactNode; badge?: number }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  return (
    <>
      <button type="button" onClick={() => setOpen(o => !o)} className="mb-2 flex w-full items-center justify-between rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold text-white lg:hidden">
        <span>メニュー{badge ? <span className="ml-2 rounded-full bg-amber-400 px-2 text-[11px] text-slate-900">{badge}</span> : null}</span><span>{open ? '▲' : '▼'}</span>
      </button>
      <div className={open ? 'block' : 'hidden lg:block'}>{children}</div>
    </>
  );
}

const ICONS = {
  market: Store, trades: Receipt, charge: Wallet, sell: Tag, sales: PiggyBank, account: UserRound, inbox: Mail,
  dash: LayoutDashboard, kyc: IdCard, sellers: ShieldAlert, listings: ScanSearch, atrades: ArrowLeftRight, disputes: MessageSquareWarning,
  charges: Banknote, balances: Wallet, payouts: FileSpreadsheet, users: Users, detections: ShieldAlert, audit: ScrollText, emails: Send, settings: Settings,
};
export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; count?: number };

const active = (path: string, href: string) => (href === '/admin' ? path === '/admin' : path === href || path.startsWith(href + '/'));

export function MemberNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none]">
      {items.map(it => {
        const Icon = ICONS[it.icon];
        const on = active(path, it.href);
        return (
          <Link key={it.href} href={it.href} className={`relative flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition ${on ? 'brand-gradient text-white shadow-md shadow-fuchsia-500/25' : 'text-slate-600 hover:bg-white hover:text-violet-700'}`}>
            <Icon className="size-4" />{it.label}
            {!!it.count && <span className={`ml-0.5 rounded-full px-1.5 text-[11px] ${on ? 'bg-white/25' : 'bg-fuchsia-500 text-white'}`}>{it.count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminNav({ groups }: { groups: { title: string; items: NavItem[] }[] }) {
  const path = usePathname();
  return (
    <nav className="space-y-5">
      {groups.map(g => (
        <div key={g.title}>
          <div className="mb-1.5 px-3 text-[11px] font-semibold tracking-widest text-violet-300/60 uppercase">{g.title}</div>
          {g.items.map(it => {
            const Icon = ICONS[it.icon];
            const on = active(path, it.href);
            return (
              <Link key={it.href} href={it.href} className={`mb-0.5 flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition ${on ? 'brand-gradient font-semibold text-white shadow-lg shadow-fuchsia-900/40' : 'text-violet-100/80 hover:bg-white/10 hover:text-white'}`}>
                <Icon className="size-4 shrink-0" /><span className="flex-1">{it.label}</span>
                {!!it.count && <span className="rounded-full bg-amber-400 px-2 text-[11px] font-bold text-slate-900">{it.count}</span>}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
