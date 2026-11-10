"use client";

import { Panel } from "@/components/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Task } from "@/lib/api/client";
import { flag } from "@/lib/format";

import { networkLine, nothingToShow, placeLine } from "./describe";
import { isUnavailable, useIpInfos } from "./use-ip-info";

/**
 * Every address the nodes really tested, with what ipping's own IP lookup says about it: where it is, whose network it is.
 * A name that each node resolved for itself can have been several addresses, so there is a row for each. It leaves
 * itself out when the lookup cannot be had here (it is off, or for API keys or administrators only, or no database is
 * installed): the measurement is no worse for it.
 */
export function TestedAddresses({ tasks }: { tasks: Task[] }) {
  const nodesBy = new Map<string, number>();
  for (const task of tasks) if (task.tested_ip) nodesBy.set(task.tested_ip, (nodesBy.get(task.tested_ip) ?? 0) + 1);
  const addresses = [...nodesBy.keys()].sort((a, b) => (nodesBy.get(b) ?? 0) - (nodesBy.get(a) ?? 0) || a.localeCompare(b));
  const found = useIpInfos(addresses);

  if (addresses.length === 0) return null;
  const answered = addresses.filter((a) => found[a]);
  if (answered.length === addresses.length && answered.every((a) => isUnavailable(found[a]))) return null;

  return (
    <Panel label="Tested addresses" meta={<span className="tabular-nums">{addresses.length === 1 ? "1 address" : `${addresses.length} addresses`}</span>} flush>
      <Table className="text-sm">
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">Address</TableHead>
            <TableHead className="hidden sm:table-cell">Nodes</TableHead>
            <TableHead>Location</TableHead>
            <TableHead className="hidden md:table-cell">Network</TableHead>
            <TableHead className="hidden pr-4 lg:table-cell">Prefix</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {addresses.map((address) => {
            const lookup = found[address];
            const info = lookup && "info" in lookup ? lookup.info : null;
            const place = info ? placeLine(info) : "";
            const network = info ? networkLine(info) : "";
            const nothing = info ? nothingToShow(info) : null;
            return (
              <TableRow key={address}>
                <TableCell className="pl-4 align-top font-mono text-xs">{address}</TableCell>
                <TableCell className="hidden align-top tabular-nums sm:table-cell">{nodesBy.get(address)}</TableCell>
                <TableCell className="whitespace-normal align-top">
                  {!lookup ? (
                    <Skeleton className="h-4 w-40" />
                  ) : !info ? (
                    <span className="text-muted-foreground">–</span>
                  ) : nothing ? (
                    <span className="text-muted-foreground">{info.public ? "not in the databases" : "not a public address"}</span>
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
