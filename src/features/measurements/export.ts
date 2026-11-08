import type { Measurement, Task } from "@/lib/api/client";
import { ms } from "@/lib/format";

import { daysUntil } from "./certs";
import { describeAnswer } from "./dns-groups";
import { hopStats } from "./hops";
import { KIND_INFO, kindOf } from "./kinds";

export type ExportFormat = "json" | "csv" | "text";

const num = (value: number | null | undefined) => (value == null ? "" : String(Math.round(value * 1000) / 1000));
const msOf = (us: number | null | undefined) => (us == null ? null : us / 1000);

/**
 * One cell of a CSV file. Quoted when it has to be, and a cell that a spreadsheet would read as a formula
 * (it starts with `=`, `+`, `-`, `@`, a tab or a return) gets a leading apostrophe, because the text of a
 * result (a DNS answer, a server name) comes from other people's machines.
 */
export function csvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const COMMON = ["node", "country", "city", "provider", "asn", "status", "tested_ip", "error"] as const;

type Row = Record<string, string | number | null | undefined>;

function kindColumns(m: Measurement, t: Task): Row {
  const kind = kindOf(m);
  const s = t.summary;
  const first = t.samples[0];
  if (kind === "http") {
    const h = first?.http;
    return {
      http_status: h?.status_code,
      total_ms: num(msOf(h?.total_us)),
      dns_ms: num(msOf(h?.dns_us)),
      connect_ms: num(msOf(h?.connect_us)),
      tls_ms: num(msOf(h?.tls_us)),
      first_byte_ms: num(msOf(h?.ttfb_us)),
      tls_verified: h?.tls ? String(h.tls.verified) : "",
      tls_not_after: h?.tls?.not_after ?? "",
      server: h?.server,
    };
  }
  if (kind === "tls") {
    const d = first?.tls;
    const cert = d?.tls;
    return {
      trusted: cert ? String(cert.verified) : "",
      verify_error: cert?.verify_error,
      subject: cert?.subject,
      issuer: cert?.issuer,
      not_before: cert?.not_before,
      not_after: cert?.not_after,
      days_left: daysUntil(cert?.not_after) ?? "",
      version: cert?.version,
      names: (d?.names ?? []).join(" | "),
      chain: d?.chain,
      handshake_ms: num(msOf(d?.tls_us)),
      total_ms: num(msOf(d?.total_us)),
    };
  }
  if (kind === "traceroute") {
    return {
      reached: s?.reached == null ? "" : String(s.reached),
      hops: t.samples.at(-1)?.hop?.ttl,
      answered: s?.received,
      destination_ms: num(s?.median_ms),
      rounds: m.options.count,
      // with several rounds, the share of the probes to the destination that got no answer
      destination_loss_pct: (() => {
        const last = t.samples.at(-1)?.hop;
        return last?.reached && last.sent != null ? num(hopStats((last.rtts_us ?? []).map((us) => us / 1000), last.sent).lossPct) : "";
      })(),
    };
  }
  if (kind === "dns") {
    const d = first?.dns;
    const ttls = (d?.answers ?? []).map((a) => a.ttl);
    return {
      record_type: d?.record_type ?? m.options.record_type,
      resolver: d?.resolver ?? m.options.resolver,
      rcode: d?.rcode,
      answers: (d?.answers ?? []).map((a) => `${a.type} ${a.data}`).join(" | "),
      min_ttl: ttls.length ? Math.min(...ttls) : "",
      time_ms: num(first?.rtt_ms),
    };
  }
  return {
    sent: s?.sent,
    received: s?.received,
    loss_pct: s?.loss_pct,
    min_ms: num(s?.min_ms),
    median_ms: num(s?.median_ms),
    avg_ms: num(s?.avg_ms),
    max_ms: num(s?.max_ms),
  };
}

/** One row per node: who they are, how their task ended, and the numbers that matter for the kind. */
export function toCsv(m: Measurement): string {
  const rows: Row[] = m.tasks.map((t) => ({
    node: t.node.name,
    country: t.node.country,
    city: t.node.city,
    provider: t.node.provider,
    asn: t.node.asn,
    status: t.status,
    tested_ip: t.tested_ip,
    error: t.error_message,
    ...kindColumns(m, t),
  }));
  const columns = [...new Set([...COMMON, ...rows.flatMap((r) => Object.keys(r))])];
  return [columns.join(","), ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(","))].join("\r\n") + "\r\n";
}

export function toJson(m: Measurement, now = new Date()): string {
  return JSON.stringify({ exported_at: now.toISOString(), exported_from: "ipping", ...m }, null, 2) + "\n";
}

