// Sample claim documents. A document here is its metadata plus the fields an extraction service
// would read from it. No real files are processed.
import type { ClaimDocument, DocType } from '../types';

export interface DocSeedContext {
  claimRef: string;
  incidentDate: string;
  reportedDate: string;
  plate?: string;
  holder: string;
  estimatedDamage: number;
  garage: string;
  description: string;
  uploadedAt: string;
}

export interface EstimateSpec { partsTotal: number; labourHours: number; labourRate: number; paintTotal: number; total?: number; estimateDate?: string }

let docSeq = 0;
export const newDocId = () => `DOC-${Date.now().toString(36).toUpperCase()}-${++docSeq}`;

export function makeSampleDoc(type: DocType, c: DocSeedContext, opts: { estimate?: EstimateSpec; photosDate?: string; licenceExpiry?: string; id?: string; invoiceTotal?: number; invoiceDate?: string } = {}): ClaimDocument {
  const slug = c.claimRef.replace(/[^A-Z0-9]/gi, '');
  const base = { id: opts.id ?? newDocId(), type, uploadedAt: c.uploadedAt, source: 'sample' as const };
  const plate: Record<string, string> = c.plate ? { plate: c.plate } : {};
  switch (type) {
    case 'claim_form':
      return { ...base, fileName: `claim-form-${slug}.pdf`, sizeKb: 184, fields: { incidentDate: c.incidentDate, estimatedAmount: c.estimatedDamage, ...plate, signedBy: c.holder } };
    case 'police_report':
      return { ...base, fileName: c.plate ? `traffic-report-${slug}.pdf` : `police-report-${slug}.pdf`, sizeKb: 422, fields: { reportNo: `TR-${slug.slice(-6)}`, incidentDate: c.incidentDate, reportDate: c.reportedDate, ...plate, ...(c.plate ? { faultAssessment: 'Third party at fault (provisional)' } : { finding: 'Forced entry recorded' }) } };
    case 'repair_estimate': {
      const e = opts.estimate ?? { partsTotal: Math.round(c.estimatedDamage * 0.55), labourHours: 14, labourRate: 175, paintTotal: 0 };
      const paint = e.paintTotal || Math.round(c.estimatedDamage - e.partsTotal - e.labourHours * e.labourRate);
      const total = e.total ?? e.partsTotal + e.labourHours * e.labourRate + paint;
      return { ...base, fileName: `repair-estimate-${slug}.pdf`, sizeKb: 236, fields: { garage: c.garage, estimateDate: e.estimateDate ?? c.reportedDate, ...plate, partsTotal: e.partsTotal, labourHours: e.labourHours, labourRate: e.labourRate, paintTotal: paint, total } };
    }
    case 'damage_photos':
      return { ...base, fileName: `damage-photos-${slug}.zip`, sizeKb: 5820, fields: { count: 6, capturedDate: opts.photosDate ?? c.incidentDate, ...plate } };
    case 'driver_license':
      return { ...base, fileName: `driver-licence-${slug}.jpg`, sizeKb: 312, fields: { holder: c.holder, licenceNo: `DL-${slug.slice(-5)}`, expiryDate: opts.licenceExpiry ?? '2029-03-31' } };
    case 'registration':
      return { ...base, fileName: `registration-${slug}.pdf`, sizeKb: 150, fields: { ...plate, owner: c.holder } };
    case 'medical_report':
      return { ...base, fileName: `medical-report-${slug}.pdf`, sizeKb: 210, fields: { provider: c.garage, treatmentDate: c.incidentDate, patient: c.holder, diagnosis: c.description.slice(0, 70) } };
    case 'invoice':
      return { ...base, fileName: `invoice-${slug}.pdf`, sizeKb: 120, fields: { provider: c.garage, invoiceDate: opts.invoiceDate ?? c.incidentDate, total: opts.invoiceTotal ?? c.estimatedDamage } };
    case 'boarding_pass':
      return { ...base, fileName: `boarding-pass-${slug}.pdf`, sizeKb: 90, fields: { passenger: c.holder, flight: 'IT 214', date: c.incidentDate } };
    case 'booking_confirmation':
      return { ...base, fileName: `booking-${slug}.pdf`, sizeKb: 140, fields: { bookingRef: `BK${slug.slice(-5)}`, travelDate: c.incidentDate, amount: c.estimatedDamage } };
    case 'baggage_report':
      return { ...base, fileName: `pir-${slug}.pdf`, sizeKb: 80, fields: { pirRef: `PIR-${slug.slice(-6)}`, date: c.incidentDate, airline: 'Fictional Air' } };
    case 'airline_delay_letter':
      return { ...base, fileName: `delay-letter-${slug}.pdf`, sizeKb: 70, fields: { flight: 'IT 214', date: c.incidentDate, delayHours: 7 } };
    case 'prescription':
      return { ...base, fileName: `prescription-${slug}.pdf`, sizeKb: 60, fields: { provider: c.garage, date: c.incidentDate, patient: c.holder } };
    case 'discharge_summary':
      return { ...base, fileName: `discharge-${slug}.pdf`, sizeKb: 260, fields: { provider: c.garage, admissionDate: c.incidentDate, patient: c.holder } };
    case 'proof_of_ownership':
      return { ...base, fileName: `receipts-${slug}.zip`, sizeKb: 940, fields: { items: 'Receipts and photos of listed items', total: c.estimatedDamage } };
    case 'fire_report':
      return { ...base, fileName: `civil-defence-${slug}.pdf`, sizeKb: 300, fields: { reportNo: `CD-${slug.slice(-6)}`, incidentDate: c.incidentDate } };
  }
}
