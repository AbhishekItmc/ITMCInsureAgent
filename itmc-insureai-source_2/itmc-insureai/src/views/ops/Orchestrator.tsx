import { useState } from 'react';
import { Bot, Check, ChevronDown, CircleDashed, Loader2, Lock, Play, Send, SkipForward, User, Users, X } from 'lucide-react';
import { COMMAND_SUGGESTIONS, ORCHESTRATOR_GUARDRAILS, scanWork } from '../../agents/orchestrator';
import { ENGINE_LABEL } from '../../agents/runtime';
import { useNav } from '../../lib/nav';
import { fmtDateTime } from '../../lib/format';
import { getState, useDemo } from '../../store/store';
import { isOrchestratorRunning, runOrchestrator } from '../../store/workflows';
import type { OrchestratorRun, OrchestratorStep, WorkItem } from '../../types';
import { SimulatedTag } from '../../ui/agents';
import { Button, Card, PageHeader, Pill, cx, toast } from '../../ui/primitives';

const KIND_LABEL: Record<WorkItem['kind'], string> = {
  INVESTIGATE_CLAIM: 'Claims investigation',
  PREPARE_RENEWAL: 'Renewal preparation',
  REVIEW_QUOTE: 'Quote readiness check',
  PROCESS_SERVICE: 'Policy change request',
  DOC_REMINDER: 'Document reminder',
  QUOTE_FOLLOWUP: 'Quote follow-up',
  SERVICE_APPROVAL: 'Underwriter decision',
  HUMAN_REVIEW: 'Reviewer decision',
  CUSTOMER_DOCS: 'Customer documents',
};

function useRecordLink() {
  const { go } = useNav();
  return (id: string) => {
    if (id.startsWith('CLM')) go('ops', 'claim', { claimId: id });
    else if (id.startsWith('POL')) go('ops', 'renewals', { policyId: id });
    else if (id.startsWith('QTE')) go('ops', 'quotes-policies', { tab: 'quotes' });
    else if (id.startsWith('SRV') || id.startsWith('MSG')) go('ops', 'service');
    else if (id.startsWith('REQ')) go('ops', 'service');
  };
}

function RecordLink({ id }: { id: string }) {
  const open = useRecordLink();
  return <button onClick={() => open(id)} className="font-mono text-[12.5px] font-semibold text-tealink hover:underline">{id}</button>;
}

const stepIcon = (s: OrchestratorStep['status']) =>
  s === 'completed' ? <Check size={13} strokeWidth={3} /> : s === 'running' ? <Loader2 size={13} className="animate-spin" /> : s === 'failed' ? <X size={13} /> : s === 'skipped' ? <SkipForward size={12} /> : <CircleDashed size={13} />;

