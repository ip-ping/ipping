"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Panel } from "@/components/panel";
import { api, type Measurement } from "@/lib/api/client";

import { KIND_INFO, kindOf } from "./kinds";
import { MeasurementStatus } from "./status";

/** This browser session's latest measurements, each with how many nodes answered as a small bar. */
export function RecentMeasurements() {
  const [items, setItems] = useState<Measurement[]>([]);
  useEffect(() => {
    api<Measurement[]>("GET", "/measurements?limit=8")
      .then(setItems)
      .catch(() => setItems([]));
  }, []);
  if (items.length === 0) return null;
  return (
    <Panel label="Recent in this browser" meta={<span className="tabular-nums">{items.length}</span>} flush>
      <ul className="divide-y">
        {items.map((m) => {
          const { nodes_responding: got, nodes_total: all } = m.stats;
          return (
            <li key={m.id}>
              <Link
                href={`/measurements/${m.id}`}
                className="group grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 text-sm outline-none transition-colors hover:bg-signal-soft focus-visible:bg-signal-soft sm:grid-cols-[5.5rem_minmax(0,1fr)_auto_auto] sm:px-4"
              >
                <span className="text-xs text-muted-foreground">{KIND_INFO[kindOf(m)].label}</span>
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
