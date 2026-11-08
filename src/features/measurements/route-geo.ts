import type { Hop } from "@/components/viz/route-ladder";
import type { Schemas } from "@/lib/api/client";
import { distanceKm, KM_PER_RTT_MS_MAX } from "@/lib/geo/project";

export type Path = Schemas["PathOut"];
export type HopPlace = Schemas["HopPlaceOut"];

/** Slack on the speed-of-light limit for the databases' own rounding of a place, as the backend allows too. */
export const PLACE_TOLERANCE_KM = 60;

export type RoutePoint = {
  /** Stable key: the position, rounded. */
  key: string;
  lat: number;
  lon: number;
  place: string;
  /** The hops that sit here, in order (several routers in one city are one stop). */
  ttls: number[];
};

export type RouteMap = {
  /** Where the route passes, in order, from the first router that can be placed. */
  points: RoutePoint[];
  /** Routers whose registered place is further from the node than light could go in their round trip. */
  impossible: { ttl: number; ip: string; place: string; distanceKm: number; maxKm: number }[];
  /** Routers with a public address that the database does not place at all. */
  unplaced: number;
};

export function placeRoute(hops: Hop[], path: Path | null | undefined, origin: { lat: number; lon: number } | null): RouteMap {
  const out: RouteMap = { points: [], impossible: [], unplaced: 0 };
  if (!path) return out;
  const known = path.hops ?? {};
  for (const hop of hops) {
    if (!hop.ip) continue;
    const place = known[hop.ip];
    if (!place || place.latitude == null || place.longitude == null) {
      out.unplaced += 1;
      continue;
    }
    const best = hop.rtts.length ? Math.min(...hop.rtts) : null;
    if (origin && best != null) {
      const far = distanceKm(origin.lat, origin.lon, place.latitude, place.longitude);
      const maxKm = best * KM_PER_RTT_MS_MAX + PLACE_TOLERANCE_KM;
      if (far > maxKm) {
        out.impossible.push({ ttl: hop.ttl, ip: hop.ip, place: place.place ?? "", distanceKm: far, maxKm });
        continue;
      }
    }
    const key = `${place.latitude.toFixed(1)},${place.longitude.toFixed(1)}`;
    const last = out.points.at(-1);
    if (last && last.key === key) last.ttls.push(hop.ttl);
    else out.points.push({ key, lat: place.latitude, lon: place.longitude, place: place.place ?? "", ttls: [hop.ttl] });
  }
  return out;
}

export type AsStop = { asn: number; org: string; ttls: number[] };

/** The networks the route crosses, in order: consecutive routers of one network are a single stop. */
export function asPath(hops: Hop[], path: Path | null | undefined): AsStop[] {
  const out: AsStop[] = [];
  if (!path) return out;
  const known = path.hops ?? {};
  for (const hop of hops) {
    const place = hop.ip ? known[hop.ip] : undefined;
    const asn = place?.asn;
    if (place == null || asn == null) continue;
    const last = out.at(-1);
    if (last && last.asn === asn) last.ttls.push(hop.ttl);
    else out.push({ asn, org: place.as_org ?? "", ttls: [hop.ttl] });
  }
  return out;
}

/** "AS1299 Arelion", or just "AS1299" when the organisation is not known. */
export function networkName(place: HopPlace | undefined): string | undefined {
  if (!place || place.asn == null) return undefined;
  return place.as_org ? `AS${place.asn} ${place.as_org}` : `AS${place.asn}`;
}

/** The hops at one stop: "4", "2–4" for consecutive ones, "2 · 5" otherwise. */
export function ttlLabel(ttls: number[]): string {
  if (ttls.length === 0) return "";
  const sorted = [...ttls].sort((a, b) => a - b);
  if (sorted.length === 1) return String(sorted[0]);
  const consecutive = sorted.every((t, i) => i === 0 || t === sorted[i - 1] + 1);
  return consecutive ? `${sorted[0]}–${sorted.at(-1)}` : sorted.join(" · ");
}
