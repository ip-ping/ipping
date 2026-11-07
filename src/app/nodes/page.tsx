"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useNodes } from "@/features/nodes/use-nodes";
import { flag, place } from "@/lib/format";

export default function NodesPage() {
  const { nodes, error } = useNodes();
  const online = nodes?.filter((n) => n.online).length ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Nodes</h1>
        <p className="text-sm text-muted-foreground">
          Every measurement runs from the online nodes below.
          {nodes && ` ${online} of ${nodes.length} online.`}
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Could not load nodes</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Node</TableHead>
            <TableHead className="hidden md:table-cell">Location</TableHead>
            <TableHead className="hidden lg:table-cell">Provider</TableHead>
            <TableHead className="hidden sm:table-cell">Can run</TableHead>
            <TableHead className="text-right">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {nodes === null &&
            !error &&
            Array.from({ length: 3 }, (_, i) => (
              <TableRow key={i}>
                <TableCell colSpan={5}>
                  <Skeleton className="h-5 w-full" />
                </TableCell>
              </TableRow>
            ))}
          {nodes?.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                No nodes have been approved yet.
              </TableCell>
            </TableRow>
          )}
          {nodes?.map((node) => (
            <TableRow key={node.id}>
              <TableCell className="font-medium">
                {node.name}
                <div className="text-xs font-normal text-muted-foreground md:hidden">
                  {flag(node.country)} {place(node)}
                </div>
              </TableCell>
              <TableCell className="hidden md:table-cell">
                {flag(node.country)} {place(node)}
              </TableCell>
              <TableCell className="hidden text-muted-foreground lg:table-cell">
                {node.provider ?? "–"}
                {node.asn ? ` (AS${node.asn})` : ""}
              </TableCell>
              <TableCell className="hidden space-x-1 sm:table-cell">
                {node.ipv4 && <Badge variant="secondary">IPv4</Badge>}
                {node.ipv6 && <Badge variant="secondary">IPv6</Badge>}
                {node.online && (
                  <div className="text-xs text-muted-foreground">{node.kinds.join(" · ")}</div>
                )}
              </TableCell>
              <TableCell className="text-right">
                <Badge variant={node.online ? "default" : "outline"}>
                  {node.online ? "Online" : "Offline"}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
