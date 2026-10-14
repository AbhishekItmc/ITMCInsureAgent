# ITMC InsureAI — Agentic AI Insurance MVP

**ITMC InsureAI uses coordinated AI agents to streamline the insurance lifecycle—from quotation and policy servicing to claims investigation and renewal—with transparent execution, human oversight, and auditable actions.**

A demo by ITMC Systems. All customers, policies, claims and garages are fictional. Agents are **simulated** (deterministic rules); no live AI model is connected, no messages are sent and no payments are processed.

---

## 1. Run instructions

Requirements: Node.js 18+ (tested on Node 22).

```bash
npm install
npm run dev          # http://localhost:5173  (hot reload)
npm run build        # type-checks, then builds dist/index.html (single self-contained file)
npm run preview      # serves the production build
```

`dist/index.html` is fully self-contained (JS and CSS inlined). You can double-click it to open it in a browser, or host it on any static web server. Fonts load from Google Fonts and fall back to system fonts when offline.

End-to-end test (Playwright, after `npm run build`):

```bash
node tests/e2e.mjs            # full lifecycle, 28 checks
node tests/orchestrator.mjs   # Orchestrator Agent: guardrails, commands, autopilot, hand-offs (26 checks)
node tests/chatbot.mjs        # Chatbot Agent: customer + staff modes, privacy, guardrails, flows (28 checks)
node tests/voice.mjs          # Voice input: speech → Maya's answer, blocked mic, unsupported browser (9 checks)
node tests/products.mjs       # Travel, Medical and Home: quote → policy → claim → investigation → approval → tracking → servicing → renewal → chat (47 checks)
```

Demo data is saved in the browser's local storage, so it survives a page refresh. **Reset Demo** (top right) restores the original synthetic dataset.

---

## 2. Feature checklist (Definition of Done)

| # | Capability | Where | Status |
|---|---|---|---|
| — | **Four product lines, full lifecycle**: Motor, Travel (single trip / annual multi-trip), Medical (individual / family plans) and Home (buildings, contents or both), each with its own quote form, pricing, policy requirements, claim types, required documents, investigation checks, servicing changes and renewal rules | Portal → Products / Products menu | ✅ |
| 1 | Generate a quote (validation, missing info, deterministic pricing, assumptions, reference, saved) for any of the four products | Portal → Products menu → Motor / Travel / Medical / Home | ✅ |
| 2 | Convert quote to a demo policy (Policy Agent checks, outstanding requirements, confirmation, policy no./dates/status, demo label) | Portal → My Policies | ✅ |
| 3 | Register a claim (product-specific claim types, required documents, provider, amount, sample docs or file metadata) | Portal → Register a Claim | ✅ |
| 4 | Run multi-agent investigation (5 agents in sequence, live status) | Ops → Claims → claim workbench | ✅ |
| 5 | Inspect each agent's output (structured output, findings, evidence, execution trace) | Claim workbench → expand an agent | ✅ |
| 6 | Review evidence and recommendation (consolidated report with all 8 sections + uncertainty) | Claim workbench / Approval Queue | ✅ |
| 7 | Approve next step / Request documents / Escalate / Reject — each updates state + audit | Claim workbench / Approval Queue | ✅ |
| 8 | Same claim status in both views | Portal → Track Claims ↔ Ops | ✅ |
| 9 | Audit trail (append-only, filter by actor, search by record) | Ops → Audit Trail | ✅ |
| 10 | Renewal estimate, missing info, communication draft, follow-up task, save draft | Portal → Renewal / Ops → Renewals | ✅ |
| — | **Orchestrator Agent**: scans all pending work, plans, dispatches specialist agents, hands off to people; autopilot button + command bar; guardrails; full audit | Ops → Orchestrator Agent | ✅ |
| — | **Policy Servicing Agent**: address change, add driver, vehicle change, add family member (medical), change sum insured (home), trip extension (travel) and cancellation requests; low-risk changes auto-applied, premium changes and cancellations routed to an underwriter | Portal → My Policies → Request a change; chat; Ops → Service & Comms | ✅ |
| — | **Customer Communications Agent**: drafts document reminders, quote follow-ups and service updates for human approval (never sent) | Ops → Service & Comms | ✅ |
| — | **Chatbot Agent**: “Ask InsureAI” chat on every screen; customer mode answers from the signed-in customer's records (claim status, cover, renewal, documents, indicative quote) and can upload requested documents or log a call-back; staff mode looks up records and delegates work to the Orchestrator | Floating button, bottom right | ✅ |
| — | Executive dashboard with 8 clickable demo metrics + recent agent activity | Ops → Executive Overview | ✅ |
| — | Agent Command Center (agent, current task, status, output, history, approvals, audit) | Ops → Agent Command Center | ✅ |
| — | Ready-to-run scenarios: motor (missing police report, estimate 47% above claim), medical (invoice above claimed amount), home (photos missing, estimate 29% over, “flooded” wording), travel (airline irregularity report missing) | CLM-2026-0103, 0105, 0106, 0107 | ✅ |
| — | Reset Demo | Top bar | ✅ |
| — | Responsive layout, light and dark themes | Everywhere | ✅ |

