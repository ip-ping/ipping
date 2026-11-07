"use client";

import { ArrowLeftIcon, CopyIcon, RotateCwIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { LocationPanel } from "@/features/location/location-panel";
import { useLocation } from "@/features/location/use-location";
import { KIND_INFO, kindOf } from "@/features/measurements/kinds";
import { Charts } from "@/features/measurements/charts";
import { useFocus } from "@/lib/use-focus";
import { Instrument } from "@/features/measurements/instrument";
import { ResultsTable } from "@/features/measurements/results-table";
import { MeasurementStatus } from "@/features/measurements/status";
import { useMeasurement } from "@/features/measurements/use-measurement";
import { api, errorMessage } from "@/lib/api/client";

export default function MeasurementPage() {
  const { id } = useParams<{ id: string }>();
  const state = useMeasurement(id);
  const [shared, setShared] = useState<boolean | null>(null);
  const focus = useFocus();
  // The estimated place is worked out once the measurement is over, and only ping and TCP time a round trip.
  const current = state.phase === "ready" ? state.measurement : null;
  const wantsLocation = current !== null && current.status !== "running" && ["ping", "tcp"].includes(kindOf(current));
  const { estimate, error: locationError } = useLocation(id, wantsLocation);

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
        <AlertTitle>{state.notFound ? "Measurement not found" : "Could not load it"}</AlertTitle>
        <AlertDescription>
          {state.notFound
            ? "It may have expired, or it belongs to another browser session and has not been shared."
            : state.message}
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
    kind === "tcp" && options.port
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
    toast.success("Link copied");
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-3.5" /> New measurement
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <p className="label">{KIND_INFO[kind].label} measurement</p>
          <h1 className="figure text-3xl font-semibold tracking-[-0.03em] [overflow-wrap:anywhere] sm:text-5xl">{target.host}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <MeasurementStatus status={measurement.status} />
            {running && !live && <Badge variant="outline">Reconnecting…</Badge>}
            <Badge variant="outline">{KIND_INFO[kind].label}</Badge>
            {options.port ? <span className="font-mono">port {options.port}</span> : null}
            {target.ip && target.ip !== target.host && (
              <span>
                every node tests <span className="font-mono">{target.ip}</span>
              </span>
            )}
            {measurement.dns_mode === "regional" && <span>each node resolves the name itself</span>}
            {(kind === "ping" || kind === "tcp") && (
              <span>
                · {options.count} {KIND_INFO[kind].unit.many} per node
              </span>
            )}
            {kind === "http" && (
              <span className="font-mono">
                · {options.scheme}://{target.host}
                {options.path}
                {options.max_redirects ? " (following redirects)" : ""}
              </span>
            )}
            {kind === "traceroute" && <span>· up to {options.max_hops} hops</span>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {running && (
            <Button variant="outline" onClick={cancel}>
              <XIcon /> Cancel
            </Button>
          )}
          {!running && (
            <Button
              variant="outline"
              render={<Link href={`/?kind=${kind}&target=${encodeURIComponent(rerun)}`} />}
            >
              <RotateCwIcon /> Run again
            </Button>
          )}
        </div>
      </div>

      {target.input_kind === "url" && kind === "ping" && (
        <Alert>
          <AlertTitle>ICMP ping tests the host, not the web page</AlertTitle>
          <AlertDescription>
            Only <span className="font-mono">{target.host}</span> was taken from the URL. A reply
            means the machine answers pings; it does not mean the site is up.
          </AlertDescription>
        </Alert>
      )}
      {measurement.status === "interrupted" && (
        <Alert variant="destructive">
          <AlertTitle>The service restarted during this measurement</AlertTitle>
          <AlertDescription>Results below are partial. Run it again for a full picture.</AlertDescription>
        </Alert>
      )}

      <Instrument measurement={measurement} estimate={estimate} focus={focus} />
      <Charts measurement={measurement} focus={focus} />
      <ResultsTable measurement={measurement} focus={focus} />
      {(kind === "ping" || kind === "tcp") && (
        <LocationPanel estimate={estimate} error={locationError} finished={!running} />
      )}

      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <Switch id="share" checked={isShared} onCheckedChange={share} />
        <Label htmlFor="share">Anyone with the link can view these results</Label>
        {isShared && (
          <Button variant="ghost" size="sm" onClick={copyLink}>
            <CopyIcon /> Copy link
          </Button>
        )}
      </div>
    </div>
  );
}
