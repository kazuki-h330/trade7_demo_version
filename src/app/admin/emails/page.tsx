import { Send } from 'lucide-react';
import { Card, Notice, PageHeader, Status, Table } from '@/components/ui';
import { fmtDate } from '@/lib/format';
import { allEmails } from '@/server/queries';

export const metadata = { title: 'メール送信ログ' };

export default async function Emails() {
  const list = await allEmails();
  return (
    <>
      <PageHeader icon={<Send className="size-5" />} title="メール送信ログ" sub="主要イベントで自動送信されたメール（トランザクショナル・アウトボックス方式）" />
      {!process.env.SMTP_URL && <div className="mb-5"><Notice tone="amber">SMTP_URL が未設定のため、メールは送信されず記録のみ行っています。</Notice></div>}
      <Card>
        <Table rows={list.length} head={['日時', '宛先', 'イベント', '件名', '状態']}>
          {list.map(m => (
            <tr key={m.id}>
              <td className="text-xs whitespace-nowrap">{fmtDate(m.created_at)}</td><td className="text-xs">{m.to_addr}</td><td className="mono text-xs">{m.event}</td>
              <td><details><summary className="cursor-pointer">{m.subject}</summary><pre className="mt-2 rounded-xl bg-slate-50 p-3 font-sans text-xs whitespace-pre-wrap">{m.body}</pre></details></td>
              <td><Status kind="mail" value={m.status} />{m.error && <div className="text-xs text-rose-600">{m.error}</div>}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
