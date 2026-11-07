import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The hover readout every chart shares: positioned in pixels inside the chart, values first and the names
 * after them. It only ever repeats what the table below the chart already says, so it is hidden from
 * screen readers (the rows carry their own labels).
 */
export function ChartTip({
  x,
  y,
  width,
  children,
  className,
}: {
  x: number;
  y: number;
  width: number;
  children: ReactNode;
  className?: string;
}) {
  const shift = x < 130 ? "0%" : x > width - 130 ? "-100%" : "-50%";
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute z-10 w-max max-w-[15rem] border border-foreground/30 bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-[3px_3px_0_0_var(--ink-faint)]",
        className,
      )}
      style={{ left: x, top: y - 6, transform: `translate(${shift}, -100%)` }}
    >
      {children}
    </div>
  );
}

export function TipTitle({ name, place }: { name: string; place?: string }) {
  return (
    <div className="mb-1">
      <div className="figure text-sm font-semibold tracking-[-0.01em]">{name}</div>
      {place && <div className="label normal-case tracking-normal">{place}</div>}
    </div>
  );
}

export function TipRow({ k, v, swatch }: { k: string; v: ReactNode; swatch?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-5">
      <span className="label flex items-center gap-1.5 normal-case tracking-normal">
        {swatch && <span className="inline-block size-2" style={{ background: swatch }} />}
        {k}
      </span>
      <span className="num font-medium">{v}</span>
    </div>
  );
}
