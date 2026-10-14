import { COVERAGE_RULES, PRICING, PRODUCT_LABEL } from '../config/rules';
import { addDays, money, todayISO } from '../lib/format';
import type { Customer, Quote } from '../types';
import type { AgentDefinition } from './runtime';

export interface PolicySupplied { plate: string; vin: string; address: string; passport?: string; declaration?: boolean }

export interface PolicyAgentInput {
  quote: Quote | undefined;
  customer: Customer | undefined;
  supplied: PolicySupplied;
}

export interface PolicyAgentOutput {
  ready: boolean;
  checks: { label: string; ok: boolean; detail: string }[];
  outstanding: string[];
  summary?: {
    coverage: string;
    sumInsured: number;
    sumInsuredLabel: string;
    deductible: number;
    thirdPartyLimit: number;
    addOns: string[];
    annualPremium: number;
    effectiveDate: string;
    expiryDate: string;
    conditions: string[];
  };
}

export const policyAgent: AgentDefinition<PolicyAgentInput, PolicyAgentOutput> = {
  name: 'Policy Agent',
  task: (i) => `Prepare demo ${i.quote ? PRODUCT_LABEL[i.quote.product].toLowerCase() : ''} policy from quote ${i.quote?.id ?? '—'}`.replace('  ', ' '),
  run({ quote, customer, supplied }) {
    const trace: string[] = [];
    const checks: PolicyAgentOutput['checks'] = [];
    if (!quote || !customer) {
      return { output: { ready: false, checks: [{ label: 'Quote retrieved', ok: false, detail: 'Quote not found in demo data.' }], outstanding: ['Valid quote'] }, summary: 'Quote not found.', findings: [], trace: ['Quote lookup failed.'] };
    }
    trace.push(`Retrieved ${PRODUCT_LABEL[quote.product].toLowerCase()} quote ${quote.id} and customer ${customer.id}.`);
    checks.push({ label: 'Quote retrieved', ok: true, detail: `${quote.id} · ${quote.subject}` });
    const valid = quote.validUntil >= todayISO();
    checks.push({ label: 'Quote within validity', ok: valid, detail: `Valid until ${quote.validUntil}` });
    checks.push({ label: 'Quote not already converted', ok: quote.status !== 'converted', detail: quote.status === 'converted' ? `Already converted to ${quote.policyId}` : 'Open' });

    const outstanding: string[] = [];
    const address = supplied.address || customer.address || quote.home?.address || '';
    if (quote.product === 'motor') {
      if (!(supplied.plate || quote.vehicle?.plate || '').trim()) outstanding.push('Plate number');
      const vin = supplied.vin || quote.vehicle?.vin || '';
      if (!vin.trim() || vin.trim().length < 11) outstanding.push('VIN / chassis number (min. 11 characters)');
    }
    if (quote.product === 'travel') {
      const pp = supplied.passport || quote.travel?.passportNo || '';
      if (!/^[A-Z0-9]{6,12}$/i.test(pp.trim())) outstanding.push('Lead traveller passport number (6–12 letters/digits)');
      if (quote.travel && quote.travel.startDate < todayISO()) outstanding.push('Re-quote: departure date has passed');
    }
    if (quote.product === 'medical' && !(supplied.declaration || quote.medical?.declarationConfirmed)) outstanding.push('Health declaration confirmation');
    if (!address.trim()) outstanding.push(quote.product === 'home' ? 'Property address' : 'Policyholder address');
    if (!customer.phone) outstanding.push('Mobile number');
    checks.push({ label: 'Required policy fields', ok: outstanding.length === 0, detail: outstanding.length ? `${outstanding.length} outstanding` : 'All present' });
    if (!valid) outstanding.push('Re-quote: original quote expired');
    if (quote.status === 'converted') outstanding.push('Quote already converted');
    trace.push(`Checked ${PRODUCT_LABEL[quote.product].toLowerCase()} requirements: ${outstanding.length ? outstanding.join(', ') : 'none outstanding'}.`);

    const rules = COVERAGE_RULES[quote.coverage];
    let effectiveDate = todayISO();
    let expiryDate = addDays(addDays(effectiveDate, 365), -1);
    if (quote.travel) { effectiveDate = quote.travel.startDate; expiryDate = quote.travel.endDate; }
    const sumInsured = quote.product === 'motor' ? (quote.coverage === 'comprehensive' ? quote.vehicle!.value : 0) : quote.sumInsured ?? 0;
    const sumInsuredLabel = { motor: 'Sum insured', travel: 'Emergency medical limit', medical: 'Annual limit per member', home: 'Total sum insured' }[quote.product];
    const summary: PolicyAgentOutput['summary'] = {
      coverage: rules.label, sumInsured, sumInsuredLabel,
      deductible: quote.deductible, thirdPartyLimit: rules.thirdPartyLimit,
      addOns: quote.addOns.map((a) => PRICING.addOns[a].label),
      annualPremium: quote.premium.total, effectiveDate, expiryDate, conditions: rules.conditions,
    };
    trace.push('Prepared policy summary and term dates.');
    return {
      output: { ready: outstanding.length === 0, checks, outstanding, summary },
      summary: outstanding.length ? `Policy summary prepared; ${outstanding.length} requirement(s) outstanding.` : `Ready to issue: ${rules.label}, premium ${money(quote.premium.total)}.`,
      findings: [], trace,
    };
  },
};
