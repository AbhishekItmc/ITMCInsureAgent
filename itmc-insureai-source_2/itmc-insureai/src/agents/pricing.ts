import { HOME_PRICING, MEDICAL_PRICING, TRAVEL_PRICING } from '../config/rules';
import { daysBetween } from '../lib/format';
import type { HomeDetails, MedicalDetails, TravelDetails } from '../types';
// Deterministic demo pricing engine. Same input → same premium, every time.
import { PRICING, VAT_RATE } from '../config/rules';
import { round2 } from '../lib/format';
import type { AddOn, CoverageType, DriverProfile, PremiumBreakdown, PremiumLine, Vehicle } from '../types';

export interface PricingInput {
  vehicle: Vehicle;
  driver: DriverProfile;
  coverage: CoverageType;
  deductible: number;
  addOns: AddOn[];
  city: string;
  currentYear: number;
}

export interface PricingResult {
  breakdown: PremiumBreakdown;
  assumptions: string[];
  skippedAddOns: { addOn: AddOn; reason: string }[];
}

export function priceMotor(input: PricingInput): PricingResult {
  const { vehicle, driver, coverage, deductible, addOns, city, currentYear } = input;
  const lines: PremiumLine[] = [];
  const assumptions: string[] = [];
  const skippedAddOns: PricingResult['skippedAddOns'] = [];

  // 1. Base premium
  let base: number;
  if (coverage === 'comprehensive') {
    const raw = vehicle.value * PRICING.comprehensive.ratePctOfValue;
    base = Math.max(raw, PRICING.comprehensive.minimumBase);
    lines.push({
      label: 'Base premium (comprehensive)',
      amount: round2(base),
      kind: 'base',
      note: `${(PRICING.comprehensive.ratePctOfValue * 100).toFixed(1)}% of declared value${raw < PRICING.comprehensive.minimumBase ? ', minimum applied' : ''}`,
    });
    assumptions.push(`Sum insured equals the declared market value of the vehicle.`);
  } else {
    base = PRICING.third_party.flatBase;
    lines.push({ label: 'Base premium (third-party)', amount: base, kind: 'base', note: 'Flat demo tariff' });
    assumptions.push('Third-party cover does not include damage to the insured vehicle.');
  }

  // 2. Rating factors (multiplicative on base, applied additively for transparency)
  const factors: { label: string; f: number }[] = [];
  const band = PRICING.ageBands.find((b) => driver.age <= b.max)!;
  if (band.factor !== 0) factors.push({ label: band.label, f: band.factor });
  if (driver.licenseYears < PRICING.newLicenseYears) factors.push({ label: `Licence held < ${PRICING.newLicenseYears} years`, f: PRICING.newLicenseFactor });
  const loadedClaims = Math.min(driver.claimsLast3Years, PRICING.maxPriorClaimsLoaded);
  if (loadedClaims > 0) factors.push({ label: `${loadedClaims} prior claim(s) in 3 years`, f: loadedClaims * PRICING.perPriorClaimFactor });
  const vehicleAge = currentYear - vehicle.year;
  if (coverage === 'comprehensive' && vehicleAge > PRICING.oldVehicleYears) factors.push({ label: `Vehicle older than ${PRICING.oldVehicleYears} years`, f: PRICING.oldVehicleFactor });
  if (vehicle.usage === 'commercial') factors.push({ label: 'Commercial usage', f: PRICING.commercialUsageFactor });
  const cityF = PRICING.cityFactor[city] ?? 0;
  if (cityF) factors.push({ label: `Territory: ${city}`, f: cityF });
  if (driver.claimsLast3Years === 0 && driver.licenseYears >= PRICING.noClaimsDiscount.minLicenseYears)
    factors.push({ label: 'No-claims discount', f: PRICING.noClaimsDiscount.factor });
  if (coverage === 'comprehensive') {
    const dd = PRICING.deductibleDiscount[deductible] ?? 0;
    if (dd) factors.push({ label: `Voluntary deductible ${deductible}`, f: dd });
  }

  let adjusted = base;
  for (const { label, f } of factors) {
    const amt = round2(base * f);
    adjusted += amt;
    lines.push({ label, amount: amt, kind: f < 0 ? 'discount' : 'factor', note: `${f > 0 ? '+' : ''}${Math.round(f * 100)}% of base` });
  }

  // 3. Add-ons
  for (const a of addOns) {
    const cfg = PRICING.addOns[a];
    if (a === 'agency_repair') {
      if (coverage !== 'comprehensive') { skippedAddOns.push({ addOn: a, reason: 'Only available with comprehensive cover' }); continue; }
      if (vehicleAge > (cfg.maxVehicleAgeYears ?? 99)) { skippedAddOns.push({ addOn: a, reason: `Only for vehicles up to ${cfg.maxVehicleAgeYears} years old` }); continue; }
    }
    if (a === 'rental_car' && coverage !== 'comprehensive') { skippedAddOns.push({ addOn: a, reason: 'Only available with comprehensive cover' }); continue; }
    const amt = round2(cfg.flat ?? base * (cfg.pctOfBase ?? 0));
    adjusted += amt;
    lines.push({ label: cfg.label, amount: amt, kind: 'addon', note: cfg.flat ? 'Flat add-on' : `${(cfg.pctOfBase! * 100).toFixed(0)}% of base` });
  }

  const netPremium = round2(Math.max(adjusted, coverage === "third_party" ? PRICING.third_party.minimumBase : PRICING.comprehensive.minimumBase));
  const vat = round2(netPremium * VAT_RATE);
  lines.push({ label: `VAT ${Math.round(VAT_RATE * 100)}%`, amount: vat, kind: 'tax' });

  assumptions.push(
    `Driver age (${driver.age}) is derived from the date of birth provided.`,
    'Premium is annual and illustrative; it is produced by the configured demo tariff, not an insurer rating engine.',
    'No underwriting inspection or external data checks (claims history bureau, traffic violations) were performed.',
  );
  if (vehicle.usage === 'private') assumptions.push('Vehicle is used for private purposes only (no ride-hailing or delivery).');
  for (const s of skippedAddOns) assumptions.push(`${PRICING.addOns[s.addOn].label} not priced: ${s.reason.toLowerCase()}.`);

  return { breakdown: { lines, netPremium, vat, total: round2(netPremium + vat) }, assumptions, skippedAddOns };
}