Synthetic dataset: 4 customers, 7 quotes, 6 policies (3 motor, 1 medical family plan, 1 home villa, 1 single-trip travel), 7 claims, coverage rules for 11 cover types, sample documents for 16 document types, seeded agent runs, approvals, a document request, a change request and audit history.

### Products at a glance

| | Motor | Travel | Medical | Home |
|---|---|---|---|---|
| Covers | Comprehensive, Third-party | Travel Essential, Travel Plus | Medical Essential, Plus, Premier | Buildings, Contents, Buildings & Contents |
| Priced on | Vehicle value and age, driver age, licence years, prior claims, city, usage, deductible, add-ons | Region, trip days or annual, traveller ages (65+ / 75+ loadings), family discount | Member age bands, plan, hospital network, pre-existing conditions, family discount | Rebuild and contents values, valuables, property type, alarm, flood zone, deductible |
| Policy Agent needs | Plate, VIN, address | Lead traveller passport, address | Health declaration, address | Property address |
| Claim types | Collision, theft, weather, glass | Medical emergency, trip cancellation, baggage, flight delay | Outpatient, hospital admission, pharmacy | Water damage, fire, burglary, accidental damage |
| Investigation checks | Police report, estimate vs claim, labour rate, photo dates | Sub-limits, 30-day reporting window, boarding pass / PIR, invoice dates | Waiting period, sub-limits, pre-existing conditions, invoice vs claim | Sum insured, estimate vs claim, exclusions (gradual leak, flood, no forced entry) |
| Changes | Address, add driver, change vehicle, cancel | Extend trip, address, cancel | Add family member, address, cancel | Change sum insured, address, cancel |
| Renewal | Depreciation, claim loading / no-claims discount | Annual multi-trip only (single trip is not renewed) | Medical cost trend +8% | Rebuild-cost indexation +4% |

---

## 3. Architecture

```
src/
  types.ts                 Shared data model (customers, quotes, policies, claims, approvals, audit…)
  config/rules.ts          Configured demo rules: tariff, coverage, exclusions, required docs, anomaly thresholds, renewal
  agents/
    runtime.ts             Agent contract (typed input → output, summary, findings, trace) + engine label
    pricing.ts             Deterministic pricing engine
    quoteAgent.ts          Quote Agent
    policyAgent.ts         Policy Agent
    claimsAgents.ts        Document Intelligence, Policy Intelligence, Claims Assessment, Fraud Investigation Assistant, Supervisor
    claimsPipeline.ts      Agent order and data flow between agents
    renewalAgent.ts        Renewal Agent
    servicingAgents.ts     Policy Servicing Agent and Customer Communications Agent
    chatbot.ts             Chatbot Agent: intent matching for customer and staff modes, actions, guardrails
    orchestrator.ts        Orchestrator Agent: work-queue scan, command intent parser, plan selection, guardrails
  data/seed.ts, sampleDocs.ts   Synthetic dataset (dates relative to today) and sample documents
  store/store.ts           Single shared store (persisted), audit + run logging helpers
  store/workflows.ts       Orchestration: every user/agent action lives here, not in the UI
  views/portal/*           Customer Portal screens
  views/ops/*              Operations Console screens
  ui/*                     Design-system primitives and agent visualisations
```

