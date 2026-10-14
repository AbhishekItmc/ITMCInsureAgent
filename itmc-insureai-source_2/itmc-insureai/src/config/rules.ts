// Configured demo business rules. All values are illustrative and fictional.
// Pricing, coverage checks and renewal estimates are deterministic code driven by these tables,
// so a real rating engine or rules service can replace them later without touching the UI.
import type { AddOn, CoverageType, DocType, IncidentType, Product } from '../types';

export const CURRENCY = 'SAR';
export const VAT_RATE = 0.15;
export const QUOTE_VALIDITY_DAYS = 30;

export const PRICING = {
  comprehensive: { ratePctOfValue: 0.032, minimumBase: 1800 },
  third_party: { flatBase: 950, minimumBase: 950 },
  ageBands: [
    { max: 24, factor: 0.35, label: 'Driver under 25' },
    { max: 29, factor: 0.15, label: 'Driver 25–29' },
    { max: 59, factor: 0, label: 'Driver 30–59' },
    { max: 120, factor: 0.1, label: 'Driver 60+' },
  ],
  newLicenseYears: 2,
  newLicenseFactor: 0.2,
  perPriorClaimFactor: 0.15,
  maxPriorClaimsLoaded: 3,
  oldVehicleYears: 10,
  oldVehicleFactor: 0.1,
  commercialUsageFactor: 0.25,
  noClaimsDiscount: { minLicenseYears: 5, factor: -0.1 },
  deductibleDiscount: { 500: 0, 1000: -0.05, 2000: -0.1 } as Record<number, number>,
  cityFactor: { Riyadh: 0.05, Jeddah: 0.04, Dammam: 0.02, Other: 0 } as Record<string, number>,
  addOns: {
    roadside: { label: 'Roadside assistance', flat: 150 },
    agency_repair: { label: 'Agency repair', pctOfBase: 0.06, maxVehicleAgeYears: 5 },
    rental_car: { label: 'Replacement car (10 days)', flat: 220 },
    personal_accident: { label: 'Personal accident cover', flat: 180 },
  } as Record<AddOn, { label: string; flat?: number; pctOfBase?: number; maxVehicleAgeYears?: number }>,
  vehicleValue: { min: 15000, max: 750000 },
  driverAge: { min: 18, max: 85 },
};

export const CITIES = ['Riyadh', 'Jeddah', 'Dammam', 'Other'];

