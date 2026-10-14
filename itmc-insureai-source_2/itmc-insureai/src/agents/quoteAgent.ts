import { CITIES, COVERAGE_RULES, PRICING, PRODUCT_LABEL, QUOTE_VALIDITY_DAYS, TRAVEL_PRICING } from '../config/rules';
import { addDays, daysBetween, todayISO } from '../lib/format';
import type {
  AddOn, CoverageType, DriverProfile, HomeDetails, MedicalDetails, MedicalMember, PremiumBreakdown, Product, TravelDetails, Vehicle, VehicleUsage,
} from '../types';
import { priceHome, priceMedical, priceMotor, priceTravel } from './pricing';
import type { AgentDefinition } from './runtime';

export interface QuoteRequest {
  product: Product;
  customer: { name: string; email: string; phone: string; dateOfBirth: string; city: string };
  vehicle: { make: string; model: string; year: string; value: string; plate: string; vin: string; usage: VehicleUsage };
  driver: { licenseYears: string; claimsLast3Years: string };
  travel: { tripType: 'single' | 'annual'; region: TravelDetails['region']; destination: string; startDate: string; endDate: string; travellers: { name: string; age: string }[] };
  medical: { members: { name: string; age: string; relation: MedicalMember['relation'] }[]; preExisting: boolean; network: MedicalDetails['network'] };
  home: { propertyType: HomeDetails['propertyType']; ownership: HomeDetails['ownership']; address: string; buildingValue: string; contentsValue: string; valuablesValue: string; alarm: boolean; floodZone: boolean };
  coverage: CoverageType;
  deductible: number;
  addOns: AddOn[];
}

export interface QuoteAgentOutput {
  ok: boolean;
  errors: { field: string; message: string }[];
  missingInfo: string[];
  premium?: PremiumBreakdown;
  assumptions: string[];
  driverAge?: number;
  validUntil?: string;
  subject?: string;
  details?: { vehicle?: Vehicle; driver?: DriverProfile; travel?: TravelDetails; medical?: MedicalDetails; home?: HomeDetails };
  sumInsured?: number;
}

export const ageFrom = (dob: string, today: string) => {
  const [y, m, d] = dob.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  let age = ty - y;
  if (tm < m || (tm === m && td < d)) age--;
  return age;
};

export const subjectOf = (r: QuoteRequest): string => {
  switch (r.product) {
    case 'motor': return `${r.vehicle.year} ${r.vehicle.make} ${r.vehicle.model}`.trim();
    case 'travel': return `${r.travel.tripType === 'annual' ? 'Annual multi-trip' : 'Single trip'} · ${r.travel.destination || r.travel.region} · ${r.travel.travellers.length} traveller(s)`;
    case 'medical': return `${COVERAGE_RULES[r.coverage]?.label ?? 'Medical'} · ${r.medical.members.length} member(s)`;
    case 'home': return `${r.home.propertyType === 'villa' ? 'Villa' : 'Apartment'} · ${r.home.address.split(',').slice(-2).join(',').trim() || 'address pending'}`;
  }
};

