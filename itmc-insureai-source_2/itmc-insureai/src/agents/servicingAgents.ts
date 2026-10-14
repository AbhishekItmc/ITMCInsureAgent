// Policy Servicing Agent and Customer Communications Agent.
// Deterministic rules: low-risk endorsements can be applied automatically; anything that changes
// premium materially or ends cover goes to a person. Communications are always drafts.
import { MEDICAL_PRICING, PRICING, TRAVEL_PRICING, VAT_RATE } from '../config/rules';
import { daysBetween, fmtDate, money, round2, todayISO } from '../lib/format';
import type { Communication, Customer, DocumentRequest, Policy, Product, Quote, ServiceAssessment, ServiceRequest } from '../types';
import { DOC_LABELS } from '../config/rules';
import type { AgentDefinition } from './runtime';

export const SERVICE_LABEL: Record<ServiceRequest['type'], string> = {
  address_change: 'Address change',
  add_driver: 'Add a named driver',
  vehicle_change: 'Change of vehicle',
  add_member: 'Add a family member',
  sum_insured_change: 'Change sum insured',
  trip_extension: 'Extend my trip',
  cancellation: 'Policy cancellation',
};

/** Which change types each product supports. */
export const SERVICE_TYPES_BY_PRODUCT: Record<Product, ServiceRequest['type'][]> = {
  motor: ['address_change', 'add_driver', 'vehicle_change', 'cancellation'],
  travel: ['trip_extension', 'address_change', 'cancellation'],
  medical: ['add_member', 'address_change', 'cancellation'],
  home: ['sum_insured_change', 'address_change', 'cancellation'],
};

export const SERVICE_RULES = {
  autoApplyMaxPremiumDelta: 150,
  youngDriverAge: 25,
  youngDriverLoading: 0.35,
  newLicenceYears: 2,
  newLicenceLoading: 0.2,
  standardDriverLoading: 0.05,
  cancellationFee: 150,
};

const netOf = (p: Policy) => round2(p.annualPremium / (1 + VAT_RATE));
const remainingShare = (p: Policy) => Math.max(0, Math.min(1, daysBetween(todayISO(), p.expiryDate) / 365));

export interface ServicingInput { request: ServiceRequest; policy: Policy | undefined; customer: Customer | undefined }

