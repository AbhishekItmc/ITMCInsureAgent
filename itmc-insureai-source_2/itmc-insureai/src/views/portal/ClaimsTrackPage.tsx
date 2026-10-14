import { Check, Paperclip, Upload } from 'lucide-react';
import { DOC_LABELS, INCIDENT_LABEL, PRODUCT_LABEL, PROVIDER_LABEL } from '../../config/rules';
import { useNav } from '../../lib/nav';
import { fmtDate, fmtDateTime, money } from '../../lib/format';
import { CLAIM_STATUS } from '../../lib/selectors';
import { useDemo } from '../../store/store';
import { uploadRequestedDocument } from '../../store/workflows';
import type { Claim, ClaimStatus } from '../../types';
import { Button, Card, Empty, KV, Notice, PageHeader, Pill, Ref, cx, toast } from '../../ui/primitives';
import { ViewingAs } from './common';

const STAGES = ['Claim Registered', 'Under Investigation', 'Human Review', 'Assessment Completed'];
const stageOf = (s: ClaimStatus) => ({ registered: 0, documents_received: 1, under_investigation: 1, awaiting_review: 2, docs_required: 2, escalated: 2, manual_assessment: 2, assessment_completed: 3 }[s]);

const NEXT: Record<ClaimStatus, string> = {
  registered: 'Your claim is with our claims team. They will start the investigation shortly.',
  under_investigation: 'Our AI agents are reviewing your documents and policy right now. A person will review their findings.',
  awaiting_review: 'A claims reviewer is checking the investigation report. You will see their decision here.',
  docs_required: 'We need more documents before we can continue. Please upload them below.',
  documents_received: 'Thanks. We have everything we asked for. The claims team will re-run the review.',
  escalated: 'A senior reviewer is looking at your claim. No action is needed from you right now.',
  manual_assessment: 'A claims handler is reviewing your claim directly. No action is needed from you right now.',
  assessment_completed: 'The review is complete and your claim has passed to the adjuster for the next step. Any decision on cover or payment will be communicated separately.',
};

function Stepper({ c }: { c: Claim }) {
  const cur = stageOf(c.status);
  const done = c.status === 'assessment_completed';
  return (
    <ol className="grid grid-cols-4 gap-2">
      {STAGES.map((label, i) => {
        const state = i < cur || (done && i === cur) ? 'done' : i === cur ? 'current' : 'todo';
        const display = i === cur && !done ? CLAIM_STATUS[c.status].customer : label;
        return (
          <li key={label} className="min-w-0">
            <div className={cx('h-1.5 rounded-full', state === 'done' ? 'bg-ok' : state === 'current' ? (c.status === 'docs_required' ? 'bg-warn' : 'bg-teal') : 'bg-line')} />
            <div className={cx('mt-2 text-[12px] font-medium leading-tight', state === 'todo' ? 'text-muted' : 'text-ink')}>{display}</div>
          </li>
        );
      })}
    </ol>
  );
}

export function ClaimsTrackPage() {
  const s = useDemo();
  const { viewer, route, go } = useNav();
  const claims = s.claims.filter((c) => c.customerId === viewer).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const selected = claims.find((c) => c.id === route.params?.claimId) ?? claims[0];

  return (
    <div>
      <PageHeader eyebrow="Step 6 · Tracking" title="Track my claims" description="The same status the claims team sees, in plain language." actions={<ViewingAs />} />
      {!claims.length ? <Empty>No claims for this customer. <button className="font-medium text-tealink underline" onClick={() => go('portal', 'claim-new')}>Register a claim</button>.</Empty> : (
        <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="space-y-2">
            {claims.map((c) => (
              <button key={c.id} onClick={() => go('portal', 'claims', { claimId: c.id })} className={cx('w-full rounded-xl border bg-surface p-4 text-left', c.id === selected?.id ? 'border-teal shadow-[0_0_0_3px_rgb(var(--teal)/0.12)]' : 'border-line hover:border-teal/50')}>
                <div className="flex items-center justify-between gap-2"><Ref>{c.id}</Ref></div>
                <div className="mt-1 text-[12.5px] text-muted">{PRODUCT_LABEL[c.product]} · {INCIDENT_LABEL[c.incidentType]} · {fmtDate(c.incidentDate)}</div>
                <div className="mt-2"><Pill tone={CLAIM_STATUS[c.status].tone}>{CLAIM_STATUS[c.status].customer}</Pill></div>
              </button>
            ))}
          </div>
          {selected && <ClaimTracker c={selected} />}
        </div>
      )}
    </div>
  );
}

