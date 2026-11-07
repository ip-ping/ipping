"use client";

import { useMemo } from "react";

import { ms } from "@/lib/format";
import { useTween } from "@/lib/use-tween";
import { cn } from "@/lib/utils";

import { Key, Legend, Swatch } from "./chart-legend";
import { ChartTip, TipRow, TipTitle } from "./chart-tip";
import { niceScale, truncate, useWidth } from "./chart-utils";
import { TimeAxis } from "./time-axis";

/** The phases of one request, in the order they happen. Each keeps its colour whichever are present. */
export const PHASES = [
  { key: "dns", label: "DNS", color: "var(--viz-1)" },
  { key: "connect", label: "Connect", color: "var(--viz-2)" },
  { key: "tls", label: "TLS", color: "var(--viz-3)" },
  { key: "wait", label: "First byte", color: "var(--viz-4)" },
  { key: "other", label: "Other", color: "color-mix(in oklab, var(--foreground) 30%, transparent)" },
] as const;

export type PhaseKey = (typeof PHASES)[number]["key"];

export type WaterfallRow = {
  id: string;
  name: string;
  place?: string;
  state: "pending" | "running" | "done" | "failed";
  /** Milliseconds per phase, in PHASES order; absent phases are 0. */
  phases: Record<PhaseKey, number>;
  total: number | null;
  status?: number | null;
  note?: string;
};

const ROW = 34;
const TOP = 6;
const AXIS = 26;
const BAR = 16;

/** A bar with its right end rounded, so the data end is soft and the baseline end is square. */
function bar(x: number, y: number, w: number, h: number, round: boolean) {
  const r = round ? Math.min(4, w / 2, h / 2) : 0;
  return `M${x} ${y}H${x + w - r}${r ? `a${r} ${r} 0 0 1 ${r} ${r}V${y + h - r}a${r} ${r} 0 0 1 ${-r} ${r}` : `V${y + h}`}H${x}Z`;
}

/**
 * Where the time of an HTTP request went, per node: DNS, then connect, then TLS, then the wait for the first
 * byte, laid end to end on one shared axis. A tall DNS or TLS segment points at the culprit at a glance.
 */
export function PhaseWaterfall({
  rows,
  activeId,
  onActive,
  label,
  className,
}: {
  rows: WaterfallRow[];
  activeId: string | null;
  onActive: (id: string | null) => void;
  label: string;
  className?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const sorted = useMemo(
    () =>
      rows
        .map((row, order) => ({ row, order }))
        .sort((a, b) => (a.row.total ?? Infinity) - (b.row.total ?? Infinity) || a.order - b.order),
    [rows],
  );
  const slowest = Math.max(0, ...rows.map((r) => r.total ?? 0));
  const scale = useMemo(() => niceScale(slowest || 1, width < 520 ? 4 : 6), [slowest, width]);
  const max = useTween(scale.max, 500);

  if (rows.length === 0) return null;

  const present = PHASES.filter((p) => p.key === "dns" || rows.some((r) => r.phases[p.key] > 0));
  const labelW = width < 480 ? 88 : width < 760 ? 132 : 176;
  const valueW = width < 480 ? 54 : 70;
  const x0 = labelW + 6;
  const x1 = Math.max(x0 + 40, width - valueW - 10);
  const per = (x1 - x0) / max;
  const height = TOP + sorted.length * ROW + AXIS;
  const axisY = TOP + sorted.length * ROW;
  const nameChars = Math.floor((labelW - 8) / 6.6);
  const activeIndex = sorted.findIndex((s) => s.row.id === activeId);
  const tip = activeIndex >= 0 ? sorted[activeIndex].row : null;

  return (
    <div className={cn("w-full", className)}>
      <Legend>
        {present.map((p) => (
          <Key key={p.key} glyph={<Swatch color={p.color} />}>
            {p.label}
          </Key>
        ))}
      </Legend>
      <div ref={ref} className="relative w-full" role="group" aria-label={label}>
        {width > 0 && (
          <svg width={width} height={height} className="block overflow-visible">
            <TimeAxis x0={x0} x1={x1} top={TOP} bottom={axisY} max={max} ticks={scale.ticks} />
            {sorted.map(({ row }, i) => {
              const y = TOP + i * ROW;
              const cy = ROW / 2;
              const isActive = row.id === activeId;
              const segments = PHASES.map((p) => ({ ...p, value: row.phases[p.key] })).filter((p) => p.value > 0);
              let cursor = x0;
              // While the axis is still gliding to a larger scale, a bar must not run past the plot.
              const drawn = segments.map((p, k) => {
                const start = Math.min(cursor, x1);
                const end = Math.min(cursor + Math.max(2, p.value * per), x1);
                cursor += Math.max(2, p.value * per);
                return { ...p, x: start, w: end - start, last: k === segments.length - 1 };
              });
              return (
                <g
                  key={row.id}
                  tabIndex={0}
                  role="img"
                  aria-label={
                    row.total == null
                      ? `${row.name}: ${row.state === "failed" ? (row.note ?? "no answer") : "waiting"}`
                      : `${row.name}: ${ms(row.total)} ms in total${row.status ? `, status ${row.status}` : ""}`
                  }
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
                  {drawn.length === 0 ? (
                    <>
                      <line x1={x0} x2={x1} y1={cy} y2={cy} stroke="var(--foreground)" strokeOpacity="0.25" strokeDasharray="2 4" />
                      <text x={x0 + 8} y={cy + 4} fontSize="11" fontFamily="var(--font-data), monospace" fill="var(--muted-foreground)">
                        {row.state === "failed" ? (row.note ?? "no answer") : "waiting for the node…"}
                      </text>
                      {row.state === "failed" && (
                        <path d="M-3.5 -3.5L3.5 3.5M3.5 -3.5L-3.5 3.5" transform={`translate(${x1 + 9} ${cy})`} stroke="var(--critical)" strokeWidth="2" strokeLinecap="round" />
                      )}
                    </>
                  ) : (
                    drawn.map((seg) => (
                      // a 2px gap of the panel colour keeps neighbours apart without an outline
                      <path key={seg.key} d={bar(seg.x, cy - BAR / 2, Math.max(1, seg.w - 2), BAR, seg.last)} fill={seg.color} className="transition-[d] duration-500" />
                    ))
                  )}
                  <text x={width - 4} y={cy + 4} textAnchor="end" className="num" fontSize="12" fontWeight="600" fill="var(--foreground)">
                    {row.total == null ? "–" : ms(row.total)}
                    {row.total != null && (
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
          <ChartTip x={Math.min(Math.max(x0 + 60 + (tip.total ?? 0) * per * 0.5, 0), width)} y={TOP + activeIndex * ROW + 2} width={width}>
            <TipTitle name={tip.name} place={tip.place} />
            {tip.total != null ? (
              <>
                {PHASES.filter((p) => tip.phases[p.key] > 0 || p.key === "dns").map((p) => (
                  <TipRow key={p.key} k={p.label} v={`${ms(tip.phases[p.key])} ms`} swatch={p.color} />
                ))}
                <div className="my-1 border-t border-foreground/20" />
                <TipRow k="Total" v={`${ms(tip.total)} ms`} />
                {tip.status != null && <TipRow k="Status" v={tip.status} />}
              </>
            ) : (
              <div className="label normal-case tracking-normal">{tip.note ?? (tip.state === "failed" ? "No answer from this node" : "Waiting for this node")}</div>
            )}
          </ChartTip>
        )}
      </div>
    </div>
  );
}
