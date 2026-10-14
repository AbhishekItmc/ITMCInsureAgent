// The five claims-investigation agents. Each is a pure, deterministic function with a typed
// input and output so it can later be backed by a model on a secure server.
import { ANOMALY_RULES, ASSESSMENT, COVERAGE_RULES, DOC_LABELS, INCIDENT_LABEL, MEDICAL_PRICING, REPORTING_WINDOW_DAYS, REQUIRED_DOCS } from '../config/rules';
import { daysBetween, fmtDate, money } from '../lib/format';
import type {
  Claim, ClaimDocument, Customer, DocType, Finding, InvestigationReport, Policy, Recommendation,
} from '../types';
import { fid, type AgentDefinition } from './runtime';

export interface ClaimContext {
  claim: Claim;
  policy: Policy | undefined;
  customer: Customer | undefined;
  allClaims: Claim[];
}

const docOf = (c: Claim, t: DocType): ClaimDocument | undefined => c.documents.find((d) => d.type === t);
const num = (v: unknown) => (typeof v === 'number' ? v : Number(v));
/** The document that carries the claimed cost: a repair estimate (motor, home) or an invoice (travel, medical). */
const costDoc = (c: Claim) => docOf(c, 'repair_estimate') ?? docOf(c, 'invoice');

/* ───────────────────────── 1. Document Intelligence ───────────────────────── */

export interface DocIntelOutput {
  extracted: { type: DocType; fileName: string; fields: Record<string, string | number> }[];
  required: DocType[];
  missing: DocType[];
  inconsistencyCount: number;
}

