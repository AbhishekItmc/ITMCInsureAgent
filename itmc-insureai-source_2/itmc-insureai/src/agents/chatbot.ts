// Chatbot Agent: conversational front door for customers (portal) and staff (operations).
// Rule-based intent matching over the live demo records; no language model. It only answers from
// data the asker is allowed to see, takes low-risk actions when the person clicks a button,
// and routes decisions (payments, approvals, cancellations) to people.
import { COVERAGE_RULES, DOC_LABELS, INCIDENT_LABEL, PRICING, PRODUCT_LABEL, REQUIRED_DOCS } from '../config/rules';
import { daysBetween, fmtDate, money, todayISO } from '../lib/format';
import { CLAIM_STATUS, metrics, renewalOpportunities } from '../lib/selectors';
import type { Area, OpsPage, PortalPage } from '../lib/nav';
import type { Claim, DemoState, DocType, IncidentType, Policy, Product } from '../types';
import { priceMotor } from './pricing';

export type ChatAction =
  | { kind: 'navigate'; label: string; area: Area; page: PortalPage | OpsPage; params?: Record<string, string> }
  | { kind: 'upload_doc'; label: string; claimId: string; docType: DocType }
  | { kind: 'callback'; label: string; topic: string }
  | { kind: 'orchestrate'; label: string; command: string }
  | { kind: 'start_flow'; label: string; flow: FlowKind; prefill?: Record<string, string>; policyId?: string }
  | { kind: 'complete_flow'; label: string; flow: FlowKind; policyId: string; data: Record<string, string> };

export interface ChatReply {
  intent: string;
  text: string[];
  facts?: { label: string; value: string }[];
  actions?: ChatAction[];
  suggestions?: string[];
  /** Action the UI should run straight away because the user's message explicitly asked for it. */
  autoRun?: ChatAction;
  /** Start a guided multi-step conversation straight away. */
  startFlow?: { flow: FlowKind; prefill?: Record<string, string>; policyId?: string };
}

/* ── Guided conversations (multi-turn) ── */

export type FlowKind = 'fnol' | 'address_change' | 'add_driver' | 'vehicle_change' | 'add_member' | 'sum_insured_change' | 'trip_extension' | 'cancellation';
type Parsed = { ok: true; value: string } | { ok: false; error: string };
export interface FlowStep { key: string; q: string; parse: (v: string) => Parsed }

