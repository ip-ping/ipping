"use client";

import { CircleCheckIcon, CircleXIcon, TriangleAlertIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { Panel } from "@/components/panel";
import type { Measurement } from "@/lib/api/client";
import type { Focus } from "@/lib/use-focus";
import { cn } from "@/lib/utils";

import { type CertGroup, type CertState, certState, certificatesOf, commonName, daysUntil } from "./certs";
import { TERMINAL_TASK } from "./summary";

const SHOW_NAMES = 12;
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" }) : "unknown");

/** How the certificate is doing, in words and a shape: colour alone never carries it. */
function Verdict({ state, days }: { state: CertState; days: number | null }) {
  if (state === "bad") {
    const expired = days !== null && days < 0;
    return (
      <span className="inline-flex items-center gap-1.5 font-semibold text-critical">
        <CircleXIcon className="size-4" aria-hidden />
        {expired ? `expired ${-(days as number)} ${-(days as number) === 1 ? "day" : "days"} ago` : "not trusted"}
      </span>
    );
  }
  const text = days === null ? "valid" : days === 0 ? "expires today" : `${days} ${days === 1 ? "day" : "days"} left`;
  return state === "soon" ? (
    <span className="inline-flex items-center gap-1.5 font-semibold text-warning">
      <TriangleAlertIcon className="size-4" aria-hidden />
      {text}: renew soon
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 font-semibold text-good">
      <CircleCheckIcon className="size-4" aria-hidden />
      trusted, {text}
    </span>
  );
}

/** From the day the certificate became valid to the day it stops, with today marked. */
function Validity({ group, state, now }: { group: CertGroup; state: CertState; now: number }) {
  const start = group.notBefore ? Date.parse(group.notBefore) : NaN;
  const end = group.notAfter ? Date.parse(group.notAfter) : NaN;
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
  const at = Math.min(1, Math.max(0, (now - start) / (end - start)));
  const fill = state === "bad" ? "bg-critical" : state === "soon" ? "bg-warning" : "bg-good";
  return (
    <div className="space-y-1" role="img" aria-label={`Valid from ${date(group.notBefore)} to ${date(group.notAfter)}; ${Math.round(at * 100)}% of that time has passed`}>
      <div className="relative h-2.5 bg-muted">
        <div className={cn("absolute inset-y-0 left-0", fill)} style={{ width: `${at * 100}%` }} />
        <div className="absolute -inset-y-1 w-0.5 bg-foreground" style={{ left: `calc(${at * 100}% - 1px)` }} title="today" />
      </div>
      <div className="label flex justify-between normal-case tracking-normal">
        <span>{date(group.notBefore)}</span>
        <span>today</span>
        <span>{date(group.notAfter)}</span>
      </div>
    </div>
  );
}

function Card({ group, many, now, focus }: { group: CertGroup; many: boolean; now: number; focus: Focus }) {
  const state = certState(group, now);
  const days = daysUntil(group.notAfter, now);
  const lit = group.nodeIds.includes(focus.active ?? "");
  return (
    <article
      className={cn("min-w-0 space-y-3 border p-3 sm:p-4", lit && "bg-signal-soft")}
      style={many ? { borderLeftWidth: 6, borderLeftColor: group.color === "none" ? undefined : group.color } : undefined}
      aria-label={`Certificate for ${commonName(group.subject)}, seen by ${group.nodeNames.length} ${group.nodeNames.length === 1 ? "node" : "nodes"}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="figure min-w-0 text-xl font-semibold tracking-[-0.02em] [overflow-wrap:anywhere] sm:text-2xl">{commonName(group.subject)}</h3>
        <Verdict state={state} days={days} />
      </div>
      {!group.verified && group.verifyError && (
        <p className="text-sm text-critical">
          {group.nodeIds.length === 1 ? "This node does not" : "These nodes do not"} trust it: {group.verifyError}. Nothing was sent over the connection.
        </p>
      )}
      <Validity group={group} state={state} now={now} />
      <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
        {group.issuer && (
          <div className="min-w-0">
            <dt className="label">Issued by</dt>
            <dd className="[overflow-wrap:anywhere]">{commonName(group.issuer)}</dd>
          </div>
        )}
        {group.version && (
          <div>
            <dt className="label">Connection</dt>
            <dd>
              {group.version}
              {group.chain != null ? `, ${group.chain} ${group.chain === 1 ? "certificate" : "certificates"} sent` : ""}
            </dd>
          </div>
        )}
      </dl>
      {group.names.length > 0 && (
        <div className="space-y-1">
          <div className="label">Valid for</div>
          <ul className="flex flex-wrap gap-1.5" aria-label="Names the certificate is valid for">
            {group.names.slice(0, SHOW_NAMES).map((name) => (
              <li key={name} className="border px-1.5 py-0.5 font-mono text-xs [overflow-wrap:anywhere]">
                {name}
              </li>
            ))}
            {group.names.length > SHOW_NAMES && (
              <li className="px-1.5 py-0.5 text-xs text-muted-foreground">+{group.names.length - SHOW_NAMES} more</li>
            )}
          </ul>
        </div>
      )}
      <div className="space-y-1">
        <div className="label">
          Seen by {group.nodeNames.length} {group.nodeNames.length === 1 ? "node" : "nodes"}
        </div>
        <ul className="flex flex-wrap gap-1.5" aria-label="Nodes that were shown this certificate">
          {group.nodeIds.map((id, i) => (
            <li key={id}>
              <button
                type="button"
                aria-pressed={focus.pinned === id}
                onClick={() => focus.pin(focus.pinned === id ? null : id)}
                onPointerEnter={() => focus.setHover(id)}
                onPointerLeave={() => focus.setHover(null)}
                onFocus={() => focus.setHover(id)}
                onBlur={() => focus.setHover(null)}
                className={cn(
                  "label inline-flex min-h-7 items-center border px-2 normal-case tracking-normal transition-colors hover:border-foreground/60",
                  focus.pinned === id && "border-foreground bg-foreground text-background",
                  focus.hover === id && focus.pinned !== id && "border-signal bg-signal-soft",
                )}
              >
                {group.nodeNames[i]}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}

/**
 * What certificate each node was shown. One card per distinct certificate: whether it is trusted, how long it
 * has left, what it is valid for and which nodes saw it. Several cards mean the nodes were not talking to the
 * same server, or the certificate is being replaced and some have not seen the new one yet.
 */
export function CertificatePanel({ measurement, focus }: { measurement: Measurement; focus: Focus }) {
  const { tasks } = measurement;
  // "today" is fixed when the page opens: a certificate does not change state while someone reads about it
  const [now] = useState(() => Date.now());
  const groups = useMemo(() => certificatesOf(tasks), [tasks]);
  const seen = groups.reduce((n, g) => n + g.nodeIds.length, 0);
  const waiting = tasks.filter((t) => !TERMINAL_TASK.has(t.status) && t.samples.length === 0).length;
  const noCertificate = tasks.length - seen - waiting;

  let headline: string;
  if (groups.length === 0) {
    headline = waiting > 0 ? "Waiting for the first handshake…" : "No node completed a handshake, so there is no certificate to show.";
  } else if (groups.length === 1) {
    headline = `${seen === tasks.length ? "All " : ""}${seen} ${seen === 1 ? "node was" : "nodes were"} shown the same certificate.`;
  } else {
    headline = `The nodes were shown ${groups.length} different certificates: a certificate being replaced, or several servers behind one name.`;
  }

  return (
    <Panel
      label="The certificate"
      meta={
        <>
          {groups.length > 1 && <span>{groups.length} different</span>}
          <span className="hidden sm:inline">Every number is in the table below.</span>
        </>
      }
    >
      <p className="mb-3 text-sm" aria-live="polite">
        {headline}
        {groups.length > 0 && noCertificate > 0 && (
          <span className="text-muted-foreground">
            {" "}
            {noCertificate} {noCertificate === 1 ? "node" : "nodes"} got none (see the table).
          </span>
        )}
      </p>
      <div className="grid gap-3 lg:grid-cols-2">
        {groups.map((group) => (
          <Card key={group.key} group={group} many={groups.length > 1} now={now} focus={focus} />
        ))}
      </div>
    </Panel>
  );
}
