import { Gift } from 'lucide-react';
import Link from 'next/link';

export function Logo({ href = '/', light }: { href?: string; light?: boolean }) {
  return (
    <Link href={href} className="flex items-center gap-2">
      <span className="brand-gradient grid size-9 place-items-center rounded-xl text-white shadow-lg shadow-fuchsia-500/30"><Gift className="size-5" /></span>
      <span className={`text-xl font-extrabold tracking-tight ${light ? 'text-white' : 'brand-text'}`}>trade7</span>
    </Link>
  );
}