export const policyServicingAgent: AgentDefinition<ServicingInput, ServiceAssessment> = {
  name: 'Policy Servicing Agent',
  task: ({ request }) => `${SERVICE_LABEL[request.type]} on ${request.policyId}`,
  run({ request, policy, customer }) {
    const trace: string[] = [`Retrieved ${request.policyId} and request ${request.id}.`];
    const checks: ServiceAssessment['checks'] = [];
    if (!policy || !customer) {
      return { output: { summary: 'Policy not found.', risk: 'high', checks: [{ label: 'Policy found', ok: false, detail: request.policyId }], premiumDelta: 0, autoApply: false, recommendation: 'Reject: policy not found.' }, summary: 'Policy not found.', findings: [], trace };
    }
    const active = policy.status === 'active' && policy.expiryDate >= todayISO();
    checks.push({ label: 'Policy in force', ok: active, detail: `${fmtDate(policy.effectiveDate)} – ${fmtDate(policy.expiryDate)}` });
    checks.push({ label: 'Requester is the policyholder', ok: request.customerId === policy.customerId, detail: customer.name });
    const supported = SERVICE_TYPES_BY_PRODUCT[policy.product].includes(request.type);
    checks.push({ label: 'Change applies to this product', ok: supported, detail: `${SERVICE_LABEL[request.type]} on a ${policy.product} policy` });
    const share = remainingShare(policy);
    const net = netOf(policy);
    let delta = 0;
    let risk: ServiceAssessment['risk'] = 'low';
    let summary = '';
    const d = request.details;

    switch (request.type) {
      case 'address_change': {
        const ok = (d.newAddress ?? '').trim().length >= 8;
        checks.push({ label: 'New address complete', ok, detail: d.newAddress || 'missing' });
        summary = `Update policyholder address to “${d.newAddress}”. No rating impact in the demo tariff.`;
        trace.push('Address changes do not affect the demo tariff.');
        if (!ok) risk = 'medium';
        break;
      }
      case 'add_driver': {
        const age = Number(d.driverAge), lic = Number(d.licenseYears);
        const valid = age >= PRICING.driverAge.min && age <= PRICING.driverAge.max && lic >= 0 && lic <= age - 16;
        checks.push({ label: 'Driver details valid', ok: valid, detail: `${d.driverName || 'Unnamed'}, age ${d.driverAge}, licensed ${d.licenseYears} yr` });
        let loading = SERVICE_RULES.standardDriverLoading;
        const reasons = ['standard additional driver +5%'];
        if (age < SERVICE_RULES.youngDriverAge) { loading += SERVICE_RULES.youngDriverLoading; reasons.push(`driver under ${SERVICE_RULES.youngDriverAge} +35%`); }
        if (lic < SERVICE_RULES.newLicenceYears) { loading += SERVICE_RULES.newLicenceLoading; reasons.push(`licence under ${SERVICE_RULES.newLicenceYears} years +20%`); }
        delta = round2(net * loading * share * (1 + VAT_RATE));
        risk = loading > 0.3 ? 'high' : loading > 0.1 ? 'medium' : 'low';
        if (!valid) risk = 'high';
        summary = `Add ${d.driverName} as a named driver. Loading ${Math.round(loading * 100)}% (${reasons.join(', ')}), pro-rated for ${Math.round(share * 100)}% of the term remaining.`;
        trace.push(`Applied driver loading rules: ${reasons.join('; ')}.`);
        break;
      }
      case 'vehicle_change': {
        const value = Number(d.newValue), year = Number(d.newYear);
        const valid = value >= PRICING.vehicleValue.min && value <= PRICING.vehicleValue.max && year >= 2000;
        checks.push({ label: 'New vehicle details valid', ok: valid, detail: `${d.newYear} ${d.newMakeModel}, value ${money(value || 0)}` });
        const ratio = policy.coverage === 'comprehensive' && policy.vehicle?.value ? value / policy.vehicle.value : 1;
        delta = round2(net * (ratio - 1) * share * (1 + VAT_RATE));
        risk = Math.abs(ratio - 1) > 0.3 || !valid ? 'high' : 'medium';
        summary = `Replace insured vehicle with ${d.newYear} ${d.newMakeModel} (${money(value || 0)}). Sum insured changes by ${Math.round((ratio - 1) * 100)}%; premium adjusted pro-rata.`;
        trace.push('Re-rated sum insured against the current vehicle value and pro-rated for the remaining term.');
        checks.push({ label: 'Pre-cover inspection', ok: false, detail: 'Required before a vehicle change takes effect' });
        break;
      }
      case 'add_member': {
        const age = Number(d.memberAge);
        const valid = age >= 0 && age <= 75 && (d.memberName ?? '').trim().length > 1;
        checks.push({ label: 'Member details valid', ok: valid, detail: `${d.memberName}, ${d.relation || 'member'}, age ${d.memberAge}` });
        const band = MEDICAL_PRICING.ageBands.find((b) => age <= b.max) ?? MEDICAL_PRICING.ageBands[0];
        delta = round2(band.base * (MEDICAL_PRICING.planFactor[policy.coverage] ?? 1) * share * (1 + VAT_RATE));
        risk = age >= 55 ? 'high' : 'medium';
        summary = `Add ${d.memberName} (${d.relation || 'member'}, ${age}) to the medical plan. Age-band premium pro-rated for ${Math.round(share * 100)}% of the term; ${MEDICAL_PRICING.waitingDays}-day waiting period applies to the new member.`;
        trace.push('Priced the new member with the age-band tariff and plan factor.');
        break;
      }
      case 'sum_insured_change': {
        const nb = Number(d.newBuildingValue || 0), nc = Number(d.newContentsValue || 0);
        const newSum = (policy.home?.buildingValue ? nb || policy.home.buildingValue : 0) + (policy.home?.contentsValue ? nc || policy.home.contentsValue : 0);
        const valid = newSum > 0;
        checks.push({ label: 'New values provided', ok: valid, detail: `New total sum insured ${money(newSum)}` });
        const ratio = policy.sumInsured ? newSum / policy.sumInsured : 1;
        delta = round2(net * (ratio - 1) * share * (1 + VAT_RATE));
        risk = Math.abs(ratio - 1) > 0.25 ? 'high' : Math.abs(ratio - 1) > 0.05 ? 'medium' : 'low';
        summary = `Change sum insured from ${money(policy.sumInsured)} to ${money(newSum)} (${ratio >= 1 ? '+' : ''}${Math.round((ratio - 1) * 100)}%); premium adjusted pro-rata.`;
        trace.push('Re-rated the sum insured and pro-rated the premium change.');
        break;
      }
      case 'trip_extension': {
        const t = policy.travel;
        const newEnd = d.newEndDate ?? '';
        const extra = t ? daysBetween(t.endDate, newEnd) : 0;
        const totalDays = t ? daysBetween(t.startDate, newEnd) + 1 : 0;
        const valid = !!t && t.tripType === 'single' && extra > 0 && totalDays <= TRAVEL_PRICING.maxTripDays;
        checks.push({ label: 'Extension valid', ok: valid, detail: t ? `${extra} extra day(s), trip total ${totalDays} days (max ${TRAVEL_PRICING.maxTripDays})` : 'Not a travel policy' });
        const perDay = t ? TRAVEL_PRICING.perDay[t.region] * (policy.coverage === 'travel_plus' ? 1 + TRAVEL_PRICING.plusFactor : 1) : 0;
        delta = round2(Math.max(0, extra) * perDay * (t?.travellers.length ?? 1) * (1 + VAT_RATE));
        risk = valid ? 'low' : 'high';
        summary = `Extend the trip to ${fmtDate(newEnd)} (${extra} extra day(s) for ${t?.travellers.length ?? 0} traveller(s)).`;
        trace.push('Priced extra days with the per-day travel rate.');
        break;
      }
      case 'cancellation': {
        const refund = Math.max(0, round2(policy.annualPremium * share - SERVICE_RULES.cancellationFee));
        delta = -refund;
        risk = 'high';
        checks.push({ label: 'No open claims on policy', ok: true, detail: 'Checked against the claims register' });
        summary = `Cancel ${policy.id} from ${fmtDate(d.effectiveDate || todayISO())}. Illustrative pro-rata refund ${money(refund, { decimals: true })} after a ${money(SERVICE_RULES.cancellationFee)} fee. Reason: ${d.reason || 'not given'}.`;
        trace.push('Calculated illustrative pro-rata refund. Cancellation always needs a person.');
        break;
      }
    }
    trace.push(`Premium impact ${delta >= 0 ? '+' : '−'}${money(Math.abs(delta), { decimals: true })} (illustrative).`);
    const allOk = checks.filter((c) => c.label !== 'Pre-cover inspection').every((c) => c.ok);
    const autoApply = allOk && risk === 'low' && Math.abs(delta) <= SERVICE_RULES.autoApplyMaxPremiumDelta && request.type !== 'cancellation' && request.type !== 'add_member';
    const recommendation = !allOk ? 'Return to customer: details incomplete or invalid.'
      : autoApply ? 'Low risk, no material premium change: applied automatically under the servicing rules.'
      : request.type === 'cancellation' ? 'Route to a policy servicing officer to confirm cancellation and refund.'
      : 'Route to an underwriter to approve the change and premium adjustment.';
    trace.push(autoApply ? 'Within auto-apply rules.' : 'Outside auto-apply rules: routed to human approval.');
    return {
      output: { summary, risk, checks, premiumDelta: delta, autoApply, recommendation },
      summary: `${SERVICE_LABEL[request.type]}: ${autoApply ? 'auto-applied' : 'needs approval'} · ${delta === 0 ? 'no premium change' : `${delta > 0 ? '+' : '−'}${money(Math.abs(delta), { decimals: true })}`}`,
      findings: [], trace,
    };
  },
};

