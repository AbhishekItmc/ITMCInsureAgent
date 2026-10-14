import { useState } from 'react';
import { Bot } from 'lucide-react';
import { AGENT_CATALOG, ENGINE_LABEL } from '../../agents/runtime';
import { useNav } from '../../lib/nav';
import { fmtDateTime } from '../../lib/format';
import { APPROVAL_STATUS, type Tone } from '../../lib/selectors';
import { useDemo } from '../../store/store';
import type { AgentName, StepStatus } from '../../types';
import { SimulatedTag } from '../../ui/agents';
import { Card, PageHeader, Pill, Ref, Table, Td, cx } from '../../ui/primitives';

const tone = (s?: StepStatus) => (s === 'completed' ? 'ok' : s === 'running' ? 'teal' : s === 'failed' ? 'crit' : 'neutral') as Tone;

export function CommandCenter() {
  const s = useDemo();
  const { go } = useNav();
  const [agentFilter, setAgentFilter] = useState<AgentName | 'all'>('all');
  const runs = [...s.agentRuns].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const filtered = runs.filter((r) => agentFilter === 'all' || r.agent === agentFilter);
  const openEntity = (id: string) => {
    if (id.startsWith('CLM')) go('ops', 'claim', { claimId: id });
    else if (id.startsWith('QTE')) go('ops', 'quotes-policies', { tab: 'quotes' });
    else if (id.startsWith('POL')) go('ops', 'quotes-policies', { tab: 'policies' });
    else if (id.startsWith('RNW')) go('ops', 'renewals');
    else if (id.startsWith('ORC')) go('ops', 'orchestrator');
  };
  return (
    <div>
      <PageHeader eyebrow="Operations Console" title="Agent Command Center" description={<>Every agent, what it is doing now, what it last produced, and its full execution history. <span className="font-mono text-[12px] text-tealink">{ENGINE_LABEL}</span></>} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {AGENT_CATALOG.map((a) => {
          const last = runs.find((r) => r.agent === a.name);
          const count = runs.filter((r) => r.agent === a.name).length;
          return (
            <button key={a.name} onClick={() => setAgentFilter(agentFilter === a.name ? 'all' : a.name)} className={cx('flex flex-col rounded-xl border bg-surface p-4 text-left transition-colors', agentFilter === a.name ? 'border-teal shadow-[0_0_0_3px_rgb(var(--teal)/0.12)]' : last?.status === 'running' ? 'border-teal' : 'border-line hover:border-teal/50')}>
              <div className="flex items-start justify-between gap-2">
                <span className="flex items-center gap-2"><Bot size={16} className="text-teal" /><span className="font-display text-[13.5px] font-bold leading-tight">{a.name}</span></span>
                <Pill tone={last?.status === 'running' ? 'teal' : 'neutral'} pulse={last?.status === 'running'} dot>{last?.status === 'running' ? 'Running' : 'Idle'}</Pill>
              </div>
              <p className="mt-2 text-[12px] leading-snug text-muted">{a.role}</p>
              <div className="mt-3 border-t border-dashed border-line pt-2.5 text-[12px]">
                <div className="text-muted">Current / last task</div>
                <div className="truncate font-medium text-ink">{last?.task ?? 'No runs yet'}</div>
                <div className="mt-1.5 text-muted">Output</div>
                <div className="line-clamp-2 text-ink">{last?.outputSummary ?? '—'}</div>
              </div>
              <div className="mt-auto flex items-center justify-between pt-3 text-[11.5px] text-muted"><span>{a.area}</span><span className="tnum">{count} run{count === 1 ? '' : 's'}</span></div>
            </button>
          );
        })}
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card title="Workflow history" subtitle={agentFilter === 'all' ? `${runs.length} agent executions` : `${filtered.length} executions by ${agentFilter}`} action={<div className="flex items-center gap-2">{agentFilter !== 'all' && <button className="text-[12.5px] text-tealink" onClick={() => setAgentFilter('all')}>Show all</button>}<SimulatedTag /></div>} pad={false}>
          <div className="max-h-[560px] overflow-y-auto">
            <Table head={['Run', 'Agent', 'Task', 'Record', 'Status', 'Output summary', 'Started']}>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <Td mono>{r.id}</Td><Td className="whitespace-nowrap font-medium">{r.agent}</Td><Td className="max-w-[220px] text-[12.5px] text-muted">{r.task}</Td>
                  <Td>{r.entityId !== '—' ? <button className="font-mono text-[12px] text-tealink hover:underline" onClick={() => openEntity(r.entityId)}>{r.entityId}</button> : '—'}</Td>
                  <Td><Pill tone={tone(r.status)} pulse={r.status === 'running'}>{r.status}</Pill></Td>
                  <Td className="max-w-[260px] text-[12.5px]">{r.outputSummary ?? '…'}</Td>
                  <Td className="whitespace-nowrap font-mono text-[11.5px] text-muted">{fmtDateTime(r.startedAt)}</Td>
                </tr>
              ))}
            </Table>
          </div>
        </Card>
        <div className="space-y-5">
          <Card title="Human approval queue" action={<button className="text-[12.5px] font-medium text-tealink" onClick={() => go('ops', 'approvals')}>Open queue →</button>} pad={false}>
            <ul className="divide-y divide-line">
              {[...s.approvals].reverse().slice(0, 6).map((a) => (
                <li key={a.id}><button onClick={() => go('ops', 'claim', { claimId: a.claimId })} className="w-full px-5 py-3 text-left hover:bg-sunken/50">
                  <div className="flex flex-wrap items-center gap-2"><Ref>{a.claimId}</Ref><Pill tone={APPROVAL_STATUS[a.status].tone}>{APPROVAL_STATUS[a.status].label}</Pill></div>
                  <div className="mt-0.5 truncate text-[12.5px] text-muted">{a.recommendation.label}</div>
                </button></li>
              ))}
            </ul>
          </Card>
          <Card title="Latest audit events" action={<button className="text-[12.5px] font-medium text-tealink" onClick={() => go('ops', 'audit')}>Audit trail →</button>} pad={false}>
            <ul className="divide-y divide-line">
              {[...s.audit].reverse().slice(0, 8).map((e) => (
                <li key={e.id} className="px-5 py-2.5 text-[12.5px]">
                  <div className="flex flex-wrap gap-x-2"><span className="font-medium">{e.action}</span><span className="text-muted">· {e.actor}</span></div>
                  <div className="truncate text-muted">{e.entityId} · {e.detail}</div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
