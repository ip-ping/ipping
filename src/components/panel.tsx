import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The frame everything on a page sits in: a hairline box with a small caps label on a ruled
 * header and a registration tick in each corner, like a sheet of a survey.
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
    <section className={cn("relative min-w-0 border bg-card", className)}>
      <Ticks />
      {(label || meta) && (
        <header className="flex min-h-8 items-center justify-between gap-3 border-b px-3 py-1.5">
          <h2 className="label">{label}</h2>
          {meta && <div className="label flex items-center gap-3 text-foreground/70">{meta}</div>}
        </header>
      )}
      <div className={cn(!flush && "p-3 sm:p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

const corner = "pointer-events-none absolute size-2 border-foreground/70";

function Ticks() {
  return (
    <>
      <span aria-hidden className={cn(corner, "-top-px -left-px border-t-2 border-l-2")} />
      <span aria-hidden className={cn(corner, "-top-px -right-px border-t-2 border-r-2")} />
      <span aria-hidden className={cn(corner, "-bottom-px -left-px border-b-2 border-l-2")} />
      <span aria-hidden className={cn(corner, "-right-px -bottom-px border-r-2 border-b-2")} />
    </>
  );
}
