// Shared synthetic data model used by both the Customer Portal and the Operations Console.

export type ISODate = string; // YYYY-MM-DD
export type ISOTime = string; // full ISO timestamp

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  dateOfBirth: ISODate;
  city: string;
  address?: string;
  nationalIdMasked?: string;
  createdAt: ISOTime;
}

export type Product = 'motor' | 'travel' | 'medical' | 'home';
export type CoverageType =
  | 'comprehensive' | 'third_party'                 // motor
  | 'travel_essential' | 'travel_plus'              // travel
  | 'medical_essential' | 'medical_plus' | 'medical_premier' // medical
  | 'home_buildings' | 'home_contents' | 'home_combined';    // home
export type VehicleUsage = 'private' | 'commercial';
export type AddOn = 'roadside' | 'agency_repair' | 'rental_car' | 'personal_accident';

export interface Vehicle {
  make: string;
  model: string;
  year: number;
  value: number; // market value
  plate?: string;
  vin?: string;
  usage: VehicleUsage;
}

export interface TravelDetails {
  tripType: 'single' | 'annual';
  region: 'gcc' | 'worldwide_ex_us' | 'worldwide';
  destination: string;
  startDate: ISODate;
  endDate: ISODate;
  travellers: { name: string; age: number }[];
  passportNo?: string;
}

export interface MedicalMember { name: string; age: number; relation: 'self' | 'spouse' | 'child' | 'parent' }
export interface MedicalDetails {
  members: MedicalMember[];
  preExisting: boolean;
  network: 'Standard' | 'Extended' | 'Nationwide+';
  declarationConfirmed?: boolean;
}

export interface HomeDetails {
  propertyType: 'apartment' | 'villa';
  ownership: 'owner' | 'tenant';
  address: string;
  buildingValue: number;
  contentsValue: number;
  valuablesValue: number;
  alarm: boolean;
  floodZone: boolean;
}

export interface DriverProfile {
  age: number;
  licenseYears: number;
  claimsLast3Years: number;
}

export interface PremiumLine {
  label: string;
  amount: number;
  kind: 'base' | 'factor' | 'discount' | 'addon' | 'tax';
  note?: string;
}

export interface PremiumBreakdown {
  lines: PremiumLine[];
  netPremium: number;
  vat: number;
  total: number;
}

export type QuoteStatus = 'quoted' | 'converted';

export interface Quote {
  id: string;
  customerId: string;
  product: Product;
  /** Short human description of what is insured, e.g. "2024 Toyota RAV4" or "Villa, Al Malqa". */
  subject: string;
  vehicle?: Vehicle;
  driver?: DriverProfile;
  travel?: TravelDetails;
  medical?: MedicalDetails;
  home?: HomeDetails;
  sumInsured?: number;
  coverage: CoverageType;
  deductible: number;
  addOns: AddOn[];
  premium: PremiumBreakdown;
  assumptions: string[];
  missingInfo: string[];
  status: QuoteStatus;
  createdAt: ISOTime;
  validUntil: ISODate;
  policyId?: string;
}

export type PolicyStatus = 'active' | 'expired' | 'cancelled';

export interface Policy {
  id: string;
  quoteId: string;
  customerId: string;
  product: Product;
  subject: string;
  vehicle?: Vehicle;
  travel?: TravelDetails;
  medical?: MedicalDetails;
  home?: HomeDetails;
  coverage: CoverageType;
  sumInsured: number;
  deductible: number;
  addOns: AddOn[];
  annualPremium: number;
  effectiveDate: ISODate;
  expiryDate: ISODate;
  status: PolicyStatus;
  namedDrivers?: string[];
  createdAt: ISOTime;
  isDemo: true;
}

export type IncidentType =
  | 'collision' | 'theft' | 'weather' | 'glass'                                        // motor
  | 'medical_emergency' | 'trip_cancellation' | 'baggage_loss' | 'flight_delay'         // travel
  | 'outpatient' | 'inpatient' | 'pharmacy'                                            // medical
  | 'fire' | 'water_damage' | 'burglary' | 'accidental_damage';                         // home

