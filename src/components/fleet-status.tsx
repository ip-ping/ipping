"use client";

import { Badge } from "@/components/ui/badge";
import { useNodes } from "@/features/nodes/use-nodes";
import { useI18n } from "@/lib/i18n/provider";

/** How many of the nodes are answering right now: the one number that says the service is alive. */
export function FleetStatus() {
  const { nodes, error } = useNodes();
  const { t } = useI18n();
  const total = nodes?.length ?? 0;
  const live = nodes?.filter((n) => n.online).length ?? 0;
  const text = error ? t("fleet.offline") : nodes === null ? "…" : t("fleet.live", { live, total });
  return (
    <Badge
      variant="outline"
      title={error ? t("fleet.titleDown") : t("fleet.titleOk", { live, total })}
    >
      <span
        aria-hidden
        className={"size-2 rounded-full " + (error ? "bg-critical" : live > 0 ? "live-dot bg-good" : "bg-muted-foreground/50")}
      />
      <span className="tabular-nums">{text}</span>
    </Badge>
  );
}
