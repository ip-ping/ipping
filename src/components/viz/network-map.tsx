"use client";

import { useId, useMemo, useState } from "react";

import { circlePath, KM_PER_RTT_MS, KM_PER_RTT_MS_MAX, px, py } from "@/lib/geo/project";
import { WORLD_PATH } from "@/lib/geo/world-path";
import { useTween } from "@/lib/use-tween";
import { cn } from "@/lib/utils";

export type MapNode = {
  id: string;
  name: string;
  place?: string;
  lat: number;
  lon: number;
  online?: boolean;
  /** What this node is doing now: `running` pulses in the signal colour. */
  state?: "idle" | "running" | "done" | "failed";
  /** Its best round trip to the target so far, in milliseconds: the radius of its ring. */
  ms?: number | null;
  /** Goes up with every sample the node reports; each increase sends one pulse out of the station. */
  pulses?: number;
  /** One more line for the tooltip. */
  note?: string;
  /** The station's fill, for a map that colours nodes by what they found (DNS answers). */
  color?: string;
};

export type MapPlace = { lat: number; lon: number; label: string };

// The map's own frame: the world (x 0..360, y 6..148) plus a margin for the axis labels.
const VIEW = { x: -9, y: 0, w: 378, h: 152 };
const LAT_TOP = 6;
const LAT_SPAN = 142;
/** A ring wider than this covers most of the planet and rules nothing out, so it is not drawn. */
export const MAX_RING_KM = 8000;

/**
 * The world as a survey sheet, drawn in SVG with no library and nothing fetched: dotted land, a graticule,
 * each node as a station that pulses while it is live, and, when `rings` is on, a ring around every node
 * showing how far its best round trip could reach. Where the rings overlap is where the target is.
 */
