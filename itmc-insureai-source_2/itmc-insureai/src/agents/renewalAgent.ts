import { COVERAGE_RULES, PRICING, PRODUCT_LABEL, RENEWAL, VAT_RATE } from '../config/rules';
import { addDays, daysBetween, fmtDate, money, round2, todayISO } from '../lib/format';
import type { Claim, Customer, Policy, PremiumBreakdown, PremiumLine, Product } from '../types';
import type { AgentDefinition } from './runtime';

export interface RenewalAgentInput {
  policy: Policy | undefined;
  customer: Customer | undefined;
  claims: Claim[];
  supplied: { mileage: string; addressConfirmed: boolean; driverChanges: string };
}

export interface RenewalAgentOutput {
  ok: boolean;
  coverageSummary: string[];
  currentPremium: number;
  estimate?: PremiumBreakdown;
  renewedSumInsured?: number;
  missingInfo: string[];
  communicationDraft: string;
  followUp: { title: string; owner: string; dueDate: string };
  daysToExpiry: number;
}

export const RENEWAL_ASKS: Record<Product, { first: string; second: string }> = {
  motor: { first: 'Current odometer reading', second: 'Any changes to named drivers' },
  home: { first: 'Updated rebuild value or confirmation it is unchanged', second: 'Any renovations, occupancy or security changes' },
  medical: { first: 'Members to add or remove', second: 'Any new medical conditions to declare' },
  travel: { first: 'Main destinations planned for next year', second: 'Any travellers to add' },
};

