import type { ReactNode } from "react";

import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * A shadcn Card with a titled header: `label` is the card's title, `meta` sits at the end of the header. `flush` removes
 * the padding so that a map, a graph or a table can run to the edges of the card.
 */
export function Panel({
  label,
  meta,
  children,
  className,
  bodyClassName,
  flush = false,
}: {
  label?: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** No padding: the content (a map, a table) runs to the edges. */
  flush?: boolean;
}) {
  return (
    <Card className={cn("min-w-0", flush && "gap-0 py-0", className)}>
      {(label || meta) && (
        <CardHeader className={cn(flush && "border-b py-3")}>
          {label && <CardTitle>{label}</CardTitle>}
          {meta && <CardAction className="flex items-center gap-3 text-xs text-muted-foreground">{meta}</CardAction>}
        </CardHeader>
      )}
      <CardContent className={cn(flush && "p-0", bodyClassName)}>{children}</CardContent>
    </Card>
  );
}
