"use client";

import { useMemo, useState } from "react";

import { circlePath, KM_PER_RTT_MS, KM_PER_RTT_MS_MAX, px, py, routeSegment } from "@/lib/geo/project";
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
  /** What this node is doing now: `running` pulses. */
  state?: "idle" | "running" | "done" | "failed";
  /** Its best round trip to the target so far, in milliseconds: the radius of its ring. */
  ms?: number | null;
  /** Goes up with every sample the node reports; each increase sends one pulse out of the station. */
  pulses?: number;
  /** One more line for the tooltip. */
  note?: string;
  /** The station's fill, for a map that colours nodes by what they found (DNS answers). */
  color?: string;
  /** Drawn faint and not clickable: a node that cannot take part (it cannot run the chosen kind). */
  disabled?: boolean;
};

export type MapPlace = { lat: number; lon: number; label: string };

/** A place someone else claims (a GeoIP database): a dashed diamond, struck through when the measurements rule it out. */
export type MapClaim = MapPlace & { ruledOut: boolean };

/** Where a node's traceroute passes: a line from its station through each stop, with the hops at each stop numbered. */
export type MapRoute = {
  fromId: string;
  stops: { key: string; lat: number; lon: number; label: string; place: string; ttls: number[] }[];
  /** The hop being looked at elsewhere (the ladder): its stop lights up. */
  activeTtl?: number | null;
  /** Told which hop the pointer is on, so the ladder can follow. */
  onStop?: (ttl: number | null) => void;
};

/** Two stations whose answers cannot both be true: drawn joined by a dashed line, their light limits shown. */
export type MapConflict = { a: string; b: string; label: string };

// The map's own frame: the world (x 0..360, y 6..148) plus a margin for the axis labels.
const VIEW = { x: -9, y: 0, w: 378, h: 152 };
const LAT_TOP = 6;
const LAT_SPAN = 142;
/** A ring wider than this covers most of the planet and rules nothing out, so it is not drawn. */
export const MAX_RING_KM = 8000;

/**
 * The world drawn in SVG with no library and nothing fetched, in the theme's own colours (muted land on a muted
 * sheet, `primary` for the data, `destructive` for what failed): each node is a station, a busy one pulses, and,
 * when `rings` is on, a ring around every node shows how far its best round trip could reach. Where the rings
 * overlap is where the target is.
 */
/** Where a pointer event is in the map's own coordinates (longitude + 180, 90 - latitude). */
function userPoint(e: React.PointerEvent<SVGSVGElement>): { x: number; y: number } | null {
  const svg = e.currentTarget;
  const matrix = svg.getScreenCTM();
  if (!matrix) return null;
  const point = svg.createSVGPoint();
  point.x = e.clientX;
  point.y = e.clientY;
  const at = point.matrixTransform(matrix.inverse());
  return { x: at.x, y: at.y };
}

