import type { LocationEstimate } from "@/features/location/use-location";
import { WORLD_PATH } from "@/lib/geo/world-path";

// The outline is in plain latitude/longitude, so a place sits at (lon + 180, 90 - lat).
const x = (lon: number) => lon + 180;
const y = (lat: number) => 90 - lat;

/**
 * A plain world overview drawn with SVG: the nodes that measured the target, the place the estimate
 * points at, and the other places that also fit. No map library, and nothing is fetched.
 */
export function WorldMap({ estimate }: { estimate: LocationEstimate }) {
  const used = estimate.evidence.filter((e) => e.used);
  const unused = estimate.evidence.filter((e) => !e.used);
  const likely = estimate.likely;
  const label = estimate.likely
    ? `Map of the nodes and the estimated location near ${estimate.likely.name}`
    : "Map of the nodes that measured the target";

  return (
    <figure className="space-y-2">
      <svg
        viewBox="0 6 360 142"
        role="img"
        aria-label={label}
        className="w-full rounded-md border bg-muted/30"
      >
        <path d={WORLD_PATH} className="fill-muted stroke-border" strokeWidth={0.25} />

        {likely &&
          used.slice(0, 4).map((node) => (
            <line
              key={`line-${node.node_id}`}
              x1={x(node.longitude)}
              y1={y(node.latitude)}
              x2={x(likely.longitude)}
              y2={y(likely.latitude)}
              className="stroke-muted-foreground/50"
              strokeWidth={0.35}
              strokeDasharray="1.5 1.5"
            />
          ))}

        {unused.map((node) => (
          <circle key={node.node_id} cx={x(node.longitude)} cy={y(node.latitude)} r={1.4} className="fill-muted-foreground/40">
            <title>{`${node.node_name}: ${node.rtt_ms} ms (not used: beyond the twelve nearest)`}</title>
          </circle>
        ))}
        {used.map((node) => (
          <circle key={node.node_id} cx={x(node.longitude)} cy={y(node.latitude)} r={1.8} className="fill-foreground stroke-background" strokeWidth={0.5}>
            <title>{`${node.node_name}: ${node.rtt_ms} ms${node.verified ? "" : " (position not verified)"}`}</title>
          </circle>
        ))}

        {estimate.alternatives.map((alt) => (
          <circle
            key={alt.place.name}
            cx={x(alt.place.longitude)}
            cy={y(alt.place.latitude)}
            r={3}
            className="fill-none stroke-muted-foreground"
            strokeWidth={0.7}
            strokeDasharray="1 1"
          >
            <title>{`Also fits: ${alt.place.name}, ${alt.place.country} (${alt.distance_km} km from the likely place)`}</title>
          </circle>
        ))}
        {likely && (
          <g>
            <circle cx={x(likely.longitude)} cy={y(likely.latitude)} r={4} className="fill-primary/25 stroke-primary" strokeWidth={0.8}>
              <title>{`Likely: ${likely.name}, ${likely.country}`}</title>
            </circle>
            <circle cx={x(likely.longitude)} cy={y(likely.latitude)} r={1.2} className="fill-primary" />
          </g>
        )}
      </svg>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-full bg-foreground" /> Node that measured
        </span>
        {likely && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-3 rounded-full border border-primary bg-primary/25" /> Likely area
          </span>
        )}
        {estimate.alternatives.length > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-3 rounded-full border border-dashed border-muted-foreground" /> Also fits
          </span>
        )}
      </figcaption>
    </figure>
  );
}
