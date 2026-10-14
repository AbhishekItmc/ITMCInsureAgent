import { communicationsAgent, policyServicingAgent, SERVICE_LABEL } from '../agents/servicingAgents';
import type { Communication, ServiceRequest } from '../types';
import { describeQueue, HELP_LINES, parseCommand, scanWork, selectWork, type ParsedCommand } from '../agents/orchestrator';
import type { OrchestratorRun, OrchestratorStep } from '../types';
// Workflow orchestration. UI components call these functions; they run agents and update shared state.
// Nothing here renders UI, so the same workflows can later move behind a secure backend API.
import { policyAgent, type PolicyAgentInput } from '../agents/policyAgent';
import { quoteAgent, type QuoteAgentOutput, type QuoteRequest } from '../agents/quoteAgent';
import { renewalAgent, type RenewalAgentOutput } from '../agents/renewalAgent';
import { executePipelineStep, PIPELINE, queuedSteps, type PipelineMemory } from '../agents/claimsPipeline';
import type { ClaimContext } from '../agents/claimsAgents';
import type { AgentResult } from '../agents/runtime';
import { DOC_LABELS, INCIDENT_LABEL, PRODUCT_INCIDENTS, PRODUCT_LABEL } from '../config/rules';
import { buildSeed } from '../data/seed';
import { makeSampleDoc } from '../data/sampleDocs';
import { CITIES } from '../config/rules';
import { addDays, money, nowISO, todayISO } from '../lib/format';
import type { Claim, ClaimDocument, ClaimStatus, DemoState, DocType, IncidentType } from '../types';
import { audit, getState, logRun, nextId, replaceState, update } from './store';

export const REVIEWER = 'Aisha Karim · Claims Supervisor';

const setStatus = (c: Claim, status: ClaimStatus, by: string, note?: string) => {
  c.status = status;
  c.statusHistory.push({ status, at: nowISO(), by, note });
};

/* ───────── Quote ───────── */

export function generateQuote(req: QuoteRequest): { result: AgentResult<QuoteAgentOutput>; quoteId?: string; customerId?: string } {
  const startedAt = nowISO();
  const result = quoteAgent.run(req);
  let quoteId: string | undefined, customerId: string | undefined;
  update((d) => {
    if (!result.output.ok) {
      logRun(d, { agent: 'Quote Agent', task: quoteAgent.task(req), entityId: '—', status: 'failed', startedAt, completedAt: nowISO(), outputSummary: result.summary });
      return;
    }
    let cust = d.customers.find((c) => c.email.toLowerCase() === req.customer.email.trim().toLowerCase());
    if (!cust) {
      cust = { id: nextId(d, 'customer', 'CUS-'), name: req.customer.name.trim(), email: req.customer.email.trim(), phone: req.customer.phone.trim(), dateOfBirth: req.customer.dateOfBirth, city: CITIES.includes(req.customer.city) ? req.customer.city : 'Other', createdAt: nowISO() };
      d.customers.push(cust);
      audit(d, { actor: 'Quote Agent', actorType: 'agent', action: 'Customer record created', entityType: 'customer', entityId: cust.id, detail: cust.name });
    } else if (req.customer.phone && !cust.phone) cust.phone = req.customer.phone.trim();
    customerId = cust.id;
    quoteId = nextId(d, 'quote', `QTE-${todayISO().slice(0, 4)}-`);
    d.quotes.push({
      id: quoteId, customerId: cust.id, product: req.product, subject: result.output.subject!,
      ...result.output.details, sumInsured: result.output.sumInsured,
      coverage: req.coverage, deductible: req.product === 'motor' || req.product === 'home' ? req.deductible : 0, addOns: req.product === 'motor' ? req.addOns : [],
      premium: result.output.premium!, assumptions: result.output.assumptions, missingInfo: result.output.missingInfo,
      status: 'quoted', createdAt: nowISO(), validUntil: result.output.validUntil!,
    });
    logRun(d, { agent: 'Quote Agent', task: quoteAgent.task(req), entityId: quoteId, status: 'completed', startedAt, completedAt: nowISO(), outputSummary: result.summary });
    audit(d, { actor: 'Quote Agent', actorType: 'agent', action: 'Quote generated', entityType: 'quote', entityId: quoteId, detail: result.summary });
  });
  return { result, quoteId, customerId };
}

/* ───────── Policy ───────── */

export function reviewQuoteForPolicy(quoteId: string, supplied: PolicyAgentInput['supplied']) {
  const s = getState();
  const quote = s.quotes.find((q) => q.id === quoteId);
  const customer = s.customers.find((c) => c.id === quote?.customerId);
  const startedAt = nowISO();
  const result = policyAgent.run({ quote, customer, supplied });
  update((d) => {
    logRun(d, { agent: 'Policy Agent', task: policyAgent.task({ quote, customer, supplied }), entityId: quoteId, status: 'completed', startedAt, completedAt: nowISO(), outputSummary: result.summary });
    audit(d, { actor: 'Policy Agent', actorType: 'agent', action: 'Policy requirements checked', entityType: 'quote', entityId: quoteId, detail: result.summary });
  });
  return result;
}

