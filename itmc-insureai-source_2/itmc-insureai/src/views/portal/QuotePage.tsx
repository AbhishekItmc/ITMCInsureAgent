import { useEffect, useState } from 'react';
import { ArrowRight, Plus, Sparkles, Trash2 } from 'lucide-react';
import type { QuoteAgentOutput, QuoteRequest } from '../../agents/quoteAgent';
import type { AgentResult } from '../../agents/runtime';
import { CITIES, COVERAGE_RULES, INCIDENT_LABEL, PRICING, PRODUCT_COVERAGES, PRODUCT_LABEL } from '../../config/rules';
import { useNav } from '../../lib/nav';
import { daysFromToday, fmtDate, money } from '../../lib/format';
import { useDemo } from '../../store/store';
import { generateQuote } from '../../store/workflows';
import type { AddOn, Product } from '../../types';
import { AgentTrace } from '../../ui/agents';
import { PRODUCT_ICON } from '../../ui/ProductPill';
import { Button, Card, DemoTag, Field, Notice, PageHeader, Ref, cx, toast } from '../../ui/primitives';

const BASE: Omit<QuoteRequest, 'product' | 'coverage'> = {
  customer: { name: 'Hana Siddiqui', email: 'hana.siddiqui@example.test', phone: '+966 55 010 2045', dateOfBirth: '1993-05-18', city: 'Riyadh' },
  vehicle: { make: 'Toyota', model: 'RAV4 Hybrid', year: '2024', value: '118000', plate: 'HSQ 2045', vin: '', usage: 'private' },
  driver: { licenseYears: '9', claimsLast3Years: '0' },
  travel: { tripType: 'single', region: 'worldwide_ex_us', destination: 'United Kingdom', startDate: daysFromToday(14), endDate: daysFromToday(24), travellers: [{ name: 'Hana Siddiqui', age: '33' }, { name: 'Sami Siddiqui', age: '35' }] },
  medical: { members: [{ name: 'Hana Siddiqui', age: '33', relation: 'self' }, { name: 'Sami Siddiqui', age: '35', relation: 'spouse' }, { name: 'Lina Siddiqui', age: '4', relation: 'child' }], preExisting: false, network: 'Standard' },
  home: { propertyType: 'apartment', ownership: 'owner', address: '8 Olive Court, Al Yasmin, Riyadh', buildingValue: '950000', contentsValue: '180000', valuablesValue: '15000', alarm: true, floodZone: false },
  deductible: 1000,
  addOns: ['roadside', 'agency_repair'],
};
const DEFAULT_COVER: Record<Product, QuoteRequest['coverage']> = { motor: 'comprehensive', travel: 'travel_plus', medical: 'medical_plus', home: 'home_combined' };
const sample = (product: Product): QuoteRequest => structuredClone({ ...BASE, product, coverage: DEFAULT_COVER[product] });
const empty = (product: Product): QuoteRequest => ({
  ...sample(product),
  customer: { name: '', email: '', phone: '', dateOfBirth: '', city: 'Riyadh' },
  vehicle: { make: '', model: '', year: '', value: '', plate: '', vin: '', usage: 'private' },
  driver: { licenseYears: '', claimsLast3Years: '0' },
  travel: { tripType: 'single', region: 'gcc', destination: '', startDate: '', endDate: '', travellers: [{ name: '', age: '' }] },
  medical: { members: [{ name: '', age: '', relation: 'self' }], preExisting: false, network: 'Standard' },
  home: { propertyType: 'apartment', ownership: 'owner', address: '', buildingValue: '', contentsValue: '', valuablesValue: '', alarm: false, floodZone: false },
  addOns: [],
});
const PRODUCTS: Product[] = ['motor', 'travel', 'medical', 'home'];

