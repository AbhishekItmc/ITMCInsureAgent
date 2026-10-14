import { useEffect, useState } from 'react';
import {
  ArrowRight, ArrowUpRight, Bot, Building2, CarFront, ChevronLeft, ChevronRight, FileSearch, FileText, HardHat, HeartPulse, Home, Luggage,
  RefreshCcw, Ship, ShieldCheck, Stethoscope, Truck, UserRound, Users,
} from 'lucide-react';
import { useNav } from '../../lib/nav';
import { useDemo } from '../../store/store';
import { CLAIM_STATUS } from '../../lib/selectors';
import { Button, cx, toast } from '../../ui/primitives';
import type { LucideIcon } from 'lucide-react';

type Segment = 'personal' | 'sme';
interface Product { key: string; label: string; icon: LucideIcon; live?: boolean; blurb: string }

const PRODUCTS: Record<Segment, Product[]> = {
  personal: [
    { key: 'motor', label: 'Motor', icon: CarFront, live: true, blurb: 'Start your motor insurance in under two minutes.' },
    { key: 'travel', label: 'Travel', icon: Luggage, live: true, blurb: 'Cover your next trip, or every trip this year.' },
    { key: 'home', label: 'Home', icon: Home, live: true, blurb: 'Protect your home and everything in it.' },
    { key: 'medical', label: 'Medical', icon: Stethoscope, live: true, blurb: 'Health cover for you and your family.' },
    { key: 'helper', label: 'Domestic Helper', icon: UserRound, blurb: 'Cover for domestic workers in your household.' },
    { key: 'pa', label: 'Personal Accident', icon: HeartPulse, blurb: 'Lump-sum cover for accidental injury.' },
  ],
  sme: [
    { key: 'fleet', label: 'Fleet', icon: Truck, blurb: 'Motor cover for company vehicles.' },
    { key: 'property', label: 'Property', icon: Building2, blurb: 'Premises, stock and equipment.' },
    { key: 'group', label: 'Group Medical', icon: Users, blurb: 'Health cover for your employees.' },
    { key: 'engineering', label: 'Engineering', icon: HardHat, blurb: 'Contractors’ all-risk and machinery.' },
    { key: 'marine', label: 'Marine Cargo', icon: Ship, blurb: 'Goods in transit by sea, air and land.' },
  ],
};

const SLIDES = [
  { title: 'Drive covered.', accent: 'Claim with confidence.', body: 'Motor, travel, medical and home cover priced in seconds, with every factor explained. When something happens, our agents start working on your claim straight away.' },
  { title: 'Claims, reviewed', accent: 'in minutes not weeks.', body: 'Five coordinated AI agents check your documents, your policy and the repair estimate, then a person makes every decision.' },
  { title: 'Renewal,', accent: 'without surprises.', body: 'See your renewal estimate early, understand what changed, and confirm the details that matter.' },
];

