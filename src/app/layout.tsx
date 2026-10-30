import type { Metadata, Viewport } from 'next';
import { Toaster } from '@/components/client';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'trade7 — Appleギフト券 売買マッチング', template: '%s | trade7' },
  description: '本人確認済みの会員同士で、運営が残高を確認したAppleギフト券を安全に売買できるマッチングサービス。',
};
export const viewport: Viewport = { themeColor: '#7c3aed' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
