"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Schemas } from "@/lib/api/client";
import { useApiData } from "@/lib/api/use-api-data";

export function AuditTab() {
  const { data } = useApiData<Schemas["AuditOut"][]>("/admin/audit?limit=100", 15_000);
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>When</TableHead>
          <TableHead>Who</TableHead>
          <TableHead>What</TableHead>
          <TableHead>Subject</TableHead>
          <TableHead>From</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data?.map((event) => (
          <TableRow key={event.id}>
            <TableCell className="whitespace-nowrap text-muted-foreground">
              {new Date(event.at).toLocaleString()}
            </TableCell>
            <TableCell>{event.actor}</TableCell>
            <TableCell className="font-mono text-xs">{event.action}</TableCell>
            <TableCell className="font-mono text-xs text-muted-foreground">{event.subject ?? ""}</TableCell>
            <TableCell className="font-mono text-xs text-muted-foreground">{event.source_ip ?? ""}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
