"use client";

import { ChevronDownIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useI18n } from "@/lib/i18n/provider";
import type { MessageKey } from "@/lib/i18n/translate";

import { answered, saidLine, type IpInfo, type SourceAnswer, type VotedField } from "./describe";

export const FIELD_LABEL: Record<VotedField, MessageKey> = {
  country: "ip.country",
  region: "ip.region",
  city: "ip.city",
  location: "ip.position",
  postal_code: "ip.postal",
  time_zone: "ip.timeZone",
  asn: "ip.asn",
  organization: "ip.organization",
};

const STATUS: Record<SourceAnswer["status"], { label: MessageKey; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  ok: { label: "ip.status.ok", variant: "secondary" },
  empty: { label: "ip.status.empty", variant: "outline" },
  error: { label: "ip.status.error", variant: "destructive" },
  disabled: { label: "ip.status.disabled", variant: "outline" },
  needs_setup: { label: "ip.status.needs_setup", variant: "outline" },
  waiting: { label: "ip.status.waiting", variant: "outline" },
  rate_limited: { label: "ip.status.rate_limited", variant: "destructive" },
  offline: { label: "ip.status.offline", variant: "outline" },
};

function Vote({ source }: { source: SourceAnswer }) {
  const { t } = useI18n();
  if (source.status !== "ok") return <span className="text-muted-foreground">–</span>;
  if (source.differs.length > 0) {
    const fields = source.differs.map((f) => t(FIELD_LABEL[f as VotedField] ?? "ip.city")).join(", ");
    return <span className="text-foreground">{t("ip.sources.differs", { fields })}</span>;
  }
  return <span className="text-muted-foreground">{t("ip.sources.agrees")}</span>;
}

/**
 * Every source of the answer, in a table under a one-line summary: what it said, whether it voted with the winner, or why it did
 * not answer. The words of a source that did not answer (`message`) come from the server and are in English.
 */
export function SourceAnswers({ info }: { info: IpInfo }) {
  const { t } = useI18n();
  const sources = info.sources ?? [];
  if (sources.length === 0) return null;
  return (
    <Collapsible className="mt-3" data-testid="ip-sources">
      <CollapsibleTrigger render={<Button variant="ghost" size="sm" className="-ml-2 h-7 gap-1 px-2 text-xs text-muted-foreground" />}>
        {t("ip.sources.summary", { n: answered(info), total: sources.length })}
        <ChevronDownIcon />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <Table className="mt-1 text-xs">
          <TableHeader>
            <TableRow>
              <TableHead className="pl-0">{t("ip.sources.source")}</TableHead>
              <TableHead>{t("ip.sources.status")}</TableHead>
              <TableHead className="hidden sm:table-cell">{t("ip.sources.said")}</TableHead>
              <TableHead className="pr-0">{t("ip.sources.vote")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sources.map((source) => {
              const status = STATUS[source.status];
              const said = saidLine(source);
              return (
                <TableRow key={source.id} data-testid={`source-${source.id}`}>
                  <TableCell className="pl-0 align-top">
                    <div className="font-medium">{source.name}</div>
                    <div className="text-muted-foreground">{t(source.kind === "online" ? "ip.kind.online" : "ip.kind.database")}</div>
                    {said && <div className="mt-1 whitespace-normal text-muted-foreground sm:hidden">{said}</div>}
                  </TableCell>
                  <TableCell className="whitespace-normal align-top">
                    <Badge variant={status.variant} title={source.message ?? undefined}>
                      {t(status.label)}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden whitespace-normal align-top sm:table-cell">{said || <span className="text-muted-foreground">–</span>}</TableCell>
                  <TableCell className="whitespace-normal pr-0 align-top">
                    <Vote source={source} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CollapsibleContent>
    </Collapsible>
  );
}
