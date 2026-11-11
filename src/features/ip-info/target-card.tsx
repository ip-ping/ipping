"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { flag } from "@/lib/format";

import { networkLine, nothingToShow, placeLine } from "./describe";
import type { MeasurementAddresses } from "./use-addresses";

/**
 * The target at a glance: the address the most nodes tested, where the IP databases put it and whose network it is. When
 * the nodes tested several addresses the others are one link away. It leaves itself out when there is nothing to say.
 */
export function TargetCard({ data }: { data: MeasurementAddresses | null }) {
  const first = data?.addresses[0];
  if (!data || !data.databases_loaded || !first?.info) return null;
  const { address, info } = first;
  const nothing = nothingToShow(info);
  const place = placeLine(info);
  const network = networkLine(info);
  const others = data.addresses.length - 1;
  return (
    <Card size="sm" data-testid="target-card" className="min-w-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
          Target address
          <Badge variant="outline">IPv{info.version}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="min-w-0 space-y-1.5">
        <div className="font-mono text-lg leading-tight font-semibold [overflow-wrap:anywhere]">{address}</div>
        {nothing ? (
          <p className="text-sm text-muted-foreground">{nothing}</p>
        ) : (
          <>
            <div className="text-sm">
              {flag(info.country)} {place || "Location unknown"}
            </div>
            {network && <div className="text-sm text-muted-foreground">{network}</div>}
            {info.network && <div className="font-mono text-xs text-muted-foreground">{info.network}</div>}
          </>
        )}
        {others > 0 && (
          <Button variant="link" size="sm" className="h-auto p-0 text-xs" render={<a href="#addresses" />}>
            and {others} more address{others === 1 ? "" : "es"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