export type DocType =
  | 'claim_form'
  | 'police_report'
  | 'repair_estimate'
  | 'damage_photos'
  | 'driver_license'
  | 'registration'
  | 'medical_report'
  | 'invoice'
  | 'boarding_pass'
  | 'booking_confirmation'
  | 'baggage_report'
  | 'airline_delay_letter'
  | 'prescription'
  | 'discharge_summary'
  | 'proof_of_ownership'
  | 'fire_report';

export interface ClaimDocument {
  id: string;
  type: DocType;
  fileName: string;
  uploadedAt: ISOTime;
  source: 'sample' | 'upload';
  sizeKb?: number;
  /** Simulated machine-readable content of the document (what OCR/extraction would produce). */
  fields: Record<string, string | number>;
}

export type ClaimStatus =
  | 'registered'
  | 'under_investigation'
  | 'awaiting_review'
  | 'docs_required'
  | 'documents_received'
  | 'escalated'
  | 'manual_assessment'
  | 'assessment_completed';

export interface StatusEvent {
  status: ClaimStatus;
  at: ISOTime;
  by: string;
  note?: string;
}

export type Severity = 'info' | 'warning' | 'critical';

export interface Evidence {
  label: string;
  value: string;
  source: string; // which record / document
}

export interface Finding {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  evidence: Evidence[];
}

export type AgentName =
  | 'Quote Agent'
  | 'Policy Agent'
  | 'Document Intelligence Agent'
  | 'Policy Intelligence Agent'
  | 'Claims Assessment Agent'
  | 'Fraud Investigation Assistant'
  | 'Supervisor Agent'
  | 'Renewal Agent'
  | 'Orchestrator Agent'
  | 'Chatbot Agent'
  | 'Policy Servicing Agent'
  | 'Customer Communications Agent';

export type StepStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface AgentStep {
  agent: AgentName;
  status: StepStatus;
  task: string;
  startedAt?: ISOTime;
  completedAt?: ISOTime;
  outputSummary?: string;
  findings: Finding[];
  trace?: string[];
  /** Structured output of the agent (serialisable). */
  output?: unknown;
}

export type RecommendationCode =
  | 'REQUEST_DOCUMENTS'
  | 'REFER_SENIOR_REVIEW'
  | 'INDEPENDENT_INSPECTION'
  | 'STANDARD_ADJUSTER';

export interface Recommendation {
  code: RecommendationCode;
  label: string;
  rationale: string;
  nextOwner: string;
}

export interface InvestigationReport {
  claimSummary: string;
  documentsReviewed: { type: DocType; fileName: string; keyFields: string }[];
  coverageObservations: string[];
  missingDocuments: DocType[];
  inconsistencies: Finding[];
  anomalies: Finding[];
  outstandingQuestions: string[];
  uncertainty: string[];
  recommendation: Recommendation;
  confidence: 'Low' | 'Medium' | 'High';
}

export type InvestigationStatus = 'running' | 'completed' | 'interrupted';

export interface Investigation {
  runId: string;
  status: InvestigationStatus;
  startedAt: ISOTime;
  completedAt?: ISOTime;
  engine: 'simulated';
  steps: AgentStep[];
  report?: InvestigationReport;
}

export interface Claim {
  id: string;
  policyId: string;
  customerId: string;
  incidentType: IncidentType;
  incidentDate: ISODate;
  reportedDate: ISODate;
  location: string;
  description: string;
  product: Product;
  vehiclePlate?: string;
  estimatedDamage: number;
  garage: string;
  documents: ClaimDocument[];
  status: ClaimStatus;
  statusHistory: StatusEvent[];
  investigations: Investigation[];
  createdAt: ISOTime;
}

export type ApprovalStatus = 'pending' | 'approved' | 'docs_requested' | 'escalated' | 'rejected';

export interface Approval {
  id: string;
  claimId: string;
  investigationRunId: string;
  recommendation: Recommendation;
  status: ApprovalStatus;
  createdAt: ISOTime;
  decidedAt?: ISOTime;
  decidedBy?: string;
  notes?: string;
}

export interface DocumentRequest {
  id: string;
  claimId: string;
  documents: DocType[];
  status: 'open' | 'fulfilled';
  requestedAt: ISOTime;
  fulfilledAt?: ISOTime;
  message: string;
}

export interface FollowUpTask {
  id: string;
  title: string;
  owner: string;
  dueDate: ISODate;
  status: 'open' | 'done';
  relatedId: string;
}

