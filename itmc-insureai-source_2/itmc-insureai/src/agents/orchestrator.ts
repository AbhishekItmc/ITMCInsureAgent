// Orchestrator Agent: the coordinating agent that handles all agentic work.
// It (1) scans the shared state for work, (2) interprets operator commands, (3) builds a plan that
// dispatches the specialist agents, and (4) stops at every human checkpoint.
// Pure and deterministic here; the executor lives in store/workflows.ts.
import { INCIDENT_LABEL, PRODUCT_LABEL, RENEWAL } from '../config/rules';
import { daysBetween, money, todayISO } from '../lib/format';
import type { AgentName, DemoState, WorkItem, WorkKind } from '../types';

export const ORCHESTRATOR_GUARDRAILS = [
  'Never approves claims, makes coverage decisions or authorises payments.',
  'Never decides on a human approval: it routes reports to the Human Approval Queue.',
  'Never issues policies: converting a quote needs the customer\'s confirmation.',
  'Never sends emails, SMS or other messages: renewal communications stay as drafts.',
  'Never labels anyone fraudulent: anomaly indicators go to a human investigator.',
  'Only applies policy changes inside the low-risk auto-apply rules; never cancels a policy or adjusts premium without an underwriter.',
];

const CLAIM_AGENTS: AgentName[] = ['Document Intelligence Agent', 'Policy Intelligence Agent', 'Claims Assessment Agent', 'Fraud Investigation Assistant', 'Supervisor Agent'];

/** Find every piece of work in the demo state and decide who owns it. */
export function scanWork(s: DemoState): WorkItem[] {
  const items: WorkItem[] = [];
  const today = todayISO();
  for (const c of s.claims) {
    const running = c.investigations.some((i) => i.status === 'running');
    if ((c.status === 'registered' || c.status === 'documents_received') && !running) {
      items.push({
        kind: 'INVESTIGATE_CLAIM', targetId: c.id, actionable: true, agents: CLAIM_AGENTS, owner: 'Orchestrator Agent', priority: c.status === 'documents_received' ? 1 : 2,
        title: `${c.status === 'documents_received' ? 'Re-investigate' : 'Investigate'} claim ${c.id}`,
        reason: c.status === 'documents_received' ? 'Requested documents have arrived; findings must be refreshed.' : `New ${PRODUCT_LABEL[c.product].toLowerCase()} ${INCIDENT_LABEL[c.incidentType].toLowerCase()} claim (${money(c.estimatedDamage)}) has not been investigated.`,
      });
    }
    if (c.status === 'awaiting_review') {
      items.push({ kind: 'HUMAN_REVIEW', targetId: c.id, actionable: false, agents: [], owner: 'Claims Supervisor', priority: 9,
        title: `Reviewer decision on ${c.id}`, reason: 'Investigation report is waiting in the Human Approval Queue.' });
    }
    if (c.status === 'docs_required') {
      const req = s.documentRequests.find((r) => r.claimId === c.id && r.status === 'open');
      items.push({ kind: 'CUSTOMER_DOCS', targetId: c.id, actionable: false, agents: [], owner: 'Customer', priority: 9,
        title: `Customer documents for ${c.id}`, reason: req ? `Waiting for: ${req.documents.join(', ').replace(/_/g, ' ')}.` : 'Waiting for customer documents.' });
    }
  }
  for (const p of s.policies) {
    const d = daysBetween(today, p.expiryDate);
    if (p.status === 'active' && !(p.product === 'travel' && p.travel?.tripType === 'single') && d >= 0 && d <= RENEWAL.windowDays && !s.renewals.some((r) => r.policyId === p.id)) {
      items.push({ kind: 'PREPARE_RENEWAL', targetId: p.id, actionable: true, agents: ['Renewal Agent'], owner: 'Orchestrator Agent', priority: 3,
        title: `Prepare renewal for ${p.id}`, reason: `Policy expires in ${d} days and has no renewal draft.` });
    }
  }
  for (const q of s.quotes) {
    if (q.status !== 'quoted') continue;
    const checked = s.agentRuns.some((r) => r.agent === 'Policy Agent' && r.entityId === q.id);
    if (!checked) {
      items.push({ kind: 'REVIEW_QUOTE', targetId: q.id, actionable: true, agents: ['Policy Agent'], owner: 'Orchestrator Agent', priority: 4,
        title: `Check policy readiness for ${q.id}`, reason: 'Open quote: identify what is still needed before the customer can convert it.' });
    }
  }
  for (const r of s.serviceRequests) {
    if (r.status === 'submitted') items.push({ kind: 'PROCESS_SERVICE', targetId: r.id, actionable: true, agents: ['Policy Servicing Agent'], owner: 'Orchestrator Agent', priority: 3,
      title: `Process service request ${r.id}`, reason: `${r.type.replace('_', ' ')} on ${r.policyId} submitted via ${r.channel}.` });
    if (r.status === 'pending_approval') items.push({ kind: 'SERVICE_APPROVAL', targetId: r.id, actionable: false, agents: [], owner: r.type === 'cancellation' ? 'Servicing Officer' : 'Underwriter', priority: 9,
      title: `Approval for ${r.id}`, reason: r.assessment?.recommendation ?? 'Awaiting approval.' });
  }
  for (const req of s.documentRequests.filter((x) => x.status === 'open')) {
    if (!s.communications.some((m) => m.kind === 'doc_reminder' && m.relatedId === req.id)) items.push({ kind: 'DOC_REMINDER', targetId: req.id, actionable: true, agents: ['Customer Communications Agent'], owner: 'Orchestrator Agent', priority: 5,
      title: `Draft document reminder ${req.id}`, reason: `Customer hasn't sent the documents for ${req.claimId} yet.` });
  }
  for (const q of s.quotes.filter((x) => x.status === 'quoted')) {
    if (daysBetween(q.createdAt.slice(0, 10), today) >= 2 && !s.communications.some((m) => m.kind === 'quote_followup' && m.relatedId === q.id)) items.push({ kind: 'QUOTE_FOLLOWUP', targetId: q.id, actionable: true, agents: ['Customer Communications Agent'], owner: 'Orchestrator Agent', priority: 6,
      title: `Draft follow-up for quote ${q.id}`, reason: `Quote is ${daysBetween(q.createdAt.slice(0, 10), today)} days old and not converted.` });
  }
  return items.sort((a, b) => a.priority - b.priority || a.targetId.localeCompare(b.targetId));
}

