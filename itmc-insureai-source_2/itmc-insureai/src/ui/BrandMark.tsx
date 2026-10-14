export function BrandMark({ size = 30 }: { size?: number }) {
  // Original mark: a shield formed by two strokes with three linked agent nodes.
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 2.5 27 6.5v8.6c0 7-4.6 12.3-11 14.4C9.6 27.4 5 22.1 5 15.1V6.5L16 2.5Z" fill="none" stroke="rgb(var(--teal))" strokeWidth="2.2" strokeLinejoin="round" />
      <circle cx="11.5" cy="13" r="2.2" fill="rgb(var(--navy-ink))" />
      <circle cx="20.5" cy="13" r="2.2" fill="rgb(var(--navy-ink))" />
      <circle cx="16" cy="20.5" r="2.2" fill="rgb(var(--teal))" />
      <path d="M11.5 13h9M11.5 13l4.5 7.5M20.5 13 16 20.5" stroke="rgb(var(--navy-ink))" strokeOpacity=".55" strokeWidth="1.2" />
    </svg>
  );
}
