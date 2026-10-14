import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Globe, Headset, Menu, Search, UserRound, X } from 'lucide-react';
import { useNav, type PortalPage } from '../../lib/nav';
import { useDemo } from '../../store/store';
import { BrandMark } from '../../ui/BrandMark';
import { cx, toast } from '../../ui/primitives';

interface Item { label: string; page: PortalPage; params?: Record<string, string>; note?: string }
const MENUS: { label: string; items: Item[] }[] = [
  { label: 'Products', items: [
    { label: 'Motor', page: 'quote', params: { product: 'motor' }, note: 'Comprehensive or third-party' },
    { label: 'Travel', page: 'quote', params: { product: 'travel' }, note: 'Single trip or annual multi-trip' },
    { label: 'Medical', page: 'quote', params: { product: 'medical' }, note: 'Individual and family plans' },
    { label: 'Home', page: 'quote', params: { product: 'home' }, note: 'Buildings and contents' },
    { label: 'All products', page: 'products', note: 'Personal and SME' },
  ] },
  { label: 'Claims', items: [
    { label: 'Register a Claim', page: 'claim-new', note: 'Report an incident' },
    { label: 'Track Claims', page: 'claims', note: 'Live status of your claims' },
  ] },
  { label: 'My Account', items: [
    { label: 'My Policies', page: 'policies', note: 'Policies and open quotes' },
    { label: 'Renewal', page: 'renewal', note: 'Renewal estimate and draft' },
  ] },
];

export const openChat = () => window.dispatchEvent(new Event('itmc-open-chat'));