export function QuotePage() {
  const s = useDemo();
  const { go, viewer, setViewer, route } = useNav();
  const initial = (PRODUCTS.includes(route.params?.product as Product) ? route.params!.product : 'motor') as Product;
  const [form, setForm] = useState<QuoteRequest>(() => sample(initial));
  useEffect(() => { if (route.params?.product && route.params.product !== form.product && PRODUCTS.includes(route.params.product as Product)) { setForm(sample(route.params.product as Product)); setResult(null); } }, [route.params?.product]); // eslint-disable-line react-hooks/exhaustive-deps
  const product = form.product;
  const pickProduct = (p: Product) => { setForm((f) => ({ ...sample(p), customer: f.customer })); setResult(null); setQuoteId(undefined); };
  const [result, setResult] = useState<AgentResult<QuoteAgentOutput> | null>(null);
  const [quoteId, setQuoteId] = useState<string | undefined>();

  const set = <K extends keyof QuoteRequest>(k: K, patch: Partial<QuoteRequest[K]>) => setForm((f) => ({ ...f, [k]: typeof f[k] === 'object' && !Array.isArray(f[k]) ? { ...(f[k] as object), ...patch } : patch }));
  const err = (field: string) => result?.output.errors.find((e) => e.field === field)?.message;

  const useSignedIn = () => {
    const c = s.customers.find((x) => x.id === viewer);
    if (!c) return;
    setForm((f) => ({ ...f, customer: { name: c.name, email: c.email, phone: c.phone, dateOfBirth: c.dateOfBirth, city: c.city } }));
  };

  const submit = () => {
    const r = generateQuote(form);
    setResult(r.result);
    setQuoteId(r.quoteId);
    setTimeout(() => document.getElementById('quote-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    if (r.quoteId && r.customerId) { setViewer(r.customerId); toast(`Quote ${r.quoteId} saved`); }
    else toast('The Quote Agent found fields to fix before pricing.', 'warn');
  };

  const quote = quoteId ? s.quotes.find((q) => q.id === quoteId) : undefined;
  const toggleAddOn = (a: AddOn) => setForm((f) => ({ ...f, addOns: f.addOns.includes(a) ? f.addOns.filter((x) => x !== a) : [...f.addOns, a] }));

  return (
    <div>
      <PageHeader eyebrow="Step 1 · Quote" title={`Get a ${PRODUCT_LABEL[product].toLowerCase()} quote`} description="The Quote Agent validates your details, prices them with the configured demo tariff for the product and explains every factor." />
      <div role="tablist" aria-label="Product" className="mb-5 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {PRODUCTS.map((p) => { const Icon = PRODUCT_ICON[p]; return (
          <button key={p} role="tab" aria-selected={product === p} onClick={() => pickProduct(p)}
            className={cx('flex items-center gap-2 rounded-xl border px-4 py-2.5 text-[14px] font-semibold transition-colors', product === p ? 'border-teal bg-tealsoft text-tealink' : 'border-line bg-surface text-muted hover:text-ink')}>
            <Icon size={18} /> {PRODUCT_LABEL[p]}
          </button>
        ); })}
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <Card title="Your details" subtitle="Fictional details only. A sample applicant is pre-filled." action={
          <div className="flex gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => { setForm(sample(product)); setResult(null); }}>Sample</Button>
            <Button size="sm" variant="ghost" onClick={useSignedIn}>Use signed-in</Button>
            <Button size="sm" variant="ghost" onClick={() => { setForm(empty(product)); setResult(null); }}>Clear</Button>
          </div>
        }>
          <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
            <fieldset className="grid gap-4 sm:grid-cols-2">
              <legend className="eyebrow mb-3">Policyholder</legend>
              <Field label="Full name" error={err('customer.name')}><input id="q-name" className="input" value={form.customer.name} aria-invalid={!!err('customer.name')} onChange={(e) => set('customer', { name: e.target.value })} /></Field>
              <Field label="Email" error={err('customer.email')}><input id="q-email" className="input" value={form.customer.email} aria-invalid={!!err('customer.email')} onChange={(e) => set('customer', { email: e.target.value })} /></Field>
              <Field label="Mobile" hint="Optional for a quote"><input id="q-phone" className="input" value={form.customer.phone} onChange={(e) => set('customer', { phone: e.target.value })} /></Field>
              <Field label="Date of birth" error={err('customer.dateOfBirth')}><input id="q-dob" type="date" className="input" value={form.customer.dateOfBirth} aria-invalid={!!err('customer.dateOfBirth')} onChange={(e) => set('customer', { dateOfBirth: e.target.value })} /></Field>
              <Field label="City"><select id="q-city" className="input" value={form.customer.city} onChange={(e) => set('customer', { city: e.target.value })}>{CITIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
              {product === 'motor' && <div className="grid grid-cols-2 gap-3">
                <Field label="Years licensed" error={err('driver.licenseYears')}><input id="q-lic" inputMode="numeric" className="input" value={form.driver.licenseYears} aria-invalid={!!err('driver.licenseYears')} onChange={(e) => set('driver', { licenseYears: e.target.value })} /></Field>
                <Field label="Claims, 3 yrs" error={err('driver.claimsLast3Years')}><input id="q-claims" inputMode="numeric" className="input" value={form.driver.claimsLast3Years} onChange={(e) => set('driver', { claimsLast3Years: e.target.value })} /></Field>
              </div>}
            </fieldset>

            {product === 'motor' && <fieldset className="grid gap-4 sm:grid-cols-2">
              <legend className="eyebrow mb-3">Vehicle</legend>
              <Field label="Make" error={err('vehicle.make')}><input id="q-make" className="input" value={form.vehicle.make} aria-invalid={!!err('vehicle.make')} onChange={(e) => set('vehicle', { make: e.target.value })} /></Field>
              <Field label="Model" error={err('vehicle.model')}><input id="q-model" className="input" value={form.vehicle.model} aria-invalid={!!err('vehicle.model')} onChange={(e) => set('vehicle', { model: e.target.value })} /></Field>
              <Field label="Model year" error={err('vehicle.year')}><input id="q-year" inputMode="numeric" className="input" value={form.vehicle.year} aria-invalid={!!err('vehicle.year')} onChange={(e) => set('vehicle', { year: e.target.value })} /></Field>
              <Field label="Market value (SAR)" error={err('vehicle.value')}><input id="q-value" inputMode="numeric" className="input" value={form.vehicle.value} aria-invalid={!!err('vehicle.value')} onChange={(e) => set('vehicle', { value: e.target.value })} /></Field>
              <Field label="Plate number" hint="Needed before policy issue"><input id="q-plate" className="input" value={form.vehicle.plate} onChange={(e) => set('vehicle', { plate: e.target.value })} /></Field>
              <Field label="VIN / chassis" hint="Needed before policy issue"><input id="q-vin" className="input" value={form.vehicle.vin} onChange={(e) => set('vehicle', { vin: e.target.value })} /></Field>
              <Field label="Usage"><select id="q-usage" className="input" value={form.vehicle.usage} onChange={(e) => set('vehicle', { usage: e.target.value as 'private' | 'commercial' })}><option value="private">Private</option><option value="commercial">Commercial</option></select></Field>
            </fieldset>}
            {product === 'travel' && <TravelFields form={form} setForm={setForm} err={err} />}
            {product === 'medical' && <MedicalFields form={form} setForm={setForm} err={err} />}
            {product === 'home' && <HomeFields form={form} setForm={setForm} err={err} />}

            <fieldset className="grid gap-4 sm:grid-cols-2">
              <legend className="eyebrow mb-3">Cover</legend>
              <Field label="Cover type" error={err('coverage')}><select id="q-cover" className="input" value={form.coverage} onChange={(e) => setForm((f) => ({ ...f, coverage: e.target.value as QuoteRequest['coverage'] }))}>{PRODUCT_COVERAGES[product].map((c) => <option key={c} value={c}>{COVERAGE_RULES[c].label}</option>)}</select></Field>
              {(product === 'motor' || product === 'home') && <Field label="Deductible (SAR)"><select id="q-ded" className="input" value={form.deductible} onChange={(e) => setForm((f) => ({ ...f, deductible: Number(e.target.value) }))}>{[500, 1000, 2000].map((d) => <option key={d} value={d}>{d.toLocaleString()}</option>)}</select></Field>}
              {product !== 'motor' && <CoverNotes coverage={form.coverage} />}
              {product === 'motor' && <div className="sm:col-span-2">
                <div className="mb-2 text-[12px] font-medium text-muted">Add-ons</div>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(PRICING.addOns) as AddOn[]).map((a) => (
                    <button type="button" key={a} onClick={() => toggleAddOn(a)} aria-pressed={form.addOns.includes(a)}
                      className={cx('rounded-full border px-3 py-1.5 text-[12.5px] font-medium', form.addOns.includes(a) ? 'border-teal bg-tealsoft text-tealink' : 'border-line text-muted hover:text-ink')}>
                      {PRICING.addOns[a].label}
                    </button>
                  ))}
                </div>
              </div>}
            </fieldset>
            <Button type="submit" variant="primary" size="lg" className="w-full sm:w-auto"><Sparkles size={17} /> Generate Quote</Button>
          </form>
        </Card>

        <div id="quote-result" className="scroll-mt-4 space-y-5">
          {!result && (
            <Card title="Quote result">
              <div className="space-y-3 text-[13.5px] text-muted">
                <p>Press <strong className="text-ink">Generate Quote</strong> and the Quote Agent will:</p>
                <ol className="list-decimal space-y-1 pl-5">
                  <li>Validate the submitted fields</li><li>Identify missing information</li><li>Call the deterministic demo pricing engine</li>
                  <li>Produce a premium and coverage summary</li><li>Explain its assumptions</li><li>Save the quote with a reference</li>
                </ol>
              </div>
            </Card>
          )}
          {result && !result.output.ok && (
            <Card title="Quote not priced yet">
              <Notice tone="warn" title={`${result.output.errors.length} field(s) need attention`}>
                <ul className="mt-1 list-disc pl-5">{result.output.errors.map((e) => <li key={e.field + e.message}>{e.message}</li>)}</ul>
              </Notice>
              <div className="mt-4"><AgentTrace agent="Quote Agent" summary={result.summary} trace={result.trace} /></div>
            </Card>
          )}
          {result?.output.ok && quote && (
            <>
              <section className="rounded-xl bg-navy p-6 text-navyink">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-[13px] text-navymuted">{PRODUCT_LABEL[quote.product]} quote {quote.id}</span>
                  <DemoTag>Illustrative</DemoTag>
                </div>
                <div className="mt-3 font-display text-[34px] font-extrabold leading-none tnum">{money(quote.premium.total, { decimals: true })}</div>
                <div className="mt-1 text-[13px] text-navymuted">{quote.travel?.tripType === 'single' ? 'for the trip' : 'per year'} incl. VAT · valid until {fmtDate(quote.validUntil)} · {quote.subject}</div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-3">
                  <div><div className="text-navymuted">Cover</div><div className="font-medium">{COVERAGE_RULES[quote.coverage].label}</div></div>
                  <div><div className="text-navymuted">{{ motor: 'Sum insured', travel: 'Medical limit', medical: 'Annual limit', home: 'Sum insured' }[quote.product]}</div><div className="font-medium tnum">{quote.sumInsured ? money(quote.sumInsured) : '—'}</div></div>
                  <div><div className="text-navymuted">{quote.product === 'motor' || quote.product === 'home' ? 'Deductible' : 'Insured'}</div><div className="font-medium tnum">{quote.product === 'motor' || quote.product === 'home' ? money(quote.deductible) : quote.subject.split(' · ').slice(-1)[0]}</div></div>
                </div>
                <Button variant="primary" className="mt-5" onClick={() => go('portal', 'policies', { quoteId: quote.id })}>Convert to demo policy <ArrowRight size={16} /></Button>
              </section>

              <Card title="How the premium was calculated" pad={false}>
                <table className="w-full text-[13px]">
                  <tbody className="divide-y divide-line">
                    {quote.premium.lines.map((l, i) => (
                      <tr key={i}>
                        <td className="px-5 py-2"><div className="text-ink">{l.label}</div>{l.note && <div className="text-[11.5px] text-muted">{l.note}</div>}</td>
                        <td className={cx('px-5 py-2 text-right font-mono tnum', l.kind === 'discount' ? 'text-ok' : 'text-ink')}>{l.amount < 0 ? '−' : ''}{Math.abs(l.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
                    <tr className="bg-sunken/60 font-semibold"><td className="px-5 py-2.5">Total annual premium</td><td className="px-5 py-2.5 text-right font-mono tnum">{money(quote.premium.total, { decimals: true })}</td></tr>
                  </tbody>
                </table>
              </Card>

              <Card title="Assumptions & missing information">
                <ul className="list-disc space-y-1 pl-5 text-[13px] text-ink">{quote.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
                {quote.missingInfo.length > 0 && (
                  <div className="mt-4"><Notice tone="warn" title="Still to collect">{quote.missingInfo.join(' · ')}</Notice></div>
                )}
              </Card>
              <AgentTrace agent="Quote Agent" summary={result.summary} trace={result.trace} />
              <p className="text-[12px] text-muted">Saved as <Ref>{quote.id}</Ref> for {s.customers.find((c) => c.id === quote.customerId)?.name}. Visible in the Operations Console under Quotes & Policies.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

type FP = { form: QuoteRequest; setForm: React.Dispatch<React.SetStateAction<QuoteRequest>>; err: (f: string) => string | undefined };

function CoverNotes({ coverage }: { coverage: QuoteRequest['coverage'] }) {
  const r = COVERAGE_RULES[coverage];
  return (
    <div className="rounded-lg border border-line bg-sunken/50 p-3 text-[12.5px] sm:col-span-2">
      <div className="font-semibold text-ink">{r.label}{r.limits ? ' limits' : ''}</div>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-muted">{r.limits
        ? Object.entries(r.limits).map(([k, v]) => <span key={k}>{INCIDENT_LABEL[k as keyof typeof INCIDENT_LABEL]}: <strong className="text-ink tnum">{money(v as number)}</strong></span>)
        : <span>Covers {r.coveredIncidents.map((i) => INCIDENT_LABEL[i].toLowerCase()).join(', ')} · liability up to <strong className="text-ink tnum">{money(r.thirdPartyLimit)}</strong></span>}</div>
    </div>
  );
}

function TravelFields({ form, setForm, err }: FP) {
  const t = form.travel;
  const up = (patch: Partial<QuoteRequest['travel']>) => setForm((f) => ({ ...f, travel: { ...f.travel, ...patch } }));
  return (
    <fieldset className="grid gap-4 sm:grid-cols-2">
      <legend className="eyebrow mb-3">Trip</legend>
      <Field label="Trip type"><select id="t-type" className="input" value={t.tripType} onChange={(e) => up({ tripType: e.target.value as 'single' | 'annual' })}><option value="single">Single trip</option><option value="annual">Annual multi-trip</option></select></Field>
      <Field label="Region"><select id="t-region" className="input" value={t.region} onChange={(e) => up({ region: e.target.value as QuoteRequest['travel']['region'] })}><option value="gcc">GCC countries</option><option value="worldwide_ex_us">Worldwide excl. USA & Canada</option><option value="worldwide">Worldwide</option></select></Field>
      <div className="sm:col-span-2"><Field label="Destination(s)" error={err('travel.destination')}><input id="t-dest" className="input" value={t.destination} onChange={(e) => up({ destination: e.target.value })} /></Field></div>
      <Field label={t.tripType === 'annual' ? 'Cover starts' : 'Departure'} error={err('travel.startDate')}><input id="t-start" type="date" className="input" value={t.startDate} onChange={(e) => up({ startDate: e.target.value })} /></Field>
      {t.tripType === 'single' && <Field label="Return" error={err('travel.endDate')}><input id="t-end" type="date" className="input" value={t.endDate} onChange={(e) => up({ endDate: e.target.value })} /></Field>}
      <div className="space-y-2 sm:col-span-2">
        <div className="text-[12px] font-medium text-muted">Travellers</div>
        {t.travellers.map((x, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_90px_36px] gap-2">
            <input id={`t-name-${i}`} aria-label={`Traveller ${i + 1} name`} className="input" placeholder="Name" value={x.name} onChange={(e) => up({ travellers: t.travellers.map((y, j) => j === i ? { ...y, name: e.target.value } : y) })} />
            <input id={`t-age-${i}`} aria-label={`Traveller ${i + 1} age`} inputMode="numeric" className="input" placeholder="Age" value={x.age} aria-invalid={!!err(`travel.travellers.${i}`)} onChange={(e) => up({ travellers: t.travellers.map((y, j) => j === i ? { ...y, age: e.target.value } : y) })} />
            <button type="button" aria-label="Remove traveller" disabled={t.travellers.length === 1} onClick={() => up({ travellers: t.travellers.filter((_, j) => j !== i) })} className="flex items-center justify-center rounded-lg border border-line text-muted hover:text-crit disabled:opacity-30"><Trash2 size={15} /></button>
          </div>
        ))}
        <Button type="button" size="sm" variant="ghost" onClick={() => up({ travellers: [...t.travellers, { name: '', age: '' }] })}><Plus size={14} /> Add traveller</Button>
      </div>
    </fieldset>
  );
}

function MedicalFields({ form, setForm, err }: FP) {
  const m = form.medical;
  const up = (patch: Partial<QuoteRequest['medical']>) => setForm((f) => ({ ...f, medical: { ...f.medical, ...patch } }));
  return (
    <fieldset className="grid gap-4 sm:grid-cols-2">
      <legend className="eyebrow mb-3">Members to cover</legend>
      <div className="space-y-2 sm:col-span-2">
        {m.members.map((x, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_70px_110px_36px] gap-2">
            <input id={`m-name-${i}`} aria-label={`Member ${i + 1} name`} className="input" placeholder="Name" value={x.name} aria-invalid={!!err(`medical.members.${i}`)} onChange={(e) => up({ members: m.members.map((y, j) => j === i ? { ...y, name: e.target.value } : y) })} />
            <input id={`m-age-${i}`} aria-label={`Member ${i + 1} age`} inputMode="numeric" className="input" placeholder="Age" value={x.age} onChange={(e) => up({ members: m.members.map((y, j) => j === i ? { ...y, age: e.target.value } : y) })} />
            <select id={`m-rel-${i}`} aria-label={`Member ${i + 1} relation`} className="input" value={x.relation} onChange={(e) => up({ members: m.members.map((y, j) => j === i ? { ...y, relation: e.target.value as 'self' } : y) })}><option value="self">Self</option><option value="spouse">Spouse</option><option value="child">Child</option><option value="parent">Parent</option></select>
            <button type="button" aria-label="Remove member" disabled={m.members.length === 1} onClick={() => up({ members: m.members.filter((_, j) => j !== i) })} className="flex items-center justify-center rounded-lg border border-line text-muted hover:text-crit disabled:opacity-30"><Trash2 size={15} /></button>
          </div>
        ))}
        <Button type="button" size="sm" variant="ghost" onClick={() => up({ members: [...m.members, { name: '', age: '', relation: 'child' }] })}><Plus size={14} /> Add member</Button>
      </div>
      <Field label="Hospital network"><select id="m-net" className="input" value={m.network} onChange={(e) => up({ network: e.target.value as QuoteRequest['medical']['network'] })}><option>Standard</option><option>Extended</option><option>Nationwide+</option></select></Field>
      <label className="flex items-center gap-2 self-end pb-2 text-[13px]"><input id="m-pre" type="checkbox" className="h-4 w-4 accent-[rgb(var(--teal))]" checked={m.preExisting} onChange={(e) => up({ preExisting: e.target.checked })} /> A member has a pre-existing condition</label>
    </fieldset>
  );
}

function HomeFields({ form, setForm, err }: FP) {
  const h = form.home;
  const up = (patch: Partial<QuoteRequest['home']>) => setForm((f) => ({ ...f, home: { ...f.home, ...patch } }));
  return (
    <fieldset className="grid gap-4 sm:grid-cols-2">
      <legend className="eyebrow mb-3">Property</legend>
      <Field label="Property type"><select id="h-type" className="input" value={h.propertyType} onChange={(e) => up({ propertyType: e.target.value as 'villa' })}><option value="apartment">Apartment</option><option value="villa">Villa</option></select></Field>
      <Field label="You are the"><select id="h-own" className="input" value={h.ownership} onChange={(e) => up({ ownership: e.target.value as 'owner' })}><option value="owner">Owner</option><option value="tenant">Tenant</option></select></Field>
      <div className="sm:col-span-2"><Field label="Property address" error={err('home.address')}><input id="h-address" className="input" value={h.address} onChange={(e) => up({ address: e.target.value })} /></Field></div>
      {form.coverage !== 'home_contents' && <Field label="Rebuild value (SAR)" error={err('home.buildingValue')}><input id="h-building" inputMode="numeric" className="input" value={h.buildingValue} onChange={(e) => up({ buildingValue: e.target.value })} /></Field>}
      {form.coverage !== 'home_buildings' && <Field label="Contents value (SAR)" error={err('home.contentsValue')}><input id="h-contents" inputMode="numeric" className="input" value={h.contentsValue} onChange={(e) => up({ contentsValue: e.target.value })} /></Field>}
      {form.coverage !== 'home_buildings' && <Field label="Valuables (SAR)" hint="Jewellery, watches, art" error={err('home.valuablesValue')}><input id="h-valuables" inputMode="numeric" className="input" value={h.valuablesValue} onChange={(e) => up({ valuablesValue: e.target.value })} /></Field>}
      <div className="flex flex-col gap-2 text-[13px] sm:col-span-2 sm:flex-row sm:gap-6">
        <label className="flex items-center gap-2"><input id="h-alarm" type="checkbox" className="h-4 w-4 accent-[rgb(var(--teal))]" checked={h.alarm} onChange={(e) => up({ alarm: e.target.checked })} /> Monitored alarm installed</label>
        <label className="flex items-center gap-2"><input id="h-flood" type="checkbox" className="h-4 w-4 accent-[rgb(var(--teal))]" checked={h.floodZone} onChange={(e) => up({ floodZone: e.target.checked })} /> In a declared flood zone</label>
      </div>
    </fieldset>
  );
}