export function issuePolicy(quoteId: string, supplied: PolicyAgentInput['supplied']): { ok: boolean; policyId?: string; outstanding: string[] } {
  const s = getState();
  const quote = s.quotes.find((q) => q.id === quoteId);
  const customer = s.customers.find((c) => c.id === quote?.customerId);
  const result = policyAgent.run({ quote, customer, supplied });
  if (!result.output.ready || !quote || !result.output.summary) return { ok: false, outstanding: result.output.outstanding };
  let policyId = '';
  update((d) => {
    const q = d.quotes.find((x) => x.id === quoteId)!;
    const c = d.customers.find((x) => x.id === q.customerId)!;
    if (supplied.address) c.address = supplied.address.trim();
    if (q.vehicle) { q.vehicle.plate = supplied.plate.trim() || q.vehicle.plate; q.vehicle.vin = supplied.vin.trim() || q.vehicle.vin; }
    if (q.travel && supplied.passport) q.travel.passportNo = supplied.passport.trim().toUpperCase();
    if (q.medical && supplied.declaration) q.medical.declarationConfirmed = true;
    q.missingInfo = q.missingInfo.filter((m) => !/plate|vin|passport|declaration/i.test(m));
    policyId = nextId(d, 'policy', `POL-${todayISO().slice(0, 4)}-`);
    const sum = result.output.summary!;
    d.policies.push({
      id: policyId, quoteId: q.id, customerId: q.customerId, product: q.product, subject: q.subject,
      vehicle: q.vehicle ? { ...q.vehicle } : undefined, travel: q.travel, medical: q.medical, home: q.home, coverage: q.coverage,
      sumInsured: sum.sumInsured, deductible: q.deductible, addOns: q.addOns, annualPremium: q.premium.total,
      effectiveDate: sum.effectiveDate, expiryDate: sum.expiryDate, status: 'active', createdAt: nowISO(), isDemo: true,
    });
    q.status = 'converted';
    q.policyId = policyId;
    audit(d, { actor: c.name, actorType: 'customer', action: 'Confirmed demo policy creation', entityType: 'quote', entityId: q.id, detail: 'Customer confirmed this is a demo record, not a real insurance contract.' });
    logRun(d, { agent: 'Policy Agent', task: `Create demo policy from ${q.id}`, entityId: policyId, status: 'completed', startedAt: nowISO(), completedAt: nowISO(), outputSummary: `Issued ${policyId} · ${sum.coverage}` });
    audit(d, { actor: 'Policy Agent', actorType: 'agent', action: 'Demo policy created', entityType: 'policy', entityId: policyId, detail: `${sum.coverage} · ${sum.effectiveDate} → ${sum.expiryDate} · ${money(q.premium.total)}` });
  });
  return { ok: true, policyId, outstanding: [] };
}

/* ───────── Claim registration ───────── */

export interface ClaimInput {
  policyId: string;
  incidentType: IncidentType;
  incidentDate: string;
  location: string;
  description: string;
  vehiclePlate?: string;
  estimatedDamage: string;
  garage: string;
  documents: ClaimDocument[];
}

export function validateClaim(i: ClaimInput) {
  const errors: Record<string, string> = {};
  const s = getState();
  const p = s.policies.find((x) => x.id === i.policyId);
  if (!p) errors.policyId = 'Select a policy.';
  if (!i.incidentDate) errors.incidentDate = 'Incident date is required.';
  else if (i.incidentDate > todayISO()) errors.incidentDate = 'Incident date cannot be in the future.';
  else if (p && (i.incidentDate < p.effectiveDate)) errors.incidentDate = `Policy starts ${p.effectiveDate}. The Policy Intelligence Agent will flag this, but registration needs a date within the term.`;
  if (!i.location.trim()) errors.location = 'Location is required.';
  if (i.description.trim().length < 20) errors.description = 'Describe what happened (at least 20 characters).';
  if (p?.product === 'motor' && !(i.vehiclePlate ?? '').trim()) errors.vehiclePlate = 'Plate number is required.';
  if (p && !PRODUCT_INCIDENTS[p.product].includes(i.incidentType)) errors.incidentType = 'Choose an incident type for this policy.';
  const amt = Number(i.estimatedDamage);
  if (!i.estimatedDamage || !Number.isFinite(amt) || amt <= 0) errors.estimatedDamage = 'Enter the estimated damage amount.';
  if (!i.garage.trim()) errors.garage = 'Name the provider or repairer (or “Not yet chosen”).';
  return errors;
}

export function registerClaim(i: ClaimInput): { ok: boolean; claimId?: string; errors: Record<string, string> } {
  const errors = validateClaim(i);
  if (Object.keys(errors).length) return { ok: false, errors };
  let claimId = '';
  update((d) => {
    const p = d.policies.find((x) => x.id === i.policyId)!;
    const c = d.customers.find((x) => x.id === p.customerId)!;
    claimId = `CLM-${todayISO().slice(0, 4)}-${String(++d.counters.claim).padStart(4, '0')}`;
    const at = nowISO();
    d.claims.push({
      id: claimId, policyId: p.id, customerId: c.id, incidentType: i.incidentType, incidentDate: i.incidentDate, reportedDate: todayISO(),
      location: i.location.trim(), description: i.description.trim(), product: p.product, vehiclePlate: p.product === 'motor' ? (i.vehiclePlate ?? '').trim() : undefined, estimatedDamage: Number(i.estimatedDamage),
      garage: i.garage.trim(), documents: i.documents.map((doc) => ({ ...doc, uploadedAt: at, fileName: doc.fileName.replace('NEWCLAIM', claimId.replace(/-/g, '')), fields: Object.fromEntries(Object.entries(doc.fields).map(([k, v]) => [k, typeof v === 'string' ? v.replace('NEWCLAIM'.slice(-6), claimId.replace(/-/g, '').slice(-6)) : v])) })), status: 'registered',
      statusHistory: [{ status: 'registered', at, by: c.name, note: 'Claim submitted via customer portal' }], investigations: [], createdAt: at,
    });
    audit(d, { actor: c.name, actorType: 'customer', action: 'Claim registered', entityType: 'claim', entityId: claimId, detail: `${PRODUCT_LABEL[p.product]} · ${INCIDENT_LABEL[i.incidentType]} on ${i.incidentDate} · ${money(Number(i.estimatedDamage))} · ${i.documents.length} document(s)` });
  });
  return { ok: true, claimId, errors: {} };
}