/** Original hero artwork: a road in perspective, a car, and a teal protective arc with linked agent nodes. */
function HeroArt() {
  return (
    <svg viewBox="0 0 640 420" className="h-full w-full" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="road" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1d3b63" /><stop offset="1" stopColor="#0f2544" /></linearGradient>
        <linearGradient id="car" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#d7e3ef" /><stop offset="1" stopColor="#8fa6bf" /></linearGradient>
        <radialGradient id="glow" cx="0.5" cy="0.6" r="0.6"><stop offset="0" stopColor="rgb(45 196 182)" stopOpacity=".35" /><stop offset="1" stopColor="rgb(45 196 182)" stopOpacity="0" /></radialGradient>
      </defs>
      <path d="M300 60 L340 60 L640 420 L60 420 Z" fill="url(#road)" />
      <path d="M318 70 L322 70 L360 420 L340 420 Z" fill="#c9d6e4" opacity=".35" />
      {[0, 1, 2, 3].map((i) => <rect key={i} x={318 + i * 3} y={110 + i * 70} width={4 + i * 3} height={26 + i * 10} fill="#e8eef5" opacity=".55" transform={`skewX(${-2 - i})`} />)}
      <ellipse cx="350" cy="300" rx="230" ry="150" fill="url(#glow)" />
      {/* protective arc */}
      <path d="M150 360 C 170 170, 520 150, 560 340" fill="none" stroke="rgb(45 196 182)" strokeWidth="4" strokeDasharray="2 10" strokeLinecap="round" />
      <path d="M170 360 C 190 200, 500 185, 535 340" fill="none" stroke="rgb(45 196 182)" strokeOpacity=".5" strokeWidth="2" />
      {/* car */}
      <g transform="translate(250 220)">
        <ellipse cx="100" cy="138" rx="120" ry="14" fill="#06111f" opacity=".45" />
        <path d="M20 95 C 22 70, 40 60, 60 56 L 78 22 C 82 14, 90 10, 100 10 L 150 10 C 160 10, 168 14, 172 22 L 188 56 C 206 60, 222 70, 224 95 L 224 122 C 224 128, 220 132, 214 132 L 30 132 C 24 132, 20 128, 20 122 Z" fill="url(#car)" />
        <path d="M84 26 C 88 20, 94 18, 100 18 L 150 18 C 156 18, 162 20, 166 26 L 178 54 L 72 54 Z" fill="#1d3557" />
        <rect x="34" y="84" width="40" height="14" rx="5" fill="#f4f8fb" />
        <rect x="170" y="84" width="40" height="14" rx="5" fill="#f4f8fb" />
        <rect x="88" y="94" width="68" height="20" rx="4" fill="#2b4466" />
        {[0, 1, 2, 3].map((i) => <rect key={i} x={94} y={98 + i * 4} width="56" height="1.6" fill="#7f97b3" />)}
        <rect x="22" y="128" width="30" height="14" rx="4" fill="#0b1a2e" />
        <rect x="192" y="128" width="30" height="14" rx="4" fill="#0b1a2e" />
      </g>
      {/* agent nodes */}
      <g stroke="rgb(45 196 182)" strokeWidth="1.5" opacity=".9">
        <line x1="470" y1="120" x2="540" y2="90" /><line x1="540" y1="90" x2="575" y2="150" /><line x1="470" y1="120" x2="575" y2="150" />
      </g>
      <circle cx="470" cy="120" r="7" fill="rgb(45 196 182)" /><circle cx="540" cy="90" r="7" fill="#e8eef5" /><circle cx="575" cy="150" r="7" fill="#e8eef5" />
    </svg>
  );
}


