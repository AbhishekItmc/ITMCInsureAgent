import { useEffect, useState } from 'react';
import { RefreshCcw, Save } from 'lucide-react';
import { RENEWAL_ASKS, type RenewalAgentOutput } from '../../agents/renewalAgent';
import type { AgentResult } from '../../agents/runtime';
import { fmtDate, fmtDateTime, money } from '../../lib/format';
import { useDemo } from '../../store/store';
import { prepareRenewal, saveRenewalDraft } from '../../store/workflows';
import { AgentTrace } from '../../ui/agents';
import { Button, Card, DemoTag, Field, Notice, Pill, cx, toast } from '../../ui/primitives';

export function RenewalWorkbench({ policyId, actor }: { policyId: string; actor: string }) {
  const s = useDemo();
  const policy = s.policies.find((p) => p.id === policyId);
  const renewal = s.renewals.find((r) => r.policyId === policyId);
  const task = renewal ? s.tasks.find((t) => t.id === renewal.followUpTaskId) : undefined;
  const [supplied, setSupplied] = useState({ mileage: '', addressConfirmed: false, driverChanges: '' });
  const [result, setResult] = useState<AgentResult<RenewalAgentOutput> | null>(null);
  const [draft, setDraft] = useState(renewal?.communicationDraft ?? '');
  useEffect(() => { setDraft(renewal?.communicationDraft ?? ''); }, [renewal?.communicationDraft, policyId]);
  useEffect(() => { setResult(null); }, [policyId]);
  if (!policy) return null;

  const run = () => {
    const r = prepareRenewal(policyId, supplied);
    setResult(r.result);
    toast(r.renewalId ? `Renewal draft ${r.renewalId} prepared` : r.result.summary, r.renewalId ? 'ok' : 'warn');
  };
  const est = renewal?.estimate;
  const notRenewable = policy.product === 'travel' && policy.travel?.tripType === 'single';
  const delta = est ? est.total - renewal!.currentPremium : 0;

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Card title="Renewal inputs" subtitle={`${policy.id} · expires ${fmtDate(policy.expiryDate)}`}>
          <div className="space-y-4">
            {notRenewable && <Notice tone="info" title="Single-trip policy">This single-trip travel policy ends with the trip and is not renewed. The Renewal Agent will confirm this; offer the customer a new travel quote or annual multi-trip cover instead.</Notice>}
            <Field label={RENEWAL_ASKS[policy.product].first + (policy.product === 'motor' ? ' (km)' : '')} hint="Leave blank to see how the agent flags missing information"><input id="r-mileage" inputMode={policy.product === 'motor' ? 'numeric' : 'text'} className="input" value={supplied.mileage} onChange={(e) => setSupplied({ ...supplied, mileage: e.target.value })} /></Field>
            <Field label={RENEWAL_ASKS[policy.product].second}><input id="r-drivers" className="input" placeholder="e.g. none" value={supplied.driverChanges} onChange={(e) => setSupplied({ ...supplied, driverChanges: e.target.value })} /></Field>
            <label className="flex items-center gap-2 text-[13px]"><input id="r-address" type="checkbox" className="h-4 w-4 accent-[rgb(var(--teal))]" checked={supplied.addressConfirmed} onChange={(e) => setSupplied({ ...supplied, addressConfirmed: e.target.checked })} /> Address on file is current</label>
            <Button variant="primary" onClick={run}><RefreshCcw size={16} /> {renewal ? 'Re-run Renewal Agent' : 'Run Renewal Agent'}</Button>
          </div>
        </Card>
        <Card title="Illustrative renewal estimate" action={renewal && <Pill tone={renewal.status === 'saved' ? 'ok' : 'info'}>{renewal.status === 'saved' ? `Draft saved ${fmtDateTime(renewal.savedAt)}` : 'Unsaved draft'}</Pill>}>
          {!renewal || !est ? <p className="text-[13.5px] text-muted">Run the Renewal Agent to retrieve the policy, summarise cover, estimate the renewal premium, list missing information, draft a communication and create a follow-up task.</p> : (
            <div>
              <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
                <div><div className="text-[12px] text-muted">Estimated renewal premium</div><div className="font-display text-[28px] font-extrabold tnum">{money(est.total, { decimals: true })}</div></div>
                <div className="pb-1 text-[13px] text-muted">vs {money(renewal.currentPremium, { decimals: true })} this term · <span className={delta > 0 ? 'text-warn' : 'text-ok'}>{delta > 0 ? '+' : '−'}{money(Math.abs(delta), { decimals: true })}</span></div>
                <DemoTag>Illustrative · not an offer</DemoTag>
              </div>
              <table className="mt-4 w-full text-[13px]">
                <tbody className="divide-y divide-line">
                  {est.lines.map((l, i) => (
                    <tr key={i}><td className="py-1.5 pr-3"><span className="text-ink">{l.label}</span>{l.note && <span className="block text-[11.5px] text-muted">{l.note}</span>}</td><td className={cx('py-1.5 text-right font-mono tnum', l.amount < 0 && 'text-ok')}>{l.amount < 0 ? '−' : ''}{Math.abs(l.amount).toFixed(2)}</td></tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-4 eyebrow">Current coverage</div>
              <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[13px]">{renewal.coverageSummary.map((c) => <li key={c}>{c}</li>)}</ul>
              {renewal.missingInfo.length > 0 && <div className="mt-4"><Notice tone="warn" title="Missing information">{renewal.missingInfo.join(' · ')}</Notice></div>}
            </div>
          )}
        </Card>
      </div>

      {renewal && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
          <Card title="Renewal communication draft" subtitle="Review and edit. Saving stores the draft only; nothing is sent.">
            <textarea id="r-draft" rows={16} className="input font-mono text-[12.5px] leading-relaxed" value={draft} onChange={(e) => setDraft(e.target.value)} />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button variant="primary" onClick={() => { saveRenewalDraft(renewal.id, draft, actor); toast('Renewal draft saved. No message was sent.'); }}><Save size={16} /> Save renewal draft</Button>
              <span className="text-[12px] text-muted">No email or SMS is sent and no payment is processed.</span>
            </div>
          </Card>
          <div className="space-y-5">
            {task && (
              <Card title="Follow-up task">
                <div className="text-[13.5px] font-medium">{task.title}</div>
                <div className="mt-1 text-[12.5px] text-muted">{task.owner} · due {fmtDate(task.dueDate)} · <span className="font-mono">{task.id}</span></div>
                <div className="mt-2"><Pill tone={task.status === 'open' ? 'info' : 'ok'}>{task.status === 'open' ? 'Open' : 'Done'}</Pill></div>
              </Card>
            )}
            {result && <AgentTrace agent="Renewal Agent" summary={result.summary} trace={result.trace} />}
          </div>
        </div>
      )}
    </div>
  );
}
