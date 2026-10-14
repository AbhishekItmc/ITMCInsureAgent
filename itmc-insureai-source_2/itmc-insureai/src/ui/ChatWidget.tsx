import { useEffect, useRef, useState } from 'react';
import { Mic, Send, Square, Volume2, VolumeX, X } from 'lucide-react';
import { chatbotRespond, CUSTOMER_SUGGESTIONS, FLOW_PRODUCT, FLOWS, flowFacts, incidentFor, STAFF_SUGGESTIONS, type ChatAction, type ChatReply, type FlowKind } from '../agents/chatbot';
import { SERVICE_LABEL } from '../agents/servicingAgents';
import { DOC_LABELS, INCIDENT_LABEL, PRODUCT_INCIDENTS, PRODUCT_LABEL, REQUIRED_DOCS } from '../config/rules';
import { makeSampleDoc } from '../data/sampleDocs';
import { useNav } from '../lib/nav';
import { addDays, money, todayISO } from '../lib/format';
import { CLAIM_STATUS } from '../lib/selectors';
import { getState, useDemo } from '../store/store';
import { processServiceRequest, recordChatTurn, registerClaim, requestCallback, runOrchestrator, submitServiceRequest, uploadRequestedDocument } from '../store/workflows';
import type { ClaimDocument, DocType, IncidentType } from '../types';
import { AgentAvatar } from './AgentAvatar';
import { cx } from './primitives';

interface Msg { id: number; from: 'user' | 'bot'; text?: string; reply?: ChatReply }
interface FlowState { kind: FlowKind; step: number; data: Record<string, string>; policyId: string }
let seq = 0;

const AGENT_NAME = 'Maya';
/* Browser speech recognition (Chrome, Edge, Safari). Not in the TS DOM lib, so typed loosely. */
type Recognizer = { lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number; start: () => void; stop: () => void; abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null; onstart: (() => void) | null };
const getRecognizer = (): (new () => Recognizer) | undefined => typeof window === 'undefined' ? undefined
  : ((window as unknown as { SpeechRecognition?: new () => Recognizer }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => Recognizer }).webkitSpeechRecognition);
const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';

function pickVoice(): SpeechSynthesisVoice | undefined {
  try {
    const voices = window.speechSynthesis.getVoices().filter((v) => v.lang?.toLowerCase().startsWith('en'));
    const pref = ['Samantha', 'Google UK English Female', 'Microsoft Aria', 'Microsoft Zira', 'Female', 'Karen', 'Moira', 'Serena'];
    for (const p of pref) { const v = voices.find((x) => x.name.includes(p)); if (v) return v; }
    return voices[0];
  } catch { return undefined; }
}

