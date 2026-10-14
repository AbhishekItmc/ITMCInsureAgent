import { useEffect, useMemo, useState } from 'react';
import {
  Activity, BadgeCheck, Bot, CarFront, ClipboardList, FileSearch, FileText, Gauge, LayoutGrid, RefreshCcw, RotateCcw, ScrollText, ShieldCheck, UserCheck, Workflow, Mail,
} from 'lucide-react';
import { Nav, type Area, type NavCtx, type Route } from './lib/nav';
import { useDemo } from './store/store';
import { resetDemo } from './store/workflows';
import { metrics } from './lib/selectors';
import { scanWork } from './agents/orchestrator';
import { Orchestrator } from './views/ops/Orchestrator';
import { ServiceComms } from './views/ops/ServiceComms';
import { ChatWidget } from './ui/ChatWidget';
import { BrandMark } from './ui/BrandMark';
import { PortalHeader } from './views/portal/PortalHeader';
import { ENGINE_LABEL } from './agents/runtime';
import { Toaster, cx, toast } from './ui/primitives';
import { Products } from './views/portal/Products';
import { QuotePage } from './views/portal/QuotePage';
import { PoliciesPage } from './views/portal/PoliciesPage';
import { ClaimNewPage } from './views/portal/ClaimNewPage';
import { ClaimsTrackPage } from './views/portal/ClaimsTrackPage';
import { RenewalPage } from './views/portal/RenewalPage';
import { Overview } from './views/ops/Overview';
import { QuotesPolicies } from './views/ops/QuotesPolicies';
import { ClaimsList } from './views/ops/ClaimsList';
import { ClaimWorkbench } from './views/ops/ClaimWorkbench';
import { CommandCenter } from './views/ops/CommandCenter';
import { ApprovalQueue } from './views/ops/ApprovalQueue';
import { RenewalsOps } from './views/ops/RenewalsOps';
import { AuditTrail } from './views/ops/AuditTrail';

const PORTAL_NAV = [
  { page: 'products', label: 'Products', icon: LayoutGrid },
  { page: 'quote', label: 'Get a Quote', icon: CarFront },
  { page: 'policies', label: 'My Policies', icon: ShieldCheck },
  { page: 'claim-new', label: 'Register a Claim', icon: FileText },
  { page: 'claims', label: 'Track Claims', icon: FileSearch },
  { page: 'renewal', label: 'Renewal', icon: RefreshCcw },
] as const;

const OPS_NAV = [
  { page: 'overview', label: 'Executive Overview', icon: Gauge },
  { page: 'orchestrator', label: 'Orchestrator Agent', icon: Workflow },
  { page: 'service', label: 'Service & Comms', icon: Mail },
  { page: 'quotes-policies', label: 'Quotes & Policies', icon: ClipboardList },
  { page: 'claims', label: 'Claims Management', icon: FileSearch },
  { page: 'command', label: 'Agent Command Center', icon: Bot },
  { page: 'approvals', label: 'Human Approval Queue', icon: UserCheck },
  { page: 'renewals', label: 'Renewals', icon: RefreshCcw },
  { page: 'audit', label: 'Audit Trail', icon: ScrollText },
] as const;

