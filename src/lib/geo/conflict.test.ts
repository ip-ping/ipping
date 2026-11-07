import { describe, expect, it } from "vitest";

import { findConflict, type EvidenceNode } from "./conflict";

const node = (name: string, latitude: number, longitude: number, rtt_ms: number, verified = true): EvidenceNode => ({
  node_id: name,
  node_name: name,
  latitude,
  longitude,
  rtt_ms,
  verified,
});

describe("findConflict", () => {
  const johannesburg = node("Johannesburg", -26.2, 28.05, 1.2);
  const sydney = node("Sydney", -33.87, 151.21, 1.2);
  const frankfurt = node("Frankfurt", 50.11, 8.68, 1.4);

  it("finds two nodes that are further apart than their round trips allow", () => {
    const found = findConflict([johannesburg, sydney]);
    expect(found).not.toBeNull();
    expect(found!.distanceKm).toBeGreaterThan(10_000);
    // 1.2 + 1.2 ms of round trip is at most 360 km between them
    expect(found!.allowedKm).toBeCloseTo(360, 6);
    expect([found!.a.node_name, found!.b.node_name].sort()).toEqual(["Johannesburg", "Sydney"]);
  });

  it("finds nothing when every pair could be near one place", () => {
    // 60 ms and 60 ms allow 18,000 km between two nodes: no contradiction
    expect(findConflict([node("A", 50, 8, 60), node("B", -34, 151, 60)])).toBeNull();
    expect(findConflict([frankfurt])).toBeNull();
    expect(findConflict([])).toBeNull();
  });

  it("picks the worst offending pair", () => {
    const found = findConflict([johannesburg, sydney, frankfurt]);
    expect(found).not.toBeNull();
    // Sydney is the furthest from both, so it is in the worst pair
    expect([found!.a.node_name, found!.b.node_name]).toContain("Sydney");
  });

  it("never accuses a node whose position was not verified", () => {
    expect(findConflict([johannesburg, node("Liar", -33.87, 151.21, 1.2, false)])).toBeNull();
  });

  it("is not fooled by a pair that is exactly at the limit", () => {
    // 100 km apart with 1 ms each (300 km allowed): fine
    expect(findConflict([node("A", 0, 0, 1), node("B", 0, 0.9, 1)])).toBeNull();
  });
});
