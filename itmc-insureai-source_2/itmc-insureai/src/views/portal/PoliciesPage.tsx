import { useState } from 'react';
import { ArrowLeft, Check, FileText, PencilLine, RefreshCcw, ShieldCheck, X } from 'lucide-react';
import { SERVICE_LABEL, SERVICE_TYPES_BY_PRODUCT } from '../../agents/servicingAgents';
import type { PolicyAgentOutput } from '../../agents/policyAgent';
import type { AgentResult } from '../../agents/runtime';
import { COVERAGE_RULES, PRODUCT_LABEL } from '../../config/rules';
import { useNav } from '../../lib/nav';
import { daysBetween, fmtDate, money, todayISO } from '../../lib/format';
import { useDemo } from '../../store/store';
import { issuePolicy, reviewQuoteForPolicy, submitServiceRequest } from '../../store/workflows';
import type { Policy, Product, ServiceRequest } from '../../types';
import { policyFacts } from '../../lib/productView';
import { ProductPill } from '../../ui/ProductPill';
import { AgentTrace } from '../../ui/agents';
import { Button, Card, DemoTag, Empty, Field, KV, Notice, PageHeader, Pill, Ref, toast } from '../../ui/primitives';
import { ViewingAs } from './common';

function ChangeRequestForm({ policyId, product, onDone }: { policyId: string; product: Product; onDone: () => void }) {
  const types = SERVICE_TYPES_BY_PRODUCT[product];
  const [type, setType] = useState<ServiceRequest['type']>(types[0]);
  const [f, setF] = useState<Record<string, string>>({ newAddress: '', driverName: '', driverAge: '', licenseYears: '', newMakeModel: '', newYear: '', newValue: '', reason: '', memberName: '', memberAge: '', relation: 'child', newBuildingValue: '', newContentsValue: '', newEndDate: '' });
  const fields: Record<ServiceRequest['type'], [string, string][]> = {
    add_member: [['memberName', 'Member name'], ['memberAge', 'Age'], ['relation', 'Relation (spouse / child / parent)']],
    sum_insured_change: [['newBuildingValue', 'New rebuild value (SAR, blank = unchanged)'], ['newContentsValue', 'New contents value (SAR, blank = unchanged)']],
    trip_extension: [['newEndDate', 'New return date (YYYY-MM-DD)']],
    address_change: [['newAddress', 'New address']],
    add_driver: [['driverName', 'Driver name'], ['driverAge', 'Driver age'], ['licenseYears', 'Years licensed']],
    vehicle_change: [['newMakeModel', 'New make and model'], ['newYear', 'Model year'], ['newValue', 'Market value (SAR)']],
    cancellation: [['reason', 'Reason for cancelling']],
  };
  const submit = () => {
    const details = Object.fromEntries(fields[type].map(([k]) => [k, f[k].trim()]).filter(([k, v]) => v || type !== 'sum_insured_change' || !k));
    if (type === 'sum_insured_change' ? !Object.values(details).some(Boolean) : fields[type].some(([k]) => !f[k].trim())) { toast('Please complete all fields.', 'warn'); return; }
    const r = submitServiceRequest(policyId, type, details, 'portal');
    if (!r.ok) { toast(r.error ?? 'Could not submit.', 'warn'); return; }
    toast(`Request ${r.id} submitted. The Policy Servicing Agent will assess it.`);
    onDone();
  };
  return (
    <div className="mt-4 rounded-lg border border-line bg-sunken/50 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="What would you like to change?">
          <select id={`chg-type-${policyId}`} className="input" value={type} onChange={(e) => setType(e.target.value as ServiceRequest['type'])}>
            {types.map((k) => <option key={k} value={k}>{SERVICE_LABEL[k]}</option>)}
          </select>
        </Field>
        {fields[type].map(([k, label]) => <Field key={k} label={label}><input id={`chg-${k}-${policyId}`} className="input" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>)}
      </div>
      <p className="mt-2 text-[12px] text-muted">{type === 'cancellation' ? 'Cancellation is always reviewed by a person; nothing changes until they approve.' : 'Low-risk changes are applied automatically; changes that affect your premium are reviewed by an underwriter.'}</p>
      <div className="mt-3 flex gap-2"><Button size="sm" variant="primary" onClick={submit}>Submit request</Button><Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button></div>
    </div>
  );
}

