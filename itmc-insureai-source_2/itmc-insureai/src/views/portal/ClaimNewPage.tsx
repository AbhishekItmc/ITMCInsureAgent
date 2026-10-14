import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Paperclip, Send } from 'lucide-react';
import { DOC_LABELS, INCIDENT_LABEL, PRODUCT_INCIDENTS, PRODUCT_LABEL, PROVIDER_LABEL, REQUIRED_DOCS } from '../../config/rules';
import { makeSampleDoc, type EstimateSpec } from '../../data/sampleDocs';
import { useNav } from '../../lib/nav';
import { daysFromToday, money, todayISO } from '../../lib/format';
import { useDemo } from '../../store/store';
import { registerClaim, type ClaimInput } from '../../store/workflows';
import type { ClaimDocument, DocType, IncidentType, Policy, Product } from '../../types';
import { ProductPill } from '../../ui/ProductPill';
import { Button, Card, Empty, Field, Notice, PageHeader, Ref, cx, toast } from '../../ui/primitives';
import { ViewingAs } from './common';

const MOTOR_DOCS: DocType[] = ['claim_form', 'police_report', 'repair_estimate', 'damage_photos', 'driver_license', 'registration'];
const docsFor = (product: Product): DocType[] => product === 'motor' ? MOTOR_DOCS : [...new Set(PRODUCT_INCIDENTS[product].flatMap((i) => REQUIRED_DOCS[i]))];

/** Sample incident per product. `omit` is a required document left out on purpose so the investigation has something to find. */
const MOTOR_EST: EstimateSpec = { partsTotal: 9400, labourHours: 20, labourRate: 230, paintTotal: 2900 };
const HOME_EST: EstimateSpec = { partsTotal: 5300, labourHours: 24, labourRate: 150, paintTotal: 900 };
const estFor = (p?: Policy): EstimateSpec => ({ ...(p?.product === 'home' ? HOME_EST : MOTOR_EST) });
const SCENARIO: Record<Product, { incidentType: IncidentType; location: (p?: Policy) => string; description: string; amount: string; provider: string; omit?: DocType }> = {
  motor: { incidentType: 'collision', location: () => 'King Abdullah Rd, Riyadh', description: 'Another vehicle changed lanes and hit the front-right side of my car. Front bumper, right headlamp and wing damaged. Nobody was injured.', amount: '12500', provider: 'Crescent Motors Bodyshop (fictional)', omit: 'police_report' },
  travel: { incidentType: 'medical_emergency', location: (p) => p?.travel?.destination?.split(/,| and /)[0]?.trim() || 'London, United Kingdom', description: 'Severe abdominal pain on day three of the trip. Seen at the emergency department, given tests and medication, discharged the same evening.', amount: '6800', provider: 'St Aldwyn General Hospital (fictional)', omit: 'boarding_pass' },
  medical: { incidentType: 'outpatient', location: () => 'Riyadh', description: 'Consultation and blood tests for a persistent cough and fever. Prescribed antibiotics.', amount: '1450', provider: 'Palm Grove Medical Centre (fictional)' },
  home: { incidentType: 'water_damage', location: (p) => p?.home?.address ?? 'Riyadh', description: 'A pipe burst under the kitchen sink overnight and water spread across the kitchen, damaging cabinets and the floor.', amount: '9800', provider: 'BlueLine Plumbing & Joinery (fictional)' },
};
const defaultDocs = (product: Product, incident: IncidentType, useOmit: boolean): Partial<Record<DocType, boolean>> => {
  const omit = useOmit ? SCENARIO[product].omit : undefined;
  return Object.fromEntries(REQUIRED_DOCS[incident].filter((d) => d !== omit).map((d) => [d, true]));
};
const scenarioFor = (p: Policy | undefined) => {
  const product = p?.product ?? 'motor';
  const sc = SCENARIO[product];
  return {
    policyId: p?.id ?? '',
    incidentType: sc.incidentType,
    incidentDate: p && p.effectiveDate > daysFromToday(-2) ? todayISO() : daysFromToday(-2),
    location: sc.location(p),
    description: sc.description,
    vehiclePlate: p?.vehicle?.plate ?? '',
    estimatedDamage: sc.amount,
    garage: sc.provider,
  };
};

