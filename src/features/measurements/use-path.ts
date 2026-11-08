"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/api/client";

import type { Path } from "./route-geo";

/**
 * The networks and places the GeoIP databases give for a finished traceroute's routers. `null` until it has
 * been fetched; a failure leaves it `null` too, since the route is complete without it.
 */
export function usePath(measurementId: string, enabled: boolean): Path | null {
  const [path, setPath] = useState<Path | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    api<Path>("GET", `/measurements/${measurementId}/path`)
      .then((result) => !cancelled && setPath(result))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [measurementId, enabled]);

  return path;
}
