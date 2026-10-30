import { Logo } from '@/components/brand';

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Logo />
      <article className="card mt-6 space-y-4 p-8 text-sm leading-7 text-slate-700 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-ink [&_h2]:mt-6 [&_h2]:font-bold [&_h2]:text-ink">{children}</article>
    </div>
  );
}
