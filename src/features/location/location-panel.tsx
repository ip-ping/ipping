"use client";

import { InfoIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { LocationEstimate } from "@/features/location/use-location";
import { ms } from "@/lib/format";

const STRENGTH_HELP =
  "A rule of thumb, not a probability or a radius for this answer. It rises with how close the nearest node was and how tightly the measurements agree. Checked on real measurements to known locations (random fleets of 4 to 32 nodes, held-out targets): strong answers were all within 300 km, 9 in 10 within 190 km; moderate ones 99% within 500 km; low ones about 3 in 4 within 1,000 km, with a tenth over 1,750 km off. Your own nodes may be spread differently, so treat these as a guide.";

function StrengthBadge({ strength }: { strength: NonNullable<LocationEstimate["strength"]> }) {
  const label = { low: "Low evidence", moderate: "Moderate evidence", strong: "Strong evidence" }[strength];
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="cursor-help" />}>
        <Badge variant={strength === "low" ? "outline" : strength === "moderate" ? "secondary" : "default"}>{label}</Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{STRENGTH_HELP}</TooltipContent>
    </Tooltip>
  );
}

function Details({ summary, children }: { summary: string; children: React.ReactNode }) {
  return (
    <details className="group min-w-0 border px-3 py-2 text-sm">
      <summary className="cursor-pointer select-none text-muted-foreground group-open:mb-2 group-open:text-foreground">
        {summary}
      </summary>
      {children}
    </details>
  );
}

function Evidence({ estimate }: { estimate: LocationEstimate }) {
  if (estimate.evidence.length === 0) return null;
  return (
    <Details summary={`Measurements used (${estimate.evidence.filter((e) => e.used).length} of ${estimate.evidence.length} nodes)`}>
      <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="text-muted-foreground">
          <tr>
            <th className="py-1 font-medium">Node</th>
            <th className="py-1 text-right font-medium">Smallest RTT</th>
            <th className="hidden py-1 text-right font-medium sm:table-cell">At most</th>
            <th className="hidden py-1 pl-3 font-medium sm:table-cell">Position</th>
          </tr>
        </thead>
        <tbody>
          {estimate.evidence.map((e) => (
            <tr key={e.node_id} className={e.used ? "" : "text-muted-foreground"}>
              <td className="py-1">
                {e.node_name}
                <div className="text-muted-foreground sm:hidden">
                  within {Math.round(e.rtt_ms * 150).toLocaleString()} km · {e.verified ? "verified" : "not verified"}
                  {e.used ? "" : " · not used"}
                </div>
              </td>
              <td className="py-1 text-right align-top tabular-nums">{ms(e.rtt_ms)} ms</td>
              <td className="hidden py-1 text-right tabular-nums sm:table-cell">{Math.round(e.rtt_ms * 150).toLocaleString()} km</td>
              <td className="hidden py-1 pl-3 sm:table-cell">{e.verified ? "verified" : "not verified"}{e.used ? "" : " · not used"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        “At most” is a physical limit: light cannot cover more distance than that in half the round-trip time.
      </p>
    </Details>
  );
}

function Limitations({ estimate }: { estimate: LocationEstimate }) {
  return (
    <Details summary="What this can and cannot tell you">
      <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
        {estimate.limitations.map((text) => (
          <li key={text}>{text}</li>
        ))}
        <li>
          Model {estimate.model_version}, checked on real measurements to targets of known location (how
          well it did, and where it does not, is in the backend README). Still experimental.
        </li>
      </ul>
    </Details>
  );
}

function Body({ estimate }: { estimate: LocationEstimate }) {
  if (estimate.status === "unavailable") {
    return <p className="text-sm text-muted-foreground">{estimate.summary}</p>;
  }

  if (estimate.status !== "estimated") {
    const title =
      estimate.status === "inconclusive" ? "A single location could not be established" : "Not enough evidence";
    return (
      <div className="space-y-4">
        <Alert>
          <InfoIcon />
          <AlertTitle>{title}</AlertTitle>
          <AlertDescription className="space-y-1">
            <p>{estimate.summary}</p>
            {estimate.warnings.map((w) => (
              <p key={w}>{w}</p>
            ))}
          </AlertDescription>
        </Alert>
        <Evidence estimate={estimate} />
        <Limitations estimate={estimate} />
      </div>
    );
  }

  const { likely, closest } = estimate;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="figure text-3xl font-semibold tracking-[-0.02em]">
          {likely?.name}, {likely?.country}
        </div>
        {estimate.strength && <StrengthBadge strength={estimate.strength} />}
      </div>
      <p className="text-sm text-muted-foreground">
        {closest && (
          <>
            The closest node, <strong className="text-foreground">{closest.node_name}</strong>, measured{" "}
            {ms(closest.rtt_ms)} ms. That puts the target within{" "}
            <strong className="text-foreground">{closest.max_distance_km.toLocaleString()} km</strong> of it (a physical
            limit), and typically within about {closest.typical_distance_km.toLocaleString()} km.
          </>
        )}
      </p>
      {estimate.alternatives.length > 0 && (
        <p className="text-sm">
          <span className="text-muted-foreground">Also fits: </span>
          {estimate.alternatives.map((a, i) => (
            <span key={a.place.name}>
              {i > 0 && ", "}
              {a.place.name}, {a.place.country}{" "}
              <span className="text-muted-foreground">({a.distance_km.toLocaleString()} km away)</span>
            </span>
          ))}
        </p>
      )}
      {estimate.warnings.length > 0 && (
        <Alert>
          <InfoIcon />
          <AlertTitle>Keep in mind</AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-0.5 pl-4">
              {estimate.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      <Evidence estimate={estimate} />
      <Limitations estimate={estimate} />
    </div>
  );
}

/**
 * The words of the location estimate: the place, how strong the evidence is, what else fits, and the
 * measurements behind it. The map above already shows where it is, with a ring per node.
 */
export function LocationPanel({
  estimate,
  error,
  finished,
}: {
  estimate: LocationEstimate | null;
  error: string | null;
  finished: boolean;
}) {
  if (!finished) return null;
  return (
    <Panel label="Estimated network location" meta={<Badge variant="outline">Experimental</Badge>}>
      <p className="mb-4 max-w-prose text-sm text-muted-foreground">
        Where this address’s network appears to be, worked out from the round-trip times above and the nodes’
        positions. It is not a person or a business.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!estimate && !error && <Skeleton className="h-40 w-full" />}
      {estimate && <Body estimate={estimate} />}
    </Panel>
  );
}
