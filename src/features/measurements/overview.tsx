import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { Measurement } from "@/lib/api/client";
import { ms, pct } from "@/lib/format";

import { TERMINAL_TASK } from "./summary";

function Stat({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        {hint && <div className="truncate text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

export function Overview({ measurement }: { measurement: Measurement }) {
  const { tasks, stats } = measurement;
  const done = tasks.filter((t) => TERMINAL_TASK.has(t.status)).length;
  const nameOf = (id: string | null | undefined) =>
    tasks.find((t) => t.id === id)?.node.name;

  const sent = tasks.reduce((n, t) => n + (t.summary?.sent ?? 0), 0);
  const received = tasks.reduce((n, t) => n + (t.summary?.received ?? 0), 0);
  // Only echo requests that were actually sent can be lost; offline nodes are not in this sum.
  const loss = sent ? ((sent - received) * 100) / sent : null;

  const testedIps = [...new Set(tasks.map((t) => t.tested_ip).filter(Boolean))];

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>
            {done} of {tasks.length} nodes finished
          </span>
          <span>{measurement.status === "running" ? "Waiting for the rest…" : ""}</span>
        </div>
        <Progress value={tasks.length ? (done * 100) / tasks.length : 100} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          title="Responding nodes"
          value={`${stats.nodes_responding} / ${stats.nodes_total}`}
          hint={stats.nodes_failed ? `${stats.nodes_failed} could not complete` : undefined}
        />
        <Stat
          title="Fastest (median)"
          value={stats.fastest_median_ms == null ? "–" : `${ms(stats.fastest_median_ms)} ms`}
          hint={nameOf(stats.fastest_task_id)}
        />
        <Stat
          title="Slowest (median)"
          value={stats.slowest_median_ms == null ? "–" : `${ms(stats.slowest_median_ms)} ms`}
          hint={nameOf(stats.slowest_task_id)}
        />
        <Stat
          title="Packet loss"
          value={pct(loss)}
          hint={sent ? `${sent - received} of ${sent} echo requests` : undefined}
        />
      </div>
      {measurement.dns_mode === "regional" && testedIps.length > 1 && (
        <p className="text-sm text-muted-foreground">
          Nodes resolved the name to different addresses ({testedIps.join(", ")}), so these
          results measure different servers.
        </p>
      )}
    </div>
  );
}
