"use client";

import { useEffect, useState } from "react";

import { api, type Schemas, type Task } from "@/lib/api/client";

export type MeasurementAddresses = Schemas["MeasurementAddressesOut"];

/**
 * What the IP databases say about each address a measurement's nodes tested, from `GET /measurements/{id}/addresses`.
 * It belongs to the measurement, so it does not depend on who may use the standalone lookup. Asked again when the set of
 * tested addresses changes (they appear as nodes report them); null while there is nothing to show, or when the backend is
 * too old to have the endpoint, so the page can leave the information out without failing.
 */
export function useAddresses(measurementId: string, tasks: readonly Task[]): MeasurementAddresses | null {
  const key = [...new Set(tasks.map((t) => t.tested_ip).filter((ip): ip is string => !!ip))].sort().join(",");
  const [found, setFound] = useState<{ key: string; data: MeasurementAddresses | null }>({ key: "", data: null });

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    api<MeasurementAddresses>("GET", `/measurements/${measurementId}/addresses`).then(
      (data) => !cancelled && setFound({ key, data }),
      () => !cancelled && setFound({ key, data: null }),
    );
    return () => {
      cancelled = true;
    };
  }, [measurementId, key]);

  return found.key === key ? found.data : null;
}
