import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** The key above a chart: a mark, then what it means in plain words. Labels stay in text colour. */
export function Legend({ children, className }: { children: ReactNode; className?: string }) {
  return <ul className={cn("mb-2 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted-foreground", className)}>{children}</ul>;
}

export function Key({ glyph, children }: { glyph: ReactNode; children: ReactNode }) {
  return (
    <li className="inline-flex items-center gap-1.5">
      <svg width="22" height="12" viewBox="0 0 22 12" aria-hidden className="shrink-0 overflow-visible">
        {glyph}
      </svg>
      <span>{children}</span>
    </li>
  );
}

/** A plain coloured square, for chart series that are areas or bars. */
export function Swatch({ color }: { color: string }) {
  return <rect x="5" y="1" width="12" height="10" fill={color} />;
}
