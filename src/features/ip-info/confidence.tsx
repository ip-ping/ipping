"use client";

import { Progress } from "@/components/ui/progress";
import { useI18n } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

/**
 * How sure an answer is, as a stock progress bar with the number beside it. The number is a percentage from 1 to 99, worked out
 * on the server from how many sources voted for the value and how reliable each is for that kind of data.
 */
export function Confidence({ percent, className }: { percent: number | null | undefined; className?: string }) {
  const { t } = useI18n();
  if (percent == null) return null;
  return (
    <span className={cn("inline-flex items-center justify-end gap-2", className)} title={t("ip.sure.hint", { percent })} data-testid="confidence" data-percent={percent}>
      <Progress value={percent} aria-label={t("ip.sure")} className="w-10 gap-0 sm:w-14" />
      <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{percent}%</span>
    </span>
  );
}
