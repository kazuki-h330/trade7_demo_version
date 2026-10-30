import { BadgeCheck, Clock, IdCard, Lock, MessageSquareWarning, ScanSearch, ShieldCheck, Sparkles, Wallet } from 'lucide-react';
import Link from 'next/link';
import { Logo } from '@/components/brand';
import { GiftArt } from '@/components/ui';

export default function Landing() {
  const steps = [
    { icon: IdCard, color: 'from-violet-500 to-indigo-500', title: '会員登録・本人確認', text: 'メール認証のあと、身分証画像を提出。運営が目視で審査します。' },
    { icon: Wallet, color: 'from-fuchsia-500 to-pink-500', title: 'チャージ', text: '指定口座へ振込むと、運営が名義と金額を確認して残高に反映します。' },
    { icon: Sparkles, color: 'from-amber-400 to-orange-500', title: '購入', text: '運営が残高を確認済みのギフト券だけを掲載。価格は購入時にロックされます。' },
    { icon: Clock, color: 'from-emerald-400 to-teal-500', title: '30分以内に確認', text: 'コードを確認して取引完了。問題があればスクリーンショット付きでエラー申請。' },
  ];
  const safety = [
    { icon: ScanSearch, title: '運営が全件残高確認', text: '出品されたギフト券は、運営が残高を確認してから掲載します。' },
    { icon: Lock, title: 'コードは暗号化保管', text: 'ギフトコードは暗号化して保存。購入者以外には先頭・末尾4桁のみ表示します。' },
    { icon: MessageSquareWarning, title: 'トラブル時は代金を保留', text: 'エラー申請中の取引は代金を凍結し、運営が中立に判断します。' },
    { icon: ShieldCheck, title: '本人確認済みの会員のみ', text: '売買・チャージは本人確認が完了した会員だけが利用できます。' },
  ];
  return (
    <div>
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <Logo />
        <div className="flex gap-2"><Link href="/login" className="btn-ghost">ログイン</Link><Link href="/register" className="btn-primary">無料で会員登録</Link></div>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-8 pb-16 md:grid-cols-2">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-violet-700 ring-1 ring-violet-200"><BadgeCheck className="size-3.5" />運営が全件残高確認</span>
          <h1 className="mt-4 text-4xl leading-tight font-extrabold tracking-tight md:text-5xl">Appleギフト券を、<br /><span className="brand-text">安全に・おトクに</span>売買。</h1>
          <p className="mt-4 max-w-md text-slate-600">trade7 は、本人確認済みの会員同士でAppleギフト券を売買できるマッチングサービスです。買い手手数料は0%。トラブル時は運営が代金を保留して対応します。</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/register" className="btn-primary px-6 py-3 text-base">今すぐはじめる</Link>
            <Link href="/login" className="btn-secondary px-6 py-3 text-base">ログイン</Link>
          </div>
          <div className="mt-8 flex gap-8 text-sm">
            <div><div className="text-2xl font-extrabold text-violet-700">0%</div><div className="text-slate-500">買い手手数料</div></div>
            <div><div className="text-2xl font-extrabold text-fuchsia-600">30分</div><div className="text-slate-500">受取確認の猶予</div></div>
            <div><div className="text-2xl font-extrabold text-orange-500">100%</div><div className="text-slate-500">運営の残高確認</div></div>
          </div>
        </div>
        <div className="relative mx-auto h-80 w-full max-w-md">
          <div className="absolute -inset-6 rounded-[3rem] bg-gradient-to-br from-violet-300/40 via-fuchsia-300/40 to-orange-200/40 blur-2xl" />
          <GiftArt face={50000} className="absolute top-0 left-0 h-44 w-72 -rotate-6" />
          <GiftArt face={10000} className="absolute top-20 right-0 h-44 w-72 rotate-3" />
          <GiftArt face={5000} className="absolute bottom-0 left-10 h-44 w-72 -rotate-2" />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16">
        <h2 className="mb-6 text-center text-2xl font-bold">ご利用の流れ</h2>
        <div className="grid gap-4 md:grid-cols-4">
          {steps.map((s, i) => (
            <div key={s.title} className="card p-5">
              <div className={`grid size-11 place-items-center rounded-2xl bg-gradient-to-br text-white shadow-lg ${s.color}`}><s.icon className="size-5" /></div>
              <div className="mt-4 text-xs font-bold text-slate-400">STEP {i + 1}</div>
              <div className="mt-1 font-bold">{s.title}</div>
              <p className="mt-1 text-sm text-slate-600">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20">
        <div className="brand-gradient rounded-[2rem] p-8 text-white shadow-2xl shadow-fuchsia-500/30 md:p-12">
          <h2 className="text-2xl font-bold">安心して取引できる仕組み</h2>
          <div className="mt-6 grid gap-5 md:grid-cols-4">
            {safety.map(s => (
              <div key={s.title} className="rounded-2xl bg-white/15 p-5 backdrop-blur">
                <s.icon className="size-6" /><div className="mt-3 font-bold">{s.title}</div><p className="mt-1 text-sm text-white/85">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <footer className="mx-auto max-w-6xl px-4 pb-10 text-xs text-slate-400">© trade7 運営事務局 ・ <Link href="/terms">利用規約</Link> ・ <Link href="/privacy">プライバシーポリシー</Link><br />Apple は Apple Inc. の商標です。本サービスは Apple Inc. とは関係ありません。</footer>
    </div>
  );
}
