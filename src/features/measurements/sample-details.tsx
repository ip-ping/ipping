import { CheckCircle2Icon, LockIcon, LockOpenIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { Sample, Task } from "@/lib/api/client";
import { ms } from "@/lib/format";
import { cn } from "@/lib/utils";

import { explainError } from "./errors";

type Http = NonNullable<Sample["http"]>;
type Tls = NonNullable<Http["tls"]>;

const us = (value: number | null | undefined) => (value == null ? null : value / 1000);

/** A status code, coloured by what it means. */
export function StatusCode({ code }: { code: number | null | undefined }) {
  if (code == null) return <span className="text-muted-foreground">–</span>;
  const variant = code >= 400 ? "destructive" : code >= 300 ? "secondary" : "default";
  return <Badge variant={variant}>{code}</Badge>;
}

/** Days until the certificate expires (negative once it has), or null if unknown. */
export function daysLeft(tls: Tls | null | undefined, now = Date.now()): number | null {
  if (!tls?.not_after) return null;
  return Math.floor((Date.parse(tls.not_after) - now) / 86_400_000);
}

export function CertificateBadge({ tls }: { tls: Tls | null | undefined }) {
  if (!tls) return <span className="text-muted-foreground">–</span>;
  const days = daysLeft(tls);
  if (!tls.verified)
    return (
      <Badge variant="destructive">
        <LockOpenIcon /> not trusted
      </Badge>
    );
  if (days !== null && days < 0)
    return <Badge variant="destructive">expired {-days} d ago</Badge>;
  return (
    <Badge variant={days !== null && days < 14 ? "secondary" : "outline"}>
      <LockIcon /> {days === null ? "valid" : `${days} d left`}
    </Badge>
  );
}

const PHASES = [
  { key: "dns_us", label: "DNS", color: "bg-chart-1" },
  { key: "connect_us", label: "Connect", color: "bg-chart-2" },
  { key: "tls_us", label: "TLS", color: "bg-chart-3" },
  { key: "ttfb_us", label: "First byte", color: "bg-chart-4" },
] as const;

function Timings({ http }: { http: Http }) {
  const parts = PHASES.map((p) => ({ ...p, value: http[p.key] ?? 0 }));
  const sum = parts.reduce((n, p) => n + p.value, 0);
  if (sum <= 0) return null;
  return (
    <div className="space-y-1.5">
      <div className="flex h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label="Time spent in each phase">
        {parts.map((p) => (
          <div key={p.key} className={p.color} style={{ width: `${(p.value / sum) * 100}%` }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {parts
          .filter((p) => p.value > 0 || p.key === "dns_us")
          .map((p) => (
            <span key={p.key} className="inline-flex items-center gap-1.5">
              <span className={cn("size-2 rounded-full", p.color)} />
              {p.label} <span className="tabular-nums text-foreground">{ms(us(p.value))} ms</span>
            </span>
          ))}
        {http.total_us != null && (
          <span>
            Total <span className="tabular-nums text-foreground">{ms(us(http.total_us))} ms</span>
            {(http.redirects?.length ?? 0) > 0 && " (all requests)"}
          </span>
        )}
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-24 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function when(value: string | null | undefined) {
  return value ? new Date(value).toISOString().slice(0, 10) : "?";
}

export function HttpDetailView({ task }: { task: Task }) {
  const sample = task.samples[0];
  const http = sample?.http;
  if (!sample) return <p className="text-muted-foreground">Waiting for the node…</p>;
  const failed = sample.status !== "ok";
  const final =
    http?.final_host != null
      ? `${http.final_scheme ?? "https"}://${http.final_host}${http.final_path ?? "/"}`
      : null;
  return (
    <div className="space-y-3 py-1 text-sm">
      {failed && (
        <p className="font-medium text-destructive">
          {sample.status === "timeout" ? explainError("timeout") : explainError(sample.error_code)}
          {task.error_message && <span className="font-normal text-muted-foreground"> — {task.error_message}</span>}
        </p>
      )}
      {http && <Timings http={http} />}
      <dl className="grid gap-1.5 sm:grid-cols-2">
        {final && <Fact label="Requested">{<span className="font-mono text-xs">{final}</span>}</Fact>}
        {http?.status_code != null && (
          <Fact label="Status">
            <StatusCode code={http.status_code} /> <span className="text-muted-foreground">{http.http_version}</span>
          </Fact>
        )}
        {http?.server && <Fact label="Server">{http.server}</Fact>}
        {http?.content_type && <Fact label="Content type">{http.content_type}</Fact>}
      </dl>
      {(http?.redirects?.length ?? 0) > 0 && (
        <div className="space-y-1">
          <div className="text-muted-foreground">Redirects</div>
          <ol className="space-y-1 font-mono text-xs">
            {http!.redirects!.map((r, i) => (
              <li key={i}>
                {r.status_code} →{" "}
                {r.location_host
                  ? `${r.location_scheme ?? "https"}://${r.location_host}${r.location_port && ![80, 443].includes(r.location_port) ? `:${r.location_port}` : ""}${r.location_path ?? "/"}`
                  : "(unreadable address)"}{" "}
                <span className="font-sans text-muted-foreground">{r.followed ? "followed" : "not followed"}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {http?.tls && <TlsView tls={http.tls} />}
    </div>
  );
}

function TlsView({ tls }: { tls: Tls }) {
  return (
    <div className="space-y-1.5 rounded-md border bg-background/60 p-3">
      <div className="flex flex-wrap items-center gap-2 font-medium">
        {tls.verified ? <CheckCircle2Icon className="size-4 text-primary" /> : <LockOpenIcon className="size-4 text-destructive" />}
        Certificate <CertificateBadge tls={tls} />
        <span className="font-normal text-muted-foreground">
          {tls.version} {tls.cipher}
        </span>
      </div>
      {!tls.verified && tls.verify_error && (
        <p className="text-destructive">Not trusted: {tls.verify_error}. The node sent no request over this connection.</p>
      )}
      <dl className="grid gap-1.5">
        {tls.subject && <Fact label="Issued to">{tls.subject}</Fact>}
        {tls.issuer && <Fact label="Issued by">{tls.issuer}</Fact>}
        {tls.not_before && (
          <Fact label="Valid">
            {when(tls.not_before)} to {when(tls.not_after)}
          </Fact>
        )}
      </dl>
    </div>
  );
}

export function RouteDetailView({ task }: { task: Task }) {
  if (task.samples.length === 0) return <p className="text-muted-foreground">Waiting for the node…</p>;
  const reached = task.samples.some((s) => s.hop?.reached);
  return (
    <div className="space-y-2 py-1 text-sm">
      <table className="w-full max-w-2xl text-left">
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th className="w-10 py-1 font-normal">Hop</th>
            <th className="py-1 font-normal">Router</th>
            <th className="py-1 text-right font-normal">Round trips (ms)</th>
          </tr>
        </thead>
        <tbody>
          {task.samples.map((s) => {
            const hop = s.hop;
            return (
              <tr key={s.seq} className={cn(hop?.reached && "font-medium")}>
                <td className="py-0.5 tabular-nums text-muted-foreground">{hop?.ttl ?? s.seq + 1}</td>
                <td className="py-0.5 font-mono text-xs">
                  {hop?.ip ??
                    (hop?.private ? (
                      <span className="font-sans text-muted-foreground">a router inside a private network</span>
                    ) : (
                      <span className="text-muted-foreground">* no answer</span>
                    ))}
                  {hop?.reached && <span className="ml-2 font-sans text-primary">destination</span>}
                </td>
                <td className="py-0.5 text-right tabular-nums">
                  {(hop?.rtts_us?.length ?? 0) > 0 ? hop!.rtts_us!.map((v) => ms(v / 1000)).join("  ") : "–"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {task.status === "completed" && !reached && (
        <p className="text-muted-foreground">
          The destination did not answer. Many networks drop these probes, so this does not mean it
          is down.
        </p>
      )}
    </div>
  );
}