/* ── Original showcase illustrations (SVG, no photos) ── */
function MotorArt() {
  return (
    <svg viewBox="0 0 400 380" preserveAspectRatio="xMidYMid slice" className="h-full w-full" aria-hidden="true">
      <defs><linearGradient id="mSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5b7fa6" /><stop offset=".55" stopColor="#2a4c73" /><stop offset="1" stopColor="#0d2240" /></linearGradient></defs>
      <rect width="400" height="380" fill="url(#mSky)" />
      <circle cx="320" cy="70" r="30" fill="#f6d9a8" opacity=".5" />
      <path d="M0 150 Q 60 120 120 140 T 250 130 T 400 120 L400 200 L0 200Z" fill="#244a5c" opacity=".8" />
      <path d="M0 170 Q 80 140 170 165 T 400 150 L400 220 L0 220Z" fill="#1d3f4c" />
      <path d="M170 150 L230 150 L400 380 L0 380Z" fill="#33475f" />
      <path d="M198 160 L202 160 L230 380 L210 380Z" fill="#e7eef5" opacity=".6" />
      <g transform="translate(95 105) scale(1.05)">
        <path d="M30 120 C 20 40, 190 40, 180 120" fill="none" stroke="rgb(45 196 182)" strokeWidth="3" strokeDasharray="3 7" />
        <ellipse cx="105" cy="122" rx="95" ry="10" fill="#06111f" opacity=".5" />
        <path d="M20 90 C 22 70, 38 62, 55 58 L 70 32 C 74 26, 80 22, 88 22 L 122 22 C 130 22, 136 26, 140 32 L 155 58 C 172 62, 188 70, 190 90 L 190 112 C 190 117, 186 120, 181 120 L 29 120 C 24 120, 20 117, 20 112 Z" fill="#c9d7e6" />
        <path d="M74 36 C 77 31, 82 29, 88 29 L 122 29 C 128 29, 133 31, 136 36 L 146 57 L 64 57 Z" fill="#1d3557" />
        <rect x="30" y="80" width="30" height="11" rx="4" fill="#fffbe8" /><rect x="150" y="80" width="30" height="11" rx="4" fill="#fffbe8" />
        <rect x="80" y="88" width="50" height="16" rx="3" fill="#2b4466" />
      </g>
    </svg>
  );
}
function TravelArt() {
  return (
    <svg viewBox="0 0 400 380" preserveAspectRatio="xMidYMid slice" className="h-full w-full" aria-hidden="true">
      <defs>
        <linearGradient id="tSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#12305a" /><stop offset=".6" stopColor="#3d6f9e" /><stop offset="1" stopColor="#e4b98c" /></linearGradient>
      </defs>
      <rect width="400" height="380" fill="url(#tSky)" />
      {[[30, 300, 90], [140, 320, 120], [280, 305, 100], [360, 330, 80]].map(([x, y, r], i) => <ellipse key={i} cx={x} cy={y} rx={r} ry={r / 3} fill="#f4efe8" opacity=".55" />)}
      <path d="M200 70 L268 96 V150 C268 196 238 222 200 236 C162 222 132 196 132 150 V96 Z" fill="rgb(45 196 182)" fillOpacity=".08" stroke="#cfe9ef" strokeOpacity=".7" strokeWidth="2.5" />
      <path d="M0 120 L150 150" stroke="#ffffff" strokeOpacity=".25" strokeWidth="2" />
      <g transform="translate(95 135) rotate(-6)">
        <path d="M10 60 C 40 48, 160 44, 205 50 C 222 52, 228 60, 214 64 L 40 74 C 22 75, 8 70, 10 60 Z" fill="#eef3f8" />
        <path d="M110 58 L 70 112 L 92 112 L 150 62 Z" fill="#c9d6e3" />
        <path d="M120 54 L 92 18 L 108 18 L 150 52 Z" fill="#c9d6e3" />
        <path d="M195 50 L 214 18 L 224 20 L 214 56 Z" fill="#d7e1ec" />
        <rect x="80" y="74" width="26" height="12" rx="6" fill="#9fb2c6" />
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <circle key={i} cx={60 + i * 14} cy={58} r="2" fill="#5b7390" />)}
        <path d="M14 60 C 18 54, 26 52, 34 54 L 30 62 Z" fill="#2b4466" />
      </g>
    </svg>
  );
}
function HomeArt() {
  return (
    <svg viewBox="0 0 400 380" preserveAspectRatio="xMidYMid slice" className="h-full w-full" aria-hidden="true">
      <defs><linearGradient id="hBg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#5c6f84" /><stop offset="1" stopColor="#1c2d42" /></linearGradient></defs>
      <rect width="400" height="380" fill="url(#hBg)" />
      <g transform="translate(70 60)">
        <path d="M130 0 L 260 100 L 0 100 Z" fill="#33495f" />
        <rect x="25" y="100" width="210" height="160" fill="#8a9bad" />
        <rect x="45" y="125" width="50" height="45" rx="3" fill="#f6d9a8" opacity=".85" />
        <rect x="165" y="125" width="50" height="45" rx="3" fill="#f6d9a8" opacity=".6" />
        <rect x="105" y="170" width="50" height="90" rx="3" fill="#34495e" />
        <circle cx="146" cy="216" r="3" fill="#f6d9a8" />
      </g>
      <g transform="translate(250 175)">
        <rect width="110" height="110" rx="12" fill="#c9d3dd" stroke="#e8edf2" strokeWidth="3" />
        <circle cx="55" cy="55" r="26" fill="#9aa9b8" stroke="#eef2f6" strokeWidth="3" />
        {[0, 60, 120, 180, 240, 300].map((a) => <line key={a} x1="55" y1="55" x2={55 + 22 * Math.cos((a * Math.PI) / 180)} y2={55 + 22 * Math.sin((a * Math.PI) / 180)} stroke="#eef2f6" strokeWidth="3" />)}
        <circle cx="55" cy="55" r="6" fill="rgb(45 196 182)" />
        <rect x="-8" y="20" width="10" height="22" rx="3" fill="#7d8c9b" /><rect x="-8" y="68" width="10" height="22" rx="3" fill="#7d8c9b" />
      </g>
    </svg>
  );
}

