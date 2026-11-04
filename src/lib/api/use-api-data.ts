"use client";

import { useCallback, useEffect, useState } from "react";

import { api, errorMessage } from "./client";

/** GET `path` (relative to /api/v1), optionally refreshing on an interval. */
export function useApiData<T>(path: string, refreshMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setData(await api<T>("GET", path));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [path]);

  useEffect(() => {
    let live = true;
    const run = () => live && void reload();
    run();
    const timer = refreshMs ? setInterval(run, refreshMs) : undefined;
    return () => {
      live = false;
      if (timer) clearInterval(timer);
    };
  }, [reload, refreshMs]);

  return { data, error, reload, setData };
}
