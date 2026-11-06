"use client";

import { ChevronRightIcon } from "lucide-react";
import { Fragment, useState, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
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

import { explainError, shortError } from "./errors";
import { kindOf, type Kind } from "./kinds";
import { CertificateBadge, HttpDetailView, RouteDetailView, StatusCode } from "./sample-details";
import { TaskStatus } from "./status";

type Column = {
  head: string;
  align?: "right";
  cell: (task: Task, context: { fastest: boolean; slowest: number }) => ReactNode;
};

const bar = (task: Task, { fastest, slowest }: { fastest: boolean; slowest: number }) => {
  const median = task.summary?.median_ms;
  return (
    <div className="flex items-center justify-end gap-2">
      {slowest > 0 && median != null && (
        <span
          aria-hidden
          className={cn("h-1.5 rounded-full", fastest ? "bg-primary" : "bg-muted-foreground/40")}
          style={{ width: `${Math.max(4, (median / slowest) * 48)}px` }}
        />
      )}
      <span className={cn(fastest && "font-semibold")}>{ms(median)}</span>
    </div>
  );
};

const latency = (loss: string): Column[] => [
  { head: "Min", align: "right", cell: (t) => ms(t.summary?.min_ms) },
  { head: "Median", align: "right", cell: bar },
  { head: "Avg", align: "right", cell: (t) => ms(t.summary?.avg_ms) },
  { head: "Max", align: "right", cell: (t) => ms(t.summary?.max_ms) },
  { head: loss, align: "right", cell: (t) => pct(t.summary?.loss_pct) },
];

const COLUMNS: Record<Kind, Column[]> = {
  ping: latency("Loss"),
  tcp: latency("Failed"),
  http: [
    {
      head: "Result",
      cell: (t) => {
        const sample = t.samples[0];
        if (!sample) return <span className="text-muted-foreground">–</span>;
        if (sample.http?.status_code != null) return <StatusCode code={sample.http.status_code} />;
        return (
          <span className="text-destructive">
            {sample.status === "timeout" ? "Timed out" : shortError(sample.error_code)}
          </span>
        );
      },
    },
    { head: "Total", align: "right", cell: bar },
    { head: "Connect", align: "right", cell: (t) => ms(t.samples[0]?.http?.connect_us != null ? t.samples[0].http.connect_us / 1000 : null) },
    { head: "TLS", align: "right", cell: (t) => ms(t.samples[0]?.http?.tls_us != null ? t.samples[0].http.tls_us / 1000 : null) },
    { head: "First byte", align: "right", cell: (t) => ms(t.samples[0]?.http?.ttfb_us != null ? t.samples[0].http.ttfb_us / 1000 : null) },
    { head: "Certificate", cell: (t) => <CertificateBadge tls={t.samples[0]?.http?.tls} /> },
  ],
  traceroute: [
    {
      head: "Destination",
      cell: (t) =>
        t.summary?.reached == null ? (
          <span className="text-muted-foreground">tracing…</span>
        ) : t.summary.reached ? (
          <Badge>reached</Badge>
        ) : (
          <Badge variant="outline">not reached</Badge>
        ),
    },
    {
      head: "Hops",
      align: "right",
      cell: (t) => {
        const last = t.samples.at(-1)?.hop;
        return last ? `${last.ttl}` : "–";
      },
    },
    { head: "Answered", align: "right", cell: (t) => (t.summary ? `${t.summary.received} / ${t.summary.sent}` : "–") },
    { head: "Round trip", align: "right", cell: (t) => ms(t.summary?.median_ms) },
  ],
};

export function ResultsTable({ measurement }: { measurement: Measurement }) {
  const kind = kindOf(measurement);
  const columns = COLUMNS[kind];
  const [open, setOpen] = useState<Set<string>>(new Set());
  const slowest = measurement.stats.slowest_median_ms ?? 0;
  const toggle = (id: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const width = 6 + columns.length;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8" />
          <TableHead>Node</TableHead>
          <TableHead>Region</TableHead>
          <TableHead>Provider / ASN</TableHead>
          <TableHead>Tested IP</TableHead>
          {columns.map((c) => (
            <TableHead key={c.head} className={c.align === "right" ? "text-right" : undefined}>
              {c.head}
            </TableHead>
          ))}
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {measurement.tasks.map((task) => {
          const expanded = open.has(task.id);
          const context = { fastest: task.id === measurement.stats.fastest_task_id, slowest };
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
                {columns.map((c) => (
                  <TableCell key={c.head} className={c.align === "right" ? "text-right tabular-nums" : undefined}>
                    {c.cell(task, context)}
                  </TableCell>
                ))}
                <TableCell>
                  <TaskStatus task={task} />
                </TableCell>
              </TableRow>
              {expanded && (
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableCell />
                  <TableCell colSpan={width - 1}>
                    <TaskDetail task={task} kind={kind} expected={measurement.options.count} />
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          );
        })}
        {measurement.tasks.length === 0 && (
          <TableRow>
            <TableCell colSpan={width} className="py-8 text-center text-muted-foreground">
              No nodes took part in this measurement.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

function TaskDetail({ task, kind, expected }: { task: Task; kind: Kind; expected: number }) {
  return (
    <>
      {kind === "http" ? (
        <HttpDetailView task={task} />
      ) : kind === "traceroute" ? (
        <RouteDetailView task={task} />
      ) : (
        <Attempts task={task} kind={kind} expected={expected} />
      )}
      <div className="space-y-1 pb-1 text-sm">
        {task.error_message && kind !== "http" && <p className="text-muted-foreground">{task.error_message}</p>}
        {task.resolved_ips.length > 0 && (
          <p className="text-muted-foreground">
            Resolved on this node:{" "}
            <span className="font-mono text-xs">{task.resolved_ips.join(", ")}</span>
          </p>
        )}
      </div>
    </>
  );
}

function Attempts({ task, kind, expected }: { task: Task; kind: Kind; expected: number }) {
  const bySeq = new Map(task.samples.map((s) => [s.seq, s]));
  return (
    <div className="space-y-2 py-1 text-sm">
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: expected }, (_, seq) => {
          const sample = bySeq.get(seq);
          // A refusal is an answer from the machine (it has a time), but not a success.
          const refused = sample?.status === "error" && sample.error_code === "connection_refused";
          return (
            <span
              key={seq}
              title={sample?.status === "error" ? explainError(sample.error_code) : undefined}
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
                    : refused && sample.rtt_ms != null
                      ? `refused after ${ms(sample.rtt_ms)} ms`
                      : (sample.error_code ?? "error")}
            </span>
          );
        })}
      </div>
      {kind === "tcp" && task.samples.some((s) => s.error_code === "connection_refused") && (
        <p className="text-muted-foreground">
          Refused means the machine answered but nothing listens on that port (or a firewall
          rejects it).
        </p>
      )}
    </div>
  );
}
