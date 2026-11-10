"use client";

import { InfoIcon } from "lucide-react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";
import { Panel } from "@/components/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { LocationEstimate } from "@/features/location/use-location";
import type { Task } from "@/lib/api/client";
import { flag, ms, place } from "@/lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
    <Accordion className="min-w-0 rounded-lg border px-3">
      <AccordionItem value="details" className="border-b-0">
        <AccordionTrigger className="text-muted-foreground">{summary}</AccordionTrigger>
        <AccordionContent>{children}</AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

/** The nodes of the measurement by id: the evidence names a node, the measurement knows where it is and whose it is. */
type Nodes = ReadonlyMap<string, Task["node"]>;

function Evidence({ estimate, nodes }: { estimate: LocationEstimate; nodes: Nodes }) {
  if (estimate.evidence.length === 0) return null;
  return (
    <Details summary={`Measurements used (${estimate.evidence.filter((e) => e.used).length} of ${estimate.evidence.length} nodes)`}>
      <div className="overflow-x-auto">
      <Table className="w-full text-left text-xs">
        <TableHeader className="text-muted-foreground">
          <TableRow>
            <TableHead className="py-1 font-medium">Node</TableHead>
            <TableHead className="hidden py-1 pl-3 font-medium md:table-cell">Region</TableHead>
            <TableHead className="hidden py-1 pl-3 font-medium md:table-cell">Provider / ASN</TableHead>
            <TableHead className="py-1 text-right font-medium">Smallest RTT</TableHead>
            <TableHead className="hidden py-1 text-right font-medium sm:table-cell">At most</TableHead>
            <TableHead className="hidden py-1 pl-3 font-medium sm:table-cell">Position</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {estimate.evidence.map((e) => {
            const node = nodes.get(e.node_id);
            const provider = node ? [node.provider, node.asn ? `AS${node.asn}` : null].filter(Boolean).join(" · ") : "";
            return (
              <TableRow key={e.node_id} className={e.used ? "" : "text-muted-foreground"}>
                <TableCell className="py-1">
                  {e.node_name}
                  {node && (
                    <div className="text-muted-foreground md:hidden">
                      {flag(node.country)} {place(node)}
                      {provider ? ` · ${provider}` : ""}
                    </div>
                  )}
                  <div className="text-muted-foreground sm:hidden">
                    within {Math.round(e.rtt_ms * 150).toLocaleString()} km · {e.verified ? "verified" : "not verified"}
                    {e.used ? "" : " · not used"}
                  </div>
                </TableCell>
                <TableCell className="hidden whitespace-nowrap py-1 pl-3 md:table-cell">
                  {node ? `${flag(node.country)} ${place(node)}`.trim() : "–"}
                </TableCell>
                <TableCell className="hidden py-1 pl-3 md:table-cell">{provider || "–"}</TableCell>
                <TableCell className="py-1 text-right align-top tabular-nums">{ms(e.rtt_ms)} ms</TableCell>
                <TableCell className="hidden py-1 text-right tabular-nums sm:table-cell">{Math.round(e.rtt_ms * 150).toLocaleString()} km</TableCell>
                <TableCell className="hidden py-1 pl-3 sm:table-cell">{e.verified ? "verified" : "not verified"}{e.used ? "" : " · not used"}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
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

const km = (n: number) => `${n.toLocaleString()} km`;

type Claim = NonNullable<LocationEstimate["geoip"]>;

/**
 * One claim about where the address is (a GeoIP database's, or the network's own geofeed), set against what the nodes
 * measured. A claim never moves the estimate; it can only be shown wrong (a place no node's round trip allows) or
 * not contradicted.
 */
function ClaimLine({ claim, own }: { claim: Claim; own: boolean }) {
  const place = claim.place;
  const where = place ? `${place.name}, ${place.country}` : claim.claim;
  if (!where) return null;
  return (
    <p>
      <span className="text-muted-foreground">{claim.source} says </span>
      <strong>{where}</strong>
      {own && claim.prefix && <span className="text-muted-foreground"> for {claim.prefix}</span>}
      {!place ? (
        <>. That is not a place this site can check against the measurements.</>
      ) : claim.verdict === "ruled_out" && claim.ruled_out_by ? (
        <>
          . <strong>The measurements rule that out:</strong> {claim.ruled_out_by.node_name} heard from this address in{" "}
          {ms(claim.ruled_out_by.rtt_ms)} ms, so it is at most {km(claim.ruled_out_by.max_distance_km)} from that node, but{" "}
          {where} is {km(claim.ruled_out_by.distance_km)} away.{" "}
          {own
            ? "A geofeed is what the network's operator says; an anycast address answers from many places."
            : "A database names one place for an address; an anycast address answers from many."}
        </>
      ) : claim.verdict === "consistent" ? (
        <>
          {claim.distance_to_estimate_km != null && (
            <span className="text-muted-foreground"> ({km(claim.distance_to_estimate_km)} from the estimate)</span>
          )}
          . No measurement contradicts that.
        </>
      ) : (
        <>. No node with a verified position took part, so it could not be checked against the measurements.</>
      )}
    </p>
  );
}

function GeoIpNote({ estimate }: { estimate: LocationEstimate }) {
  const { geoip, geofeed, asn } = estimate;
  if (!geoip && !geofeed && !asn) return null;
  return (
    <div className="space-y-2 border-l-2 border-foreground/30 pl-3 text-sm">
      {asn && (
        <p>
          <span className="text-muted-foreground">Network: </span>
          <span className="font-mono">AS{asn.number}</span> {asn.organization}
        </p>
      )}
      {geoip && <ClaimLine claim={geoip} own={false} />}
      {geofeed && <ClaimLine claim={geofeed} own />}
      {geoip?.attribution && <p className="text-xs text-muted-foreground">{geoip.attribution}</p>}
    </div>
  );
}

/**
 * How accurate answers like this one have been: the share, on real targets of known position, that were within each
 * radius. It is a measured rate for answers made with a closest node this far away, not a probability for this address.
 */
function Accuracy({ estimate }: { estimate: LocationEstimate }) {
  const accuracy = estimate.accuracy;
  if (!accuracy) return null;
  const rows = Object.entries(accuracy.by_radius).sort((a, b) => Number(a[0]) - Number(b[0]));
  return (
    <div className="max-w-xl space-y-2" data-testid="accuracy">
      <Progress value={accuracy.percent} aria-label="Accuracy">
        <ProgressLabel>Accuracy</ProgressLabel>
        <ProgressValue>{() => `${accuracy.percent}% within ${accuracy.radius_km.toLocaleString()} km`}</ProgressValue>
      </Progress>
      <p className="text-xs text-muted-foreground">
        {rows.map(([km, pct], i) => (
          <span key={km} className="whitespace-nowrap">
            {i > 0 && " · "}
            {Number(km).toLocaleString()} km <span className="tabular-nums text-foreground">{pct}%</span>
          </span>
        ))}
      </p>
      <p className="text-xs leading-relaxed text-muted-foreground">{accuracy.basis}</p>
    </div>
  );
}

function Body({ estimate, nodes }: { estimate: LocationEstimate; nodes: Nodes }) {
  if (estimate.status === "unavailable") {
    return <p className="text-sm text-muted-foreground">{estimate.summary}</p>;
  }

  if (estimate.status !== "estimated") {
    const title = estimate.status === "inconclusive" ? "A single location could not be established" : "No estimate";
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
        <GeoIpNote estimate={estimate} />
        <Evidence estimate={estimate} nodes={nodes} />
        <Limitations estimate={estimate} />
      </div>
    );
  }

  const { likely, closest } = estimate;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="leading-none text-3xl font-semibold">
          {likely?.name}, {likely?.country}
        </div>
        {estimate.strength && <StrengthBadge strength={estimate.strength} />}
      </div>
      <Accuracy estimate={estimate} />
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
          <AlertTitle>{estimate.conflicting ? "The nodes disagree" : "Keep in mind"}</AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-0.5 pl-4">
              {estimate.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      <GeoIpNote estimate={estimate} />
      <Evidence estimate={estimate} nodes={nodes} />
      <Limitations estimate={estimate} />
    </div>
  );
}

/**
 * The words of the location estimate: the place, how strong the evidence is, what else fits, and the
 * measurements behind it. The map above already shows where it is, with a ring per node.
 */
/** When the nodes resolved the name to different addresses: which one the estimate is for, and a way to pick another. */
function Addresses({ estimate, onAddress }: { estimate: LocationEstimate; onAddress: (ip: string) => void }) {
  if (estimate.groups.length < 2) return null;
  const selected = estimate.groups.find((g) => g.selected)?.ip;
  return (
    <div className="mb-4 space-y-2">
      <p className="max-w-prose text-sm text-muted-foreground">
        The nodes resolved the name to {estimate.groups.length} different addresses, which can be different servers, so each
        address gets its own estimate. Showing:
      </p>
      <ToggleGroup
        variant="outline"
        size="sm"
        spacing={1}
        value={selected ? [selected] : []}
        onValueChange={(value) => value[0] && onAddress(value[0])}
        aria-label="Address to estimate"
        className="flex-wrap"
      >
        {estimate.groups.map((g) => (
          <ToggleGroupItem key={g.ip} value={g.ip} className="font-mono">
            {g.ip} · {g.nodes} {g.nodes === 1 ? "node" : "nodes"}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

export function LocationPanel({
  estimate,
  error,
  finished,
  onAddress,
  nodes,
}: {
  estimate: LocationEstimate | null;
  error: string | null;
  finished: boolean;
  onAddress: (ip: string) => void;
  /** The nodes of the measurement, for the region and network of each node in the evidence. */
  nodes: Task["node"][];
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
      {estimate && <Addresses estimate={estimate} onAddress={onAddress} />}
      {estimate && <Body estimate={estimate} nodes={new Map(nodes.map((n) => [n.id, n]))} />}
    </Panel>
  );
}