export const renewalAgent: AgentDefinition<RenewalAgentInput, RenewalAgentOutput> = {
  name: 'Renewal Agent',
  task: (i) => `Prepare renewal for ${i.policy?.id ?? '—'}`,
  run({ policy, customer, claims, supplied }) {
    const trace: string[] = [];
    if (!policy || !customer) {
      return {
        output: { ok: false, coverageSummary: [], currentPremium: 0, missingInfo: ['Policy not found'], communicationDraft: '', followUp: { title: '', owner: '', dueDate: '' }, daysToExpiry: 0 },
        summary: 'Policy not found.', findings: [], trace: ['Policy lookup failed.'],
      };
    }
    trace.push(`Retrieved policy ${policy.id} for ${customer.name}.`);
    if (policy.product === 'travel' && policy.travel?.tripType === 'single') {
      return {
        output: { ok: false, coverageSummary: [`Single-trip travel cover for ${policy.subject}`], currentPremium: policy.annualPremium, missingInfo: ['Single-trip policies end with the trip and are not renewed. Get a new travel quote for your next trip.'], communicationDraft: '', followUp: { title: '', owner: '', dueDate: '' }, daysToExpiry: daysBetween(todayISO(), policy.expiryDate) },
        summary: 'Single-trip travel policy: not renewable.', findings: [], trace: [...trace, 'Single-trip travel policies are not renewable.'],
      };
    }
    const rules = COVERAGE_RULES[policy.coverage];
    const coverageSummary = [
      `${rules.label} cover for ${policy.subject}${policy.vehicle?.plate ? ` (${policy.vehicle.plate})` : ''}`,
      policy.product === 'motor'
        ? (policy.coverage === 'comprehensive' ? `Sum insured ${money(policy.sumInsured)} · deductible ${money(policy.deductible)}` : `Third-party liability up to ${money(rules.thirdPartyLimit)}`)
        : policy.product === 'home' ? `Sum insured ${money(policy.sumInsured)} · deductible ${money(policy.deductible)}`
        : policy.product === 'medical' ? `Annual limit ${money(policy.sumInsured)} per member · ${policy.medical?.members.length ?? 0} member(s) · ${policy.medical?.network} network`
        : `Emergency medical limit ${money(policy.sumInsured)} · ${policy.travel?.travellers.length ?? 0} traveller(s)`,
      ...(policy.product === 'motor' ? [`Add-ons: ${policy.addOns.length ? policy.addOns.map((a) => PRICING.addOns[a].label).join(', ') : 'none'}`] : []),
      `Current term ${fmtDate(policy.effectiveDate)} – ${fmtDate(policy.expiryDate)} · premium ${money(policy.annualPremium)}`,
    ];
    trace.push('Summarised current coverage.');

    // Illustrative renewal estimate using configured renewal rules
    const termClaims = claims.filter((c) => c.policyId === policy.id);
    const currentNet = round2(policy.annualPremium / (1 + VAT_RATE));
    const lines: PremiumLine[] = [{ label: 'Current net premium', amount: currentNet, kind: 'base' }];
    let renewedSumInsured = policy.sumInsured;
    if (policy.coverage === 'comprehensive') {
      renewedSumInsured = round2(policy.sumInsured * (1 - RENEWAL.annualDepreciation));
      lines.push({ label: `Sum insured depreciation (${Math.round(RENEWAL.annualDepreciation * 100)}%)`, amount: round2(-currentNet * RENEWAL.annualDepreciation), kind: 'discount', note: `New sum insured ${money(renewedSumInsured)}` });
    }
    if (policy.product === 'home') {
      renewedSumInsured = round2(policy.sumInsured * 1.04);
      lines.push({ label: 'Rebuild-cost indexation (+4%)', amount: round2(currentNet * 0.04), kind: 'factor', note: `New sum insured ${money(renewedSumInsured)}` });
    }
    if (policy.product === 'medical') lines.push({ label: 'Medical cost trend', amount: round2(currentNet * 0.08), kind: 'factor', note: '+8% (illustrative)' });
    else lines.push({ label: 'Market adjustment', amount: round2(currentNet * RENEWAL.marketAdjustment), kind: 'factor', note: `+${Math.round(RENEWAL.marketAdjustment * 100)}%` });
    if (termClaims.length) {
      lines.push({ label: `${termClaims.length} claim(s) this term`, amount: round2(currentNet * RENEWAL.perClaimLoading * termClaims.length), kind: 'factor', note: `+${Math.round(RENEWAL.perClaimLoading * 100)}% per claim (illustrative; outcome-independent)` });
    } else {
      lines.push({ label: 'Claim-free renewal discount', amount: round2(currentNet * RENEWAL.claimFreeDiscount), kind: 'discount', note: `${Math.round(RENEWAL.claimFreeDiscount * 100)}%` });
    }
    const net = round2(lines.reduce((s, l) => s + l.amount, 0));
    const vat = round2(net * VAT_RATE);
    lines.push({ label: `VAT ${Math.round(VAT_RATE * 100)}%`, amount: vat, kind: 'tax' });
    const estimate: PremiumBreakdown = { lines, netPremium: net, vat, total: round2(net + vat) };
    trace.push(`Calculated illustrative renewal estimate ${estimate.total.toFixed(2)} incl. VAT.`);

    const missingInfo: string[] = [];
    const asks = RENEWAL_ASKS[policy.product];
    if (!supplied.mileage.trim()) missingInfo.push(asks.first);
    if (!supplied.addressConfirmed) missingInfo.push('Confirmation that the address on file is current');
    if (!supplied.driverChanges.trim()) missingInfo.push(`${asks.second} (or “none”)`);
    trace.push(`Identified ${missingInfo.length} missing item(s).`);

    const daysToExpiry = daysBetween(todayISO(), policy.expiryDate);
    const first = customer.name.split(' ')[0];
    const communicationDraft = [
      `Subject: Your ${PRODUCT_LABEL[policy.product].toLowerCase()} policy ${policy.id} renews on ${fmtDate(addDays(policy.expiryDate, 1))}`,
      '',
      `Dear ${first},`,
      '',
      `Your ${rules.label} policy (${policy.subject}) ends on ${fmtDate(policy.expiryDate)}.`,
      `Based on your current cover, your illustrative renewal premium is ${money(estimate.total, { decimals: true })} including VAT (this term: ${money(policy.annualPremium, { decimals: true })}).`,
      termClaims.length
        ? `This estimate reflects ${termClaims.length} claim(s) recorded during the current term.`
        : 'Because you have had no claims this term, a claim-free discount has been applied.',
      policy.coverage === 'comprehensive' ? `Your proposed sum insured is ${money(renewedSumInsured)}, reflecting the vehicle's estimated current value.` : policy.product === 'home' ? `Your proposed sum insured is ${money(renewedSumInsured)}, indexed for rebuild costs.` : '',
      '',
      missingInfo.length ? `To finalise your renewal, please confirm: ${missingInfo.join('; ')}.` : 'We have everything we need to prepare your renewal offer.',
      '',
      'This is an illustrative estimate and not a binding offer. Final terms are subject to underwriting review.',
      '',
      'Kind regards,',
      'Renewals Desk · ITMC InsureAI demo',
    ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
    trace.push('Drafted renewal communication (not sent).');

    const followUp = {
      title: `Confirm renewal details with ${customer.name} (${policy.id})`,
      owner: 'Renewals Desk',
      dueDate: addDays(policy.expiryDate, -RENEWAL.followUpDaysBeforeExpiry) < todayISO() ? addDays(todayISO(), 2) : addDays(policy.expiryDate, -RENEWAL.followUpDaysBeforeExpiry),
    };
    trace.push('Created follow-up task proposal.');

    return {
      output: { ok: true, coverageSummary, currentPremium: policy.annualPremium, estimate, renewedSumInsured, missingInfo, communicationDraft, followUp, daysToExpiry },
      summary: `Renewal estimate ${money(estimate.total)} (${estimate.total >= policy.annualPremium ? '+' : ''}${Math.round(((estimate.total - policy.annualPremium) / policy.annualPremium) * 100)}% vs current); ${missingInfo.length} item(s) to confirm.`,
      findings: [],
      trace,
    };
  },
};