/* ── Customer Communications Agent (drafts only) ── */

export interface CommsInput {
  kind: Communication['kind'];
  customer: Customer;
  request?: DocumentRequest;
  quote?: Quote;
  service?: ServiceRequest;
}

export const communicationsAgent: AgentDefinition<CommsInput, Pick<Communication, 'subject' | 'body' | 'channel'>> = {
  name: 'Customer Communications Agent',
  task: (i) => `Draft ${i.kind.replace('_', ' ')} for ${i.customer.name}`,
  run({ kind, customer, request, quote, service }) {
    const first = customer.name.split(' ')[0];
    let subject = '', body = '';
    if (kind === 'doc_reminder' && request) {
      const docs = request.documents.map((d) => DOC_LABELS[d].toLowerCase()).join(', ');
      subject = `Reminder: we still need your ${docs} for claim ${request.claimId}`;
      body = `Dear ${first},\n\nTo keep your claim ${request.claimId} moving, please upload your ${docs} in the ITMC InsureAI portal or reply in the chat assistant.\n\nRequested on ${fmtDate(request.requestedAt)}. If you have already sent it, please ignore this message.\n\nKind regards,\nClaims Team`;
    } else if (kind === 'quote_followup' && quote) {
      subject = `Your ${quote.product} quote ${quote.id} is valid until ${fmtDate(quote.validUntil)}`;
      body = `Dear ${first},\n\nThanks for requesting a quote (${quote.subject}). Your illustrative premium is ${money(quote.premium.total, { decimals: true })} a year including VAT.\n\n${quote.missingInfo.length ? `To turn it into a policy we still need: ${quote.missingInfo.join('; ')}.\n\n` : ''}You can convert it any time before ${fmtDate(quote.validUntil)} from "My policies".\n\nKind regards,\nSales Team`;
    } else if (kind === 'service_update' && service) {
      subject = `Update on your request ${service.id}: ${SERVICE_LABEL[service.type].toLowerCase()}`;
      const outcome = service.status === 'applied' ? 'has been applied to your policy' : service.status === 'rejected' ? 'could not be completed' : 'is being reviewed by our team';
      body = `Dear ${first},\n\nYour request (${SERVICE_LABEL[service.type].toLowerCase()} on ${service.policyId}) ${outcome}.${service.assessment && service.assessment.premiumDelta !== 0 && service.status === 'applied' ? ` The premium adjustment is ${service.assessment.premiumDelta > 0 ? '' : 'a refund of '}${money(Math.abs(service.assessment.premiumDelta), { decimals: true })} (illustrative).` : ''}\n\nKind regards,\nCustomer Care`;
    }
    return { output: { subject, body, channel: 'email' }, summary: `Drafted: ${subject}`, findings: [], trace: ['Selected template for the message type.', 'Filled in customer and record details.', 'Saved as a draft for human approval (not sent).'] };
  },
};
