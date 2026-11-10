"use client";

import { useMemo } from "react";

import { NetworkMap, type MapNode } from "@/components/viz/network-map";

import type { AsStop, Path, RouteMap } from "./route-geo";
import { ttlLabel } from "./route-geo";
import { Badge } from "@/components/ui/badge";

/** The networks the route crosses, in order: who carries the packets, at a glance. */
export function AsPathStrip({ stops, onActive }: { stops: AsStop[]; onActive: (ttl: number | null) => void }) {
  if (stops.length === 0) return null;
  return (
    <ol className="mb-3 flex flex-wrap items-center gap-x-1.5 gap-y-1.5" aria-label="Networks the route crosses, in order">
      {stops.map((stop, i) => (
        <li key={`${stop.asn}-${i}`} className="inline-flex items-center gap-1.5">
          <Badge
            variant="outline"
            className="h-7 gap-1.5 px-2 text-xs"
            onPointerEnter={() => onActive(stop.ttls[0])}
            onPointerLeave={() => onActive(null)}
          >
            <span className="tabular-nums font-semibold text-foreground">AS{stop.asn}</span>
            {stop.org && <span className="max-w-[12rem] truncate">{stop.org}</span>}
            <span className="tabular-nums text-muted-foreground">hop {ttlLabel(stop.ttls)}</span>
          </Badge>
          {i < stops.length - 1 && (
            <span aria-hidden className="text-muted-foreground">
              →
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

/**
 * The route on the map: the node it started from, then every stop a GeoIP database places. A router's
 * registered place is only a hint (routers are often registered at their owner's headquarters), so one that
 * light could not have reached in the time it took to answer is left off and counted below the map.
 */
export function RouteMapSection({
  station,
  path,
  route,
  activeTtl,
  onActive,
  label,
}: {
  station: MapNode | null;
  path: Path | null;
  route: RouteMap;
  activeTtl: number | null;
  onActive: (ttl: number | null) => void;
  label: string;
}) {
  const stations = useMemo(() => (station ? [station] : []), [station]);
  const stops = useMemo(() => route.points.map((p) => ({ key: p.key, lat: p.lat, lon: p.lon, place: p.place, ttls: p.ttls, label: ttlLabel(p.ttls) })), [route.points]);

  if (!path) return null;
  const databases = path.city_database || path.asn_database;
  if (!databases) {
    return (
      <p className="text-xs text-muted-foreground mt-3">
        No GeoIP database is loaded on this service, so the networks and places of the routers are not shown. The administrator can add one.
      </p>
    );
  }
  return (
    <div className="mt-4 space-y-2 border-t pt-4">
      {station && stops.length > 0 ? (
        <NetworkMap
          className="mx-auto max-w-4xl"
          nodes={stations}
          route={{ fromId: station.id, stops, activeTtl, onStop: onActive }}
          label={label}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          {path.city_database
            ? "None of the routers on this route could be placed on the map."
            : "Only the networks are known (there is no city database), so the route is not drawn on the map."}
        </p>
      )}
      {stops.length > 0 && (
        <ol className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Where the route passes">
          {route.points.map((p) => (
            <li
              key={p.key}
              className="text-xs text-muted-foreground"
              onPointerEnter={() => onActive(p.ttls[0])}
              onPointerLeave={() => onActive(null)}
            >
              <span className="tabular-nums font-semibold text-foreground">{ttlLabel(p.ttls)}</span> {p.place}
            </li>
          ))}
        </ol>
      )}
      <p className="text-xs text-muted-foreground">
        Places come from {path.source ?? "a GeoIP database"} and are only a hint: routers are often registered at their owner&apos;s headquarters.
        {route.impossible.length > 0 &&
          ` ${route.impossible.length} ${route.impossible.length === 1 ? "router is" : "routers are"} left off the map because light could not have travelled from the node to the registered place and back in the time it answered (${route.impossible
            .map((r) => `hop ${r.ttl}, registered in ${r.place || "an unknown place"}`)
            .join("; ")}).`}
        {route.unplaced > 0 && ` ${route.unplaced} ${route.unplaced === 1 ? "router has" : "routers have"} no place in the database.`}
      </p>
      {path.attribution && <p className="text-xs text-muted-foreground">{path.attribution}</p>}
    </div>
  );
}
