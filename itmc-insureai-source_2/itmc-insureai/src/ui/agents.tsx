import { useState } from 'react';
import { Bot, Check, ChevronDown, CircleDashed, Loader2, X } from 'lucide-react';
import type { AgentName, AgentStep, Finding, Investigation } from '../types';
import { SEVERITY_TONE, type Tone } from '../lib/selectors';
import { fmtDateTime } from '../lib/format';
import { Pill, cx } from './primitives';

export function SimulatedTag() {
  return <span className="inline-flex items-center gap-1 rounded border border-teal/40 bg-tealsoft px-1.5 py-0.5 font-mono text-[10.5px] font-medium uppercase tracking-wider text-tealink">Simulated agent</span>;
}

export function AgentTrace({ agent, summary, trace }: { agent: AgentName; summary: string; trace: string[] }) {
  return (
    <div className="rounded-lg border border-teal/30 bg-tealsoft/40 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Bot size={16} className="text-teal" />
        <span className="font-display text-[13.5px] font-bold">{agent}</span>
        <SimulatedTag />
      </div>
      <p className="mt-2 text-[13px] font-medium text-ink">{summary}</p>
      <ol className="mt-2 space-y-1">
        {trace.map((t, i) => (
          <li key={i} className="flex gap-2 text-[12.5px] text-muted">
            <span className="font-mono text-[11px] text-tealink">{String(i + 1).padStart(2, '0')}</span>
            <span>{t}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function FindingItem({ f }: { f: Finding }) {
  const tone = SEVERITY_TONE[f.severity];
  return (
    <div className={cx('rounded-lg border bg-surface p-3', tone === 'crit' ? 'border-crit/40' : tone === 'warn' ? 'border-warn/40' : 'border-line')}>
      <div className="flex flex-wrap items-start gap-2">
        <Pill tone={tone}>{f.severity}</Pill>
        <span className="min-w-0 flex-1 text-[13px] font-semibold text-ink">{f.title}</span>
      </div>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{f.detail}</p>
      {f.evidence.length > 0 && (
        <div className="mt-2 rounded-md bg-sunken/70 p-2">
          <div className="eyebrow mb-1 text-[10px]">Evidence</div>
          <ul className="space-y-0.5">
            {f.evidence.map((e, i) => (
              <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 text-[12px] sm:grid-cols-[140px_minmax(0,1fr)_auto]">
                <span className="text-muted">{e.label}</span>
                <span className="font-mono font-medium text-ink tnum sm:order-none">{e.value}</span>
                <span className="col-span-2 truncate text-[11px] text-muted sm:col-span-1 sm:text-right">{e.source}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const statusIcon = (s: AgentStep['status']) =>
  s === 'completed' ? <Check size={14} /> : s === 'running' ? <Loader2 size={14} className="animate-spin" /> : s === 'failed' ? <X size={14} /> : <CircleDashed size={14} />;

const statusTone = (s: AgentStep['status']) => (s === 'completed' ? 'ok' : s === 'running' ? 'teal' : s === 'failed' ? 'crit' : 'neutral') as Tone;

/** Renders an agent's structured output as readable key facts. */
function OutputView({ step }: { step: AgentStep }) {
  const o = step.output as Record<string, unknown> | undefined;
  if (!o) return null;
  const rows: [string, string][] = [];
  const add = (k: string, v: unknown) => { if (v !== undefined && v !== null && v !== '') rows.push([k, Array.isArray(v) ? (v.length ? v.join(', ') : 'none') : String(v)]); };
  switch (step.agent) {
    case 'Document Intelligence Agent':
      add('Documents read', (o.extracted as unknown[]).length);
      add('Required set', o.required);
      add('Missing', o.missing);
      add('Inconsistency flags', o.inconsistencyCount);
      break;
    case 'Policy Intelligence Agent':
      add('Policy', o.policyId); add('Coverage', o.coverageLabel); add('In force on incident date', o.activeOnIncidentDate ? 'Yes' : 'No');
      add('Incident type covered', o.incidentCovered ? 'Yes' : 'No'); add('Sum insured', (o.sumInsured as number).toLocaleString()); add('Deductible', (o.deductible as number).toLocaleString());
      add('Reported after (days)', o.reportingDays);
      add('Exclusions screened', (o.exclusionsReviewed as { code: string; triggered: boolean }[]).map((e) => `${e.code}${e.triggered ? ' ⚑' : ''}`));
      break;
    case 'Claims Assessment Agent':
      add('Completeness', `${o.completenessPct}%`); add('Claimed', (o.claimedAmount as number).toLocaleString());
      add('Estimate / invoice', o.estimateTotal !== undefined ? (o.estimateTotal as number).toLocaleString() : 'none');
      add('Variance', o.variancePct !== undefined ? `${Math.round((o.variancePct as number) * 100)}%` : '—');
      add('Labour rate / benchmark', o.labourRate ? `${o.labourRate} / ${o.labourBenchmark}` : '—');
      add('Illustrative estimate net of deductible', o.illustrativeNetOfDeductible !== undefined ? `${(o.illustrativeNetOfDeductible as number).toLocaleString()} (not a settlement)` : '—');
      break;
    case 'Fraud Investigation Assistant': {
      const ind = o.indicators as { code: string; title: string; triggered: boolean; explanation: string }[];
      return (
        <div className="space-y-2">
          <ul className="divide-y divide-line rounded-md border border-line">
            {ind.map((i) => (
              <li key={i.code} className="flex flex-wrap items-start gap-2 px-3 py-2 text-[12.5px]">
                <span className="font-mono text-[11px] text-muted">{i.code}</span>
                <span className="min-w-0 flex-1"><span className="font-medium text-ink">{i.title}</span><span className="block text-muted">{i.explanation}</span></span>
                <Pill tone={i.triggered ? 'warn' : 'neutral'} dot={false}>{i.triggered ? 'Triggered' : 'Clear'}</Pill>
              </li>
            ))}
          </ul>
          <p className="text-[12px] italic text-muted">{String(o.statement)}</p>
        </div>
      );
    }
    case 'Supervisor Agent':
      add('Recommendation', (o.recommendation as { label: string }).label);
      add('Next owner', (o.recommendation as { nextOwner: string }).nextOwner);
      add('Confidence', o.confidence);
      add('Inconsistencies', (o.inconsistencies as unknown[]).length);
      add('Anomaly indicators', (o.anomalies as unknown[]).length);
      add('Routed to', 'Human Approval Queue');
      break;
  }
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
      {rows.map(([k, v]) => (
        <div key={k} className="flex min-w-0 justify-between gap-3 border-b border-dashed border-line py-1 text-[12.5px]">
          <dt className="text-muted">{k}</dt>
          <dd className="min-w-0 break-words text-right font-medium text-ink tnum">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function AgentStepCard({ step, index, defaultOpen }: { step: AgentStep; index: number; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const expandable = step.status === 'completed';
  return (
    <div className={cx('rounded-xl border bg-surface transition-colors', step.status === 'running' ? 'border-teal shadow-[0_0_0_3px_rgb(var(--teal)/0.15)]' : 'border-line')}>
      <button disabled={!expandable} onClick={() => setOpen(!open)} className="flex w-full items-start gap-3 px-4 py-3.5 text-left disabled:cursor-default" aria-expanded={open}>
        <span className={cx('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-[12px] font-semibold',
          step.status === 'completed' ? 'bg-ok text-white' : step.status === 'running' ? 'bg-teal text-white' : step.status === 'failed' ? 'bg-crit text-white' : 'bg-sunken text-muted')}>
          {step.status === 'queued' ? index + 1 : statusIcon(step.status)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-display text-[14px] font-bold">{step.agent}</span>
            <Pill tone={statusTone(step.status)} pulse={step.status === 'running'}>{step.status === 'running' ? 'Running' : step.status[0].toUpperCase() + step.status.slice(1)}</Pill>
            {step.findings.length > 0 && <span className="text-[12px] text-muted">{step.findings.length} finding{step.findings.length > 1 ? 's' : ''}</span>}
          </span>
          <span className="mt-0.5 block text-[12.5px] text-muted">Task: {step.task}</span>
          {step.outputSummary && <span className="mt-1.5 block text-[13px] font-medium text-ink">{step.outputSummary}</span>}
        </span>
        {expandable && <ChevronDown size={18} className={cx('mt-1 shrink-0 text-muted transition-transform', open && 'rotate-180')} />}
      </button>
      {open && expandable && (
        <div className="space-y-4 border-t border-line px-4 py-4">
          <div>
            <div className="eyebrow mb-2">Structured output</div>
            <OutputView step={step} />
          </div>
          {step.findings.length > 0 && (
            <div>
              <div className="eyebrow mb-2">Findings & evidence</div>
              <div className="grid gap-2">{step.findings.map((f) => <FindingItem key={f.id} f={f} />)}</div>
            </div>
          )}
          {step.trace && (
            <div>
              <div className="eyebrow mb-2">Execution trace</div>
              <ol className="space-y-1">
                {step.trace.map((t, i) => <li key={i} className="flex gap-2 text-[12.5px] text-muted"><span className="font-mono text-[11px] text-tealink">{String(i + 1).padStart(2, '0')}</span>{t}</li>)}
              </ol>
            </div>
          )}
          <div className="font-mono text-[11px] text-muted">Started {fmtDateTime(step.startedAt)} · completed {fmtDateTime(step.completedAt)}</div>
        </div>
      )}
    </div>
  );
}

/** Seven-milestone execution timeline derived from the actual step states. */
export function InvestigationTimeline({ inv, reviewDecided }: { inv: Investigation; reviewDecided?: string }) {
  const st = (i: number) => inv.steps[i]?.status;
  const done = (i: number) => st(i) === 'completed';
  const ms: { label: string; state: 'done' | 'active' | 'pending' | 'failed'; at?: string }[] = [
    { label: 'Task received', state: 'done', at: inv.startedAt },
    { label: 'Document analysis completed', state: done(0) ? 'done' : st(0) === 'running' ? 'active' : st(0) === 'failed' ? 'failed' : 'pending', at: inv.steps[0]?.completedAt },
    { label: 'Policy checks completed', state: done(1) ? 'done' : st(1) === 'running' ? 'active' : st(1) === 'failed' ? 'failed' : 'pending', at: inv.steps[1]?.completedAt },
    { label: 'Claim assessment completed', state: done(2) ? 'done' : st(2) === 'running' ? 'active' : st(2) === 'failed' ? 'failed' : 'pending', at: inv.steps[2]?.completedAt },
    { label: 'Anomaly checks completed', state: done(3) ? 'done' : st(3) === 'running' ? 'active' : st(3) === 'failed' ? 'failed' : 'pending', at: inv.steps[3]?.completedAt },
    { label: 'Findings consolidated', state: done(4) ? 'done' : st(4) === 'running' ? 'active' : st(4) === 'failed' ? 'failed' : 'pending', at: inv.steps[4]?.completedAt },
    { label: 'Human review required', state: inv.status === 'completed' ? (reviewDecided ? 'done' : 'active') : inv.status === 'interrupted' ? 'failed' : 'pending', at: inv.completedAt },
  ];
  return (
    <ol className="relative grid gap-0">
      {ms.map((m, i) => (
        <li key={m.label} className="relative flex gap-3 pb-4 last:pb-0">
          {i < ms.length - 1 && <span className={cx('absolute left-[11px] top-6 h-[calc(100%-18px)] w-0.5', m.state === 'done' ? 'bg-ok/60' : 'bg-line')} />}
          <span className={cx('relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2',
            m.state === 'done' ? 'border-ok bg-ok text-white' : m.state === 'active' ? 'border-teal bg-tealsoft text-tealink' : m.state === 'failed' ? 'border-crit bg-critsoft text-crit' : 'border-line bg-surface text-muted')}>
            {m.state === 'done' ? <Check size={13} strokeWidth={3} /> : m.state === 'active' ? <span className="h-2 w-2 rounded-full bg-teal pulse-dot" /> : m.state === 'failed' ? <X size={12} /> : <span className="font-mono text-[10px]">{i + 1}</span>}
          </span>
          <span className="min-w-0">
            <span className={cx('block text-[13px] font-medium', m.state === 'pending' ? 'text-muted' : 'text-ink')}>{m.label}</span>
            {m.at && m.state !== 'pending' && <span className="block font-mono text-[11px] text-muted">{fmtDateTime(m.at)}</span>}
            {i === 6 && m.state === 'active' && <span className="block text-[12px] text-tealink">Waiting for a reviewer in the Human Approval Queue</span>}
            {i === 6 && m.state === 'done' && reviewDecided && <span className="block text-[12px] text-ok">Reviewer decision: {reviewDecided}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