const text = (min = 2, label = 'answer') => (v: string): Parsed => v.trim().length >= min ? { ok: true, value: v.trim() } : { ok: false, error: `Please give a little more detail for the ${label}.` };
const numberIn = (lo: number, hi: number, label: string) => (v: string): Parsed => {
  const n = parseAmount(v) ?? Number(v.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n >= lo && n <= hi ? { ok: true, value: String(Math.round(n)) } : { ok: false, error: `Please enter a ${label} between ${lo.toLocaleString()} and ${hi.toLocaleString()}.` };
};
const dateParse = (v: string): Parsed => {
  const t = v.trim().toLowerCase();
  const today = todayISO();
  const shift = (n: number) => { const d = new Date(today + 'T12:00:00'); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
  let iso: string | undefined;
  if (t === 'today' || t === 'now') iso = today;
  else if (t === 'yesterday') iso = shift(1);
  else if (/^(\d+)\s+days?\s+ago$/.test(t)) iso = shift(Number(t.match(/^(\d+)/)![1]));
  else if (/^\d{4}-\d{2}-\d{2}$/.test(t)) iso = t;
  else { const m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/); if (m) iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  if (!iso || Number.isNaN(new Date(iso).getTime())) return { ok: false, error: 'I couldn\'t read that date. Try “today”, “yesterday”, “3 days ago” or 2026-10-12.' };
  if (iso > today) return { ok: false, error: 'The incident date can\'t be in the future.' };
  return { ok: true, value: iso };
};
const futureDate = (v: string): Parsed => {
  const t = v.trim();
  const m = t.match(/^(\d{4}-\d{2}-\d{2})$/) ?? t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  const iso = !m ? undefined : m.length === 2 ? m[1] : `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const plus = t.match(/^(\d+)\s+(more\s+)?days?$/i);
  if (plus) return { ok: true, value: `+${plus[1]}` };
  if (!iso || Number.isNaN(new Date(iso).getTime())) return { ok: false, error: 'Please give the new return date as YYYY-MM-DD, or say e.g. “5 more days”.' };
  if (iso <= todayISO()) return { ok: false, error: 'The new return date must be in the future.' };
  return { ok: true, value: iso };
};
const relationParse = (v: string): Parsed => /^(spouse|wife|husband|child|son|daughter|baby|parent|mother|father)$/i.test(v.trim())
  ? { ok: true, value: /wife|husband|spouse/i.test(v) ? 'spouse' : /mother|father|parent/i.test(v) ? 'parent' : 'child' }
  : { ok: false, error: 'Please answer spouse, child or parent.' };
const optionalAmount = (v: string): Parsed => /^(same|unchanged|no change|skip|-)$/i.test(v.trim()) ? { ok: true, value: '' } : numberIn(10000, 20_000_000, 'value')(v);

/* ── Product awareness ── */

const word = (t: string, ...w: string[]) => w.some((x) => new RegExp(`\\b${x}`, 'i').test(t));
/** Which product a customer message is about, if it says. */
export function productHint(t: string): Product | undefined {
  if (word(t, 'trip', 'travel', 'flight', 'baggage', 'luggage', 'suitcase', 'abroad', 'holiday', 'airport', 'airline')) return 'travel';
  if (word(t, 'doctor', 'hospital', 'clinic', 'medical', 'medicine', 'pharmacy', 'prescription', 'sick', 'outpatient', 'health', 'family member', 'dental')) return 'medical';
  if (word(t, 'home', 'house', 'apartment', 'villa', 'flat\\b', 'pipe', 'leak', 'burst', 'fire', 'smoke', 'burglar', 'break-in', 'broken into', 'contents', 'kitchen', 'rebuild')) return 'home';
  if (word(t, 'car', 'vehicle', 'crash', 'collision', 'windscreen', 'windshield', 'driver', 'drive', 'plate', 'garage', 'theft', 'stolen', 'glass')) return 'motor';
  return undefined;
}
/** Most likely incident type for a product from free text. */
export function incidentFor(product: Product, t: string): IncidentType {
  switch (product) {
    case 'motor': return word(t, 'stolen', 'theft') ? 'theft' : word(t, 'glass', 'windscreen', 'windshield') ? 'glass' : word(t, 'flood', 'storm', 'hail', 'weather') ? 'weather' : 'collision';
    case 'travel': return word(t, 'baggage', 'luggage', 'suitcase', 'bag') ? 'baggage_loss' : word(t, 'delay') ? 'flight_delay' : word(t, 'cancel') ? 'trip_cancellation' : 'medical_emergency';
    case 'medical': return word(t, 'admitted', 'hospital stay', 'surgery', 'operation', 'inpatient', 'overnight') ? 'inpatient' : word(t, 'pharmacy', 'medicine', 'prescription') ? 'pharmacy' : 'outpatient';
    case 'home': return word(t, 'fire', 'smoke') ? 'fire' : word(t, 'burglar', 'break-in', 'broken into', 'stolen', 'theft') ? 'burglary' : word(t, 'water', 'pipe', 'leak', 'burst', 'flood') ? 'water_damage' : 'accidental_damage';
  }
}
const ACCIDENT_HINT: Record<Product, string> = { motor: 'If anyone is hurt, call emergency services first.', travel: 'If you need urgent medical help abroad, call local emergency services and our 24/7 assistance line first.', medical: 'If it is an emergency, go to the nearest emergency department first.', home: 'If there is any danger, make the property safe and call emergency services first.' };

export const FLOWS: Record<FlowKind, { title: string; intro: string; steps: FlowStep[] }> = {
  fnol: { title: 'Report a claim', intro: 'I\'ll register your claim right here. Five quick questions; type “cancel” at any time to stop.', steps: [
    { key: 'incidentDate', q: 'When did it happen? (today, yesterday, “3 days ago” or a date)', parse: dateParse },
    { key: 'location', q: 'Where did it happen?', parse: text(3, 'location') },
    { key: 'description', q: 'In a sentence or two, what happened?', parse: text(20, 'description (at least 20 characters)') },
    { key: 'estimatedDamage', q: 'Roughly how much are you claiming, in SAR?', parse: numberIn(100, 750000, 'amount') },
    { key: 'garage', q: 'Who is repairing or treating it? (garage, hospital, clinic, contractor, or “not yet”)', parse: text(2, 'provider') },
  ] },
  address_change: { title: 'Change of address', intro: 'Let\'s update your address.', steps: [{ key: 'newAddress', q: 'What is your new address?', parse: text(8, 'address') }] },
  add_driver: { title: 'Add a named driver', intro: 'I\'ll add a driver to your policy. Three questions.', steps: [
    { key: 'driverName', q: 'What is the driver\'s full name?', parse: text(3, 'name') },
    { key: 'driverAge', q: 'How old are they?', parse: numberIn(18, 85, 'age') },
    { key: 'licenseYears', q: 'How many years have they held a driving licence?', parse: numberIn(0, 67, 'number of years') },
  ] },
  vehicle_change: { title: 'Change of vehicle', intro: 'I\'ll prepare a vehicle change on your policy.', steps: [
    { key: 'newMakeModel', q: 'What is the new car\'s make and model?', parse: text(3, 'make and model') },
    { key: 'newYear', q: 'Which model year?', parse: numberIn(2000, Number(todayISO().slice(0, 4)) + 1, 'year') },
    { key: 'newValue', q: 'What is its market value in SAR?', parse: numberIn(15000, 750000, 'value') },
  ] },
  add_member: { title: 'Add a family member', intro: 'I\'ll add a family member to your medical cover. Three questions.', steps: [
    { key: 'memberName', q: 'What is their full name?', parse: text(3, 'name') },
    { key: 'memberAge', q: 'How old are they?', parse: numberIn(0, 99, 'age') },
    { key: 'relation', q: 'How are they related to you? (spouse, child or parent)', parse: relationParse },
  ] },
  sum_insured_change: { title: 'Change of sum insured', intro: 'I\'ll update the values insured on your home policy.', steps: [
    { key: 'newBuildingValue', q: 'What is the new rebuild value in SAR? (or “same”)', parse: optionalAmount },
    { key: 'newContentsValue', q: 'And the new contents value in SAR? (or “same”)', parse: optionalAmount },
  ] },
  trip_extension: { title: 'Trip extension', intro: 'I\'ll extend your travel cover.', steps: [
    { key: 'newEndDate', q: 'What is your new return date? (YYYY-MM-DD, or e.g. “5 more days”)', parse: futureDate },
  ] },
  cancellation: { title: 'Cancellation request', intro: 'I can log a cancellation request. A person will review it and confirm any refund; your cover stays in place until then.', steps: [
    { key: 'reason', q: 'May I ask why you\'d like to cancel?', parse: text(3, 'reason') },
  ] },
};

const FLOW_LABELS: Record<string, string> = { incidentDate: 'Incident date', location: 'Location', description: 'What happened', estimatedDamage: 'Estimated damage (SAR)', garage: 'Garage', newAddress: 'New address', driverName: 'Driver', driverAge: 'Age', licenseYears: 'Years licensed', newMakeModel: 'Vehicle', newYear: 'Model year', newValue: 'Value (SAR)', reason: 'Reason', memberName: 'Member', memberAge: 'Age', relation: 'Relation', newBuildingValue: 'Rebuild value (SAR)', newContentsValue: 'Contents value (SAR)', newEndDate: 'New return date' };
export const flowFacts = (data: Record<string, string>) => Object.entries(data).filter(([k]) => !k.startsWith('_')).map(([k, v]) => ({ label: FLOW_LABELS[k] ?? k, value: v || 'Unchanged' }));
/** Which product a guided flow needs, if it is product-specific. */
export const FLOW_PRODUCT: Partial<Record<FlowKind, Product>> = { add_driver: 'motor', vehicle_change: 'motor', add_member: 'medical', sum_insured_change: 'home', trip_extension: 'travel' };

export interface ChatContext { area: Area; viewerId: string }

export const CUSTOMER_SUGGESTIONS = ['Where is my claim?', 'I had an accident', 'Add a driver', 'Change my address', 'Am I covered for theft?', 'When does my policy renew?', 'Quote for a 2023 car worth 95000', 'Talk to a person', 'My suitcase was lost', 'Am I covered for a burst pipe?', 'Add my newborn to medical', 'Extend my trip'];
export const STAFF_SUGGESTIONS = ['Summary', 'What needs approval?', 'Tell me about CLM-2026-0103', 'Pending changes', 'Process service requests', 'Draft customer reminders', 'Investigate new claims'];

const CLAIM_ID = /\bCLM-\d{4}-\d{4}\b/i;
const POL_ID = /\bPOL-\d{4}-\d{4}\b/i;
const QTE_ID = /\bQTE-\d{4}-\d{4}\b/i;

const NEXT_STEP: Record<Claim['status'], string> = {
  registered: 'The claims team will start the review shortly.',
  under_investigation: 'Our agents are reviewing your documents and policy right now.',
  awaiting_review: 'A claims reviewer is checking the findings.',
  docs_required: 'We need a few more documents from you before we can continue.',
  documents_received: 'We have your documents and will re-run the review.',
  escalated: 'A senior reviewer is looking at your claim.',
  manual_assessment: 'A claims handler is reviewing your claim directly.',
  assessment_completed: 'The review is complete and your claim is with the adjuster for the next step.',
};

function parseAmount(text: string): number | undefined {
  const k = text.match(/(\d+(?:\.\d+)?)\s*k\b/i);
  if (k) return Math.round(Number(k[1]) * 1000);
  const nums = (text.replace(/,/g, '').match(/\b\d{5,7}\b/g) ?? []).map(Number);
  return nums.find((n) => n >= 10000);
}

/* ─────────────── Customer mode ─────────────── */

function customerReply(msg: string, s: DemoState, viewerId: string): ChatReply {
  const t = msg.toLowerCase();
  const has = (...w: string[]) => w.some((x) => t.includes(x));
  const me = s.customers.find((c) => c.id === viewerId);
  const first = me?.name.split(' ')[0] ?? 'there';
  const policies = s.policies.filter((p) => p.customerId === viewerId);
  const claims = s.claims.filter((c) => c.customerId === viewerId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const hint = productHint(t);
  const newest = (xs: Policy[]) => [...xs].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0];
  const active = policies.filter((p) => p.status === 'active');
  const activeOf = (pr: Product) => newest(active.filter((p) => p.product === pr));
  const policy = policies.find((p) => t.includes(p.id.toLowerCase())) ?? (hint && (activeOf(hint) ?? newest(policies.filter((p) => p.product === hint)))) ?? newest(active) ?? newest(policies);

  // Guardrails: decisions reserved for people
  if (has('pay me', 'payout', 'pay out', 'payment', 'when will i get paid', 'settle', 'compensation', 'refund', 'approve my claim', 'approve the claim', 'reject')) {
    return {
      intent: 'guardrail',
      text: ['I can\'t make decisions about payments, settlements, refunds, cancellations or whether a claim is approved. Those are made by authorised people on our team.', 'I can ask someone to call you back about it.'],
      actions: [{ kind: 'callback', label: 'Request a call back', topic: msg.slice(0, 120) }],
      suggestions: ['Where is my claim?'],
    };
  }
  if (has('person', 'human', 'agent please', 'speak to', 'talk to', 'call me', 'call back', 'callback', 'complain', 'complaint')) {
    return {
      intent: 'handoff',
      text: [`Of course, ${first}. I can log a call-back request for our customer care team. They'll see it in their task list with this conversation's topic.`],
      actions: [{ kind: 'callback', label: 'Request a call back', topic: msg.slice(0, 120) }],
    };
  }
  if (/^(hi|hello|hey|salam|good (morning|afternoon|evening))\b/.test(t) || has('help', 'what can you do')) {
    return {
      intent: 'greeting',
      text: [`Hello ${first}, I'm the ITMC InsureAI assistant. I can check your claim, explain your cover, help you start a claim, show your renewal and give an indicative quote.`],
      suggestions: CUSTOMER_SUGGESTIONS.slice(0, 5),
    };
  }
  if (has('thank', 'thanks', 'shukran')) return { intent: 'thanks', text: ['You\'re welcome. Anything else I can help with?'], suggestions: ['Where is my claim?', 'When does my policy renew?'] };

  // Policy changes (guided, handed to the Policy Servicing Agent)
  // Without a product hint, prefer a long-term policy (motor/home/medical) over a single trip for account-level changes.
  const activePolicy = (hint && activeOf(hint)) || newest(active.filter((p) => !(p.product === 'travel' && p.travel?.tripType === 'single'))) || newest(active);
  const needPolicy: ChatReply = { intent: 'no_policy', text: ['I couldn\'t find an active policy on your account to change.'], actions: [{ kind: 'navigate', label: 'View my policies', area: 'portal', page: 'policies' }] };
  const needProduct = (pr: Product): ChatReply => ({ intent: 'no_policy', text: [`That change needs an active ${PRODUCT_LABEL[pr].toLowerCase()} policy, and I couldn't find one on your account.`], actions: [{ kind: 'navigate', label: `Get a ${PRODUCT_LABEL[pr].toLowerCase()} quote`, area: 'portal', page: 'quote', params: { product: pr } }] });
  const startFor = (flow: FlowKind, pr: Product | undefined, prefill?: Record<string, string>, lead?: string): ChatReply => {
    const target = pr ? activeOf(pr) : activePolicy;
    if (!target) return pr ? needProduct(pr) : needPolicy;
    return { intent: flow, text: [lead ?? FLOWS[flow].intro], startFlow: { flow, prefill, policyId: target.id } };
  };
  if (has('cancel my policy', 'cancel policy', 'cancel my insurance', 'end my policy', 'stop my policy', 'cancel my travel', 'cancel my medical', 'cancel my home')) {
    return startFor('cancellation', hint);
  }
  if (has('change my address', 'new address', 'update my address', 'i moved', 'moved house', 'change address')) {
    const m = msg.match(/\bto\s+(.{8,})$/i);
    return m ? startFor('address_change', hint, { newAddress: m[1].trim() }, 'Got it.') : startFor('address_change', hint);
  }
  if (has('extend my trip', 'extend trip', 'extend my travel', 'staying longer', 'stay longer', 'extend my cover abroad', 'trip extension')) return startFor('trip_extension', 'travel');
  if (has('sum insured', 'rebuild value', 'contents value', 'increase my home', 'renovat', 'insure more contents', 'increase cover on my home')) return startFor('sum_insured_change', 'home');
  const familyWords = has('add my son', 'add my daughter', 'add my wife', 'add my husband', 'add my baby', 'add my child', 'add my mother', 'add my father');
  if (has('add a member', 'add member', 'family member', 'newborn', 'dependant', 'dependent', 'add to my medical') || (familyWords && (hint === 'medical' || (!activeOf('motor') && !!activeOf('medical'))))) {
    return startFor('add_member', 'medical');
  }
  if (has('add a driver', 'add driver', 'named driver', 'another driver', 'will drive my car') || familyWords) {
    return startFor('add_driver', 'motor');
  }
  if (has('change my car', 'replace my car', 'change vehicle', 'changed my car', 'sold my car', 'bought a new car', 'change my vehicle')) {
    return startFor('vehicle_change', 'motor');
  }
  if (has('my request', 'change request', 'service request', 'endorsement')) {
    const reqs = s.serviceRequests.filter((r) => r.customerId === viewerId);
    const lbl = { submitted: 'received', pending_approval: 'under review by an underwriter', applied: 'completed', rejected: 'not approved' } as const;
    return { intent: 'service_status', text: reqs.length ? ['Your change requests:', ...reqs.map((r) => `${r.id}: ${r.type.replace(/_/g, ' ')} on ${r.policyId}, ${lbl[r.status]}.`)] : ['You have no change requests. I can change your address, add a driver or family member, change your vehicle, extend a trip, update home values or log a cancellation request.'], actions: [{ kind: 'navigate', label: 'View my policies', area: 'portal', page: 'policies' }] };
  }

  // Claim status
  const claimMatch = msg.match(CLAIM_ID)?.[0].toUpperCase();
  if (claimMatch || has('my claim', 'claim status', 'track', 'where is', 'status', 'progress', 'update on')) {
    if (claimMatch && !claims.some((c) => c.id === claimMatch)) {
      return { intent: 'privacy', text: [`I can only discuss claims on your own account. ${claimMatch} isn't one of yours.`], suggestions: ['Where is my claim?'] };
    }
    const c = claims.find((x) => x.id === claimMatch) ?? claims[0];
    if (!c) return { intent: 'claim_status', text: ['You don\'t have any claims with us.'], actions: [{ kind: 'navigate', label: 'Register a claim', area: 'portal', page: 'claim-new' }] };
    const req = s.documentRequests.find((r) => r.claimId === c.id && r.status === 'open');
    const actions: ChatAction[] = [{ kind: 'navigate', label: 'Open claim tracker', area: 'portal', page: 'claims', params: { claimId: c.id } }];
    if (req) for (const d of req.documents.filter((d) => !c.documents.some((x) => x.type === d))) actions.unshift({ kind: 'upload_doc', label: `Upload sample ${DOC_LABELS[d].toLowerCase()}`, claimId: c.id, docType: d });
    return {
      intent: 'claim_status',
      text: [`Your claim ${c.id} is: ${CLAIM_STATUS[c.status].customer}.`, NEXT_STEP[c.status], ...(req ? [`Still needed: ${req.documents.filter((d) => !c.documents.some((x) => x.type === d)).map((d) => DOC_LABELS[d].toLowerCase()).join(', ')}. You can upload it right here.`] : [])],
      facts: [{ label: 'Incident', value: `${PRODUCT_LABEL[c.product]} · ${INCIDENT_LABEL[c.incidentType]} · ${fmtDate(c.incidentDate)}` }, { label: 'Last update', value: fmtDate(c.statusHistory[c.statusHistory.length - 1].at) }, ...(claims.length > 1 ? [{ label: 'Other claims', value: claims.filter((x) => x.id !== c.id).map((x) => x.id).join(', ') }] : [])],
      actions,
    };
  }

  // Documents
  if (has('upload', 'document', 'paperwork', 'what do i need', 'which documents')) {
    const open = s.documentRequests.filter((r) => r.status === 'open' && claims.some((c) => c.id === r.claimId));
    if (open.length) {
      const actions: ChatAction[] = [];
      for (const r of open) { const c = claims.find((x) => x.id === r.claimId)!; for (const d of r.documents.filter((d) => !c.documents.some((x) => x.type === d))) actions.push({ kind: 'upload_doc', label: `Upload sample ${DOC_LABELS[d].toLowerCase()} (${r.claimId})`, claimId: r.claimId, docType: d }); }
      return { intent: 'documents', text: ['We are waiting for these documents from you:', ...open.map((r) => `${r.claimId}: ${r.documents.map((d) => DOC_LABELS[d].toLowerCase()).join(', ')}`)], actions };
    }
    const type: IncidentType = incidentFor(hint ?? policy?.product ?? 'motor', t);
    return { intent: 'documents', text: [`For a ${INCIDENT_LABEL[type].toLowerCase()} claim you'll need: ${REQUIRED_DOCS[type].map((d) => DOC_LABELS[d].toLowerCase()).join(', ')}.`, 'Nothing is outstanding on your current claims.'] };
  }

  // New claim
  const asksCover = has('covered', 'cover for', 'am i cover', 'does my', 'is my', 'what does', 'limit');
  if (!asksCover && (has('accident', 'crash', 'collision', 'hit my', 'was hit', 'damaged', 'new claim', 'file a claim', 'make a claim', 'register a claim', 'stolen', 'broke', 'burst', 'leak', 'flooded', 'caught fire', 'burglar', 'broken into', 'break-in', 'lost my', 'was lost', 'luggage', 'baggage', 'flight was delayed', 'flight delay', 'hospital', 'saw a doctor', 'went to the doctor', 'sick', 'clinic', 'pharmacy', 'cancel my trip', 'trip cancelled'))) {
    const target = hint ? activeOf(hint) : (activeOf('motor') ?? activePolicy);
    if (!target) return { intent: 'new_claim', text: [hint ? `I couldn't find an active ${PRODUCT_LABEL[hint].toLowerCase()} policy on your account, so that claim can't be registered yet.` : 'I couldn\'t find an active policy on your account, so a claim can\'t be registered yet.'], actions: [{ kind: 'navigate', label: 'Get a quote', area: 'portal', page: 'quote', params: hint ? { product: hint } : undefined }] };
    const type = incidentFor(target.product, t);
    const window = target.product === 'travel' ? 'within 30 days of returning' : 'within 14 days of the incident';
    return {
      intent: 'new_claim',
      text: [`I'm sorry to hear that. ${ACCIDENT_HINT[target.product]}`, `I can take the details now in this chat, or you can use the full form. For a ${INCIDENT_LABEL[type].toLowerCase()} claim on your ${PRODUCT_LABEL[target.product].toLowerCase()} policy ${target.id} we'll eventually need: ${REQUIRED_DOCS[type].map((d) => DOC_LABELS[d].toLowerCase()).join(', ')}. Please report ${window}.`],
      actions: [{ kind: 'start_flow', label: 'Report it here in chat', flow: 'fnol', policyId: target.id, prefill: { _incident: type } }, { kind: 'navigate', label: 'Use the claim form', area: 'portal', page: 'claim-new', params: { policyId: target.id } }],
    };
  }

  // Coverage
  if (has('cover', 'covered', 'theft', 'flood', 'storm', 'glass', 'windscreen', 'deductible', 'excess', 'exclusion', 'limit', 'include', 'co-pay', 'copay', 'waiting period')) {
    if (!policy) return { intent: 'coverage', text: ['You don\'t have a policy with us yet.'], actions: [{ kind: 'navigate', label: 'Get a quote', area: 'portal', page: 'quote', params: hint ? { product: hint } : undefined }] };
    if (hint && policy.product !== hint) {
      return { intent: 'coverage', text: [`You don't have ${PRODUCT_LABEL[hint].toLowerCase()} cover with us yet. I can help you get a quote in a couple of minutes.`], actions: [{ kind: 'navigate', label: `Get a ${PRODUCT_LABEL[hint].toLowerCase()} quote`, area: 'portal', page: 'quote', params: { product: hint } }] };
    }
    const r = COVERAGE_RULES[policy.coverage];
    const mentionsIncident = word(t, 'theft', 'stolen', 'flood', 'storm', 'hail', 'weather', 'glass', 'windscreen', 'accident', 'collision', 'baggage', 'luggage', 'suitcase', 'delay', 'cancel', 'emergency', 'hospital', 'doctor', 'outpatient', 'pharmacy', 'medicine', 'fire', 'pipe', 'leak', 'burst', 'water', 'burglar', 'break-in', 'accidental');
    const asked: IncidentType | undefined = mentionsIncident ? incidentFor(policy.product, t) : undefined;
    const text: string[] = [];
    const exclusionHit = r.exclusions.find((e) => e.keywords.some((k) => t.includes(k)));
    if (asked) {
      const lbl = INCIDENT_LABEL[asked];
      const limit = r.limits?.[asked];
      text.push(r.coveredIncidents.includes(asked)
        ? `Yes. ${lbl} is covered under your ${r.label} policy ${policy.id}${limit ? `, up to ${money(limit)}` : ''}, subject to ${policy.product === 'motor' || policy.product === 'home' ? 'the deductible and ' : ''}the policy conditions.`
        : `No. ${lbl} is not covered under ${r.label} cover.`);
    } else text.push(`Your policy ${policy.id} is ${r.label} cover for ${policy.subject}.`);
    if (exclusionHit) text.push(`Please note the exclusion “${exclusionHit.label}”. If that applies, the claim may not be covered.`);
    if (has('exclusion', 'not covered', 'exclude')) text.push(`Main exclusions: ${r.exclusions.map((e) => e.label.toLowerCase()).join('; ')}.`);
    if (policy.product === 'medical' && has('waiting', 'co-pay', 'copay', 'condition')) text.push(...r.conditions);
    text.push('This is a summary of a demo policy, not legal policy wording. A claims handler decides cover on each claim.');
    const limitFacts = Object.entries(r.limits ?? {}).map(([k, v]) => ({ label: INCIDENT_LABEL[k as IncidentType], value: money(v as number) }));
    const facts = policy.product === 'motor'
      ? [{ label: 'Sum insured', value: policy.sumInsured ? money(policy.sumInsured) : '—' }, { label: 'Deductible', value: money(policy.deductible) }, { label: 'Third-party limit', value: money(r.thirdPartyLimit) }, { label: 'Add-ons', value: policy.addOns.map((a) => PRICING.addOns[a].label).join(', ') || 'None' }]
      : policy.product === 'home'
        ? [{ label: 'Sum insured', value: money(policy.sumInsured) }, { label: 'Deductible', value: money(policy.deductible) }, { label: 'Liability limit', value: money(r.thirdPartyLimit) }, { label: 'Covers', value: r.coveredIncidents.map((i) => INCIDENT_LABEL[i]).join(', ') }]
        : [{ label: 'Plan', value: r.label }, ...limitFacts];
    return {
      intent: 'coverage', text, facts,
      actions: [{ kind: 'navigate', label: 'View my policy', area: 'portal', page: 'policies' }],
    };
  }

  // Renewal
  if (has('renew', 'expire', 'expiry', 'end date')) {
    if (!policy) return { intent: 'renewal', text: ['You don\'t have a policy to renew.'] };
    const days = daysBetween(todayISO(), policy.expiryDate);
    if (policy.product === 'travel' && policy.travel?.tripType === 'single') {
      return { intent: 'renewal', text: [`${policy.id} is single-trip travel cover. It ends with your trip on ${fmtDate(policy.expiryDate)} and isn't renewed. For your next trip, get a new travel quote, or consider annual multi-trip cover.`], actions: [{ kind: 'navigate', label: 'Get a travel quote', area: 'portal', page: 'quote', params: { product: 'travel' } }] };
    }
    const rn = s.renewals.find((r) => r.policyId === policy.id);
    return {
      intent: 'renewal',
      text: [`${policy.id} expires on ${fmtDate(policy.expiryDate)} (${days} days from today).`, rn ? `An illustrative renewal estimate of ${money(rn.estimate.total, { decimals: true })} has been prepared. It isn't a binding offer.` : days <= 60 ? 'Your renewal can be prepared now.' : 'We\'ll prepare your renewal closer to the expiry date.'],
      actions: [{ kind: 'navigate', label: 'View renewal', area: 'portal', page: 'renewal', params: { policyId: policy.id } }],
    };
  }

  // Quote
  if (has('quote', 'price', 'cost', 'premium', 'how much', 'insure my', 'new car')) {
    const year = Number(msg.match(/\b(20[0-2]\d)\b/)?.[1]);
    const value = parseAmount(msg);
    if (year && value && me) {
      const age = daysBetween(me.dateOfBirth, todayISO()) / 365.25 | 0;
      const priced = priceMotor({ vehicle: { make: '', model: '', year, value, usage: 'private' }, driver: { age, licenseYears: Math.max(0, age - 20), claimsLast3Years: 0 }, coverage: 'comprehensive', deductible: 1000, addOns: [], city: me.city, currentYear: Number(todayISO().slice(0, 4)) });
      return {
        intent: 'indicative_quote',
        text: [`For a ${year} car worth ${money(value)}, comprehensive cover with a ${money(1000)} deductible comes to about ${money(priced.breakdown.total, { decimals: true })} a year including VAT.`, 'This is an indicative figure from the demo tariff, assuming no claims in 3 years and private use. Get a full quote to see every factor.'],
        actions: [{ kind: 'navigate', label: 'Get a full quote', area: 'portal', page: 'quote' }],
      };
    }
    if (hint && hint !== 'motor') {
      const blurb = { travel: 'Travel cover is priced on region, trip length and traveller ages.', medical: 'Medical cover is priced on each member\'s age, the plan and the hospital network.', home: 'Home cover is priced on rebuild and contents values, property type and security.' }[hint];
      return { intent: 'quote', text: [`${blurb} The quote form takes about a minute and shows every factor.`], actions: [{ kind: 'navigate', label: `Get a ${PRODUCT_LABEL[hint].toLowerCase()} quote`, area: 'portal', page: 'quote', params: { product: hint } }] };
    }
    return { intent: 'quote', text: ['I can give you an indicative motor price. Tell me the model year and value, for example "Quote for a 2023 car worth 95000", or start a full quote. I can also quote travel, medical and home cover.'], actions: [{ kind: 'navigate', label: 'Get a full quote', area: 'portal', page: 'quote' }, { kind: 'navigate', label: 'Travel', area: 'portal', page: 'quote', params: { product: 'travel' } }, { kind: 'navigate', label: 'Medical', area: 'portal', page: 'quote', params: { product: 'medical' } }, { kind: 'navigate', label: 'Home', area: 'portal', page: 'quote', params: { product: 'home' } }] };
  }

  if (has('policy', 'policies', 'my insurance')) {
    if (!policies.length) return { intent: 'policies', text: ['You don\'t have any policies yet.'], actions: [{ kind: 'navigate', label: 'Get a quote', area: 'portal', page: 'quote' }] };
    return {
      intent: 'policies',
      text: [`You have ${policies.length} demo polic${policies.length > 1 ? 'ies' : 'y'}:`, ...policies.map((p) => `${p.id}: ${PRODUCT_LABEL[p.product]} · ${COVERAGE_RULES[p.coverage].label}, ${p.subject}, ${p.status === 'active' ? 'expires' : p.status === 'cancelled' ? 'cancelled, was due to end' : 'ended'} ${fmtDate(p.expiryDate)}.`)],
      actions: [{ kind: 'navigate', label: 'View my policies', area: 'portal', page: 'policies' }],
    };
  }

  return { intent: 'fallback', text: ['I didn\'t catch that. I can help with claims, cover, renewals and quotes, or connect you with a person.'], suggestions: CUSTOMER_SUGGESTIONS.slice(0, 4).concat('Talk to a person') };
}

