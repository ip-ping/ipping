"use client";

import { useEffect, useState } from "react";

import { api, errorMessage, type Schemas } from "@/lib/api/client";

export type LocationEstimate = Schemas["LocationEstimateOut"];

/**
 * The estimated network location of a finished measurement. `enabled` stays false while it runs. When each node
 * resolved the name itself and they did not all get one address, the answer is for the address most nodes measured
 * and lists the others (`groups`); `ip` asks for another of them. The previous answer stays up while the next loads.
 */
export function useLocation(measurementId: string, enabled: boolean, ip: string | null = null) {
  const [estimate, setEstimate] = useState<LocationEstimate | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    api<LocationEstimate>("GET", `/measurements/${measurementId}/location${ip ? `?ip=${encodeURIComponent(ip)}` : ""}`)
      .then((result) => {
        if (cancelled) return;
        setEstimate(result);
        setError(null);
      })
      .catch((e) => !cancelled && setError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [measurementId, enabled, ip]);

  return { estimate, error };
}
