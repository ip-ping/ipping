"use client";

import { useEffect, useState } from "react";

import { api, errorMessage, type Schemas } from "@/lib/api/client";

export type LocationEstimate = Schemas["LocationEstimateOut"];

/** The estimated network location of a finished measurement. `enabled` stays false while it runs. */
export function useLocation(measurementId: string, enabled: boolean) {
  const [estimate, setEstimate] = useState<LocationEstimate | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    api<LocationEstimate>("GET", `/measurements/${measurementId}/location`)
      .then((result) => !cancelled && setEstimate(result))
      .catch((e) => !cancelled && setError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [measurementId, enabled]);

  return { estimate, error };
}
