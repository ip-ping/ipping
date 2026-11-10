import { Badge } from "@/components/ui/badge";
import { flag } from "@/lib/format";

import { networkLine, nothingToShow, placeLine, positionLine, type IpInfo } from "./describe";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-x-4 gap-y-0.5 py-2 text-sm sm:grid-cols-[9rem_1fr]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

/** What the IP databases say about one address, as rows: place, position, network, time zone and where it comes from. */
export function IpInfoCard({ info }: { info: IpInfo }) {
  const nothing = nothingToShow(info);
  const place = placeLine(info);
  const network = networkLine(info);
  const position = positionLine(info);
  return (
    <div data-testid="ip-info">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-lg font-semibold [overflow-wrap:anywhere]">{info.address}</span>
        <Badge variant="outline">IPv{info.version}</Badge>
        {!info.public && <Badge variant="secondary">not public</Badge>}
      </div>
      {nothing ? (
        <p className="mt-2 text-sm text-muted-foreground">{nothing}</p>
      ) : (
        <dl className="mt-2 divide-y">
          <Row label="Location">
            {place ? (
              <>
                {flag(info.country)} {place}
              </>
            ) : (
              "–"
            )}
            {info.postal_code ? <span className="text-muted-foreground"> · {info.postal_code}</span> : null}
          </Row>
          {position && <Row label="Position">{position}</Row>}
          {info.time_zone && <Row label="Time zone">{info.time_zone}</Row>}
          <Row label="Network">{network || "–"}</Row>
          {info.network && (
            <Row label="Prefix">
              <span className="font-mono text-xs">{info.network}</span>
            </Row>
          )}
        </dl>
      )}
      {(info.source || info.attribution) && (
        <p className="mt-3 text-xs text-muted-foreground">
          {info.source ? `From ${info.source}` : null}
          {info.database_built ? `, built ${info.database_built.slice(0, 10)}` : null}
          {info.source ? ". " : ""}
          {info.attribution}
        </p>
      )}
    </div>
  );
}