function when(m: Measurement): string {
  return new Date(m.created_at).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

/** A plain-text report in the spirit of what `ping` or `traceroute` would print, for pasting into a ticket. */
export function toText(m: Measurement): string {
  const kind = kindOf(m);
  const lines: string[] = [];
  const dnsNote = kind === "dns" ? `, ${m.options.record_type ?? "A"} records via ${m.options.resolver ?? "system"}` : "";
  const detail =
    kind === "ping" || kind === "tcp" ? `, ${m.options.count} ${KIND_INFO[kind].unit.many} per node` : "";
  lines.push(`${KIND_INFO[kind].label} ${m.target.host}${m.options.port ? `:${m.options.port}` : ""} (${when(m)}${dnsNote}${detail})`);
  lines.push("");
  const width = Math.max(10, ...m.tasks.map((t) => `${t.node.name}, ${t.node.country ?? "?"}`.length));
  for (const t of m.tasks) {
    const name = `${t.node.name}, ${t.node.country ?? "?"}`.padEnd(width);
    const s = t.summary;
    if (kind === "http") {
      const h = t.samples[0]?.http;
      lines.push(
        h?.status_code != null
          ? `${name}  ${h.status_code}  ${ms(msOf(h.total_us))} ms  (dns ${ms(msOf(h.dns_us))}, connect ${ms(msOf(h.connect_us))}, tls ${ms(msOf(h.tls_us))}, first byte ${ms(msOf(h.ttfb_us))})`
          : `${name}  ${t.samples[0]?.status === "timeout" ? "timed out" : (t.samples[0]?.error_code ?? t.status)}`,
      );
    } else if (kind === "tls") {
      const cert = t.samples[0]?.tls?.tls;
      if (cert) {
        const days = daysUntil(cert.not_after);
        const expiry = cert.not_after
          ? `  expires ${cert.not_after.slice(0, 10)}${days === null ? "" : days < 0 ? ` (${-days} days ago)` : ` (in ${days} days)`}`
          : "";
        lines.push(
          `${name}  ${cert.verified ? "trusted" : `NOT trusted (${cert.verify_error ?? "unknown"})`}  ${cert.version ?? "?"}${expiry}  ${ms(msOf(t.samples[0]?.tls?.total_us))} ms`,
        );
      } else {
        lines.push(`${name}  ${t.samples[0]?.status === "timeout" ? "timed out" : (t.samples[0]?.error_code ?? t.status)}`);
      }
    } else if (kind === "traceroute") {
      lines.push(`${name}  ${s?.reached ? `reached in ${t.samples.at(-1)?.hop?.ttl} hops, ${ms(s.median_ms)} ms` : "destination not reached"}`);
      for (const sample of t.samples) {
        const hop = sample.hop;
        if (!hop) continue;
        const who = hop.ip ?? (hop.private ? "(private network)" : "*");
        if (hop.sent != null) {
          // a repeated trace: loss and spread, as mtr prints them
          const rtts = (hop.rtts_us ?? []).map((us) => us / 1000);
          const stats = hopStats(rtts, hop.sent);
          const spread = rtts.length ? `best/avg/worst = ${ms(stats.best)}/${ms(stats.avg)}/${ms(stats.worst)} ms` : "";
          lines.push(`  ${String(hop.ttl).padStart(2)}  ${who.padEnd(40)}  ${`${Number(stats.lossPct.toFixed(1))}% loss`.padEnd(10)}  ${spread}`.trimEnd());
          continue;
        }
        const times = (hop.rtts_us ?? []).map((us) => ms(us / 1000)).join("  ");
        lines.push(`  ${String(hop.ttl).padStart(2)}  ${who.padEnd(40)}  ${times}${times ? " ms" : ""}`);
      }
    } else if (kind === "dns") {
      const answer = describeAnswer(t);
      lines.push(
        `${name}  ${answer ? answer.lines.join(", ") : "waiting"}${t.samples[0]?.rtt_ms != null ? `  ${ms(t.samples[0].rtt_ms)} ms` : ""}`,
      );
    } else {
      lines.push(
        s && s.received > 0
          ? `${name}  ${s.received}/${s.sent} received  min/median/avg/max = ${ms(s.min_ms)}/${ms(s.median_ms)}/${ms(s.avg_ms)}/${ms(s.max_ms)} ms  loss ${s.loss_pct}%`
          : `${name}  ${s ? `0/${s.sent} received` : (t.error_message ?? t.status)}`,
      );
    }
  }
  lines.push("");
  lines.push(`${m.stats.nodes_responding} of ${m.stats.nodes_total} nodes answered. Measured with ipping.`);
  return lines.join("\n") + "\n";
}

/** A name for a downloaded file: what was measured and when, safe for any file system. */
export function exportFilename(m: Measurement, extension: string): string {
  const host = m.target.host.replace(/[^a-z0-9.-]+/gi, "_").slice(0, 60);
  const stamp = new Date(m.created_at).toISOString().replace(/[-:]/g, "").slice(0, 13).replace("T", "-");
  return `ipping-${kindOf(m)}-${host}-${stamp}.${extension}`;
}

export function exportAs(m: Measurement, format: ExportFormat): { text: string; mime: string; extension: string } {
  switch (format) {
    case "json":
      return { text: toJson(m), mime: "application/json", extension: "json" };
    case "csv":
      return { text: toCsv(m), mime: "text/csv;charset=utf-8", extension: "csv" };
    case "text":
      return { text: toText(m), mime: "text/plain;charset=utf-8", extension: "txt" };
  }
}