export interface Renewal {
  id: string;
  policyId: string;
  status: 'draft' | 'saved';
  currentPremium: number;
  estimate: PremiumBreakdown;
  coverageSummary: string[];
  missingInfo: string[];
  communicationDraft: string;
  followUpTaskId: string;
  createdAt: ISOTime;
  savedAt?: ISOTime;
}

export type ActorType = 'customer' | 'agent' | 'human' | 'system';

export interface AuditEvent {
  id: string;
  at: ISOTime;
  actor: string;
  actorType: ActorType;
  action: string;
  entityType: 'customer' | 'quote' | 'policy' | 'claim' | 'approval' | 'renewal' | 'task' | 'system';
  entityId: string;
  detail: string;
}

export interface AgentRun {
  id: string;
  agent: AgentName;
  task: string;
  entityId: string;
  status: StepStatus;
  startedAt: ISOTime;
  completedAt?: ISOTime;
  outputSummary?: string;
}

export interface DemoState {
  version: number;
  customers: Customer[];
  quotes: Quote[];
  policies: Policy[];
  claims: Claim[];
  approvals: Approval[];
  documentRequests: DocumentRequest[];
  renewals: Renewal[];
  tasks: FollowUpTask[];
  audit: AuditEvent[];
  agentRuns: AgentRun[];
  orchestratorRuns: OrchestratorRun[];
  serviceRequests: ServiceRequest[];
  communications: Communication[];
  counters: Record<string, number>;
}

/* ── Orchestrator Agent ── */

export type WorkKind = 'INVESTIGATE_CLAIM' | 'PREPARE_RENEWAL' | 'REVIEW_QUOTE' | 'PROCESS_SERVICE' | 'DOC_REMINDER' | 'QUOTE_FOLLOWUP' | 'HUMAN_REVIEW' | 'SERVICE_APPROVAL' | 'CUSTOMER_DOCS';

export interface WorkItem {
  kind: WorkKind;
  targetId: string;
  title: string;
  reason: string;
  /** true when the Orchestrator may act on it; false when it must wait for a person. */
  actionable: boolean;
  agents: AgentName[];
  owner: string;
  priority: number; // lower runs first
}

export interface OrchestratorStep {
  id: string;
  kind: WorkKind;
  targetId: string;
  title: string;
  agents: AgentName[];
  status: StepStatus | 'skipped';
  startedAt?: ISOTime;
  completedAt?: ISOTime;
  result?: string;
}

export interface Handoff { targetId: string; owner: string; note: string }

export interface OrchestratorRun {
  id: string;
  trigger: 'autopilot' | 'command';
  command?: string;
  intent: string;
  interpretation: string;
  response: string[];
  status: 'running' | 'completed' | 'refused' | 'failed' | 'interrupted';
  steps: OrchestratorStep[];
  handoffs: Handoff[];
  trace: string[];
  summary?: string;
  startedAt: ISOTime;
  completedAt?: ISOTime;
}

/* ── Policy servicing & communications ── */

export type ServiceType = 'address_change' | 'add_driver' | 'vehicle_change' | 'add_member' | 'sum_insured_change' | 'trip_extension' | 'cancellation';
export type ServiceStatus = 'submitted' | 'pending_approval' | 'applied' | 'rejected';

export interface ServiceAssessment {
  summary: string;
  risk: 'low' | 'medium' | 'high';
  checks: { label: string; ok: boolean; detail: string }[];
  premiumDelta: number; // positive = additional premium, negative = refund (illustrative)
  autoApply: boolean;
  recommendation: string;
}

export interface ServiceRequest {
  id: string;
  policyId: string;
  customerId: string;
  type: ServiceType;
  details: Record<string, string>;
  channel: 'portal' | 'chat';
  status: ServiceStatus;
  assessment?: ServiceAssessment;
  createdAt: ISOTime;
  processedAt?: ISOTime;
  decidedAt?: ISOTime;
  decidedBy?: string;
  notes?: string;
}

export type CommKind = 'doc_reminder' | 'quote_followup' | 'service_update';

export interface Communication {
  id: string;
  kind: CommKind;
  customerId: string;
  relatedId: string;
  channel: 'email' | 'sms';
  subject: string;
  body: string;
  status: 'draft' | 'approved';
  createdAt: ISOTime;
  approvedBy?: string;
}
