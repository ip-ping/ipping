import { describe, expect, it } from "vitest";

import { niceScale, truncate } from "./chart-utils";

describe("niceScale", () => {
  it("rounds up to a tidy top and counts from zero", () => {
    expect(niceScale(9.3, 5)).toEqual({ max: 10, ticks: [0, 2, 4, 6, 8, 10] });
    expect(niceScale(1480, 6).max).toBe(1500);
    expect(niceScale(1480, 6).ticks[0]).toBe(0);
  });
  it("copes with nothing to scale", () => {
    expect(niceScale(0)).toEqual({ max: 1, ticks: [0, 1] });
    expect(niceScale(Number.NaN)).toEqual({ max: 1, ticks: [0, 1] });
  });
  it("always covers the largest value", () => {
    for (const max of [0.4, 3, 7.7, 12, 99, 101, 4_321]) {
      const scale = niceScale(max, 5);
      expect(scale.max).toBeGreaterThanOrEqual(max);
      expect(scale.ticks.at(-1)).toBe(scale.max);
    }
  });
});

describe("truncate", () => {
  it("shortens with an ellipsis and leaves short text alone", () => {
    expect(truncate("Johannesburg", 8)).toBe("Johanne…");
    expect(truncate("Dubai", 8)).toBe("Dubai");
    // at least one character is kept, so a label is never just an ellipsis
    expect(truncate("abc", 0)).toBe("a…");
  });
});