/* ───────── Agentic investigation (hero workflow) ───────── */

const running = new Set<string>();
export const isInvestigationRunning = (claimId: string) => running.has(claimId);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const STEP_DELAY_MS = { value: 1100 };

/** `pace` scales the visual step delay (the Orchestrator runs batches faster than a single hands-on run). */
export async function runInvestigation(claimId: string, pace = 1): Promise<{ ok: boolean; error?: string }> {
  if (running.has(claimId)) return { ok: false, error: 'An investigation is already running for this claim.' };
  const s0 = getState();
  const claim0 = s0.claims.find((c) => c.id === claimId);
  if (!claim0) return { ok: false, error: 'Claim not found.' };
  if (claim0.status === 'awaiting_review') return { ok: false, error: 'This claim is waiting for a human decision on the current report.' };
  running.add(claimId);
  let runId = '';
  try {
    const buildCtx = (): ClaimContext => {
      const s = getState();
      const claim = s.claims.find((c) => c.id === claimId)!;
      return { claim, policy: s.policies.find((p) => p.id === claim.policyId), customer: s.customers.find((c) => c.id === claim.customerId), allClaims: s.claims };
    };
    // 1. Task received
    update((d) => {
      const c = d.claims.find((x) => x.id === claimId)!;
      runId = nextId(d, 'investigation', `INV-${claimId.slice(-4)}-`, 2);
      const ctx = { claim: c, policy: d.policies.find((p) => p.id === c.policyId), customer: d.customers.find((x) => x.id === c.customerId), allClaims: d.claims };
      c.investigations.push({ runId, status: 'running', startedAt: nowISO(), engine: 'simulated', steps: queuedSteps(ctx) });
      setStatus(c, 'under_investigation', 'Supervisor Agent', 'Agentic investigation started');
      audit(d, { actor: 'Claims Operations', actorType: 'human', action: 'Investigation started', entityType: 'claim', entityId: claimId, detail: `Run ${runId} · ${PIPELINE.length} simulated agents` });
    });
    await sleep(STEP_DELAY_MS.value * pace * 0.5);

    let mem: PipelineMemory = {};
    for (let i = 0; i < PIPELINE.length; i++) {
      const startedAt = nowISO();
      let runRef = '';
      update((d) => {
        const inv = d.claims.find((x) => x.id === claimId)!.investigations.find((x) => x.runId === runId)!;
        inv.steps[i].status = 'running';
        inv.steps[i].startedAt = startedAt;
        runRef = logRun(d, { agent: inv.steps[i].agent, task: inv.steps[i].task, entityId: claimId, status: 'running', startedAt });
      });
      await sleep(STEP_DELAY_MS.value * pace);
      const { result, mem: m } = executePipelineStep(i, buildCtx(), mem);
      mem = m;
      update((d) => {
        const c = d.claims.find((x) => x.id === claimId)!;
        const inv = c.investigations.find((x) => x.runId === runId)!;
        const st = inv.steps[i];
        Object.assign(st, { status: 'completed', completedAt: nowISO(), outputSummary: result.summary, findings: result.findings, trace: result.trace, output: result.output });
        const r = d.agentRuns.find((x) => x.id === runRef);
        if (r) Object.assign(r, { status: 'completed', completedAt: nowISO(), outputSummary: result.summary });
        audit(d, { actor: st.agent, actorType: 'agent', action: 'Agent step completed', entityType: 'claim', entityId: claimId, detail: result.summary });
        if (i === PIPELINE.length - 1 && mem.report) {
          inv.report = mem.report;
          inv.status = 'completed';
          inv.completedAt = nowISO();
          d.approvals.filter((a) => a.claimId === claimId && a.status === 'pending').forEach((a) => { a.status = 'rejected'; a.notes = 'Superseded by a newer investigation run.'; });
          const apprId = nextId(d, 'approval', `APR-${claimId.slice(-4)}-`, 2);
          d.approvals.push({ id: apprId, claimId, investigationRunId: runId, recommendation: mem.report.recommendation, status: 'pending', createdAt: nowISO() });
          setStatus(c, 'awaiting_review', 'Supervisor Agent', `Recommended: ${mem.report.recommendation.label}`);
          audit(d, { actor: 'Supervisor Agent', actorType: 'agent', action: 'Routed to human review', entityType: 'approval', entityId: apprId, detail: mem.report.recommendation.label });
        }
      });
      await sleep(STEP_DELAY_MS.value * pace * 0.25);
    }
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    update((d) => {
      const c = d.claims.find((x) => x.id === claimId);
      const inv = c?.investigations.find((x) => x.runId === runId);
      if (c && inv) {
        inv.status = 'interrupted';
        inv.steps.forEach((st) => { if (st.status !== 'completed') st.status = 'failed'; });
        setStatus(c, 'registered', 'System', `Investigation failed: ${msg}`);
      }
      audit(d, { actor: 'System', actorType: 'system', action: 'Investigation failed', entityType: 'claim', entityId: claimId, detail: msg });
    });
    return { ok: false, error: msg };
  } finally {
    running.delete(claimId);
  }
}

/* ───────── Human approval ───────── */

export type Decision = 'approve' | 'request_docs' | 'escalate' | 'reject';

