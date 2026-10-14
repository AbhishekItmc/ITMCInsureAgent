// Product-aware display helpers shared by portal and console views.
import { COVERAGE_RULES, PRICING, PRODUCT_LABEL } from '../config/rules';
import { fmtDate, money } from './format';
import type { Policy } from '../types';

export function policyFacts(p: Policy): [string, string][] {
  const r = COVERAGE_RULES[p.coverage];
  const common: [string, string][] = [['Product', PRODUCT_LABEL[p.product]], ['Coverage', r.label]];
  switch (p.product) {
    case 'motor': return [...common,
      ['Sum insured', p.coverage === 'comprehensive' ? money(p.sumInsured) : '—'], ['Deductible', money(p.deductible)],
      ['Third-party limit', money(r.thirdPartyLimit)], ['Add-ons', p.addOns.length ? p.addOns.map((a) => PRICING.addOns[a].label).join(', ') : 'None'],
      ['VIN', p.vehicle?.vin ?? '—'], ...(p.namedDrivers?.length ? [['Named drivers', p.namedDrivers.join(', ')] as [string, string]] : [])];
    case 'travel': return [...common,
      ['Trip', `${p.travel?.tripType === 'annual' ? 'Annual multi-trip' : 'Single trip'} · ${p.travel?.destination}`],
      ['Travellers', p.travel?.travellers.map((t) => `${t.name} (${t.age})`).join(', ') ?? '—'],
      ['Emergency medical limit', money(r.limits?.medical_emergency ?? 0)], ['Baggage limit', money(r.limits?.baggage_loss ?? 0)],
      ['Cancellation limit', money(r.limits?.trip_cancellation ?? 0)], ['Passport', p.travel?.passportNo ?? '—']];
    case 'medical': return [...common,
      ['Members', p.medical?.members.map((m) => `${m.name} (${m.relation}, ${m.age})`).join(', ') ?? '—'],
      ['Network', p.medical?.network ?? '—'], ['Annual limit / member', money(p.sumInsured)],
      ['Outpatient limit', money(r.limits?.outpatient ?? 0)], ['Pre-existing declared', p.medical?.preExisting ? 'Yes' : 'No']];
    case 'home': return [...common,
      ['Property', `${p.home?.propertyType === 'villa' ? 'Villa' : 'Apartment'} · ${p.home?.ownership}`], ['Address', p.home?.address ?? '—'],
      ['Buildings', p.home?.buildingValue ? money(p.home.buildingValue) : 'Not covered'], ['Contents', p.home?.contentsValue ? money(p.home.contentsValue) : 'Not covered'],
      ['Valuables', p.home?.valuablesValue ? money(p.home.valuablesValue) : '—'], ['Deductible', money(p.deductible)]];
  }
}

export const termLabel = (p: Policy) => `${fmtDate(p.effectiveDate)} – ${fmtDate(p.expiryDate)}`;
