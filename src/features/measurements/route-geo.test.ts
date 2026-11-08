import { describe, expect, it } from "vitest";

import type { Hop } from "@/components/viz/route-ladder";

import { asPath, networkName, placeRoute, ttlLabel, type Path } from "./route-geo";

const hop = (ttl: number, ip: string | null, rtt: number | null): Hop => ({
  ttl,
  ip,
  private: false,
  reached: false,
  rtts: rtt == null ? [] : [rtt],
});

const FRANKFURT = { latitude: 50.11, longitude: 8.68, place: "Frankfurt", country: "DE", asn: 3320, as_org: "Telekom" };
const STOCKHOLM = { latitude: 59.33, longitude: 18.07, place: "Stockholm", country: "SE", asn: 1299, as_org: "Arelion" };
const TOKYO = { latitude: 35.68, longitude: 139.69, place: "Tokyo", country: "JP", asn: 1299, as_org: "Arelion" };

const path = (hops: Path["hops"]): Path => ({ source: "DB-IP Lite", attribution: "x", city_database: true, asn_database: true, hops });

// A node in Amsterdam
const AMS = { lat: 52.37, lon: 4.9 };

describe("placeRoute", () => {
  it("returns the places in order and joins routers that share a city", () => {
    const hops = [hop(1, "1.1.1.1", 3), hop(2, "2.2.2.2", 4), hop(3, "3.3.3.3", 5), hop(4, "4.4.4.4", 12)];
    const route = placeRoute(
      hops,
      path({ "1.1.1.1": FRANKFURT, "2.2.2.2": FRANKFURT, "3.3.3.3": FRANKFURT, "4.4.4.4": STOCKHOLM }),
      AMS,
    );
    expect(route.points.map((p) => [p.place, p.ttls])).toEqual([
      ["Frankfurt", [1, 2, 3]],
      ["Stockholm", [4]],
    ]);
    expect(route.impossible).toEqual([]);
  });

  it("leaves off a router whose registered place light could not have reached in that time", () => {
    // Tokyo is about 9,300 km from Amsterdam; 6 ms of round trip reaches 900 km at most.
    const route = placeRoute([hop(1, "1.1.1.1", 6), hop(2, "2.2.2.2", 9)], path({ "1.1.1.1": TOKYO, "2.2.2.2": STOCKHOLM }), AMS);
    expect(route.points.map((p) => p.place)).toEqual(["Stockholm"]);
    expect(route.impossible).toHaveLength(1);
    expect(route.impossible[0]).toMatchObject({ ttl: 1, ip: "1.1.1.1", place: "Tokyo" });
    expect(route.impossible[0].distanceKm).toBeGreaterThan(route.impossible[0].maxKm);
  });

  it("accepts a place just inside the limit and counts the unknown ones", () => {
    // Frankfurt is about 365 km away: 3 ms allows 450 km (plus 60 km of slack), 1 ms only 150 km
    const route = placeRoute([hop(1, "1.1.1.1", 3), hop(2, "9.9.9.9", 5), hop(3, null, null)], path({ "1.1.1.1": FRANKFURT }), AMS);
    expect(placeRoute([hop(1, "1.1.1.1", 2.5)], path({ "1.1.1.1": FRANKFURT }), AMS).points).toHaveLength(1);
    expect(placeRoute([hop(1, "1.1.1.1", 1)], path({ "1.1.1.1": FRANKFURT }), AMS).impossible).toHaveLength(1);
    expect(route.points).toHaveLength(1);
    expect(route.unplaced).toBe(1); // 9.9.9.9 has a public address nobody placed; a silent hop is not counted
  });

  it("cannot rule anything out without knowing where the node is", () => {
    expect(placeRoute([hop(1, "1.1.1.1", 1)], path({ "1.1.1.1": TOKYO }), null).points).toHaveLength(1);
  });

  it("is empty without a path", () => {
    expect(placeRoute([hop(1, "1.1.1.1", 1)], null, AMS)).toEqual({ points: [], impossible: [], unplaced: 0 });
  });

  it("skips a place without coordinates", () => {
    const route = placeRoute([hop(1, "1.1.1.1", 1)], path({ "1.1.1.1": { asn: 1299, as_org: "Arelion" } }), AMS);
    expect(route.points).toEqual([]);
    expect(route.unplaced).toBe(1);
  });
});

describe("asPath", () => {
  it("collapses consecutive routers of one network and keeps the order", () => {
    const hops = [hop(1, "1.1.1.1", 1), hop(2, "2.2.2.2", 2), hop(3, "3.3.3.3", 3), hop(4, "4.4.4.4", 4), hop(5, "5.5.5.5", 5)];
    const stops = asPath(
      hops,
      path({ "1.1.1.1": FRANKFURT, "2.2.2.2": FRANKFURT, "3.3.3.3": STOCKHOLM, "4.4.4.4": TOKYO, "5.5.5.5": { latitude: 1, longitude: 1 } }),
    );
    expect(stops).toEqual([
      { asn: 3320, org: "Telekom", ttls: [1, 2] },
      { asn: 1299, org: "Arelion", ttls: [3, 4] },
    ]);
  });

  it("is empty without a path", () => {
    expect(asPath([hop(1, "1.1.1.1", 1)], undefined)).toEqual([]);
  });
});

describe("networkName", () => {
  it("names the network when it is known", () => {
    expect(networkName(FRANKFURT)).toBe("AS3320 Telekom");
    expect(networkName({ asn: 7 })).toBe("AS7");
    expect(networkName({ latitude: 1, longitude: 1 })).toBeUndefined();
    expect(networkName(undefined)).toBeUndefined();
  });
});

describe("ttlLabel", () => {
  it("writes one hop, a run of hops and scattered hops", () => {
    expect(ttlLabel([4])).toBe("4");
    expect(ttlLabel([2, 3, 4])).toBe("2–4");
    expect(ttlLabel([2, 5])).toBe("2 · 5");
    expect(ttlLabel([])).toBe("");
  });
});