function RunCard({ run, defaultTrace }: { run: OrchestratorRun; defaultTrace?: boolean }) {
  const [showTrace, setShowTrace] = useState(!!defaultTrace);
  const tone = run.status === 'running' ? 'teal' : run.status === 'completed' ? 'ok' : run.status === 'refused' ? 'warn' : 'crit';
  return (
    <li className="space-y-2">
      {/* operator */}
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-navy px-4 py-2.5 text-[13.5px] text-navyink">
          <div className="mb-0.5 flex items-center gap-1.5 text-[11px] text-navymuted"><User size={12} /> Operator · {fmtDateTime(run.startedAt)}</div>
          {run.trigger === 'autopilot' ? <span className="font-medium">Run autopilot on the work queue</span> : run.command}
        </div>
      </div>
      {/* agent */}
      <div className={cx('rounded-2xl rounded-tl-sm border bg-surface', run.status === 'running' ? 'border-teal shadow-[0_0_0_3px_rgb(var(--teal)/0.12)]' : 'border-line')}>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
          <Bot size={16} className="text-teal" />
          <span className="font-display text-[13.5px] font-bold">Orchestrator Agent</span>
          <Pill tone={tone} pulse={run.status === 'running'}>{run.status === 'running' ? 'Running plan' : run.status === 'refused' ? 'Declined' : run.status[0].toUpperCase() + run.status.slice(1)}</Pill>
          <span className="ml-auto font-mono text-[11px] text-muted">{run.id}</span>
        </div>
        <div className="space-y-3 px-4 py-3">
          <p className="text-[13px] text-muted"><span className="font-medium text-ink">Understood as:</span> {run.interpretation}</p>
          {run.response.length > 0 && (
            <ul className="space-y-1 text-[13.5px] text-ink">
              {run.response.map((l, i) => <li key={i} className={cx(run.status === 'refused' && 'flex items-start gap-2')}>{run.status === 'refused' && <Lock size={14} className="mt-0.5 shrink-0 text-warn" />}{l}</li>)}
            </ul>
          )}
          {run.steps.length > 0 && (
            <div>
              <div className="eyebrow mb-1.5">Plan · {run.steps.filter((s) => s.status === 'completed').length}/{run.steps.length} done</div>
              <ol className="space-y-1.5">
                {run.steps.map((st, i) => (
                  <li key={st.id} className={cx('rounded-lg border px-3 py-2', st.status === 'running' ? 'border-teal/60 bg-tealsoft/40' : 'border-line')}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cx('flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold',
                        st.status === 'completed' ? 'bg-ok text-white' : st.status === 'running' ? 'bg-teal text-white' : st.status === 'failed' ? 'bg-crit text-white' : 'bg-sunken text-muted')}>
                        {st.status === 'queued' ? i + 1 : stepIcon(st.status)}
                      </span>
                      <span className="text-[13px] font-medium text-ink">{st.title.replace(st.targetId, '').trim()}</span>
                      <RecordLink id={st.targetId} />
                      <span className="ml-auto flex flex-wrap gap-1">{st.agents.map((a) => <span key={a} className="rounded bg-sunken px-1.5 py-0.5 text-[10.5px] text-muted">{a.replace(' Agent', '').replace(' Assistant', '')}</span>)}</span>
                    </div>
                    {st.result && <p className="mt-1 pl-7 text-[12.5px] text-muted">{st.result}</p>}
                  </li>
                ))}
              </ol>
            </div>
          )}
          {run.handoffs.length > 0 && (
            <div>
              <div className="eyebrow mb-1.5 flex items-center gap-1.5"><Users size={12} /> Handed to people</div>
              <ul className="divide-y divide-line rounded-lg border border-line">
                {run.handoffs.map((h, i) => (
                  <li key={i} className="flex flex-wrap items-start gap-2 px-3 py-2 text-[12.5px]">
                    <RecordLink id={h.targetId} />
                    <Pill tone={h.owner === 'Customer' ? 'warn' : 'info'} dot={false}>{h.owner}</Pill>
                    <span className="min-w-0 flex-1 text-muted">{h.note}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button onClick={() => setShowTrace(!showTrace)} className="inline-flex items-center gap-1 text-[12px] font-medium text-muted hover:text-ink">
            <ChevronDown size={14} className={cx('transition-transform', showTrace && 'rotate-180')} /> Execution trace ({run.trace.length})
          </button>
          {showTrace && (
            <ol className="space-y-1">
              {run.trace.map((t, i) => <li key={i} className="flex gap-2 text-[12px] text-muted"><span className="font-mono text-[11px] text-tealink">{String(i + 1).padStart(2, '0')}</span>{t}</li>)}
            </ol>
          )}
        </div>
      </div>
    </li>
  );
}

export function Orchestrator() {
  const s = useDemo();
  const [command, setCommand] = useState('');
  const work = scanWork(s);
  const actionable = work.filter((w) => w.actionable);
  const waiting = work.filter((w) => !w.actionable);
  const running = isOrchestratorRunning() || s.orchestratorRuns.some((r) => r.status === 'running');
  const runs = [...s.orchestratorRuns].reverse();

  const submit = async (text: string, trigger: 'autopilot' | 'command') => {
    if (trigger === 'command' && !text.trim()) return;
    setCommand('');
    const r = await runOrchestrator({ trigger, command: trigger === 'command' ? text.trim() : undefined });
    if (!r.ok) toast(r.error ?? 'The Orchestrator could not run.', 'warn');
    else {
      const run = getState().orchestratorRuns.find((x) => x.id === r.runId);
      if (run?.status === 'refused') toast('Request declined: it needs a human decision.', 'warn');
      else if (run?.steps.length) toast(`Orchestrator finished ${run.steps.length} step(s). See hand-offs.`);
      else toast('Orchestrator replied.', 'info');
    }
  };

  return (
    <div>
      <PageHeader eyebrow="Operations Console" title="Orchestrator Agent" description="One agent that handles all the agentic work. It scans the queue, plans, dispatches the specialist agents and hands every decision to a person." />

      <section className="mb-5 rounded-xl border border-teal/40 bg-navy p-5 text-navyink">
        <div className="flex flex-wrap items-center gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><Bot size={18} className="text-teal" /><span className="font-display text-[16px] font-bold">Autopilot</span></div>
            <p className="mt-1 text-[13px] text-navymuted">
              <strong className="text-navyink tnum">{actionable.length}</strong> item(s) the Orchestrator can act on now · <strong className="text-navyink tnum">{waiting.length}</strong> waiting on people
            </p>
            <p className="mt-1.5 font-mono text-[11px] text-teal">{ENGINE_LABEL}</p>
          </div>
          <Button variant="primary" size="lg" className="!h-auto min-h-12 w-full !whitespace-normal py-2.5 uppercase sm:w-auto" disabled={running || actionable.length === 0} onClick={() => submit('', 'autopilot')}>
            {running ? <><Loader2 size={17} className="animate-spin" /> Orchestrator running…</> : actionable.length === 0 ? <><Check size={17} /> No pending work to run</> : <><Play size={17} fill="currentColor" /> Run Orchestrator on all pending work</>}
          </Button>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <Card title="Command the Orchestrator" subtitle="Type an instruction. Commands are matched to intents by rules; no live language model is used." action={<SimulatedTag />}>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); submit(command, 'command'); }}>
              <input id="orch-command" className="input" placeholder="e.g. Investigate new claims" value={command} onChange={(e) => setCommand(e.target.value)} disabled={running} autoComplete="off" />
              <Button type="submit" variant="primary" disabled={running || !command.trim()}><Send size={15} /> <span className="hidden sm:inline">Send</span></Button>
            </form>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {COMMAND_SUGGESTIONS.map((c) => (
                <button key={c} type="button" disabled={running} onClick={() => submit(c, 'command')} className="rounded-full border border-line px-3 py-1 text-[12px] font-medium text-muted hover:border-teal/60 hover:text-ink disabled:opacity-50">{c}</button>
              ))}
            </div>
          </Card>
          {runs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line px-5 py-8 text-center text-[13px] text-muted">No Orchestrator runs yet. Run the autopilot or send a command to see the plan execute here.</div>
          ) : (
            <ol className="space-y-5">{runs.map((r, i) => <RunCard key={r.id} run={r} defaultTrace={i === 0 && r.status === 'running'} />)}</ol>
          )}
        </div>

        <div className="space-y-5">
          <Card title="Live work queue" subtitle="Recomputed from the shared data on every change" pad={false}>
            <div className="px-5 pb-1 pt-4 eyebrow">Orchestrator can act ({actionable.length})</div>
            <ul className="divide-y divide-line">
              {actionable.length === 0 && <li className="px-5 py-3 text-[13px] text-muted">Nothing to do. All automatable work is complete.</li>}
              {actionable.map((w) => (
                <li key={w.kind + w.targetId} className="px-5 py-2.5">
                  <div className="flex flex-wrap items-center gap-2"><RecordLink id={w.targetId} /><Pill tone="teal" dot={false}>{KIND_LABEL[w.kind]}</Pill></div>
                  <div className="mt-0.5 text-[12.5px] text-muted">{w.reason}</div>
                </li>
              ))}
            </ul>
            <div className="border-t border-line px-5 pb-1 pt-4 eyebrow">Waiting on people ({waiting.length})</div>
            <ul className="divide-y divide-line">
              {waiting.length === 0 && <li className="px-5 py-3 text-[13px] text-muted">No one is blocked.</li>}
              {waiting.map((w) => (
                <li key={w.kind + w.targetId} className="px-5 py-2.5">
                  <div className="flex flex-wrap items-center gap-2"><RecordLink id={w.targetId} /><Pill tone={w.owner === 'Customer' ? 'warn' : 'info'} dot={false}>{w.owner}</Pill></div>
                  <div className="mt-0.5 text-[12.5px] text-muted">{w.reason}</div>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Guardrails">
            <ul className="space-y-2">
              {ORCHESTRATOR_GUARDRAILS.map((g) => <li key={g} className="flex items-start gap-2 text-[13px]"><Lock size={14} className="mt-0.5 shrink-0 text-warn" />{g}</li>)}
            </ul>
            <p className="mt-3 text-[12px] text-muted">Commands that ask for these actions are declined and logged in the audit trail.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
