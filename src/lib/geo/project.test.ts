import { describe, expect, it } from "vitest";

import { circlePath, distanceKm, px, py, routeSegment } from "./project";

describe("projection", () => {
  it("puts a place at longitude + 180, 90 - latitude", () => {
    expect([px(0), py(0)]).toEqual([180, 90]);
    expect([px(-180), py(90)]).toEqual([0, 0]);
    expect([px(4.9), py(52.37)]).toEqual([184.9, 37.63]);
  });
});

describe("distanceKm", () => {
  it("is the great-circle distance", () => {
    // Amsterdam to New York is about 5,860 km
    expect(distanceKm(52.37, 4.9, 40.71, -74.0)).toBeGreaterThan(5800);
    expect(distanceKm(52.37, 4.9, 40.71, -74.0)).toBeLessThan(5900);
    expect(distanceKm(10, 20, 10, 20)).toBe(0);
  });
  it("is symmetric and goes the short way round the date line", () => {
    expect(distanceKm(35.68, 139.69, -33.87, 151.21)).toBeCloseTo(distanceKm(-33.87, 151.21, 35.68, 139.69), 6);
    // Fiji (179 E) to Samoa (-172): across the antimeridian, about 1,000 km, not 40,000
    expect(distanceKm(-17.7, 179, -13.8, -172)).toBeLessThan(1500);
  });
});

describe("circlePath", () => {
  it("draws a closed ring around a place", () => {
    const { d, wraps } = circlePath(52.37, 4.9, 500);
    expect(wraps).toBe(false);
    expect(d.startsWith("M")).toBe(true);
    expect(d.trim().endsWith("Z")).toBe(true);
  });
  it("says when a ring crosses the antimeridian, so it is not filled across the map", () => {
    expect(circlePath(-17.7, 179, 800).wraps).toBe(true);
    expect(circlePath(0, 0, 800).wraps).toBe(false);
  });
});

describe("routeSegment", () => {
  it("is a plain line when the points are on the same side of the date line", () => {
    expect(routeSegment(10, 20, 50, 60)).toBe("M10 20L50 60");
  });

  it("goes the short way over the date line, leaving one edge and entering at the other", () => {
    // 10 and 350 are 20 map units apart across the edge: 10 to the left edge, 10 in from the right one
    expect(routeSegment(10, 20, 350, 40)).toBe("M10 20L0 30M360 30L350 40");
    // and the same line drawn from the other end
    expect(routeSegment(350, 40, 10, 20)).toBe("M10 20L0 30M360 30L350 40");
  });
});
