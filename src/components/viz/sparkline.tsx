import { ms } from "@/lib/format";

/**
 * A small line of one node's replies in order, for a table row. A gap in the data is a lost probe and is
 * marked with a cross at the baseline. The numbers are in the title, and in the row's details.
 */
export function Sparkline({
  values,
  width = 88,
  height = 22,
  active = false,
}: {
  /** In probe order; null is a probe that got no answer. */
  values: (number | null)[];
  width?: number;
  height?: number;
  active?: boolean;
}) {
  const real = values.filter((v): v is number => v != null);
  if (values.length === 0 || real.length === 0) return <span className="text-muted-foreground">–</span>;
  // Fit the line to the data, but never blow tiny jitter up to full height: the range is at least a tenth of the value.
  const lo = Math.min(...real);
  const span = Math.max(Math.max(...real) - lo, Math.max(...real) * 0.1) || 1;
  const pad = 4;
  const step = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;
  const x = (i: number) => (values.length > 1 ? pad + i * step : width / 2);
  const y = (v: number) => height - pad - ((v - lo) / span) * (height - pad * 2);
  // lines only join replies that neighbour each other; a lost probe breaks the line
  const runs: string[] = [];
  let current = "";
  values.forEach((v, i) => {
    if (v == null) {
      if (current) runs.push(current);
      current = "";
    } else current += `${current ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
  });
  if (current) runs.push(current);
  const colour = active ? "var(--signal)" : "var(--viz-1)";
  const lastIndex = values.reduce<number>((acc, v, i) => (v != null ? i : acc), -1);
  const title = values.map((v) => (v == null ? "lost" : `${ms(v)} ms`)).join(", ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Replies in order: ${title}`} className="inline-block align-middle">
      <title>{title}</title>
      <line x1="0" x2={width} y1={height - 1} y2={height - 1} stroke="var(--graticule)" />
      {runs.map((d) => (
        <path key={d} d={d} fill="none" stroke={colour} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
      ))}
      {values.map((v, i) =>
        v == null ? (
          <path key={i} d="M-2.5 -2.5L2.5 2.5M2.5 -2.5L-2.5 2.5" transform={`translate(${x(i)} ${height - 5})`} stroke="var(--critical)" strokeWidth="1.5" strokeLinecap="round" />
        ) : null,
      )}
      {lastIndex >= 0 && <circle cx={x(lastIndex)} cy={y(values[lastIndex]!)} r="2.5" fill={colour} stroke="var(--card)" strokeWidth="1.5" />}
    </svg>
  );
}
