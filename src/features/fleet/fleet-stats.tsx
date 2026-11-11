"use client";

import { Panel } from "@/components/panel";
import { Readouts } from "@/components/viz/readout";
import { useNodes } from "@/features/nodes/use-nodes";
import { useI18n } from "@/lib/i18n/provider";

const count = (n: number) => String(Math.round(n));

/** The fleet in four numbers (nodes online, countries, providers, IPv6), for the side of the home page. */
export function FleetStats({ className }: { className?: string }) {
  const { nodes } = useNodes();
  const { t } = useI18n();
  const online = nodes?.filter((n) => n.online) ?? [];
  const countries = new Set(online.map((n) => n.country).filter(Boolean)).size;
  const providers = new Set(online.map((n) => n.provider).filter(Boolean)).size;
  return (
    <Panel label={t("home.fleet.title")} className={className} flush>
      <Readouts
        className="grid-cols-2"
        items={[
          { label: t("home.fleet.online"), value: nodes ? online.length : null, format: count, hint: t("nodes.hint.connected") },
          { label: t("home.fleet.countries"), value: nodes ? countries : null, format: count, hint: t("nodes.hint.countries") },
          { label: t("home.fleet.providers"), value: nodes ? providers : null, format: count, hint: t("nodes.hint.providers") },
          { label: t("home.fleet.ipv6"), value: nodes ? online.filter((n) => n.ipv6).length : null, format: count, hint: t("nodes.hint.ipv6") },
        ]}
      />
    </Panel>
  );
}
