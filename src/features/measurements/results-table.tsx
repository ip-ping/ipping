"use client";

import { ChevronRightIcon } from "lucide-react";
import { Fragment, useState } from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Measurement, Task } from "@/lib/api/client";
import { flag, ms, pct, place } from "@/lib/format";
import { cn } from "@/lib/utils";

import { TaskStatus } from "./status";

export function ResultsTable({ measurement }: { measurement: Measurement }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const slowest = measurement.stats.slowest_median_ms ?? 0;
  const toggle = (id: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8" />
          <TableHead>Node</TableHead>
          <TableHead>Region</TableHead>
          <TableHead>Provider / ASN</TableHead>
          <TableHead>Tested IP</TableHead>
          <TableHead className="text-right">Min</TableHead>
          <TableHead className="text-right">Median</TableHead>
          <TableHead className="text-right">Avg</TableHead>
          <TableHead className="text-right">Max</TableHead>
          <TableHead className="text-right">Loss</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {measurement.tasks.map((task) => {
          const expanded = open.has(task.id);
          const summary = task.summary;
          const fastest = task.id === measurement.stats.fastest_task_id;
          return (
            <Fragment key={task.id}>
              <TableRow
                className="cursor-pointer"
                onClick={() => toggle(task.id)}
                aria-expanded={expanded}
              >
                <TableCell>
                  <ChevronRightIcon
                    className={cn("size-4 text-muted-foreground transition-transform", expanded && "rotate-90")}
                  />
                </TableCell>
                <TableCell className="font-medium">{task.node.name}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {flag(task.node.country)} {place(task.node)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {task.node.provider ?? "–"}
                  {task.node.asn ? ` · AS${task.node.asn}` : ""}
                </TableCell>
                <TableCell className="font-mono text-xs">{task.tested_ip ?? "–"}</TableCell>
                <TableCell className="text-right tabular-nums">{ms(summary?.min_ms)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  <div className="flex items-center justify-end gap-2">
                    {slowest > 0 && summary?.median_ms != null && (
                      <span
                        aria-hidden
                        className={cn("h-1.5 rounded-full", fastest ? "bg-primary" : "bg-muted-foreground/40")}
                        style={{ width: `${Math.max(4, (summary.median_ms / slowest) * 48)}px` }}
                      />
                    )}
                    <span className={cn(fastest && "font-semibold")}>{ms(summary?.median_ms)}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{ms(summary?.avg_ms)}</TableCell>
                <TableCell className="text-right tabular-nums">{ms(summary?.max_ms)}</TableCell>
                <TableCell className="text-right tabular-nums">{pct(summary?.loss_pct)}</TableCell>
                <TableCell>
                  <TaskStatus task={task} />
                </TableCell>
              </TableRow>
              {expanded && (
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableCell />
                  <TableCell colSpan={10}>
                    <TaskDetail task={task} expected={measurement.options.count} />
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          );
        })}
        {measurement.tasks.length === 0 && (
          <TableRow>
            <TableCell colSpan={11} className="py-8 text-center text-muted-foreground">
              No nodes took part in this measurement.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

function TaskDetail({ task, expected }: { task: Task; expected: number }) {
  const bySeq = new Map(task.samples.map((s) => [s.seq, s]));
  return (
    <div className="space-y-2 py-1 text-sm">
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: expected }, (_, seq) => {
          const sample = bySeq.get(seq);
          return (
            <span
              key={seq}
              className={cn(
                "rounded-md border px-2 py-1 font-mono text-xs tabular-nums",
                !sample && "border-dashed text-muted-foreground",
                sample?.status === "timeout" && "border-destructive/40 text-destructive",
                sample?.status === "error" && "border-destructive text-destructive",
              )}
            >
              #{seq + 1}{" "}
              {!sample
                ? "pending"
                : sample.status === "ok"
                  ? `${ms(sample.rtt_ms)} ms`
                  : sample.status === "timeout"
                    ? "timeout"
                    : (sample.error_code ?? "error")}
            </span>
          );
        })}
      </div>
      {task.error_message && <p className="text-muted-foreground">{task.error_message}</p>}
      {task.resolved_ips.length > 0 && (
        <p className="text-muted-foreground">
          Resolved on this node:{" "}
          <span className="font-mono text-xs">{task.resolved_ips.join(", ")}</span>
        </p>
      )}
    </div>
  );
}
