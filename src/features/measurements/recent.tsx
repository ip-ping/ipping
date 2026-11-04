"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api, type Measurement } from "@/lib/api/client";

import { MeasurementStatus } from "./status";

/** This browser session's latest measurements. */
export function RecentMeasurements() {
  const [items, setItems] = useState<Measurement[]>([]);
  useEffect(() => {
    api<Measurement[]>("GET", "/measurements?limit=8")
      .then(setItems)
      .catch(() => setItems([]));
  }, []);
  if (items.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent in this browser</CardTitle>
      </CardHeader>
      <CardContent className="divide-y">
        {items.map((m) => (
          <Link
            key={m.id}
            href={`/measurements/${m.id}`}
            className="flex items-center justify-between gap-3 py-2 text-sm hover:text-foreground"
          >
            <span className="truncate font-mono">{m.target.host}</span>
            <span className="flex shrink-0 items-center gap-3 text-muted-foreground">
              {m.stats.nodes_responding}/{m.stats.nodes_total} nodes
              <MeasurementStatus status={m.status} />
            </span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
