// Fictional synthetic dataset. Dates are relative to "today" so the demo stays current.
import { priceHome, priceMedical, priceMotor, priceTravel } from '../agents/pricing';
import { runPipelineSync } from '../agents/claimsPipeline';
import { resetFindingSeq } from '../agents/runtime';
import { addDays, daysFromToday, stampDaysAgo, todayISO } from '../lib/format';
import type {
  AddOn, AgentRun, AuditEvent, Claim, CoverageType, Customer, DemoState, DriverProfile, Policy, Quote, Vehicle,
} from '../types';
import { makeSampleDoc, type DocSeedContext } from './sampleDocs';

export const DATA_VERSION = 6;
export const AL_NOOR = 'Al Noor Rapid Auto Body (fictional)';

const yearNow = () => Number(todayISO().slice(0, 4));

function mkQuote(id: string, customer: Customer, vehicle: Vehicle, driver: DriverProfile, coverage: CoverageType, deductible: number, addOns: AddOn[], createdDaysAgo: number, status: Quote['status'], policyId?: string): Quote {
  const priced = priceMotor({ vehicle, driver, coverage, deductible, addOns, city: customer.city, currentYear: yearNow() });
  return {
    id, customerId: customer.id, product: 'motor', subject: `${vehicle.year} ${vehicle.make} ${vehicle.model}`, vehicle, driver, sumInsured: coverage === 'comprehensive' ? vehicle.value : 0, coverage, deductible, addOns,
    premium: priced.breakdown, assumptions: priced.assumptions, missingInfo: [], status,
    createdAt: stampDaysAgo(createdDaysAgo), validUntil: daysFromToday(-createdDaysAgo + 30), policyId,
  };
}

function mkPolicy(id: string, q: Quote, effectiveDaysAgo: number): Policy {
  const eff = daysFromToday(-effectiveDaysAgo);
  return {
    id, quoteId: q.id, customerId: q.customerId, product: q.product, subject: q.subject, vehicle: q.vehicle, travel: q.travel, medical: q.medical, home: q.home, coverage: q.coverage,
    sumInsured: q.sumInsured ?? 0, deductible: q.deductible, addOns: q.addOns,
    annualPremium: q.premium.total, effectiveDate: q.travel ? q.travel.startDate : eff, expiryDate: q.travel ? q.travel.endDate : addDays(addDays(eff, 365), -1), status: 'active',
    createdAt: stampDaysAgo(effectiveDaysAgo), isDemo: true,
  };
}

