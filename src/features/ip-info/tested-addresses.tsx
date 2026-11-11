"use client";

import { Panel } from "@/components/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { flag } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";

import { networkLine, nothingToShow, placeLine } from "./describe";
import type { MeasurementAddresses } from "./use-addresses";

/**
 * The addresses the nodes really tested when there were several (a name each node resolved for itself can lead to many), with
 * what ipping's own IP databases say about each: where it is, whose network it is. One address is already on the target card at
 * the top, so it is not repeated here; nothing is shown when no database is installed.
 */
export function TestedAddresses({ data }: { data: MeasurementAddresses | null }) {
  const { t } = useI18n();
  if (!data || !data.databases_loaded || data.addresses.length < 2) return null;
  const { addresses } = data;
  return (
    <Panel label={t("panel.addresses")} meta={<span className="tabular-nums">{t("panel.addressCount", { n: addresses.length })}</span>} flush>
      <Table className="text-sm">
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">{t("addr.address")}</TableHead>
            <TableHead className="hidden sm:table-cell">{t("addr.nodes")}</TableHead>
            <TableHead>{t("addr.location")}</TableHead>
            <TableHead className="hidden md:table-cell">{t("addr.network")}</TableHead>
            <TableHead className="hidden pr-4 lg:table-cell">{t("addr.prefix")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {addresses.map(({ address, nodes, info }) => {
            const place = info ? placeLine(info) : "";
            const network = info ? networkLine(info) : "";
            const nothing = info ? nothingToShow(info) : null;
            return (
              <TableRow key={address}>
                <TableCell className="pl-4 align-top font-mono text-xs">{address}</TableCell>
                <TableCell className="hidden align-top tabular-nums sm:table-cell">{nodes}</TableCell>
                <TableCell className="whitespace-normal align-top">
                  {!info ? (
                    <span className="text-muted-foreground">–</span>
                  ) : nothing ? (
                    <span className="text-muted-foreground">{info.public ? t("addr.notInDb") : t("addr.notPublic")}</span>
                  ) : (
                    <>
                      {flag(info.country)} {place || "–"}
                      <div className="text-xs text-muted-foreground md:hidden">{network}</div>
                    </>
                  )}
                </TableCell>
                <TableCell className="hidden align-top text-muted-foreground md:table-cell">{network || "–"}</TableCell>
                <TableCell className="hidden pr-4 align-top font-mono text-xs text-muted-foreground lg:table-cell">{info?.network ?? "–"}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Panel>
  );
}
