import { describe, expect, it } from "vitest";

import { placeLabels, shortMs } from "./map-labels";

const at = (id: string, lat: number, lon: number, ms: number | null = 10, extra: Record<string, unknown> = {}) => ({ id, lat, lon, ms, ...extra });

describe("shortMs", () => {
  it("keeps a decimal below 100 ms and rounds above", () => {
    expect(shortMs(8.46)).toBe("8.5");
    expect(shortMs(99.94)).toBe("99.9");
    expect(shortMs(141.4)).toBe("141");
  });
});

describe("placeLabels", () => {
  it("writes a number beside every station that has room", () => {
    const placed = placeLabels([at("a", 50, 8, 9.1), at("b", -33, 151, 210), at("c", 40, -74, 85)]);
    expect([...placed.keys()].sort()).toEqual(["a", "b", "c"]);
    expect(placed.get("a")?.text).toBe("9.1");
    expect(placed.get("b")?.text).toBe("210");
  });

  it("never writes two numbers on top of each other, and the fastest of a crowd has its own", () => {
    // five stations in one city
    const crowd = [at("a", 50, 8, 30), at("b", 50.4, 8.2, 5), at("c", 49.8, 8.1, 12), at("d", 50.1, 7.9, 40), at("e", 49.9, 8.3, 8)];
    const placed = placeLabels(crowd);
    expect(placed.get("b")?.text).toBe("5.0");
    expect(placed.size).toBeLessThan(crowd.length); // a crowd cannot all be written
    const spots = [...placed.values()].map((l) => `${l.anchor}${l.x.toFixed(2)}${l.y.toFixed(2)}`);
    expect(new Set(spots).size).toBe(spots.length);
  });

  it("goes to the left of a station at the right edge of the map", () => {
    const placed = placeLabels([at("edge", 0, 179.5, 12)]);
    expect(placed.get("edge")?.anchor).toBe("end");
  });

  it("skips nodes with no result, offline ones and ones that cannot take part", () => {
    const placed = placeLabels([at("none", 10, 10, null), at("off", 20, 20, 5, { online: false }), at("dim", 30, 30, 5, { disabled: true }), at("ok", 40, 40, 5)]);
    expect([...placed.keys()]).toEqual(["ok"]);
  });

  it("always gives the station being pointed at its number", () => {
    const placed = placeLabels([at("fast", 50, 8, 5), at("slow", 50.5, 8.3, 40)], "slow");
    expect(placed.has("slow")).toBe(true);
  });
});