export const documentIntelligenceAgent: AgentDefinition<ClaimContext, DocIntelOutput> = {
  name: 'Document Intelligence Agent',
  task: ({ claim }) => `Extract and cross-check ${claim.documents.length} document(s) for ${claim.id}`,
  run({ claim, policy, customer }) {
    const trace: string[] = [];
    const findings: Finding[] = [];
    const required = REQUIRED_DOCS[claim.incidentType];
    const extracted = claim.documents.map((d) => ({ type: d.type, fileName: d.fileName, fields: d.fields }));
    trace.push(`Extracted structured fields from ${extracted.length} document(s).`);

    const missing = required.filter((t) => !docOf(claim, t));
    if (missing.length) {
      findings.push({
        id: fid('DOC'), severity: 'warning', title: `Missing required document${missing.length > 1 ? 's' : ''}`,
        detail: `${missing.map((m) => DOC_LABELS[m]).join(', ')} required for a ${INCIDENT_LABEL[claim.incidentType].toLowerCase()} claim but not on file.`,
        evidence: [{ label: 'Required set', value: required.map((r) => DOC_LABELS[r]).join(', '), source: `Coverage rules · ${claim.incidentType}` },
          { label: 'On file', value: claim.documents.map((d) => DOC_LABELS[d.type]).join(', ') || 'none', source: claim.id }],
      });
    }
    trace.push(`Compared against the required document set: ${missing.length} missing.`);

    // Date consistency
    const cf = docOf(claim, 'claim_form');
    const pr = docOf(claim, 'police_report');
    const est = docOf(claim, 'repair_estimate');
    const ph = docOf(claim, 'damage_photos');
    const dl = docOf(claim, 'driver_license');
    for (const d of [cf, pr]) {
      if (d && d.fields.incidentDate && d.fields.incidentDate !== claim.incidentDate) {
        findings.push({ id: fid('DOC'), severity: 'warning', title: `Incident date differs on ${DOC_LABELS[d.type].toLowerCase()}`,
          detail: `Document states ${fmtDate(String(d.fields.incidentDate))}; the registered claim states ${fmtDate(claim.incidentDate)}.`,
          evidence: [{ label: 'Document date', value: String(d.fields.incidentDate), source: d.fileName }, { label: 'Claim date', value: claim.incidentDate, source: claim.id }] });
      }
    }
    if (ph && ph.fields.capturedDate && String(ph.fields.capturedDate) < claim.incidentDate) {
      findings.push({ id: fid('DOC'), severity: 'warning', title: 'Photos captured before the reported incident date',
        detail: `Photo metadata shows ${fmtDate(String(ph.fields.capturedDate))}, ${daysBetween(String(ph.fields.capturedDate), claim.incidentDate)} day(s) before the incident date. May be a device clock or data-entry issue; needs clarification.`,
        evidence: [{ label: 'Captured (EXIF)', value: String(ph.fields.capturedDate), source: ph.fileName }, { label: 'Incident date', value: claim.incidentDate, source: claim.id }] });
    }
    if (est && est.fields.estimateDate && String(est.fields.estimateDate) < claim.incidentDate) {
      findings.push({ id: fid('DOC'), severity: 'critical', title: 'Repair estimate dated before the incident',
        detail: `Estimate date ${fmtDate(String(est.fields.estimateDate))} precedes the incident date ${fmtDate(claim.incidentDate)}.`,
        evidence: [{ label: 'Estimate date', value: String(est.fields.estimateDate), source: est.fileName }, { label: 'Incident date', value: claim.incidentDate, source: claim.id }] });
    }
    for (const d of claim.documents) {
      const dt = String(d.fields.invoiceDate ?? d.fields.treatmentDate ?? d.fields.admissionDate ?? '');
      if (dt && dt < claim.incidentDate) {
        findings.push({ id: fid('DOC'), severity: 'warning', title: `${DOC_LABELS[d.type]} dated before the incident`,
          detail: `${DOC_LABELS[d.type]} shows ${fmtDate(dt)}, before the reported incident date ${fmtDate(claim.incidentDate)}.`,
          evidence: [{ label: 'Document date', value: dt, source: d.fileName }, { label: 'Incident date', value: claim.incidentDate, source: claim.id }] });
      }
    }
    trace.push('Checked dates across documents against the registered incident date.');

    // Amount consistency
    if (cf && cf.fields.estimatedAmount !== undefined && num(cf.fields.estimatedAmount) !== claim.estimatedDamage) {
      findings.push({ id: fid('DOC'), severity: 'warning', title: 'Claim form amount differs from registered amount',
        detail: `Claim form: ${money(num(cf.fields.estimatedAmount))}; registered: ${money(claim.estimatedDamage)}.`,
        evidence: [{ label: 'Claim form', value: money(num(cf.fields.estimatedAmount)), source: cf.fileName }, { label: 'Registered', value: money(claim.estimatedDamage), source: claim.id }] });
    }
    if (est) {
      const parts = num(est.fields.partsTotal || 0), hours = num(est.fields.labourHours || 0), rate = num(est.fields.labourRate || 0), paint = num(est.fields.paintTotal || 0);
      const computed = parts + hours * rate + paint;
      const stated = num(est.fields.total);
      if (Math.abs(computed - stated) > 1) {
        findings.push({ id: fid('DOC'), severity: 'warning', title: 'Repair estimate lines do not add up',
          detail: `Line items sum to ${money(computed)} but the stated total is ${money(stated)}.`,
          evidence: [{ label: 'Parts + labour + paint', value: `${money(parts)} + ${hours}h × ${rate} + ${money(paint)}`, source: est.fileName }, { label: 'Stated total', value: money(stated), source: est.fileName }] });
      }
    }
    const inv = docOf(claim, 'invoice');
    if (inv && !est && Math.abs(num(inv.fields.total) - claim.estimatedDamage) / claim.estimatedDamage > 0.15) {
      findings.push({ id: fid('DOC'), severity: 'warning', title: 'Invoice total differs from the claimed amount',
        detail: `Invoice shows ${money(num(inv.fields.total))}; the claim states ${money(claim.estimatedDamage)}.`,
        evidence: [{ label: 'Invoice total', value: money(num(inv.fields.total)), source: inv.fileName }, { label: 'Claimed', value: money(claim.estimatedDamage), source: claim.id }] });
    }
    trace.push('Reconciled amounts between the claim form, registered claim and repair estimate or invoice.');

    // Identity / vehicle consistency
    const plate = policy?.vehicle?.plate;
    for (const d of claim.documents) {
      if (d.fields.plate && plate && String(d.fields.plate).replace(/\s/g, '') !== plate.replace(/\s/g, '')) {
        findings.push({ id: fid('DOC'), severity: 'warning', title: `Plate on ${DOC_LABELS[d.type].toLowerCase()} differs from policy`,
          detail: `${d.fields.plate} on document vs ${plate} on policy.`,
          evidence: [{ label: 'Document plate', value: String(d.fields.plate), source: d.fileName }, { label: 'Policy plate', value: plate, source: policy!.id }] });
      }
    }
    if (dl && dl.fields.expiryDate && String(dl.fields.expiryDate) < claim.incidentDate) {
      findings.push({ id: fid('DOC'), severity: 'critical', title: 'Driver licence expired at time of incident',
        detail: `Licence expiry ${fmtDate(String(dl.fields.expiryDate))} is before the incident date.`,
        evidence: [{ label: 'Licence expiry', value: String(dl.fields.expiryDate), source: dl.fileName }] });
    }
    if (dl && customer && dl.fields.holder && String(dl.fields.holder).toLowerCase() !== customer.name.toLowerCase()) {
      findings.push({ id: fid('DOC'), severity: 'info', title: 'Driver is not the policyholder',
        detail: `Licence holder "${dl.fields.holder}" differs from policyholder "${customer.name}". Confirm the driver is authorised.`,
        evidence: [{ label: 'Licence holder', value: String(dl.fields.holder), source: dl.fileName }] });
    }
    trace.push('Checked plate and driver identity across documents.');

    const inconsistencyCount = findings.filter((f) => !f.title.startsWith('Missing')).length;
    return {
      output: { extracted, required, missing, inconsistencyCount },
      summary: `${extracted.length} document(s) read · ${missing.length} missing · ${inconsistencyCount} inconsistency flag(s).`,
      findings, trace,
    };
  },
};

