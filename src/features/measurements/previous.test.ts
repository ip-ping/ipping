import { describe, expect, it } from "vitest";

import { measurement, task } from "@/test/fixtures";

import { findPrevious, medians, sameQuestion } from "./previous";

const at = (created_at: string, over: object = {}) => measurement("ping", [task("A")], { created_at, ...over } as never);

describe("sameQuestion", () => {
  it("compares the kind, the target and what changes the answer, not the count", () => {
    expect(sameQuestion(at("2026-11-07T10:00:00Z"), at("2026-11-07T11:00:00Z", { options: { count: 10, interval_ms: 1, timeout_ms: 1 } }))).toBe(true);
    expect(sameQuestion(at("2026-11-07T10:00:00Z"), measurement("tcp", [], { options: { port: 443 } } as never))).toBe(false);
    const other = at("2026-11-07T10:00:00Z", { target: { host: "example.org", ip: null, resolved_ips: [], input_kind: "hostname" } });
    expect(sameQuestion(at("2026-11-07T10:00:00Z"), other)).toBe(false);
    const dnsA = measurement("dns", [], { options: { record_type: "A", resolver: "google" } } as never);
    const dnsMx = measurement("dns", [], { options: { record_type: "MX", resolver: "google" } } as never);
    expect(sameQuestion(dnsA, dnsMx)).toBe(false);
  });
});

describe("findPrevious", () => {
  const current = at("2026-11-07T12:00:00Z", { id: "now" });
  it("is the latest earlier finished run of the same question", () => {
    const history = [
      at("2026-11-07T09:00:00Z", { id: "old" }),
      at("2026-11-07T11:00:00Z", { id: "recent" }),
      at("2026-11-07T11:30:00Z", { id: "other-target", target: { host: "x.org", ip: null, resolved_ips: [], input_kind: "hostname" } }),
      at("2026-11-07T11:45:00Z", { id: "unfinished", status: "running" }),
      at("2026-11-07T13:00:00Z", { id: "later" }),
      current,
    ];
    expect(findPrevious(current, history)?.id).toBe("recent");
  });
  it("is null when there is nothing to compare with", () => {
    expect(findPrevious(current, [current])).toBeNull();
    expect(findPrevious(current, [])).toBeNull();
  });
});

describe("medians", () => {
  it("is each node's median by node id, skipping nodes without one", () => {
    const m = measurement("ping", [
      task("A", { summary: { sent: 4, received: 4, loss_pct: 0, median_ms: 3.1 } }),
      task("B", { summary: { sent: 4, received: 0, loss_pct: 100 } }),
    ]);
    expect([...medians(m)]).toEqual([["node-A", 3.1]]);
    expect(medians(null).size).toBe(0);
  });
});
