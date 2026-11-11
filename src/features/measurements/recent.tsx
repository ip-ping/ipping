"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Panel } from "@/components/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type Measurement } from "@/lib/api/client";
import { ago } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";

import { kindOf } from "./kinds";
import { MeasurementStatus } from "./status";

/**
 * This browser session's latest measurements. Each is two lines: the address in full on the first (it breaks onto a second line
 * rather than being cut: an IPv6 address is long and is what you look for), and under it what was run, when, how many
 * nodes answered (a small bar) and how it ended.
 */
export function RecentMeasurements({ className }: { className?: string }) {
  const { t, lang } = useI18n();
  const [items, setItems] = useState<Measurement[] | null>(null);
  useEffect(() => {
    api<Measurement[]>("GET", "/measurements?limit=8")
      .then(setItems)
      .catch(() => setItems([]));
  }, []);
  const title = t("home.recent.title");
  if (items === null) {
    return (
      <Panel label={title} className={className} flush>
        <div className="divide-y" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2 px-4 py-3">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-full" />
            </div>
          ))}
        </div>
      </Panel>
    );
  }
  if (items.length === 0) {
    return (
      <Panel label={title} className={className}>
        <p className="text-sm text-muted-foreground">{t("home.recent.empty")}</p>
      </Panel>
    );
  }
  return (
    <Panel label={title} meta={<span className="tabular-nums">{items.length}</span>} className={className} flush>
      <ul className="divide-y">
        {items.map((m) => {
          const { nodes_responding: got, nodes_total: all } = m.stats;
          return (
            <li key={m.id}>
              <Link
                href={`/measurements/${m.id}`}
                className="block space-y-1.5 px-4 py-3 text-sm outline-none transition-colors hover:bg-signal-soft focus-visible:bg-signal-soft"
              >
                <div className="break-all font-mono text-xs leading-snug sm:text-sm">
                  {m.target.host}
                  {m.options.port ? <span className="text-muted-foreground">:{m.options.port}</span> : null}
                </div>
                <div className="flex items-center gap-x-2 text-xs text-muted-foreground">
                  <span className="shrink-0">{t(`kind.${kindOf(m)}`)}</span>
                  <span aria-hidden>·</span>
                  <span className="min-w-0 truncate" title={new Date(m.created_at).toLocaleString(lang)}>
                    {ago(m.created_at, lang)}
                  </span>
                  <span className="ml-auto flex shrink-0 items-center gap-2" title={`${got} of ${all} nodes answered`}>
                    <span aria-hidden className="relative h-1.5 w-10 bg-foreground/12">
                      <span className="absolute inset-y-0 left-0 bg-signal" style={{ width: `${all ? (got * 100) / all : 0}%` }} />
                    </span>
                    <span className="tabular-nums">
                      {got}/{all}
                    </span>
                  </span>
                  <MeasurementStatus status={m.status} />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