/* ── Travel, Medical and Home tariffs (deterministic demo) ── */

const withVat = (lines: PremiumLine[], net: number): PremiumBreakdown => {
  const n = round2(net);
  const vat = round2(n * VAT_RATE);
  return { lines: [...lines, { label: `VAT ${Math.round(VAT_RATE * 100)}%`, amount: vat, kind: 'tax' }], netPremium: n, vat, total: round2(n + vat) };
};

export function priceTravel(t: TravelDetails, plus: boolean): PricingResult {
  const lines: PremiumLine[] = [];
  const assumptions: string[] = [];
  const days = Math.max(1, daysBetween(t.startDate, t.endDate) + 1);
  let total = 0;
  for (const tr of t.travellers) {
    let base = t.tripType === 'annual' ? TRAVEL_PRICING.annual[t.region] : TRAVEL_PRICING.perDay[t.region] * days;
    const note = t.tripType === 'annual' ? 'Annual multi-trip rate' : `${days} day(s) × ${TRAVEL_PRICING.perDay[t.region]}/day`;
    let f = 0;
    if (tr.age >= 75) f = TRAVEL_PRICING.age75; else if (tr.age >= 65) f = TRAVEL_PRICING.age65;
    base = base * (1 + f);
    lines.push({ label: `${tr.name || 'Traveller'} (age ${tr.age})`, amount: round2(base), kind: 'base', note: `${note}${f ? `, age loading +${f * 100}%` : ''}` });
    total += base;
  }
  if (plus) { const a = round2(total * TRAVEL_PRICING.plusFactor); lines.push({ label: 'Travel Plus higher limits', amount: a, kind: 'factor', note: `+${TRAVEL_PRICING.plusFactor * 100}%` }); total += a; }
  if (t.travellers.length >= TRAVEL_PRICING.familyDiscount.minTravellers) { const d = round2(total * TRAVEL_PRICING.familyDiscount.factor); lines.push({ label: 'Family / group discount', amount: d, kind: 'discount', note: '-10%' }); total += d; }
  total = Math.max(total, TRAVEL_PRICING.minimum);
  assumptions.push(t.tripType === 'annual' ? 'Annual cover: unlimited trips of up to 45 days each within the selected region.' : `Single trip of ${days} day(s), ${t.startDate} to ${t.endDate}.`, 'All travellers declared no pre-existing medical conditions.', 'Premium is illustrative and produced by the demo tariff.');
  return { breakdown: withVat(lines, total), assumptions, skippedAddOns: [] };
}

