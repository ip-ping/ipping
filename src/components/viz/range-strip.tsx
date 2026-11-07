"use client";

import { useMemo } from "react";

import { delta, ms } from "@/lib/format";
import { useTween } from "@/lib/use-tween";
import { cn } from "@/lib/utils";

import { Key, Legend } from "./chart-legend";
import { ChartTip, TipRow, TipTitle } from "./chart-tip";
import { niceScale, truncate, useWidth } from "./chart-utils";
import { TimeAxis } from "./time-axis";

export type StripPoint = { seq: number; ms: number; ok: boolean };

export type StripRow = {
  id: string;
  name: string;
  place?: string;
  state: "pending" | "running" | "done" | "failed";
  points: StripPoint[];
  /** Probes that got no answer at all. */
  lost: number;
  sent: number;
  expected: number;
  note?: string;
  /** What the node's dot wears, when the chart is coloured by something else (a DNS answer). */
  color?: string;
  /** The node's median in the previous run of the same measurement, to compare with. */
  previous?: number | null;
};

const ROW = 30;
const TOP = 6;
const AXIS = 26;

const median = (values: number[]) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/**
 * One row per node on one shared time axis. Every dot is one reply, the bar spans the fastest to the slowest,
 * the tick is the median and a cross is a probe that never came back. Rows slide into place, fastest first,
 * and new dots pop in while the measurement runs.
 */
