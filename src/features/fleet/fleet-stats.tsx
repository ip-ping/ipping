"use client";

import { useNodes } from "@/features/nodes/use-nodes";
import { useI18n } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

/** The fleet in four numbers (nodes online, countries, providers, IPv6) as one slim strip: it sits in the home page's header. */
export function FleetStats({ className }: { className?: string }) {
  const { nodes } = useNodes();
  const { t } = useI18n();
  const online = nodes?.filter((n) => n.online) ?? [];
  const items = [
    { label: t("home.fleet.online"), value: online.length, hint: t("nodes.hint.connected") },
    { label: t("home.fleet.countries"), value: new Set(online.map((n) => n.country).filter(Boolean)).size, hint: t("nodes.hint.countries") },
    { label: t("home.fleet.providers"), value: new Set(online.map((n) => n.provider).filter(Boolean)).size, hint: t("nodes.hint.providers") },
    { label: t("home.fleet.ipv6"), value: online.filter((n) => n.ipv6).length, hint: t("nodes.hint.ipv6") },
  ];
  return (
    <dl aria-label={t("home.fleet.title")} className={cn("grid grid-cols-4 divide-x", className)}>
      {items.map((item) => (
        <div key={item.label} title={item.hint} className="flex min-w-0 flex-col gap-1.5 px-3 first:pl-0 last:pr-0 sm:px-5">
          <dd className="order-1 text-2xl font-semibold leading-none tabular-nums sm:text-3xl">{nodes ? item.value : "–"}</dd>
          <dt className="order-2 text-xs leading-tight text-muted-foreground">{item.label}</dt>
        </div>
      ))}
    </dl>
  );
}
