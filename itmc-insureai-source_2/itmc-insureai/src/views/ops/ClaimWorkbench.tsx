import { useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, Ban, CheckCircle2, FileQuestion, Play, ShieldAlert, Sparkles } from 'lucide-react';
import { ENGINE_LABEL } from '../../agents/runtime';
import { COVERAGE_RULES, DOC_LABELS, INCIDENT_LABEL, PROVIDER_LABEL, REQUIRED_DOCS } from '../../config/rules';
import { ProductPill } from '../../ui/ProductPill';
import { useNav } from '../../lib/nav';
import { fmtDate, fmtDateTime, money } from '../../lib/format';
import { APPROVAL_STATUS, CLAIM_STATUS, customerName, latestInvestigation } from '../../lib/selectors';
import { useDemo } from '../../store/store';
import { decide, isInvestigationRunning, REVIEWER, runInvestigation, type Decision } from '../../store/workflows';
import type { Approval, Claim, InvestigationReport } from '../../types';
import { AgentStepCard, FindingItem, InvestigationTimeline, SimulatedTag } from '../../ui/agents';
import { Button, Card, Empty, KV, Notice, PageHeader, Pill, Ref, cx, toast } from '../../ui/primitives';

export function ClaimWorkbench() {
  const s = useDemo();
  const { route, go } = useNav();
  const claim = s.claims.find((c) => c.id === route.params?.claimId);
  const [busy, setBusy] = useState(false);
  if (!claim) return <Empty>Claim not found. <button className="text-tealink underline" onClick={() => go('ops', 'claims')}>Back to claims</button></Empty>;

  const policy = s.policies.find((p) => p.id === claim.policyId);
  const inv = latestInvestigation(claim);
  const running = inv?.status === 'running' || busy || isInvestigationRunning(claim.id);
  const approval = inv ? s.approvals.find((a) => a.investigationRunId === inv.runId) : undefined;
  const blockReason = running ? 'Investigation in progress…' : claim.status === 'awaiting_review' ? 'Decide on the current report before running again.' : claim.status === 'assessment_completed' ? 'Assessment already completed.' : undefined;
  const required = REQUIRED_DOCS[claim.incidentType];

  const start = async () => {
    setBusy(true);
    const r = await runInvestigation(claim.id);
    setBusy(false);
    if (r.ok) toast('Investigation complete. Report routed to human review.');
    else toast(r.error ?? 'Investigation could not run.', 'crit');
  };

  return (
    <div>
      <button onClick={() => go('ops', 'claims')} className="mb-3 inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink"><ArrowLeft size={15} /> Claims</button>
      <PageHeader
        eyebrow="Claims workbench"
        title={claim.id}
        description={<span className="flex flex-wrap items-center gap-2"><Pill tone={CLAIM_STATUS[claim.status].tone} pulse={claim.status === 'under_investigation'}>{CLAIM_STATUS[claim.status].ops}</Pill><ProductPill product={claim.product} /><span>{customerName(s, claim.customerId)} · {INCIDENT_LABEL[claim.incidentType]} on {fmtDate(claim.incidentDate)} · policy <Ref>{claim.policyId}</Ref></span></span>}
      />

      {/* Hero action */}
      <section className="mb-5 overflow-hidden rounded-xl border border-teal/40 bg-navy text-navyink">
        <div className="flex flex-wrap items-center gap-4 p-5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><Sparkles size={18} className="text-teal" /><span className="font-display text-[16px] font-bold">Agentic claims investigation</span></div>
            <p className="mt-1 max-w-2xl text-[13px] text-navymuted">Five agents run in sequence: Document Intelligence → Policy Intelligence → Claims Assessment → Fraud Investigation Assistant → Supervisor. Each writes its output to this claim, then the case is routed to a person.</p>
            <p className="mt-2 font-mono text-[11px] text-teal">{ENGINE_LABEL}</p>
          </div>
          <div className="flex w-full flex-col items-stretch gap-1.5 sm:w-auto sm:items-end">
            <Button variant="primary" size="lg" disabled={!!blockReason} onClick={start} className="!h-auto min-h-12 w-full !whitespace-normal py-2.5 text-center uppercase sm:w-auto">
              <Play size={17} fill="currentColor" /> {running ? 'Investigation running…' : inv ? 'Re-run agentic claims investigation' : 'Run agentic claims investigation'}
            </Button>
            {blockReason && <span className="text-[12px] text-navymuted">{blockReason}</span>}
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card title="Execution timeline" action={inv && <span className="font-mono text-[11px] text-muted">{inv.runId}</span>}>
            {inv ? <InvestigationTimeline inv={inv} reviewDecided={approval && approval.status !== 'pending' ? APPROVAL_STATUS[approval.status].label : undefined} /> : <p className="text-[13px] text-muted">No investigation yet. Press the button above to start one.</p>}
          </Card>
          <Card title="Claim facts">
            <KV cols={1} items={[
              ['Customer estimate', money(claim.estimatedDamage)], ['Location', claim.location], [PROVIDER_LABEL[claim.product], claim.garage],
              ['Reported', fmtDate(claim.reportedDate)], ['Cover', policy ? `${COVERAGE_RULES[policy.coverage].label}${policy.product === 'motor' || policy.product === 'home' ? ` · deductible ${money(policy.deductible)}` : COVERAGE_RULES[policy.coverage].limits?.[claim.incidentType] ? ` · limit ${money(COVERAGE_RULES[policy.coverage].limits![claim.incidentType]!)}` : ''}` : '—'],
            ]} />
            <p className="mt-3 text-[12.5px] leading-relaxed text-muted">{claim.description}</p>
          </Card>
          <Card title="Documents" subtitle={`${claim.documents.length} on file · ${required.filter((r) => !claim.documents.some((d) => d.type === r)).length} required missing`}>
            <ul className="space-y-1.5">
              {required.map((t) => {
                const d = claim.documents.find((x) => x.type === t);
                return (
                  <li key={t} className="flex items-start gap-2 text-[12.5px]">
                    {d ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-ok" /> : <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warn" />}
                    <span className="min-w-0"><span className={d ? 'text-ink' : 'font-medium text-warn'}>{DOC_LABELS[t]}</span>{d && <span className="block truncate font-mono text-[11px] text-muted">{d.fileName}{d.source === 'upload' ? ' · uploaded' : ''}</span>}</span>
                  </li>
                );
              })}
              {claim.documents.filter((d) => !required.includes(d.type)).map((d) => (
                <li key={d.id} className="flex items-start gap-2 text-[12.5px]"><CheckCircle2 size={15} className="mt-0.5 shrink-0 text-muted" /><span>{DOC_LABELS[d.type]} <span className="text-muted">(supplementary)</span></span></li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="min-w-0 space-y-5">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2"><h2 className="font-display text-[16px] font-bold">Agent workflow</h2><SimulatedTag /><span className="text-[12px] text-muted">Click a completed agent to inspect its output, evidence and trace.</span></div>
            {inv ? (
              <div className="space-y-2.5">
                {inv.steps.map((st, i) => <AgentStepCard key={`${inv.runId}-${i}`} step={st} index={i} />)}
              </div>
            ) : (
              <div className="space-y-2.5 opacity-70">
                {['Document Intelligence Agent', 'Policy Intelligence Agent', 'Claims Assessment Agent', 'Fraud Investigation Assistant', 'Supervisor Agent'].map((a, i) => (
                  <div key={a} className="flex items-center gap-3 rounded-xl border border-dashed border-line bg-surface px-4 py-3.5"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-sunken font-mono text-[12px] text-muted">{i + 1}</span><span className="font-display text-[14px] font-bold text-muted">{a}</span><Pill tone="neutral" className="ml-auto">Idle</Pill></div>
                ))}
              </div>
            )}
          </div>

          {inv?.report && <ReportAndDecision claim={claim} report={inv.report} approval={approval} />}
          {inv?.status === 'interrupted' && <Notice tone="warn" title="Investigation interrupted">The previous run did not finish (the page was closed or an error occurred). Run it again.</Notice>}
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card title="Status history" pad={false}>
          <ul className="divide-y divide-line">
            {[...claim.statusHistory].reverse().map((h, i) => (
              <li key={i} className="flex flex-wrap items-start gap-3 px-5 py-2.5 text-[12.5px]">
                <Pill tone={CLAIM_STATUS[h.status].tone}>{CLAIM_STATUS[h.status].ops}</Pill>
                <span className="min-w-0 flex-1 text-muted">{h.by}{h.note ? ` · ${h.note}` : ''}</span>
                <span className="font-mono text-[11px] text-muted">{fmtDateTime(h.at)}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Audit events for this claim" pad={false} action={<button className="text-[12.5px] font-medium text-tealink" onClick={() => go('ops', 'audit', { entity: claim.id })}>Full audit trail →</button>}>
          <ul className="max-h-[360px] divide-y divide-line overflow-y-auto">
            {s.audit.filter((a) => a.entityId === claim.id || s.approvals.some((ap) => ap.id === a.entityId && ap.claimId === claim.id)).slice().reverse().map((a) => (
              <li key={a.id} className="px-5 py-2.5 text-[12.5px]">
                <div className="flex flex-wrap items-center gap-2"><span className="font-medium text-ink">{a.action}</span><span className="text-muted">· {a.actor}</span><span className="ml-auto font-mono text-[11px] text-muted">{fmtDateTime(a.at)}</span></div>
                <div className="text-muted">{a.detail}</div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

export function ReportAndDecision({ claim, report, approval }: { claim: Claim; report: InvestigationReport; approval?: Approval }) {
  return (
    <section className="rounded-xl border-2 border-navy/80 bg-surface">
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
        <ShieldAlert size={19} className="text-teal" />
        <h2 className="font-display text-[16px] font-bold">Consolidated investigation report</h2>
        <Pill tone={report.confidence === 'High' ? 'ok' : report.confidence === 'Medium' ? 'info' : 'warn'} dot={false}>Confidence: {report.confidence}</Pill>
        <span className="ml-auto text-[12px] text-muted">Prepared by Supervisor Agent (simulated)</span>
      </header>
      <div className="space-y-6 p-5">
        <ReportSection title="Claim summary"><p className="text-[13.5px] leading-relaxed">{report.claimSummary}</p></ReportSection>
        <ReportSection title={`Documents reviewed (${report.documentsReviewed.length})`}>
          <ul className="divide-y divide-line rounded-lg border border-line">
            {report.documentsReviewed.map((d) => <li key={d.fileName} className="px-3 py-2 text-[12.5px]"><span className="font-medium">{DOC_LABELS[d.type]}</span> <span className="font-mono text-[11.5px] text-muted">{d.fileName}</span><div className="text-[11.5px] text-muted">{d.keyFields}</div></li>)}
          </ul>
        </ReportSection>
        <ReportSection title="Coverage observations"><ul className="list-disc space-y-1 pl-5 text-[13px]">{report.coverageObservations.map((o) => <li key={o}>{o}</li>)}</ul></ReportSection>
        <ReportSection title="Missing documents">
          {report.missingDocuments.length ? <div className="flex flex-wrap gap-2">{report.missingDocuments.map((m) => <Pill key={m} tone="warn">{DOC_LABELS[m]}</Pill>)}</div> : <p className="text-[13px] text-muted">None. All required documents are on file.</p>}
        </ReportSection>
        <ReportSection title={`Inconsistencies (${report.inconsistencies.length})`}>
          {report.inconsistencies.length ? <div className="grid gap-2">{report.inconsistencies.map((f) => <FindingItem key={f.id} f={f} />)}</div> : <p className="text-[13px] text-muted">No inconsistencies found.</p>}
        </ReportSection>
        <ReportSection title={`Potential anomalies (${report.anomalies.length})`}>
          {report.anomalies.length ? (
            <>
              <p className="mb-2 text-[12px] italic text-muted">Indicators for an investigator to consider. They are not findings of fraud and no one has been labelled fraudulent.</p>
              <div className="grid gap-2">{report.anomalies.map((f) => <FindingItem key={f.id} f={f} />)}</div>
            </>
          ) : <p className="text-[13px] text-muted">No anomaly thresholds were met.</p>}
        </ReportSection>
        <ReportSection title="Outstanding questions"><ul className="list-disc space-y-1 pl-5 text-[13px]">{report.outstandingQuestions.length ? report.outstandingQuestions.map((q) => <li key={q}>{q}</li>) : <li>None.</li>}</ul></ReportSection>
        <ReportSection title="Uncertainty & limits"><ul className="list-disc space-y-1 pl-5 text-[13px] text-muted">{report.uncertainty.map((q) => <li key={q}>{q}</li>)}</ul></ReportSection>
        <div className="rounded-xl border border-teal/50 bg-tealsoft/50 p-4">
          <div className="eyebrow text-tealink">Recommended next action</div>
          <div className="mt-1 font-display text-[16px] font-bold">{report.recommendation.label}</div>
          <p className="mt-1 text-[13px]">{report.recommendation.rationale}</p>
          <div className="mt-2 text-[12.5px] text-muted">Next owner: <strong className="text-ink">{report.recommendation.nextOwner}</strong> · code <span className="font-mono">{report.recommendation.code}</span></div>
        </div>
        {approval && <DecisionPanel approval={approval} claimId={claim.id} />}
      </div>
    </section>
  );
}

function ReportSection({ title, children }: { title: string; children: ReactNode }) {
  return <div><h3 className="eyebrow mb-2">{title}</h3>{children}</div>;
}

export function DecisionPanel({ approval, claimId }: { approval: Approval; claimId: string }) {
  const [notes, setNotes] = useState('');
  const act = (d: Decision, label: string) => { decide(approval.id, d, notes); setNotes(''); toast(`${label} · ${claimId} updated in both views`); };
  if (approval.status !== 'pending') {
    return (
      <div className="rounded-xl border border-line bg-sunken/50 p-4">
        <div className="flex flex-wrap items-center gap-2"><span className="eyebrow">Human decision</span><Pill tone={APPROVAL_STATUS[approval.status].tone}>{APPROVAL_STATUS[approval.status].label}</Pill></div>
        <div className="mt-2 text-[13px]">{approval.decidedBy} · {fmtDateTime(approval.decidedAt)}</div>
        {approval.notes && <div className="mt-1 text-[13px] text-muted">Reviewer notes: {approval.notes}</div>}
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-info/40 bg-infosoft/40 p-4">
      <div className="flex flex-wrap items-center gap-2"><span className="eyebrow text-info">Human review required</span><span className="font-mono text-[11px] text-muted">{approval.id}</span><span className="ml-auto text-[12px] text-muted">Reviewer: {REVIEWER}</span></div>
      <label className="mt-3 block">
        <span className="text-[12px] font-medium text-muted">Reviewer notes (recorded in the audit trail)</span>
        <textarea id={`notes-${approval.id}`} rows={2} className="input mt-1" placeholder="e.g. Agree. Ask the customer for the traffic report before inspection." value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Button variant="primary" onClick={() => act('approve', 'Recommended step approved')}><CheckCircle2 size={16} /> Approve recommended next step</Button>
        <Button onClick={() => act('request_docs', 'Documents requested')}><FileQuestion size={16} /> Request missing documents</Button>
        <Button onClick={() => act('escalate', 'Escalated')}><AlertTriangle size={16} /> Escalate for review</Button>
        <Button variant="danger" onClick={() => act('reject', 'Recommendation rejected')}><Ban size={16} /> Reject recommendation</Button>
      </div>
      <p className={cx('mt-3 text-[12px] text-muted')}>Approving authorises only the operational next step above. It does not approve the claim, make a coverage decision or authorise any payment.</p>
    </div>
  );
}
