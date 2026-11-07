"use client";

import { useCallback, useMemo, useState } from "react";

/**
 * Which node the person is looking at, shared by the map, the charts and the table so that pointing at a
 * station lights its row everywhere. Hover is momentary; a pin (a click on a station or a chip) stays.
 */
export type Focus = {
  /** The node to highlight now: what is hovered, else what is pinned. */
  active: string | null;
  hover: string | null;
  pinned: string | null;
  setHover: (id: string | null) => void;
  pin: (id: string | null) => void;
};

export function useFocus(): Focus {
  const [hover, setHover] = useState<string | null>(null);
  const [pinned, pin] = useState<string | null>(null);
  const stableHover = useCallback((id: string | null) => setHover(id), []);
  const stablePin = useCallback((id: string | null) => pin(id), []);
  return useMemo(
    () => ({ active: hover ?? pinned, hover, pinned, setHover: stableHover, pin: stablePin }),
    [hover, pinned, stableHover, stablePin],
  );
}