/* ── Command interpretation (rule-based intent matching; no language model) ── */

export type Intent = 'run_all' | 'investigate' | 'renewals' | 'quotes' | 'service' | 'comms' | 'status' | 'approvals' | 'help' | 'refuse' | 'unknown';

export interface ParsedCommand {
  intent: Intent;
  kinds: WorkKind[];
  targetIds: string[];
  interpretation: string;
  refusalReason?: string;
}

const ID_RE = /\b(?:(?:CLM|POL|QTE)-\d{4}-\d{4}|SRV-\d{4}|REQ-\d{4}-\d+)\b/gi;

export const COMMAND_SUGGESTIONS = [
  'Handle all pending work',
  'Investigate new claims',
  'Investigate CLM-2026-0103',
  'Process service requests',
  'Draft customer reminders',
  'Prepare renewals',
  'Check open quotes',
  "What's waiting on people?",
  'Status',
  'Approve CLM-2026-0102',
];

export function parseCommand(raw: string): ParsedCommand {
  const text = raw.trim().toLowerCase();
  const targetIds = Array.from(new Set((raw.match(ID_RE) ?? []).map((x) => x.toUpperCase())));
  const has = (...w: string[]) => w.some((x) => text.includes(x));

  if (!text) return { intent: 'help', kinds: [], targetIds, interpretation: 'Empty command; showing what I can do.' };
  if (has('remind', 'follow up', 'follow-up', 'followup', 'chase', 'nudge')) {
    return { intent: 'comms', kinds: ['DOC_REMINDER', 'QUOTE_FOLLOWUP'], targetIds: [], interpretation: `Draft reminders and follow-ups for outstanding documents and open quotes.${has('send') ? ' I only draft them; a person approves before anything is sent.' : ''}` };
  }
  // Guardrails first: actions reserved for people.
  if (has('approve', 'authorise', 'authorize', 'reject', 'pay ', 'payment', 'settle', 'issue polic', 'bind', 'send', 'email', 'sms', 'deny', 'decline the claim', 'mark as fraud', 'fraudulent')) {
    return { intent: 'refuse', kinds: [], targetIds, interpretation: 'Request needs a human decision.',
      refusalReason: has('send', 'email', 'sms') ? 'I don\'t send messages. Renewal and customer communications stay as drafts for a person to review and send.'
        : has('issue polic', 'bind') ? 'I can\'t issue policies. The customer must confirm the conversion in the portal.'
        : has('fraud') ? 'I never label anyone as fraudulent. Anomaly indicators are routed to a human investigator.'
        : 'Approvals, rejections, coverage decisions and payments are reserved for authorised people. I route the case to the Human Approval Queue instead.' };
  }
  if (has('help', 'what can you do', 'commands')) return { intent: 'help', kinds: [], targetIds, interpretation: 'Explain available commands.' };
  if (has('approval', 'waiting on', 'waiting for', 'blocked', 'human', 'people')) return { intent: 'approvals', kinds: [], targetIds, interpretation: 'Report work waiting on people (reviewers and customers).' };
  if (has('status', 'summary', 'overview', 'pending?', "what's pending", 'what is pending', 'queue', 'backlog')) return { intent: 'status', kinds: [], targetIds, interpretation: 'Report the current work queue without acting.' };

  const srvIds = targetIds.filter((x) => x.startsWith('SRV'));
  if (has('service', 'endorse', 'change request', 'servicing', 'add driver', 'address change') || srvIds.length) {
    return { intent: 'service', kinds: ['PROCESS_SERVICE'], targetIds: srvIds, interpretation: srvIds.length ? `Process service request ${srvIds.join(', ')}.` : 'Assess every submitted policy change request; auto-apply only low-risk ones.' };
  }
  const claimIds = targetIds.filter((x) => x.startsWith('CLM'));
  const policyIds = targetIds.filter((x) => x.startsWith('POL'));
  const quoteIds = targetIds.filter((x) => x.startsWith('QTE'));
  if (has('all', 'everything', 'autopilot', 'pending work', 'whole', 'entire', 'process work', 'run work')) {
    return { intent: 'run_all', kinds: ['INVESTIGATE_CLAIM', 'PREPARE_RENEWAL', 'REVIEW_QUOTE', 'PROCESS_SERVICE', 'DOC_REMINDER', 'QUOTE_FOLLOWUP'], targetIds: [], interpretation: 'Process every actionable item in the work queue, then hand off to people.' };
  }
  if (has('investigat', 'claim', 'review claim', 'assess') || claimIds.length) {
    return { intent: 'investigate', kinds: ['INVESTIGATE_CLAIM'], targetIds: claimIds, interpretation: claimIds.length ? `Run the claims investigation for ${claimIds.join(', ')}.` : 'Investigate every claim that is new or has new documents.' };
  }
  if (has('renew') || policyIds.length) {
    return { intent: 'renewals', kinds: ['PREPARE_RENEWAL'], targetIds: policyIds, interpretation: policyIds.length ? `Prepare renewal drafts for ${policyIds.join(', ')}.` : 'Prepare renewal drafts for policies expiring within 60 days.' };
  }
  if (has('quote', 'conversion', 'convert') || quoteIds.length) {
    return { intent: 'quotes', kinds: ['REVIEW_QUOTE'], targetIds: quoteIds, interpretation: quoteIds.length ? `Check policy readiness for ${quoteIds.join(', ')}.` : 'Check what each open quote still needs before conversion.' };
  }
  return { intent: 'unknown', kinds: [], targetIds, interpretation: 'Command not recognised.' };
}

