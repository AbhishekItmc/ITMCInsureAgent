// Agent runtime contract.
// Every agent has a typed input and a typed output. In this MVP the engine is "simulated":
// deterministic rules produce the output. A future "llm" engine can implement the same
// contract on a secure backend (model calls must never happen from the browser with an API key).
import type { AgentName, Finding } from '../types';

export type AgentEngine = 'simulated';
export const AGENT_ENGINE: AgentEngine = 'simulated';
export const ENGINE_LABEL = 'Simulated agents · deterministic rules engine · no live AI model connected';

export interface AgentResult<O> {
  output: O;
  summary: string;
  findings: Finding[];
  /** Human-readable reasoning trace: what the agent checked, in order. */
  trace: string[];
}

export interface AgentDefinition<I, O> {
  name: AgentName;
  task: (input: I) => string;
  run: (input: I) => AgentResult<O>;
}

let findingSeq = 0;
export const fid = (prefix: string) => `${prefix}-${++findingSeq}`;
export const resetFindingSeq = () => { findingSeq = 0; };

export const AGENT_CATALOG: { name: AgentName; role: string; area: 'Coordination' | 'Customer Service' | 'Quote & Policy' | 'Claims' | 'Renewals' }[] = [
  { name: 'Orchestrator Agent', role: 'Coordinates all agentic work: scans the queue, plans, dispatches specialist agents and hands off to people.', area: 'Coordination' },
  { name: 'Chatbot Agent', role: 'Answers customers and staff in chat using live demo records, takes safe actions and hands sensitive requests to people.', area: 'Customer Service' },
  { name: 'Quote Agent', role: 'Validates quote requests, prices them with the demo tariff and saves the quote.', area: 'Quote & Policy' },
  { name: 'Policy Agent', role: 'Converts a saved quote into a demo policy after checking requirements.', area: 'Quote & Policy' },
  { name: 'Document Intelligence Agent', role: 'Extracts fields from claim documents and flags gaps and inconsistencies.', area: 'Claims' },
  { name: 'Policy Intelligence Agent', role: 'Checks the claim against configured coverage rules, limits and exclusions.', area: 'Claims' },
  { name: 'Claims Assessment Agent', role: 'Reviews completeness and compares the claim with the repair estimate.', area: 'Claims' },
  { name: 'Fraud Investigation Assistant', role: 'Looks for explainable anomalies across synthetic records. Never labels anyone fraudulent.', area: 'Claims' },
  { name: 'Supervisor Agent', role: 'Consolidates findings, recommends a next step and routes to human review.', area: 'Claims' },
  { name: 'Renewal Agent', role: 'Prepares an illustrative renewal estimate, communication draft and follow-up task.', area: 'Renewals' },
];
