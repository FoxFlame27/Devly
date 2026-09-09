/** The Devly mark: a gradient D with a chevron, matching the logo. */
export function Mark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id="devlyg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8b5cf6" />
          <stop offset="0.55" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
      <path d="M6 4h11.5C24.4 4 30 9.4 30 16s-5.6 12-12.5 12H6v-5h11.5c3.9 0 7-3.1 7-7s-3.1-7-7-7H6z" fill="url(#devlyg)" />
      <path d="M9 11.5 15.5 16 9 20.5" fill="none" stroke="url(#devlyg)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