export function ClaimNewPage() {
  const s = useDemo();
  const { viewer, route, go } = useNav();
  const policies = s.policies.filter((p) => p.customerId === viewer && p.status === 'active');
  const initialPolicy = policies.find((p) => p.id === route.params?.policyId) ?? policies[policies.length - 1];
  const customer = s.customers.find((c) => c.id === viewer);

  const [f, setF] = useState(() => scenarioFor(initialPolicy));
  const initialProduct = initialPolicy?.product ?? 'motor';
  const [docs, setDocs] = useState<Partial<Record<DocType, boolean>>>(() => defaultDocs(initialProduct, SCENARIO[initialProduct].incidentType, true));
  const [est, setEst] = useState<EstimateSpec>(() => estFor(initialPolicy));
  const [uploads, setUploads] = useState<{ type: DocType; name: string; sizeKb: number }[]>([]);
  const [uploadType, setUploadType] = useState<DocType>('police_report');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<string | undefined>();

  // A fresh navigation to this page (menu, policy card, chat) starts a new claim.
  const firstRoute = useRef(route);
  useEffect(() => {
    if (route === firstRoute.current) return;
    const p = policies.find((x) => x.id === route.params?.policyId) ?? policies[policies.length - 1];
    setCreated(undefined); setF(scenarioFor(p)); setEst(estFor(p)); setDocs(defaultDocs(p?.product ?? 'motor', SCENARIO[p?.product ?? 'motor'].incidentType, true)); setUploads([]); setErrors({});
  }, [route]); // eslint-disable-line react-hooks/exhaustive-deps

  const estTotal = est.partsTotal + est.labourHours * est.labourRate + est.paintTotal;
  const required = REQUIRED_DOCS[f.incidentType];
  const policy = s.policies.find((p) => p.id === f.policyId);
  const product: Product = policy?.product ?? 'motor';
  const ALL_DOCS = docsFor(product);
  const pickPolicy = (id: string) => { const p = s.policies.find((x) => x.id === id); setF(scenarioFor(p)); setEst(estFor(p)); setDocs(defaultDocs(p?.product ?? 'motor', SCENARIO[p?.product ?? 'motor'].incidentType, true)); setUploads([]); setErrors({}); };
  const pickIncident = (t: IncidentType) => { setF({ ...f, incidentType: t }); setDocs(defaultDocs(product, t, false)); };

  const builtDocs = useMemo((): ClaimDocument[] => {
    const ctx = { claimRef: 'NEW-CLAIM', incidentDate: f.incidentDate, reportedDate: todayISO(), plate: policy?.product === 'motor' ? f.vehiclePlate : undefined, holder: customer?.name ?? '', estimatedDamage: Number(f.estimatedDamage) || 0, garage: f.garage, description: f.description, uploadedAt: new Date().toISOString() };
    const list = docsFor(policy?.product ?? 'motor').filter((t) => docs[t]).map((t) => makeSampleDoc(t, ctx, t === 'repair_estimate' ? { estimate: { ...est, estimateDate: todayISO() } } : {}));
    for (const u of uploads) {
      const d = makeSampleDoc(u.type, ctx, u.type === 'repair_estimate' ? { estimate: { ...est, estimateDate: todayISO() } } : {});
      d.fileName = u.name; d.sizeKb = u.sizeKb; d.source = 'upload';
      const i = list.findIndex((x) => x.type === u.type);
      if (i >= 0) list[i] = d; else list.push(d);
    }
    return list;
  }, [docs, uploads, f, est, customer?.name, policy?.product]);

  if (created) {
    const c = s.claims.find((x) => x.id === created);
    return (
      <div>
        <PageHeader eyebrow="Step 3 · Claim" title="Claim registered" />
        <Card>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-[22px] font-semibold">{created}</span>
          </div>
          <p className="mt-2 max-w-2xl text-[14px] text-muted">Your claim is saved with {c?.documents.length} document(s). It now appears in your claim tracker and in the Operations Console, where the claims team can run the agentic investigation.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => go('portal', 'claims', { claimId: created })}>Track this claim <ArrowRight size={16} /></Button>
            <Button onClick={() => go('ops', 'claim', { claimId: created })}>Open in Operations Console</Button>
            <Button variant="ghost" onClick={() => go('portal', 'claim-new')}>Register another claim</Button>
          </div>
        </Card>
      </div>
    );
  }

  if (!policies.length) {
    return (
      <div>
        <PageHeader eyebrow="Step 3 · Claim" title="Register a claim" actions={<ViewingAs />} />
        <Empty>This customer has no active demo policy. <button className="font-medium text-tealink underline" onClick={() => go('portal', 'quote')}>Get a quote</button> and convert it first.</Empty>
      </div>
    );
  }

  const submit = () => {
    const input: ClaimInput = { ...f, vehiclePlate: product === 'motor' ? f.vehiclePlate : undefined, documents: builtDocs };
    const r = registerClaim(input);
    if (!r.ok) { setErrors(r.errors); toast('Some details need attention.', 'warn'); return; }
    setCreated(r.claimId);
    toast(`Claim ${r.claimId} registered`);
  };

  return (
    <div>
      <PageHeader eyebrow="Step 3 · Claim" title={`Register a ${PRODUCT_LABEL[product].toLowerCase()} claim`} description="Tell us what happened and attach supporting documents. Sample documents are provided; any file you attach is stored as metadata only." actions={<ViewingAs />} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Card title="Incident details">
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
            <div className="sm:col-span-2">
              <Field label="Policy" error={errors.policyId}>
                <select id="c-policy" className="input" value={f.policyId} onChange={(e) => pickPolicy(e.target.value)}>
                  {policies.map((p) => <option key={p.id} value={p.id}>{p.id} · {PRODUCT_LABEL[p.product]} · {p.subject}</option>)}
                </select>
              </Field>
            </div>
            <Field label="What kind of claim"><select id="c-type" className="input" value={f.incidentType} onChange={(e) => pickIncident(e.target.value as IncidentType)}>
              {PRODUCT_INCIDENTS[product].map((t) => <option key={t} value={t}>{INCIDENT_LABEL[t]}</option>)}</select></Field>
            <Field label="Incident date" error={errors.incidentDate} hint={policy ? `Policy effective ${policy.effectiveDate}` : undefined}><input id="c-date" type="date" max={todayISO()} className="input" value={f.incidentDate} aria-invalid={!!errors.incidentDate} onChange={(e) => setF({ ...f, incidentDate: e.target.value })} /></Field>
            <div className="sm:col-span-2"><Field label="Location" error={errors.location}><input id="c-loc" className="input" value={f.location} aria-invalid={!!errors.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></Field></div>
            <div className="sm:col-span-2"><Field label="What happened" error={errors.description}><textarea id="c-desc" rows={3} className="input" value={f.description} aria-invalid={!!errors.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field></div>
            {product === 'motor' && <Field label="Vehicle plate" error={errors.vehiclePlate}><input id="c-plate" className="input" value={f.vehiclePlate} aria-invalid={!!errors.vehiclePlate} onChange={(e) => setF({ ...f, vehiclePlate: e.target.value })} /></Field>}
            <Field label={product === 'motor' || product === 'home' ? 'Your estimate of the damage (SAR)' : 'Amount claimed (SAR)'} hint={product === 'travel' || product === 'medical' ? 'The sample invoice will show this amount' : undefined} error={errors.estimatedDamage}><input id="c-amount" inputMode="numeric" className="input" value={f.estimatedDamage} aria-invalid={!!errors.estimatedDamage} onChange={(e) => setF({ ...f, estimatedDamage: e.target.value })} /></Field>
            <div className="sm:col-span-2"><Field label={PROVIDER_LABEL[product]} error={errors.garage}><input id="c-garage" className="input" value={f.garage} aria-invalid={!!errors.garage} onChange={(e) => setF({ ...f, garage: e.target.value })} /></Field></div>
            <div className="sm:col-span-2">
              <Button type="submit" variant="primary" size="lg" className="w-full sm:w-auto"><Send size={16} /> Submit claim</Button>
            </div>
          </form>
        </Card>

        <div className="space-y-5">
          <Card title="Supporting documents" subtitle={`Required for ${INCIDENT_LABEL[f.incidentType].toLowerCase()}: ${required.map((r) => DOC_LABELS[r]).join(', ')}`}>
            <ul className="divide-y divide-line rounded-lg border border-line">
              {ALL_DOCS.map((t) => {
                const isReq = required.includes(t);
                const up = uploads.find((u) => u.type === t);
                return (
                  <li key={t} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                    <input id={`doc-${t}`} type="checkbox" className="h-4 w-4 accent-[rgb(var(--teal))]" checked={!!docs[t] || !!up} disabled={!!up} onChange={(e) => setDocs({ ...docs, [t]: e.target.checked })} />
                    <label htmlFor={`doc-${t}`} className="min-w-0 flex-1 text-[13px]">
                      <span className="font-medium text-ink">{DOC_LABELS[t]}</span>
                      <span className="block text-[11.5px] text-muted">{up ? `Your file: ${up.name} (${up.sizeKb} KB, metadata only)` : docs[t] ? 'Sample document attached' : 'Not attached'}</span>
                    </label>
                    {isReq && <span className={cx('text-[11px] font-medium', docs[t] || up ? 'text-ok' : 'text-warn')}>{docs[t] || up ? 'Required ✓' : 'Required'}</span>}
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 flex flex-wrap items-end gap-2">
              <Field label="Attach your own file as">
                <select id="c-uptype" className="input" value={uploadType} onChange={(e) => setUploadType(e.target.value as DocType)}>{ALL_DOCS.map((t) => <option key={t} value={t}>{DOC_LABELS[t]}</option>)}</select>
              </Field>
              <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-line bg-surface px-3 text-[13px] font-medium hover:bg-sunken">
                <Paperclip size={15} /> Choose file
                <input id="c-file" type="file" className="sr-only" onChange={(e) => { const file = e.target.files?.[0]; if (file) { setUploads((u) => [...u.filter((x) => x.type !== uploadType), { type: uploadType, name: file.name, sizeKb: Math.max(1, Math.round(file.size / 1024)) }]); toast(`${file.name} attached as ${DOC_LABELS[uploadType].toLowerCase()} (metadata only)`, 'info'); } e.target.value = ''; }} />
              </label>
            </div>
            {SCENARIO[product].omit && f.incidentType === SCENARIO[product].incidentType && !docs[SCENARIO[product].omit!] && <p className="mt-3 text-[12px] text-muted">The sample set leaves out the {DOC_LABELS[SCENARIO[product].omit!].toLowerCase()} on purpose, so the investigation has something to find. Tick it to submit a complete claim.</p>}
          </Card>

          {docs.repair_estimate && (
            <Card title="Repair estimate (sample)" subtitle={`${f.garage || PROVIDER_LABEL[product]} · line items the extraction agent will read`}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Field label={product === 'home' ? 'Materials' : 'Parts'}><input id="e-parts" inputMode="numeric" className="input" value={est.partsTotal} onChange={(e) => setEst({ ...est, partsTotal: Number(e.target.value) || 0 })} /></Field>
                <Field label="Labour hrs"><input id="e-hours" inputMode="numeric" className="input" value={est.labourHours} onChange={(e) => setEst({ ...est, labourHours: Number(e.target.value) || 0 })} /></Field>
                <Field label="Rate / hr"><input id="e-rate" inputMode="numeric" className="input" value={est.labourRate} onChange={(e) => setEst({ ...est, labourRate: Number(e.target.value) || 0 })} /></Field>
                <Field label={product === 'home' ? 'Finishing' : 'Paint'}><input id="e-paint" inputMode="numeric" className="input" value={est.paintTotal} onChange={(e) => setEst({ ...est, paintTotal: Number(e.target.value) || 0 })} /></Field>
              </div>
              <div className="mt-3 flex justify-between border-t border-line pt-3 text-[13.5px]"><span className="text-muted">Estimate total</span><span className="font-mono font-semibold tnum">{money(estTotal)}</span></div>
              {Number(f.estimatedDamage) > 0 && Math.abs(estTotal - Number(f.estimatedDamage)) / Number(f.estimatedDamage) > 0.15 && (
                <div className="mt-3"><Notice tone="warn">Estimate differs from your stated damage by {Math.round(((estTotal - Number(f.estimatedDamage)) / Number(f.estimatedDamage)) * 100)}%. You can still submit; the claims team will review it.</Notice></div>
              )}
            </Card>
          )}
          <p className="flex flex-wrap items-center gap-2 text-[12px] text-muted"><ProductPill product={product} /> Claim will be filed against <Ref>{f.policyId}</Ref> for {customer?.name}.</p>
        </div>
      </div>
    </div>
  );
}