export function decide(approvalId: string, decision: Decision, notes: string, reviewer = REVIEWER) {
  update((d) => {
    const a = d.approvals.find((x) => x.id === approvalId);
    if (!a || a.status !== 'pending') return;
    const c = d.claims.find((x) => x.id === a.claimId)!;
    const inv = c.investigations.find((x) => x.runId === a.investigationRunId);
    const missing: DocType[] = inv?.report?.missingDocuments ?? [];
    a.decidedAt = nowISO();
    a.decidedBy = reviewer;
    a.notes = notes.trim() || undefined;
    const openRequest = (docs: DocType[]) => {
      const list = docs.length ? docs : (['claim_form'] as DocType[]);
      d.documentRequests.filter((r) => r.claimId === c.id && r.status === 'open').forEach((r) => { r.status = 'fulfilled'; r.fulfilledAt = nowISO(); });
      d.documentRequests.push({ id: nextId(d, 'request', `REQ-${c.id.slice(-4)}-`, 2), claimId: c.id, documents: list, status: 'open', requestedAt: nowISO(),
        message: `Please upload: ${list.map((x) => DOC_LABELS[x].toLowerCase()).join(', ')}.${notes.trim() ? ` Note from reviewer: ${notes.trim()}` : ''}` });
      setStatus(c, 'docs_required', reviewer, `Requested: ${list.map((x) => DOC_LABELS[x]).join(', ')}`);
    };

    if (decision === 'approve') {
      a.status = 'approved';
      audit(d, { actor: reviewer, actorType: 'human', action: 'Approved recommended next step', entityType: 'approval', entityId: a.id, detail: `${a.recommendation.label}${notes ? ` · Notes: ${notes}` : ''}` });
      if (a.recommendation.code === 'REQUEST_DOCUMENTS') {
        openRequest(missing);
        audit(d, { actor: 'System', actorType: 'system', action: 'Document request opened', entityType: 'claim', entityId: c.id, detail: 'Customer portal updated with requested documents (no message sent)' });
      } else {
        setStatus(c, 'assessment_completed', reviewer, `Investigation assessment complete; next step "${a.recommendation.label}" assigned to ${a.recommendation.nextOwner}. No coverage, settlement or payment decision has been made.`);
        audit(d, { actor: 'System', actorType: 'system', action: 'Operational step assigned', entityType: 'claim', entityId: c.id, detail: `${a.recommendation.nextOwner}: ${a.recommendation.label}` });
      }
    } else if (decision === 'request_docs') {
      a.status = 'docs_requested';
      audit(d, { actor: reviewer, actorType: 'human', action: 'Requested missing documents', entityType: 'approval', entityId: a.id, detail: `${missing.length ? missing.map((m) => DOC_LABELS[m]).join(', ') : 'Supplementary documents'}${notes ? ` · Notes: ${notes}` : ''}` });
      openRequest(missing);
    } else if (decision === 'escalate') {
      a.status = 'escalated';
      setStatus(c, 'escalated', reviewer, `Escalated for senior review${notes ? `: ${notes}` : ''}`);
      audit(d, { actor: reviewer, actorType: 'human', action: 'Escalated for review', entityType: 'approval', entityId: a.id, detail: notes || 'Escalated to senior claims review' });
    } else {
      a.status = 'rejected';
      setStatus(c, 'manual_assessment', reviewer, `AI recommendation rejected; claim returned for manual assessment${notes ? `: ${notes}` : ''}`);
      audit(d, { actor: reviewer, actorType: 'human', action: 'Rejected recommendation', entityType: 'approval', entityId: a.id, detail: notes || 'Recommendation rejected; manual handling' });
    }
  });
}

/* ───────── Customer document upload ───────── */

export function uploadRequestedDocument(claimId: string, type: DocType, file?: { name: string; sizeKb: number }) {
  update((d) => {
    const c = d.claims.find((x) => x.id === claimId);
    if (!c) return;
    const cust = d.customers.find((x) => x.id === c.customerId)!;
    const doc = makeSampleDoc(type, { claimRef: c.id, incidentDate: c.incidentDate, reportedDate: c.reportedDate, plate: c.vehiclePlate, holder: cust.name, estimatedDamage: c.estimatedDamage, garage: c.garage, description: c.description, uploadedAt: nowISO() });
    if (file) { doc.fileName = file.name; doc.sizeKb = file.sizeKb; doc.source = 'upload'; }
    c.documents = c.documents.filter((x) => x.type !== type);
    c.documents.push(doc);
    audit(d, { actor: cust.name, actorType: 'customer', action: 'Document uploaded', entityType: 'claim', entityId: c.id, detail: `${DOC_LABELS[type]} · ${doc.fileName}${file ? ' (metadata only; file not processed)' : ' (sample)'}` });
    const req = d.documentRequests.find((r) => r.claimId === c.id && r.status === 'open');
    if (req && req.documents.every((t) => c.documents.some((x) => x.type === t))) {
      req.status = 'fulfilled';
      req.fulfilledAt = nowISO();
      setStatus(c, 'documents_received', cust.name, 'All requested documents received. Ready for re-investigation.');
      audit(d, { actor: 'System', actorType: 'system', action: 'Document request fulfilled', entityType: 'claim', entityId: c.id, detail: req.id });
    }
  });
}

/* ───────── Renewal ───────── */

