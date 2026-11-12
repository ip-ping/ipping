"use client";

import { useMemo } from "react";

import { CommunityBadge } from "@/components/community-badge";
import { NetworkName } from "@/components/network-name";
import { Panel } from "@/components/panel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { NetworkMap, type MapNode } from "@/components/viz/network-map";
import { Readouts } from "@/components/viz/readout";
import { useNodes } from "@/features/nodes/use-nodes";
import { flag, nodeHeading } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";
import { useFocus } from "@/lib/use-focus";
import { cn } from "@/lib/utils";
import { Toggle } from "@/components/ui/toggle";

const count = (n: number) => String(Math.round(n));

export default function NodesPage() {
  const { t } = useI18n();
  const { nodes, error } = useNodes();
  const focus = useFocus();
  const list = useMemo(
    () => [...(nodes ?? [])].sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name)),
    [nodes],
  );
  const online = list.filter((n) => n.online);
  const countries = new Set(online.map((n) => n.country).filter(Boolean)).size;
  const providers = new Set(online.map((n) => n.provider).filter(Boolean)).size;
  const mapNodes = useMemo<MapNode[]>(
    () =>
      list
        .filter((n) => n.latitude != null && n.longitude != null)
        .map((n) => {
          const heading = nodeHeading(n);
          return {
            id: n.id,
            name: heading.title,
            place: heading.sub,
            network: heading.parts,
            lat: n.latitude as number,
            lon: n.longitude as number,
            online: n.online,
            note: n.online ? [n.tier === "community" ? "community node (a volunteer's)" : null, n.kinds.join(" · ")].filter(Boolean).join(" · ") : undefined,
          };
        }),
    [list],
  );
  const loading = nodes === null && !error;

  return (
    <div className="space-y-4 sm:space-y-5">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t("nodes.title")}</h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          {t("nodes.intro")}
        </p>
      </header>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>{t("nodes.loadFailed")}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Panel
        label={t("nodes.stations")}
        meta={nodes && <span className="tabular-nums">{t("nodes.onlineOf", { n: online.length, total: list.length })}</span>}
        flush
      >
        <div className="grid lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="flex min-w-0 flex-col">
            <div className="p-2 pb-3 sm:p-3">
              {loading ? (
                <Skeleton className="aspect-[378/152] w-full" />
              ) : (
                <NetworkMap
                  nodes={mapNodes}
                  selectedId={focus.pinned}
                  activeId={focus.hover}
                  onSelect={focus.pin}
                  onHover={focus.setHover}
                  label={`Map of the ${mapNodes.length} measurement nodes, ${online.length} of them online`}
                />
              )}
              <div className="text-xs text-muted-foreground mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 px-1">
                <span className="inline-flex items-center gap-2">
                  <span className="size-2 rounded-full bg-foreground" /> {t("home.legend.connected")}
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="size-2 rounded-full border border-foreground/50" /> {t("home.legend.offline")}
                </span>
              </div>
            </div>
            <Readouts
              className="mt-auto border-t"
              items={[
                { label: t("nodes.online"), text: nodes ? `${online.length} / ${list.length}` : "–", hint: t("nodes.hint.connected") },
                { label: t("nodes.countries"), value: nodes ? countries : null, format: count, hint: t("nodes.hint.countries") },
                { label: t("nodes.providers"), value: nodes ? providers : null, format: count, hint: t("nodes.hint.providers") },
                { label: t("nodes.ipv6"), value: nodes ? online.filter((n) => n.ipv6).length : null, format: count, hint: t("nodes.hint.ipv6") },
              ]}
            />
          </div>

          <ul
            className="max-h-[26rem] min-w-0 divide-y overflow-y-auto border-t lg:max-h-[34rem] lg:border-t-0 lg:border-l"
            aria-label={t("nodes.title")}
          >
            {loading &&
              Array.from({ length: 4 }, (_, i) => (
                <li key={i} className="p-3">
                  <Skeleton className="h-10 w-full" />
                </li>
              ))}
            {nodes?.length === 0 && (
              <li className="p-6 text-center text-sm text-muted-foreground">No nodes have been approved yet.</li>
            )}
            {list.map((node) => {
              const active = focus.active === node.id;
              const heading = nodeHeading(node);
              return (
                <li key={node.id}>
                  <Toggle
                    pressed={focus.pinned === node.id}
                    onPointerEnter={() => focus.setHover(node.id)}
                    onPointerLeave={() => focus.setHover(null)}
                    onFocus={() => focus.setHover(node.id)}
                    onBlur={() => focus.setHover(null)}
                    onPressedChange={() => focus.pin(focus.pinned === node.id ? null : node.id)}
                    className={cn(
                      "h-auto w-full items-start justify-start gap-3 rounded-none px-3 py-2.5 text-left font-normal",
                      active && "bg-signal-soft",
                      !node.online && "text-muted-foreground",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn("mt-[0.45rem] size-2 shrink-0 rounded-full", node.online ? "bg-foreground" : "border border-foreground/50")}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate font-medium">
                          {heading.named ? heading.title : `${flag(node.country)} ${heading.title}`.trim()}
                          <CommunityBadge tier={node.tier} />
                        </span>
                        <span className="flex shrink-0 gap-1">
                          {node.ipv4 && <Badge variant="secondary">v4</Badge>}
                          {node.ipv6 && <Badge variant="secondary">v6</Badge>}
                        </span>
                      </span>
                      {heading.parts.length > 0 && (
                        <span className="text-xs text-muted-foreground block truncate">
                          <NetworkName parts={heading.parts} />
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground block truncate">{node.online ? node.kinds.join(" · ") : t("nodes.offline")}</span>
                    </span>
                  </Toggle>
                </li>
              );
            })}
          </ul>
        </div>
      </Panel>
    </div>
  );
}
