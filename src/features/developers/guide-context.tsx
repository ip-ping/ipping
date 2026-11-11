"use client";

import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";

import type { Result, Values } from "./request";

/** What one operation's panel remembers: its form, and what the last press of Send came to. */
export type OpState = { values: Values; result?: Result; error?: string; busy?: boolean; note?: string };

type Guide = {
  /** The address of this site, which is what a script calls. Empty until the page is in a browser. */
  baseUrl: string;
  /** The API key typed on the page (kept for this tab only). */
  apiKey: string;
  setApiKey: (key: string) => void;
  /** The measurement a step started: later steps use it. */
  measurementId: string;
  setMeasurementId: (id: string) => void;
  op: (key: string) => OpState;
  patch: (key: string, change: Partial<OpState>) => void;
};

const STORAGE_KEY = "ipping.api-key";
const NONE: OpState = { values: {} };
const GuideContext = createContext<Guide | null>(null);

// The key lives in this tab's sessionStorage (gone when the tab closes), read as an external store so that the first paint matches the server's.
let remembered = ""; // used when storage is blocked: the key still works for as long as the page is open
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};
function readKey(): string {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) ?? remembered;
  } catch {
    return remembered;
  }
}
function writeKey(key: string): void {
  remembered = key;
  try {
    if (key) window.sessionStorage.setItem(STORAGE_KEY, key);
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // not kept in storage, still used
  }
  listeners.forEach((listener) => listener());
}
const noSubscription = () => () => {};

export function GuideProvider({ children }: { children: ReactNode }) {
  const baseUrl = useSyncExternalStore(noSubscription, () => window.location.origin, () => "");
  const apiKey = useSyncExternalStore(subscribe, readKey, () => "");
  const [measurementId, setMeasurementId] = useState("");
  const [ops, setOps] = useState<Record<string, OpState>>({});
  const setApiKey = writeKey;

  const op = useCallback((key: string) => ops[key] ?? NONE, [ops]);
  const patch = useCallback((key: string, change: Partial<OpState>) => setOps((all) => ({ ...all, [key]: { ...(all[key] ?? NONE), ...change } })), []);

  const value = useMemo<Guide>(
    () => ({ baseUrl, apiKey, setApiKey, measurementId, setMeasurementId, op, patch }),
    [baseUrl, apiKey, setApiKey, measurementId, op, patch],
  );
  return <GuideContext.Provider value={value}>{children}</GuideContext.Provider>;
}

export function useGuide(): Guide {
  const guide = useContext(GuideContext);
  if (!guide) throw new Error("useGuide needs a GuideProvider");
  return guide;
}
