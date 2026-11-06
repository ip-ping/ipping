import type { Measurement, Sample, Summary, Task } from "@/lib/api/client";

type Stats = Measurement["stats"];

const round = (n: number) => Math.round(n * 1000) / 1000;

function fillTimings(summary: Summary, values: number[]): void {
  if (values.length === 0) return;
  const rtts = [...values].sort((a, b) => a - b);
  const middle = Math.floor(rtts.length / 2);
  summary.min_ms = round(rtts[0]);
  summary.max_ms = round(rtts[rtts.length - 1]);
  summary.avg_ms = round(rtts.reduce((a, b) => a + b, 0) / rtts.length);
  summary.median_ms = round(
    rtts.length % 2 ? rtts[middle] : (rtts[middle - 1] + rtts[middle]) / 2,
  );
}

/** Same arithmetic as the backend, so a live row and the final stored row agree. */
export function summarize(samples: Sample[], kind = "ping"): Summary | null {
  if (samples.length === 0) return null;
  const sent = samples.length;

  if (kind === "traceroute") {
    // Silent routers are normal; what counts is whether the destination answered.
    const answered = samples.filter((s) => s.status === "ok").length;
    const destination = samples.find((s) => s.hop?.reached);
    const summary: Summary = {
      sent,
      received: answered,
      loss_pct: Math.round(((sent - answered) * 1000) / sent) / 10,
      reached: destination !== undefined,
    };
    fillTimings(summary, (destination?.hop?.rtts_us ?? []).map((us) => us / 1000));
    return summary;
  }

  const rtts = samples
    .filter((s) => s.status === "ok" && s.rtt_ms != null)
    .map((s) => s.rtt_ms as number);
  const received = rtts.length;
  const summary: Summary = {
    sent,
    received,
    loss_pct: Math.round(((sent - received) * 1000) / sent) / 10,
  };
  fillTimings(summary, rtts);
  return summary;
}

export const TERMINAL_TASK = new Set([
  "completed",
  "failed",
  "timed_out",
  "node_disconnected",
  "interrupted",
  "cancelled",
]);

export function computeStats(tasks: Task[]): Stats {
  const responding = tasks.filter(
    (t) => (t.summary?.received ?? 0) > 0 && t.summary?.reached !== false,
  );
  const failed = tasks.filter((t) =>
    ["failed", "timed_out", "node_disconnected", "interrupted"].includes(t.status),
  );
  const withMedian = responding.filter((t) => t.summary?.median_ms != null);
  const by = (pick: (a: number, b: number) => boolean) =>
    withMedian.reduce<Task | null>(
      (best, t) =>
        best === null || pick(t.summary!.median_ms!, best.summary!.median_ms!) ? t : best,
      null,
    );
  const fastest = by((a, b) => a < b);
  const slowest = by((a, b) => a > b);
  return {
    nodes_total: tasks.length,
    nodes_responding: responding.length,
    nodes_failed: failed.length,
    fastest_task_id: fastest?.id ?? null,
    fastest_median_ms: fastest?.summary?.median_ms ?? null,
    slowest_task_id: slowest?.id ?? null,
    slowest_median_ms: slowest?.summary?.median_ms ?? null,
  };
}
