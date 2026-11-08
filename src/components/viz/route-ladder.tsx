"use client";

import { useMemo } from "react";

import { hopStats, PROBES_PER_ROUND } from "@/features/measurements/hops";
import { ms } from "@/lib/format";
import { useTween } from "@/lib/use-tween";
import { cn } from "@/lib/utils";

import { Key, Legend } from "./chart-legend";
import { ChartTip, TipRow } from "./chart-tip";
import { niceScale, truncate, useWidth } from "./chart-utils";
import { TimeAxis } from "./time-axis";

export type Hop = {
  ttl: number;
  ip: string | null;
  private: boolean;
  reached: boolean;
  /** Round trips of this hop's probes, in milliseconds. */
  rtts: number[];
  /** How many probes this hop was sent: set when the trace was repeated, three for a single round. */
  sent?: number | null;
  /** The network it belongs to ("AS1299 Arelion"), when a GeoIP database knows. */
  network?: string;
  /** Where the database puts it. */
  place?: string;
  /** What the loss here means (see `lossKinds`). */
  loss?: "none" | "limited" | "carried";
};

const ROW = 26;
const TOP = 6;
const AXIS = 26;
const TTL_W = 30;
/** Room on the right for each hop's loss, when the trace was repeated. */
const LOSS_W = 54;

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/**
 * A route drawn as a ladder: one rung per router, in order down the page, placed across by how long its
 * answers took. The line joining the rungs rises where the route gets slow, so the jump to another continent
 * or a congested link shows as a long step. Silent routers are gaps in the line, not failures.
 */