/** Select the work items a parsed command applies to. Explicit IDs may target items the queue would skip. */
export function selectWork(s: DemoState, cmd: ParsedCommand): { selected: WorkItem[]; notes: string[] } {
  const queue = scanWork(s);
  const notes: string[] = [];
  if (!cmd.targetIds.length) return { selected: queue.filter((w) => w.actionable && cmd.kinds.includes(w.kind)), notes };
  const selected: WorkItem[] = [];
  for (const id of cmd.targetIds) {
    const q = queue.find((w) => w.targetId === id && w.actionable && cmd.kinds.includes(w.kind));
    if (q) { selected.push(q); continue; }
    if (id.startsWith('CLM')) {
      const c = s.claims.find((x) => x.id === id);
      if (!c) notes.push(`${id} does not exist.`);
      else if (c.status === 'awaiting_review') notes.push(`${id} already has a report waiting for a reviewer; I won't re-run it until a person decides.`);
      else if (c.status === 'assessment_completed') notes.push(`${id} is assessment-complete; nothing for me to do.`);
      else if (c.investigations.some((i) => i.status === 'running')) notes.push(`${id} is already being investigated.`);
      else selected.push({ kind: 'INVESTIGATE_CLAIM', targetId: id, title: `Investigate claim ${id}`, reason: 'Requested by operator.', actionable: true, agents: CLAIM_AGENTS, owner: 'Orchestrator Agent', priority: 2 });
    } else if (id.startsWith('POL')) {
      if (!s.policies.some((p) => p.id === id)) notes.push(`${id} does not exist.`);
      else selected.push({ kind: 'PREPARE_RENEWAL', targetId: id, title: `Prepare renewal for ${id}`, reason: 'Requested by operator.', actionable: true, agents: ['Renewal Agent'], owner: 'Orchestrator Agent', priority: 3 });
    } else if (id.startsWith('SRV')) {
      const r = s.serviceRequests.find((x) => x.id === id);
      if (!r) notes.push(`${id} does not exist.`);
      else notes.push(`${id} is ${r.status.replace('_', ' ')}; nothing for me to process.`);
    } else if (id.startsWith('QTE')) {
      const q2 = s.quotes.find((x) => x.id === id);
      if (!q2) notes.push(`${id} does not exist.`);
      else if (q2.status === 'converted') notes.push(`${id} is already converted to ${q2.policyId}.`);
      else selected.push({ kind: 'REVIEW_QUOTE', targetId: id, title: `Check policy readiness for ${id}`, reason: 'Requested by operator.', actionable: true, agents: ['Policy Agent'], owner: 'Orchestrator Agent', priority: 4 });
    }
  }
  return { selected, notes };
}

