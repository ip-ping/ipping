"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { flag } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";

import { Confidence } from "./confidence";
import { networkLine, nothingToShow, placeLine, placeSure, sure } from "./describe";
import { IpInfoDetails } from "./ip-info-details";
import type { MeasurementAddresses } from "./use-addresses";

/**
 * The target at a glance: the address the most nodes tested, where the IP data puts it and whose network it is, each with how sure
 * the vote of the sources is. All the fields and the sources themselves are one click away, and so are the other addresses when
 * the nodes tested several. It leaves itself out when there is nothing to say.
 */
export function TargetCard({ data }: { data: MeasurementAddresses | null }) {
  const { t } = useI18n();
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
          {t("target.title")}
          <Badge variant="outline">IPv{info.version}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="min-w-0 space-y-1.5">
        <div className="font-mono text-lg leading-tight font-semibold [overflow-wrap:anywhere]">{address}</div>
        {nothing ? (
          <p className="text-sm text-muted-foreground">{nothing}</p>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3 text-sm" data-testid="target-place">
              <span className="min-w-0 [overflow-wrap:anywhere]">
                {flag(info.country)} {place || t("ip.unknownPlace")}
              </span>
              <Confidence percent={placeSure(info)} />
            </div>
            {network && (
              <div className="flex items-start justify-between gap-3 text-sm text-muted-foreground" data-testid="target-network">
                <span className="min-w-0 [overflow-wrap:anywhere]">{network}</span>
                <Confidence percent={sure(info, "asn")} />
              </div>
            )}
            {info.network && <div className="font-mono text-xs text-muted-foreground">{info.network}</div>}
          </>
        )}
        {!nothing && (info.sources?.length ?? 0) > 0 && (
          <Collapsible>
            <CollapsibleTrigger render={<Button variant="link" size="sm" className="h-auto p-0 text-xs" />}>{t("ip.details")}</CollapsibleTrigger>
            <CollapsibleContent>
              <IpInfoDetails info={info} />
            </CollapsibleContent>
          </Collapsible>
        )}
        {others > 0 && (
          <Button variant="link" size="sm" className="h-auto p-0 text-xs" render={<a href="#addresses" />}>
            {t("target.more", { n: others })}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
