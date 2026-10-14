import { useNav } from '../../lib/nav';
import { fmtDateTime } from '../../lib/format';
import { APPROVAL_STATUS, CLAIM_STATUS, customerName } from '../../lib/selectors';
import { useDemo } from '../../store/store';
import { Card, Empty, PageHeader, Pill, Ref, Table, Td } from '../../ui/primitives';
import { ReportAndDecision } from './ClaimWorkbench';

export function ApprovalQueue() {
  const s = useDemo();
  const { go } = useNav();
  const pending = s.approvals.filter((a) => a.status === 'pending');
  const decided = s.approvals.filter((a) => a.status !== 'pending').sort((a, b) => (b.decidedAt ?? '').localeCompare(a.decidedAt ?? ''));
  return (
    <div>
      <PageHeader eyebrow="Operations Console" title="Human approval queue" description="Agents recommend; people decide. Every report waits here until a reviewer records a decision." />
      <div className="space-y-5">
        {pending.length === 0 ? <Empty>Nothing waiting for review. Run an investigation from a claim to add one.</Empty> : pending.map((a) => {
          const claim = s.claims.find((c) => c.id === a.claimId)!;
          const inv = claim.investigations.find((i) => i.runId === a.investigationRunId);
          return (
            <div key={a.id} className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <button className="font-mono text-[14px] font-semibold text-tealink hover:underline" onClick={() => go('ops', 'claim', { claimId: claim.id })}>{claim.id}</button>
                <span className="text-[13px] text-muted">{customerName(s, claim.customerId)} · waiting since {fmtDateTime(a.createdAt)}</span>
                <Pill tone={CLAIM_STATUS[claim.status].tone}>{CLAIM_STATUS[claim.status].ops}</Pill>
              </div>
              {inv?.report && <ReportAndDecision claim={claim} report={inv.report} approval={a} />}
            </div>
          );
        })}
        <Card title="Decision history" pad={false}>
          <Table head={['Approval', 'Claim', 'Recommendation', 'Decision', 'Reviewer', 'Notes', 'Decided']}>
            {decided.map((a) => (
              <tr key={a.id}>
                <Td mono>{a.id}</Td><Td><Ref>{a.claimId}</Ref></Td><Td className="max-w-[240px] text-[12.5px]">{a.recommendation.label}</Td>
                <Td><Pill tone={APPROVAL_STATUS[a.status].tone}>{APPROVAL_STATUS[a.status].label}</Pill></Td>
                <Td className="text-[12.5px]">{a.decidedBy ?? 'System'}</Td><Td className="max-w-[220px] text-[12.5px] text-muted">{a.notes ?? '—'}</Td>
                <Td className="whitespace-nowrap font-mono text-[11.5px] text-muted">{fmtDateTime(a.decidedAt)}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </div>
  );
}
