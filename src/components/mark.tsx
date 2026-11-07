/**
 * The ipping mark: a station and the rings of its ping, drawn like the map's own rings. Rings are concentric
 * around the dot; they and the dot take `currentColor` and the signal colour.
 */
export function Mark({ className, animated = false }: { className?: string; animated?: boolean }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round">
      <path d="M5 6A21 21 0 0 1 26 27" opacity={0.3} />
      <path d="M5 13A14 14 0 0 1 19 27" opacity={0.6} />
      <path d="M5 20A7 7 0 0 1 12 27" />
      <circle cx={5} cy={27} r={3.4} fill="var(--signal)" stroke="none" className={animated ? "live-dot" : undefined} />
    </svg>
  );
}
