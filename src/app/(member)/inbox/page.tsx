import { Inbox as InboxIcon, Mail } from 'lucide-react';
import { MailItem } from '@/components/client';
import { Card, Empty, Notice, PageHeader } from '@/components/ui';
import { fmtDate } from '@/lib/format';
import { requireMember } from '@/server/auth';
import { inbox } from '@/server/queries';

export const metadata = { title: 'お知らせ' };

export default async function Inbox() {
  const u = await requireMember();
  const mails = await inbox(u.id);
  return (
    <>
      <PageHeader icon={<Mail className="size-5" />} title="お知らせ" sub="登録メールアドレスに送信した通知の控えです" />
      {!process.env.SMTP_URL && <div className="mb-5"><Notice tone="amber">開発環境：SMTP が未設定のため、メールは実際には送信されずここに記録されます（認証コードもここで確認できます）。</Notice></div>}
      <Card pad={false}>
        {mails.length === 0 ? <div className="p-5"><Empty icon={<InboxIcon className="size-8 text-slate-300" />}>お知らせはありません</Empty></div>
          : mails.map(m => <MailItem key={m.id} id={m.id} unread={!m.read_at} subject={m.subject} meta={fmtDate(m.created_at)} body={m.body} />)}
      </Card>
    </>
  );
}