export default function App() {
  const s = useDemo();
  const [route, setRoute] = useState<Route>(() => {
    const h = typeof location !== 'undefined' ? location.hash.replace('#', '') : '';
    return h === 'ops' ? { area: 'ops', page: 'overview' } : { area: 'portal', page: 'products' };
  });
  const [viewer, setViewer] = useState<string>('CUS-1003');
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => { if (!s.customers.some((c) => c.id === viewer)) setViewer(s.customers[0]?.id ?? ''); }, [s.customers, viewer]);
  useEffect(() => { document.getElementById('main')?.scrollTo({ top: 0 }); window.scrollTo({ top: 0 }); }, [route]);

  const nav: NavCtx = useMemo(() => ({ route, go: (area, page, params) => setRoute({ area, page, params }), viewer, setViewer }), [route, viewer]);
  const m = metrics(s);
  const items = route.area === 'portal' ? PORTAL_NAV : OPS_NAV;
  const activePage = route.page === 'claim' ? 'claims' : route.page;
  const switchArea = (a: Area) => setRoute(a === 'portal' ? { area: 'portal', page: 'products' } : { area: 'ops', page: 'overview' });
  const badge = (page: string) => route.area === 'ops' ? (page === 'approvals' ? m.awaitingApproval : page === 'claims' ? m.openClaims : page === 'orchestrator' ? scanWork(s).filter((w) => w.actionable).length : page === 'service' ? s.serviceRequests.filter((r) => r.status === 'pending_approval').length + s.communications.filter((c) => c.status === 'draft').length : 0) : 0;

  return (
    <Nav.Provider value={nav}>
      <div className="flex h-full min-h-0 flex-col">
        {/* Top bar */}
        <header className="z-20 bg-navy text-navyink" style={{ paddingLeft: 'max(16px, env(safe-area-inset-left, 0px))', paddingRight: 'max(16px, env(safe-area-inset-right, 0px))' }}>
          <div className={cx('flex items-center gap-3', route.area === 'portal' ? 'h-11' : 'h-14')}>
            {route.area === 'portal' ? (
              <div className="flex min-w-0 items-center gap-2 text-[11.5px] text-navymuted">
                <span className="rounded border border-warn/50 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-warn">Demo</span>
                <span className="hidden truncate md:inline">Fictional data · simulated agents · no real messages or payments</span>
              </div>
            ) : (
            <div className="flex items-center gap-2.5 min-w-0">
              <BrandMark />
              <div className="leading-tight min-w-0">
                <div className="font-display text-[16px] font-extrabold tracking-tight">ITMC InsureAI</div>
                <div className="hidden text-[11px] text-navymuted sm:block">by ITMC Systems</div>
              </div>
            </div>
            )}
            <div className="ml-auto flex items-center gap-2">
              <div role="tablist" aria-label="Application view" className="flex rounded-lg bg-white/10 p-0.5">
                {(['portal', 'ops'] as Area[]).map((a) => (
                  <button key={a} role="tab" aria-selected={route.area === a} onClick={() => switchArea(a)}
                    className={cx('rounded-md px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors sm:px-3.5', route.area === a ? 'bg-teal text-white' : 'text-navymuted hover:text-navyink')}>
                    {a === 'portal' ? <><span className="sm:hidden">Portal</span><span className="hidden sm:inline">Customer Portal</span></> : <><span className="sm:hidden">Ops</span><span className="hidden sm:inline">Operations Console</span></>}
                  </button>
                ))}
              </div>
              <button onClick={() => setRoute({ area: 'ops', page: 'orchestrator' })} title="Orchestrator Agent"
                className={cx('inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors', route.page === 'orchestrator' ? 'border-teal bg-teal text-white' : 'border-teal/60 text-teal hover:bg-teal hover:text-white')}>
                <Workflow size={15} /> <span className="hidden md:inline">Orchestrator Agent</span>
                {scanWork(s).filter((w) => w.actionable).length > 0 && <span className="rounded-full bg-white/90 px-1.5 text-[11px] font-bold text-navy tnum">{scanWork(s).filter((w) => w.actionable).length}</span>}
              </button>
              {confirmReset ? (
                <div className="flex items-center gap-1.5 rounded-lg bg-white/10 px-2 py-1">
                  <span className="hidden text-[12px] text-navymuted md:inline">Restore original data?</span>
                  <button className="rounded-md bg-crit px-2 py-1 text-[12px] font-semibold text-white" onClick={() => { resetDemo(); setConfirmReset(false); setViewer('CUS-1003'); setRoute({ area: route.area, page: route.area === 'portal' ? 'products' : 'overview' }); toast('Demo data restored to the original synthetic dataset.', 'info'); }}>Reset</button>
                  <button className="rounded-md px-2 py-1 text-[12px] text-navymuted hover:text-navyink" onClick={() => setConfirmReset(false)}>Cancel</button>
                </div>
              ) : (
                <button onClick={() => setConfirmReset(true)} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium text-navymuted hover:bg-white/10 hover:text-navyink" title="Reset Demo">
                  <RotateCcw size={15} /> <span className="hidden sm:inline">Reset Demo</span>
                </button>
              )}
            </div>
          </div>
        </header>

        {route.area === 'portal' && <PortalHeader />}
        <div className="flex min-h-0 flex-1">
          {/* Sidebar */}
          {route.area === 'ops' && <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-surface md:flex">
            <div className="px-4 pb-2 pt-5 eyebrow">Operations Console</div>
            <nav className="flex flex-col gap-0.5 px-2">
              {items.map((it) => {
                const Icon = it.icon;
                const active = activePage === it.page;
                const b = badge(it.page);
                return (
                  <button key={it.page} onClick={() => nav.go(route.area, it.page)} aria-current={active ? 'page' : undefined}
                    className={cx('flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13.5px] font-medium transition-colors', active ? 'bg-tealsoft text-tealink' : 'text-muted hover:bg-sunken hover:text-ink')}>
                    <Icon size={17} strokeWidth={active ? 2.3 : 1.9} />
                    <span className="flex-1">{it.label}</span>
                    {b > 0 && <span className="rounded-full bg-navy px-1.5 text-[11px] font-semibold text-navyink tnum">{b}</span>}
                  </button>
                );
              })}
            </nav>
            <div className="mt-auto space-y-3 border-t border-line p-4">
              <div className="flex items-start gap-2 text-[11.5px] leading-snug text-muted">
                <Activity size={14} className="mt-0.5 shrink-0 text-teal" />
                <span>{ENGINE_LABEL}</span>
              </div>
              <div className="flex items-start gap-2 text-[11.5px] leading-snug text-muted">
                <BadgeCheck size={14} className="mt-0.5 shrink-0 text-warn" />
                <span>Fictional data only. Not a real insurer. No messages sent, no payments taken.</span>
              </div>
            </div>
          </aside>}

          {/* Main */}
          <main id="main" className="min-w-0 flex-1 overflow-y-auto">
            {/* Mobile nav */}
            {route.area === 'ops' && <nav className="scroll-x flex gap-1 border-b border-line bg-surface py-2 md:hidden" style={{ paddingLeft: 'max(16px, env(safe-area-inset-left, 0px))', paddingRight: 'max(16px, env(safe-area-inset-right, 0px))' }}>
              {items.map((it) => (
                <button key={it.page} onClick={() => nav.go(route.area, it.page)} className={cx('shrink-0 rounded-md px-3 py-1.5 text-[12.5px] font-medium', activePage === it.page ? 'bg-tealsoft text-tealink' : 'text-muted')}>
                  {it.label}
                </button>
              ))}
            </nav>}
            <div className="mx-auto max-w-[1240px] pb-16 pt-6" style={{ paddingLeft: 'max(16px, env(safe-area-inset-left, 0px))', paddingRight: 'max(16px, env(safe-area-inset-right, 0px))' }}>
              <div className="md:px-4">
                <Page route={route} />
              </div>
            </div>
          </main>
        </div>
        <ChatWidget />
        <Toaster />
      </div>
    </Nav.Provider>
  );
}

function Page({ route }: { route: Route }) {
  if (route.area === 'portal') {
    switch (route.page) {
      case 'products': return <Products />;
      case 'quote': return <QuotePage />;
      case 'policies': return <PoliciesPage />;
      case 'claim-new': return <ClaimNewPage />;
      case 'claims': return <ClaimsTrackPage />;
      case 'renewal': return <RenewalPage />;
    }
  } else {
    switch (route.page) {
      case 'overview': return <Overview />;
      case 'orchestrator': return <Orchestrator />;
      case 'service': return <ServiceComms />;
      case 'quotes-policies': return <QuotesPolicies />;
      case 'claims': return <ClaimsList />;
      case 'claim': return <ClaimWorkbench />;
      case 'command': return <CommandCenter />;
      case 'approvals': return <ApprovalQueue />;
      case 'renewals': return <RenewalsOps />;
      case 'audit': return <AuditTrail />;
    }
  }
  return null;
}
