"use client";

import { ChevronRightIcon } from "lucide-react";
import { Fragment, useState, type ReactNode } from "react";

import { CommunityBadge } from "@/components/community-badge";
import { Panel } from "@/components/panel";
import { Sparkline } from "@/components/viz/sparkline";
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
import { delta, flag, ms, nodeHeading, pct } from "@/lib/format";
import { cn } from "@/lib/utils";

import { commonName } from "./certs";
import { explainError, shortError } from "./errors";
import type { Focus } from "@/lib/use-focus";
import { kindOf, type Kind } from "./kinds";
import { describeAnswer } from "./dns-groups";
import { CertDetailView, CertificateBadge, DnsDetailView, HttpDetailView, RouteDetailView, StatusCode } from "./sample-details";
import { TaskStatus } from "./status";

/** Below this width the column is hidden; the row's details carry what the table drops. */
type Show = "always" | "sm" | "md" | "lg" | "xl";

const SHOW: Record<Show, string> = {
  always: "",
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
  xl: "hidden xl:table-cell",
};

type Context = { fastest: boolean; slowest: number; active: boolean; before?: number };

type Column = {
  head: string;
  align?: "right";
  show?: Show;
  cell: (task: Task, context: Context) => ReactNode;
};

const bar = (task: Task, { fastest, slowest, before }: Context) => {
  const median = task.summary?.median_ms;
  return (
    <div className="flex items-center justify-end gap-2">
      {slowest > 0 && median != null && (
        <span
          aria-hidden
          className={cn("hidden h-2 rounded-[1px] sm:inline-block", fastest ? "bg-signal" : "bg-foreground/25")}
          style={{ width: `${Math.max(4, (median / slowest) * 56)}px` }}
        />
      )}
      <span className={cn(fastest && "font-semibold")}>{ms(median)}</span>
      {before != null && median != null && (
        <span className="w-11 text-left text-xs font-normal text-muted-foreground" title={`${ms(before)} ms last time`}>
          {delta(median, before)}
        </span>
      )}
    </div>
  );
};

const latency = (loss: string): Column[] => [
  { head: "Min", align: "right", show: "md", cell: (t) => ms(t.summary?.min_ms) },
  { head: "Median", align: "right", cell: bar },
  { head: "Avg", align: "right", show: "lg", cell: (t) => ms(t.summary?.avg_ms) },
  { head: "Max", align: "right", show: "md", cell: (t) => ms(t.summary?.max_ms) },
  {
    head: "Replies",
    show: "lg",
    cell: (t, { active }) => (
      <Sparkline
        values={[...t.samples].sort((a, b) => a.seq - b.seq).map((s) => (s.status === "ok" ? (s.rtt_ms ?? null) : null))}
        active={active}
      />
    ),
  },
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
    { head: "Total", align: "right", show: "sm", cell: bar },
    { head: "Connect", align: "right", show: "lg", cell: (t) => ms(t.samples[0]?.http?.connect_us != null ? t.samples[0].http.connect_us / 1000 : null) },
    { head: "TLS", align: "right", show: "lg", cell: (t) => ms(t.samples[0]?.http?.tls_us != null ? t.samples[0].http.tls_us / 1000 : null) },
    { head: "First byte", align: "right", show: "lg", cell: (t) => ms(t.samples[0]?.http?.ttfb_us != null ? t.samples[0].http.ttfb_us / 1000 : null) },
    { head: "Certificate", show: "sm", cell: (t) => <CertificateBadge tls={t.samples[0]?.http?.tls} /> },
  ],
  tls: [
    {
      head: "Result",
      cell: (t) => {
        const sample = t.samples[0];
        if (!sample) return <span className="text-muted-foreground">–</span>;
        const cert = sample.tls?.tls;
        if (cert) return cert.verified ? <Badge>trusted</Badge> : <Badge variant="destructive">not trusted</Badge>;
        return (
          <span className="text-destructive">
            {sample.status === "timeout" ? "Timed out" : shortError(sample.error_code)}
          </span>
        );
      },
    },
    { head: "Expires", cell: (t) => <CertificateBadge tls={t.samples[0]?.tls?.tls} /> },
    { head: "Issued by", show: "md", cell: (t) => <span className="block max-w-[14rem] truncate">{commonName(t.samples[0]?.tls?.tls?.issuer)}</span> },
    {
      head: "Connection",
      show: "lg",
      cell: (t) => {
        const d = t.samples[0]?.tls;
        return d?.tls?.version ? `${d.tls.version}${d.transport === "quic" ? " · QUIC" : ""}` : "–";
      },
    },
    { head: "Handshake", align: "right", show: "sm", cell: (t) => ms(t.samples[0]?.tls?.total_us != null ? t.samples[0].tls.total_us / 1000 : null) },
  ],
  dns: [
    {
      head: "Answer",
      cell: (t) => {
        const answer = describeAnswer(t);
        if (!answer) return <span className="text-muted-foreground">asking…</span>;
        const shown = answer.lines.slice(0, 2).join(", ");
        const more = answer.lines.length - 2;
        return (
          <span className={cn("font-mono text-xs [overflow-wrap:anywhere]", answer.rcode === null && "text-muted-foreground")}>
            {shown}
            {more > 0 && <span className="text-muted-foreground"> +{more}</span>}
          </span>
        );
      },
    },
    {
      head: "Code",
      show: "sm",
      cell: (t) => {
        const rcode = t.samples[0]?.dns?.rcode;
        return rcode ? <Badge variant={rcode === "NOERROR" ? "default" : "secondary"}>{rcode}</Badge> : <span className="text-muted-foreground">–</span>;
      },
    },
    { head: "Time", align: "right", cell: bar },
    {
      head: "TTL",
      align: "right",
      show: "md",
      cell: (t) => {
        const ttls = (t.samples[0]?.dns?.answers ?? []).map((a) => a.ttl);
        return ttls.length ? Math.min(...ttls) : "–";
      },
    },
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
      show: "sm",
      cell: (t) => {
        const last = t.samples.at(-1)?.hop;
        return last ? `${last.ttl}` : "–";
      },
    },
    { head: "Answered", align: "right", show: "md", cell: (t) => (t.summary ? `${t.summary.received} / ${t.summary.sent}` : "–") },
    { head: "Round trip", align: "right", show: "sm", cell: (t) => ms(t.summary?.median_ms) },
  ],
};

