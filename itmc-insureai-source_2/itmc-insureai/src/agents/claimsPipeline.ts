// Claims investigation pipeline: defines the agent order and how outputs flow between agents.
// Used step-by-step by the live orchestrator and in one pass to build seeded history.
import type { AgentStep, InvestigationReport } from '../types';
import {
  claimsAssessmentAgent, documentIntelligenceAgent, fraudInvestigationAssistant, policyIntelligenceAgent, supervisorAgent,
  type AssessmentOutput, type ClaimContext, type DocIntelOutput, type FraudOutput, type PolicyIntelOutput,
} from './claimsAgents';
import type { AgentResult } from './runtime';
import type { Finding } from '../types';

export interface PipelineMemory {
  docIntel?: { output: DocIntelOutput; findings: Finding[] };
  policyIntel?: { output: PolicyIntelOutput; findings: Finding[] };
  assessment?: { output: AssessmentOutput; findings: Finding[] };
  fraud?: { output: FraudOutput; findings: Finding[] };
  report?: InvestigationReport;
}

export const PIPELINE = [
  documentIntelligenceAgent,
  policyIntelligenceAgent,
  claimsAssessmentAgent,
  fraudInvestigationAssistant,
  supervisorAgent,
] as const;

/** Run agent `index` with outputs of earlier agents. Returns the result and the updated memory. */
export function executePipelineStep(index: number, ctx: ClaimContext, mem: PipelineMemory): { result: AgentResult<unknown>; mem: PipelineMemory } {
  switch (index) {
    case 0: {
      const r = documentIntelligenceAgent.run(ctx);
      return { result: r, mem: { ...mem, docIntel: { output: r.output, findings: r.findings } } };
    }
    case 1: {
      const r = policyIntelligenceAgent.run(ctx);
      return { result: r, mem: { ...mem, policyIntel: { output: r.output, findings: r.findings } } };
    }
    case 2: {
      if (!mem.docIntel) throw new Error('Claims Assessment requires Document Intelligence output');
      const r = claimsAssessmentAgent.run({ ...ctx, docIntel: mem.docIntel.output });
      return { result: r, mem: { ...mem, assessment: { output: r.output, findings: r.findings } } };
    }
    case 3: {
      const r = fraudInvestigationAssistant.run(ctx);
      return { result: r, mem: { ...mem, fraud: { output: r.output, findings: r.findings } } };
    }
    case 4: {
      if (!mem.docIntel || !mem.policyIntel || !mem.assessment || !mem.fraud) throw new Error('Supervisor requires all specialist outputs');
      const r = supervisorAgent.run({ ...ctx, docIntel: mem.docIntel, policyIntel: mem.policyIntel, assessment: mem.assessment, fraud: mem.fraud });
      return { result: r, mem: { ...mem, report: r.output } };
    }
    default:
      throw new Error(`Unknown pipeline step ${index}`);
  }
}

export const queuedSteps = (ctx: ClaimContext): AgentStep[] =>
  PIPELINE.map((a) => ({ agent: a.name, status: 'queued', task: (a.task as (c: ClaimContext) => string)(ctx), findings: [] }));

/** Run the full pipeline synchronously (used for seeded historical investigations). */
export function runPipelineSync(ctx: ClaimContext, stamps: (i: number) => [string, string]) {
  let mem: PipelineMemory = {};
  const steps = queuedSteps(ctx);
  PIPELINE.forEach((_, i) => {
    const { result, mem: m } = executePipelineStep(i, ctx, mem);
    mem = m;
    const [s, e] = stamps(i);
    steps[i] = { ...steps[i], status: 'completed', startedAt: s, completedAt: e, outputSummary: result.summary, findings: result.findings, trace: result.trace, output: result.output };
  });
  return { steps, report: mem.report! };
}