export function prepareRenewal(policyId: string, supplied: { mileage: string; addressConfirmed: boolean; driverChanges: string }): { result: AgentResult<RenewalAgentOutput>; renewalId?: string } {
  const s = getState();
  const policy = s.policies.find((p) => p.id === policyId);
  const customer = s.customers.find((c) => c.id === policy?.customerId);
  const startedAt = nowISO();
  const result = renewalAgent.run({ policy, customer, claims: s.claims, supplied });
  let renewalId: string | undefined;
  if (!result.output.ok || !result.output.estimate) return { result };
  update((d) => {
    const existing = d.renewals.find((r) => r.policyId === policyId);
    let taskId = existing?.followUpTaskId;
    const task = taskId ? d.tasks.find((t) => t.id === taskId) : undefined;
    if (task) Object.assign(task, { title: result.output.followUp.title, dueDate: result.output.followUp.dueDate, owner: result.output.followUp.owner });
    else {
      taskId = nextId(d, 'task', 'TSK-');
      d.tasks.push({ id: taskId, title: result.output.followUp.title, owner: result.output.followUp.owner, dueDate: result.output.followUp.dueDate, status: 'open', relatedId: policyId });
      audit(d, { actor: 'Renewal Agent', actorType: 'agent', action: 'Follow-up task created', entityType: 'task', entityId: taskId, detail: `${result.output.followUp.title} · due ${result.output.followUp.dueDate}` });
    }
    const rec = {
      policyId, status: 'draft' as const, currentPremium: result.output.currentPremium, estimate: result.output.estimate!,
      coverageSummary: result.output.coverageSummary, missingInfo: result.output.missingInfo, communicationDraft: result.output.communicationDraft,
      followUpTaskId: taskId!, createdAt: nowISO(),
    };
    if (existing) { Object.assign(existing, rec); renewalId = existing.id; }
    else { renewalId = nextId(d, 'renewal', 'RNW-'); d.renewals.push({ id: renewalId, ...rec }); }
    logRun(d, { agent: 'Renewal Agent', task: `Prepare renewal for ${policyId}`, entityId: renewalId!, status: 'completed', startedAt, completedAt: nowISO(), outputSummary: result.summary });
    audit(d, { actor: 'Renewal Agent', actorType: 'agent', action: 'Renewal estimate drafted', entityType: 'renewal', entityId: renewalId!, detail: result.summary });
  });
  return { result, renewalId };
}

export function saveRenewalDraft(renewalId: string, draftText: string, actor: string) {
  update((d) => {
    const r = d.renewals.find((x) => x.id === renewalId);
    if (!r) return;
    r.communicationDraft = draftText;
    r.status = 'saved';
    r.savedAt = nowISO();
    audit(d, { actor, actorType: 'human', action: 'Renewal draft saved', entityType: 'renewal', entityId: r.id, detail: `Draft for ${r.policyId} saved for review. Not sent; no payment processed.` });
  });
}

export function completeTask(taskId: string, actor: string) {
  update((d) => {
    const t = d.tasks.find((x) => x.id === taskId);
    if (!t || t.status === 'done') return;
    t.status = 'done';
    audit(d, { actor, actorType: 'human', action: 'Task completed', entityType: 'task', entityId: t.id, detail: t.title });
  });
}

/* ───────── Reset ───────── */

export function resetDemo() {
  running.clear();
  orchestrating = false;
  const fresh: DemoState = buildSeed();
  fresh.audit.push({ id: `AUD-${String(++fresh.counters.audit).padStart(5, '0')}`, at: nowISO(), actor: 'Demo Presenter', actorType: 'human', action: 'Demo reset', entityType: 'system', entityId: 'DEMO', detail: 'Original synthetic dataset restored' });
  replaceState(fresh);
}

export const renewalWindowEnd = () => addDays(todayISO(), 60);

/* ───────── Orchestrator Agent ───────── */


let orchestrating = false;
export const isOrchestratorRunning = () => orchestrating;

const ORCH = 'Orchestrator Agent';

function patchRun(runId: string, fn: (r: OrchestratorRun, d: DemoState) => void) {
  update((d) => { const r = d.orchestratorRuns.find((x) => x.id === runId); if (r) fn(r, d); });
}