/* ───────────────────────── 2. Policy Intelligence ───────────────────────── */

export interface PolicyIntelOutput {
  policyId: string;
  coverageLabel: string;
  activeOnIncidentDate: boolean;
  incidentCovered: boolean;
  sumInsured: number;
  deductible: number;
  thirdPartyLimit: number;
  reportingDays: number;
  withinReportingWindow: boolean;
  exclusionsReviewed: { code: string; label: string; triggered: boolean; matched?: string }[];
  conditions: string[];
  observations: string[];
}

export const policyIntelligenceAgent: AgentDefinition<ClaimContext, PolicyIntelOutput> = {
  name: 'Policy Intelligence Agent',
  task: ({ claim }) => `Check ${claim.policyId} coverage rules for ${claim.id}`,
  run({ claim, policy }) {
    const trace: string[] = [];
    const findings: Finding[] = [];
    if (!policy) {
      findings.push({ id: fid('POL'), severity: 'critical', title: 'Policy not found', detail: `No demo policy ${claim.policyId}.`, evidence: [] });
      return { output: { policyId: claim.policyId, coverageLabel: '—', activeOnIncidentDate: false, incidentCovered: false, sumInsured: 0, deductible: 0, thirdPartyLimit: 0, reportingDays: 0, withinReportingWindow: false, exclusionsReviewed: [], conditions: [], observations: ['Policy record missing.'] }, summary: 'Policy not found.', findings, trace: ['Policy lookup failed.'] };
    }
    const rules = COVERAGE_RULES[policy.coverage];
    trace.push(`Retrieved ${policy.id} (${rules.label}).`);
    const active = claim.incidentDate >= policy.effectiveDate && claim.incidentDate <= policy.expiryDate;
    if (!active) findings.push({ id: fid('POL'), severity: 'critical', title: 'Incident outside the policy period',
      detail: `Incident ${fmtDate(claim.incidentDate)}; policy period ${fmtDate(policy.effectiveDate)} – ${fmtDate(policy.expiryDate)}.`,
      evidence: [{ label: 'Policy period', value: `${policy.effectiveDate} → ${policy.expiryDate}`, source: policy.id }] });
    const covered = rules.coveredIncidents.includes(claim.incidentType);
    if (!covered) findings.push({ id: fid('POL'), severity: 'critical', title: `${INCIDENT_LABEL[claim.incidentType]} not covered under ${rules.label}`,
      detail: `Configured covered incidents: ${rules.coveredIncidents.join(', ')}.`, evidence: [{ label: 'Coverage', value: rules.label, source: policy.id }] });
    trace.push('Checked policy period and covered incident types.');
    const subLimit = rules.limits?.[claim.incidentType];
    if (subLimit !== undefined && claim.estimatedDamage > subLimit) {
      findings.push({ id: fid('POL'), severity: 'warning', title: `Claim exceeds the ${INCIDENT_LABEL[claim.incidentType].toLowerCase()} sub-limit`,
        detail: `Claimed ${money(claim.estimatedDamage)} against a configured limit of ${money(subLimit)} under ${rules.label}. Any amount above the limit would not be payable.`,
        evidence: [{ label: 'Sub-limit', value: money(subLimit), source: `${rules.label} rules` }, { label: 'Claimed', value: money(claim.estimatedDamage), source: claim.id }] });
    }
    if (policy.product === 'medical' && claim.incidentType !== 'inpatient') {
      const d = daysBetween(policy.effectiveDate, claim.incidentDate);
      if (d >= 0 && d < MEDICAL_PRICING.waitingDays) findings.push({ id: fid('POL'), severity: 'warning', title: 'Treatment within the waiting period',
        detail: `Treatment ${d} day(s) after cover started; non-emergency treatment has a ${MEDICAL_PRICING.waitingDays}-day waiting period.`,
        evidence: [{ label: 'Cover start', value: policy.effectiveDate, source: policy.id }, { label: 'Treatment date', value: claim.incidentDate, source: claim.id }] });
      if (policy.medical?.preExisting) findings.push({ id: fid('POL'), severity: 'info', title: 'Member declared a pre-existing condition',
        detail: 'Check whether this treatment relates to the declared condition.', evidence: [{ label: 'Declaration', value: 'Pre-existing condition declared', source: policy.id }] });
    }

    const text = claim.description.toLowerCase();
    const exclusionsReviewed = rules.exclusions.map((e) => {
      const matched = e.keywords.find((k) => text.includes(k));
      return { code: e.code, label: e.label, triggered: !!matched, matched };
    });
    for (const e of exclusionsReviewed.filter((x) => x.triggered)) {
      findings.push({ id: fid('POL'), severity: 'warning', title: `Possible exclusion ${e.code}: ${e.label}`,
        detail: `Description mentions “${e.matched}”. This is a keyword match only and needs an adjuster's judgement.`,
        evidence: [{ label: 'Matched phrase', value: e.matched!, source: `${claim.id} description` }] });
    }
    trace.push(`Screened ${exclusionsReviewed.length} configured exclusions against the incident description.`);

    const reportingDays = daysBetween(claim.incidentDate, claim.reportedDate);
    const window = policy.product === 'travel' ? 30 : REPORTING_WINDOW_DAYS;
    const within = reportingDays <= window;
    if (!within) findings.push({ id: fid('POL'), severity: 'warning', title: `Reported outside the ${window}-day window`,
      detail: `Reported ${reportingDays} days after the incident.`, evidence: [{ label: 'Incident → reported', value: `${claim.incidentDate} → ${claim.reportedDate}`, source: claim.id }] });

    const est = docOf(claim, 'repair_estimate');
    const estTotal = est ? num(est.fields.total) : claim.estimatedDamage;
    if ((policy.coverage === 'comprehensive' || policy.product === 'home') && policy.sumInsured && estTotal > policy.sumInsured * 0.6) {
      findings.push({ id: fid('POL'), severity: 'warning', title: 'Repair cost near sum insured',
        detail: `Estimate is ${Math.round((estTotal / policy.sumInsured) * 100)}% of the sum insured; a total-loss assessment may apply.`,
        evidence: [{ label: 'Estimate', value: money(estTotal), source: est?.fileName ?? claim.id }, { label: 'Sum insured', value: money(policy.sumInsured), source: policy.id }] });
    }
    trace.push('Summarised limits, deductible and reporting conditions.');

    const observations = [
      `${active ? 'Policy was in force' : 'Policy was NOT in force'} on the incident date (${fmtDate(policy.effectiveDate)} – ${fmtDate(policy.expiryDate)}).`,
      `${claim.incidentType[0].toUpperCase() + claim.incidentType.slice(1)} is ${covered ? '' : 'not '}a covered incident under ${rules.label} cover.`,
      policy.product === 'motor'
        ? (policy.coverage === 'comprehensive' ? `Own-damage limit: sum insured ${money(policy.sumInsured)}; deductible ${money(policy.deductible)} applies per claim.` : 'Third-party policy: own-damage is excluded.')
        : policy.product === 'home' ? `Sum insured ${money(policy.sumInsured)}; deductible ${money(policy.deductible)} applies per claim.`
        : `${INCIDENT_LABEL[claim.incidentType]} limit: ${subLimit !== undefined ? money(subLimit) : 'not configured'}.`,
      ...(rules.thirdPartyLimit ? [`Liability limit ${money(rules.thirdPartyLimit)}.`] : []),
      `Reported ${reportingDays} day(s) after the incident (${within ? 'within' : 'outside'} the ${window}-day condition).`,
      exclusionsReviewed.some((e) => e.triggered) ? `Possible exclusion wording found: ${exclusionsReviewed.filter((e) => e.triggered).map((e) => e.code).join(', ')}.` : 'No configured exclusion wording found in the description.',
    ];
    return {
      output: { policyId: policy.id, coverageLabel: rules.label, activeOnIncidentDate: active, incidentCovered: covered, sumInsured: policy.sumInsured, deductible: policy.deductible, thirdPartyLimit: rules.thirdPartyLimit, reportingDays, withinReportingWindow: within, exclusionsReviewed, conditions: rules.conditions, observations },
      summary: `${active && covered ? 'In force and incident type covered' : 'Coverage concern'} · ${policy.product === 'motor' || policy.product === 'home' ? `deductible ${money(policy.deductible)}` : rules.limits?.[claim.incidentType] ? `limit ${money(rules.limits[claim.incidentType]!)}` : 'no deductible'} · ${exclusionsReviewed.filter((e) => e.triggered).length} possible exclusion(s).`,
      findings, trace,
    };
  },
};