export function RouteLadder({
  hops,
  activeTtl,
  onActive,
  label,
  className,
}: {
  hops: Hop[];
  activeTtl: number | null;
  onActive: (ttl: number | null) => void;
  label: string;
  className?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const repeated = hops.some((h) => h.sent != null && h.sent > PROBES_PER_ROUND);
  const slowest = Math.max(0, ...hops.flatMap((h) => h.rtts));
  // the plot is what is left of the row after the hop number, the address and (when repeated) the loss
  const labelW = width < 480 ? 104 : width < 760 ? 140 : 176;
  const x0 = TTL_W + labelW + 8;
  const x1 = Math.max(x0 + 40, width - 14 - (repeated ? LOSS_W : 0));
  // about one tick for every 70 px, so the labels (the last one carries the unit) never touch
  const ticks = Math.max(2, Math.min(6, Math.floor((x1 - x0) / 70)));
  const scale = useMemo(() => niceScale(slowest || 1, ticks), [slowest, ticks]);
  const max = useTween(scale.max, 500);

  // the biggest single step up, if it is a real feature of the route and not noise
  const medians = hops.map((h) => (h.rtts.length ? median(h.rtts) : null));
  const biggest = useMemo(() => {
    let best = { ttl: -1, jump: 0 };
    let before: number | null = null;
    hops.forEach((hop, i) => {
      const m = medians[i];
      if (m == null) return;
      if (before != null && m - before > best.jump) best = { ttl: hop.ttl, jump: m - before };
      before = m;
    });
    return best.jump >= 10 && best.jump >= slowest * 0.3 ? best : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hops, slowest]);

  if (hops.length === 0) return null;

  const x = (v: number) => x0 + (Math.min(v, max) / max) * (x1 - x0);
  const height = TOP + hops.length * ROW + AXIS;
  const axisY = TOP + hops.length * ROW;
  const chars = Math.floor((labelW - 4) / 6.3);
  const cy = (i: number) => TOP + i * ROW + ROW / 2;

  // the ladder: a line through each answering hop; a dashed bridge across routers that stayed silent
  const rungs = hops.flatMap((hop, i) => (medians[i] == null ? [] : [{ i, hop, at: medians[i] as number }]));
  const segments = rungs.slice(1).map((rung, k) => {
    const prev = rungs[k];
    return { key: rung.hop.ttl, d: `M${x(prev.at)} ${cy(prev.i)}L${x(rung.at)} ${cy(rung.i)}`, gap: rung.i - prev.i > 1 };
  });

  const activeIndex = hops.findIndex((h) => h.ttl === activeTtl);
  const tip = activeIndex >= 0 ? hops[activeIndex] : null;

  return (
    <div className={cn("w-full", className)}>
      <Legend>
        <Key glyph={<circle cx="11" cy="6" r="4" fill="var(--viz-1)" stroke="var(--card)" strokeWidth="2" />}>one probe</Key>
        <Key glyph={<path d="M1 10L21 2" stroke="var(--viz-1)" strokeWidth="2" strokeLinecap="round" />}>route, by median</Key>
        <Key glyph={<path d="M1 10L21 2" stroke="var(--muted-foreground)" strokeWidth="2" strokeDasharray="2 3" />}>silent router</Key>
        <Key glyph={<circle cx="11" cy="6" r="5" fill="none" stroke="var(--signal)" strokeWidth="2" />}>destination</Key>
        {repeated && (
          <Key glyph={<rect x="1" y="2" width="20" height="8" rx="4" fill="var(--viz-1)" opacity="0.2" />}>best to worst of the rounds</Key>
        )}
        {hops.some((h) => h.loss === "carried") && (
          <Key glyph={<path d="M11 1.5L16 10.5H6Z" fill="var(--critical)" />}>loss that carries on</Key>
        )}
      </Legend>
      <div ref={ref} className="relative w-full" role="group" aria-label={label}>
        {width > 0 && (
          <svg width={width} height={height} className="block overflow-visible">
            <TimeAxis x0={x0} x1={x1} top={TOP} bottom={axisY} max={max} ticks={scale.ticks} />
            {segments.map((s) => (
              <path
                key={s.key}
                d={s.d}
                fill="none"
                stroke={s.gap ? "var(--muted-foreground)" : "var(--viz-1)"}
                strokeWidth="2"
                strokeDasharray={s.gap ? "2 4" : undefined}
                strokeLinecap="round"
              />
            ))}
            {hops.map((hop, i) => {
              const y = TOP + i * ROW;
              const isActive = hop.ttl === activeTtl;
              const m = medians[i];
              const silent = hop.rtts.length === 0;
              const stats = hop.sent != null && hop.sent > PROBES_PER_ROUND ? hopStats(hop.rtts, hop.sent) : null;
              const lossText = stats ? `${Math.round(stats.lossPct)}%` : null;
              const lossSaid =
                stats && stats.lossPct > 0 && !silent
                  ? hop.loss === "carried"
                    ? `, ${lossText} lost, and the loss carries on to later hops`
                    : `, ${lossText} of the probes got no answer`
                  : "";
              const summary = silent
                ? `Hop ${hop.ttl}: ${hop.private ? "a router inside a private network" : "no answer"}`
                : `Hop ${hop.ttl}: ${hop.ip ?? "router"}${hop.network ? `, ${hop.network}` : ""}, ${
                    stats
                      ? `best ${ms(stats.best as number)}, average ${ms(stats.avg as number)}, worst ${ms(stats.worst as number)} ms`
                      : `${hop.rtts.map((v) => `${ms(v)} ms`).join(", ")}`
                  }${lossSaid}${hop.reached ? ", destination" : ""}`;
              return (
                <g
                  key={hop.ttl}
                  tabIndex={0}
                  role="img"
                  aria-label={summary}
                  className="cursor-default outline-none [&:focus-visible_.focus-ring]:opacity-100"
                  onPointerEnter={() => onActive(hop.ttl)}
                  onPointerLeave={() => onActive(null)}
                  onFocus={() => onActive(hop.ttl)}
                  onBlur={() => onActive(null)}
                >
                  <rect x="0" y={y} width={width} height={ROW} fill={isActive ? "var(--signal-soft)" : "transparent"} />
                  <rect className="focus-ring" x="1" y={y + 1} width={width - 2} height={ROW - 2} fill="none" stroke="var(--ring)" strokeWidth="2" opacity="0" />
                  <text x={TTL_W - 8} y={y + ROW / 2 + 4} textAnchor="end" className="num" fontSize="11" fill="var(--muted-foreground)">
                    {hop.ttl}
                  </text>
                  <text
                    x={TTL_W}
                    y={y + ROW / 2 + 4}
                    fontSize="11"
                    fontFamily="var(--font-data), monospace"
                    fill={silent ? "var(--muted-foreground)" : "var(--foreground)"}
                    fontStyle={hop.private ? "italic" : undefined}
                  >
                    {truncate(hop.ip ?? (hop.private ? "private network" : "* no answer"), chars)}
                  </text>
                  {silent ? (
                    <text x={x0 + 4} y={y + ROW / 2 + 4} fontSize="12" fill="var(--muted-foreground)" fontFamily="var(--font-data), monospace">
                      *
                    </text>
                  ) : (
                    <>
                      {hop.rtts.length > 1 && (
                        <rect
                          x={x(Math.min(...hop.rtts)) - 5}
                          y={y + ROW / 2 - 5}
                          width={x(Math.max(...hop.rtts)) - x(Math.min(...hop.rtts)) + 10}
                          height="10"
                          rx="5"
                          fill={isActive ? "var(--signal)" : "var(--viz-1)"}
                          opacity="0.2"
                        />
                      )}
                      {hop.rtts.map((v, k) => (
                        <circle key={k} cx={x(v)} cy={y + ROW / 2} r="4" fill={isActive ? "var(--signal)" : "var(--viz-1)"} stroke="var(--card)" strokeWidth="2" className="dot-in" />
                      ))}
                      {m != null && <rect x={x(m) - 1} y={y + ROW / 2 - 7} width="2" height="14" fill="var(--foreground)" />}
                      {hop.reached && m != null && (
                        <>
                          <circle cx={x(m)} cy={y + ROW / 2} r="9" fill="none" stroke="var(--signal)" strokeWidth="2" />
                          <circle cx={x(m)} cy={y + ROW / 2} r="9" fill="none" stroke="var(--signal)" strokeWidth="1" className="ring-out" />
                        </>
                      )}
                      {biggest?.ttl === hop.ttl && m != null && (
                        <text
                          x={x(Math.max(...hop.rtts)) > x1 - 70 ? x(Math.min(...hop.rtts)) - 12 : x(Math.max(...hop.rtts)) + 12}
                          y={y + ROW / 2 + 4}
                          textAnchor={x(Math.max(...hop.rtts)) > x1 - 70 ? "end" : "start"}
                          className="num"
                          fontSize="11"
                          fontWeight="600"
                          fill="var(--foreground)"
                        >
                          +{ms(biggest.jump)} ms
                        </text>
                      )}
                    </>
                  )}
                  {lossText && !silent && (
                    <g transform={`translate(${width - 8} ${y + ROW / 2 + 4})`}>
                      {hop.loss === "carried" && <path d="M-34 -9.5L-29 -0.5H-39Z" fill="var(--critical)" />}
                      <text
                        textAnchor="end"
                        className="num"
                        fontSize="11"
                        fontWeight={hop.loss === "carried" ? 700 : 400}
                        fill={hop.loss === "carried" ? "var(--critical)" : stats && stats.lossPct > 0 ? "var(--foreground)" : "var(--muted-foreground)"}
                      >
                        {lossText}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>
        )}
        {tip && (
          <ChartTip x={Math.min(Math.max(tip.rtts.length ? x(median(tip.rtts)) : x0 + 20, 0), width)} y={TOP + activeIndex * ROW} width={width}>
            <div className="mb-1">
              <div className="num text-sm font-semibold">{tip.ip ?? (tip.private ? "A router in a private network" : "No answer")}</div>
              <div className="label normal-case tracking-normal">
                hop {tip.ttl}
                {tip.reached ? " · destination" : ""}
              </div>
            </div>
            {tip.network && <TipRow k="Network" v={tip.network} />}
            {tip.place && <TipRow k="Registered at" v={tip.place} />}
            {tip.rtts.length > 0 ? (
              <>
                <TipRow k="Median" v={`${ms(median(tip.rtts))} ms`} />
                {tip.sent != null && tip.sent > PROBES_PER_ROUND ? (
                  <>
                    <TipRow k="Best / worst" v={`${ms(Math.min(...tip.rtts))} / ${ms(Math.max(...tip.rtts))} ms`} />
                    <TipRow k="Jitter" v={`${ms(hopStats(tip.rtts, tip.sent).jitter ?? 0)} ms`} />
                    <TipRow k="Answered" v={`${tip.rtts.length} of ${tip.sent}`} />
                    {tip.loss === "limited" && (
                      <div className="label mt-1 normal-case tracking-normal">
                        Later hops lose less: this router is slow to answer probes aimed at it, not dropping traffic.
                      </div>
                    )}
                    {tip.loss === "carried" && (
                      <div className="label mt-1 normal-case tracking-normal">The loss continues at the hops after it: packets really are dropped here or just before.</div>
                    )}
                  </>
                ) : (
                  <TipRow k="Probes" v={tip.rtts.map((v) => ms(v)).join("  ")} />
                )}
              </>
            ) : (
              <div className="label normal-case tracking-normal">Many routers do not answer these probes; that is normal.</div>
            )}
          </ChartTip>
        )}
      </div>
    </div>
  );
}
