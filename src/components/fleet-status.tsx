"use client";

import { useNodes } from "@/features/nodes/use-nodes";

/** How many of the nodes are answering right now: the one number that says the service is alive. */
export function FleetStatus() {
  const { nodes, error } = useNodes();
  const total = nodes?.length ?? 0;
  const live = nodes?.filter((n) => n.online).length ?? 0;
  const text = error ? "offline" : nodes === null ? "…" : `${live}/${total} live`;
  return (
    <span
      className="label inline-flex items-center gap-2 text-foreground"
      title={error ? "The service cannot be reached" : `${live} of ${total} approved nodes are connected`}
    >
      <span
        aria-hidden
        className={
          "size-2 rounded-full " + (error ? "bg-critical" : live > 0 ? "live-dot bg-good" : "bg-muted-foreground/50")
        }
      />
      <span className="num tracking-normal normal-case">{text}</span>
    </span>
  );
}
