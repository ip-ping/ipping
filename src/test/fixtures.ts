import type { Measurement, Sample, Task } from "@/lib/api/client";

/** Small builders for results, so a test says only what it is about. */
export function sample(over: Partial<Sample> & { seq: number }): Sample {
  return { status: "ok", ...over } as Sample;
}

export function task(name: string, over: Partial<Task> = {}): Task {
  return {
    id: `task-${name}`,
    node: { id: `node-${name}`, name, country: "NL", city: name, location_verified: true, latitude: 52.37, longitude: 4.9 },
    status: "completed",
    attempts: 1,
    resolved_ips: [],
    samples: [],
    ...over,
  } as Task;
}

export function measurement(kind: string, tasks: Task[], over: Partial<Measurement> = {}): Measurement {
  return {
    id: "m1",
    kind,
    status: "completed",
    target: { host: "example.com", ip: "93.184.216.34", resolved_ips: ["93.184.216.34"], input_kind: "hostname" },
    dns_mode: "fixed",
    family: "auto",
    options: { count: 4, interval_ms: 1000, timeout_ms: 2000 },
    shared: false,
    created_at: "2026-11-07T12:34:56Z",
    deadline_at: "2026-11-07T12:35:26Z",
    finished_at: "2026-11-07T12:35:00Z",
    last_event_seq: 1,
    stats: { nodes_total: tasks.length, nodes_responding: tasks.length, nodes_failed: 0 },
    tasks,
    ...over,
  } as Measurement;
}

export const dnsSample = (answers: { type: string; data: string; ttl?: number }[], rcode = "NOERROR", rtt_ms = 12): Sample =>
  sample({
    seq: 0,
    rtt_ms,
    dns: {
      resolver: "system",
      record_type: "A",
      rcode,
      authoritative: false,
      via_tcp: false,
      truncated: false,
      redacted: 0,
      answers: answers.map((a) => ({ name: "example.com", ttl: 300, ...a })),
    },
  } as Partial<Sample> & { seq: number });