export function NetworkMap({
  nodes,
  rings = false,
  target,
  alternatives = [],
  selectedId = null,
  activeId = null,
  onSelect,
  onHover,
  marked,
  onBox,
  conflict,
  claim,
  route,
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
  /** Stations that are chosen (a square around each); a click then asks `onSelect` to toggle it. */
  marked?: ReadonlySet<string>;
  /** Shift-drag a rectangle: told which stations are inside it, and whether to add to the selection. */
  onBox?: (ids: string[], additive: boolean) => void;
  conflict?: MapConflict | null;
  claim?: MapClaim | null;
  route?: MapRoute | null;
  className?: string;
  label: string;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const [box, setBox] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
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
        className={cn("block h-auto w-full select-none", onBox && "touch-pan-y")}
        onPointerLeave={() => {
          setHover(null);
          onHover?.(null);
        }}
        onPointerDown={(e) => {
          if (!onBox || !e.shiftKey || e.button !== 0) return;
          const at = userPoint(e);
          if (!at) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          setBox({ x0: at.x, y0: at.y, x1: at.x, y1: at.y });
        }}
        onPointerMove={(e) => {
          if (!box) return;
          const at = userPoint(e);
          if (at) setBox({ ...box, x1: at.x, y1: at.y });
        }}
        onPointerUp={(e) => {
          if (!box) return;
          const [xa, xb] = [Math.min(box.x0, box.x1), Math.max(box.x0, box.x1)];
          const [ya, yb] = [Math.min(box.y0, box.y1), Math.max(box.y0, box.y1)];
          setBox(null);
          if (xb - xa < 2 && yb - ya < 2) return; // a click, not a drag
          const inside = nodes.filter(
            (n) => !n.disabled && n.online !== false && px(n.lon) >= xa && px(n.lon) <= xb && py(n.lat) >= ya && py(n.lat) <= yb,
          );
          onBox?.(inside.map((n) => n.id), e.ctrlKey || e.metaKey);
        }}
        onPointerCancel={() => setBox(null)}
      >
        {/* the sheet: a muted field with flat land on it */}
        <rect x="0" y={LAT_TOP} width="360" height={LAT_SPAN} rx="2" fill="var(--muted)" fillOpacity="0.5" />
        <Graticule />
        <path d={WORLD_PATH} fill="var(--muted-foreground)" fillOpacity="0.22" />
        <path
          d={WORLD_PATH}
          fill="none"
          stroke="var(--muted-foreground)"
          strokeOpacity="0.5"
          strokeWidth="0.7"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <rect x="0" y={LAT_TOP} width="360" height={LAT_SPAN} rx="2" fill="none" stroke="var(--border)" vectorEffect="non-scaling-stroke" />

        {/* how far each round trip could reach */}
        {rings &&
          ordered.map((n) =>
            n.ms && n.ms * KM_PER_RTT_MS <= MAX_RING_KM ? (
              <Ring
                key={n.id}
                node={n}
                emphasised={n.id === active || n.id === conflict?.a || n.id === conflict?.b}
                dimmed={active !== null && n.id !== active && n.id !== conflict?.a && n.id !== conflict?.b}
              />
            ) : null,
          )}

        {conflict && <ConflictLine nodes={nodes} conflict={conflict} />}

        {route && <RouteTrail nodes={nodes} route={route} />}

        {alternatives.map((a) => (
          <g key={`${a.label}${a.lat}`} transform={`translate(${px(a.lon)} ${py(a.lat)})`}>
            <circle r="3" fill="none" stroke="var(--muted-foreground)" strokeWidth="0.9" strokeDasharray="1.4 1.4" vectorEffect="non-scaling-stroke" />
            <title>{`Also fits: ${a.label}`}</title>
          </g>
        ))}

        {claim && <Claim claim={claim} />}

        {target && <Target place={target} />}

        {box && (
          <rect
            x={Math.min(box.x0, box.x1)}
            y={Math.min(box.y0, box.y1)}
            width={Math.abs(box.x1 - box.x0)}
            height={Math.abs(box.y1 - box.y0)}
            fill="var(--primary)"
            fillOpacity="0.08"
            stroke="var(--primary)"
            strokeWidth="1.2"
            strokeDasharray="3 2"
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        )}

        {/* in a stable order: re-ordering the DOM under the pointer would swallow a quick click or tap */}
        {nodes.map((n) => (
          <Station
            key={n.id}
            node={n}
            active={n.id === active}
            selected={n.id === selectedId}
            marked={marked?.has(n.id) ?? false}
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

function RouteTrail({ nodes, route }: { nodes: MapNode[]; route: MapRoute }) {
  const from = nodes.find((n) => n.id === route.fromId);
  if (!from) return null;
  const start = { x: px(from.lon), y: py(from.lat) };
  const points = [start, ...route.stops.map((s) => ({ x: px(s.lon), y: py(s.lat) }))];
  const d = points
    .slice(1)
    .map((p, i) => routeSegment(points[i].x, points[i].y, p.x, p.y))
    .join("");
  return (
    <g>
      <path d={d} fill="none" stroke="var(--primary)" strokeOpacity="0.8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" pointerEvents="none" aria-hidden />
      {route.stops.map((stop, i) => {
        const lit = route.activeTtl != null && stop.ttls.includes(route.activeTtl);
        const x = points[i + 1].x;
        const y = points[i + 1].y;
        return (
          <g
            key={stop.key}
            transform={`translate(${x} ${y})`}
            onPointerEnter={() => route.onStop?.(stop.ttls[0])}
            onPointerLeave={() => route.onStop?.(null)}
          >
            <circle r="4.5" fill="transparent" />
            <circle
              r={lit ? 2.7 : 1.9}
              fill={lit ? "var(--primary)" : "var(--card)"}
              stroke="var(--primary)"
              strokeWidth="1.8"
              vectorEffect="non-scaling-stroke"
            />
            <text
              y={-3.4}
              textAnchor="middle"
              fontFamily="var(--font-sans)"
              fontSize="3"
              fontWeight="500"
              fill="var(--foreground)"
              stroke="var(--card)"
              strokeWidth="1.1"
              paintOrder="stroke"
              pointerEvents="none"
            >
              {stop.label}
            </text>
            <title>{`${stop.place || "Somewhere"}: hop ${stop.label}`}</title>
          </g>
        );
      })}
    </g>
  );
}

function Claim({ claim }: { claim: MapClaim }) {
  const x = px(claim.lon);
  const y = py(claim.lat);
  const left = x > 300;
  return (
    <g transform={`translate(${x} ${y})`} pointerEvents="none" aria-hidden>
      <path d="M0 -3.4L3.4 0L0 3.4L-3.4 0Z" fill="var(--card)" fillOpacity="0.6" stroke="var(--muted-foreground)" strokeWidth="1.4" strokeDasharray="2 1.6" vectorEffect="non-scaling-stroke" />
      {claim.ruledOut && <path d="M-5 5L5 -5" stroke="var(--destructive)" strokeWidth="1.8" vectorEffect="non-scaling-stroke" />}
      <text
        x={left ? -5.5 : 5.5}
        y="1"
        textAnchor={left ? "end" : "start"}
        fontFamily="var(--font-sans)"
        fontSize="3"
        fontWeight="500"
        fill="var(--foreground)"
        stroke="var(--card)"
        strokeWidth="1.1"
        paintOrder="stroke"
      >
        {claim.label}
      </text>
    </g>
  );
}

function ConflictLine({ nodes, conflict }: { nodes: MapNode[]; conflict: MapConflict }) {
  const a = nodes.find((n) => n.id === conflict.a);
  const b = nodes.find((n) => n.id === conflict.b);
  if (!a || !b) return null;
  const [x1, y1, x2, y2] = [px(a.lon), py(a.lat), px(b.lon), py(b.lat)];
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  return (
    <g aria-hidden pointerEvents="none">
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--destructive)" strokeWidth="1.8" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
      <text
        x={mx}
        y={my - 1.8}
        textAnchor="middle"
        fontFamily="var(--font-sans)"
        fontSize="3.1"
        fontWeight="500"
        fill="var(--foreground)"
        stroke="var(--card)"
        strokeWidth="1.1"
        paintOrder="stroke"
      >
        {conflict.label}
      </text>
    </g>
  );
}

function Graticule() {
  const meridians = [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150];
  const parallels = [-60, -30, 0, 30, 60];
  return (
    <g aria-hidden fill="none" stroke="var(--border)" strokeWidth="1" vectorEffect="non-scaling-stroke">
      {meridians.map((lon) => (
        <line key={lon} x1={px(lon)} x2={px(lon)} y1={LAT_TOP} y2={LAT_TOP + LAT_SPAN} strokeDasharray="1 3" vectorEffect="non-scaling-stroke" />
      ))}
      {parallels.map((lat) => (
        <line key={lat} x1="0" x2="360" y1={py(lat)} y2={py(lat)} strokeDasharray={lat === 0 ? undefined : "1 3"} vectorEffect="non-scaling-stroke" />
      ))}
      <g fill="var(--muted-foreground)" stroke="none" fontFamily="var(--font-sans)" fontSize="2.9">
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
        <path d={hard.d} fill="none" stroke="var(--muted-foreground)" strokeOpacity="0.6" strokeWidth="1" strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />
      )}
      <path
        d={typical.d}
        fill={typical.wraps ? "none" : "var(--primary)"}
        fillOpacity={dimmed ? 0.01 : emphasised ? 0.08 : 0.025}
        stroke="var(--primary)"
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
      <circle r="2.2" fill="none" stroke="var(--primary)" strokeWidth="0.5" className="ring-out" />
      <circle r="2.1" fill="var(--card)" fillOpacity="0.55" stroke="var(--primary)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      <path d="M-5.2 0H-2.9M2.9 0H5.2M0 -5.2V-2.9M0 2.9V5.2" stroke="var(--primary)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      <circle r="0.7" fill="var(--primary)" />
      <text
        x={x > 300 ? -6.5 : 6.5}
        y="1"
        textAnchor={x > 300 ? "end" : "start"}
        fontFamily="var(--font-sans)"
        fontSize="3.2"
        fontWeight="600"
        fill="var(--foreground)"
        stroke="var(--card)"
        strokeWidth="1.1"
        paintOrder="stroke"
      >
        {place.label}
      </text>
    </g>
  );
}

function Station({
  node,
  active,
  selected,
  marked,
  onHover,
  onSelect,
}: {
  node: MapNode;
  active: boolean;
  selected: boolean;
  marked: boolean;
  onHover: (id: string | null) => void;
  onSelect?: (id: string | null) => void;
}) {
  const live = node.online !== false;
  const running = node.state === "running";
  const failed = node.state === "failed";
  const painted = node.color !== undefined;
  const hollow = !live || node.color === "none";
  const fill = hollow ? "none" : failed ? "var(--destructive)" : (node.color ?? "var(--primary)");
  return (
    <g
      transform={`translate(${px(node.lon)} ${py(node.lat)})`}
      tabIndex={0}
      role="button"
      aria-label={`${node.name}${node.place ? `, ${node.place}` : ""}${live ? "" : ", offline"}`}
      aria-pressed={selected || marked}
      aria-disabled={node.disabled || undefined}
      className={cn("outline-none [&:focus-visible_.focus]:opacity-100", node.disabled ? "cursor-not-allowed opacity-35" : "cursor-pointer")}
      onPointerEnter={() => onHover(node.id)}
      onPointerLeave={() => onHover(null)}
      onFocus={() => onHover(node.id)}
      onBlur={() => onHover(null)}
      onClick={() => !node.disabled && onSelect?.(selected ? null : node.id)}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !node.disabled) {
          e.preventDefault();
          onSelect?.(selected ? null : node.id);
        }
      }}
    >
      <title>{node.name}</title>
      {/* only a busy station pulses: a map of idle ones is still */}
      {live && running && (
        <circle r="2.4" fill="none" stroke="var(--primary)" strokeWidth="0.6" className="ring-out" style={{ animationDuration: "1.8s" }} />
      )}
      {!!node.pulses && (
        <circle key={node.pulses} r="1.6" fill="none" stroke="var(--primary)" strokeWidth="0.9" className="sample-ring" />
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
      {marked && (
        <rect x="-3.4" y="-3.4" width="6.8" height="6.8" rx="1.4" fill="var(--primary)" fillOpacity="0.12" stroke="var(--primary)" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
      )}
      {(active || selected) && (
        <circle r="3" fill="none" stroke="var(--primary)" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
      )}
      <circle
        r={(painted ? 2.1 : 1.2) + (active ? 0.3 : 0)}
        fill={fill}
        stroke={hollow ? "var(--muted-foreground)" : "var(--card)"}
        strokeWidth={hollow ? 0.5 : painted ? 0.6 : 0.5}
      />
    </g>
  );
}

/** The same card a shadcn popover or hover card is: rounded, `bg-popover`, a hairline ring and a soft shadow. */
function Tooltip({ node }: { node: MapNode }) {
  const left = ((px(node.lon) - VIEW.x) / VIEW.w) * 100;
  const top = ((py(node.lat) - VIEW.y) / VIEW.h) * 100;
  const align = left < 18 ? "translate-x-0" : left > 82 ? "-translate-x-full" : "-translate-x-1/2";
  const flip = top < 22;
  const state =
    node.online === false ? "offline" : node.state === "running" ? "measuring" : node.state === "failed" ? "no answer" : node.state === "done" ? "done" : "live";
  return (
    <div
      role="status"
      className={cn(
        "pointer-events-none absolute z-10 w-max max-w-[16rem] rounded-lg bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md ring-1 ring-foreground/10",
        align,
        flip ? "mt-3" : "-mt-3 -translate-y-full",
      )}
      style={{ left: `${left}%`, top: `${top}%` }}
    >
      <div className="text-sm leading-none font-medium">{node.name}</div>
      {node.place && <div className="mt-1 text-muted-foreground">{node.place}</div>}
      <div className="mt-1.5 flex items-center gap-2">
        <span
          className={cn(
            "size-1.5 rounded-full",
            node.online === false
              ? "bg-muted-foreground/60"
              : node.state === "failed"
                ? "bg-destructive"
                : node.state === "running"
                  ? "animate-pulse bg-primary"
                  : "bg-good",
          )}
        />
        {state}
        {node.ms != null && <span className="text-muted-foreground tabular-nums">{node.ms < 100 ? node.ms.toFixed(1) : Math.round(node.ms)} ms</span>}
      </div>
      {node.note && <div className="mt-0.5 text-muted-foreground">{node.note}</div>}
    </div>
  );
}