/* ───────────────────────── 3. Claims Assessment ───────────────────────── */

export interface AssessmentOutput {
  completenessPct: number;
  claimedAmount: number;
  estimateTotal?: number;
  variancePct?: number;
  labourRate?: number;
  labourBenchmark: number;
  illustrativeNetOfDeductible?: number;
  outstandingQuestions: string[];
}

export const claimsAssessmentAgent: AgentDefinition<ClaimContext & { docIntel: DocIntelOutput }, AssessmentOutput> = {
  name: 'Claims Assessment Agent',
  task: ({ claim }) => `Assess completeness and estimate for ${claim.id}`,
  run({ claim, policy, docIntel }) {
    const trace: string[] = [];
    const findings: Finding[] = [];
    const completenessPct = Math.round(((docIntel.required.length - docIntel.missing.length) / docIntel.required.length) * 100);
    trace.push(`Completeness: ${docIntel.required.length - docIntel.missing.length}/${docIntel.required.length} required documents.`);
    const questions: string[] = [];
    for (const m of docIntel.missing) questions.push(`Please provide the ${DOC_LABELS[m].toLowerCase()}.`);

    const est = costDoc(claim);
    const costLabel = est?.type === 'invoice' ? 'invoice' : 'estimate';
    let estimateTotal: number | undefined, variancePct: number | undefined, labourRate: number | undefined;
    if (est) {
      estimateTotal = num(est.fields.total);
      variancePct = (estimateTotal - claim.estimatedDamage) / claim.estimatedDamage;
      if (Math.abs(variancePct) > ASSESSMENT.estimateVarianceWarnPct) {
        findings.push({ id: fid('ASM'), severity: 'warning', title: `${costLabel === 'invoice' ? 'Invoice' : 'Repair estimate'} ${variancePct > 0 ? 'exceeds' : 'is below'} claimed amount by ${Math.abs(Math.round(variancePct * 100))}%`,
          detail: `Customer claimed ${money(claim.estimatedDamage)}; ${costLabel} total is ${money(estimateTotal)}. Tolerance is ±${ASSESSMENT.estimateVarianceWarnPct * 100}%.`,
          evidence: [{ label: 'Claimed damage', value: money(claim.estimatedDamage), source: claim.id }, { label: costLabel === 'invoice' ? 'Invoice total' : 'Repair estimate', value: money(estimateTotal), source: est.fileName }, { label: 'Provider', value: String(est.fields.garage ?? est.fields.provider ?? claim.garage), source: est.fileName }] });
        questions.push(`Explain the difference between the claimed amount (${money(claim.estimatedDamage)}) and the ${costLabel} (${money(estimateTotal)}).`);
      }
      labourRate = est.fields.labourRate ? num(est.fields.labourRate) : undefined;
      const limit = ASSESSMENT.labourRateBenchmarkPerHour * (1 + ASSESSMENT.labourRateTolerancePct);
      if (labourRate !== undefined && labourRate > limit) {
        findings.push({ id: fid('ASM'), severity: 'warning', title: 'Labour rate above benchmark',
          detail: `${money(labourRate)}/hour vs demo benchmark ${money(ASSESSMENT.labourRateBenchmarkPerHour)}/hour (+${ASSESSMENT.labourRateTolerancePct * 100}% tolerance).`,
          evidence: [{ label: 'Labour', value: `${est.fields.labourHours}h × ${labourRate}`, source: est.fileName }, { label: 'Benchmark', value: `${ASSESSMENT.labourRateBenchmarkPerHour}/h`, source: 'Assessment rules' }] });
        questions.push('Ask the garage to justify the labour rate or obtain a second estimate.');
      }
    } else {
      questions.push('An itemised estimate or invoice is needed to assess the amount.');
    }
    trace.push('Compared the claimed amount with the itemised repair estimate and labour benchmark.');

    if (docIntel.inconsistencyCount > 0) questions.push('Clarify the document inconsistencies flagged by Document Intelligence.');
    const illustrativeNet = estimateTotal !== undefined && policy ? Math.max(0, estimateTotal - policy.deductible) : undefined;
    trace.push('Listed outstanding questions for the claims handler.');

    return {
      output: { completenessPct, claimedAmount: claim.estimatedDamage, estimateTotal, variancePct, labourRate, labourBenchmark: ASSESSMENT.labourRateBenchmarkPerHour, illustrativeNetOfDeductible: illustrativeNet, outstandingQuestions: questions },
      summary: `Completeness ${completenessPct}% · ${estimateTotal !== undefined ? `estimate ${money(estimateTotal)} vs claimed ${money(claim.estimatedDamage)}` : 'no estimate'} · ${questions.length} open question(s).`,
      findings, trace,
    };
  },
};

