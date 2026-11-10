"use client";

import { useState } from "react";

import { ms } from "@/lib/format";
import { cn } from "@/lib/utils";

import { ChartTip, TipRow } from "./chart-tip";
import { useWidth } from "./chart-utils";

export type RunStatus = "ok" | "degraded" | "down" | "error";

export type Run = {
  at: string;
  status: RunStatus;
  nodes_ok: number;
  nodes_total: number;
  median_ms?: number | null;
  note?: string | null;
};

const HEIGHT = 26;
/** Status says it three ways: the colour, how tall the bar is, and the legend and tooltip words. */
const LOOK: Record<RunStatus, { height: number; fill: string; label: string }> = {
  ok: { height: HEIGHT, fill: "var(--good)", label: "ok" },
  degraded: { height: 16, fill: "var(--warning)", label: "degraded" },
  down: { height: 6, fill: "var(--critical)", label: "down" },
  error: { height: 12, fill: "none", label: "could not run" },
};

export function Legend() {
  const item = (status: RunStatus) => (
    <span key={status} className="inline-flex items-center gap-1.5">
      <svg width="8" height="14" aria-hidden>
        <rect
          x="0.75"
          y={14 - (LOOK[status].height / HEIGHT) * 14 + 0.75}
          width="6.5"
          height={(LOOK[status].height / HEIGHT) * 14 - 1.5}
          fill={LOOK[status].fill}
          stroke={status === "error" ? "var(--muted-foreground)" : "none"}
          strokeDasharray={status === "error" ? "2 1.5" : undefined}
        />
      </svg>
      {LOOK[status].label}
    </span>
  );
  return <span className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">{(["ok", "degraded", "down", "error"] as RunStatus[]).map(item)}</span>;
}

/**
 * The last runs of a watch, oldest at the left: a bar for each, tall when it was good. The newest bar is
 * at the right so the strip reads like a heartbeat. Hovering a bar says when, how many nodes and how fast.
 */
export function UptimeStrip({
  runs,
  slots = 48,
  className,
}: {
  runs: Run[];
  slots?: number;
  className?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const shown = runs.slice(-slots);
  const gap = 2;
  const barW = Math.max(3, Math.floor((width - gap * (slots - 1)) / slots));
  const offset = slots - shown.length; // empty slots on the left until there are enough runs
  const counts = shown.reduce<Record<RunStatus, number>>((c, r) => ({ ...c, [r.status]: c[r.status] + 1 }), { ok: 0, degraded: 0, down: 0, error: 0 });
  const label = shown.length
    ? `The last ${shown.length} runs: ${counts.ok} ok, ${counts.degraded} degraded, ${counts.down} down, ${counts.error} could not run`
    : "No runs yet";
  const tip = hover != null ? shown[hover] : null;

  return (
    <div ref={ref} className={cn("relative w-full", className)}>
      {width > 0 && (
        <svg width={width} height={HEIGHT + 2} role="img" aria-label={label} className="block overflow-visible" onPointerLeave={() => setHover(null)}>
          {Array.from({ length: slots }, (_, slot) => {
            const x = slot * (barW + gap);
            const run = shown[slot - offset];
            if (!run) return <rect key={slot} x={x} y={HEIGHT - 1} width={barW} height="2" fill="var(--graticule)" />;
            const look = LOOK[run.status];
            const index = slot - offset;
            return (
              <g key={slot} onPointerEnter={() => setHover(index)}>
                {/* a hit target taller than the bar */}
                <rect x={x - 1} y="0" width={barW + 2} height={HEIGHT + 2} fill="transparent" />
                <rect
                  x={x}
                  y={HEIGHT - look.height}
                  width={barW}
                  height={look.height}
                  rx={Math.min(2, barW / 2)}
                  fill={look.fill}
                  stroke={run.status === "error" ? "var(--muted-foreground)" : "var(--card)"}
                  strokeWidth={run.status === "error" ? 1 : 0}
                  strokeDasharray={run.status === "error" ? "2 2" : undefined}
                  opacity={hover === null || hover === index ? 1 : 0.55}
                />
              </g>
            );
          })}
        </svg>
      )}
      {tip && hover != null && (
        <ChartTip x={Math.min(width, Math.max(0, (hover + offset) * (barW + gap) + barW / 2))} y={0} width={width}>
          <div className="mb-1 font-medium">{new Date(tip.at).toLocaleString()}</div>
          <TipRow k="Result" v={LOOK[tip.status].label} />
          {tip.status !== "error" && <TipRow k="Nodes" v={`${tip.nodes_ok} of ${tip.nodes_total}`} />}
          {tip.median_ms != null && <TipRow k="Median" v={`${ms(tip.median_ms)} ms`} />}
          {tip.note && <div className="text-xs text-muted-foreground mt-1">{tip.note}</div>}
        </ChartTip>
      )}
    </div>
  );
}
