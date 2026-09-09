/** The Y 5 mark: a rounded tile with a Y whose right arm carries a spark. */
export function Mark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id="y5g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--color-accent)" />
          <stop offset="1" stopColor="var(--color-accent-ink)" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#y5g)" />
      <path d="M9.5 9.5 16 18v5.5" fill="none" stroke="var(--color-bg)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22.5 9.5 16 18" fill="none" stroke="var(--color-bg)" strokeWidth="3.2" strokeLinecap="round" strokeOpacity="0.55" />
      <circle cx="23.5" cy="8.5" r="2.2" fill="var(--color-bg)" fillOpacity="0.8" />
    </svg>
  );
}
