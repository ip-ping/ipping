import { describe, expect, it } from "vitest";

import { measurement, sample, task } from "@/test/fixtures";

import { hopsOf, mapNodes, stateOf, stripRows, waterfallRows } from "./series";

describe("stateOf", () => {
  it("names the four things a node can be doing", () => {
    expect(stateOf(task("a", { status: "pending" }))).toBe("pending");
    expect(stateOf(task("a", { status: "dispatched" }))).toBe("running");
    expect(stateOf(task("a", { status: "running" }))).toBe("running");
    expect(stateOf(task("a", { status: "completed" }))).toBe("done");
    for (const status of ["failed", "timed_out", "node_disconnected", "interrupted", "cancelled"]) {
      expect(stateOf(task("a", { status }))).toBe("failed");
    }
  });
});

describe("stripRows", () => {
  it("keeps every reply as a point and counts the probes that never came back", () => {
    const t = task("Dubai", {
      samples: [
        sample({ seq: 0, rtt_ms: 12.5 }),
        sample({ seq: 1, status: "timeout" }),
        // a refusal has a time but is not a success
        sample({ seq: 2, status: "error", rtt_ms: 11, error_code: "connection_refused" }),
      ],
    });
    const [row] = stripRows(measurement("tcp", [t]));
    expect(row.points).toEqual([
      { seq: 0, ms: 12.5, ok: true },
      { seq: 2, ms: 11, ok: false },
    ]);
    expect(row.lost).toBe(1);
    expect(row.sent).toBe(3);
    expect(row.expected).toBe(4);
  });

  it("wears the colour given for the node", () => {
    const t = task("Dubai", { samples: [sample({ seq: 0, rtt_ms: 5 })] });
    expect(stripRows(measurement("dns", [t]), new Map([["node-Dubai", "red"]]))[0].color).toBe("red");
  });
});

describe("waterfallRows", () => {
  const http = { status_code: 200, dns_us: 1000, connect_us: 20_000, tls_us: 40_000, ttfb_us: 30_000, total_us: 100_000 };

  it("turns microseconds into milliseconds and keeps what the phases leave over as 'other'", () => {
    const [row] = waterfallRows(measurement("http", [task("A", { samples: [sample({ seq: 0, http } as never)] })]));
    expect(row.phases).toEqual({ dns: 1, connect: 20, tls: 40, wait: 30, other: 9 });
    expect(row.total).toBe(100);
    expect(row.status).toBe(200);
  });

  it("has no 'other' when the phases add up to the total, and no total when nothing was timed", () => {
    const exact = { ...http, total_us: 91_000 };
    expect(waterfallRows(measurement("http", [task("A", { samples: [sample({ seq: 0, http: exact } as never)] })]))[0].phases.other).toBe(0);
    const failed = task("B", { status: "failed", samples: [sample({ seq: 0, status: "timeout" })] });
    const [row] = waterfallRows(measurement("http", [failed]));
    expect(row.total).toBeNull();
    expect(row.note).toBe("timed out");
  });
});

describe("hopsOf", () => {
  it("lists the routers in order, in milliseconds", () => {
    const t = task("A", {
      samples: [
        sample({ seq: 1, hop: { ttl: 2, ip: "8.8.8.8", private: false, reached: true, rtts_us: [11_000, 12_000], sent: 6 } } as never),
        sample({ seq: 0, hop: { ttl: 1, private: true, reached: false, rtts_us: [500] } } as never),
      ],
    });
    expect(hopsOf(t)).toEqual([
      { ttl: 1, ip: null, private: true, reached: false, rtts: [0.5], sent: null },
      { ttl: 2, ip: "8.8.8.8", private: false, reached: true, rtts: [11, 12], sent: 6 },
    ]);
    expect(hopsOf(undefined)).toEqual([]);
  });
});

describe("mapNodes", () => {
  const node = (name: string, summary: object | null, over = {}) =>
    task(name, { summary: summary as never, samples: [sample({ seq: 0, rtt_ms: 5 })], ...over });

  it("rings a node by its best round trip, for ping, tcp and a traceroute that reached", () => {
    const m = measurement("ping", [node("A", { sent: 4, received: 4, loss_pct: 0, min_ms: 12.5 })]);
    expect(mapNodes(m)[0].ms).toBe(12.5);
    const unreached = measurement("traceroute", [node("A", { sent: 8, received: 6, loss_pct: 0, min_ms: 40, reached: false })]);
    expect(mapNodes(unreached)[0].ms).toBeNull();
  });

  it("draws no ring for http or dns, whose times say nothing about distance", () => {
    const summary = { sent: 1, received: 1, loss_pct: 0, min_ms: 80 };
    expect(mapNodes(measurement("http", [node("A", summary)]))[0].ms).toBeNull();
    expect(mapNodes(measurement("dns", [node("A", summary)]))[0].ms).toBeNull();
  });

  it("skips a node with no position and carries the colour it was given", () => {
    const noPlace = task("Nowhere", { node: { id: "n", name: "Nowhere", location_verified: false } as never });
    const m = measurement("dns", [noPlace, node("A", null)]);
    const nodes = mapNodes(m, new Map([["node-A", "blue"]]));
    expect(nodes.map((n) => n.name)).toEqual(["A, NL"]); // a node is shown by its place where room is short
    expect(nodes[0].color).toBe("blue");
  });

  it("sends a pulse for every sample", () => {
    const t = task("A", { samples: [sample({ seq: 0, rtt_ms: 1 }), sample({ seq: 1, rtt_ms: 2 })] });
    expect(mapNodes(measurement("ping", [t]))[0].pulses).toBe(2);
  });
});