function PolicyRequests({ policyId }: { policyId: string }) {
  const s = useDemo();
  const reqs = s.serviceRequests.filter((r) => r.policyId === policyId);
  if (!reqs.length) return null;
  const label = { submitted: 'Received', pending_approval: 'Under review', applied: 'Completed', rejected: 'Not approved' } as const;
  return (
    <div className="mt-4 border-t border-line pt-3">
      <div className="eyebrow mb-1.5">Your change requests</div>
      <ul className="space-y-1">{reqs.map((r) => <li key={r.id} className="flex flex-wrap items-center gap-2 text-[13px]"><Ref>{r.id}</Ref><span>{SERVICE_LABEL[r.type]}</span><Pill tone={r.status === 'applied' ? 'ok' : r.status === 'rejected' ? 'neutral' : 'info'}>{label[r.status]}</Pill></li>)}</ul>
    </div>
  );
}

export function PolicyCard({ p, highlight }: { p: Policy; highlight?: boolean }) {
  const { go } = useNav();
  const [changing, setChanging] = useState(false);
  const days = daysBetween(todayISO(), p.expiryDate);
  return (
    <section data-policy={p.id} className={`rounded-xl border bg-surface ${highlight ? 'border-teal shadow-[0_0_0_3px_rgb(var(--teal)/0.15)]' : 'border-line'}`}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <ShieldCheck size={18} className="text-teal" />
            <span className="font-mono text-[15px] font-semibold">{p.id}</span>
            <Pill tone={p.status === 'active' ? 'ok' : 'neutral'}>{p.status === 'active' ? 'Active' : p.status === 'cancelled' ? 'Cancelled' : 'Expired'}</Pill>
            <DemoTag>Demo record · not a real contract</DemoTag>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-muted"><ProductPill product={p.product} />{p.subject}{p.vehicle?.plate ? ` · ${p.vehicle.plate}` : ''}</div>
        </div>
        <div className="text-right">
          <div className="font-display text-[20px] font-extrabold tnum">{money(p.annualPremium, { decimals: true })}</div>
          <div className="text-[12px] text-muted">{p.travel?.tripType === 'single' ? 'trip premium' : 'annual premium'} incl. VAT</div>
        </div>
      </header>
      <div className="p-5">
        <KV cols={3} items={[
          ...policyFacts(p),
          ['Term', `${fmtDate(p.effectiveDate)} – ${fmtDate(p.expiryDate)}${days >= 0 && days <= 60 ? ` · ${days} days left` : ''}`],
          ['From quote', <Ref key="q">{p.quoteId}</Ref>],
        ]} />
        <div className="mt-5 flex flex-wrap gap-2">
          <Button size="sm" variant="primary" onClick={() => go('portal', 'claim-new', { policyId: p.id })}><FileText size={15} /> Register a claim</Button>
          <Button size="sm" onClick={() => go('portal', 'renewal', { policyId: p.id })}><RefreshCcw size={15} /> View renewal</Button>
          {p.status === 'active' && <Button size="sm" onClick={() => setChanging(!changing)}><PencilLine size={15} /> Request a change</Button>}
        </div>
        {changing && <ChangeRequestForm policyId={p.id} product={p.product} onDone={() => setChanging(false)} />}
        <PolicyRequests policyId={p.id} />
      </div>
    </section>
  );
}

