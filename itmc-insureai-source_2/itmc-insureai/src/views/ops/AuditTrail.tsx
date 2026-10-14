import { useState } from 'react';
import { useNav } from '../../lib/nav';
import { fmtDateTime } from '../../lib/format';
import { useDemo } from '../../store/store';
import type { ActorType } from '../../types';
import { Card, PageHeader, Pill, Table, Td, cx } from '../../ui/primitives';

const ACTOR_TONE: Record<ActorType, 'teal' | 'info' | 'neutral' | 'warn'> = { agent: 'teal', human: 'info', customer: 'warn', system: 'neutral' };

export function AuditTrail() {
  const s = useDemo();
  const { route } = useNav();
  const [actor, setActor] = useState<ActorType | 'all'>('all');
  const [q, setQ] = useState(route.params?.entity ?? '');
  const rows = [...s.audit].reverse().filter((e) => (actor === 'all' || e.actorType === actor) && (!q || `${e.entityId} ${e.action} ${e.actor} ${e.detail}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <div>
      <PageHeader eyebrow="Operations Console" title="Audit trail" description="Append-only record of every customer action, agent step, human decision and system event in this demo." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(['all', 'agent', 'human', 'customer', 'system'] as const).map((a) => (
          <button key={a} onClick={() => setActor(a)} className={cx('rounded-full border px-3 py-1 text-[12.5px] font-medium capitalize', actor === a ? 'border-teal bg-tealsoft text-tealink' : 'border-line bg-surface text-muted hover:text-ink')}>{a === 'all' ? 'All actors' : a}</button>
        ))}
        <input id="audit-search" className="input ml-auto w-full sm:w-64" placeholder="Search record, action, actor…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <Card pad={false} title={`${rows.length} event${rows.length === 1 ? '' : 's'}`}>
        <Table head={['Time', 'Event', 'Actor', 'Action', 'Record', 'Detail']}>
          {rows.map((e) => (
            <tr key={e.id}>
              <Td className="whitespace-nowrap font-mono text-[11.5px] text-muted">{fmtDateTime(e.at)}</Td>
              <Td mono>{e.id}</Td>
              <Td><div className="flex flex-col items-start gap-1"><span className="whitespace-nowrap text-[12.5px] font-medium">{e.actor}</span><Pill tone={ACTOR_TONE[e.actorType]} dot={false}>{e.actorType}</Pill></div></Td>
              <Td className="font-medium">{e.action}</Td>
              <Td mono>{e.entityId}</Td>
              <Td className="max-w-[360px] text-[12.5px] text-muted">{e.detail}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
