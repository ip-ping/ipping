"use client";

import { useEffect, useRef, useState } from "react";

/** The width an element actually has, so a chart can lay itself out in real pixels and keep its text crisp. */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(Math.round(element.clientWidth));
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** A round upper bound and tick marks for an axis that starts at zero: 0, 25, 50, 75, 100. */
export function niceScale(max: number, target = 5): { max: number; ticks: number[] } {
  if (!(max > 0)) return { max: 1, ticks: [0, 1] };
  const raw = max / target;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / magnitude;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * magnitude;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return { max: top, ticks };
}

export const fmtMs = (ms: number | null | undefined) =>
  ms == null ? "–" : ms >= 100 ? String(Math.round(ms)) : ms >= 10 ? ms.toFixed(1) : ms.toFixed(2);

export const truncate = (text: string, chars: number) => (text.length > chars ? `${text.slice(0, Math.max(1, chars - 1))}…` : text);

/** Text for the tooltip of a chart: values lead, the label follows. */
export const SERIES_TEXT = "fill-foreground";