function ConvertQuote({ quoteId }: { quoteId: string }) {
  const s = useDemo();
  const { go } = useNav();
  const quote = s.quotes.find((q) => q.id === quoteId);
  const customer = s.customers.find((c) => c.id === quote?.customerId);
  const [supplied, setSupplied] = useState({ plate: quote?.vehicle?.plate ?? '', vin: quote?.vehicle?.vin ?? '', address: customer?.address ?? quote?.home?.address ?? '', passport: quote?.travel?.passportNo ?? '', declaration: !!quote?.medical?.declarationConfirmed });
  const [review, setReview] = useState<AgentResult<PolicyAgentOutput> | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [issued, setIssued] = useState<string | undefined>(quote?.status === 'converted' ? quote.policyId : undefined);

  if (!quote) return <Empty>Quote {quoteId} was not found. It may have been removed by a demo reset.</Empty>;
  const policy = issued ? s.policies.find((p) => p.id === issued) : undefined;

  const runCheck = () => { const r = reviewQuoteForPolicy(quoteId, supplied); setReview(r); };
  const create = () => {
    const r = issuePolicy(quoteId, supplied);
    if (r.ok) { setIssued(r.policyId); toast(`Demo policy ${r.policyId} created`); }
    else { runCheck(); toast(`Outstanding: ${r.outstanding.join(', ')}`, 'warn'); }
  };

  return (
    <div>
      <button onClick={() => go('portal', 'policies')} className="mb-3 inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink"><ArrowLeft size={15} /> My policies</button>
      <PageHeader eyebrow="Step 2 · Policy" title={`Convert quote ${quote.id} to a demo policy`} description="The Policy Agent retrieves the quote, checks the required fields, prepares a policy summary and lists anything outstanding. Nothing is issued until you confirm." />
      {policy ? (
        <div className="space-y-4">
          <Notice tone="ok" title={`Demo policy ${policy.id} created`}>This is a fictional record for demonstration. It is not a real insurance contract and no payment was taken.</Notice>
          <PolicyCard p={policy} highlight />
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Card title="Quote summary">
            <KV items={[
              ['Policyholder', customer?.name ?? '—'], ['Insured', `${PRODUCT_LABEL[quote.product]} · ${quote.subject}`],
              ['Cover', COVERAGE_RULES[quote.coverage].label], ['Premium', money(quote.premium.total, { decimals: true })],
              ['Valid until', fmtDate(quote.validUntil)], ['Status', quote.status],
            ]} />
            <div className="mt-6 space-y-4">
              <div className="eyebrow">Policy details the agent needs</div>
              <div className="grid gap-4 sm:grid-cols-2">
                {quote.product === 'motor' && <>
                <Field label="Plate number"><input id="p-plate" className="input" value={supplied.plate} onChange={(e) => setSupplied({ ...supplied, plate: e.target.value })} /></Field>
                <Field label="VIN / chassis number" hint="Sample: 2T3W1RFV8RW012045"><input id="p-vin" className="input" value={supplied.vin} onChange={(e) => setSupplied({ ...supplied, vin: e.target.value })} /></Field>
                </>}
                {quote.product === 'travel' && <Field label="Lead traveller passport number" hint="Sample: K4839201"><input id="p-passport" className="input" value={supplied.passport} onChange={(e) => setSupplied({ ...supplied, passport: e.target.value })} /></Field>}
                {quote.product === 'medical' && <label className="flex items-start gap-2 text-[13px] sm:col-span-2"><input id="p-declaration" type="checkbox" className="mt-0.5 h-4 w-4 accent-[rgb(var(--teal))]" checked={supplied.declaration} onChange={(e) => setSupplied({ ...supplied, declaration: e.target.checked })} /> I confirm the health declaration for all members is complete and accurate (demo).</label>}
                <div className="sm:col-span-2"><Field label={quote.product === 'home' ? 'Property address' : 'Policyholder address'}><input id="p-address" className="input" value={supplied.address} onChange={(e) => setSupplied({ ...supplied, address: e.target.value })} /></Field></div>
              </div>
              <Button onClick={runCheck}>Run Policy Agent checks</Button>
            </div>
          </Card>
          <div className="space-y-5">
            {!review ? (
              <Card title="Policy Agent"><p className="text-[13.5px] text-muted">Run the checks to see the policy summary and any outstanding requirements.</p></Card>
            ) : (
              <>
                <Card title="Requirement checks">
                  <ul className="space-y-2">
                    {review.output.checks.map((c) => (
                      <li key={c.label} className="flex items-start gap-2.5 text-[13px]">
                        <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${c.ok ? 'bg-ok text-white' : 'bg-warn text-white'}`}>{c.ok ? <Check size={12} strokeWidth={3} /> : <X size={12} strokeWidth={3} />}</span>
                        <span className="min-w-0"><span className="font-medium text-ink">{c.label}</span><span className="block text-muted">{c.detail}</span></span>
                      </li>
                    ))}
                  </ul>
                  {review.output.outstanding.length > 0 && <div className="mt-4"><Notice tone="warn" title="Outstanding requirements">{review.output.outstanding.join(' · ')}. Fill them in on the left and run the checks again.</Notice></div>}
                </Card>
                {review.output.summary && (
                  <Card title="Proposed policy summary">
                    <KV items={[
                      ['Coverage', review.output.summary.coverage], [review.output.summary.sumInsuredLabel, review.output.summary.sumInsured ? money(review.output.summary.sumInsured) : '—'],
                      ...(quote.product === 'motor' || quote.product === 'home' ? [['Deductible', money(review.output.summary.deductible)] as [string, string]] : []),
                      [quote.travel?.tripType === 'single' ? 'Trip premium' : 'Annual premium', money(review.output.summary.annualPremium, { decimals: true })],
                      ['Effective date', fmtDate(review.output.summary.effectiveDate)], ['Expiry date', fmtDate(review.output.summary.expiryDate)],
                    ]} />
                    <ul className="mt-4 list-disc space-y-0.5 pl-5 text-[12.5px] text-muted">{review.output.summary.conditions.map((c) => <li key={c}>{c}</li>)}</ul>
                    <label className="mt-5 flex items-start gap-2.5 rounded-lg border border-dashed border-warn/60 bg-warnsoft/50 p-3 text-[13px]">
                      <input id="p-confirm" type="checkbox" className="mt-0.5 h-4 w-4 accent-[rgb(var(--teal))]" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                      <span>I understand this creates a <strong>fictional demo record</strong>, not a real insurance contract, and no payment is taken.</span>
                    </label>
                    <Button variant="primary" size="lg" className="mt-4 w-full sm:w-auto" disabled={!confirmed || !review.output.ready} onClick={create}><ShieldCheck size={17} /> Create demo policy</Button>
                    {!review.output.ready && <p className="mt-2 text-[12px] text-muted">Resolve the outstanding requirements first.</p>}
                  </Card>
                )}
                <AgentTrace agent="Policy Agent" summary={review.summary} trace={review.trace} />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function PoliciesPage() {
  const s = useDemo();
  const { route, viewer, go } = useNav();
  if (route.params?.quoteId) return <ConvertQuote key={route.params.quoteId} quoteId={route.params.quoteId} />;
  const policies = s.policies.filter((p) => p.customerId === viewer);
  const openQuotes = s.quotes.filter((q) => q.customerId === viewer && q.status === 'quoted');
  return (
    <div>
      <PageHeader eyebrow="Customer Portal" title="My policies" description="Your demo policies and open quotes." actions={<ViewingAs />} />
      <div className="space-y-5">
        {openQuotes.length > 0 && (
          <Card title="Open quotes" pad={false}>
            <ul className="divide-y divide-line">
              {openQuotes.map((q) => (
                <li key={q.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <Ref>{q.id}</Ref>
                  <span className="min-w-0 flex-1 text-[13px] text-muted">{q.subject} · {money(q.premium.total, { decimals: true })} · valid until {fmtDate(q.validUntil)}</span>
                  <Button size="sm" variant="primary" onClick={() => go('portal', 'policies', { quoteId: q.id })}>Convert to policy</Button>
                </li>
              ))}
            </ul>
          </Card>
        )}
        {policies.length === 0 ? (
          <Empty>No policies yet for this customer. <button className="font-medium text-tealink underline" onClick={() => go('portal', 'quote')}>Get a quote</button> to start.</Empty>
        ) : policies.map((p) => <PolicyCard key={p.id} p={p} />)}
      </div>
    </div>
  );
}
