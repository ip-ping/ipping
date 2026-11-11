"use client";

import { api } from "@/lib/api/client";

import type { IpInfo } from "./describe";

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
