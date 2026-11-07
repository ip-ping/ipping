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
import { hopsOf, stripRows, waterfallRows } from "./series";

const SEE_TABLE = "Every number is in the table below.";

/** The chart that fits what was measured: round trips, where an HTTP request spent its time, or the route. */
export function Charts({
  measurement,
  focus,
  slots,
}: {
  measurement: Measurement;
  focus: Focus;
  slots: ReadonlyMap<string, number>;
}) {
  const kind = kindOf(measurement);
  if (measurement.tasks.length === 0) return null;
  if (kind === "dns") return <Dns measurement={measurement} focus={focus} slots={slots} />;
  if (kind === "http") return <Waterfall measurement={measurement} focus={focus} />;
  if (kind === "traceroute") return <Route measurement={measurement} focus={focus} />;
  return <Strip measurement={measurement} focus={focus} />;
}

function Dns({
  measurement,
  focus,
  slots,
}: {
  measurement: Measurement;
  focus: Focus;
  slots: ReadonlyMap<string, number>;
}) {
  const { tasks } = measurement;
  const groups = useMemo(() => groupAnswers(tasks, slots), [tasks, slots]);
  const waiting = tasks.filter((t) => !TERMINAL_TASK.has(t.status) && t.samples.length === 0).length;
  const colors = useMemo(() => new Map(groups.flatMap((g) => g.nodeIds.map((id) => [id, g.color] as const))), [groups]);
  return (
    <>
      <DnsAnswers groups={groups} total={tasks.length} waiting={waiting} focus={focus} />
      <Strip measurement={measurement} focus={focus} colors={colors} />
    </>
  );
}

function Strip({
  measurement,
  focus,
  colors,
}: {
  measurement: Measurement;
  focus: Focus;
  colors?: ReadonlyMap<string, string>;
}) {
  const rows = useMemo(() => stripRows(measurement, colors), [measurement, colors]);
  const unit = measurement.kind === "tcp" ? "connection time" : measurement.kind === "dns" ? "time to answer" : "round trip";
  return (
    <Panel label={measurement.kind === "dns" ? "Time to answer, by node" : `Every ${unit}, by node`} meta={<span className="hidden sm:inline">{SEE_TABLE}</span>}>
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
  const hops = useMemo(() => hopsOf(task), [task]);
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
      {task && hops.length === 0 ? (
        <p className="text-sm text-muted-foreground">Waiting for {task.node.name} to report its first router…</p>
      ) : (
        <RouteLadder hops={hops} activeTtl={hop} onActive={setHop} label={`The route from ${task?.node.name ?? "a node"} to ${measurement.target.host}`} />
      )}
    </Panel>
  );
}
