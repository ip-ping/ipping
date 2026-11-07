"use client";

import { useEffect, useState } from "react";

import { api, type Measurement } from "@/lib/api/client";

/** What makes two measurements the same question: the kind, the target and the settings that change the answer. */
export function sameQuestion(a: Measurement, b: Measurement): boolean {
  const key = (m: Measurement) =>
    [m.kind, m.target.host, m.options.port ?? "", m.options.scheme ?? "", m.options.path ?? "", m.options.record_type ?? "", m.options.resolver ?? ""].join("|");
  return key(a) === key(b);
}

/** The latest earlier, finished measurement of the same question among this browser's own, or null. */
export function findPrevious(current: Measurement, history: Measurement[]): Measurement | null {
  return (
    history
      .filter((m) => m.id !== current.id && m.status === "completed" && m.created_at < current.created_at && sameQuestion(m, current))
      .sort((x, y) => (x.created_at < y.created_at ? 1 : -1))[0] ?? null
  );
}

/** The median of each node of a measurement, by node id: what a later run is compared with. */
export function medians(measurement: Measurement | null): ReadonlyMap<string, number> {
  const found = new Map<string, number>();
  for (const task of measurement?.tasks ?? []) {
    const value = task.summary?.median_ms;
    if (value != null) found.set(task.node.id, value);
  }
  return found;
}

/** The previous run of this measurement, once it is finished. Only this browser's own are known. */
export function usePreviousRun(measurement: Measurement | null): Measurement | null {
  const [previous, setPrevious] = useState<Measurement | null>(null);
  const id = measurement?.id;
  const finished = measurement !== null && measurement.status !== "running";
  useEffect(() => {
    if (!measurement || !finished) return;
    let cancelled = false;
    api<Measurement[]>("GET", "/measurements?limit=30")
      .then((history) => !cancelled && setPrevious(findPrevious(measurement, history)))
      .catch(() => !cancelled && setPrevious(null));
    return () => {
      cancelled = true;
    };
    // the measurement object changes with every event; what matters is which one it is, and that it ended
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, finished]);
  return previous;
}
