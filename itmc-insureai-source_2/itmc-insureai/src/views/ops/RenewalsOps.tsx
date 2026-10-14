import { useState } from 'react';
import { useNav } from '../../lib/nav';
import { daysBetween, fmtDate, money, todayISO } from '../../lib/format';
import { customerName, renewalOpportunities } from '../../lib/selectors';
import { useDemo } from '../../store/store';
import { completeTask } from '../../store/workflows';
import { Button, Card, Empty, PageHeader, Pill, Ref, Table, Td, cx } from '../../ui/primitives';
import { RenewalWorkbench } from '../shared/RenewalWorkbench';

export function RenewalsOps() {
  const s = useDemo();
  const { route } = useNav();
  const opps = renewalOpportunities(s);
  const [selected, setSelected] = useState<string | undefined>(route.params?.policyId ?? opps[0]?.id);
  return (
    <div>
      <PageHeader eyebrow="Operations Console" title="Renewals" description="Policies expiring within 60 days, renewal drafts prepared by the Renewal Agent, and follow-up tasks." />
      <div className="space-y-5">
        <Card title={`Renewal opportunities (${opps.length})`} pad={false}>
          {opps.length === 0 ? <div className="p-5"><Empty>No policies expire in the next 60 days.</Empty></div> : (
            <Table head={['Policy', 'Customer', 'Vehicle', 'Expires', 'Days left', 'Current premium', 'Draft', '']}>
              {opps.map((p) => {
                const r = s.renewals.find((x) => x.policyId === p.id);
                return (
                  <tr key={p.id} className={cx(selected === p.id && 'bg-tealsoft/40')}>
                    <Td><Ref>{p.id}</Ref></Td><Td>{customerName(s, p.customerId)}</Td><Td>{p.subject}</Td>
                    <Td>{fmtDate(p.expiryDate)}</Td><Td mono>{daysBetween(todayISO(), p.expiryDate)}</Td><Td mono>{money(p.annualPremium, { decimals: true })}</Td>
                    <Td>{r ? <Pill tone={r.status === 'saved' ? 'ok' : 'info'}>{r.status === 'saved' ? 'Saved' : 'Draft'}</Pill> : <span className="text-muted">—</span>}</Td>
                    <Td><Button size="sm" variant={selected === p.id ? 'primary' : 'secondary'} onClick={() => setSelected(p.id)}>Open</Button></Td>
                  </tr>
                );
              })}
            </Table>
          )}
        </Card>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-muted">Work on any policy:</span>
          <select id="ops-renew-policy" className="input w-auto" value={selected ?? ''} onChange={(e) => setSelected(e.target.value)}>
            {s.policies.map((p) => <option key={p.id} value={p.id}>{p.id} · {customerName(s, p.customerId)}</option>)}
          </select>
        </div>
        {selected && <RenewalWorkbench policyId={selected} actor="Renewals Desk (ops)" />}
        <Card title="Follow-up tasks (renewals and call-backs)" pad={false}>
          {s.tasks.length === 0 ? <div className="p-5"><Empty>No follow-up tasks yet. Run the Renewal Agent to create one.</Empty></div> : (
            <Table head={['Task', 'Title', 'Owner', 'Due', 'Status', '']}>
              {s.tasks.map((t) => (
                <tr key={t.id}>
                  <Td mono>{t.id}</Td><Td>{t.title}</Td><Td>{t.owner}</Td><Td>{fmtDate(t.dueDate)}</Td>
                  <Td><Pill tone={t.status === 'open' ? 'info' : 'ok'}>{t.status === 'open' ? 'Open' : 'Done'}</Pill></Td>
                  <Td>{t.status === 'open' && <Button size="sm" onClick={() => completeTask(t.id, 'Renewals Desk (ops)')}>Mark done</Button>}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}