export const COVERAGE_RULES: Record<CoverageType, {
  label: string;
  product?: Product;
  /** Per-incident sub-limits (SAR), where they apply. */
  limits?: Partial<Record<IncidentType, number>>;
  ownDamage: boolean;
  thirdPartyLimit: number;
  coveredIncidents: IncidentType[];
  exclusions: { code: string; label: string; keywords: string[] }[];
  conditions: string[];
}> = {
  comprehensive: {
    label: 'Comprehensive',
    ownDamage: true,
    thirdPartyLimit: 10_000_000,
    coveredIncidents: ['collision', 'theft', 'weather', 'glass'],
    exclusions: [
      { code: 'EX-01', label: 'Driving without a valid licence', keywords: ['no licence', 'unlicensed', 'expired licence'] },
      { code: 'EX-02', label: 'Racing, speed testing or rallies', keywords: ['race', 'racing', 'drift', 'rally'] },
      { code: 'EX-03', label: 'Intentional damage', keywords: ['intentional', 'on purpose', 'deliberately'] },
      { code: 'EX-04', label: 'Wear, tear and mechanical breakdown', keywords: ['wear', 'engine failure', 'breakdown', 'gearbox'] },
      { code: 'EX-05', label: 'Undeclared commercial use (ride-hailing, delivery)', keywords: ['delivery', 'ride-hailing', 'passenger fare', 'uber'] },
    ],
    conditions: [
      'Incident must be reported within 14 days.',
      'A police / traffic report is required for collision and theft claims.',
      'Repairs require an itemised estimate before authorisation.',
    ],
  },
  third_party: {
    label: 'Third-party liability',
    ownDamage: false,
    thirdPartyLimit: 10_000_000,
    coveredIncidents: ['collision'],
    exclusions: [
      { code: 'EX-01', label: 'Driving without a valid licence', keywords: ['no licence', 'unlicensed', 'expired licence'] },
      { code: 'EX-02', label: 'Racing, speed testing or rallies', keywords: ['race', 'racing', 'drift', 'rally'] },
      { code: 'EX-06', label: 'Damage to the insured vehicle itself', keywords: [] },
    ],
    conditions: ['Incident must be reported within 14 days.', 'A police / traffic report is required.'],
  },
  travel_essential: {
    label: 'Travel Essential', product: 'travel', ownDamage: false, thirdPartyLimit: 0,
    coveredIncidents: ['medical_emergency', 'trip_cancellation', 'baggage_loss', 'flight_delay'],
    limits: { medical_emergency: 500_000, trip_cancellation: 7_500, baggage_loss: 3_000, flight_delay: 750 },
    exclusions: [
      { code: 'TR-01', label: 'Pre-existing conditions not declared', keywords: ['pre-existing', 'chronic', 'known condition'] },
      { code: 'TR-02', label: 'Hazardous sports and activities', keywords: ['skydiving', 'bungee', 'climbing', 'ski', 'scuba'] },
      { code: 'TR-03', label: 'Unattended baggage', keywords: ['left unattended', 'unattended'] },
      { code: 'TR-04', label: 'Travel against official travel advice', keywords: ['travel ban', 'against advice'] },
    ],
    conditions: ['Claims must be reported within 30 days of returning.', 'Medical emergencies must be notified to the assistance line within 48 hours.', 'Baggage loss needs an airline property irregularity report.'],
  },
  travel_plus: {
    label: 'Travel Plus', product: 'travel', ownDamage: false, thirdPartyLimit: 0,
    coveredIncidents: ['medical_emergency', 'trip_cancellation', 'baggage_loss', 'flight_delay'],
    limits: { medical_emergency: 1_000_000, trip_cancellation: 15_000, baggage_loss: 6_000, flight_delay: 1_500 },
    exclusions: [
      { code: 'TR-01', label: 'Pre-existing conditions not declared', keywords: ['pre-existing', 'chronic', 'known condition'] },
      { code: 'TR-02', label: 'Hazardous sports and activities', keywords: ['skydiving', 'bungee', 'climbing'] },
      { code: 'TR-03', label: 'Unattended baggage', keywords: ['left unattended', 'unattended'] },
    ],
    conditions: ['Claims must be reported within 30 days of returning.', 'Medical emergencies must be notified to the assistance line within 48 hours.'],
  },
  medical_essential: {
    label: 'Medical Essential', product: 'medical', ownDamage: false, thirdPartyLimit: 0,
    coveredIncidents: ['outpatient', 'inpatient', 'pharmacy'],
    limits: { outpatient: 15_000, inpatient: 500_000, pharmacy: 5_000 },
    exclusions: [
      { code: 'MD-01', label: 'Cosmetic treatment', keywords: ['cosmetic', 'aesthetic', 'botox'] },
      { code: 'MD-02', label: 'Undeclared pre-existing conditions (first 12 months)', keywords: ['pre-existing', 'chronic'] },
      { code: 'MD-03', label: 'Treatment outside the network (non-emergency)', keywords: ['out of network', 'outside network'] },
    ],
    conditions: ['30-day waiting period for non-emergency treatment.', 'Pre-approval required for inpatient admissions.', '20% co-payment on outpatient visits.'],
  },
  medical_plus: {
    label: 'Medical Plus', product: 'medical', ownDamage: false, thirdPartyLimit: 0,
    coveredIncidents: ['outpatient', 'inpatient', 'pharmacy'],
    limits: { outpatient: 30_000, inpatient: 1_000_000, pharmacy: 10_000 },
    exclusions: [
      { code: 'MD-01', label: 'Cosmetic treatment', keywords: ['cosmetic', 'aesthetic', 'botox'] },
      { code: 'MD-02', label: 'Undeclared pre-existing conditions (first 12 months)', keywords: ['pre-existing', 'chronic'] },
    ],
    conditions: ['30-day waiting period for non-emergency treatment.', 'Pre-approval required for inpatient admissions.', '10% co-payment on outpatient visits.'],
  },
  medical_premier: {
    label: 'Medical Premier', product: 'medical', ownDamage: false, thirdPartyLimit: 0,
    coveredIncidents: ['outpatient', 'inpatient', 'pharmacy'],
    limits: { outpatient: 60_000, inpatient: 2_000_000, pharmacy: 20_000 },
    exclusions: [{ code: 'MD-01', label: 'Cosmetic treatment', keywords: ['cosmetic', 'aesthetic', 'botox'] }],
    conditions: ['Pre-approval required for inpatient admissions.', 'No co-payment within the network.'],
  },
  home_buildings: {
    label: 'Home Buildings', product: 'home', ownDamage: true, thirdPartyLimit: 2_000_000,
    coveredIncidents: ['fire', 'water_damage', 'accidental_damage'],
    exclusions: [
      { code: 'HM-01', label: 'Gradual leaks and wear and tear', keywords: ['gradual', 'wear', 'for months', 'slow leak'] },
      { code: 'HM-02', label: 'Property unoccupied for more than 60 days', keywords: ['unoccupied', 'vacant', 'away for three months'] },
      { code: 'HM-03', label: 'Flood in a declared flood zone without flood cover', keywords: ['flood'] },
    ],
    conditions: ['Incidents must be reported within 14 days.', 'Burglary and fire need an official report.', 'Repairs need an itemised quote before authorisation.'],
  },
  home_contents: {
    label: 'Home Contents', product: 'home', ownDamage: true, thirdPartyLimit: 1_000_000,
    coveredIncidents: ['fire', 'water_damage', 'burglary', 'accidental_damage'],
    exclusions: [
      { code: 'HM-01', label: 'Gradual leaks and wear and tear', keywords: ['gradual', 'wear', 'for months', 'slow leak'] },
      { code: 'HM-04', label: 'Theft without forced entry', keywords: ['no forced entry', 'door was open', 'left open'] },
      { code: 'HM-05', label: 'Single valuables above 10,000 not listed', keywords: ['unlisted'] },
    ],
    conditions: ['Incidents must be reported within 14 days.', 'Burglary needs a police report.', 'Proof of ownership required for items above 2,000.'],
  },
  home_combined: {
    label: 'Home Buildings & Contents', product: 'home', ownDamage: true, thirdPartyLimit: 2_000_000,
    coveredIncidents: ['fire', 'water_damage', 'burglary', 'accidental_damage'],
    exclusions: [
      { code: 'HM-01', label: 'Gradual leaks and wear and tear', keywords: ['gradual', 'wear', 'for months', 'slow leak'] },
      { code: 'HM-02', label: 'Property unoccupied for more than 60 days', keywords: ['unoccupied', 'vacant'] },
      { code: 'HM-04', label: 'Theft without forced entry', keywords: ['no forced entry', 'door was open', 'left open'] },
    ],
    conditions: ['Incidents must be reported within 14 days.', 'Burglary and fire need an official report.', 'Repairs need an itemised quote before authorisation.'],
  },
};

