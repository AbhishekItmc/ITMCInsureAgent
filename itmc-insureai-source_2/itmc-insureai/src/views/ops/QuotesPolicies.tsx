import { COVERAGE_RULES } from '../../config/rules';
import { useNav } from '../../lib/nav';
import { fmtDate, money } from '../../lib/format';
import { customerName } from '../../lib/selectors';
import { useDemo } from '../../store/store';
import { ProductPill } from '../../ui/ProductPill';
import { Card, DemoTag, PageHeader, Pill, Ref, Table, Td, cx } from '../../ui/primitives';

export function QuotesPolicies() {
  const s = useDemo();
  const { route, go } = useNav();
  const tab = route.params?.tab ?? 'quotes';
  const tabs = [['quotes', `Quotes (${s.quotes.length})`], ['policies', `Policies (${s.policies.length})`], ['customers', `Customers (${s.customers.length})`]] as const;
  return (
    <div>
      <PageHeader eyebrow="Operations Console" title="Quote & policy workflows" description="Records created by the Quote Agent and Policy Agent. All fictional." />
      <div role="tablist" className="mb-4 flex gap-1 border-b border-line">
        {tabs.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => go('ops', 'quotes-policies', { tab: k })} className={cx('-mb-px border-b-2 px-4 py-2 text-[13.5px] font-medium', tab === k ? 'border-teal text-ink' : 'border-transparent text-muted hover:text-ink')}>{l}</button>
        ))}
      </div>
      <Card pad={false}>
        {tab === 'quotes' && (
          <Table head={['Quote', 'Customer', 'Product', 'Insured', 'Cover', 'Premium', 'Created', 'Missing info', 'Status']}>
            {[...s.quotes].reverse().map((q) => (
              <tr key={q.id} className="hover:bg-sunken/50">
                <Td><Ref>{q.id}</Ref></Td><Td>{customerName(s, q.customerId)}</Td>
                <Td><ProductPill product={q.product} /></Td><Td>{q.subject}</Td><Td>{COVERAGE_RULES[q.coverage].label}</Td>
                <Td mono>{money(q.premium.total, { decimals: true })}</Td><Td>{fmtDate(q.createdAt)}</Td>
                <Td className="max-w-[220px] text-[12px] text-muted">{q.missingInfo.length ? q.missingInfo.join('; ') : '—'}</Td>
                <Td>{q.status === 'converted' ? <Pill tone="ok">Converted · {q.policyId}</Pill> : <Pill tone="info">Quoted</Pill>}</Td>
              </tr>
            ))}
          </Table>
        )}
        {tab === 'policies' && (
          <Table head={['Policy', 'Customer', 'Product', 'Insured', 'Cover', 'Sum insured', 'Premium', 'Term', 'Claims', 'Status']}>
            {[...s.policies].reverse().map((p) => (
              <tr key={p.id} className="hover:bg-sunken/50">
                <Td><div className="flex flex-col gap-1"><Ref>{p.id}</Ref><DemoTag /></div></Td><Td>{customerName(s, p.customerId)}</Td>
                <Td><ProductPill product={p.product} /></Td><Td>{p.subject}{p.vehicle?.plate && <div className="font-mono text-[11.5px] text-muted">{p.vehicle.plate}</div>}</Td>
                <Td>{COVERAGE_RULES[p.coverage].label}</Td><Td mono>{p.sumInsured ? money(p.sumInsured) : '—'}</Td><Td mono>{money(p.annualPremium, { decimals: true })}</Td>
                <Td className="whitespace-nowrap">{fmtDate(p.effectiveDate)} →<br />{fmtDate(p.expiryDate)}</Td>
                <Td>{s.claims.filter((c) => c.policyId === p.id).map((c) => <button key={c.id} className="block font-mono text-[12px] text-tealink hover:underline" onClick={() => go('ops', 'claim', { claimId: c.id })}>{c.id}</button>)}</Td>
                <Td><Pill tone={p.status === 'active' ? 'ok' : 'neutral'}>{p.status === 'active' ? 'Active' : p.status === 'cancelled' ? 'Cancelled' : 'Expired'}</Pill></Td>
              </tr>
            ))}
          </Table>
        )}
        {tab === 'customers' && (
          <Table head={['Customer', 'Name', 'Email', 'City', 'Policies', 'Claims']}>
            {s.customers.map((c) => (
              <tr key={c.id}><Td><Ref>{c.id}</Ref></Td><Td>{c.name}</Td><Td className="text-muted">{c.email}</Td><Td>{c.city}</Td>
                <Td mono>{s.policies.filter((p) => p.customerId === c.id).length}</Td><Td mono>{s.claims.filter((x) => x.customerId === c.id).length}</Td></tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