export function ChatWidget() {
  const s = useDemo();
  const { route, viewer, go } = useNav();
  const area = route.area;
  const key = area === 'portal' ? `portal:${viewer}` : 'ops';
  const [open, setOpen] = useState(false);
  const [threads, setThreads] = useState<Record<string, Msg[]>>({});
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [used, setUsed] = useState<Set<string>>(new Set());
  const [flow, setFlow] = useState<FlowState | null>(null);
  const [voiceOn, setVoiceOn] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [teaser, setTeaser] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);
  const me = s.customers.find((c) => c.id === viewer);
  const [listening, setListening] = useState(false);
  const [micNote, setMicNote] = useState<string | null>(null);
  const recRef = useRef<Recognizer | null>(null);
  const sendRef = useRef<(m: string) => void>(() => {});

  /* ── voice (browser speech synthesis) ── */
  const stopSpeaking = () => { try { if (canSpeak()) window.speechSynthesis.cancel(); } catch { /* ignore */ } setSpeaking(false); };
  const speak = (lines: string[], force = false) => {
    if (!canSpeak() || (!voiceOn && !force)) return;
    try {
      window.speechSynthesis.cancel();
      const text = lines.join(' ').replace(/\bSAR\b/g, 'riyals').replace(/[“”]/g, '').replace(/([A-Z]{3})-(\d{4})-(\d{4})/g, '$1 $2 $3');
      const u = new SpeechSynthesisUtterance(text);
      const v = pickVoice(); if (v) u.voice = v;
      u.rate = 1.03; u.pitch = 1.05;
      u.onstart = () => setSpeaking(true);
      u.onend = () => setSpeaking(false);
      u.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(u);
    } catch { setSpeaking(false); }
  };
  /* ── voice input (browser speech recognition) ── */
  const stopListening = () => { try { recRef.current?.stop(); } catch { /* ignore */ } };
  const startListening = () => {
    const R = getRecognizer();
    if (!R) { setMicNote('Voice input isn\'t supported in this browser. Try Chrome, Edge or Safari, or type your message.'); return; }
    if (listening) { stopListening(); return; }
    stopSpeaking(); // don't let Maya hear herself
    setMicNote(null);
    const rec = new R();
    rec.lang = 'en-US'; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
    let finalText = '';
    rec.onstart = () => setListening(true);
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript; else interim += r[0].transcript;
      }
      setInput((finalText + interim).trim());
    };
    rec.onerror = (e) => {
      setListening(false);
      const msg: Record<string, string> = {
        'not-allowed': 'Microphone access is blocked. Allow the microphone for this page in your browser (the icon in the address bar), then tap the mic again. Embedded previews may not allow the microphone; open the standalone file or the hosted app directly.',
        'service-not-allowed': 'Microphone access is blocked for this page. Open the app directly in Chrome, Edge or Safari to use voice input.',
        'no-speech': 'I didn\'t hear anything. Tap the mic and speak after the tone.',
        'audio-capture': 'No microphone was found. Check that one is connected.',
        network: 'Voice recognition needs an internet connection in this browser.',
      };
      if (e.error !== 'aborted') setMicNote(msg[e.error] ?? `Voice input stopped (${e.error}).`);
    };
    rec.onend = () => {
      setListening(false); recRef.current = null;
      const said = finalText.trim();
      if (said) { setVoiceOn(true); sendRef.current(said); }
    };
    recRef.current = rec;
    try { rec.start(); } catch { setListening(false); setMicNote('Voice input could not start. Try again in a moment.'); }
  };
  useEffect(() => () => { stopSpeaking(); try { recRef.current?.abort(); } catch { /* ignore */ } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!open) { stopSpeaking(); try { recRef.current?.abort(); } catch { /* ignore */ } } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const greeting = (): Msg => ({
    id: ++seq, from: 'bot',
    reply: area === 'portal'
      ? { intent: 'greeting', text: [`Hello ${me?.name.split(' ')[0] ?? 'there'}, I'm ${AGENT_NAME}, your virtual insurance agent. I can check your claim, report a new one, change your policy, explain your cover or give you a quick price.`], suggestions: CUSTOMER_SUGGESTIONS.slice(0, 6) }
      : { intent: 'greeting', text: [`Hi, I'm ${AGENT_NAME}, the operations assistant. Ask about any claim, policy, quote or customer, or hand work to the Orchestrator Agent.`], suggestions: STAFF_SUGGESTIONS },
  });
  const thread = threads[key] ?? [];
  useEffect(() => { const h = () => setOpen(true); window.addEventListener('itmc-open-chat', h); return () => window.removeEventListener('itmc-open-chat', h); }, []);
  useEffect(() => {
    if (open && !threads[key]) { const g = greeting(); setThreads((t) => ({ ...t, [key]: [g] })); speak(g.reply!.text); }
  }, [open, key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setFlow(null); }, [key]);
  useEffect(() => { const t = setTimeout(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }), 30); return () => clearTimeout(t); }, [thread.length, typing, open, key]);
  useEffect(() => { const t = setTimeout(() => setTeaser(false), 9000); return () => clearTimeout(t); }, []);

  const push = (m: Omit<Msg, 'id'>) => setThreads((t) => ({ ...t, [key]: [...(t[key] ?? []), { ...m, id: ++seq }] }));
  const botSay = (text: string[], extra: Partial<ChatReply> = {}) => { push({ from: 'bot', reply: { intent: 'info', text, ...extra } }); speak(text); };

  /* ── guided flows ── */
  const confirmFlow = (f: FlowState) => {
    const def = FLOWS[f.kind];
    botSay([`Here's what I have for your ${def.title.toLowerCase()} on ${f.policyId}. Shall I go ahead?`], {
      facts: flowFacts(f.data),
      actions: [{ kind: 'complete_flow', label: f.kind === 'fnol' ? 'Submit claim' : 'Submit request', flow: f.kind, policyId: f.policyId, data: f.data }, { kind: 'start_flow', label: 'Start again', flow: f.kind, policyId: f.policyId, prefill: f.data._incident ? { _incident: f.data._incident } : undefined }],
    });
  };

  const beginFlow = (kind: FlowKind, prefill: Record<string, string> = {}, policyId?: string) => {
    const st = getState();
    const mine = st.policies.filter((p) => p.customerId === viewer && p.status === 'active').sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
    const need = FLOW_PRODUCT[kind];
    const policy = mine.find((p) => p.id === policyId) ?? (need ? mine.find((p) => p.product === need) : kind === 'fnol' ? mine.find((p) => p.product === 'motor') ?? mine[0] : mine[0]);
    if (!policy) { botSay([need ? `I couldn't find an active ${PRODUCT_LABEL[need].toLowerCase()} policy on your account.` : 'I couldn\'t find an active policy on your account.']); return; }
    const def = FLOWS[kind];
    let step = 0;
    while (step < def.steps.length && prefill[def.steps[step].key]) step++;
    const f: FlowState = { kind, step, data: { ...prefill }, policyId: policy.id };
    if (step >= def.steps.length) { setFlow(null); confirmFlow(f); return; }
    setFlow(f);
    botSay([`${def.title} for your ${PRODUCT_LABEL[policy.product].toLowerCase()} policy ${policy.id}.`, def.steps[step].q]);
  };

  const continueFlow = (msg: string) => {
    if (!flow) return;
    if (/^(cancel|stop|never ?mind|quit)$/i.test(msg.trim())) { setFlow(null); botSay(['No problem, I\'ve stopped. Nothing was submitted.'], { suggestions: CUSTOMER_SUGGESTIONS.slice(0, 4) }); return; }
    const def = FLOWS[flow.kind];
    const step = def.steps[flow.step];
    const r = step.parse(msg);
    if (!r.ok) { botSay([r.error, step.q]); return; }
    const data = { ...flow.data, [step.key]: r.value };
    const next = flow.step + 1;
    if (next >= def.steps.length) { setFlow(null); confirmFlow({ ...flow, data }); }
    else { setFlow({ ...flow, step: next, data }); botSay([def.steps[next].q]); }
  };

  const completeFlow = (a: Extract<ChatAction, { kind: 'complete_flow' }>) => {
    const st = getState();
    if (a.flow === 'fnol') {
      const p = st.policies.find((x) => x.id === a.policyId)!;
      const amount = Number(a.data.estimatedDamage);
      const ctx = { claimRef: 'NEW-CLAIM', incidentDate: a.data.incidentDate, reportedDate: todayISO(), plate: p.vehicle?.plate, holder: me?.name ?? '', estimatedDamage: amount, garage: a.data.garage, description: a.data.description, uploadedAt: new Date().toISOString() };
      const incidentType = (a.data._incident as IncidentType | undefined) && PRODUCT_INCIDENTS[p.product].includes(a.data._incident as IncidentType) ? a.data._incident as IncidentType : incidentFor(p.product, a.data.description);
      const noProvider = /^not/i.test(a.data.garage);
      // Attach what a customer typically has to hand in chat: claim form + photos/invoice; the rest stays outstanding.
      const handy: DocType[] = ['claim_form', 'damage_photos', 'medical_report', 'boarding_pass', 'baggage_report', 'prescription', ...(noProvider ? [] : ['repair_estimate', 'invoice'] as DocType[])];
      const docs: ClaimDocument[] = REQUIRED_DOCS[incidentType].filter((d) => handy.includes(d)).map((d) => d === 'repair_estimate'
        ? makeSampleDoc(d, ctx, { estimate: { partsTotal: Math.round(amount * 0.55), labourHours: Math.max(2, Math.round((amount * 0.3) / 180)), labourRate: 180, paintTotal: 0, estimateDate: todayISO() } })
        : makeSampleDoc(d, ctx));
      const outstanding = REQUIRED_DOCS[incidentType].filter((d) => !docs.some((x) => x.type === d));
      const r = registerClaim({ policyId: p.id, incidentType, incidentDate: a.data.incidentDate, location: a.data.location, description: a.data.description, vehiclePlate: p.vehicle?.plate, estimatedDamage: a.data.estimatedDamage, garage: a.data.garage, documents: docs });
      if (!r.ok) { botSay(['I couldn\'t register it yet:', ...Object.values(r.errors)], { actions: [{ kind: 'start_flow', label: 'Try again', flow: 'fnol', policyId: p.id }] }); return; }
      botSay([`Your ${INCIDENT_LABEL[incidentType].toLowerCase()} claim ${r.claimId} is registered. I've attached: ${docs.map((d) => DOC_LABELS[d.type].toLowerCase()).join(', ')}.`, `Our claims agents will review it next, and a person makes every decision.${outstanding.length ? ` Still needed: ${outstanding.map((d) => DOC_LABELS[d].toLowerCase()).join(', ')}.` : ''}`], {
        actions: [...outstanding.slice(0, 2).map((d): ChatAction => ({ kind: 'upload_doc', label: `Upload sample ${DOC_LABELS[d].toLowerCase()}`, claimId: r.claimId!, docType: d })), { kind: 'navigate', label: 'Track this claim', area: 'portal', page: 'claims', params: { claimId: r.claimId! } }],
      });
      return;
    }
    const pol = st.policies.find((x) => x.id === a.policyId);
    const details = Object.fromEntries(Object.entries(a.data).filter(([k, v]) => !k.startsWith('_') && v !== '').map(([k, v]) => [k, k === 'newEndDate' && v.startsWith('+') && pol ? addDays(pol.expiryDate, Number(v.slice(1))) : v]));
    if (a.flow === 'sum_insured_change' && !Object.keys(details).length) { botSay(['Both values are unchanged, so there is nothing to update.']); return; }
    const sub = submitServiceRequest(a.policyId, a.flow, details, 'chat');
    if (!sub.ok) { botSay([sub.error ?? 'I couldn\'t submit that request.']); return; }
    processServiceRequest(sub.id!);
    const req = getState().serviceRequests.find((x) => x.id === sub.id)!;
    const delta = req.assessment?.premiumDelta ?? 0;
    const lines = req.status === 'applied'
      ? [`Done. ${SERVICE_LABEL[a.flow]} ${sub.id} has been applied to ${a.policyId}.`, 'It was low risk with no premium change, so our Policy Servicing Agent applied it straight away.']
      : [`I've submitted ${sub.id} and our Policy Servicing Agent has assessed it.`, a.flow === 'cancellation'
          ? `A servicing officer will confirm the cancellation with you. The illustrative refund would be ${money(Math.abs(delta), { decimals: true })}. Your cover continues until then.`
          : `Because it changes your premium (${delta >= 0 ? '+' : '−'}${money(Math.abs(delta), { decimals: true })}, illustrative), an underwriter will review it. You'll see the outcome under My Policies.`];
    botSay(lines, { actions: [{ kind: 'navigate', label: 'View my policies', area: 'portal', page: 'policies' }] });
  };

  const runAction = async (a: ChatAction, actionKey: string) => {
    if (a.kind === 'navigate') { go(a.area, a.page, a.params); if (window.innerWidth < 640) setOpen(false); return; }
    if (a.kind === 'start_flow') { beginFlow(a.flow, a.prefill, a.policyId); return; }
    if (used.has(actionKey)) return;
    setUsed((u) => new Set(u).add(actionKey));
    if (a.kind === 'complete_flow') { completeFlow(a); return; }
    if (a.kind === 'upload_doc') {
      uploadRequestedDocument(a.claimId, a.docType);
      const c = getState().claims.find((x) => x.id === a.claimId);
      botSay([`Thanks, I've attached the ${DOC_LABELS[a.docType].toLowerCase()} to ${a.claimId}.`, c ? `Your claim is now: ${CLAIM_STATUS[c.status].customer}.` : ''].filter(Boolean), { actions: [{ kind: 'navigate', label: 'Open claim tracker', area: 'portal', page: 'claims', params: { claimId: a.claimId } }] });
    } else if (a.kind === 'callback') {
      const id = requestCallback(viewer, a.topic);
      botSay([`Done. I've created call-back request ${id} for our Customer Care team. They'll contact you on ${me?.phone || 'the number on file'} within one working day.`, 'No decision has been made on your request; a person will discuss it with you.']);
    } else if (a.kind === 'orchestrate') {
      setTyping(true);
      const r = await runOrchestrator({ trigger: 'command', command: a.command });
      setTyping(false);
      const run = getState().orchestratorRuns.find((x) => x.id === r.runId);
      botSay(r.ok && run ? [`Orchestrator ${run.id} finished: ${run.status === 'refused' ? 'declined by guardrail.' : ''}`, ...run.response] : [r.error ?? 'The Orchestrator could not run.'], { actions: [{ kind: 'navigate', label: 'Open Orchestrator', area: 'ops', page: 'orchestrator' }] });
    }
  };

  const send = (raw: string) => {
    const msg = raw.trim();
    if (!msg || typing) return;
    setInput('');
    push({ from: 'user', text: msg });
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      if (flow) { continueFlow(msg); return; }
      const reply = chatbotRespond(msg, getState(), { area, viewerId: viewer });
      push({ from: 'bot', reply });
      speak(reply.text);
      recordChatTurn(area, viewer, msg, reply.intent, reply.text[0] ?? '');
      if (reply.startFlow) setTimeout(() => beginFlow(reply.startFlow!.flow, reply.startFlow!.prefill, reply.startFlow!.policyId), 250);
      if (reply.autoRun) runAction(reply.autoRun, `auto-${seq}`);
    }, 600);
  };

  sendRef.current = send;
  const flowDef = flow ? FLOWS[flow.kind] : null;

  return (
    <>
      {!open && (
        <div className="fixed z-40 flex items-end gap-2" style={{ right: 'max(16px, env(safe-area-inset-right, 0px))', bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}>
          {teaser && (
            <div className="mb-2 hidden max-w-[220px] rounded-2xl rounded-br-sm border border-line bg-surface px-3.5 py-2.5 text-[13px] text-ink shadow-lg sm:block">
              <button aria-label="Dismiss" onClick={() => setTeaser(false)} className="float-right -mr-1 -mt-1 ml-1 text-muted hover:text-ink"><X size={13} /></button>
              Hi, I'm <strong>{AGENT_NAME}</strong>, your virtual insurance agent. How can I help?
            </div>
          )}
          <button onClick={() => { setOpen(true); setTeaser(false); }} aria-label="Open chat assistant"
            className="group flex items-center gap-2 rounded-full bg-navy py-1.5 pl-1.5 pr-4 text-navyink shadow-xl ring-2 ring-teal/70 hover:ring-teal">
            <AgentAvatar size={46} ring />
            <span className="text-left leading-tight">
              <span className="block text-[13.5px] font-bold">Ask {AGENT_NAME}</span>
              <span className="flex items-center gap-1 text-[11px] text-navymuted"><span className="h-1.5 w-1.5 rounded-full bg-ok" /> Virtual agent · online</span>
            </span>
          </button>
        </div>
      )}
      {open && (
        <section role="dialog" aria-label="Chatbot Agent" className="fixed z-50 flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
          style={{ right: 'max(12px, env(safe-area-inset-right, 0px))', bottom: 'calc(12px + env(safe-area-inset-bottom, 0px))', width: 'min(410px, calc(100vw - 24px))', height: 'min(660px, calc(100vh - 90px))' }}>
          <header className="flex items-center gap-3 bg-navy px-4 py-3 text-navyink">
            <AgentAvatar size={46} speaking={speaking} ring />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="font-display text-[15px] font-bold">{AGENT_NAME} · Chatbot Agent</div>
              <div className="truncate text-[11.5px] text-navymuted">{speaking ? 'Speaking…' : listening ? 'Listening to you…' : area === 'portal' ? `Virtual insurance agent · helping ${me?.name.split(' ')[0] ?? ''}` : 'Operations assistant'} · simulated</div>
            </div>
            {canSpeak() && (
              <button onClick={() => { if (voiceOn) stopSpeaking(); setVoiceOn(!voiceOn); }} aria-pressed={voiceOn} aria-label={voiceOn ? 'Turn voice off' : 'Turn voice on'} title={voiceOn ? 'Voice on' : 'Voice off'}
                className={cx('rounded-md p-1.5 hover:bg-white/10', voiceOn ? 'text-teal' : 'text-navymuted')}>{voiceOn ? <Volume2 size={18} /> : <VolumeX size={18} />}</button>
            )}
            <button onClick={() => setOpen(false)} aria-label="Close chat" className="rounded-md p-1.5 text-navymuted hover:bg-white/10 hover:text-navyink"><X size={18} /></button>
          </header>
          {flowDef && flow && (
            <div className="flex items-center gap-2 border-b border-line bg-tealsoft/60 px-4 py-2 text-[12px] text-tealink">
              <span className="font-semibold">{flowDef.title}</span>
              <span className="flex gap-1">{flowDef.steps.map((_, i) => <span key={i} className={cx('h-1.5 w-4 rounded-full', i < flow.step ? 'bg-teal' : i === flow.step ? 'bg-teal/60' : 'bg-line')} />)}</span>
              <span className="ml-auto">Step {flow.step + 1} of {flowDef.steps.length} · “cancel” to stop</span>
            </div>
          )}

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto bg-bg px-3 py-4">
            {thread.map((m) => m.from === 'user' ? (
              <div key={m.id} className="flex justify-end"><div className="max-w-[85%] rounded-2xl rounded-br-sm bg-navy px-3.5 py-2 text-[13.5px] text-navyink">{m.text}</div></div>
            ) : (
              <div key={m.id} className="flex gap-2">
                <span className="mt-0.5"><AgentAvatar size={28} /></span>
                <div className="min-w-0 max-w-[86%] space-y-2">
                  <div className="group relative space-y-1.5 rounded-2xl rounded-tl-sm border border-line bg-surface px-3.5 py-2.5 text-[13.5px] leading-relaxed text-ink">
                    {m.reply!.text.map((l, i) => <p key={i}>{l}</p>)}
                    {m.reply!.facts && (
                      <dl className="mt-1 divide-y divide-line rounded-lg border border-line text-[12.5px]">
                        {m.reply!.facts.map((f) => <div key={f.label} className="flex justify-between gap-3 px-2.5 py-1.5"><dt className="text-muted">{f.label}</dt><dd className="text-right font-medium tnum">{f.value}</dd></div>)}
                      </dl>
                    )}
                    {canSpeak() && <button onClick={() => speak(m.reply!.text, true)} aria-label="Read this message aloud" className="absolute -right-2 -top-2 hidden rounded-full border border-line bg-surface p-1 text-muted shadow-sm hover:text-teal group-hover:block"><Volume2 size={12} /></button>}
                  </div>
                  {m.reply!.actions && m.reply!.actions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {m.reply!.actions.map((a, i) => {
                        const k = `${m.id}-${i}`;
                        const done = used.has(k);
                        return (
                          <button key={k} disabled={done} onClick={() => runAction(a, k)}
                            className={cx('rounded-lg px-3 py-1.5 text-[12.5px] font-semibold', a.kind === 'navigate' || a.kind === 'start_flow' ? 'border border-teal/60 text-tealink hover:bg-tealsoft' : 'bg-teal text-white hover:bg-teal/90', done && 'opacity-50')}>
                            {done ? `✓ ${a.label}` : a.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {m.reply!.suggestions && m.id === thread[thread.length - 1]?.id && !flow && (
                    <div className="flex flex-wrap gap-1.5">
                      {m.reply!.suggestions.map((q) => <button key={q} onClick={() => send(q)} className="rounded-full border border-line bg-surface px-2.5 py-1 text-[12px] text-muted hover:border-teal/60 hover:text-ink">{q}</button>)}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {typing && (
              <div className="flex gap-2"><AgentAvatar size={28} />
                <div className="rounded-2xl rounded-tl-sm border border-line bg-surface px-3.5 py-2.5"><span className="pulse-dot inline-block h-2 w-2 rounded-full bg-teal" /> <span className="pulse-dot inline-block h-2 w-2 rounded-full bg-teal [animation-delay:150ms]" /> <span className="pulse-dot inline-block h-2 w-2 rounded-full bg-teal [animation-delay:300ms]" /></div></div>
            )}
          </div>

          {(listening || micNote) && (
            <div role="status" aria-live="polite" className={cx('flex items-start gap-2 border-t border-line px-3 py-2 text-[12px]', listening ? 'bg-tealsoft/60 text-tealink' : 'bg-warnsoft text-ink')}>
              {listening ? <><span className="relative mt-0.5 flex h-2.5 w-2.5 shrink-0"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal opacity-70" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-teal" /></span><span className="font-medium">Listening… speak now. Tap the stop button when you're done.</span></>
                : <><span className="min-w-0 flex-1">{micNote}</span><button onClick={() => setMicNote(null)} aria-label="Dismiss" className="text-muted hover:text-ink"><X size={13} /></button></>}
            </div>
          )}
          <form className="flex gap-2 border-t border-line bg-surface p-3" onSubmit={(e) => { e.preventDefault(); if (listening) stopListening(); send(input); }}>
            <button type="button" id="chat-mic" onClick={startListening} aria-pressed={listening} aria-label={listening ? 'Stop listening' : 'Speak to Maya'} title={listening ? 'Stop listening' : 'Speak your message'}
              className={cx('relative inline-flex h-9 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors', listening ? 'border-crit bg-crit text-white' : 'border-teal/60 text-tealink hover:bg-tealsoft')}>
              {listening ? <Square size={14} fill="currentColor" /> : <Mic size={17} />}
              {listening && <span className="absolute inset-0 animate-ping rounded-lg border-2 border-crit/60" />}
            </button>
            <input id="chat-input" className="input" placeholder={listening ? 'Listening…' : flowDef ? 'Type or speak your answer…' : area === 'portal' ? 'Ask or speak about claims, cover…' : 'Ask about a claim, customer or workload…'} value={input} onChange={(e) => setInput(e.target.value)} autoComplete="off" />
            <button type="submit" disabled={!input.trim() || typing} aria-label="Send message" className="inline-flex h-9 w-10 shrink-0 items-center justify-center rounded-lg bg-teal text-white disabled:opacity-40"><Send size={16} /></button>
          </form>
          <p className="bg-surface px-3 pb-2 text-[10.5px] text-muted">{AGENT_NAME} is a simulated agent using fictional demo records. Tap the mic to talk; voice uses your browser's speech engine (some browsers process speech on their own servers). She never approves claims, authorises payments or sends messages.</p>
        </section>
      )}
    </>
  );
}
