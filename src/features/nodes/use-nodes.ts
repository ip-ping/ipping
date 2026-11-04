"use client";

import { useEffect, useState } from "react";

import { api, errorMessage, type PublicNode } from "@/lib/api/client";

/** The approved nodes and whether each is online right now, refreshed every few seconds. */
export function useNodes(refreshMs = 10_000) {
  const [nodes, setNodes] = useState<PublicNode[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api<PublicNode[]>("GET", "/nodes")
        .then((list) => {
          if (cancelled) return;
          setNodes(list);
          setError(null);
        })
        .catch((e) => !cancelled && setError(errorMessage(e)));
    void load();
    const timer = setInterval(load, refreshMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [refreshMs]);

  return { nodes, error };
}