export function RangeStrip({
  rows,
  activeId,
  onActive,
  label,
  className,
  single = false,
}: {
  /** One reply per node (a DNS answer): no range, no median, just where each reply landed. */
  single?: boolean;
  rows: StripRow[];
  activeId: string | null;
  onActive: (id: string | null) => void;
  label: string;
  className?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();

  const measured = useMemo(
    () =>
      rows
        .map((row, order) => {
          const ok = row.points.filter((p) => p.ok).map((p) => p.ms);
          return { row, order, ok, min: ok.length ? Math.min(...ok) : null, med: median(ok), max: ok.length ? Math.max(...ok) : null };
        })
        .sort((a, b) => (a.med ?? Infinity) - (b.med ?? Infinity) || a.order - b.order),
    [rows],
  );

  const slowest = Math.max(0, ...rows.flatMap((r) => r.points.map((p) => p.ms)));
  const scale = useMemo(() => niceScale(slowest || 1, width < 520 ? 4 : 6), [slowest, width]);
  const max = useTween(scale.max, 500);

  if (rows.length === 0) return null;

  const labelW = width < 480 ? 88 : width < 760 ? 132 : 176;
  const valueW = width < 480 ? 62 : 76;
  const x0 = labelW + 6;
  const x1 = Math.max(x0 + 40, width - valueW - 10);
  const x = (v: number) => x0 + (Math.min(v, max) / max) * (x1 - x0);
  const height = TOP + measured.length * ROW + AXIS;
  const axisY = TOP + measured.length * ROW;
  const nameChars = Math.floor((labelW - 8) / 6.6);

  const activeIndex = measured.findIndex((m) => m.row.id === activeId);
  const tip = activeIndex >= 0 ? measured[activeIndex] : null;

  return (
    <div className={cn("w-full", className)}>
      <Legend>
        <Key glyph={<circle cx="11" cy="6" r="4" fill="var(--viz-1)" stroke="var(--card)" strokeWidth="2" />}>{single ? "an answer, coloured like the map" : "one reply"}</Key>
        {!single && (
          <>
            <Key glyph={<rect x="1" y="3" width="20" height="6" rx="3" fill="var(--viz-1)" opacity="0.3" />}>fastest to slowest</Key>
            <Key glyph={<rect x="10" y="-1" width="2" height="14" fill="var(--foreground)" />}>median</Key>
          </>
        )}
        <Key glyph={<path d="M7 2L15 10M15 2L7 10" stroke="var(--critical)" strokeWidth="2" strokeLinecap="round" />}>lost</Key>
        {rows.some((r) => r.previous != null) && (
          <Key glyph={<circle cx="11" cy="6" r="3.5" fill="none" stroke="var(--foreground)" strokeWidth="1.6" strokeDasharray="2 2" />}>previous run</Key>
        )}
      </Legend>
      <div ref={ref} className="relative w-full" role="group" aria-label={label}>
        {width > 0 && (
          <svg width={width} height={height} className="block overflow-visible">
            <TimeAxis x0={x0} x1={x1} top={TOP} bottom={axisY} max={max} ticks={scale.ticks} />
            {measured.map(({ row, min, med, max: hi }, i) => {
              const y = TOP + i * ROW;
              const cy = ROW / 2;
              const isActive = row.id === activeId;
              const accent = isActive ? "var(--signal)" : (row.color && row.color !== "none" ? row.color : "var(--viz-1)");
              const summary =
                med == null
                  ? `${row.name}: ${row.state === "failed" ? "no answer" : "waiting"}`
                  : `${row.name}: median ${ms(med)} ms, fastest ${ms(min)}, slowest ${ms(hi)}${row.lost ? `, ${row.lost} lost` : ""}`;
              return (
                <g
                  key={row.id}
                  tabIndex={0}
                  role="img"
                  aria-label={summary}
                  className="cursor-default outline-none transition-transform duration-500 ease-out motion-reduce:transition-none [&:focus-visible_.focus-ring]:opacity-100"
                  style={{ transform: `translate(0px, ${y}px)` }}
                  onPointerEnter={() => onActive(row.id)}
                  onPointerLeave={() => onActive(null)}
                  onFocus={() => onActive(row.id)}
                  onBlur={() => onActive(null)}
                >
                  <rect x="0" y="0" width={width} height={ROW} fill={isActive ? "var(--signal-soft)" : "transparent"} />
                  <rect className="focus-ring" x="1" y="1" width={width - 2} height={ROW - 2} fill="none" stroke="var(--ring)" strokeWidth="2" opacity="0" />
                  <text x="6" y={cy + 4} fontSize="12" fontWeight={isActive ? 600 : 500} fill="var(--foreground)">
                    {truncate(row.name, nameChars)}
                  </text>

                  {row.points.length === 0 ? (
                    <>
                      <line x1={x0} x2={x1} y1={cy} y2={cy} stroke="var(--foreground)" strokeOpacity="0.25" strokeDasharray="2 4" />
                      <text x={x0 + 8} y={cy + 4} fontSize="11" fontFamily="var(--font-data), monospace" fill="var(--muted-foreground)">
                        {row.state === "failed" || row.state === "done" || row.lost > 0 ? "no answer" : "waiting for the node…"}
                      </text>
                      {row.state === "running" && <circle cx={x0 - 0} cy={cy} r="3" fill="var(--signal)" className="live-dot" />}
                    </>
                  ) : (
                    <>
                      <line x1={x0} x2={x1} y1={cy} y2={cy} stroke="var(--graticule)" />
                      {!single && min != null && hi != null && (
                        <rect x={x(min) - 3} y={cy - 3} width={Math.max(6, x(hi) - x(min) + 6)} height="6" rx="3" fill={accent} opacity="0.3" />
                      )}
                      {row.points.map((p) =>
                        p.ok ? (
                          <circle key={p.seq} cx={x(p.ms)} cy={cy} r={single ? 5 : 4} fill={accent} stroke="var(--card)" strokeWidth="2" className="dot-in" />
                        ) : (
                          // an answer that was a refusal: it has a time, but it is not a success
                          <circle key={p.seq} cx={x(p.ms)} cy={cy} r="3.5" fill="var(--card)" stroke={accent} strokeWidth="2" className="dot-in" />
                        ),
                      )}
                      {row.previous != null && (
                        <>
                          {med != null && <line x1={x(row.previous)} x2={x(med)} y1={cy} y2={cy} stroke="var(--foreground)" strokeOpacity="0.45" strokeDasharray="2 2" />}
                          <circle cx={x(row.previous)} cy={cy} r="4" fill="none" stroke="var(--foreground)" strokeOpacity="0.8" strokeWidth="1.6" strokeDasharray="2 2" />
                        </>
                      )}
                      {!single && med != null && <rect x={x(med) - 1} y={cy - 8} width="2" height="16" fill="var(--foreground)" />}
                      {Array.from({ length: Math.min(row.lost, 3) }, (_, k) => (
                        <path
                          key={k}
                          d="M-3.5 -3.5L3.5 3.5M3.5 -3.5L-3.5 3.5"
                          transform={`translate(${x1 + 9 + k * 10} ${cy})`}
                          stroke="var(--critical)"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                      ))}
                    </>
                  )}

                  <text x={width - 4} y={cy + 4} textAnchor="end" className="num" fontSize="12" fontWeight="600" fill="var(--foreground)">
                    {med == null ? "–" : ms(med)}
                    {med != null && (
                      <tspan fontSize="10" fontWeight="400" fill="var(--muted-foreground)">
                        {" "}
                        ms
                      </tspan>
                    )}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
        {tip && (
          <ChartTip
            x={Math.min(Math.max(tip.med != null ? x(tip.med) : x0 + 40, 0), width)}
            y={TOP + activeIndex * ROW}
            width={width}
          >
            <TipTitle name={tip.row.name} place={tip.row.place} />
            {tip.med != null ? (
              <>
                <TipRow k="Median" v={`${ms(tip.med)} ms`} />
                <TipRow k="Fastest" v={`${ms(tip.min)} ms`} />
                <TipRow k="Slowest" v={`${ms(tip.max)} ms`} />
                <TipRow k="Replies" v={`${tip.ok.length} of ${tip.row.expected}`} />
              </>
            ) : (
              <div className="label normal-case tracking-normal">{tip.row.note ?? (tip.row.state === "failed" ? "No answer from this node" : "Waiting for this node")}</div>
            )}
            {tip.row.lost > 0 && <TipRow k="Lost" v={tip.row.lost} />}
            {tip.row.previous != null && (
              <TipRow k="Last time" v={`${ms(tip.row.previous)} ms${tip.med != null ? ` (${delta(tip.med, tip.row.previous)})` : ""}`} />
            )}
          </ChartTip>
        )}
      </div>
    </div>
  );
}
