import { RENEWAL } from '../config/rules';
import { daysBetween, todayISO } from './format';
import type { ApprovalStatus, Claim, ClaimStatus, DemoState, Severity } from '../types';

export type Tone = 'neutral' | 'info' | 'ok' | 'warn' | 'crit' | 'teal';

export const CLAIM_STATUS: Record<ClaimStatus, { ops: string; customer: string; tone: Tone }> = {
  registered: { ops: 'Registered', customer: 'Claim Registered', tone: 'neutral' },
  under_investigation: { ops: 'Under Investigation', customer: 'Under Investigation', tone: 'teal' },
  awaiting_review: { ops: 'Awaiting Human Review', customer: 'Awaiting Human Review', tone: 'info' },
  docs_required: { ops: 'Documents Required', customer: 'Additional Documents Required', tone: 'warn' },
  documents_received: { ops: 'Documents Received', customer: 'Documents Received', tone: 'info' },
  escalated: { ops: 'Escalated', customer: 'Under Senior Review', tone: 'warn' },
  manual_assessment: { ops: 'Manual Assessment', customer: 'Under Review', tone: 'neutral' },
  assessment_completed: { ops: 'Assessment Completed', customer: 'Assessment Completed', tone: 'ok' },
};

export const APPROVAL_STATUS: Record<ApprovalStatus, { label: string; tone: Tone }> = {
  pending: { label: 'Pending decision', tone: 'info' },
  approved: { label: 'Next step approved', tone: 'ok' },
  docs_requested: { label: 'Documents requested', tone: 'warn' },
  escalated: { label: 'Escalated', tone: 'warn' },
  rejected: { label: 'Recommendation rejected', tone: 'neutral' },
};

export const SEVERITY_TONE: Record<Severity, Tone> = { info: 'info', warning: 'warn', critical: 'crit' };

export const OPEN_STATUSES: ClaimStatus[] = ['registered', 'under_investigation', 'awaiting_review', 'docs_required', 'documents_received', 'escalated', 'manual_assessment'];

export const isOpen = (c: Claim) => OPEN_STATUSES.includes(c.status);

export const renewalOpportunities = (s: DemoState) =>
  s.policies.filter((p) => {
    if (p.status !== 'active' || (p.product === 'travel' && p.travel?.tripType === 'single')) return false;
    const d = daysBetween(todayISO(), p.expiryDate);
    return d >= 0 && d <= RENEWAL.windowDays;
  });

export function metrics(s: DemoState) {
  return {
    policies: s.policies.length,
    quotes: s.quotes.length,
    openClaims: s.claims.filter(isOpen).length,
    underInvestigation: s.claims.filter((c) => c.status === 'under_investigation').length,
    awaitingApproval: s.approvals.filter((a) => a.status === 'pending').length,
    docRequests: s.documentRequests.filter((r) => r.status === 'open').length,
    renewals: renewalOpportunities(s).length,
    agentRuns: s.agentRuns.length,
  };
}

export const latestInvestigation = (c: Claim) => c.investigations[c.investigations.length - 1];

export const customerName = (s: DemoState, id: string) => s.customers.find((c) => c.id === id)?.name ?? id;