export function NetworkMap({
  nodes,
  rings = false,
  target,
  alternatives = [],
  selectedId = null,
  activeId = null,
  onSelect,
  onHover,
  scan = false,
  className,
  label,
}: {
  nodes: MapNode[];
  rings?: boolean;
  target?: MapPlace | null;
  alternatives?: MapPlace[];
  /** The station that is pinned (a click). */
  selectedId?: string | null;
  /** A station highlighted from outside, by pointing at its row in a chart or the table. */
  activeId?: string | null;
  onSelect?: (id: string | null) => void;
  /** Told which station the pointer is on, so the rest of the page can light the same node. */
  onHover?: (id: string | null) => void;
  scan?: boolean;
  className?: string;
  label: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [hover, setHover] = useState<string | null>(null);
  const active = hover ?? activeId ?? selectedId;
  const activeNode = nodes.find((n) => n.id === active) ?? null;
  const ordered = useMemo(
    () => [...nodes].sort((a, b) => Number(a.id === active) - Number(b.id === active)),
    [nodes, active],
  );

  return (
    <figure className={cn("relative m-0", className)}>
      <svg
        viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`}
        role="img"
        aria-label={label}
        className="block h-auto w-full select-none"
        onPointerLeave={() => {
          setHover(null);
          onHover?.(null);
        }}
      >
        <defs>
          <pattern id={`dots${uid}`} width="2.3" height="2.3" patternUnits="userSpaceOnUse">
            <circle cx="1.15" cy="1.15" r="0.46" fill="var(--land)" />
          </pattern>
          <linearGradient id={`trail${uid}`} x1="0" x2="1">
            <stop offset="0" stopColor="var(--signal)" stopOpacity="0" />
            <stop offset="1" stopColor="var(--signal)" stopOpacity="0.13" />
          </linearGradient>
          <clipPath id={`world${uid}`}>
            <rect x="0" y={LAT_TOP} width="360" height={LAT_SPAN} />
          </clipPath>
        </defs>

        {/* the sheet */}
        <rect x="0" y={LAT_TOP} width="360" height={LAT_SPAN} fill="var(--ocean)" />
        <Graticule />
        <path d={WORLD_PATH} fill={`url(#dots${uid})`} />
        <path
          d={WORLD_PATH}
          fill="none"
          stroke="var(--land-edge)"
          strokeWidth="0.9"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        {scan && (
          <g clipPath={`url(#world${uid})`} aria-hidden>
            <g className="scan-line">
              <rect x="-14" y={LAT_TOP} width="14" height={LAT_SPAN} fill={`url(#trail${uid})`} />
              <rect x="0" y={LAT_TOP} width="0.5" height={LAT_SPAN} fill="var(--signal)" opacity="0.55" />
            </g>
          </g>
        )}

        {/* how far each round trip could reach */}
        {rings &&
          ordered.map((n) =>
            n.ms && n.ms * KM_PER_RTT_MS <= MAX_RING_KM ? (
              <Ring key={n.id} node={n} emphasised={n.id === active} dimmed={active !== null && n.id !== active} />
            ) : null,
          )}

        {alternatives.map((a) => (
          <g key={`${a.label}${a.lat}`} transform={`translate(${px(a.lon)} ${py(a.lat)})`}>
            <circle r="3" fill="none" stroke="var(--foreground)" strokeOpacity="0.55" strokeWidth="0.9" strokeDasharray="1.4 1.4" vectorEffect="non-scaling-stroke" />
            <title>{`Also fits: ${a.label}`}</title>
          </g>
        ))}

        {target && <Target place={target} />}

        {ordered.map((n, i) => (
          <Station
            key={n.id}
            node={n}
            index={i}
            active={n.id === active}
            selected={n.id === selectedId}
            onHover={(id) => {
              setHover(id);
              onHover?.(id);
            }}
            onSelect={onSelect}
          />
        ))}
      </svg>

      {activeNode && <Tooltip node={activeNode} />}
    </figure>
  );
}

function Graticule() {
  const meridians = [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150];
  const parallels = [-60, -30, 0, 30, 60];
  return (
    <g aria-hidden fill="none" stroke="var(--graticule)" strokeWidth="1" vectorEffect="non-scaling-stroke">
      {meridians.map((lon) => (
        <line key={lon} x1={px(lon)} x2={px(lon)} y1={LAT_TOP} y2={LAT_TOP + LAT_SPAN} vectorEffect="non-scaling-stroke" />
      ))}
      {parallels.map((lat) => (
        <line key={lat} x1="0" x2="360" y1={py(lat)} y2={py(lat)} vectorEffect="non-scaling-stroke" strokeOpacity={lat === 0 ? 1.8 : 1} />
      ))}
      <rect x="0" y={LAT_TOP} width="360" height={LAT_SPAN} stroke="var(--foreground)" strokeOpacity="0.35" vectorEffect="non-scaling-stroke" />
      <g fill="var(--muted-foreground)" stroke="none" fontFamily="var(--font-data), monospace" fontSize="2.9" letterSpacing="0.05em">
        {meridians.map((lon) => (
          <text key={lon} x={px(lon)} y={LAT_TOP - 1.6} textAnchor="middle">
            {lon === 0 ? "0°" : `${Math.abs(lon)}°${lon < 0 ? "W" : "E"}`}
          </text>
        ))}
        {parallels.map((lat) => (
          <text key={lat} x="-1.8" y={py(lat) + 1} textAnchor="end">
            {lat === 0 ? "0°" : `${Math.abs(lat)}°${lat < 0 ? "S" : "N"}`}
          </text>
        ))}
      </g>
    </g>
  );
}

function Ring({ node, emphasised, dimmed }: { node: MapNode; emphasised: boolean; dimmed: boolean }) {
  const km = useTween((node.ms ?? 0) * KM_PER_RTT_MS);
  const limit = useTween((node.ms ?? 0) * KM_PER_RTT_MS_MAX);
  const typical = useMemo(() => circlePath(node.lat, node.lon, km), [node.lat, node.lon, km]);
  const hard = useMemo(
    () => (emphasised ? circlePath(node.lat, node.lon, limit) : null),
    [emphasised, node.lat, node.lon, limit],
  );
  const opacity = dimmed ? 0.16 : emphasised ? 1 : 0.5;
  return (
    <g aria-hidden pointerEvents="none">
      {hard && (
        <path d={hard.d} fill="none" stroke="var(--foreground)" strokeOpacity="0.35" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      )}
      <path
        d={typical.d}
        fill={typical.wraps ? "none" : "var(--signal)"}
        fillOpacity={dimmed ? 0.01 : emphasised ? 0.09 : 0.03}
        stroke="var(--signal)"
        strokeOpacity={opacity}
        strokeWidth={emphasised ? 1.9 : 1.2}
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
}

function Target({ place }: { place: MapPlace }) {
  const x = px(place.lon);
  const y = py(place.lat);
  return (
    <g transform={`translate(${x} ${y})`} pointerEvents="none">
      <circle r="2.2" fill="none" stroke="var(--signal)" strokeWidth="0.5" className="ring-out" />
      <circle r="2.1" fill="var(--card)" fillOpacity="0.55" stroke="var(--signal)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      <path d="M-5.2 0H-2.9M2.9 0H5.2M0 -5.2V-2.9M0 2.9V5.2" stroke="var(--signal)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      <circle r="0.7" fill="var(--signal)" />
      <text
        x={x > 300 ? -6.5 : 6.5}
        y="1"
        textAnchor={x > 300 ? "end" : "start"}
        fontFamily="var(--font-data), monospace"
        fontSize="3.2"
        fontWeight="600"
        fill="var(--foreground)"
        stroke="var(--card)"
        strokeWidth="1.1"
        paintOrder="stroke"
        letterSpacing="0.04em"
      >
        {place.label.toUpperCase()}
      </text>
    </g>
  );
}

function Station({
  node,
  index,
  active,
  selected,
  onHover,
  onSelect,
}: {
  node: MapNode;
  index: number;
  active: boolean;
  selected: boolean;
  onHover: (id: string | null) => void;
  onSelect?: (id: string | null) => void;
}) {
  const live = node.online !== false;
  const running = node.state === "running";
  const failed = node.state === "failed";
  const painted = node.color !== undefined;
  const hollow = !live || node.color === "none";
  const fill = hollow ? "none" : failed ? "var(--critical)" : running ? "var(--signal)" : (node.color ?? "var(--foreground)");
  return (
    <g
      transform={`translate(${px(node.lon)} ${py(node.lat)})`}
      tabIndex={0}
      role="button"
      aria-label={`${node.name}${node.place ? `, ${node.place}` : ""}${live ? "" : ", offline"}`}
      aria-pressed={selected}
      className="cursor-pointer outline-none [&:focus-visible_.focus]:opacity-100"
      onPointerEnter={() => onHover(node.id)}
      onPointerLeave={() => onHover(null)}
      onFocus={() => onHover(node.id)}
      onBlur={() => onHover(null)}
      onClick={() => onSelect?.(selected ? null : node.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect?.(selected ? null : node.id);
        }
      }}
    >
      <title>{node.name}</title>
      {/* a live station sends a slow ring out, a busy one a faster signal-coloured one */}
      {live && (
        <circle
          r="2.4"
          fill="none"
          stroke={running ? "var(--signal)" : "var(--foreground)"}
          strokeWidth="0.6"
          className="ring-out"
          style={{ animationDelay: `${(index * 0.43) % 3.6}s`, animationDuration: running ? "1.8s" : undefined }}
        />
      )}
      {!!node.pulses && (
        <circle key={node.pulses} r="1.6" fill="none" stroke="var(--signal)" strokeWidth="0.9" className="sample-ring" />
      )}
      <circle r="4.5" fill="transparent" />
      <circle
        className="focus"
        r="3.6"
        fill="none"
        stroke="var(--ring)"
        strokeWidth="1.4"
        vectorEffect="non-scaling-stroke"
        opacity={0}
      />
      {(active || selected) && (
        <circle r="3" fill="none" stroke="var(--signal)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      )}
      <circle
        r={(painted ? 2.1 : 1.2) + (active ? 0.3 : 0)}
        fill={fill}
        stroke={hollow ? "var(--foreground)" : "var(--card)"}
        strokeOpacity={hollow ? 0.5 : 1}
        strokeWidth={hollow ? 0.45 : painted ? 0.6 : 0.5}
      />
    </g>
  );
}

function Tooltip({ node }: { node: MapNode }) {
  const left = ((px(node.lon) - VIEW.x) / VIEW.w) * 100;
  const top = ((py(node.lat) - VIEW.y) / VIEW.h) * 100;
  const align = left < 18 ? "translate-x-0" : left > 82 ? "-translate-x-full" : "-translate-x-1/2";
  const flip = top < 22;
  return (
    <div
      role="status"
      className={cn(
        "pointer-events-none absolute z-10 w-max max-w-[16rem] border border-foreground/30 bg-popover px-2.5 py-1.5 text-popover-foreground shadow-[3px_3px_0_0_var(--ink-faint)]",
        align,
        flip ? "mt-3" : "-mt-3 -translate-y-full",
      )}
      style={{ left: `${left}%`, top: `${top}%` }}
    >
      <div className="figure text-sm font-semibold tracking-[-0.01em]">{node.name}</div>
      {node.place && <div className="label normal-case tracking-normal">{node.place}</div>}
      <div className="label mt-1 flex items-center gap-2 text-foreground">
        <span
          className={cn(
            "size-1.5 rounded-full",
            node.online === false ? "bg-muted-foreground/60" : node.state === "failed" ? "bg-critical" : node.state === "running" ? "bg-signal" : "bg-good",
          )}
        />
        {node.online === false ? "offline" : node.state === "running" ? "measuring" : node.state === "failed" ? "no answer" : node.state === "done" ? "done" : "live"}
        {node.ms != null && <span className="num tracking-normal">{node.ms < 100 ? node.ms.toFixed(1) : Math.round(node.ms)} ms</span>}
      </div>
      {node.note && <div className="label mt-0.5 normal-case tracking-normal">{node.note}</div>}
    </div>
  );
}
