import { describe, expect, it } from "vitest";

import type { Hop } from "@/components/viz/route-ladder";

import { hopStats, lossKinds } from "./hops";

const hop = (ttl: number, rtts: number[], sent?: number): Hop => ({
  ttl,
  ip: `203.0.113.${ttl}`,
  private: false,
  reached: false,
  rtts,
  sent,
});

describe("hopStats", () => {
  it("counts a plain trace as three probes", () => {
    const s = hopStats([10, 12]);
    expect(s.sent).toBe(3);
    expect(s.answered).toBe(2);
    expect(s.lossPct).toBeCloseTo(33.33, 1);
    expect([s.best, s.avg, s.worst]).toEqual([10, 11, 12]);
    expect(s.jitter).toBeCloseTo(1, 5);
  });

  it("measures loss against the probes it was sent", () => {
    const s = hopStats([5, 5, 5, 5], 10);
    expect(s.lossPct).toBe(60);
    expect(s.jitter).toBe(0);
  });

  it("says a hop that never answered lost everything, without inventing times", () => {
    expect(hopStats([], 6)).toEqual({ sent: 6, answered: 0, lossPct: 100, best: null, avg: null, worst: null, jitter: null });
  });

  it("has no spread from a single answer", () => {
    expect(hopStats([8], 1).jitter).toBeNull();
  });

  it("never reports more answers than probes", () => {
    expect(hopStats([1, 2, 3, 4], 2).lossPct).toBe(0);
  });
});

describe("lossKinds", () => {
  it("ignores loss in a trace of one round: three probes cannot say", () => {
    const kinds = lossKinds([hop(1, [1, 1]), hop(2, [2])]);
    expect([...kinds.values()]).toEqual(["none", "none"]);
  });

  it("treats loss that the later hops do not share as a router limiting its own replies", () => {
    const kinds = lossKinds([hop(1, [1, 1, 1, 1, 1, 1], 6), hop(2, [2, 2], 6), hop(3, [3, 3, 3, 3, 3, 3], 6)]);
    expect(kinds.get(1)).toBe("none");
    expect(kinds.get(2)).toBe("limited");
    expect(kinds.get(3)).toBe("none");
  });

  it("treats loss that carries on to the destination as real", () => {
    const kinds = lossKinds([
      hop(1, [1, 1, 1, 1, 1, 1], 6),
      hop(2, [2, 2, 2, 2], 6),
      hop(3, [3, 3, 3, 3], 6),
      hop(4, [4, 4, 4], 6),
    ]);
    expect(kinds.get(2)).toBe("carried");
    expect(kinds.get(3)).toBe("carried");
  });

  it("looks past silent hops, which say nothing either way", () => {
    const kinds = lossKinds([hop(1, [1, 1, 1, 1], 6), hop(2, [], 6), hop(3, [3, 3, 3, 3, 3, 3], 6)]);
    expect(kinds.get(1)).toBe("limited");
    expect(kinds.get(2)).toBe("none");
  });

  it("calls loss at the very last hop real: there is nothing after it to compare with", () => {
    expect(lossKinds([hop(1, [1, 1, 1, 1, 1, 1], 6), hop(2, [2, 2, 2], 6)]).get(2)).toBe("carried");
  });
});
