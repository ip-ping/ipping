"use client";

import { Card, CardContent } from "@/components/ui/card";
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
    <div className="leading-none tabular-nums flex items-baseline gap-1.5 whitespace-nowrap text-[2.25rem] font-semibold sm:text-[2.6rem]">
      <span className={cn(item.alert && "text-signal")}>{text}</span>
      {item.unit && item.value != null && <span className="text-xs text-muted-foreground font-normal">{item.unit}</span>}
    </div>
  );
}

/** The headline numbers of a measurement: a shadcn Card for each, with a big figure and a line saying what it is. */
export function Readouts({ items, className }: { items: ReadoutItem[]; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 p-3", className)}>
      {items.map((item) => (
        <Card key={item.label} size="sm" className="min-w-0">
          <CardContent className="flex h-full min-w-0 flex-col justify-between gap-3">
            <div className="text-xs text-muted-foreground">{item.label}</div>
            <div className="min-w-0 space-y-1.5">
              <Figure item={item} />
              <div className="truncate text-xs text-muted-foreground">{item.hint ?? " "}</div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
