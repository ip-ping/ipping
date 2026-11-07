"use client";

import { useMemo } from "react";

import { Panel } from "@/components/panel";
import { NetworkMap, type MapNode } from "@/components/viz/network-map";
import { useNodes } from "@/features/nodes/use-nodes";
import { place } from "@/lib/format";

/** Every approved node on the map, live: a station that pulses while the node is connected. */
export function FleetMap({ className }: { className?: string }) {
  const { nodes } = useNodes(8_000);
  const placed = useMemo<MapNode[]>(
    () =>
      (nodes ?? [])
        .filter((n) => n.latitude != null && n.longitude != null)
        .map((n) => ({
          id: n.id,
          name: n.name,
          place: place(n),
          lat: n.latitude as number,
          lon: n.longitude as number,
          online: n.online,
          note: n.online ? n.kinds.join(" · ") : undefined,
        })),
    [nodes],
  );
  const live = placed.filter((n) => n.online).length;
  const countries = new Set((nodes ?? []).filter((n) => n.online).map((n) => n.country).filter(Boolean)).size;

  return (
    <Panel
      className={className}
      label="The fleet"
      meta={
        <>
          <span className="num normal-case tracking-normal">{live} live</span>
          <span className="num hidden normal-case tracking-normal sm:inline">{countries} countries</span>
        </>
      }
      flush
    >
      <NetworkMap
        nodes={placed}
        scan
        label={`Map of the ${placed.length} measurement nodes, ${live} of them connected now`}
        className="px-1 pt-1 sm:px-3 sm:pt-2"
      />
      <div className="label flex flex-wrap items-center gap-x-5 gap-y-1 border-t px-3 py-2">
        <span className="inline-flex items-center gap-2">
          <span className="size-2 rounded-full bg-foreground" /> connected
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="size-2 rounded-full border border-foreground/50" /> offline
        </span>
        <span className="ml-auto hidden normal-case tracking-normal sm:inline">
          Hover a station for what it can run.
        </span>
      </div>
    </Panel>
  );
}