export const PRODUCT_LABEL: Record<Product, string> = { motor: 'Motor', travel: 'Travel', medical: 'Medical', home: 'Home' };
export const PRODUCT_COVERAGES: Record<Product, CoverageType[]> = {
  motor: ['comprehensive', 'third_party'],
  travel: ['travel_essential', 'travel_plus'],
  medical: ['medical_essential', 'medical_plus', 'medical_premier'],
  home: ['home_combined', 'home_buildings', 'home_contents'],
};
export const PRODUCT_INCIDENTS: Record<Product, IncidentType[]> = {
  motor: ['collision', 'theft', 'weather', 'glass'],
  travel: ['medical_emergency', 'trip_cancellation', 'baggage_loss', 'flight_delay'],
  medical: ['outpatient', 'inpatient', 'pharmacy'],
  home: ['water_damage', 'fire', 'burglary', 'accidental_damage'],
};
export const INCIDENT_LABEL: Record<IncidentType, string> = {
  collision: 'Collision', theft: 'Vehicle theft', weather: 'Weather / flood', glass: 'Glass only',
  medical_emergency: 'Medical emergency abroad', trip_cancellation: 'Trip cancellation', baggage_loss: 'Lost or delayed baggage', flight_delay: 'Flight delay',
  outpatient: 'Outpatient treatment', inpatient: 'Hospital admission', pharmacy: 'Pharmacy / medicines',
  fire: 'Fire', water_damage: 'Water damage', burglary: 'Burglary', accidental_damage: 'Accidental damage',
};
/** Label for the "repairer / provider" field per product. */
export const PROVIDER_LABEL: Record<Product, string> = { motor: 'Garage / repairer', travel: 'Hospital, airline or provider', medical: 'Clinic or hospital', home: 'Contractor / repairer' };

