/** The one shared axis under a chart: faint vertical rules, a baseline and tick labels in the data face. */
export function TimeAxis({
  x0,
  x1,
  top,
  bottom,
  max,
  ticks,
  unit = "ms",
}: {
  x0: number;
  x1: number;
  top: number;
  bottom: number;
  max: number;
  ticks: number[];
  unit?: string;
}) {
  const at = (v: number) => x0 + (v / max) * (x1 - x0);
  const shown = ticks.filter((v) => v <= max * 1.001);
  return (
    <g aria-hidden>
      {shown.map((v) => (
        <line key={v} x1={at(v)} x2={at(v)} y1={top} y2={bottom} stroke="var(--graticule)" strokeDasharray={v === 0 ? undefined : "1 3"} />
      ))}
      <line x1={x0} x2={x1} y1={bottom} y2={bottom} stroke="var(--foreground)" strokeOpacity={0.4} />
      {shown.map((v, i) => (
        <g key={`t${v}`}>
          <line x1={at(v)} x2={at(v)} y1={bottom} y2={bottom + 4} stroke="var(--foreground)" strokeOpacity={0.4} />
          <text
            x={at(v)}
            y={bottom + 16}
            textAnchor={i === shown.length - 1 && shown.length > 1 ? "end" : "middle"}
            fontFamily="var(--font-data), monospace"
            fontSize="10"
            fill="var(--muted-foreground)"
          >
            {v}
            {i === shown.length - 1 && shown.length > 1 ? ` ${unit}` : ""}
          </text>
        </g>
      ))}
    </g>
  );
}
