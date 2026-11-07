/** The ipping mark: a station and the rings of its ping. Draws in `currentColor`; the dot is the signal. */
export function Mark({ className, animated = false }: { className?: string; animated?: boolean }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
      <path d="M5 27a22 22 0 0 1 22-22" opacity={0.35} />
      <path d="M5 27a14 14 0 0 1 14-14" opacity={0.65} />
      <path d="M5 27a6 6 0 0 1 6-6" />
      <circle cx={5} cy={27} r={3} fill="var(--signal)" stroke="none" className={animated ? "live-dot" : undefined} />
    </svg>
  );
}