export function ResultsTable({
  measurement,
  focus,
  previous,
}: {
  measurement: Measurement;
  focus: Focus;
  previous?: ReadonlyMap<string, number>;
}) {
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
  const width = (kind === "dns" ? 5 : 6) + columns.length;

  return (
    // The container lets a row's details be exactly as wide as what is visible, however far the
    // table itself scrolls sideways (see `100cqw` below).
    <Panel label="Nodes" meta={<span>{measurement.tasks.length} of them</span>} flush>
    <div className="@container">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8" />
            <TableHead>Node</TableHead>
            {kind !== "dns" && <TableHead className={SHOW.lg}>Tested IP</TableHead>}
            {columns.map((c) => (
              <TableHead
                key={c.head}
                className={cn(SHOW[c.show ?? "always"], c.align === "right" && "text-right")}
              >
                {c.head}
              </TableHead>
            ))}
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {measurement.tasks.map((task) => {
            const expanded = open.has(task.id);
            const h = nodeHeading(task.node);
            const active = focus.active === task.node.id;
            const context = { fastest: task.id === measurement.stats.fastest_task_id, slowest, active, before: previous?.get(task.node.id) };
            return (
              <Fragment key={task.id}>
                <TableRow
                  className={cn("cursor-pointer", active && "bg-signal-soft hover:bg-signal-soft")}
                  onClick={() => toggle(task.id)}
                  onPointerEnter={() => focus.setHover(task.node.id)}
                  onPointerLeave={() => focus.setHover(null)}
                  aria-expanded={expanded}
                >
                  <TableCell>
                    <ChevronRightIcon
                      className={cn("size-4 text-muted-foreground transition-transform", expanded && "rotate-90")}
                    />
                  </TableCell>
                  <TableCell className="min-w-0 font-medium">
                    {h.named ? h.title : `${flag(task.node.country)} ${h.title}`.trim()}
                    <CommunityBadge tier={task.node.tier} />
                    {h.sub && <div className="text-xs font-normal text-muted-foreground [overflow-wrap:anywhere]">{h.sub}</div>}
                  </TableCell>
                  {kind !== "dns" && (
                    <TableCell className={cn("font-mono text-xs", SHOW.lg)}>{task.tested_ip ?? "–"}</TableCell>
                  )}
                  {columns.map((c) => (
                    <TableCell
                      key={c.head}
                      className={cn(SHOW[c.show ?? "always"], c.align === "right" && "text-right tabular-nums")}
                    >
                      {c.cell(task, context)}
                    </TableCell>
                  ))}
                  <TableCell>
                    <TaskStatus task={task} />
                  </TableCell>
                </TableRow>
                {expanded && (
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableCell colSpan={width} className="p-0 whitespace-normal">
                      {/* Stays put while the table scrolls and never wider than the screen. */}
                      <div className="sticky left-0 box-border w-[100cqw] max-w-full px-4 py-2 sm:pl-12">
                        <TaskDetail task={task} kind={kind} expected={measurement.options.count} />
                      </div>
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
    </div>
    </Panel>
  );
}

function TaskDetail({ task, kind, expected }: { task: Task; kind: Kind; expected: number }) {
  return (
    <>
      {kind === "http" ? (
        <HttpDetailView task={task} />
      ) : kind === "tls" ? (
        <CertDetailView task={task} />
      ) : kind === "dns" ? (
        <DnsDetailView task={task} />
      ) : kind === "traceroute" ? (
        <RouteDetailView task={task} />
      ) : (
        <Attempts task={task} kind={kind} expected={expected} />
      )}
      <div className="space-y-1 pb-1 text-sm">
        {task.error_message && kind !== "http" && kind !== "tls" && <p className="text-muted-foreground">{task.error_message}</p>}
        {task.tested_ip && (
          <p className="text-muted-foreground lg:hidden">
            Tested <span className="font-mono text-xs">{task.tested_ip}</span>
            {task.node.provider ? ` · ${task.node.provider}` : ""}
            {task.node.asn ? ` · AS${task.node.asn}` : ""}
          </p>
        )}
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
            <Badge
              key={seq}
              variant="outline"
              title={sample?.status === "error" ? explainError(sample.error_code) : undefined}
              className={cn(
                "h-auto px-2 py-1 text-xs tabular-nums",
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
            </Badge>
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
