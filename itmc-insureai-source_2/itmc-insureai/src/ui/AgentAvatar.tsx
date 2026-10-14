// Original illustrated insurance-agent avatar ("Maya") with headset.
// `speaking` animates the mouth and a sound ring; eyes blink on a slow loop.
export function AgentAvatar({ size = 48, speaking = false, ring = false }: { size?: number; speaking?: boolean; ring?: boolean }) {
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {ring && <span className={`absolute inset-0 rounded-full ${speaking ? 'avatar-ring' : ''}`} />}
      <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" className="relative rounded-full">
        <defs>
          <linearGradient id="avBg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#1fb3a5" /><stop offset="1" stopColor="#0b5e74" /></linearGradient>
          <clipPath id="avClip"><circle cx="32" cy="32" r="32" /></clipPath>
        </defs>
        <g clipPath="url(#avClip)">
          <rect width="64" height="64" fill="url(#avBg)" />
          {/* hair back */}
          <path d="M17 30 C 15 14, 49 12, 47 30 L 47 44 C 44 46, 20 46, 17 44 Z" fill="#2a1a14" />
          {/* body: blazer + blouse */}
          <path d="M8 66 C 10 52, 20 47, 32 47 C 44 47, 54 52, 56 66 Z" fill="#0f2a4d" />
          <path d="M26 48 L 32 58 L 38 48 C 36 47.4, 28 47.4, 26 48 Z" fill="#eef4f8" />
          <path d="M29 50 L 32 55 L 35 50 L 33.5 60 L 30.5 60 Z" fill="#2dc4b6" />
          {/* neck */}
          <path d="M27.5 40 L 36.5 40 L 36 48 C 34 49.5, 30 49.5, 28 48 Z" fill="#c98f6a" />
          {/* face */}
          <ellipse cx="32" cy="31" rx="11" ry="12.5" fill="#d9a07a" />
          {/* hair front */}
          <path d="M20.5 29 C 21 18, 30 16.5, 35 18 C 40 19, 44 23, 43.6 29 C 40 24, 33 22, 26 25 C 24 26, 22 27.5, 20.5 29 Z" fill="#2a1a14" />
          {/* eyes (blink) */}
          <g className="avatar-eyes">
            <ellipse cx="27.6" cy="31" rx="1.5" ry="1.7" fill="#1b1b1b" />
            <ellipse cx="36.4" cy="31" rx="1.5" ry="1.7" fill="#1b1b1b" />
          </g>
          <path d="M25.6 27.6 Q 27.6 26.6 29.6 27.4 M 34.4 27.4 Q 36.4 26.6 38.4 27.6" stroke="#2a1a14" strokeWidth="0.9" fill="none" strokeLinecap="round" />
          <ellipse cx="25" cy="35" rx="2" ry="1.1" fill="#e88f7b" opacity=".45" />
          <ellipse cx="39" cy="35" rx="2" ry="1.1" fill="#e88f7b" opacity=".45" />
          {/* mouth */}
          {speaking
            ? <ellipse className="avatar-mouth" cx="32" cy="37.6" rx="2.6" ry="1.6" fill="#7a2d2d" />
            : <path d="M28.8 36.8 Q 32 39.6 35.2 36.8" stroke="#7a2d2d" strokeWidth="1.2" fill="none" strokeLinecap="round" />}
          {/* headset */}
          <path d="M19.5 31 C 19 17, 45 17, 44.5 31" stroke="#0b1f3a" strokeWidth="2.2" fill="none" />
          <rect x="17" y="28.5" width="4.4" height="7.5" rx="2" fill="#0b1f3a" />
          <rect x="42.6" y="28.5" width="4.4" height="7.5" rx="2" fill="#0b1f3a" />
          <path d="M20 35.5 C 21 40, 25 41.5, 28.5 40.8" stroke="#0b1f3a" strokeWidth="1.4" fill="none" strokeLinecap="round" />
          <circle cx="29" cy="40.6" r="1.4" fill="#2dc4b6" />
        </g>
      </svg>
      {speaking && (
        <span className="absolute -right-1 -top-1 flex h-4 items-end gap-[2px] rounded-full bg-white px-1 pb-[3px] shadow">
          {[0, 1, 2].map((i) => <span key={i} className="avatar-bar w-[2px] rounded bg-teal" style={{ animationDelay: `${i * 120}ms` }} />)}
        </span>
      )}
    </span>
  );
}
