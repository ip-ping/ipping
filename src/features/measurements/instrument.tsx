"use client";

import { useMemo } from "react";

import { NetworkMap, type MapPlace } from "@/components/viz/network-map";
import { Readouts, type ReadoutItem } from "@/components/viz/readout";
import { Panel } from "@/components/panel";
import { Progress } from "@/components/ui/progress";
import type { LocationEstimate } from "@/features/location/use-location";
import type { Measurement } from "@/lib/api/client";
import { pct } from "@/lib/format";

import type { Focus } from "@/lib/use-focus";
import { KIND_INFO, kindOf } from "./kinds";
import { mapNodes } from "./series";
import { TERMINAL_TASK } from "./summary";

/** What the map shows. Phones get the first sentence only; the rest is for a screen with room. */
const CAPTION = {
  rings: {
    lead: "Each ring is how far that node's fastest round trip could have reached: about 100 km per millisecond, and never more than 150, which light itself cannot beat.",
    more: " Hover a station to see that limit. The target is inside all of the rings. Rings wider than 8,000 km rule almost nothing out and are left off.",
  },
  http: {
    lead: "An HTTP time includes the name lookup, the handshakes and the server's own work, so it says nothing about distance: there are no rings for it.",
    more: " The chart below shows where the time went.",
  },
};

function readouts(measurement: Measurement): ReadoutItem[] {
  const { tasks, stats } = measurement;
  const kind = kindOf(measurement);
  const unit = KIND_INFO[kind].unit;
  const nameOf = (id: string | null | undefined) => tasks.find((t) => t.id === id)?.node.name;
  const sent = tasks.reduce((n, t) => n + (t.summary?.sent ?? 0), 0);
  const received = tasks.reduce((n, t) => n + (t.summary?.received ?? 0), 0);
  // Only probes that were really sent can be lost; offline nodes are not in this sum.
  const loss = sent ? ((sent - received) * 100) / sent : null;
  const reached = tasks.filter((t) => t.summary?.reached).length;
  const finished = tasks.filter((t) => t.summary?.reached != null).length;

  const fourth: ReadoutItem =
    kind === "traceroute"
      ? { label: "Destination reached", text: finished ? `${reached} / ${finished}` : "–", hint: "Silent hops are normal." }
      : kind === "http"
        ? { label: "Answered", text: sent ? `${received} / ${sent}` : "–", hint: "Any status counts." }
        : {
            label: kind === "tcp" ? "Failed connections" : "Packet loss",
            value: loss,
            format: (n) => (Number.isInteger(Math.round(n * 10) / 10) ? String(Math.round(n)) : n.toFixed(1)),
            unit: "%",
            alert: (loss ?? 0) > 0,
            hint: sent ? `${sent - received} of ${sent} ${unit.many}` : undefined,
          };

  return [
    { label: "Responding", text: `${stats.nodes_responding} / ${stats.nodes_total}`, hint: stats.nodes_failed ? `${stats.nodes_failed} could not complete` : "nodes" },
    {
      label: kind === "http" ? "Fastest response" : kind === "traceroute" ? "Closest" : "Fastest",
      value: stats.fastest_median_ms,
      unit: "ms",
      hint: nameOf(stats.fastest_task_id) ?? "median per node",
    },
    {
      label: kind === "http" ? "Slowest response" : kind === "traceroute" ? "Farthest" : "Slowest",
      value: stats.slowest_median_ms,
      unit: "ms",
      hint: nameOf(stats.slowest_task_id) ?? "median per node",
    },
    fourth,
  ];
}

/**
 * The top of a measurement: the live map on the left (a station per node, a ring per answer, the estimated
 * place as a crosshair once it is known) and the headline numbers on the right, with the progress of the
 * run along the bottom edge.
 */
export function Instrument({
  measurement,
  estimate,
  focus,
}: {
  measurement: Measurement;
  estimate: LocationEstimate | null;
  focus: Focus;
}) {
  const kind = kindOf(measurement);
  const running = measurement.status === "running";
  const { tasks } = measurement;
  const done = tasks.filter((t) => TERMINAL_TASK.has(t.status)).length;
  const nodes = useMemo(() => mapNodes(measurement), [measurement]);
  const target: MapPlace | null = estimate?.likely
    ? { lat: estimate.likely.latitude, lon: estimate.likely.longitude, label: estimate.likely.name }
    : null;
  const alternatives: MapPlace[] = (estimate?.alternatives ?? []).map((a) => ({
    lat: a.place.latitude,
    lon: a.place.longitude,
    label: a.place.name,
  }));
  const items = useMemo(() => readouts(measurement), [measurement]);
  const rings = kind !== "http";

  return (
    <Panel
      label="The reading"
      meta={
        <>
          <span>{pct(tasks.length ? (done * 100) / tasks.length : 100)}</span>
          <span className="hidden sm:inline">{running ? "measuring" : "complete"}</span>
        </>
      }
      flush
    >
      <div className="grid lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 p-2 pb-3 sm:p-3">
          <NetworkMap
            nodes={nodes}
            rings={rings}
            target={target}
            alternatives={alternatives}
            selectedId={focus.pinned}
            activeId={focus.hover}
            onSelect={focus.pin}
            onHover={focus.setHover}
            scan={running}
            label={`Map of ${nodes.length} nodes measuring ${measurement.target.host}${target ? `, with the estimated location near ${target.label}` : ""}`}
          />
          <p className="mt-2 px-1 text-xs leading-relaxed text-muted-foreground">
            {(rings ? CAPTION.rings : CAPTION.http).lead}
            <span className="hidden sm:inline">
              {(rings ? CAPTION.rings : CAPTION.http).more}
              {target && " The crosshair is the estimated location of the target."}
            </span>
          </p>
        </div>
        <Readouts items={items} className="border-t lg:border-t-0 lg:border-l" />
      </div>
      <div className="flex items-center gap-3 border-t px-3 py-2">
        <span className="label shrink-0">
          {done} of {tasks.length} nodes finished
        </span>
        <Progress value={tasks.length ? (done * 100) / tasks.length : 100} className="min-w-0 flex-1" aria-label="Nodes finished" />
      </div>
    </Panel>
  );
}