export function priceMedical(m: MedicalDetails, plan: string): PricingResult {
  const lines: PremiumLine[] = [];
  let total = 0;
  for (const mem of m.members) {
    const band = MEDICAL_PRICING.ageBands.find((b) => mem.age <= b.max)!;
    const amt = band.base * MEDICAL_PRICING.planFactor[plan];
    lines.push({ label: `${mem.name || mem.relation} (${mem.relation}, ${mem.age})`, amount: round2(amt), kind: 'base', note: `Age band base ${band.base} × plan ${MEDICAL_PRICING.planFactor[plan]}` });
    total += amt;
  }
  const net = MEDICAL_PRICING.networkFactor[m.network] ?? 0;
  if (net) { const a = round2(total * net); lines.push({ label: `${m.network} network`, amount: a, kind: 'factor', note: `+${Math.round(net * 100)}%` }); total += a; }
  if (m.preExisting) { const a = round2(total * MEDICAL_PRICING.preExistingLoading); lines.push({ label: 'Declared pre-existing condition', amount: a, kind: 'factor', note: '+15%' }); total += a; }
  if (m.members.length >= MEDICAL_PRICING.familyDiscount.minMembers) { const d = round2(total * MEDICAL_PRICING.familyDiscount.factor); lines.push({ label: 'Family discount', amount: d, kind: 'discount', note: '-5%' }); total += d; }
  return { breakdown: withVat(lines, total), assumptions: [`Annual benefit limit ${MEDICAL_PRICING.annualLimit[plan].toLocaleString()} per member.`, `${MEDICAL_PRICING.waitingDays}-day waiting period for non-emergency treatment.`, 'Premium is illustrative and produced by the demo tariff; no medical underwriting was performed.'], skippedAddOns: [] };
}

export function priceHome(h: HomeDetails, coverage: string, deductible: number): PricingResult {
  const lines: PremiumLine[] = [];
  const buildings = coverage !== 'home_contents';
  const contents = coverage !== 'home_buildings';
  let total = 0;
  if (buildings) { const a = h.buildingValue * HOME_PRICING.buildingRate; lines.push({ label: 'Buildings', amount: round2(a), kind: 'base', note: `${(HOME_PRICING.buildingRate * 100).toFixed(2)}% of rebuild value` }); total += a; }
  if (contents) {
    const a = h.contentsValue * HOME_PRICING.contentsRate; lines.push({ label: 'Contents', amount: round2(a), kind: 'base', note: `${(HOME_PRICING.contentsRate * 100).toFixed(2)}% of contents value` }); total += a;
    if (h.valuablesValue > 0) { const v = h.valuablesValue * HOME_PRICING.valuablesRate; lines.push({ label: 'Valuables', amount: round2(v), kind: 'base', note: `${(HOME_PRICING.valuablesRate * 100).toFixed(1)}% of declared valuables` }); total += v; }
  }
  const base = total;
  const fs: [string, number][] = [];
  if (h.propertyType === 'villa') fs.push(['Villa', HOME_PRICING.villaFactor]);
  if (!h.alarm) fs.push(['No monitored alarm', HOME_PRICING.noAlarmFactor]);
  if (h.floodZone) fs.push(['Declared flood zone', HOME_PRICING.floodZoneFactor]);
  const dd = HOME_PRICING.deductibleDiscount[deductible] ?? 0;
  if (dd) fs.push([`Voluntary deductible ${deductible}`, dd]);
  for (const [l, f] of fs) { const a = round2(base * f); lines.push({ label: l, amount: a, kind: f < 0 ? 'discount' : 'factor', note: `${f > 0 ? '+' : ''}${Math.round(f * 100)}%` }); total += a; }
  total = Math.max(total, HOME_PRICING.minimum);
  return { breakdown: withVat(lines, total), assumptions: [buildings ? 'Buildings sum insured equals the declared rebuild value (not market value).' : 'Contents-only cover (suitable for tenants).', contents ? 'Single items above 10,000 must be listed as valuables.' : '', 'Premium is illustrative and produced by the demo tariff; no survey was carried out.'].filter(Boolean), skippedAddOns: [] };
}
