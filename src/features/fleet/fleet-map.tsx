"use client";

import { useMemo } from "react";

import { Panel } from "@/components/panel";
import { NetworkMap, type MapNode } from "@/components/viz/network-map";
import { Button } from "@/components/ui/button";
import { KIND_INFO } from "@/features/measurements/kinds";
import { useSelection } from "@/features/measurements/selection";
import { useNodes } from "@/features/nodes/use-nodes";
import { place } from "@/lib/format";

/**
 * Every approved node on the map, live: a station that pulses while the node is connected. It is also
 * where you choose who measures: click stations (or shift-drag over a region) and only those run the
 * next measurement. A node that cannot run the chosen kind is drawn faint and cannot be picked.
 */
export function FleetMap({ className }: { className?: string }) {
  const { nodes } = useNodes(8_000);
  const { kind, scope, selected, toggle, pick, clear } = useSelection();
  const placed = useMemo<MapNode[]>(
    () =>
      (nodes ?? [])
        .filter((n) => n.latitude != null && n.longitude != null)
        .map((n) => {
          const capable = n.kinds.includes(kind);
          return {
            id: n.id,
            name: n.name,
            place: place(n),
            lat: n.latitude as number,
            lon: n.longitude as number,
            online: n.online,
            disabled: n.online && !capable,
            note: !n.online ? undefined : capable ? n.kinds.join(" · ") : `cannot run ${KIND_INFO[kind].label} yet`,
          };
        }),
    [nodes, kind],
  );
  const live = placed.filter((n) => n.online).length;
  const countries = new Set((nodes ?? []).filter((n) => n.online).map((n) => n.country).filter(Boolean)).size;
  const chosen = scope === "selected" ? selected : undefined;

  return (
    <Panel
      className={className}
      label="The fleet"
      meta={
        <>
          <span className="num normal-case tracking-normal">
            {chosen ? `${chosen.size} chosen of ${live}` : `${live} live`}
          </span>
          <span className="num hidden normal-case tracking-normal sm:inline">{countries} countries</span>
        </>
      }
      flush
    >
      <NetworkMap
        nodes={placed}
        scan
        marked={chosen}
        onSelect={(id) => id && toggle(id)}
        onBox={pick}
        label={`Map of the ${placed.length} measurement nodes, ${live} of them connected now. Click a station to choose where to measure from.`}
        className="px-1 pt-1 sm:px-3 sm:pt-2"
      />
      <div className="label flex flex-wrap items-center gap-x-5 gap-y-1 border-t px-3 py-2">
        <span className="inline-flex items-center gap-2">
          <span className="size-2 rounded-full bg-foreground" /> connected
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="size-2 rounded-full border border-foreground/50" /> offline
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="size-2.5 border border-signal bg-signal-soft" /> chosen
        </span>
        {chosen ? (
          <Button type="button" variant="ghost" size="sm" onClick={clear} className="h-6 px-2 text-[0.65rem]">
            Use all nodes
          </Button>
        ) : (
          <span className="ml-auto hidden normal-case tracking-normal sm:inline">
            Click stations to choose where to measure from; shift-drag picks a region.
          </span>
        )}
      </div>
    </Panel>
  );
}