function ClaimTracker({ c }: { c: Claim }) {
  const s = useDemo();
  const req = s.documentRequests.find((r) => r.claimId === c.id && r.status === 'open');
  return (
    <div className="space-y-5">
      <Card title={<span className="flex flex-wrap items-center gap-2"><span className="font-mono">{c.id}</span><Pill tone={CLAIM_STATUS[c.status].tone}>{CLAIM_STATUS[c.status].customer}</Pill></span>} subtitle={`Policy ${c.policyId} · vehicle ${c.vehiclePlate}`}>
        <Stepper c={c} />
        <p className="mt-5 text-[14px] text-ink">{NEXT[c.status]}</p>
      </Card>

      {req && (
        <Card title="Documents requested" subtitle={`Requested ${fmtDateTime(req.requestedAt)}`}>
          <Notice tone="warn">{req.message}</Notice>
          <ul className="mt-4 space-y-2">
            {req.documents.map((t) => {
              const have = c.documents.some((d) => d.type === t);
              return (
                <li key={t} className="flex flex-wrap items-center gap-3 rounded-lg border border-line px-3 py-2.5">
                  <span className="min-w-0 flex-1 text-[13.5px] font-medium">{DOC_LABELS[t]}</span>
                  {have ? <Pill tone="ok">Received</Pill> : (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="primary" onClick={() => { uploadRequestedDocument(c.id, t); toast(`${DOC_LABELS[t]} uploaded`); }}><Upload size={14} /> Upload sample {DOC_LABELS[t].toLowerCase()}</Button>
                      <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[13px] font-medium hover:bg-sunken">
                        <Paperclip size={14} /> Choose file
                        <input id={`up-${t}`} type="file" className="sr-only" onChange={(e) => { const file = e.target.files?.[0]; if (file) { uploadRequestedDocument(c.id, t, { name: file.name, sizeKb: Math.max(1, Math.round(file.size / 1024)) }); toast(`${file.name} received (metadata only)`); } }} />
                      </label>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="Claim details">
          <KV items={[
            ['Incident', `${PRODUCT_LABEL[c.product]} · ${INCIDENT_LABEL[c.incidentType]} · ${fmtDate(c.incidentDate)}`], ['Reported', fmtDate(c.reportedDate)],
            ['Location', c.location], [c.product === 'motor' || c.product === 'home' ? 'Your estimate' : 'Amount claimed', money(c.estimatedDamage)], [PROVIDER_LABEL[c.product], c.garage],
          ]} />
          <p className="mt-4 text-[13px] text-muted">{c.description}</p>
          <div className="mt-4 eyebrow">Documents on file</div>
          <ul className="mt-2 space-y-1">
            {c.documents.map((d) => <li key={d.id} className="flex items-center gap-2 text-[13px]"><Check size={14} className="text-ok" /><span className="text-ink">{DOC_LABELS[d.type]}</span><span className="truncate font-mono text-[11.5px] text-muted">{d.fileName}</span></li>)}
          </ul>
        </Card>
        <Card title="Status history">
          <ol className="space-y-3">
            {[...c.statusHistory].reverse().map((h, i) => (
              <li key={i} className="flex gap-3">
                <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', i === 0 ? 'bg-teal' : 'bg-line')} />
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-ink">{CLAIM_STATUS[h.status].customer}</div>
                  <div className="font-mono text-[11px] text-muted">{fmtDateTime(h.at)}</div>
                  {h.status === 'docs_required' && h.note && <div className="text-[12px] text-muted">{h.note}</div>}
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </div>
  );
}
