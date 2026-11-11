"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Panel } from "@/components/panel";
import { api, type Measurement } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n/provider";

import { kindOf } from "./kinds";
import { MeasurementStatus } from "./status";

/** This browser session's latest measurements, each with how many nodes answered as a small bar. */
export function RecentMeasurements({ className }: { className?: string }) {
  const { t } = useI18n();
  const [items, setItems] = useState<Measurement[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    api<Measurement[]>("GET", "/measurements?limit=8")
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoaded(true));
  }, []);
  if (!loaded) return null;
  if (items.length === 0) {
    return (
      <Panel label={t("home.recent.title")} className={className}>
        <p className="text-sm text-muted-foreground">{t("home.recent.empty")}</p>
      </Panel>
    );
  }
  return (
    <Panel label={t("home.recent.title")} meta={<span className="tabular-nums">{items.length}</span>} className={className} flush>
      <ul className="divide-y">
        {items.map((m) => {
          const { nodes_responding: got, nodes_total: all } = m.stats;
          return (
            <li key={m.id}>
              <Link
                href={`/measurements/${m.id}`}
                className="group grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 text-sm outline-none transition-colors hover:bg-signal-soft focus-visible:bg-signal-soft sm:grid-cols-[5.5rem_minmax(0,1fr)_auto_auto] sm:px-4"
              >
                <span className="text-xs text-muted-foreground">{t(`kind.${kindOf(m)}`)}</span>
                <span className="min-w-0 truncate font-mono">
                  {m.target.host}
                  {m.options.port ? <span className="text-muted-foreground">:{m.options.port}</span> : null}
                </span>
                <span className="hidden items-center gap-2 sm:flex" title={`${got} of ${all} nodes answered`}>
                  <span aria-hidden className="relative h-1.5 w-16 bg-foreground/12">
                    <span className="absolute inset-y-0 left-0 bg-signal" style={{ width: `${all ? (got * 100) / all : 0}%` }} />
                  </span>
                  <span className="tabular-nums text-xs text-muted-foreground">
                    {got}/{all}
                  </span>
                </span>
                <MeasurementStatus status={m.status} />
              </Link>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