export function buildSeed(): DemoState {
  resetFindingSeq();
  const customers: Customer[] = [
    { id: 'CUS-1001', name: 'Daniel Okafor', email: 'daniel.okafor@example.test', phone: '+966 55 010 1001', dateOfBirth: '1986-04-12', city: 'Riyadh', address: '14 Palm Grove St, Al Olaya, Riyadh', nationalIdMasked: '•••• •• 4417', createdAt: stampDaysAgo(345) },
    { id: 'CUS-1002', name: 'Priya Raman', email: 'priya.raman@example.test', phone: '+966 55 010 1002', dateOfBirth: '1991-09-03', city: 'Jeddah', address: '7 Corniche View, Al Shati, Jeddah', nationalIdMasked: '•••• •• 9021', createdAt: stampDaysAgo(205) },
    { id: 'CUS-1003', name: 'Layla Mansour', email: 'layla.mansour@example.test', phone: '+966 55 010 1003', dateOfBirth: '1995-01-22', city: 'Riyadh', address: '22 Garden Ring Rd, Al Malqa, Riyadh', nationalIdMasked: '•••• •• 3380', createdAt: stampDaysAgo(55) },
    { id: 'CUS-1004', name: 'Omar Haddad', email: 'omar.haddad@example.test', phone: '+966 55 010 1004', dateOfBirth: '1999-07-15', city: 'Dammam', createdAt: stampDaysAgo(3) },
  ];
  const [daniel, priya, layla, omar] = customers;

  const q1 = mkQuote('QTE-2026-0001', daniel, { make: 'Hyundai', model: 'Tucson', year: 2021, value: 78000, plate: 'DKR 1150', vin: 'KMHJ381ABMU104411', usage: 'private' }, { age: 40, licenseYears: 18, claimsLast3Years: 0 }, 'comprehensive', 1000, ['roadside'], 342, 'converted', 'POL-2026-0001');
  const q2 = mkQuote('QTE-2026-0002', priya, { make: 'Nissan', model: 'Patrol', year: 2022, value: 145000, plate: 'PRM 7730', vin: 'JN8AY2NY9N9174520', usage: 'private' }, { age: 35, licenseYears: 12, claimsLast3Years: 0 }, 'comprehensive', 1000, ['roadside', 'agency_repair'], 202, 'converted', 'POL-2026-0002');
  const q3 = mkQuote('QTE-2026-0003', layla, { make: 'Toyota', model: 'Camry', year: 2023, value: 92000, plate: 'RTA 4821', vin: '4T1B11HK5PU802215', usage: 'private' }, { age: 31, licenseYears: 6, claimsLast3Years: 0 }, 'comprehensive', 500, ['roadside', 'rental_car'], 52, 'converted', 'POL-2026-0003');
  const q4 = mkQuote('QTE-2026-0004', omar, { make: 'Kia', model: 'Sportage', year: 2020, value: 61000, usage: 'private' }, { age: 27, licenseYears: 4, claimsLast3Years: 1 }, 'comprehensive', 1000, ['roadside'], 3, 'quoted');
  q4.missingInfo = ['Plate number (required before policy issue)', 'VIN / chassis number (required before policy issue)'];
  // Medical, home and travel portfolio
  const medical = { members: [{ name: 'Priya Raman', age: 35, relation: 'self' as const }, { name: 'Arjun Raman', age: 8, relation: 'child' as const }, { name: 'Meera Raman', age: 5, relation: 'child' as const }], preExisting: false, network: 'Extended' as const, declarationConfirmed: true };
  const mp = priceMedical(medical, 'medical_plus');
  const q5: Quote = { id: 'QTE-2026-0005', customerId: priya.id, product: 'medical', subject: 'Medical Plus · 3 member(s)', medical, sumInsured: 1_000_000, coverage: 'medical_plus', deductible: 0, addOns: [], premium: mp.breakdown, assumptions: mp.assumptions, missingInfo: [], status: 'converted', createdAt: stampDaysAgo(122), validUntil: daysFromToday(-92), policyId: 'POL-2026-0004' };
  const home = { propertyType: 'villa' as const, ownership: 'owner' as const, address: '14 Palm Grove St, Al Olaya, Riyadh', buildingValue: 1_800_000, contentsValue: 350_000, valuablesValue: 40_000, alarm: true, floodZone: false };
  const hp = priceHome(home, 'home_combined', 1000);
  const q6: Quote = { id: 'QTE-2026-0006', customerId: daniel.id, product: 'home', subject: 'Villa · Al Olaya, Riyadh', home, sumInsured: 2_150_000, coverage: 'home_combined', deductible: 1000, addOns: [], premium: hp.breakdown, assumptions: hp.assumptions, missingInfo: [], status: 'converted', createdAt: stampDaysAgo(202), validUntil: daysFromToday(-172), policyId: 'POL-2026-0005' };
  const travel = { tripType: 'single' as const, region: 'worldwide_ex_us' as const, destination: 'Italy and France', startDate: daysFromToday(-20), endDate: daysFromToday(5), travellers: [{ name: 'Layla Mansour', age: 31 }], passportNo: 'R7741029' };
  const tp = priceTravel(travel, true);
  const q7: Quote = { id: 'QTE-2026-0007', customerId: layla.id, product: 'travel', subject: 'Single trip · Italy and France · 1 traveller(s)', travel, sumInsured: 1_000_000, coverage: 'travel_plus', deductible: 0, addOns: [], premium: tp.breakdown, assumptions: tp.assumptions, missingInfo: [], status: 'converted', createdAt: stampDaysAgo(24), validUntil: daysFromToday(6), policyId: 'POL-2026-0006' };
  const quotes = [q1, q2, q3, q4, q5, q6, q7];

  const p1 = mkPolicy('POL-2026-0001', q1, 340); // renews in ~25 days
  const p2 = mkPolicy('POL-2026-0002', q2, 200);
  const p3 = mkPolicy('POL-2026-0003', q3, 50);
  const p4 = mkPolicy('POL-2026-0004', q5, 120);
  const p5 = mkPolicy('POL-2026-0005', q6, 200);
  const p6 = mkPolicy('POL-2026-0006', q7, 20);
  const policies = [p1, p2, p3, p4, p5, p6];

  const ctx = (claimRef: string, c: Customer, p: Policy, incidentAgo: number, reportedAgo: number, dmg: number, garage: string, description: string): DocSeedContext => ({
    claimRef, incidentDate: daysFromToday(-incidentAgo), reportedDate: daysFromToday(-reportedAgo), plate: p.vehicle?.plate, holder: c.name,
    estimatedDamage: dmg, garage, description, uploadedAt: stampDaysAgo(reportedAgo, 20),
  });

  const mkClaim = (id: string, c: Customer, p: Policy, d: DocSeedContext, incidentType: Claim['incidentType'], location: string, docs: Claim['documents']): Claim => ({
    id, policyId: p.id, customerId: c.id, incidentType, incidentDate: d.incidentDate, reportedDate: d.reportedDate, location,
    description: d.description, product: p.product, vehiclePlate: d.plate, estimatedDamage: d.estimatedDamage, garage: d.garage, documents: docs,
    status: 'registered', statusHistory: [{ status: 'registered', at: d.uploadedAt, by: c.name, note: 'Claim submitted via customer portal' }],
    investigations: [], createdAt: d.uploadedAt,
  });

  // CLM-0101 · Daniel · clean collision, assessment completed
  const d1 = ctx('CLM-2026-0101', daniel, p1, 120, 118, 6800, AL_NOOR, 'Side-swiped while parked outside an office building; front-left door and wing mirror damaged.');
  const c1 = mkClaim('CLM-2026-0101', daniel, p1, d1, 'collision', 'Al Olaya, Riyadh', [
    makeSampleDoc('claim_form', d1, { id: 'DOC-0101-1' }),
    makeSampleDoc('police_report', d1, { id: 'DOC-0101-2' }),
    makeSampleDoc('repair_estimate', d1, { id: 'DOC-0101-3', estimate: { partsTotal: 3600, labourHours: 12, labourRate: 170, paintTotal: 1160 } }),
    makeSampleDoc('damage_photos', d1, { id: 'DOC-0101-4' }),
    makeSampleDoc('driver_license', d1, { id: 'DOC-0101-5' }),
  ]);

  // CLM-0102 · Priya · labour rate above benchmark, awaiting human review
  const d2 = ctx('CLM-2026-0102', priya, p2, 40, 37, 9500, AL_NOOR, 'Low-speed collision in a mall car park; rear bumper and parking sensors damaged.');
  const c2 = mkClaim('CLM-2026-0102', priya, p2, d2, 'collision', 'Red Sea Mall car park, Jeddah', [
    makeSampleDoc('claim_form', d2, { id: 'DOC-0102-1' }),
    makeSampleDoc('police_report', d2, { id: 'DOC-0102-2' }),
    makeSampleDoc('repair_estimate', d2, { id: 'DOC-0102-3', estimate: { partsTotal: 5200, labourHours: 16, labourRate: 240, paintTotal: 760 } }),
    makeSampleDoc('damage_photos', d2, { id: 'DOC-0102-4' }),
    makeSampleDoc('driver_license', d2, { id: 'DOC-0102-5' }),
  ]);

  // CLM-0103 · Layla · READY-TO-RUN SCENARIO: police report missing, estimate 47% above claim,
  // labour rate above benchmark, photos dated a day before the incident, repeat repairer, early claim.
  const d3 = ctx('CLM-2026-0103', layla, p3, 10, 8, 12500, AL_NOOR, 'Rear-ended while stopped at a traffic signal. Rear bumper, boot lid and both tail lamps damaged. The other driver shared contact details at the scene.');
  const c3 = mkClaim('CLM-2026-0103', layla, p3, d3, 'collision', 'Northern Ring Rd, Riyadh', [
    makeSampleDoc('claim_form', d3, { id: 'DOC-0103-1' }),
    makeSampleDoc('repair_estimate', d3, { id: 'DOC-0103-2', estimate: { partsTotal: 9200, labourHours: 22, labourRate: 260, paintTotal: 3480 } }),
    makeSampleDoc('damage_photos', d3, { id: 'DOC-0103-3', photosDate: daysFromToday(-11) }),
    makeSampleDoc('driver_license', d3, { id: 'DOC-0103-4' }),
  ]);

  // CLM-0104 · Priya · glass claim missing photos → documents requested
  const d4 = ctx('CLM-2026-0104', priya, p2, 6, 5, 1450, 'Gulf Glass Centre (fictional)', 'Windscreen cracked by a stone thrown up from a lorry on the highway.');
  const c4 = mkClaim('CLM-2026-0104', priya, p2, d4, 'glass', 'Haramain Highway, Jeddah', [
    makeSampleDoc('claim_form', d4, { id: 'DOC-0104-1' }),
    makeSampleDoc('repair_estimate', d4, { id: 'DOC-0104-2', estimate: { partsTotal: 1100, labourHours: 2, labourRate: 175, paintTotal: 0, total: 1450 } }),
  ]);
  // fix estimate paint for the glass claim (no paint work)
  c4.documents[1].fields.paintTotal = 0;

  // CLM-0105 · Priya · MEDICAL outpatient: invoice 43% above the amount claimed
  const d5 = ctx('CLM-2026-0105', priya, p4, 6, 4, 1850, 'Corniche Family Clinic (fictional)', 'Paediatric visit for Arjun: high fever and ear infection; consultation, blood tests and antibiotics.');
  const c5 = mkClaim('CLM-2026-0105', priya, p4, d5, 'outpatient', 'Corniche Family Clinic, Jeddah', [
    makeSampleDoc('claim_form', d5, { id: 'DOC-0105-1' }),
    makeSampleDoc('medical_report', d5, { id: 'DOC-0105-2' }),
    makeSampleDoc('invoice', d5, { id: 'DOC-0105-3', invoiceTotal: 2640 }),
  ]);
  // CLM-0106 · Daniel · HOME water damage: photos missing, estimate above claim, labour above benchmark, “flooded” wording
  const d6 = ctx('CLM-2026-0106', daniel, p5, 9, 7, 28000, 'Gulf Home Repairs (fictional)', 'A pipe burst under the kitchen sink overnight and flooded the kitchen and dining area; cabinets and flooring were damaged.');
  const c6 = mkClaim('CLM-2026-0106', daniel, p5, d6, 'water_damage', 'Home, Al Olaya, Riyadh', [
    makeSampleDoc('claim_form', d6, { id: 'DOC-0106-1' }),
    makeSampleDoc('repair_estimate', d6, { id: 'DOC-0106-2', estimate: { partsTotal: 18000, labourHours: 60, labourRate: 220, paintTotal: 4800 } }),
  ]);
  // CLM-0107 · Layla · TRAVEL delayed baggage: airline baggage report (PIR) missing
  const d7 = ctx('CLM-2026-0107', layla, p6, 12, 3, 2400, 'Fictional Air', 'My checked suitcase did not arrive in Rome and was delivered four days later with a broken handle. I bought replacement clothes and toiletries.');
  const c7 = mkClaim('CLM-2026-0107', layla, p6, d7, 'baggage_loss', 'Rome Fiumicino Airport', [
    makeSampleDoc('claim_form', d7, { id: 'DOC-0107-1' }),
    makeSampleDoc('boarding_pass', d7, { id: 'DOC-0107-2' }),
    makeSampleDoc('invoice', d7, { id: 'DOC-0107-3' }),
  ]);

  const claims = [c1, c2, c3, c4, c5, c6, c7];
  const audit: AuditEvent[] = [];
  const agentRuns: AgentRun[] = [];
  let auditSeq = 0, runSeq = 0;
  const log = (at: string, actor: string, actorType: AuditEvent['actorType'], action: string, entityType: AuditEvent['entityType'], entityId: string, detail: string) =>
    audit.push({ id: `AUD-${String(++auditSeq).padStart(5, '0')}`, at, actor, actorType, action, entityType, entityId, detail });

  // Historical lifecycle events
  for (const q of quotes) {
    const c = customers.find((x) => x.id === q.customerId)!;
    log(q.createdAt, 'Quote Agent', 'agent', 'Quote generated', 'quote', q.id, `${q.product} · ${q.subject} · ${q.premium.total.toFixed(2)} incl. VAT for ${c.name}`);
    agentRuns.push({ id: `RUN-${++runSeq}`, agent: 'Quote Agent', task: `Price ${q.product} quote for ${c.name}`, entityId: q.id, status: 'completed', startedAt: q.createdAt, completedAt: q.createdAt, outputSummary: `Premium ${q.premium.total.toFixed(2)} incl. VAT` });
  }
  for (const p of policies) {
    log(p.createdAt, 'Policy Agent', 'agent', 'Demo policy created', 'policy', p.id, `From ${p.quoteId}; term ${p.effectiveDate} → ${p.expiryDate}`);
    agentRuns.push({ id: `RUN-${++runSeq}`, agent: 'Policy Agent', task: `Prepare demo policy from quote ${p.quoteId}`, entityId: p.id, status: 'completed', startedAt: p.createdAt, completedAt: p.createdAt, outputSummary: `Issued ${p.id}` });
  }
  for (const c of claims) {
    const cust = customers.find((x) => x.id === c.customerId)!;
    log(c.createdAt, cust.name, 'customer', 'Claim registered', 'claim', c.id, `${c.incidentType} · ${c.documents.length} document(s) attached`);
  }

  const approvals: DemoState['approvals'] = [];
  const documentRequests: DemoState['documentRequests'] = [];

  // Seeded investigations (run through the same agents, with history-appropriate data)
  const investigate = (claim: Claim, daysAgo: number, runId: string) => {
    const history = claims.filter((x) => x.id !== claim.id && x.incidentDate <= claim.incidentDate);
    const policy = policies.find((p) => p.id === claim.policyId);
    const customer = customers.find((c) => c.id === claim.customerId);
    const { steps, report } = runPipelineSync({ claim, policy, customer, allClaims: history }, (i) => [stampDaysAgo(daysAgo, 60 + i), stampDaysAgo(daysAgo, 61 + i)]);
    claim.investigations.push({ runId, status: 'completed', startedAt: stampDaysAgo(daysAgo, 60), completedAt: stampDaysAgo(daysAgo, 65), engine: 'simulated', steps, report });
    claim.statusHistory.push({ status: 'under_investigation', at: stampDaysAgo(daysAgo, 60), by: 'Supervisor Agent', note: 'Agentic investigation started' });
    claim.statusHistory.push({ status: 'awaiting_review', at: stampDaysAgo(daysAgo, 65), by: 'Supervisor Agent', note: `Recommended: ${report.recommendation.label}` });
    log(stampDaysAgo(daysAgo, 60), 'Claims Operations', 'human', 'Investigation started', 'claim', claim.id, `Run ${runId} · simulated agents`);
    steps.forEach((s) => {
      agentRuns.push({ id: `RUN-${++runSeq}`, agent: s.agent, task: s.task, entityId: claim.id, status: 'completed', startedAt: s.startedAt!, completedAt: s.completedAt, outputSummary: s.outputSummary });
      log(s.completedAt!, s.agent, 'agent', 'Agent step completed', 'claim', claim.id, s.outputSummary ?? '');
    });
    const appr = { id: `APR-${claim.id.slice(-4)}-1`, claimId: claim.id, investigationRunId: runId, recommendation: report.recommendation, status: 'pending' as const, createdAt: stampDaysAgo(daysAgo, 65) };
    approvals.push(appr);
    log(stampDaysAgo(daysAgo, 65), 'Supervisor Agent', 'agent', 'Routed to human review', 'approval', appr.id, report.recommendation.label);
    return appr;
  };

  // c1: approved, assessment completed
  const a1 = investigate(c1, 117, 'INV-0101-1');
  Object.assign(a1, { status: 'approved', decidedAt: stampDaysAgo(116), decidedBy: 'Aisha Karim · Claims Supervisor', notes: 'Documents complete. Hand over to adjuster.' });
  c1.status = 'assessment_completed';
  c1.statusHistory.push({ status: 'assessment_completed', at: stampDaysAgo(116), by: 'Aisha Karim · Claims Supervisor', note: 'Investigation assessment complete; handed to Motor Claims Adjuster. No coverage or payment decision recorded in this demo.' });
  log(stampDaysAgo(116), 'Aisha Karim · Claims Supervisor', 'human', 'Approved recommended next step', 'approval', a1.id, a1.recommendation.label);

  // c2: pending human review
  investigate(c2, 36, 'INV-0102-1');
  c2.status = 'awaiting_review';

  // c4: documents requested
  const a4 = investigate(c4, 4, 'INV-0104-1');
  Object.assign(a4, { status: 'approved', decidedAt: stampDaysAgo(4, 90), decidedBy: 'Aisha Karim · Claims Supervisor', notes: 'Photos needed before a glass repair can be authorised.' });
  c4.status = 'docs_required';
  c4.statusHistory.push({ status: 'docs_required', at: stampDaysAgo(4, 90), by: 'Aisha Karim · Claims Supervisor', note: 'Requested: damage photos' });
  documentRequests.push({ id: 'REQ-0104-1', claimId: c4.id, documents: ['damage_photos'], status: 'open', requestedAt: stampDaysAgo(4, 90), message: 'Please upload clear photos of the damaged windscreen, including a close-up of the crack and a photo showing the plate.' });
  log(stampDaysAgo(4, 90), 'Aisha Karim · Claims Supervisor', 'human', 'Requested missing documents', 'claim', c4.id, 'Damage photos');

  log(stampDaysAgo(1), 'Daniel Okafor', 'customer', 'Service request submitted', 'policy', 'POL-2026-0001', 'SRV-0001 · add driver Grace Okafor (23, licensed 1 year)');
  log(stampDaysAgo(0, -600), 'System', 'system', 'Demo dataset loaded', 'system', 'DEMO', 'Synthetic records initialised');

  audit.sort((a, b) => a.at.localeCompare(b.at));
  agentRuns.sort((a, b) => a.startedAt.localeCompare(b.startedAt));

  return {
    version: DATA_VERSION,
    customers, quotes, policies, claims, approvals, documentRequests,
    renewals: [], tasks: [], audit, agentRuns, orchestratorRuns: [],
    serviceRequests: [{ id: 'SRV-0001', policyId: 'POL-2026-0001', customerId: 'CUS-1001', type: 'add_driver', details: { driverName: 'Grace Okafor', driverAge: '23', licenseYears: '1' }, channel: 'portal', status: 'submitted', createdAt: stampDaysAgo(1) }],
    communications: [],
    counters: { quote: 7, policy: 6, claim: 107, customer: 1004, audit: auditSeq, run: runSeq, renewal: 0, task: 0, approval: 0, request: 0, investigation: 0, orchestrator: 0, service: 1, comm: 0 },
  };
}
