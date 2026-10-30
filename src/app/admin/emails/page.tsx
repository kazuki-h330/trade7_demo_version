import { Send } from 'lucide-react';
import { Card, PageHeader, Status, Table } from '@/components/ui';
import { fmtDate } from '@/lib/format';
import { allEmails } from '@/server/queries';

export const metadata = { title: '通知ログ' };

export default async function Notifications() {
  const list = await allEmails();
  return (
    <>
      <PageHeader icon={<Send className="size-5" />} title="通知ログ" sub="主要イベントで会員・運営に送られたアプリ内通知（お知らせ）の記録" />
      <Card>
        <Table rows={list.length} head={['日時', '宛先（ログインID）', 'イベント', '件名', '状態']}>
          {list.map(m => (
            <tr key={m.id}>
              <td className="text-xs whitespace-nowrap">{fmtDate(m.created_at)}</td><td className="mono text-xs">{m.to_addr}</td><td className="mono text-xs">{m.event}</td>
              <td><details><summary className="cursor-pointer">{m.subject}</summary><pre className="mt-2 rounded-xl bg-slate-50 p-3 font-sans text-xs whitespace-pre-wrap">{m.body}</pre></details></td>
              <td><Status kind="mail" value={m.status} /></td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
