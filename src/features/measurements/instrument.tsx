"use client";

import { useMemo, type ReactNode } from "react";

import { NetworkMap, type MapClaim, type MapConflict, type MapPlace } from "@/components/viz/network-map";
import { Readouts, type ReadoutItem } from "@/components/viz/readout";
import { Panel } from "@/components/panel";
import { Progress } from "@/components/ui/progress";
import type { LocationEstimate } from "@/features/location/use-location";
import type { Measurement } from "@/lib/api/client";
import { findConflict } from "@/lib/geo/conflict";
import { ms, pct } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { Focus } from "@/lib/use-focus";
import { certificatesOf } from "./certs";
import { groupAnswers } from "./dns-groups";
import { KIND_INFO, kindOf } from "./kinds";
import { mapNodes } from "./series";
import { TERMINAL_TASK } from "./summary";

/** What the map shows. Phones get the first sentence only; the rest is for a screen with room. */
const CAPTION = {
  rings: {
    lead: "Each ring is how far that node's fastest round trip could have reached: about 100 km per millisecond, and never more than 150, which light itself cannot beat.",
    more: " Hover a station to see that limit; the number beside a station is its fastest round trip in ms. The target is inside all of the rings that agree. Rings wider than 8,000 km rule almost nothing out and are left off.",
  },
  dns: {
    lead: "Each station is coloured by the answer its node got, and the key is below the map. A hollow grey station got no answer.",
    more: " There are no rings: how long an answer took depends on the resolver's cache, so it says little about distance.",
  },
  tls: {
    lead: "Each station is coloured by the certificate its node was shown; one colour means they all saw the same one. A hollow grey station got no certificate.",
    more: " There are no rings: a handshake takes several round trips plus the server's own work, so it says little about distance.",
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

  const certs = kind === "tls" ? certificatesOf(tasks) : [];
  const trusted = certs.filter((g) => g.verified).reduce((n, g) => n + g.nodeIds.length, 0);
  const shown = certs.reduce((n, g) => n + g.nodeIds.length, 0);
  const distinct = kind === "dns" ?  groupAnswers(tasks, new Map()).filter((g) => g.answered).length : 0;
  const fourth: ReadoutItem =
    kind === "tls"
      ? {
          label: "Trusted",
          text: shown ? `${trusted} / ${shown}` : "–",
          alert: shown > 0 && trusted < shown,
          hint: shown === 0 ? "none yet" : trusted < shown ? "some nodes do not trust it" : "by every node that got one",
        }
      : kind === "dns"
      ? {
          label: "Distinct answers",
          value: distinct,
          format: (n) => String(Math.round(n)),
          alert: distinct > 1,
          hint: distinct > 1 ? "the nodes disagree" : distinct === 1 ? "all agree" : "none yet",
        }
      : kind === "traceroute"
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
      label: kind === "http" ? "Fastest response" : kind === "tls" ? "Fastest handshake" : kind === "traceroute" ? "Closest" : "Fastest",
      value: stats.fastest_median_ms,
      unit: "ms",
      hint: nameOf(stats.fastest_task_id) ?? "median per node",
    },
    {
      label: kind === "http" ? "Slowest response" : kind === "tls" ? "Slowest handshake" : kind === "traceroute" ? "Farthest" : "Slowest",
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
  slots,
  aside,
}: {
  measurement: Measurement;
  estimate: LocationEstimate | null;
  focus: Focus;
  /** A card for the target, beside the headline numbers (the IP databases' record of it). */
  aside?: ReactNode;
  /** The colour of each distinct DNS answer (see `useAnswerSlots`). */
  slots: ReadonlyMap<string, number>;
}) {
  const kind = kindOf(measurement);
  const running = measurement.status === "running";
  const { tasks } = measurement;
  const done = tasks.filter((t) => TERMINAL_TASK.has(t.status)).length;
  const colors = useMemo(
    () =>
      kind === "dns"
        ? new Map(groupAnswers(tasks, slots).flatMap((g) => g.nodeIds.map((id) => [id, g.color] as const)))
        : kind === "tls"
          ? new Map(certificatesOf(tasks).flatMap((g) => g.nodeIds.map((id) => [id, g.color] as const)))
          : undefined,
    [kind, tasks, slots],
  );
  const nodes = useMemo(() => {
    const all = mapNodes(measurement, colors);
    if (!estimate || estimate.groups.length < 2) return all;
    // Nodes that resolved the name to another address timed a different server: no ring for them, they say so.
    const measured = new Set(tasks.filter((t) => t.tested_ip === estimate.target_ip).map((t) => t.node.id));
    return all.map((n) =>
      measured.has(n.id) ? n : { ...n, ms: null, note: ["measured another address", n.note].filter(Boolean).join(" · ") },
    );
  }, [measurement, colors, estimate, tasks]);
  const target: MapPlace | null = estimate?.likely
    ? { lat: estimate.likely.latitude, lon: estimate.likely.longitude, label: estimate.likely.name }
    : null;
  const alternatives: MapPlace[] = (estimate?.alternatives ?? []).map((a) => ({
    lat: a.place.latitude,
    lon: a.place.longitude,
    label: a.place.name,
  }));
  const items = useMemo(() => readouts(measurement), [measurement]);
  // what a GeoIP database claims, drawn so the claim can be seen against the rings
  const claim = useMemo<MapClaim | null>(() => {
    const g = estimate?.geoip?.place ? estimate.geoip : estimate?.geofeed;
    return g?.place
      ? {
          lat: g.place.latitude,
          lon: g.place.longitude,
          label: `${g.source.split(" ")[0]}: ${g.place.name}${g.verdict === "ruled_out" ? " (ruled out)" : ""}`,
          ruledOut: g.verdict === "ruled_out",
        }
      : null;
  }, [estimate]);
  // Two nodes that measured the target as being in two places at once: what an anycast address looks like.
  const conflictPair = useMemo(
    () => (estimate && estimate.conflicting ? findConflict(estimate.evidence.map((e) => ({ ...e }))) : null),
    [estimate],
  );
  const conflict = useMemo<MapConflict | null>(
    () =>
      conflictPair
        ? {
            a: conflictPair.a.node_id,
            b: conflictPair.b.node_id,
            label: `${Math.round(conflictPair.distanceKm).toLocaleString()} km apart`,
          }
        : null,
    [conflictPair],
  );
  const rings = kind !== "http" && kind !== "dns" && kind !== "tls";
  const caption = kind === "dns" ? CAPTION.dns : kind === "tls" ? CAPTION.tls : rings ? CAPTION.rings : CAPTION.http;

  return (
    <div className="space-y-4 sm:space-y-5">
    <div className={cn("grid gap-4 sm:gap-5", aside ? "lg:grid-cols-[minmax(0,1fr)_21rem]" : undefined)}>
      <Readouts items={items} className="p-0 sm:grid-cols-4" />
      {aside}
    </div>
    <Panel
      label="Where the nodes are"
      meta={
        <>
          <span>{pct(tasks.length ? (done * 100) / tasks.length : 100)}</span>
          <span className="hidden sm:inline">{running ? "measuring" : "complete"}</span>
        </>
      }
      flush
    >
      <div>
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
            conflict={conflict}
            claim={claim}
            labels={kind !== "dns" && kind !== "tls"}
            label={`Map of ${nodes.length} nodes measuring ${measurement.target.host}${target ? `, with the estimated location near ${target.label}` : ""}`}
          />
          <p className="mt-2 px-1 text-xs leading-relaxed text-muted-foreground">
            {caption.lead}
            <span className="hidden sm:inline">
              {caption.more}
              {target && " The crosshair is the estimated location of the target."}
            </span>
          </p>
          {estimate && estimate.groups.length > 1 && (
            <p className="mt-2 border-l-2 border-signal px-3 text-xs leading-relaxed">
              The nodes resolved the name to {estimate.groups.length} different addresses. The rings and the estimate are for{" "}
              <strong className="font-semibold">{estimate.target_ip}</strong>, measured by{" "}
              {estimate.groups.find((g) => g.selected)?.nodes} nodes; the others measured something else and have no ring.
            </p>
          )}
          {conflictPair && (
            <p className="mt-2 border-l-2 border-signal px-3 text-xs leading-relaxed">
              <strong className="font-semibold">{conflictPair.a.node_name}</strong> ({ms(conflictPair.a.rtt_ms)} ms) and{" "}
              <strong className="font-semibold">{conflictPair.b.node_name}</strong> ({ms(conflictPair.b.rtt_ms)} ms) are{" "}
              {Math.round(conflictPair.distanceKm).toLocaleString()} km apart, but round trips that short allow at most{" "}
              {Math.round(conflictPair.allowedKm).toLocaleString()} km between them. They cannot both be measuring one place:
              this is what an <em>anycast</em> address looks like (the same address answered from several sites). The estimate
              uses the nearest node and the nodes that agree with it.
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 border-t px-3 py-2">
        <span className="text-xs text-muted-foreground shrink-0">
          {done} of {tasks.length} nodes finished
        </span>
        <Progress value={tasks.length ? (done * 100) / tasks.length : 100} className="min-w-0 flex-1" aria-label="Nodes finished" />
      </div>
    </Panel>
    </div>
  );
}