/** Entry point for both the autopilot button and the command bar. */
export async function runOrchestrator(opts: { trigger: 'autopilot' | 'command'; command?: string }): Promise<{ ok: boolean; runId?: string; error?: string }> {
  if (orchestrating) return { ok: false, error: 'The Orchestrator Agent is already running. Wait for the current plan to finish.' };
  const cmd: ParsedCommand = opts.trigger === 'autopilot' || !opts.command
    ? { intent: 'run_all', kinds: ['INVESTIGATE_CLAIM', 'PREPARE_RENEWAL', 'REVIEW_QUOTE', 'PROCESS_SERVICE', 'DOC_REMINDER', 'QUOTE_FOLLOWUP'], targetIds: [], interpretation: 'Autopilot: process every actionable item in the work queue, then hand off to people.' }
    : parseCommand(opts.command);
  orchestrating = true;
  let runId = '';
  let agentRunId = '';
  const startedAt = nowISO();
  try {
    // 1. Plan
    update((d) => {
      runId = nextId(d, 'orchestrator', 'ORC-');
      const trace = [opts.command ? `Received command: “${opts.command}”.` : 'Autopilot triggered by operator.', `Interpreted intent: ${cmd.intent}. ${cmd.interpretation}`];
      const run: OrchestratorRun = { id: runId, trigger: opts.trigger, command: opts.command, intent: cmd.intent, interpretation: cmd.interpretation, response: [], status: 'running', steps: [], handoffs: [], trace, startedAt };
      if (cmd.intent === 'help') { run.response = HELP_LINES; run.status = 'completed'; }
      else if (cmd.intent === 'unknown') { run.response = ['I didn\'t recognise that instruction.', ...HELP_LINES.slice(1)]; run.status = 'completed'; }
      else if (cmd.intent === 'refuse') { run.response = [cmd.refusalReason!]; run.status = 'refused'; trace.push('Guardrail applied: action reserved for an authorised person.'); }
      else if (cmd.intent === 'status') { run.response = describeQueue(d); run.status = 'completed'; trace.push('Scanned the work queue (read-only).'); }
      else if (cmd.intent === 'approvals') {
        const q = scanWork(d).filter((w) => !w.actionable);
        run.response = q.length ? q.map((w) => `${w.targetId} · ${w.owner}: ${w.reason}`) : ['Nothing is waiting on people right now.'];
        run.handoffs = q.map((w) => ({ targetId: w.targetId, owner: w.owner, note: w.reason }));
        run.status = 'completed';
        trace.push('Listed items blocked on human or customer action (read-only).');
      } else {
        const { selected, notes } = selectWork(d, cmd);
        trace.push(`Scanned work queue: ${scanWork(d).length} item(s); ${selected.length} selected for this plan.`);
        run.steps = selected.map((w, i): OrchestratorStep => ({ id: `${runId}-S${i + 1}`, kind: w.kind, targetId: w.targetId, title: w.title, agents: w.agents, status: 'queued', result: w.reason }));
        run.response = [...notes];
        if (!selected.length) { run.response.push('There is no matching work for me to do right now.'); run.status = 'completed'; }
        else trace.push(`Built plan with ${selected.length} step(s), ordered by priority (re-investigations, new claims, renewals, quotes).`);
      }
      if (run.status !== 'running') run.completedAt = nowISO();
      d.orchestratorRuns.push(run);
      agentRunId = logRun(d, { agent: ORCH, task: opts.command ? `Command: ${opts.command}` : 'Autopilot: process work queue', entityId: runId, status: run.status === 'running' ? 'running' : 'completed', startedAt, completedAt: run.completedAt, outputSummary: run.status === 'running' ? undefined : run.response[0] });
      audit(d, { actor: ORCH, actorType: 'agent', action: run.status === 'refused' ? 'Request declined by guardrail' : 'Plan created', entityType: 'system', entityId: runId, detail: `${cmd.interpretation}${run.steps.length ? ` · ${run.steps.length} step(s)` : ''}` });
    });

    const run0 = getState().orchestratorRuns.find((r) => r.id === runId)!;
    if (run0.status !== 'running') return { ok: true, runId };
    await sleep(500);

    // 2. Execute each step by dispatching the specialist agents
    for (const step of run0.steps) {
      patchRun(runId, (r) => { const st = r.steps.find((x) => x.id === step.id)!; st.status = 'running'; st.startedAt = nowISO(); r.trace.push(`Dispatching ${step.agents.length > 1 ? `${step.agents.length} agents` : step.agents[0]} for ${step.targetId}.`); });
      let result = '';
      let ok = true;
      try {
        if (step.kind === 'INVESTIGATE_CLAIM') {
          const r = await runInvestigation(step.targetId, run0.steps.filter((x) => x.kind === 'INVESTIGATE_CLAIM').length > 1 ? 0.45 : 1);
          if (!r.ok) { ok = false; result = r.error ?? 'Investigation failed.'; }
          else {
            const c = getState().claims.find((x) => x.id === step.targetId)!;
            const rep = c.investigations[c.investigations.length - 1]?.report;
            result = rep ? `Report ready · recommends “${rep.recommendation.label}” · confidence ${rep.confidence}. Routed to Human Approval Queue.` : 'Investigation completed.';
          }
        } else if (step.kind === 'PREPARE_RENEWAL') {
          await sleep(700);
          const r = prepareRenewal(step.targetId, { mileage: '', addressConfirmed: false, driverChanges: '' });
          ok = !!r.renewalId;
          result = ok ? `${r.renewalId} drafted · ${r.result.summary} Draft not sent; follow-up task created.` : r.result.summary;
        } else if (step.kind === 'PROCESS_SERVICE') {
          await sleep(700);
          const r = processServiceRequest(step.targetId);
          ok = r.ok; result = r.summary;
        } else if (step.kind === 'DOC_REMINDER' || step.kind === 'QUOTE_FOLLOWUP') {
          await sleep(500);
          const r = draftCommunication(step.kind === 'DOC_REMINDER' ? 'doc_reminder' : 'quote_followup', step.targetId);
          ok = r.ok; result = r.summary;
        } else if (step.kind === 'REVIEW_QUOTE') {
          await sleep(600);
          const s = getState();
          const q = s.quotes.find((x) => x.id === step.targetId);
          const c = s.customers.find((x) => x.id === q?.customerId);
          const r = reviewQuoteForPolicy(step.targetId, { plate: q?.vehicle?.plate ?? '', vin: q?.vehicle?.vin ?? '', address: c?.address ?? '' });
          result = r.output.outstanding.length ? `Outstanding before conversion: ${r.output.outstanding.join(', ')}. Customer must supply these and confirm.` : 'Ready to convert. Waiting for the customer to confirm in the portal.';
        }
      } catch (e) { ok = false; result = e instanceof Error ? e.message : String(e); }
      patchRun(runId, (r, d) => {
        const st = r.steps.find((x) => x.id === step.id)!;
        st.status = ok ? 'completed' : 'failed'; st.completedAt = nowISO(); st.result = result;
        r.trace.push(`${step.targetId}: ${ok ? 'done' : 'failed'}.`);
        audit(d, { actor: ORCH, actorType: 'agent', action: ok ? 'Plan step completed' : 'Plan step failed', entityType: step.targetId.startsWith('CLM') ? 'claim' : step.targetId.startsWith('POL') ? 'policy' : 'quote', entityId: step.targetId, detail: result });
      });
      await sleep(250);
    }

    // 3. Hand off to people and summarise
    patchRun(runId, (r, d) => {
      const waiting = scanWork(d).filter((w) => !w.actionable);
      const handoffs = waiting.map((w) => ({ targetId: w.targetId, owner: w.owner, note: w.reason }));
      for (const st of r.steps) {
        if (st.kind === 'PREPARE_RENEWAL' && st.status === 'completed') handoffs.push({ targetId: st.targetId, owner: 'Renewals Desk', note: 'Review and save the renewal draft; confirm missing details with the customer.' });
        if (st.kind === 'REVIEW_QUOTE' && st.status === 'completed') handoffs.push({ targetId: st.targetId, owner: 'Customer', note: st.result ?? '' });
        if ((st.kind === 'DOC_REMINDER' || st.kind === 'QUOTE_FOLLOWUP') && st.status === 'completed') handoffs.push({ targetId: st.targetId, owner: 'Customer Care', note: 'Approve the drafted message in Service & Communications (not sent automatically).' });
      }
      r.handoffs = handoffs;
      const done = r.steps.filter((x) => x.status === 'completed').length;
      const failed = r.steps.filter((x) => x.status === 'failed').length;
      r.summary = `Completed ${done} of ${r.steps.length} step(s)${failed ? `, ${failed} failed` : ''}. ${handoffs.length} item(s) handed to people.`;
      r.response.push(r.summary);
      r.status = 'completed';
      r.completedAt = nowISO();
      r.trace.push('Consolidated results and handed off items that need human decisions.');
      const ar = d.agentRuns.find((x) => x.id === agentRunId);
      if (ar) Object.assign(ar, { status: 'completed', completedAt: nowISO(), outputSummary: r.summary });
      audit(d, { actor: ORCH, actorType: 'agent', action: 'Plan completed', entityType: 'system', entityId: r.id, detail: r.summary });
    });
    return { ok: true, runId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (runId) patchRun(runId, (r, d) => { r.status = 'failed'; r.completedAt = nowISO(); r.response.push(`Stopped: ${msg}`); audit(d, { actor: ORCH, actorType: 'agent', action: 'Plan failed', entityType: 'system', entityId: r.id, detail: msg }); });
    return { ok: false, runId, error: msg };
  } finally {
    orchestrating = false;
  }
}

/* ───────── Chatbot Agent ───────── */

export function recordChatTurn(area: 'portal' | 'ops', viewerId: string, message: string, intent: string, summary: string) {
  update((d) => {
    const who = area === 'portal' ? d.customers.find((c) => c.id === viewerId)?.name ?? 'Customer' : 'Operations staff';
    logRun(d, { agent: 'Chatbot Agent', task: `${who}: “${message.slice(0, 80)}”`, entityId: area === 'portal' ? viewerId : '—', status: 'completed', startedAt: nowISO(), completedAt: nowISO(), outputSummary: `${intent} · ${summary.slice(0, 140)}` });
  });
}

export function requestCallback(customerId: string, topic: string): string {
  let taskId = '';
  update((d) => {
    const c = d.customers.find((x) => x.id === customerId);
    taskId = nextId(d, 'task', 'TSK-');
    d.tasks.push({ id: taskId, title: `Call back ${c?.name ?? 'customer'} (${c?.phone ?? 'no phone on file'}): ${topic}`, owner: 'Customer Care', dueDate: addDays(todayISO(), 1), status: 'open', relatedId: customerId });
    audit(d, { actor: 'Chatbot Agent', actorType: 'agent', action: 'Call-back requested', entityType: 'task', entityId: taskId, detail: `${c?.name ?? customerId} asked for a person: “${topic}”` });
  });
  return taskId;
}

/* ───────── Policy servicing & customer communications ───────── */


export function submitServiceRequest(policyId: string, type: ServiceRequest['type'], details: Record<string, string>, channel: ServiceRequest['channel']): { ok: boolean; id?: string; error?: string } {
  const s = getState();
  const p = s.policies.find((x) => x.id === policyId);
  if (!p) return { ok: false, error: 'Policy not found.' };
  if (p.status !== 'active') return { ok: false, error: `${policyId} is not active.` };
  if (s.serviceRequests.some((r) => r.policyId === policyId && r.type === type && (r.status === 'submitted' || r.status === 'pending_approval'))) return { ok: false, error: `There is already an open ${SERVICE_LABEL[type].toLowerCase()} request on ${policyId}.` };
  let id = '';
  update((d) => {
    id = nextId(d, 'service', 'SRV-');
    d.serviceRequests.push({ id, policyId, customerId: p.customerId, type, details, channel, status: 'submitted', createdAt: nowISO() });
    const c = d.customers.find((x) => x.id === p.customerId);
    audit(d, { actor: channel === 'chat' ? 'Chatbot Agent' : c?.name ?? 'Customer', actorType: channel === 'chat' ? 'agent' : 'customer', action: 'Service request submitted', entityType: 'policy', entityId: policyId, detail: `${id} · ${SERVICE_LABEL[type]}${channel === 'chat' ? ` on behalf of ${c?.name}` : ''}` });
  });
  return { ok: true, id };
}

function applyService(d: DemoState, r: ServiceRequest) {
  const p = d.policies.find((x) => x.id === r.policyId);
  const c = d.customers.find((x) => x.id === r.customerId);
  if (!p || !c) return;
  const delta = r.assessment?.premiumDelta ?? 0;
  if (r.type === 'address_change') c.address = r.details.newAddress;
  if (r.type === 'add_driver') { p.namedDrivers = [...(p.namedDrivers ?? []), `${r.details.driverName} (${r.details.driverAge})`]; p.annualPremium = Math.round((p.annualPremium + delta) * 100) / 100; }
  if (r.type === 'vehicle_change') {
    const [make, ...rest] = (r.details.newMakeModel || 'Vehicle').split(' ');
    if (!p.vehicle) return;
    p.vehicle = { ...p.vehicle, make, model: rest.join(' ') || '', year: Number(r.details.newYear), value: Number(r.details.newValue), plate: r.details.newPlate || p.vehicle.plate };
    p.subject = `${r.details.newYear} ${r.details.newMakeModel}`;
    if (p.coverage === 'comprehensive') p.sumInsured = Number(r.details.newValue);
    p.annualPremium = Math.round((p.annualPremium + delta) * 100) / 100;
  }
  if (r.type === 'add_member' && p.medical) { p.medical = { ...p.medical, members: [...p.medical.members, { name: r.details.memberName, age: Number(r.details.memberAge), relation: (r.details.relation as 'child') || 'child' }] }; p.subject = p.subject.replace(/\d+ member\(s\)/, `${p.medical.members.length} member(s)`); p.annualPremium = Math.round((p.annualPremium + delta) * 100) / 100; }
  if (r.type === 'sum_insured_change' && p.home) {
    if (r.details.newBuildingValue && p.home.buildingValue) p.home = { ...p.home, buildingValue: Number(r.details.newBuildingValue) };
    if (r.details.newContentsValue && p.home.contentsValue) p.home = { ...p.home, contentsValue: Number(r.details.newContentsValue) };
    p.sumInsured = p.home.buildingValue + p.home.contentsValue; p.annualPremium = Math.round((p.annualPremium + delta) * 100) / 100;
  }
  if (r.type === 'trip_extension' && p.travel) { p.travel = { ...p.travel, endDate: r.details.newEndDate }; p.expiryDate = r.details.newEndDate; p.annualPremium = Math.round((p.annualPremium + delta) * 100) / 100; }
  if (r.type === 'cancellation') p.status = 'cancelled';
  r.status = 'applied';
}

export function processServiceRequest(id: string): { ok: boolean; summary: string; autoApplied?: boolean } {
  const s = getState();
  const r = s.serviceRequests.find((x) => x.id === id);
  if (!r || r.status !== 'submitted') return { ok: false, summary: 'Request is not waiting for processing.' };
  const startedAt = nowISO();
  const res = policyServicingAgent.run({ request: r, policy: s.policies.find((p) => p.id === r.policyId), customer: s.customers.find((c) => c.id === r.customerId) });
  update((d) => {
    const x = d.serviceRequests.find((y) => y.id === id)!;
    x.assessment = res.output;
    x.processedAt = nowISO();
    logRun(d, { agent: 'Policy Servicing Agent', task: policyServicingAgent.task({ request: x, policy: undefined, customer: undefined }), entityId: id, status: 'completed', startedAt, completedAt: nowISO(), outputSummary: res.summary });
    if (res.output.autoApply) {
      applyService(d, x);
      x.decidedAt = nowISO(); x.decidedBy = 'Policy Servicing Agent (auto-apply rule)';
      audit(d, { actor: 'Policy Servicing Agent', actorType: 'agent', action: 'Endorsement auto-applied', entityType: 'policy', entityId: x.policyId, detail: `${x.id} · ${res.output.summary}` });
    } else {
      x.status = 'pending_approval';
      audit(d, { actor: 'Policy Servicing Agent', actorType: 'agent', action: 'Routed to human approval', entityType: 'policy', entityId: x.policyId, detail: `${x.id} · ${res.output.recommendation}` });
    }
  });
  return { ok: true, summary: `${res.summary}. ${res.output.recommendation}`, autoApplied: res.output.autoApply };
}

export function decideServiceRequest(id: string, approve: boolean, notes: string, reviewer = 'Omar Saleh · Underwriter') {
  update((d) => {
    const r = d.serviceRequests.find((x) => x.id === id);
    if (!r || r.status !== 'pending_approval') return;
    r.decidedAt = nowISO(); r.decidedBy = reviewer; r.notes = notes.trim() || undefined;
    if (approve) applyService(d, r); else r.status = 'rejected';
    audit(d, { actor: reviewer, actorType: 'human', action: approve ? 'Service request approved' : 'Service request rejected', entityType: 'policy', entityId: r.policyId, detail: `${r.id} · ${SERVICE_LABEL[r.type]}${notes ? ` · ${notes}` : ''}${approve && r.assessment?.premiumDelta ? ` · premium ${r.assessment.premiumDelta > 0 ? '+' : '−'}${money(Math.abs(r.assessment.premiumDelta))}` : ''}` });
  });
}

export function draftCommunication(kind: Communication['kind'], relatedId: string): { ok: boolean; id?: string; summary: string } {
  const s = getState();
  const request = kind === 'doc_reminder' ? s.documentRequests.find((r) => r.id === relatedId) : undefined;
  const quote = kind === 'quote_followup' ? s.quotes.find((q) => q.id === relatedId) : undefined;
  const service = kind === 'service_update' ? s.serviceRequests.find((r) => r.id === relatedId) : undefined;
  const customerId = request ? s.claims.find((c) => c.id === request.claimId)?.customerId : quote?.customerId ?? service?.customerId;
  const customer = s.customers.find((c) => c.id === customerId);
  if (!customer) return { ok: false, summary: 'Record not found.' };
  const res = communicationsAgent.run({ kind, customer, request, quote, service });
  let id = '';
  update((d) => {
    id = nextId(d, 'comm', 'MSG-');
    d.communications.push({ id, kind, customerId: customer.id, relatedId, ...res.output, status: 'draft', createdAt: nowISO() });
    logRun(d, { agent: 'Customer Communications Agent', task: communicationsAgent.task({ kind, customer }), entityId: id, status: 'completed', startedAt: nowISO(), completedAt: nowISO(), outputSummary: res.summary });
    audit(d, { actor: 'Customer Communications Agent', actorType: 'agent', action: 'Message drafted (not sent)', entityType: 'customer', entityId: customer.id, detail: `${id} · ${res.output.subject}` });
  });
  return { ok: true, id, summary: `${id} drafted for ${customer.name}: “${res.output.subject}”. Awaiting approval; not sent.` };
}

export function approveCommunication(id: string, reviewer = 'Customer Care Lead') {
  update((d) => {
    const m = d.communications.find((x) => x.id === id);
    if (!m || m.status !== 'draft') return;
    m.status = 'approved'; m.approvedBy = reviewer;
    audit(d, { actor: reviewer, actorType: 'human', action: 'Message approved', entityType: 'customer', entityId: m.customerId, detail: `${m.id} approved for sending. Demo: no message is actually sent.` });
  });
}