export function PortalHeader() {
  const s = useDemo();
  const { route, go, viewer, setViewer } = useNav();
  const [open, setOpen] = useState<string | null>(null);
  const [mobile, setMobile] = useState(false);
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  useEffect(() => { setOpen(null); setMobile(false); }, [route]);

  const goItem = (it: Item) => { go('portal', it.page, it.params); setOpen(null); setMobile(false); };

  const runSearch = () => {
    const t = q.trim();
    if (!t) return;
    const id = t.toUpperCase();
    const mine = (x: { customerId: string }) => x.customerId === viewer;
    const claim = s.claims.find((c) => c.id === id);
    const pol = s.policies.find((p) => p.id === id);
    if (claim) { if (mine(claim)) go('portal', 'claims', { claimId: id }); else toast(`${id} isn't on your account.`, 'warn'); }
    else if (pol) { if (mine(pol)) go('portal', 'policies'); else toast(`${id} isn't on your account.`, 'warn'); }
    else if (/travel|trip/i.test(t)) go('portal', 'quote', { product: 'travel' });
    else if (/medical|health/i.test(t)) go('portal', 'quote', { product: 'medical' });
    else if (/home|house|villa|apartment/i.test(t)) go('portal', 'quote', { product: 'home' });
    else if (/quote|price|insure|motor|car/i.test(t)) go('portal', 'quote', { product: 'motor' });
    else if (/track|status/i.test(t)) go('portal', 'claims');
    else if (/claim|accident/i.test(t)) go('portal', 'claim-new');
    else if (/renew|expir/i.test(t)) go('portal', 'renewal');
    else if (/polic/i.test(t)) go('portal', 'policies');
    else { toast('No match. Try a claim number, “quote”, “claim” or “renewal”.', 'info'); return; }
    setQ(''); setSearching(false);
  };

  const active = (it: Item) => route.page === it.page && (!it.params?.product || (route.params?.product ?? 'motor') === it.params.product);

  return (
    <header ref={ref} className="relative z-30 bg-gradient-to-r from-[rgb(var(--navy))] via-[#123459] to-[#164a6e] text-white"
      style={{ paddingLeft: 'max(16px, env(safe-area-inset-left, 0px))', paddingRight: 'max(16px, env(safe-area-inset-right, 0px))' }}>
      <div className="mx-auto flex h-[72px] max-w-[1240px] items-center gap-2 sm:gap-4 md:px-4">
        <button onClick={() => go('portal', 'products')} className="flex shrink-0 items-center gap-2.5" aria-label="ITMC InsureAI home">
          <BrandMark size={36} />
          <span className="hidden text-left leading-none min-[440px]:block">
            <span className="block font-display text-[18px] font-extrabold tracking-tight">ITMC InsureAI</span>
            <span className="mt-0.5 block text-[10.5px] tracking-wide text-white/60">by ITMC Systems</span>
          </span>
        </button>

        <nav className="ml-4 hidden items-center gap-1 lg:flex" aria-label="Customer portal">
          {MENUS.map((m) => (
            <div key={m.label} className="relative">
              <button data-menu={m.label} aria-expanded={open === m.label} onClick={() => setOpen(open === m.label ? null : m.label)}
                className={cx('flex items-center gap-1.5 rounded-lg px-3 py-2 text-[15px] font-semibold transition-colors hover:bg-white/10', m.items.some(active) && 'text-teal')}>
                {m.label} <ChevronDown size={16} className={cx('transition-transform', open === m.label && 'rotate-180')} />
              </button>
              {open === m.label && (
                <div role="menu" className="absolute left-0 top-full mt-2 w-64 overflow-hidden rounded-xl border border-line bg-surface p-1.5 text-ink shadow-xl">
                  {m.items.map((it) => (
                    <button key={it.label} role="menuitem" data-portal-nav onClick={() => goItem(it)}
                      className={cx('block w-full rounded-lg px-3 py-2 text-left hover:bg-sunken', active(it) && 'bg-tealsoft')}>
                      <span className="block text-[14px] font-semibold">{it.label}</span>
                      {it.note && <span className="block text-[12px] text-muted">{it.note}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          {searching ? (
            <form onSubmit={(e) => { e.preventDefault(); runSearch(); }} className="flex items-center gap-1 rounded-full bg-white/15 pl-3">
              <input id="portal-search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Claim no., quote, renewal…" className="w-36 bg-transparent py-1.5 text-[13.5px] text-white placeholder:text-white/60 outline-none sm:w-52" />
              <button type="button" aria-label="Close search" onClick={() => setSearching(false)} className="rounded-full p-1.5 hover:bg-white/10"><X size={15} /></button>
            </form>
          ) : (
            <button aria-label="Search" onClick={() => setSearching(true)} className="rounded-full p-2 hover:bg-white/10"><Search size={20} /></button>
          )}
          <button onClick={() => toast('An Arabic (right-to-left) interface is planned for the next phase of the MVP.', 'info')} className="hidden items-center gap-1.5 rounded-lg px-2 py-2 text-[15px] font-semibold hover:bg-white/10 md:flex" lang="ar" aria-label="Switch to Arabic">
            <Globe size={19} /> العربية
          </button>
          <button onClick={openChat} className="hidden items-center gap-1.5 rounded-lg px-2 py-2 text-[13px] font-medium hover:bg-white/10 md:flex">
            <Headset size={19} /> Contact us
          </button>
          <label className="flex min-w-0 items-center gap-1.5 rounded-full bg-white py-1.5 pl-2.5 pr-1.5 sm:gap-2 sm:pl-3 sm:pr-2 text-[#0b1f3a] shadow-sm" title="Switch demo customer">
            <UserRound size={18} className="shrink-0" />
            <select id="viewer" aria-label="Signed in as" value={viewer} onChange={(e) => setViewer(e.target.value)} className="max-w-[110px] bg-transparent text-[14px] font-semibold outline-none sm:max-w-none">
              {s.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <button aria-label="Menu" aria-expanded={mobile} onClick={() => setMobile(!mobile)} className="rounded-lg p-2 hover:bg-white/10 lg:hidden">{mobile ? <X size={20} /> : <Menu size={20} />}</button>
        </div>
      </div>

      {mobile && (
        <div className="border-t border-white/10 pb-4 lg:hidden">
          {MENUS.map((m) => (
            <div key={m.label} className="pt-3">
              <div className="px-1 text-[11px] font-semibold uppercase tracking-wider text-white/50">{m.label}</div>
              {m.items.map((it) => (
                <button key={it.label} data-portal-nav onClick={() => goItem(it)} className={cx('block w-full rounded-lg px-2 py-2 text-left text-[15px] font-medium hover:bg-white/10', active(it) && 'text-teal')}>{it.label}</button>
              ))}
            </div>
          ))}
          <div className="mt-3 flex gap-2">
            <button onClick={openChat} className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-[13.5px]"><Headset size={16} /> Contact us</button>
            <button onClick={() => toast('An Arabic (right-to-left) interface is planned for the next phase of the MVP.', 'info')} className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-[13.5px]"><Globe size={16} /> العربية</button>
          </div>
        </div>
      )}
    </header>
  );
}
