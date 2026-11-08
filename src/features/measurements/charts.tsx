"use client";

import { useMemo } from "react";

import { PhaseWaterfall } from "@/components/viz/phase-waterfall";
import { RangeStrip } from "@/components/viz/range-strip";
import { RouteLadder } from "@/components/viz/route-ladder";
import { Panel } from "@/components/panel";
import type { Measurement } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { useState } from "react";

import type { Focus } from "@/lib/use-focus";
import { kindOf } from "./kinds";
import { DnsAnswers } from "./dns-answers";
import { groupAnswers } from "./dns-groups";
import { TERMINAL_TASK } from "./summary";
import { hopsOf, mapNodes, stripRows, waterfallRows } from "./series";
import { lossKinds } from "./hops";
import { asPath, networkName, placeRoute } from "./route-geo";
import { AsPathStrip, RouteMapSection } from "./route-extras";
import { usePath } from "./use-path";

const SEE_TABLE = "Every number is in the table below.";

/** The chart that fits what was measured: round trips, where an HTTP request spent its time, or the route. */
export function Charts({
  measurement,
  focus,
  slots,
  previous,
  previousAt,
}: {
  measurement: Measurement;
  focus: Focus;
  slots: ReadonlyMap<string, number>;
  /** Each node's median in the previous run of the same measurement. */
  previous: ReadonlyMap<string, number>;
  /** When that run was made. */
  previousAt?: string | null;
}) {
  const kind = kindOf(measurement);
  if (measurement.tasks.length === 0) return null;
  if (kind === "dns") return <Dns measurement={measurement} focus={focus} slots={slots} previous={previous} previousAt={previousAt} />;
  if (kind === "http") return <Waterfall measurement={measurement} focus={focus} />;
  if (kind === "traceroute") return <Route measurement={measurement} focus={focus} />;
  return <Strip measurement={measurement} focus={focus} previous={previous} previousAt={previousAt} />;
}

function Dns({
  measurement,
  focus,
  slots,
  previous,
  previousAt,
}: {
  measurement: Measurement;
  focus: Focus;
  slots: ReadonlyMap<string, number>;
  previous: ReadonlyMap<string, number>;
  previousAt?: string | null;
}) {
  const { tasks } = measurement;
  const groups = useMemo(() => groupAnswers(tasks, slots), [tasks, slots]);
  const waiting = tasks.filter((t) => !TERMINAL_TASK.has(t.status) && t.samples.length === 0).length;
  const colors = useMemo(() => new Map(groups.flatMap((g) => g.nodeIds.map((id) => [id, g.color] as const))), [groups]);
  return (
    <>
      <DnsAnswers groups={groups} total={tasks.length} waiting={waiting} focus={focus} />
      <Strip measurement={measurement} focus={focus} colors={colors} previous={previous} previousAt={previousAt} />
    </>
  );
}

function Strip({
  measurement,
  focus,
  colors,
  previous,
  previousAt,
}: {
  measurement: Measurement;
  focus: Focus;
  colors?: ReadonlyMap<string, string>;
  previous?: ReadonlyMap<string, number>;
  previousAt?: string | null;
}) {
  const rows = useMemo(() => stripRows(measurement, colors, previous), [measurement, colors, previous]);
  const unit = measurement.kind === "tcp" ? "connection time" : measurement.kind === "dns" ? "time to answer" : "round trip";
  return (
    <Panel label={measurement.kind === "dns" ? "Time to answer, by node" : `Every ${unit}, by node`} meta={
        <>
          {previousAt && previous && previous.size > 0 && (
            <span>compared with {new Date(previousAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
          )}
          <span className="hidden sm:inline">{SEE_TABLE}</span>
        </>
      }
    >
      <RangeStrip rows={rows} single={measurement.kind === "dns"} activeId={focus.active} onActive={focus.setHover} label={`Each node's ${unit} in milliseconds`} />
    </Panel>
  );
}

function Waterfall({ measurement, focus }: { measurement: Measurement; focus: Focus }) {
  const rows = useMemo(() => waterfallRows(measurement), [measurement]);
  return (
    <Panel label="Where the time went" meta={<span className="hidden sm:inline">{SEE_TABLE}</span>}>
      <PhaseWaterfall rows={rows} activeId={focus.active} onActive={focus.setHover} label="Time spent in each phase of the request, by node" />
    </Panel>
  );
}

function Route({ measurement, focus }: { measurement: Measurement; focus: Focus }) {
  const [hop, setHop] = useState<number | null>(null);
  const { tasks } = measurement;
  // The route of the pinned node; until one is pinned, the first that reached the target (or has most hops).
  const task = useMemo(
    () =>
      tasks.find((t) => t.node.id === focus.pinned) ??
      tasks.find((t) => t.summary?.reached) ??
      [...tasks].sort((a, b) => b.samples.length - a.samples.length)[0],
    [tasks, focus.pinned],
  );
  const path = usePath(measurement.id, measurement.status !== "running");
  const hops = useMemo(() => {
    const plain = hopsOf(task);
    const loss = lossKinds(plain);
    return plain.map((hop) => {
      const known = hop.ip ? path?.hops?.[hop.ip] : undefined;
      return { ...hop, loss: loss.get(hop.ttl), network: networkName(known), place: known?.place ?? undefined };
    });
  }, [task, path]);
  const lat = task?.node.latitude;
  const lon = task?.node.longitude;
  const route = useMemo(() => placeRoute(hops, path, lat != null && lon != null ? { lat, lon } : null), [hops, path, lat, lon]);
  const stops = useMemo(() => asPath(hops, path), [hops, path]);
  const station = useMemo(() => (task ? (mapNodes({ ...measurement, tasks: [task] }, undefined)[0] ?? null) : null), [measurement, task]);
  return (
    <Panel
      label="The route"
      meta={
        <>
          {hops.length > 0 && <span>{hops.length} hops</span>}
          <span className="hidden sm:inline">{SEE_TABLE}</span>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Choose a node">
        {tasks.map((t) => {
          const selected = t.id === task?.id;
          const lit = focus.hover === t.node.id;
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={selected}
              onClick={() => focus.pin(selected && focus.pinned === t.node.id ? null : t.node.id)}
              onPointerEnter={() => focus.setHover(t.node.id)}
              onPointerLeave={() => focus.setHover(null)}
              className={cn(
                "label inline-flex min-h-8 items-center gap-1.5 border px-2.5 normal-case tracking-normal transition-colors",
                selected ? "border-foreground bg-foreground text-background" : "hover:border-foreground/60",
                lit && !selected && "border-signal bg-signal-soft",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "size-1.5 rounded-full",
                  t.summary?.reached ? "bg-signal" : "border border-current",
                )}
              />
              {t.node.name}
            </button>
          );
        })}
      </div>
      <AsPathStrip stops={stops} onActive={setHop} />
      {task && hops.length === 0 ? (
        <p className="text-sm text-muted-foreground">Waiting for {task.node.name} to report its first router…</p>
      ) : (
        <RouteLadder hops={hops} activeTtl={hop} onActive={setHop} label={`The route from ${task?.node.name ?? "a node"} to ${measurement.target.host}`} />
      )}
      {hops.length > 0 && (
        <RouteMapSection
          station={station}
          path={path}
          route={route}
          activeTtl={hop}
          onActive={setHop}
          label={`Map of the route from ${task?.node.name ?? "a node"} to ${measurement.target.host}`}
        />
      )}
    </Panel>
  );
}
