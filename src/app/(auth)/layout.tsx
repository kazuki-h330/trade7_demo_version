import { Logo } from '@/components/brand';
import { GiftArt } from '@/components/ui';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="brand-gradient relative hidden overflow-hidden p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <Logo light />
        <div className="relative h-72">
          <GiftArt face={20000} className="absolute top-0 left-4 h-44 w-72 -rotate-6 ring-1 ring-white/30" />
          <GiftArt face={10000} className="absolute top-24 left-40 h-44 w-72 rotate-6 ring-1 ring-white/30" />
        </div>
        <div>
          <h2 className="text-3xl font-extrabold">運営が残高を確認した<br />ギフト券だけを売買。</h2>
          <p className="mt-3 text-white/85">本人確認・暗号化保管・代金保留で、はじめてでも安心。</p>
        </div>
        <div className="absolute -top-24 -right-24 size-96 rounded-full bg-white/10" />
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden"><Logo /></div>
          {children}
        </div>
      </div>
    </div>
  );
}