export const quoteAgent: AgentDefinition<QuoteRequest, QuoteAgentOutput> = {
  name: 'Quote Agent',
  task: (r) => `Price ${PRODUCT_LABEL[r.product].toLowerCase()} quote for ${r.customer.name || 'new customer'} · ${subjectOf(r)}`,
  run(r) {
    const trace: string[] = [];
    const errors: QuoteAgentOutput['errors'] = [];
    const missingInfo: string[] = [];
    const today = todayISO();
    const currentYear = Number(today.slice(0, 4));
    const err = (field: string, message: string) => errors.push({ field, message });
    const req = (field: string, v: string, label: string) => { if (!v || !String(v).trim()) err(field, `${label} is required.`); };

    trace.push(`Validated submitted fields against the ${PRODUCT_LABEL[r.product].toLowerCase()} quote schema.`);
    req('customer.name', r.customer.name, 'Full name');
    req('customer.email', r.customer.email, 'Email');
    req('customer.dateOfBirth', r.customer.dateOfBirth, 'Date of birth');
    if (r.customer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.customer.email)) err('customer.email', 'Enter a valid email address.');
    let driverAge: number | undefined;
    if (r.customer.dateOfBirth) {
      driverAge = ageFrom(r.customer.dateOfBirth, today);
      if (driverAge < 18 || driverAge > 85) err('customer.dateOfBirth', `Policyholder must be between 18 and 85 (calculated ${driverAge}).`);
    }
    if (!r.customer.phone?.trim()) missingInfo.push('Mobile number (needed for claim notifications)');
    if (!CITIES.includes(r.customer.city)) missingInfo.push('City of residence (territory factor defaulted)');
    if (!COVERAGE_RULES[r.coverage] || (COVERAGE_RULES[r.coverage].product ?? 'motor') !== r.product) err('coverage', 'Choose a cover type for this product.');

    let details: QuoteAgentOutput['details'] = {};
    let sumInsured = 0;
    const price = (): ReturnType<typeof priceMotor> | undefined => {
      if (r.product === 'motor') {
        req('vehicle.make', r.vehicle.make, 'Vehicle make'); req('vehicle.model', r.vehicle.model, 'Vehicle model'); req('vehicle.year', r.vehicle.year, 'Model year'); req('vehicle.value', r.vehicle.value, 'Vehicle value'); req('driver.licenseYears', r.driver.licenseYears, 'Years licensed');
        const year = Number(r.vehicle.year), value = Number(r.vehicle.value), lic = Number(r.driver.licenseYears), claims = Number(r.driver.claimsLast3Years || 0);
        if (r.vehicle.year && (!Number.isInteger(year) || year < 2000 || year > currentYear + 1)) err('vehicle.year', `Model year must be between 2000 and ${currentYear + 1}.`);
        if (r.vehicle.value && (!Number.isFinite(value) || value < PRICING.vehicleValue.min || value > PRICING.vehicleValue.max)) err('vehicle.value', `Vehicle value must be between ${PRICING.vehicleValue.min.toLocaleString()} and ${PRICING.vehicleValue.max.toLocaleString()}.`);
        if (r.driver.licenseYears && (!Number.isFinite(lic) || lic < 0 || (driverAge !== undefined && lic > driverAge - 16))) err('driver.licenseYears', 'Years licensed is not consistent with the driver age.');
        if (!Number.isFinite(claims) || claims < 0) err('driver.claimsLast3Years', 'Prior claims must be zero or more.');
        if (!r.vehicle.plate?.trim()) missingInfo.push('Plate number (required before policy issue)');
        if (!r.vehicle.vin?.trim()) missingInfo.push('VIN / chassis number (required before policy issue)');
        if (errors.length) return undefined;
        const vehicle: Vehicle = { make: r.vehicle.make.trim(), model: r.vehicle.model.trim(), year, value, plate: r.vehicle.plate.trim() || undefined, vin: r.vehicle.vin.trim() || undefined, usage: r.vehicle.usage };
        const driver: DriverProfile = { age: driverAge!, licenseYears: lic, claimsLast3Years: claims };
        details = { vehicle, driver };
        sumInsured = r.coverage === 'comprehensive' ? value : 0;
        return priceMotor({ vehicle, driver, coverage: r.coverage, deductible: r.deductible, addOns: r.addOns, city: CITIES.includes(r.customer.city) ? r.customer.city : 'Other', currentYear });
      }
      if (r.product === 'travel') {
        const t = r.travel;
        req('travel.startDate', t.startDate, 'Departure date');
        if (t.tripType === 'single') req('travel.endDate', t.endDate, 'Return date');
        req('travel.destination', t.destination, 'Destination');
        if (t.startDate && t.startDate < today) err('travel.startDate', 'Departure date cannot be in the past.');
        const end = t.tripType === 'annual' ? addDays(addDays(t.startDate || today, 365), -1) : t.endDate;
        if (t.tripType === 'single' && t.startDate && t.endDate) {
          const d = daysBetween(t.startDate, t.endDate);
          if (d < 0) err('travel.endDate', 'Return date must be after departure.');
          else if (d + 1 > TRAVEL_PRICING.maxTripDays) err('travel.endDate', `Single trips can be up to ${TRAVEL_PRICING.maxTripDays} days. Choose annual cover instead.`);
        }
        if (!t.travellers.length) err('travel.travellers', 'Add at least one traveller.');
        t.travellers.forEach((x, i) => { const a = Number(x.age); if (!x.age || !Number.isFinite(a) || a < 0 || a > 85) err(`travel.travellers.${i}`, `Traveller ${i + 1}: enter an age between 0 and 85.`); });
        missingInfo.push('Passport number of the lead traveller (required before policy issue)');
        if (errors.length) return undefined;
        const travel: TravelDetails = { tripType: t.tripType, region: t.region, destination: t.destination.trim(), startDate: t.startDate, endDate: end, travellers: t.travellers.map((x) => ({ name: x.name.trim() || 'Traveller', age: Number(x.age) })) };
        details = { travel };
        sumInsured = COVERAGE_RULES[r.coverage].limits?.medical_emergency ?? 0;
        return priceTravel(travel, r.coverage === 'travel_plus');
      }
      if (r.product === 'medical') {
        const m = r.medical;
        if (!m.members.length) err('medical.members', 'Add at least one member.');
        m.members.forEach((x, i) => { const a = Number(x.age); if (!x.name.trim()) err(`medical.members.${i}`, `Member ${i + 1}: name is required.`); if (!x.age || !Number.isFinite(a) || a < 0 || a > 75) err(`medical.members.${i}`, `Member ${i + 1}: age must be 0–75 for new cover.`); });
        missingInfo.push('Signed health declaration (required before policy issue)');
        if (errors.length) return undefined;
        const medical: MedicalDetails = { members: m.members.map((x) => ({ name: x.name.trim(), age: Number(x.age), relation: x.relation })), preExisting: m.preExisting, network: m.network };
        details = { medical };
        sumInsured = COVERAGE_RULES[r.coverage].limits?.inpatient ?? 0;
        return priceMedical(medical, r.coverage);
      }
      // home
      const h = r.home;
      const bv = Number(h.buildingValue || 0), cv = Number(h.contentsValue || 0), vv = Number(h.valuablesValue || 0);
      req('home.address', h.address, 'Property address');
      if (r.coverage !== 'home_contents' && (bv < 100000 || bv > 20000000)) err('home.buildingValue', 'Rebuild value must be between 100,000 and 20,000,000.');
      if (r.coverage !== 'home_buildings' && (cv < 10000 || cv > 5000000)) err('home.contentsValue', 'Contents value must be between 10,000 and 5,000,000.');
      if (r.coverage !== 'home_contents' && h.ownership === 'tenant') err('coverage', 'Tenants can insure contents only; buildings cover is for owners.');
      if (vv > cv) err('home.valuablesValue', 'Valuables are part of contents and cannot exceed the contents value.');
      if (errors.length) return undefined;
      const home: HomeDetails = { propertyType: h.propertyType, ownership: h.ownership, address: h.address.trim(), buildingValue: r.coverage === 'home_contents' ? 0 : bv, contentsValue: r.coverage === 'home_buildings' ? 0 : cv, valuablesValue: r.coverage === 'home_buildings' ? 0 : vv, alarm: h.alarm, floodZone: h.floodZone };
      details = { home };
      sumInsured = home.buildingValue + home.contentsValue;
      return priceHome(home, r.coverage, r.deductible);
    };

    const priced = price();
    if (!priced) {
      trace.push(`Stopped before pricing: ${errors.length} field(s) need attention.`);
      return { output: { ok: false, errors, missingInfo, assumptions: [] }, summary: `Quote not priced — ${errors.length} validation issue(s).`, findings: [], trace };
    }
    trace.push('Checked for information needed later in the policy lifecycle.');
    trace.push(`Called the deterministic ${PRODUCT_LABEL[r.product].toLowerCase()} pricing engine.`);
    trace.push(`Produced annual premium ${priced.breakdown.total.toFixed(2)} incl. VAT from ${priced.breakdown.lines.length} priced lines.`);
    trace.push('Explained assumptions and generated a quote reference.');
    return {
      output: { ok: true, errors: [], missingInfo, premium: priced.breakdown, assumptions: priced.assumptions, driverAge, validUntil: addDays(today, QUOTE_VALIDITY_DAYS), subject: subjectOf(r), details, sumInsured },
      summary: `Priced ${COVERAGE_RULES[r.coverage].label} at ${priced.breakdown.total.toFixed(2)} incl. VAT; ${missingInfo.length} item(s) still to collect.`,
      findings: [], trace,
    };
  },
};
