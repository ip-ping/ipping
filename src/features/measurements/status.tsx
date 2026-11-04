import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Task } from "@/lib/api/client";

const LABELS: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  pending: { label: "Queued", variant: "outline" },
  dispatched: { label: "Sent", variant: "outline" },
  running: { label: "Running", variant: "secondary" },
  completed: { label: "Done", variant: "default" },
  failed: { label: "Failed", variant: "destructive" },
  timed_out: { label: "No answer from node", variant: "destructive" },
  node_disconnected: { label: "Node went offline", variant: "destructive" },
  interrupted: { label: "Interrupted", variant: "destructive" },
  cancelled: { label: "Cancelled", variant: "outline" },
};

/**
 * Says what happened to the *node*. A node that went offline is not packet loss at the target,
 * so those statuses never share a label with "100% loss".
 */
export function TaskStatus({ task }: { task: Task }) {
  const entry = LABELS[task.status] ?? { label: task.status, variant: "outline" as const };
  const badge = <Badge variant={entry.variant}>{entry.label}</Badge>;
  if (!task.error_message) return badge;
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="cursor-help" />}>{badge}</TooltipTrigger>
      <TooltipContent>{task.error_message}</TooltipContent>
    </Tooltip>
  );
}

export function MeasurementStatus({ status }: { status: string }) {
  const map: Record<string, string> = {
    running: "Running",
    completed: "Finished",
    cancelled: "Cancelled",
    interrupted: "Interrupted",
  };
  return (
    <Badge variant={status === "running" ? "secondary" : status === "completed" ? "default" : "outline"}>
      {map[status] ?? status}
    </Badge>
  );
}
