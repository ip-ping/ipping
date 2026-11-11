import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Task } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n/provider";
import type { MessageKey } from "@/lib/i18n/translate";

const LABELS: Record<string, { label: MessageKey; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  pending: { label: "task.queued", variant: "outline" },
  dispatched: { label: "task.sent", variant: "outline" },
  running: { label: "task.running", variant: "secondary" },
  completed: { label: "task.done", variant: "default" },
  failed: { label: "task.failed", variant: "destructive" },
  timed_out: { label: "task.timedOut", variant: "destructive" },
  node_disconnected: { label: "task.offline", variant: "destructive" },
  interrupted: { label: "task.interrupted", variant: "destructive" },
  cancelled: { label: "task.cancelled", variant: "outline" },
};

/**
 * Says what happened to the *node*. A node that went offline is not packet loss at the target,
 * so those statuses never share a label with "100% loss".
 */
export function TaskStatus({ task }: { task: Task }) {
  const { t } = useI18n();
  const entry = LABELS[task.status];
  const badge = <Badge variant={entry?.variant ?? "outline"}>{entry ? t(entry.label) : task.status}</Badge>;
  const retried = (task.attempts ?? 1) > 1;
  const note = [
    task.error_message,
    retried ? "Sent again after the service instance holding it stopped." : null,
  ]
    .filter(Boolean)
    .join(" ");
  if (!note) return badge;
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="cursor-help" />}>
        {badge}
        {retried && <span className="ml-1 text-xs text-muted-foreground">{t("task.retried")}</span>}
      </TooltipTrigger>
      <TooltipContent>{note}</TooltipContent>
    </Tooltip>
  );
}

export function MeasurementStatus({ status }: { status: string }) {
  const { t } = useI18n();
  const map: Record<string, MessageKey> = {
    running: "status.running",
    completed: "status.finished",
    cancelled: "status.cancelled",
    interrupted: "status.interrupted",
  };
  return (
    <Badge variant={status === "running" ? "secondary" : status === "completed" ? "default" : "outline"}>
      {map[status] ? t(map[status]) : status}
    </Badge>
  );
}
