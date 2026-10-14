import { ProductPill } from '../../ui/ProductPill';
import { ArrowUpRight, Bot, Workflow } from 'lucide-react';
import { scanWork } from '../../agents/orchestrator';
import { useNav, type OpsPage } from '../../lib/nav';
import { fmtDateTime } from '../../lib/format';
import { CLAIM_STATUS, metrics } from '../../lib/selectors';
import { useDemo } from '../../store/store';
import type { ClaimStatus } from '../../types';
import { Card, PageHeader, Pill, Ref, cx } from '../../ui/primitives';
import { SimulatedTag } from '../../ui/agents';

export function Overview() {
  const s = useDemo();
  const { go } = useNav();
  const m = metrics(s);
  const tiles: { label: string; value: number; page: OpsPage; params?: Record<string, string>; hint: string; accent?: boolean }[] = [
    { label: 'Demo policies', value: m.policies, page: 'quotes-policies', params: { tab: 'policies' }, hint: 'Active fictional policies' },
    { label: 'Quotes generated', value: m.quotes, page: 'quotes-policies', params: { tab: 'quotes' }, hint: 'By the Quote Agent' },
    { label: 'Open claims', value: m.openClaims, page: 'claims', params: { filter: 'open' }, hint: 'Not yet assessment-complete' },
    { label: 'Under investigation', value: m.underInvestigation, page: 'claims', params: { filter: 'under_investigation' }, hint: 'Agents running now', accent: m.underInvestigation > 0 },
    { label: 'Awaiting human approval', value: m.awaitingApproval, page: 'approvals', hint: 'Reports ready for a reviewer', accent: m.awaitingApproval > 0 },
    { label: 'Missing-document requests', value: m.docRequests, page: 'claims', params: { filter: 'docs_required' }, hint: 'Open requests to customers' },
    { label: 'Renewal opportunities', value: m.renewals, page: 'renewals', hint: 'Expiring within 60 days' },
    { label: 'Agent executions', value: m.agentRuns, page: 'command', hint: 'Logged agent runs' },
  ];
  const statusCounts = (Object.keys(CLAIM_STATUS) as ClaimStatus[]).map((st) => ({ st, n: s.claims.filter((c) => c.status === st).length })).filter((x) => x.n > 0);
  const max = Math.max(1, ...statusCounts.map((x) => x.n));
  const recent = [...s.agentRuns].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 8);
  const pending = s.approvals.filter((a) => a.status === 'pending');
  const scenario = s.claims.find((c) => c.id === 'CLM-2026-0103');
  const SCENARIO_TEXT: Record<string, string> = {
    'CLM-2026-0105': 'Medical outpatient: clinic invoice is higher than the amount claimed.',
    'CLM-2026-0106': 'Home water damage: photos missing, estimate 29% over claim, “flooded” wording.',
    'CLM-2026-0107': 'Travel baggage loss: airline irregularity report missing.',
  };
  const moreScenarios = Object.keys(SCENARIO_TEXT).map((id) => ({ c: s.claims.find((x) => x.id === id), text: SCENARIO_TEXT[id] })).filter((x): x is { c: NonNullable<typeof x.c>; text: string } => !!x.c && x.c.status === 'registered');
  const work = scanWork(s);
  const actionable = work.filter((w) => w.actionable).length;

  return (
    <div>
      <PageHeader eyebrow="Operations Console" title="Executive overview" description={<>Live counts from the shared demo dataset. Every tile opens the records behind it. <span className="whitespace-nowrap">All values are demo values.</span></>} />

      <button onClick={() => go('ops', 'orchestrator')} className="mb-3 flex w-full flex-wrap items-center gap-3 rounded-xl bg-navy px-5 py-3.5 text-left text-navyink hover:bg-navy/90">
        <Workflow size={20} className="text-teal" />
        <span className="min-w-0 flex-1 text-[13.5px]"><strong>Orchestrator Agent</strong> <span className="text-navymuted">· {actionable} item(s) it can handle now, {work.length - actionable} waiting on people.</span></span>
        <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-teal">Open Orchestrator <ArrowUpRight size={15} /></span>
      </button>

      {scenario && scenario.status === 'registered' && (
        <button onClick={() => go('ops', 'claim', { claimId: scenario.id })} className="mb-5 flex w-full flex-wrap items-center gap-3 rounded-xl border border-teal/50 bg-tealsoft/50 px-5 py-3.5 text-left hover:bg-tealsoft">
          <Bot size={20} className="text-teal" />
          <span className="min-w-0 flex-1 text-[13.5px]"><strong className="text-ink">Ready-to-run scenario:</strong> <span className="text-muted">{scenario.id} has a missing police report and a repair estimate 47% above the claimed amount.</span></span>
          <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-tealink">Open claim workbench <ArrowUpRight size={15} /></span>
        </button>
      )}

      {moreScenarios.length > 0 && (
        <div className="mb-5 grid gap-2 sm:grid-cols-3">
          {moreScenarios.map(({ c, text }) => (
            <button key={c.id} onClick={() => go('ops', 'claim', { claimId: c.id })} className="flex items-start gap-2.5 rounded-xl border border-line bg-surface p-3 text-left hover:border-teal/60">
              <ProductPill product={c.product} />
              <span className="min-w-0 text-[12.5px]"><span className="font-mono font-semibold text-ink">{c.id}</span><span className="block text-muted">{text}</span></span>
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <button key={t.label} onClick={() => go('ops', t.page, t.params)} className={cx('group rounded-xl border bg-surface p-4 text-left transition-colors hover:border-teal/60', t.accent ? 'border-teal/60' : 'border-line')}>
            <div className="flex items-start justify-between gap-2">
              <span className="text-[12.5px] font-medium text-muted">{t.label}</span>
              <ArrowUpRight size={15} className="text-muted group-hover:text-teal" />
            </div>
            <div className="mt-2 font-display text-[30px] font-extrabold leading-none text-ink tnum">{t.value}</div>
            <div className="mt-2 text-[11.5px] text-muted">{t.hint}</div>
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11.5px] text-muted">Demo values computed from fictional records.</p>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card title="Claims by status" subtitle="Click a bar to open the matching claims">
          <ul className="space-y-2.5">
            {statusCounts.map(({ st, n }) => (
              <li key={st}>
                <button className="grid w-full grid-cols-[150px_minmax(0,1fr)_28px] items-center gap-3 text-left text-[13px]" onClick={() => go('ops', 'claims', { filter: st })}>
                  <span className="truncate text-ink">{CLAIM_STATUS[st].ops}</span>
                  <span className="h-3 rounded-full bg-sunken"><span className={cx('block h-3 rounded-full', { neutral: 'bg-muted/60', info: 'bg-info', ok: 'bg-ok', warn: 'bg-warn', crit: 'bg-crit', teal: 'bg-teal' }[CLAIM_STATUS[st].tone])} style={{ width: `${(n / max) * 100}%` }} /></span>
                  <span className="text-right font-mono font-semibold tnum">{n}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-6 border-t border-line pt-4">
            <div className="eyebrow mb-3">Waiting on a person</div>
            {pending.length === 0 ? <p className="text-[13px] text-muted">No reports waiting for review.</p> : (
              <ul className="space-y-2">
                {pending.map((a) => (
                  <li key={a.id}><button onClick={() => go('ops', 'claim', { claimId: a.claimId })} className="flex w-full flex-wrap items-center gap-2 text-left text-[13px] hover:text-tealink"><Ref>{a.claimId}</Ref><span className="min-w-0 flex-1 truncate text-muted">{a.recommendation.label}</span></button></li>
                ))}
              </ul>
            )}
          </div>
        </Card>
        <Card title="Recent agent activity" action={<SimulatedTag />} pad={false}>
          <ul className="divide-y divide-line">
            {recent.map((r) => (
              <li key={r.id} className="flex items-start gap-3 px-5 py-3">
                <Bot size={16} className="mt-0.5 shrink-0 text-teal" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><span className="text-[13px] font-semibold">{r.agent}</span><Pill tone={r.status === 'completed' ? 'ok' : r.status === 'running' ? 'teal' : r.status === 'failed' ? 'crit' : 'neutral'} pulse={r.status === 'running'}>{r.status}</Pill></div>
                  <div className="truncate text-[12.5px] text-muted">{r.outputSummary ?? r.task}</div>
                </div>
                <span className="shrink-0 font-mono text-[11px] text-muted">{fmtDateTime(r.startedAt)}</span>
              </li>
            ))}
          </ul>
          <div className="border-t border-line px-5 py-2.5"><button className="text-[13px] font-medium text-tealink" onClick={() => go('ops', 'command')}>Open Agent Command Center →</button></div>
        </Card>
      </div>
    </div>
  );
}