export const TRAVEL_PRICING = {
  perDay: { gcc: 6, worldwide_ex_us: 11, worldwide: 17 } as Record<'gcc' | 'worldwide_ex_us' | 'worldwide', number>,
  annual: { gcc: 450, worldwide_ex_us: 820, worldwide: 1250 } as Record<'gcc' | 'worldwide_ex_us' | 'worldwide', number>,
  plusFactor: 0.3,
  age65: 0.5,
  age75: 1.0,
  familyDiscount: { minTravellers: 3, factor: -0.1 },
  minimum: 60,
  maxTripDays: 92,
};
export const MEDICAL_PRICING = {
  ageBands: [ { max: 17, base: 2400 }, { max: 39, base: 3600 }, { max: 54, base: 5200 }, { max: 64, base: 7800 }, { max: 120, base: 11000 } ],
  planFactor: { medical_essential: 1, medical_plus: 1.35, medical_premier: 1.8 } as Record<string, number>,
  networkFactor: { Standard: 0, Extended: 0.08, 'Nationwide+': 0.15 } as Record<string, number>,
  preExistingLoading: 0.15,
  familyDiscount: { minMembers: 3, factor: -0.05 },
  annualLimit: { medical_essential: 500_000, medical_plus: 1_000_000, medical_premier: 2_000_000 } as Record<string, number>,
  waitingDays: 30,
};
export const HOME_PRICING = {
  buildingRate: 0.0008, contentsRate: 0.0035, valuablesRate: 0.012,
  minimum: 400, villaFactor: 0.1, noAlarmFactor: 0.1, floodZoneFactor: 0.25,
  deductibleDiscount: { 500: 0, 1000: -0.05, 2000: -0.1 } as Record<number, number>,
};

export const REPORTING_WINDOW_DAYS = 14;

export const REQUIRED_DOCS: Record<IncidentType, DocType[]> = {
  collision: ['claim_form', 'police_report', 'repair_estimate', 'damage_photos', 'driver_license'],
  theft: ['claim_form', 'police_report', 'registration', 'driver_license'],
  weather: ['claim_form', 'repair_estimate', 'damage_photos'],
  glass: ['claim_form', 'repair_estimate', 'damage_photos'],
  medical_emergency: ['claim_form', 'medical_report', 'invoice', 'boarding_pass'],
  trip_cancellation: ['claim_form', 'booking_confirmation', 'invoice', 'medical_report'],
  baggage_loss: ['claim_form', 'baggage_report', 'boarding_pass', 'invoice'],
  flight_delay: ['claim_form', 'airline_delay_letter', 'boarding_pass'],
  outpatient: ['claim_form', 'medical_report', 'invoice'],
  inpatient: ['claim_form', 'medical_report', 'discharge_summary', 'invoice'],
  pharmacy: ['claim_form', 'prescription', 'invoice'],
  fire: ['claim_form', 'fire_report', 'damage_photos', 'repair_estimate'],
  water_damage: ['claim_form', 'damage_photos', 'repair_estimate'],
  burglary: ['claim_form', 'police_report', 'proof_of_ownership', 'damage_photos'],
  accidental_damage: ['claim_form', 'damage_photos', 'repair_estimate'],
};

export const DOC_LABELS: Record<DocType, string> = {
  claim_form: 'Claim form',
  police_report: 'Police / traffic report',
  repair_estimate: 'Repair estimate',
  damage_photos: 'Damage photos',
  driver_license: 'Driver licence',
  registration: 'Vehicle registration',
  medical_report: 'Medical report',
  invoice: 'Invoice / receipts',
  boarding_pass: 'Boarding pass / tickets',
  booking_confirmation: 'Booking confirmation',
  baggage_report: 'Airline baggage report (PIR)',
  airline_delay_letter: 'Airline delay letter',
  prescription: 'Prescription',
  discharge_summary: 'Discharge summary',
  proof_of_ownership: 'Proof of ownership',
  fire_report: 'Civil defence fire report',
};

export const ASSESSMENT = {
  estimateVarianceWarnPct: 0.15,
  labourRateBenchmarkPerHour: 180,
  labourRateTolerancePct: 0.2,
};

export const ANOMALY_RULES = {
  earlyClaimDays: 60,
  repeatGarageWindowDays: 180,
  repeatGarageMinOtherClaims: 2,
  estimateAboveClaimPct: 0.25,
  estimateToVehicleValuePct: 0.4,
  customerClaimsWindowDays: 365,
  customerClaimsThreshold: 2,
  indicatorsForReferral: 2,
};

export const RENEWAL = {
  windowDays: 60,
  marketAdjustment: 0.03,
  annualDepreciation: 0.1,
  perClaimLoading: 0.1,
  claimFreeDiscount: -0.05,
  followUpDaysBeforeExpiry: 14,
};
