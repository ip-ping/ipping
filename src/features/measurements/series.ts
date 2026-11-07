import type { Hop } from "@/components/viz/route-ladder";
import type { MapNode } from "@/components/viz/network-map";
import type { PhaseKey, WaterfallRow } from "@/components/viz/phase-waterfall";
import type { StripRow } from "@/components/viz/range-strip";
import type { Measurement, Task } from "@/lib/api/client";
import { flag, ms, place } from "@/lib/format";

import { shortError } from "./errors";
import { kindOf } from "./kinds";

export type RowState = "pending" | "running" | "done" | "failed";

/** What a task is doing, in the four states the charts and the map distinguish. */
export function stateOf(task: Task): RowState {
  if (task.status === "pending") return "pending";
  if (task.status === "dispatched" || task.status === "running") return "running";
  if (task.status === "completed") return "done";
  return "failed";
}

const where = (task: Task) => `${flag(task.node.country)} ${place(task.node)}`.trim();

/** One row per node for the ping and TCP chart: every reply as a point, and the probes that never came back. */
export function stripRows(
  measurement: Measurement,
  colors?: ReadonlyMap<string, string>,
  previous?: ReadonlyMap<string, number>,
): StripRow[] {
  return measurement.tasks.map((task) => {
    const points = task.samples
      .filter((s) => s.rtt_ms != null)
      .map((s) => ({ seq: s.seq, ms: s.rtt_ms as number, ok: s.status === "ok" }));
    return {
      id: task.node.id,
      name: task.node.name,
      place: where(task),
      state: stateOf(task),
      points,
      lost: task.samples.filter((s) => s.rtt_ms == null).length,
      sent: task.samples.length,
      expected: measurement.options.count,
      note: task.error_message ?? undefined,
      color: colors?.get(task.node.id),
      previous: previous?.get(task.node.id) ?? null,
    };
  });
}

const PHASE_FIELDS: Record<Exclude<PhaseKey, "other">, "dns_us" | "connect_us" | "tls_us" | "ttfb_us"> = {
  dns: "dns_us",
  connect: "connect_us",
  tls: "tls_us",
  wait: "ttfb_us",
};

/** One row per node for the HTTP chart: the phases of its request, laid end to end. */
export function waterfallRows(measurement: Measurement): WaterfallRow[] {
  return measurement.tasks.map((task) => {
    const sample = task.samples[0];
    const http = sample?.http;
    const phases: Record<PhaseKey, number> = { dns: 0, connect: 0, tls: 0, wait: 0, other: 0 };
    let sum = 0;
    for (const key of Object.keys(PHASE_FIELDS) as (keyof typeof PHASE_FIELDS)[]) {
      const value = (http?.[PHASE_FIELDS[key]] ?? 0) / 1000;
      phases[key] = value;
      sum += value;
    }
    const total = http?.total_us != null ? http.total_us / 1000 : sum > 0 ? sum : null;
    if (total != null && total > sum + 0.05) phases.other = total - sum;
    return {
      id: task.node.id,
      name: task.node.name,
      place: where(task),
      state: stateOf(task),
      phases,
      total,
      status: http?.status_code ?? null,
      note: sample && sample.status !== "ok" ? (sample.status === "timeout" ? "timed out" : shortError(sample.error_code).toLowerCase()) : undefined,
    };
  });
}

/** The routers of one node's trace, in order. */
export function hopsOf(task: Task | undefined): Hop[] {
  if (!task) return [];
  return task.samples
    .flatMap((s) => (s.hop ? [s.hop] : []))
    .map((hop) => ({
      ttl: hop.ttl,
      ip: hop.ip ?? null,
      private: hop.private,
      reached: hop.reached,
      rtts: (hop.rtts_us ?? []).map((us) => us / 1000),
    }))
    .sort((a, b) => a.ttl - b.ttl);
}

/**
 * The nodes as stations on the map. A node's ring is its best round trip, which is a real bound on distance
 * for ping, TCP and a traceroute that reached the target; an HTTP time includes handshakes and server work,
 * so it is not.
 */
export function mapNodes(measurement: Measurement, colors?: ReadonlyMap<string, string>): MapNode[] {
  const kind = kindOf(measurement);
  return measurement.tasks.flatMap((task): MapNode[] => {
    const { latitude, longitude } = task.node;
    if (latitude == null || longitude == null) return [];
    const state = stateOf(task);
    const best =
      kind !== "http" && kind !== "dns" && task.summary?.reached !== false ? (task.summary?.min_ms ?? null) : null;
    const summary = task.summary;
    let note: string | undefined;
    if (kind === "dns") {
      const dns = task.samples[0]?.dns;
      note = dns ? `${dns.rcode}${dns.answers?.[0] ? ` · ${dns.answers[0].data}` : ""}` : undefined;
    } else if (kind === "http") {
      const sample = task.samples[0];
      note = sample?.http?.status_code != null ? `HTTP ${sample.http.status_code}, ${ms(sample.http.total_us != null ? sample.http.total_us / 1000 : null)} ms` : undefined;
    } else if (kind === "traceroute") {
      note = summary?.reached == null ? undefined : summary.reached ? `reached, ${ms(summary.median_ms)} ms` : "target not reached";
    } else if (summary?.median_ms != null) {
      note = `median ${ms(summary.median_ms)} ms${summary.loss_pct ? `, ${summary.loss_pct}% lost` : ""}`;
    }
    return [
      {
        id: task.node.id,
        name: task.node.name,
        place: where(task),
        lat: latitude,
        lon: longitude,
        state: state === "failed" && task.samples.length > 0 ? "done" : state === "pending" ? "idle" : state,
        ms: best,
        pulses: task.samples.length,
        note,
        color: colors?.get(task.node.id),
      },
    ];
  });
}