UI components only call `store/workflows.ts`. Workflows call agents and update state. Agents are pure functions with typed inputs and outputs, so each can be swapped for a model-backed service without touching the UI.

---

## 4. Orchestrator Agent

The Orchestrator Agent handles all the agentic work from one place (**Ops → Orchestrator Agent**).

- **Live work queue.** It continuously works out what is pending from the shared data: submitted policy change requests (→ Policy Servicing Agent), open document requests and stale quotes (→ Customer Communications Agent drafts), new claims and claims with newly received documents (→ five-agent investigation), policies expiring within 60 days without a renewal draft (→ Renewal Agent), and open quotes not yet checked (→ Policy Agent). It also lists what is waiting on people: reports awaiting a reviewer and claims waiting for customer documents.
- **Autopilot.** *Run Orchestrator on all pending work* builds a prioritised plan (re-investigations first, then new claims, renewals, quotes), runs each step by dispatching the right specialist agents, shows every step live, then lists the hand-offs to people.
- **Command bar.** Instructions such as “Investigate new claims”, “Investigate CLM-2026-0103”, “Prepare renewals”, “Check open quotes”, “Status” or “What's waiting on people?”. Commands are matched to intents by rules (no language model). Unrecognised commands get help text.
- **Guardrails.** It never approves or rejects, makes coverage or payment decisions, issues policies, sends messages or labels anyone fraudulent. Commands asking for these (e.g. “Approve CLM-2026-0102”) are declined and audited. It will not re-run an investigation that is waiting for a human decision.
- Every plan, step, refusal and completion is written to the audit trail and the Agent Command Center.

## 5. Chatbot Agent ("Maya")

Maya appears as an illustrated virtual insurance agent with a headset. **You can talk to her:** tap the microphone next to the message box, speak, and your words appear as you talk; when you stop, the message is sent and she answers out loud. Voice works for everything, including guided flows ("yesterday", "Olaya Street", …). She speaks her replies using the browser's built-in speech engine (toggle with the speaker icon; hover a message to replay it), and her mouth animates while she talks.

**Guided conversations (multi-turn):** report a claim entirely in chat for any product (date, location, what happened, amount, provider → claim registered with the right claim type and sample documents, outstanding documents offered for upload), change address, add a driver, change vehicle, add a family member to medical cover, extend a trip, update home values, and log a cancellation request. Maya picks the right policy from what the customer says ("my suitcase was lost" → travel; "burst pipe" → home; "add my newborn" → medical). Change requests go straight to the Policy Servicing Agent: low-risk ones are applied immediately, others go to an underwriter. Type “cancel” at any point to stop.


The **Ask InsureAI** button (bottom right, every screen) opens the Chatbot Agent.

- **Customer mode (Customer Portal).** Answers only from the signed-in customer's own records: claim status and next step, what the policy covers for each product (incident covered or not, sub-limits, deductible, matching exclusions), renewal date and estimate, documents needed, and an indicative price ("Quote for a 2023 car worth 95000"). It can upload a requested sample document straight into the claim, start a claim, and log a call-back task for Customer Care.
- **Staff mode (Operations Console).** Looks up any claim, policy, quote or customer, summarises the workload, lists what needs approval, and hands instructions such as "Investigate new claims" to the Orchestrator Agent, then reports the result.
- **Guardrails.** It won't discuss another customer's claim, and it never approves claims, promises payments, cancels policies or records reviewer decisions. Those requests get a call-back offer or a link to the Human Approval Queue.
- Rule-based intent matching (no language model). Every turn is logged in the Agent Command Center; actions are written to the audit trail.

## 6. Demo scripts

### 5-minute demo (the hero flow on the ready-made scenario)