function MedicalArt() {
  return (
    <svg viewBox="0 0 400 380" preserveAspectRatio="xMidYMid slice" className="h-full w-full" aria-hidden="true">
      <defs><linearGradient id="mBg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#1f5e73" /><stop offset="1" stopColor="#0c2340" /></linearGradient></defs>
      <rect width="400" height="380" fill="url(#mBg)" />
      <circle cx="300" cy="90" r="120" fill="rgb(45 196 182)" opacity=".12" />
      <g transform="translate(130 50)">
        <rect x="45" y="0" width="50" height="140" rx="10" fill="#e9f3f6" />
        <rect x="0" y="45" width="140" height="50" rx="10" fill="#e9f3f6" />
        <rect x="55" y="10" width="30" height="120" rx="6" fill="rgb(45 196 182)" opacity=".85" />
        <rect x="10" y="55" width="120" height="30" rx="6" fill="rgb(45 196 182)" opacity=".85" />
      </g>
      <path d="M0 250 H120 L140 215 L165 285 L190 235 L205 250 H400" fill="none" stroke="#cfe9ef" strokeOpacity=".8" strokeWidth="3" strokeLinejoin="round" />
      {[[60, 300], [110, 296], [160, 304]].map(([x, y], i) => <g key={i} transform={`translate(${x} ${y})`}><circle r={i === 1 ? 14 : 11} fill="#d6e4ec" /><path d={`M${i === 1 ? -22 : -18} 40 C ${i === 1 ? -22 : -18} 18, ${i === 1 ? 22 : 18} 18, ${i === 1 ? 22 : 18} 40 Z`} fill="#9fb8c8" /></g>)}
    </svg>
  );
}

const SHOWCASE = [
  { key: 'motor', title: 'Motor', live: true, Art: MotorArt, body: 'Comprehensive or third-party cover with transparent pricing and claims handled by coordinated agents from first notice to assessment.' },
  { key: 'travel', title: 'Travel', live: true, Art: TravelArt, body: 'Medical emergencies, cancellations, delays and lost baggage covered on single trips or all year.' },
  { key: 'medical', title: 'Medical', live: true, Art: MedicalArt, body: 'Outpatient, hospital and pharmacy cover for you and your family, with clear limits and network options.' },
  { key: 'home', title: 'Home', live: true, Art: HomeArt, body: 'Protect your building, belongings and valuables against fire, burglary and water damage, with simple claims when it matters.' },
];
const QUOTABLE = ['motor', 'travel', 'medical', 'home'];

