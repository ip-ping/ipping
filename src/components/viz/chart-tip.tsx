import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The hover readout every chart shares: positioned in pixels inside the chart, values first and the names
 * after them. It only ever repeats what the table below the chart already says.
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
  const left = x < 150 ? "0%" : x > width - 150 ? "-100%" : "-50%";
  return (
    <div
      role="status"
      className={cn(
        "pointer-events-none absolute z-10 w-max max-w-[15rem] -translate-y-full border border-foreground/30 bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-[3px_3px_0_0_var(--ink-faint)]",
        className,
      )}
      style={{ left: x, top: y - 8, transform: `translate(${left}, -100%)` }}
    >
      {children}
    </div>
  );
}

export function TipRow({ k, v, tone }: { k: string; v: ReactNode; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="label normal-case tracking-normal">{k}</span>
      <span className={cn("num font-medium", tone)}>{v}</span>
    </div>
  );
}