1. **(0:00) Frame it.** Open **Operations Console → Executive Overview**. "Everything here is fictional demo data. Every tile is a live count; click one and you get the records." Click **Awaiting human approval** to show it links through, then go back.
2. **(0:45) Open the scenario.** Click the teal **Ready-to-run scenario** banner (CLM-2026-0103, Layla Mansour). Point out the documents panel: the police report is missing.
3. **(1:15) Run it.** Press **RUN AGENTIC CLAIMS INVESTIGATION**. Narrate the timeline as the five agents run: documents → policy → assessment → anomalies → supervisor. Note the "Simulated agents" label: "Today these are deterministic rules; the same contract takes a real model later."
4. **(2:15) Inspect the evidence.** Expand **Document Intelligence** (photos dated a day before the incident, police report missing). Expand **Fraud Investigation Assistant**: 4 of 6 indicators, each with evidence. Point to the wording: indicators, not accusations.
5. **(3:15) Read the report.** Scroll to the consolidated report: missing documents, inconsistencies (estimate SAR 18,400 vs SAR 12,500 claimed, labour rate above benchmark), recommended action, confidence Low, uncertainty.
6. **(3:45) Human decision.** Type a reviewer note and click **Approve recommended next step**. Read the line under the buttons: approval authorises the operational step only, not the claim or payment.
7. **(4:15) Same truth, both sides.** Switch to **Customer Portal → Track Claims** (signed in as Layla Mansour). Status shows **Additional Documents Required** with an upload button.
8. **(4:40) Close on the audit trail.** **Ops → Audit Trail**, search `CLM-2026-0103`: every customer action, agent step and human decision is recorded.

**Alternative 5-minute opener (Orchestrator):** after **Reset Demo**, open **Ops → Orchestrator Agent**. Type “Approve CLM-2026-0102” to show the guardrail declining it. Type “Status” to show the queue. Then press **Run Orchestrator on all pending work**: it investigates the four new claims (motor, medical, home and travel), drafts a renewal for POL-2026-0001, assesses a change request, drafts a document reminder and checks quote QTE-2026-0004, then lists who needs to act next. Click CLM-2026-0103 in the plan to open the report and make the human decision.

### 10-minute demo (full lifecycle, end to end)