export function Products() {
  const s = useDemo();
  const { go, viewer } = useNav();
  const [segment, setSegment] = useState<Segment>('personal');
  const [product, setProduct] = useState('motor');
  const [slide, setSlide] = useState(0);
  const [consent, setConsent] = useState(true);
  const [offers, setOffers] = useState(false);
  const me = s.customers.find((c) => c.id === viewer);
  const items = PRODUCTS[segment];
  const active = items.find((p) => p.key === product) ?? items[0];
  const myClaim = s.claims.filter((c) => c.customerId === viewer).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const myPolicies = s.policies.filter((p) => p.customerId === viewer);

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setSlide((x) => (x + 1) % SLIDES.length), 8000);
    return () => clearInterval(t);
  }, [slide]);

  const pickSegment = (seg: Segment) => { setSegment(seg); setProduct(PRODUCTS[seg][0].key); };
  const insure = () => {
    if (!consent) { toast('Please confirm the data consent to continue.', 'warn'); return; }
    if (offers) toast('Marketing preference noted for this demo session. Nothing will be sent.', 'info');
    go('portal', 'quote', { product: QUOTABLE.includes(active.key) ? active.key : 'motor' });
  };

  return (
    <div className="space-y-6">
      <div>
      {/* HERO */}
      <section className="relative overflow-hidden rounded-t-2xl bg-navy text-navyink">
        <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[62%] md:block">
          <HeroArt />
          <div className="absolute inset-0 bg-gradient-to-r from-[rgb(var(--navy))] via-[rgb(var(--navy)/0.4)] to-transparent" />
        </div>

        <div className="relative px-5 pb-0 pt-6 sm:px-9 sm:pt-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="rounded-full bg-white/10 px-3 py-1.5 text-[12.5px] text-navymuted">Welcome back, <strong className="text-navyink">{me?.name.split(' ')[0] ?? 'guest'}</strong></span>
            <div className="flex gap-2">
              <button aria-label="Previous slide" onClick={() => setSlide((slide + SLIDES.length - 1) % SLIDES.length)} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-[#0b1f3a] hover:bg-white"><ChevronLeft size={19} /></button>
              <button aria-label="Next slide" onClick={() => setSlide((slide + 1) % SLIDES.length)} className="flex h-10 w-10 items-center justify-center rounded-full bg-teal text-white hover:bg-teal/90"><ChevronRight size={19} /></button>
            </div>
          </div>

          <div className="mt-8 max-w-xl border-l-4 border-teal pl-5 sm:mt-10 sm:pl-7">
            <h1 className="font-display text-[34px] font-extrabold leading-[1.05] tracking-tight sm:text-[48px]">
              {SLIDES[slide].title} <span className="block text-teal">{SLIDES[slide].accent}</span>
            </h1>
            <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-navyink/85 sm:text-[16.5px]">{SLIDES[slide].body}</p>
            <div className="mt-4 flex gap-1.5" aria-hidden="true">
              {SLIDES.map((_, i) => <span key={i} className={cx('h-1.5 rounded-full transition-all', i === slide ? 'w-7 bg-teal' : 'w-3 bg-white/30')} />)}
            </div>
          </div>

          {/* segment + product tabs */}
          <div className="mt-8 flex flex-wrap items-end gap-x-4 gap-y-3 sm:mt-10">
            <div role="radiogroup" aria-label="Customer type" className="mb-3 flex rounded-full bg-white p-1">
              {(['personal', 'sme'] as Segment[]).map((sg) => (
                <button key={sg} role="radio" aria-checked={segment === sg} onClick={() => pickSegment(sg)}
                  className={cx('rounded-full px-4 py-1.5 text-[14px] font-semibold transition-colors', segment === sg ? 'bg-teal text-white' : 'text-[#0b1f3a] hover:bg-[#e8eef5]')}>
                  {sg === 'personal' ? 'Personal' : 'SME'}
                </button>
              ))}
            </div>
            <div role="tablist" aria-label="Insurance products" className="scroll-x -mb-px flex min-w-0 flex-1 items-end gap-1">
              {items.map((p) => {
                const on = p.key === active.key;
                return (
                  <button key={p.key} role="tab" aria-selected={on} title={p.label} onClick={() => setProduct(p.key)}
                    className={cx('flex shrink-0 items-center gap-2 rounded-t-2xl px-4 py-3 text-[14.5px] font-semibold transition-colors',
                      on ? 'border-t-[3px] border-teal bg-surface text-ink' : 'text-navyink/80 hover:bg-white/10 hover:text-navyink')}>
                    <p.icon size={22} strokeWidth={1.7} className={on ? 'text-teal' : ''} />
                    <span className={on ? '' : 'hidden lg:inline'}>{p.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* INSURE NOW CARD (joined to the active tab) */}
      <section className="relative rounded-b-2xl border border-t-0 border-line bg-surface px-5 py-6 shadow-sm sm:px-8">
        <div className="flex flex-wrap items-center gap-5">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-tealsoft"><active.icon size={30} strokeWidth={1.6} className="text-tealink" /></span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-[20px] font-bold text-ink sm:text-[22px]">{active.live ? active.blurb : `${active.label} insurance`}</h2>
            <p className="mt-0.5 text-[13.5px] text-muted">{active.live ? 'Instant illustrative premium, every factor explained, saved to your account.' : `${active.blurb} Not part of this MVP yet; motor, travel, medical and home insurance are fully available.`}</p>
          </div>
          {active.live ? (
            <Button variant="primary" size="lg" onClick={insure} className="w-full sm:w-auto">Insure now <ArrowRight size={18} /></Button>
          ) : (
            <Button size="lg" onClick={() => { setSegment('personal'); setProduct('motor'); }} className="w-full sm:w-auto">Explore motor instead <ArrowRight size={18} /></Button>
          )}
        </div>
        {active.live && (
          <div className="mt-5 space-y-3 border-t border-line pt-4 text-[13px] text-muted">
            <label className="flex items-start gap-3">
              <input id="home-consent" type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(var(--teal))]" />
              <span>By continuing, I agree that ITMC InsureAI may use the details I enter to prepare a quote. This is a demo with fictional data: nothing is sent to any external registry and nothing leaves this browser.</span>
            </label>
            <label className="flex items-start gap-3">
              <input id="home-offers" type="checkbox" checked={offers} onChange={(e) => setOffers(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(var(--teal))]" />
              <span>Send me offers and service updates by SMS, email or WhatsApp. (Demo only; no messages are sent.)</span>
            </label>
          </div>
        )}
      </section>

      </div>

      {/* PRODUCT SHOWCASE */}
      <section aria-labelledby="showcase-title" className="pt-2">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="eyebrow">Our insurance</div>
            <h2 id="showcase-title" className="font-display text-[24px] font-extrabold text-ink">Cover for the things that move you</h2>
          </div>
          <button onClick={() => { setSegment('personal'); setProduct('motor'); window.scrollTo({ top: 0, behavior: 'smooth' }); document.getElementById('main')?.scrollTo({ top: 0, behavior: 'smooth' }); }} className="text-[13.5px] font-semibold text-tealink hover:underline">Choose a product above →</button>
        </div>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {SHOWCASE.map((c) => (
            <button key={c.key} aria-label={`Get a ${c.title.toLowerCase()} quote`} onClick={() => go('portal', 'quote', { product: c.key })}
              className="group relative isolate h-[380px] overflow-hidden rounded-3xl bg-navy text-left text-white shadow-sm transition-transform duration-300 hover:-translate-y-1 hover:shadow-xl focus-visible:-translate-y-1">
              <div className="absolute inset-0 -z-10 transition-transform duration-500 group-hover:scale-105"><c.Art /></div>
              <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#06142a] via-[#06142a]/55 to-transparent" />
              <span className="absolute right-5 top-5 flex h-11 w-11 items-center justify-center rounded-xl border border-white/40 bg-white/10 backdrop-blur-sm transition-colors group-hover:border-teal group-hover:bg-teal"><ArrowUpRight size={20} /></span>
              {!c.live && <span className="absolute left-5 top-5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold backdrop-blur-sm">Coming next</span>}
              <div className="absolute inset-x-0 bottom-0 p-6 sm:p-7">
                <h3 className="font-display text-[26px] font-extrabold leading-tight">{c.title}</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-white/85">{c.body}</p>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* QUICK ACTIONS */}
      <section aria-label="Quick actions" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: FileSearch, title: 'Track a claim', sub: myClaim ? `${myClaim.id} · ${CLAIM_STATUS[myClaim.status].customer}` : 'No claims yet', go: () => go('portal', 'claims') },
          { icon: FileText, title: 'Register a claim', sub: myPolicies.length ? 'Report an incident in minutes' : 'Needs an active policy', go: () => go('portal', 'claim-new') },
          { icon: ShieldCheck, title: 'My policies', sub: `${myPolicies.length} demo polic${myPolicies.length === 1 ? 'y' : 'ies'} for ${me?.name.split(' ')[0] ?? 'you'}`, go: () => go('portal', 'policies') },
          { icon: RefreshCcw, title: 'Renew', sub: 'See your renewal estimate', go: () => go('portal', 'renewal') },
        ].map((q) => (
          <button key={q.title} onClick={q.go} className="group flex items-center gap-3 rounded-xl border border-line bg-surface p-4 text-left hover:border-teal/60">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sunken text-tealink group-hover:bg-teal group-hover:text-white"><q.icon size={19} /></span>
            <span className="min-w-0 flex-1"><span className="block font-display text-[14px] font-bold text-ink">{q.title}</span><span className="block truncate text-[12.5px] text-muted">{q.sub}</span></span>
            <ArrowRight size={16} className="text-muted group-hover:text-teal" />
          </button>
        ))}
      </section>

      {/* AGENTS STRIP */}
      <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-teal/30 bg-tealsoft/40 px-5 py-4">
        <Bot size={22} className="text-teal" />
        <p className="min-w-0 flex-1 text-[13.5px] text-ink">
          <strong>Every step is handled by a named AI agent and checked by a person.</strong> <span className="text-muted">Quote Agent, Policy Agent, five claims agents and the Renewal Agent work on your record; questions go to the Chatbot Agent.</span>
        </p>
        <button onClick={() => go('portal', 'quote')} className="text-[13px] font-semibold text-tealink hover:underline">Start with a quote →</button>
      </section>
    </div>
  );
}
