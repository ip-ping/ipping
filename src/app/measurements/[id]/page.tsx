"use client";

import { ArrowLeftIcon, CopyIcon, RotateCwIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { TargetCard } from "@/features/ip-info/target-card";
import { TestedAddresses } from "@/features/ip-info/tested-addresses";
import { useAddresses } from "@/features/ip-info/use-addresses";
import { EstimateSummary, LocationPanel } from "@/features/location/location-panel";
import { useLocation } from "@/features/location/use-location";
import { DNS_RESOLVERS, kindOf } from "@/features/measurements/kinds";
import { Charts } from "@/features/measurements/charts";
import { useAnswerSlots } from "@/features/measurements/dns-groups";
import { medians, usePreviousRun } from "@/features/measurements/previous";
import { useI18n } from "@/lib/i18n/provider";
import { useFocus } from "@/lib/use-focus";
import { ExportMenu } from "@/features/measurements/export-menu";
import { Instrument } from "@/features/measurements/instrument";
import { ResultsTable } from "@/features/measurements/results-table";
import { MeasurementStatus } from "@/features/measurements/status";
import { useMeasurement } from "@/features/measurements/use-measurement";
import { api, errorMessage, type Measurement } from "@/lib/api/client";

const NO_TASKS: Measurement["tasks"] = [];

export default function MeasurementPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const state = useMeasurement(id);
  const [shared, setShared] = useState<boolean | null>(null);
  const focus = useFocus();
  const slots = useAnswerSlots(state.phase === "ready" ? state.measurement.tasks : NO_TASKS);
  // The estimated place is worked out once the measurement is over, and only ping and TCP time a round trip.
  const current = state.phase === "ready" ? state.measurement : null;
  const wantsLocation = current !== null && current.status !== "running" && ["ping", "tcp"].includes(kindOf(current));
  // When the nodes resolved the name to different addresses, the estimate is for one of them; the reader can pick another.
  const [address, setAddress] = useState<string | null>(null);
  const { estimate, error: locationError } = useLocation(id, wantsLocation, address);
  // what the IP databases say about the addresses the nodes tested (the target card and the table of them)
  const addresses = useAddresses(id, state.phase === "ready" ? state.measurement.tasks : NO_TASKS);
  // the previous run of the same question (this browser's own), to show how each node moved
  const previousRun = usePreviousRun(current);
  const before = useMemo(() => medians(previousRun), [previousRun]);

  if (state.phase === "loading") {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (state.phase === "error") {
    return (
      <Alert variant="destructive">
        <AlertTitle>{state.notFound ? t("m.notFound") : t("m.loadFailed")}</AlertTitle>
        <AlertDescription>
          {state.notFound ? t("m.notFoundText") : state.message}
        </AlertDescription>
      </Alert>
    );
  }

  const { measurement, live } = state;
  const running = measurement.status === "running";
  const isShared = shared ?? measurement.shared;
  const target = measurement.target;
  const kind = kindOf(measurement);
  const options = measurement.options;
  // What goes back into the form to run the same measurement again.
  const rerun =
    (kind === "tcp" || kind === "tls") && options.port
      ? `${target.host}:${options.port}`
      : kind === "http"
        ? `${options.scheme}://${target.host}${options.port && ![80, 443].includes(options.port) ? `:${options.port}` : ""}${options.path ?? "/"}`
        : target.host;

  const cancel = () =>
    api("POST", `/measurements/${id}/cancel`).catch((e) => toast.error(errorMessage(e)));
  const share = async (next: boolean) => {
    try {
      await api("POST", `/measurements/${id}/share`, { shared: next });
      setShared(next);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const copyLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    toast.success(t("m.linkCopied"));
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-3.5" /> {t("m.back")}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <p className="text-xs text-muted-foreground">{t("m.kind", { kind: t(`kind.${kind}`) })}</p>
          <h1 className="text-2xl font-semibold tracking-tight [overflow-wrap:anywhere] sm:text-4xl">{target.host}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <MeasurementStatus status={measurement.status} />
            {running && !live && <Badge variant="outline">{t("m.reconnecting")}</Badge>}
            <Badge variant="outline">{t(`kind.${kind}`)}</Badge>
            {options.port ? <span className="font-mono">{t("m.port", { n: options.port })}</span> : null}
            {target.ip && target.ip !== target.host && (
              <span>
                {t("m.everyNodeTests", { ip: "" }).trimEnd()} <span className="font-mono">{target.ip}</span>
                {measurement.resolved_by ? t("m.resolvedBy", { name: measurement.resolved_by.name }) : null}
              </span>
            )}
            {measurement.dns_mode === "regional" && kind !== "dns" && <span>{t("m.eachResolves")}</span>}
            {kind === "dns" && (
              <span>
                <span className="font-mono">{options.record_type ?? "A"}</span> records, asked of{" "}
                {DNS_RESOLVERS.find((r) => r.value === options.resolver)?.label.replace("Each node's own resolver", "each node's own resolver") ??
                  "each node's own resolver"}
                {options.transport === "doh" ? ", over HTTPS (DoH)" : ""}
              </span>
            )}
            {(kind === "ping" || kind === "tcp") && (
              <span>
                · {t("m.perNode", { n: options.count, unit: t(`unit.${kind}`) })}
              </span>
            )}
            {kind === "http" && (
              <span className="font-mono">
                · {options.scheme}://{target.host}
                {options.path}
                {options.max_redirects ? " (following redirects)" : ""}
              </span>
            )}
            {kind === "tls" && options.transport === "quic" && <span>· over QUIC (HTTP/3)</span>}
            {kind === "traceroute" && (
              <span>
                · up to {options.max_hops} hops{options.count > 1 ? `, traced ${options.count} times` : ""}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border px-3 py-1.5">
            <Switch id="share" checked={isShared} onCheckedChange={share} />
            <Label htmlFor="share" className="text-sm" title={t("m.shareTitle")}>
              {t("m.share")}
            </Label>
            {isShared && (
              <Button variant="ghost" size="sm" onClick={copyLink} className="-mr-2">
                <CopyIcon /> {t("m.copyLink")}
              </Button>
            )}
          </div>
          {running && (
            <Button variant="outline" onClick={cancel}>
              <XIcon /> {t("m.cancel")}
            </Button>
          )}
          {!running && <ExportMenu measurement={measurement} />}
          {!running && (
            <Button
              variant="outline"
              render={
                <Link
                  href={`/?kind=${kind}&target=${encodeURIComponent(rerun)}${
                    kind === "dns" ? `&record=${options.record_type ?? "A"}&resolver=${options.resolver ?? "system"}${options.transport === "doh" ? "&transport=doh" : ""}` : kind === "tls" && options.transport === "quic" ? "&transport=quic" : ""
                  }`}
                />
              }
            >
              <RotateCwIcon /> {t("m.rerun")}
            </Button>
          )}
        </div>
      </div>

      {target.input_kind === "url" && kind === "ping" && (
        <Alert>
          <AlertTitle>{t("m.icmpTitle")}</AlertTitle>
          <AlertDescription>{t("m.icmpText", { host: target.host })}</AlertDescription>
        </Alert>
      )}
      {measurement.status === "interrupted" && (
        <Alert variant="destructive">
          <AlertTitle>{t("m.interruptedTitle")}</AlertTitle>
          <AlertDescription>{t("m.interruptedText")}</AlertDescription>
        </Alert>
      )}

      <nav aria-label={t("m.nav")} className="-mt-1 flex flex-wrap items-center gap-1">
        {[
          ["#map", t("m.nav.map")],
          ...(measurement.tasks.length > 0 ? [["#results", t("m.nav.roundTrips")] as const, ["#nodes", t("m.nav.nodes")] as const] : []),
          ...(kind === "ping" || kind === "tcp" ? [["#location", t("m.nav.location")] as const] : []),
          ...(addresses?.databases_loaded && addresses.addresses.length > 1 ? [["#addresses", t("m.nav.addresses")] as const] : []),
        ].map(([href, label]) => (
          <Button key={href} variant="ghost" size="sm" render={<a href={href} />}>
            {label}
          </Button>
        ))}
      </nav>

      <section id="map" className="scroll-mt-20">
        <Instrument measurement={measurement} estimate={estimate} focus={focus} slots={slots} aside={<TargetCard data={addresses} />} />
      </section>
      {(kind === "ping" || kind === "tcp") && !running && <EstimateSummary estimate={estimate} />}
      <section id="results" className="scroll-mt-20">
        <Charts measurement={measurement} focus={focus} slots={slots} previous={before} previousAt={previousRun?.created_at} />
      </section>
      <section id="nodes" className="scroll-mt-20">
        <ResultsTable measurement={measurement} focus={focus} previous={before} />
      </section>
      {(kind === "ping" || kind === "tcp") && (
        <section id="location" className="scroll-mt-20">
          <LocationPanel estimate={estimate} error={locationError} finished={!running} onAddress={setAddress} nodes={measurement.tasks.map((t) => t.node)} />
        </section>
      )}
      <section id="addresses" className="scroll-mt-20">
        <TestedAddresses data={addresses} />
      </section>
    </div>
  );
}
