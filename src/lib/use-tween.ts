"use client";

import { useEffect, useRef, useState } from "react";

/** A number that glides to its target instead of jumping: rings that grow as a node's best round trip improves. */
export function useTween(target: number, duration = 650): number {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  const current = useRef(target);

  useEffect(() => {
    const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || from.current === target) {
      current.current = target;
      setValue(target);
      return;
    }
    const start = performance.now();
    const origin = current.current;
    from.current = target;
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      current.current = origin + (target - origin) * eased;
      setValue(current.current);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  return value;
}