1. **(0:00) Portal home.** **Customer Portal → Products.** Motor, Travel, Medical and Home are live (tabs, showcase cards and the Products menu); SME lines are marked "Not in this MVP".
2. **(0:45) Quote.** **Products → Motor** (sample applicant Hana Siddiqui is pre-filled). Click **Generate Quote**. Walk through the premium breakdown line by line, the assumptions, and the missing VIN. Optional: click **Clear → Generate Quote** to show validation.
3. **(2:00) Policy.** **Convert to demo policy → Run Policy Agent checks.** It flags the VIN and address. Enter VIN `2T3W1RFV8RW012045` and any address, re-run checks, tick the demo confirmation, **Create demo policy**. Point out the policy number, dates, status and "Demo record · not a real contract".
4. **(3:15) Claim.** **Register a claim** from the policy card. The sample deliberately omits the police report and the repair estimate is 35% above the customer estimate. **Submit claim** → **Open in Operations Console**.
5. **(4:00) Investigation.** Press **RUN AGENTIC CLAIMS INVESTIGATION**. Expand two or three agents to show structured output, findings with evidence, and execution trace.
6. **(5:30) Report + decision.** Recommendation: request the police report. Add a note and **Approve recommended next step**.
7. **(6:15) Customer uploads.** **Customer Portal → Track Claims**: status **Additional Documents Required**. Click **Upload sample police / traffic report** → status **Documents Received**.
8. **(7:00) Re-investigate.** Back in the claim workbench, **Re-run**. With documents complete, the Supervisor now recommends a senior review (early claim + estimate gap). **Approve** → **Assessment Completed**. Stress: the next step is assigned; no coverage or payment decision is made.
9. **(8:00) Both views agree.** Portal tracker shows **Assessment Completed** with full history.
10. **(8:30) Command Center + Audit.** **Agent Command Center**: each agent's current task, status, output and full run history. Click an agent card to filter. Then **Audit Trail** filtered to the claim.
11. **(9:15) Renewal.** **Ops → Renewals** (Daniel Okafor's policy expires within 60 days). **Run Renewal Agent** with odometer blank to show missing-info detection; review the estimate, edit the draft, **Save renewal draft**. Show the follow-up task.
11b. **(9:20) Chatbot.** Click **Ask InsureAI** in the portal as Layla Mansour: ask "Where is my claim?", then "When will I get paid?" to show the guardrail and call-back.
12. **(9:40) Orchestrator.** Open **Orchestrator Agent** and type “What's waiting on people?” to show the agent knows exactly where humans are needed.
12b. **(optional, +3 min) Another product.** **Products → Home → Generate Quote → Convert** (enter an address if asked) **→ Register a claim** (water damage is pre-selected with photos and a contractor estimate). In Ops, run the investigation on it, or open the seeded home scenario **CLM-2026-0106** from the Executive Overview to show missing photos and the flood-exclusion wording flagged. Then **Renewals** → the home policy: the agent asks for the rebuild value and indexes the sum insured.
13. **(9:55) Reset.** **Reset Demo** to restore the dataset for the next audience.

---

## 7. Known limitations

- **Simulated agents.** All agent reasoning is deterministic rules over configured thresholds. There is no LLM, OCR, image analysis or external data source. The UI labels this everywhere.
- **Documents are metadata.** Uploaded files are not read; the app stores the file name and size and uses sample extracted fields.
- **Browser-only persistence.** State lives in the viewer's browser local storage. It is per-browser, not shared between users, and not a database. If storage is blocked, the demo still works in memory for the session.
- **Single reviewer identity.** Decisions are recorded as "Aisha Karim · Claims Supervisor"; there is no authentication or role-based access.
- **No real integrations.** No payment, email/SMS, policy admin, core claims, bureau or garage network connections.
- **Illustrative pricing.** The tariff, VAT handling and renewal rules are demo values, not actuarial or regulatory pricing. Currency is SAR by configuration (`config/rules.ts`).
- **An investigation that is running when the page is closed** is marked "interrupted" on reload and can be re-run.
- **Voice depends on the browser.** Speaking to Maya uses the browser's speech recognition (Chrome, Edge, Safari; not Firefox), which needs microphone permission and, in Chrome, an internet connection because Google processes the audio. Embedded previews can block the microphone; open the standalone file or a hosted copy directly. Maya understands English.
- **The Chatbot and Orchestrator use rule-based intent matching**, so phrasing outside the supported patterns returns help text rather than a free-form answer.
- **Personal lines only.** Motor, Travel, Medical and Home are complete; SME lines (fleet, property, group medical, engineering, marine) and Domestic Helper / Personal Accident are placeholders.
- **Simplified product rules.** Medical has no provider network directory, pre-authorisation workflow or direct billing; travel has no assistance-line integration; home has no survey or valuation step. Policies record one product each (no multi-product bundles).

---

## 8. Next steps

**Real AI models**
1. Move `agents/*` behind a backend service (e.g. Node/Python API). Keep the existing typed input/output contracts as the API schema.
2. Implement an `llm` engine per agent: Document Intelligence → OCR + vision model for estimates, photos and police reports; Policy Intelligence → retrieval over policy wordings with clause citations; Supervisor → structured-output generation constrained to the report schema.
3. Keep deterministic code for pricing and rule checks; use models for extraction, summarisation and explanation. Store prompts, model versions and outputs per run for audit.
4. Add evaluation sets (golden claims) and human-feedback capture from reviewer decisions.
5. Replace the Chatbot's intent rules with a model-backed conversational agent that calls the same read and action functions, with retrieval over real policy wordings and the same privacy and decision guardrails enforced in code.
6. Give the Orchestrator a model-backed planner with tool calling over the same workflow functions, keeping the guardrails as hard-coded checks outside the model, and run it on a schedule or event trigger (new claim, document received, renewal window opens).

**Secure backend services**
1. API gateway with authentication (OIDC/SSO), role-based access (customer, handler, supervisor, auditor) and per-tenant isolation.
2. Database (e.g. PostgreSQL) replacing local storage; append-only audit table with tamper evidence (hash chain or WORM storage).
3. Secrets in a vault; model API keys only server-side. Encrypt PII at rest, mask in logs, and apply data-residency requirements for the client's jurisdiction.
4. Durable workflow engine (e.g. Temporal or a queue + state machine) so long investigations survive restarts and can be retried.

**Client-specific integrations**
1. Rating engine and product configuration from the client's policy administration system.
2. Core claims system (FNOL intake, status sync, reserve updates via approved human actions only).
3. Document management / e-signature, payment gateway (behind human approval), and notification services (email/SMS/WhatsApp) with consent.
4. External data: national vehicle registry, traffic reports, claims-history bureau, approved garage network and surveyor scheduling.
5. Map workflow statuses and approval authority limits to the client's operating model and regulatory requirements.
