// Shared demo store. One source of truth for the Customer Portal and the Operations Console.
// Persists to browser storage when available; falls back to memory.
import { useSyncExternalStore } from 'react';
import { buildSeed, DATA_VERSION } from '../data/seed';
import { nowISO } from '../lib/format';
import type { AgentRun, AuditEvent, DemoState } from '../types';

const STORAGE_KEY = 'itmc-insureai-demo';

function load(): DemoState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DemoState;
      if (parsed.version === DATA_VERSION) return recoverInterrupted(parsed);
    }
  } catch { /* storage unavailable: use seed */ }
  return buildSeed();
}

/** An investigation that was mid-run when the page closed cannot resume; mark it so it can be re-run. */
function recoverInterrupted(s: DemoState): DemoState {
  let changed = false;
  for (const c of s.claims) {
    for (const inv of c.investigations) {
      if (inv.status === 'running') {
        inv.status = 'interrupted';
        inv.steps.forEach((st) => { if (st.status !== 'completed') st.status = 'failed'; });
        if (c.status === 'under_investigation') {
          const prev = [...c.statusHistory].reverse().find((h) => h.status !== 'under_investigation');
          c.status = prev?.status ?? 'registered';
          c.statusHistory.push({ status: c.status, at: nowISO(), by: 'System', note: 'Investigation interrupted (page closed). Re-run when ready.' });
        }
        changed = true;
      }
    }
  }
  for (const o of s.orchestratorRuns ?? []) if (o.status === 'running') { o.status = 'interrupted'; o.steps.forEach((st) => { if (st.status === 'running' || st.status === 'queued') st.status = 'skipped'; }); changed = true; }
  for (const r of s.agentRuns) if (r.status === 'running' || r.status === 'queued') { r.status = 'failed'; changed = true; }
  if (changed) s.audit.push({ id: `AUD-R${Date.now()}`, at: nowISO(), actor: 'System', actorType: 'system', action: 'Interrupted run recovered', entityType: 'system', entityId: 'DEMO', detail: 'An in-progress investigation was marked interrupted after reload.' });
  return s;
}

let state: DemoState = load();
const listeners = new Set<() => void>();
let persistOk = true;

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); persistOk = true; } catch { persistOk = false; }
}

export const getState = () => state;
export const isPersisted = () => persistOk;

/** Apply a mutation to a cloned draft, then publish. */
export function update(mutator: (draft: DemoState) => void) {
  const draft = structuredClone(state);
  mutator(draft);
  state = draft;
  persist();
  listeners.forEach((l) => l());
}

export function replaceState(next: DemoState) {
  state = next;
  persist();
  listeners.forEach((l) => l());
}

export function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useDemo(): DemoState {
  return useSyncExternalStore(subscribe, getState, getState);
}

/* ── draft helpers ── */

export function nextId(d: DemoState, key: string, prefix: string, pad = 4) {
  d.counters[key] = (d.counters[key] ?? 0) + 1;
  return `${prefix}${String(d.counters[key]).padStart(pad, '0')}`;
}

export function audit(d: DemoState, e: Omit<AuditEvent, 'id' | 'at'> & { at?: string }) {
  d.audit.push({ id: nextId(d, 'audit', 'AUD-', 5), at: e.at ?? nowISO(), ...e });
}

export function logRun(d: DemoState, r: Omit<AgentRun, 'id'>) {
  const id = nextId(d, 'run', 'RUN-');
  d.agentRuns.push({ id, ...r });
  return id;
}
