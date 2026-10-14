import { INCIDENT_LABEL } from '../../config/rules';
import { ProductPill } from '../../ui/ProductPill';
import { useNav } from '../../lib/nav';
import { fmtDate, money } from '../../lib/format';
import { CLAIM_STATUS, customerName, isOpen, latestInvestigation } from '../../lib/selectors';
import { useDemo } from '../../store/store';
import type { ClaimStatus } from '../../types';
import { Card, Empty, PageHeader, Pill, Ref, Table, Td, cx } from '../../ui/primitives';

export function ClaimsList() {
  const s = useDemo();
  const { route, go } = useNav();
  const filter = route.params?.filter ?? 'all';
  const claims = [...s.claims].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).filter((c) => filter === 'all' ? true : filter === 'open' ? isOpen(c) : c.status === filter);
  const filters: [string, string][] = [['all', 'All'], ['open', 'Open'], ...(Object.keys(CLAIM_STATUS) as ClaimStatus[]).map((k) => [k, CLAIM_STATUS[k].ops] as [string, string])];
  return (
    <div>
      <PageHeader eyebrow="Operations Console" title="Claims management" description="Open a claim to run the agentic investigation, inspect each agent's output and record a human decision." />
      <div className="mb-4 flex flex-wrap gap-1.5">
        {filters.map(([k, l]) => {
          const n = k === 'all' ? s.claims.length : k === 'open' ? s.claims.filter(isOpen).length : s.claims.filter((c) => c.status === k).length;
          return <button key={k} onClick={() => go('ops', 'claims', { filter: k })} className={cx('rounded-full border px-3 py-1 text-[12.5px] font-medium', filter === k ? 'border-teal bg-tealsoft text-tealink' : 'border-line bg-surface text-muted hover:text-ink')}>{l} <span className="tnum">{n}</span></button>;
        })}
      </div>
      <Card pad={false}>
        <Table head={['Claim', 'Customer', 'Policy', 'Incident', 'Claimed', 'Docs', 'Last investigation', 'Status']} empty={claims.length === 0 ? <div className="p-5"><Empty>No claims match this filter.</Empty></div> : undefined}>
          {claims.map((c) => {
            const inv = latestInvestigation(c);
            return (
              <tr key={c.id} className="cursor-pointer hover:bg-sunken/50" onClick={() => go('ops', 'claim', { claimId: c.id })}>
                <Td><Ref>{c.id}</Ref></Td><Td>{customerName(s, c.customerId)}</Td><Td mono>{c.policyId}</Td>
                <Td><div className="flex items-center gap-1.5"><ProductPill product={c.product} />{INCIDENT_LABEL[c.incidentType]}</div><div className="text-[12px] text-muted">{fmtDate(c.incidentDate)}</div></Td>
                <Td mono>{money(c.estimatedDamage)}</Td><Td mono>{c.documents.length}</Td>
                <Td className="text-[12.5px]">{inv ? <>{inv.runId}<div className="text-muted">{inv.report?.recommendation.code ?? inv.status}</div></> : <span className="text-muted">Not run</span>}</Td>
                <Td><Pill tone={CLAIM_STATUS[c.status].tone} pulse={c.status === 'under_investigation'}>{CLAIM_STATUS[c.status].ops}</Pill></Td>
              </tr>
            );
          })}
        </Table>
      </Card>
    </div>
  );
}
