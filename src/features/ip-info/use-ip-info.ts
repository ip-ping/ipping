"use client";

import { useEffect, useState } from "react";

import { api, ApiError } from "@/lib/api/client";

import type { IpInfo } from "./describe";

/** What came of one lookup: the data, or why there is none (the API can be off, or for API keys or administrators only). */
export type Lookup = { info: IpInfo } | { error: ApiError | Error };

const pending = new Map<string, Promise<IpInfo>>();

/** One address, asked of ipping's own `GET /api/v1/ip/{address}`. An answer is kept for the page's life; a failure is not. */
export function lookupIp(address: string | null): Promise<IpInfo> {
  const key = address ?? "";
  let promise = pending.get(key);
  if (!promise) {
    promise = api<IpInfo>("GET", address ? `/ip/${encodeURIComponent(address)}` : "/ip");
    promise.catch(() => pending.delete(key));
    pending.set(key, promise);
  }
  return promise;
}

/**
 * What the IP databases say about each of `addresses`, as the answers come in. Anything that cannot be had (the lookup is
 * off, needs an API key, the databases are not installed, too many lookups) is an `error` for that address, so the page
 * can leave the information out without failing.
 */
export function useIpInfos(addresses: readonly string[]): Record<string, Lookup> {
  const key = [...new Set(addresses)].sort().join(",");
  const [results, setResults] = useState<{ key: string; byAddress: Record<string, Lookup> }>({ key: "", byAddress: {} });

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const wanted = key.split(",");
    Promise.all(
      wanted.map((address) =>
        lookupIp(address).then(
          (info): [string, Lookup] => [address, { info }],
          (error): [string, Lookup] => [address, { error: error instanceof Error ? error : new Error("Something went wrong.") }],
        ),
      ),
    ).then((pairs) => {
      if (!cancelled) setResults({ key, byAddress: Object.fromEntries(pairs) });
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return results.key === key ? results.byAddress : {};
}

/** Whether a failed lookup means "this viewer cannot have it here" (as opposed to a hiccup worth showing). */
export function isUnavailable(lookup: Lookup | undefined): boolean {
  return !!lookup && "error" in lookup && lookup.error instanceof ApiError && [401, 403, 404, 503].includes(lookup.error.status);
}
