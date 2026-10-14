import { useState } from 'react';
import { Check, Mail, X } from 'lucide-react';
import { SERVICE_LABEL } from '../../agents/servicingAgents';
import { useNav } from '../../lib/nav';
import { fmtDateTime, money } from '../../lib/format';
import { customerName } from '../../lib/selectors';
import { useDemo } from '../../store/store';
import { approveCommunication, decideServiceRequest, processServiceRequest } from '../../store/workflows';
import type { ServiceRequest } from '../../types';
import { SimulatedTag } from '../../ui/agents';
import { Button, Card, Empty, PageHeader, Pill, Ref, toast, cx } from '../../ui/primitives';

const STATUS: Record<ServiceRequest['status'], { label: string; tone: 'info' | 'warn' | 'ok' | 'neutral' }> = {
  submitted: { label: 'Submitted', tone: 'info' },
  pending_approval: { label: 'Awaiting underwriter', tone: 'warn' },
  applied: { label: 'Applied', tone: 'ok' },
  rejected: { label: 'Rejected', tone: 'neutral' },
};

function RequestCard({ r }: { r: ServiceRequest }) {
  const s = useDemo();
  const { go } = useNav();
  const [notes, setNotes] = useState('');
  const a = r.assessment;
  return (
    <div className={cx('rounded-xl border bg-surface p-4', r.status === 'pending_approval' ? 'border-warn/50' : 'border-line')}>
      <div className="flex flex-wrap items-center gap-2">
        <Ref>{r.id}</Ref>
        <span className="font-semibold">{SERVICE_LABEL[r.type]}</span>
        <Pill tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Pill>
        {a && <Pill tone={a.risk === 'low' ? 'ok' : a.risk === 'medium' ? 'info' : 'warn'} dot={false}>Risk {a.risk}</Pill>}
        <span className="ml-auto text-[12px] text-muted">{customerName(s, r.customerId)} · <button className="font-mono text-tealink hover:underline" onClick={() => go('ops', 'quotes-policies', { tab: 'policies' })}>{r.policyId}</button> · via {r.channel} · {fmtDateTime(r.createdAt)}</span>
      </div>
      <div className="mt-2 text-[12.5px] text-muted">{Object.entries(r.details).map(([k, v]) => `${k}: ${v}`).join(' · ')}</div>
      {a ? (
        <div className="mt-3 space-y-2">
          <p className="text-[13px] text-ink">{a.summary}</p>
          <ul className="grid gap-1 sm:grid-cols-2">
            {a.checks.map((c) => <li key={c.label} className="flex items-start gap-1.5 text-[12.5px]">{c.ok ? <Check size={14} className="mt-0.5 text-ok" /> : <X size={14} className="mt-0.5 text-warn" />}<span><span className="font-medium">{c.label}</span> <span className="text-muted">· {c.detail}</span></span></li>)}
          </ul>
          <div className="flex flex-wrap gap-4 text-[12.5px]">
            <span>Premium impact: <strong className="tnum">{a.premiumDelta === 0 ? 'none' : `${a.premiumDelta > 0 ? '+' : '−'}${money(Math.abs(a.premiumDelta), { decimals: true })}`}</strong> <span className="text-muted">(illustrative)</span></span>
            <span className="text-muted">{a.recommendation}</span>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2"><span className="text-[12.5px] text-muted">Not assessed yet.</span><Button size="sm" onClick={() => { const res = processServiceRequest(r.id); toast(res.summary, res.autoApplied ? 'ok' : 'info'); }}>Run Policy Servicing Agent</Button></div>
      )}
      {r.status === 'pending_approval' && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <input id={`srv-notes-${r.id}`} className="input max-w-sm flex-1" placeholder="Underwriter notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <Button size="sm" variant="primary" onClick={() => { decideServiceRequest(r.id, true, notes); toast(`${r.id} approved and applied to ${r.policyId}`); }}>Approve & apply</Button>
          <Button size="sm" variant="danger" onClick={() => { decideServiceRequest(r.id, false, notes); toast(`${r.id} rejected`, 'info'); }}>Reject</Button>
        </div>
      )}
      {r.decidedBy && <div className="mt-2 text-[12px] text-muted">Decided by {r.decidedBy} · {fmtDateTime(r.decidedAt)}{r.notes ? ` · “${r.notes}”` : ''}</div>}
    </div>
  );
}

export function ServiceComms() {
  const s = useDemo();
  const [open, setOpen] = useState<string | null>(null);
  const reqs = [...s.serviceRequests].reverse();
  const comms = [...s.communications].reverse();
  return (
    <div>
      <PageHeader eyebrow="Operations Console" title="Service & communications" description="Policy change requests handled by the Policy Servicing Agent, and customer messages drafted by the Customer Communications Agent. Low-risk changes are applied automatically; everything else and every message waits for a person." />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card title={`Policy change requests (${reqs.length})`} action={<SimulatedTag />}>
          {reqs.length === 0 ? <Empty>No requests yet. Customers can request changes from My Policies or the chat assistant.</Empty> : <div className="space-y-3">{reqs.map((r) => <RequestCard key={r.id} r={r} />)}</div>}
        </Card>
        <Card title={`Message drafts (${comms.filter((c) => c.status === 'draft').length} awaiting approval)`} subtitle="Nothing is sent in this demo." pad={false}>
          {comms.length === 0 ? <div className="p-5"><Empty>No drafts yet. Run the Orchestrator or ask it to “Draft customer reminders”.</Empty></div> : (
            <ul className="divide-y divide-line">
              {comms.map((m) => (
                <li key={m.id} className="px-5 py-3">
                  <button className="flex w-full items-start gap-2 text-left" onClick={() => setOpen(open === m.id ? null : m.id)} aria-expanded={open === m.id}>
                    <Mail size={16} className="mt-0.5 shrink-0 text-teal" />
                    <span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold">{m.subject}</span><span className="block text-[12px] text-muted">{m.id} · to {customerName(s, m.customerId)} · {m.kind.replace('_', ' ')}</span></span>
                    <Pill tone={m.status === 'draft' ? 'info' : 'ok'}>{m.status === 'draft' ? 'Draft' : 'Approved'}</Pill>
                  </button>
                  {open === m.id && (
                    <div className="mt-2 space-y-2 pl-6">
                      <pre className="whitespace-pre-wrap rounded-lg bg-sunken p-3 font-sans text-[12.5px] text-ink">{m.body}</pre>
                      {m.status === 'draft' ? <Button size="sm" variant="primary" onClick={() => { approveCommunication(m.id); toast('Approved. In this demo no message is actually sent.', 'info'); }}>Approve for sending</Button> : <span className="text-[12px] text-muted">Approved by {m.approvedBy}. Not sent (demo).</span>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
