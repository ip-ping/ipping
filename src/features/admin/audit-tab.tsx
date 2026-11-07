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
          <TableHead className="hidden md:table-cell">Who</TableHead>
          <TableHead>What</TableHead>
          <TableHead className="hidden sm:table-cell">Subject</TableHead>
          <TableHead className="hidden lg:table-cell">From</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data?.map((event) => (
          <TableRow key={event.id}>
            <TableCell className="text-muted-foreground">{new Date(event.at).toLocaleString()}</TableCell>
            <TableCell className="hidden md:table-cell">{event.actor}</TableCell>
            <TableCell className="font-mono text-xs whitespace-normal break-all">
              {event.action}
              <div className="font-sans text-muted-foreground md:hidden">{event.actor}</div>
            </TableCell>
            <TableCell className="hidden font-mono text-xs text-muted-foreground break-all whitespace-normal sm:table-cell">{event.subject ?? ""}</TableCell>
            <TableCell className="hidden font-mono text-xs text-muted-foreground lg:table-cell">{event.source_ip ?? ""}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