/* ───────────────────────── 4. Fraud Investigation Assistant ───────────────────────── */

export interface AnomalyIndicator {
  code: string;
  title: string;
  triggered: boolean;
  explanation: string;
}
export interface FraudOutput {
  indicators: AnomalyIndicator[];
  triggeredCount: number;
  furtherReviewSuggested: boolean;
  statement: string;
}

export const fraudInvestigationAssistant: AgentDefinition<ClaimContext, FraudOutput> = {
  name: 'Fraud Investigation Assistant',
  task: ({ claim }) => `Screen ${claim.id} for explainable anomalies`,
  run({ claim, policy, allClaims }) {
    const trace: string[] = [];
    const findings: Finding[] = [];
    const indicators: AnomalyIndicator[] = [];
    const R = ANOMALY_RULES;

    // A1 early claim
    if (policy) {
      const d = daysBetween(policy.effectiveDate, claim.incidentDate);
      const t = d >= 0 && d <= R.earlyClaimDays;
      indicators.push({ code: 'A1', title: 'Incident soon after policy inception', triggered: t, explanation: `${d} day(s) after inception (threshold ≤ ${R.earlyClaimDays}).` });
      if (t) findings.push({ id: fid('ANM'), severity: 'warning', title: 'Incident soon after policy inception', detail: `Incident occurred ${d} days after the policy started. Common for genuine claims too; noted for context only.`,
        evidence: [{ label: 'Policy effective', value: policy.effectiveDate, source: policy.id }, { label: 'Incident date', value: claim.incidentDate, source: claim.id }] });
    }
    // A2 repeat garage
    const others = allClaims.filter((c) => c.id !== claim.id && c.garage && c.garage === claim.garage && Math.abs(daysBetween(c.incidentDate, claim.incidentDate)) <= R.repeatGarageWindowDays);
    const a2 = others.length >= R.repeatGarageMinOtherClaims;
    indicators.push({ code: 'A2', title: 'Same repairer / provider across recent claims', triggered: a2, explanation: `${others.length} other claim(s) at “${claim.garage}” within ${R.repeatGarageWindowDays} days.` });
    if (a2) findings.push({ id: fid('ANM'), severity: 'warning', title: 'Same repairer appears in other recent claims', detail: `${claim.garage} appears in ${others.length} other unrelated claims within ${R.repeatGarageWindowDays} days.`,
      evidence: others.map((o) => ({ label: o.id, value: `${o.incidentDate} · ${money(o.estimatedDamage)}`, source: 'Synthetic claims register' })) });
    // A3 estimate above claimed
    const est = costDoc(claim);
    if (est) {
      const ratio = (num(est.fields.total) - claim.estimatedDamage) / claim.estimatedDamage;
      const t = ratio > R.estimateAboveClaimPct;
      indicators.push({ code: 'A3', title: 'Estimate materially above customer estimate', triggered: t, explanation: `${Math.round(ratio * 100)}% difference (threshold > ${R.estimateAboveClaimPct * 100}%).` });
      if (t) findings.push({ id: fid('ANM'), severity: 'warning', title: 'Supporting cost materially above the claimed amount', detail: `Cost document is ${Math.round(ratio * 100)}% higher than the amount the customer reported.`,
        evidence: [{ label: 'Customer', value: money(claim.estimatedDamage), source: claim.id }, { label: est.type === 'invoice' ? 'Invoice' : 'Estimate', value: money(num(est.fields.total)), source: est.fileName }] });
      const baseValue = policy?.vehicle?.value ?? (policy?.product === 'home' ? policy.sumInsured : 0);
      if (policy && baseValue) {
        const what = policy.product === 'home' ? 'sum insured' : 'vehicle value';
        const vr = num(est.fields.total) / baseValue;
        const t4 = vr > R.estimateToVehicleValuePct;
        indicators.push({ code: 'A4', title: `High cost relative to ${what}`, triggered: t4, explanation: `${Math.round(vr * 100)}% of ${what} (threshold > ${R.estimateToVehicleValuePct * 100}%).` });
        if (t4) findings.push({ id: fid('ANM'), severity: 'warning', title: `High cost relative to ${what}`, detail: `Cost equals ${Math.round(vr * 100)}% of the declared ${what}.`, evidence: [{ label: what, value: money(baseValue), source: policy.id }] });
      }
    }
    // A5 claim frequency
    const custClaims = allClaims.filter((c) => c.id !== claim.id && c.customerId === claim.customerId && Math.abs(daysBetween(c.incidentDate, claim.incidentDate)) <= R.customerClaimsWindowDays);
    const a5 = custClaims.length >= R.customerClaimsThreshold;
    indicators.push({ code: 'A5', title: 'Multiple claims by the same customer', triggered: a5, explanation: `${custClaims.length} other claim(s) in ${R.customerClaimsWindowDays} days.` });
    if (a5) findings.push({ id: fid('ANM'), severity: 'warning', title: 'Multiple recent claims by the same customer', detail: `${custClaims.length} other claims in the past year.`, evidence: custClaims.map((o) => ({ label: o.id, value: o.incidentDate, source: 'Synthetic claims register' })) });
    // A6 document date before incident (re-use doc evidence)
    const ph = docOf(claim, 'damage_photos');
    const a6 = !!(ph && ph.fields.capturedDate && String(ph.fields.capturedDate) < claim.incidentDate) || !!(est && est.fields.estimateDate && String(est.fields.estimateDate) < claim.incidentDate);
    indicators.push({ code: 'A6', title: 'Supporting evidence dated before incident', triggered: a6, explanation: a6 ? 'At least one document carries a date before the incident.' : 'All document dates on or after the incident.' });
    if (a6) findings.push({ id: fid('ANM'), severity: 'warning', title: 'Supporting evidence dated before the incident', detail: 'Could be a device-clock or data-entry error. Ask the customer to confirm.',
      evidence: [{ label: 'Photos captured', value: String(ph?.fields.capturedDate ?? 'n/a'), source: ph?.fileName ?? '—' }, { label: 'Incident date', value: claim.incidentDate, source: claim.id }] });

    trace.push(`Evaluated ${indicators.length} configured anomaly indicators against synthetic records.`);
    const triggeredCount = indicators.filter((i) => i.triggered).length;
    const furtherReviewSuggested = triggeredCount >= R.indicatorsForReferral;
    trace.push(furtherReviewSuggested ? `${triggeredCount} indicators triggered: further investigation suggested.` : `${triggeredCount} indicator(s) triggered: below referral threshold.`);
    const statement = 'Indicators are statistical prompts for a human investigator, not conclusions. No person or claim has been labelled fraudulent.';
    return {
      output: { indicators, triggeredCount, furtherReviewSuggested, statement },
      summary: `${triggeredCount} of ${indicators.length} indicators triggered${furtherReviewSuggested ? ' — further investigation recommended' : ''}.`,
      findings, trace,
    };
  },
};

