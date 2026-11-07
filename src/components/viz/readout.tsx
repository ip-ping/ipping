"use client";

import { ms } from "@/lib/format";
import { useTween } from "@/lib/use-tween";
import { cn } from "@/lib/utils";

export type ReadoutItem = {
  label: string;
  /** A number glides to each new value; leave it null and give `text` for anything else ("12 / 16"). */
  value?: number | null;
  format?: (n: number) => string;
  text?: string;
  unit?: string;
  hint?: string;
  /** Marks a value that wants attention: a lost probe, a failed node. */
  alert?: boolean;
};

function Figure({ item }: { item: ReadoutItem }) {
  const shown = useTween(item.value ?? 0, 600);
  const text = item.text ?? (item.value == null ? "–" : (item.format ?? ms)(shown));
  return (
    <div className="figure num flex items-baseline gap-1.5 whitespace-nowrap text-[2.25rem] leading-none font-semibold tracking-[-0.03em] sm:text-[2.6rem]">
      <span className={cn(item.alert && "text-signal")}>{text}</span>
      {item.unit && item.value != null && <span className="label text-xs font-normal tracking-wider">{item.unit}</span>}
    </div>
  );
}

/** The headline numbers of a measurement: big figures on a ruled grid, each with a line saying what it is. */
export function Readouts({ items, className }: { items: ReadoutItem[]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-2 gap-px bg-border", className)}>
      {items.map((item) => (
        <div key={item.label} className="flex min-w-0 flex-col justify-between gap-3 bg-card p-3 sm:p-4">
          <dt className="label">{item.label}</dt>
          <dd className="m-0 min-w-0 space-y-1.5">
            <Figure item={item} />
            <div className="truncate text-xs text-muted-foreground">{item.hint ?? " "}</div>
          </dd>
        </div>
      ))}
    </dl>
  );
}