/* ─────────────── Staff mode ─────────────── */

function staffReply(msg: string, s: DemoState): ChatReply {
  const t = msg.toLowerCase();
  const has = (...w: string[]) => w.some((x) => t.includes(x));
  if (/^(hi|hello|hey)\b/.test(t) || has('help', 'what can you do')) {
    return { intent: 'help', text: ['I can look up claims, policies, quotes and customers, summarise the workload, list what needs approval, and hand work to the Orchestrator Agent.'], suggestions: STAFF_SUGGESTIONS };
  }
  if (has('approve', 'reject', 'authorise', 'authorize', 'pay ', 'payment', 'settle')) {
    return { intent: 'guardrail', text: ['I don\'t record decisions. Reviewers approve, reject or escalate in the Human Approval Queue so every decision has a named person and an audit entry.'], actions: [{ kind: 'navigate', label: 'Open Human Approval Queue', area: 'ops', page: 'approvals' }] };
  }
  if (has('investigate', 'prepare renewal', 'check open quotes', 'check quotes', 'process', 'autopilot', 'run orchestrator', 'all pending', 'handle all', 'reminder', 'follow up', 'follow-up', 'draft')) {
    return { intent: 'delegate', text: ['Handing this to the Orchestrator Agent. I\'ll report back when its plan finishes.'], autoRun: { kind: 'orchestrate', label: 'Run with Orchestrator', command: msg }, actions: [{ kind: 'navigate', label: 'Watch in Orchestrator', area: 'ops', page: 'orchestrator' }] };
  }
  const clm = msg.match(CLAIM_ID)?.[0].toUpperCase();
  if (clm) {
    const c = s.claims.find((x) => x.id === clm);
    if (!c) return { intent: 'claim', text: [`${clm} doesn't exist.`] };
    const inv = c.investigations[c.investigations.length - 1];
    const cust = s.customers.find((x) => x.id === c.customerId);
    return {
      intent: 'claim',
      text: [`${c.id} for ${cust?.name}: ${CLAIM_STATUS[c.status].ops}.`, inv?.report ? `Latest investigation ${inv.runId} recommends "${inv.report.recommendation.label}" (confidence ${inv.report.confidence}); ${inv.report.anomalies.length} anomaly indicator(s), ${inv.report.missingDocuments.length} missing document(s).` : 'No investigation has been run yet.'],
      facts: [{ label: 'Incident', value: `${PRODUCT_LABEL[c.product]} · ${INCIDENT_LABEL[c.incidentType]} · ${fmtDate(c.incidentDate)}` }, { label: 'Claimed', value: money(c.estimatedDamage) }, { label: 'Provider', value: c.garage }, { label: 'Documents', value: `${c.documents.length} on file` }],
      actions: [{ kind: 'navigate', label: 'Open claim workbench', area: 'ops', page: 'claim', params: { claimId: c.id } }],
    };
  }
  const pol = msg.match(POL_ID)?.[0].toUpperCase();
  if (pol) {
    const p = s.policies.find((x) => x.id === pol);
    if (!p) return { intent: 'policy', text: [`${pol} doesn't exist.`] };
    return { intent: 'policy', text: [`${p.id}: ${PRODUCT_LABEL[p.product]} · ${COVERAGE_RULES[p.coverage].label} for ${s.customers.find((c) => c.id === p.customerId)?.name}, ${p.subject}. Term ${fmtDate(p.effectiveDate)} to ${fmtDate(p.expiryDate)}, premium ${money(p.annualPremium, { decimals: true })}.`], actions: [{ kind: 'navigate', label: 'Open renewals', area: 'ops', page: 'renewals', params: { policyId: p.id } }] };
  }
  const qte = msg.match(QTE_ID)?.[0].toUpperCase();
  if (qte) {
    const q = s.quotes.find((x) => x.id === qte);
    if (!q) return { intent: 'quote', text: [`${qte} doesn't exist.`] };
    return { intent: 'quote', text: [`${q.id}: ${q.subject}, ${money(q.premium.total, { decimals: true })}, status ${q.status}${q.policyId ? ` (${q.policyId})` : ''}.`, q.missingInfo.length ? `Missing: ${q.missingInfo.join('; ')}.` : 'No missing information.'], actions: [{ kind: 'navigate', label: 'Open quotes', area: 'ops', page: 'quotes-policies', params: { tab: 'quotes' } }] };
  }
  if (has('change request', 'service request', 'endorsement', 'pending changes')) {
    const r = s.serviceRequests;
    return { intent: 'service', text: r.length ? [`${r.length} change request(s):`, ...r.map((x) => `${x.id}: ${x.type.replace(/_/g, ' ')} on ${x.policyId}, ${x.status.replace('_', ' ')}.`)] : ['No change requests.'], actions: [{ kind: 'navigate', label: 'Open Service & Comms', area: 'ops', page: 'service' }] };
  }
  if (has('approval', 'waiting', 'pending review', 'needs review', 'queue')) {
    const p = s.approvals.filter((a) => a.status === 'pending');
    return { intent: 'approvals', text: p.length ? [`${p.length} report(s) waiting for a decision:`, ...p.map((a) => `${a.claimId}: ${a.recommendation.label}`)] : ['Nothing is waiting for approval.'], actions: [{ kind: 'navigate', label: 'Open Human Approval Queue', area: 'ops', page: 'approvals' }] };
  }
  if (has('renewal', 'expiring', 'expire')) {
    const o = renewalOpportunities(s);
    return { intent: 'renewals', text: o.length ? [`${o.length} polic${o.length > 1 ? 'ies' : 'y'} expiring within 60 days:`, ...o.map((p) => `${p.id} (${s.customers.find((c) => c.id === p.customerId)?.name}) expires ${fmtDate(p.expiryDate)}${s.renewals.some((r) => r.policyId === p.id) ? ', draft prepared' : ', no draft yet'}.`)] : ['No renewals due in the next 60 days.'], actions: [{ kind: 'navigate', label: 'Open Renewals', area: 'ops', page: 'renewals' }] };
  }
  const cust = s.customers.find((c) => c.name.toLowerCase().split(' ').some((n) => n.length > 2 && new RegExp(`\\b${n}\\b`).test(t)));
  if (cust) {
    const ps = s.policies.filter((p) => p.customerId === cust.id), cs = s.claims.filter((c) => c.customerId === cust.id);
    return { intent: 'customer', text: [`${cust.name} (${cust.id}), ${cust.city}.`, `Policies: ${ps.map((p) => p.id).join(', ') || 'none'}. Claims: ${cs.map((c) => `${c.id} (${CLAIM_STATUS[c.status].ops})`).join(', ') || 'none'}.`], actions: cs[0] ? [{ kind: 'navigate', label: `Open ${cs[0].id}`, area: 'ops', page: 'claim', params: { claimId: cs[0].id } }] : [] };
  }
  if (has('summary', 'overview', 'how many', 'open claims', 'workload', 'status', 'kpi', 'metric')) {
    const m = metrics(s);
    return { intent: 'summary', text: ['Current demo workload:'], facts: [{ label: 'Open claims', value: String(m.openClaims) }, { label: 'Under investigation', value: String(m.underInvestigation) }, { label: 'Awaiting approval', value: String(m.awaitingApproval) }, { label: 'Document requests', value: String(m.docRequests) }, { label: 'Renewals due', value: String(m.renewals) }, { label: 'Policies / quotes', value: `${m.policies} / ${m.quotes}` }], actions: [{ kind: 'navigate', label: 'Open Executive Overview', area: 'ops', page: 'overview' }] };
  }
  return { intent: 'fallback', text: ['I didn\'t recognise that. Try a claim, policy or quote number, a customer name, "Summary" or "What needs approval?".'], suggestions: STAFF_SUGGESTIONS.slice(0, 4) };
}

export function chatbotRespond(message: string, s: DemoState, ctx: ChatContext): ChatReply {
  return ctx.area === 'portal' ? customerReply(message, s, ctx.viewerId) : staffReply(message, s);
}