/* ───────────────────────── 5. Supervisor ───────────────────────── */

export interface SupervisorInput extends ClaimContext {
  docIntel: { output: DocIntelOutput; findings: Finding[] };
  policyIntel: { output: PolicyIntelOutput; findings: Finding[] };
  assessment: { output: AssessmentOutput; findings: Finding[] };
  fraud: { output: FraudOutput; findings: Finding[] };
}

export const supervisorAgent: AgentDefinition<SupervisorInput, InvestigationReport> = {
  name: 'Supervisor Agent',
  task: ({ claim }) => `Consolidate findings and route ${claim.id} to human review`,
  run({ claim, policy, docIntel, policyIntel, assessment, fraud }) {
    const trace: string[] = ['Collected outputs from four specialist agents.'];
    const missing = docIntel.output.missing;
    const inconsistencies = [...docIntel.findings.filter((f) => !f.title.startsWith('Missing')), ...assessment.findings, ...policyIntel.findings];
    const anomalies = fraud.findings;
    const critical = [...inconsistencies, ...anomalies].some((f) => f.severity === 'critical');

    let recommendation: Recommendation;
    if (missing.length) {
      recommendation = { code: 'REQUEST_DOCUMENTS', label: `Request missing documents: ${missing.map((m) => DOC_LABELS[m].toLowerCase()).join(', ')}`,
        rationale: 'The claim cannot be assessed reliably until required documents are on file. Re-run the investigation once received.', nextOwner: 'Claims Handler' };
    } else if (fraud.output.furtherReviewSuggested || critical) {
      recommendation = { code: 'REFER_SENIOR_REVIEW', label: 'Refer to senior claims reviewer for further investigation',
        rationale: `${fraud.output.triggeredCount} anomaly indicator(s)${critical ? ' and at least one critical inconsistency' : ''} warrant a human investigator's review before any assessment proceeds.`, nextOwner: 'Senior Claims Reviewer' };
    } else if (assessment.findings.length) {
      const insp = { motor: ['Arrange an independent vehicle inspection', 'Independent Surveyor'], home: ['Arrange a loss adjuster visit', 'Loss Adjuster'], medical: ['Refer for medical review by a claims doctor', 'Medical Claims Reviewer'], travel: ['Verify costs with the provider or airline', 'Travel Assistance Team'] }[policy?.product ?? 'motor'];
      recommendation = { code: 'INDEPENDENT_INSPECTION', label: insp[0],
        rationale: 'The supporting costs differ from expectations or a sub-limit applies; an independent review should validate them.', nextOwner: insp[1] };
    } else {
      recommendation = { code: 'STANDARD_ADJUSTER', label: 'Proceed to standard adjuster assessment',
        rationale: 'Documents are complete and consistent, and no anomaly thresholds were met.', nextOwner: `${{ motor: 'Motor', home: 'Property', medical: 'Medical', travel: 'Travel' }[policy?.product ?? 'motor']} Claims Adjuster` };
    }
    trace.push(`Selected next operational step: ${recommendation.code}.`);

    const uncertainty: string[] = [];
    if (missing.length) uncertainty.push(`Findings are provisional: ${missing.length} required document(s) not yet reviewed.`);
    if (policyIntel.output.exclusionsReviewed.some((e) => e.triggered)) uncertainty.push('Exclusion screening uses keyword matching; wording needs human interpretation.');
    if (docIntel.findings.some((f) => f.title.includes('before'))) uncertainty.push('Date discrepancies may come from device clocks or data entry rather than the incident itself.');
    uncertainty.push('Simulated agents applied configured rules only; no external databases, images or third-party sources were consulted.');
    trace.push('Flagged uncertainty and missing evidence.');

    const confidence: InvestigationReport['confidence'] = missing.length || critical ? 'Low' : inconsistencies.length + anomalies.length > 1 ? 'Medium' : 'High';
    const report: InvestigationReport = {
      claimSummary: `${claim.id}: ${INCIDENT_LABEL[claim.incidentType]} on ${fmtDate(claim.incidentDate)} at ${claim.location}. ${claim.vehiclePlate ? `Vehicle ${claim.vehiclePlate}` : INCIDENT_LABEL[claim.incidentType]} under ${policy?.id ?? claim.policyId}. Customer-estimated damage ${money(claim.estimatedDamage)}${assessment.output.estimateTotal !== undefined ? `; supporting cost ${money(assessment.output.estimateTotal)} (${claim.garage})` : ''}.`,
      documentsReviewed: docIntel.output.extracted.map((e) => ({ type: e.type, fileName: e.fileName, keyFields: Object.entries(e.fields).slice(0, 4).map(([k, v]) => `${k}: ${v}`).join(' · ') })),
      coverageObservations: policyIntel.output.observations,
      missingDocuments: missing,
      inconsistencies,
      anomalies,
      outstandingQuestions: assessment.output.outstandingQuestions,
      uncertainty,
      recommendation,
      confidence,
    };
    trace.push('Produced structured investigation report and routed the case to human review.');
    return {
      output: report,
      summary: `Recommend: ${recommendation.label}. Confidence ${confidence}. Routed to human review.`,
      findings: [], trace,
    };
  },
};

export const CLAIM_PIPELINE = [
  documentIntelligenceAgent.name,
  policyIntelligenceAgent.name,
  claimsAssessmentAgent.name,
  fraudInvestigationAssistant.name,
  supervisorAgent.name,
] as const;