export function describeQueue(s: DemoState): string[] {
  const q = scanWork(s);
  const n = (k: WorkKind) => q.filter((w) => w.kind === k);
  const lines = [
    `${n('INVESTIGATE_CLAIM').length} claim(s) ready for investigation${n('INVESTIGATE_CLAIM').length ? `: ${n('INVESTIGATE_CLAIM').map((w) => w.targetId).join(', ')}` : ''}.`,
    `${n('PREPARE_RENEWAL').length} renewal(s) to prepare${n('PREPARE_RENEWAL').length ? `: ${n('PREPARE_RENEWAL').map((w) => w.targetId).join(', ')}` : ''}.`,
    `${n('REVIEW_QUOTE').length} open quote(s) to check${n('REVIEW_QUOTE').length ? `: ${n('REVIEW_QUOTE').map((w) => w.targetId).join(', ')}` : ''}.`,
    `${n('PROCESS_SERVICE').length} policy change request(s) to process${n('PROCESS_SERVICE').length ? `: ${n('PROCESS_SERVICE').map((w) => w.targetId).join(', ')}` : ''}.`,
    `${n('DOC_REMINDER').length + n('QUOTE_FOLLOWUP').length} customer message(s) to draft.`,
    `${n('SERVICE_APPROVAL').length} change request(s) waiting for an underwriter.`,
    `${n('HUMAN_REVIEW').length} report(s) waiting for a reviewer${n('HUMAN_REVIEW').length ? `: ${n('HUMAN_REVIEW').map((w) => w.targetId).join(', ')}` : ''}.`,
    `${n('CUSTOMER_DOCS').length} claim(s) waiting for customer documents${n('CUSTOMER_DOCS').length ? `: ${n('CUSTOMER_DOCS').map((w) => w.targetId).join(', ')}` : ''}.`,
  ];
  return lines;
}

export const HELP_LINES = [
  'I coordinate every specialist agent and stop wherever a person must decide. Try:',
  '“Handle all pending work” runs investigations, renewals and quote checks in priority order.',
  '“Investigate new claims” or “Investigate CLM-2026-0103” runs the five-agent claims investigation.',
  '“Prepare renewals” drafts renewals for policies expiring within 60 days.',
  '“Check open quotes” runs the Policy Agent on quotes not yet converted.',
  '“Process service requests” assesses address, driver, vehicle and cancellation requests.',
  '“Draft customer reminders” prepares document reminders and quote follow-ups for approval.',
  '“Status” or “What\'s waiting on people?” reports without acting.',
];
