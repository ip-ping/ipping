import { Suspense } from "react";

import { FleetMap } from "@/features/fleet/fleet-map";
import { DNS_RECORD_TYPES, DNS_RESOLVERS, KINDS } from "@/features/measurements/kinds";
import { MeasureForm } from "@/features/measurements/measure-form";
import { SelectionProvider } from "@/features/measurements/selection";
import { RecentMeasurements } from "@/features/measurements/recent";

export default async function Home({ searchParams }: PageProps<"/">) {
  const { target, kind, record, resolver, transport } = await searchParams;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-3">
        <h1 className="max-w-3xl text-3xl font-bold tracking-tight sm:text-5xl">
          Ping the internet
          <br className="hidden sm:block" /> from <span className="text-signal">everywhere</span>.
        </h1>
        <p className="text-xs text-muted-foreground max-w-xs leading-relaxed sm:text-right">
          Ping, TCP, HTTP, traceroute, DNS and certificate checks, live from every node you run, and IP info for any address. See where
          the answer comes from, and how far away it is.
        </p>
      </div>

      <SelectionProvider initialKind={KINDS.find((k) => k === kind) ?? "ping"}>
      <div className="space-y-4">
        <FleetMap />
        <Suspense>
          <MeasureForm
            initialTarget={typeof target === "string" ? target : ""}
            initialRecordType={DNS_RECORD_TYPES.find((t) => t === record) ?? "A"}
            initialResolver={DNS_RESOLVERS.find((r) => r.value === resolver)?.value ?? "system"}
            initialTransport={transport === "doh" ? "doh" : "udp"}
            initialTlsTransport={transport === "quic" ? "quic" : "tcp"}
            initialIpInfo={kind === "ip"}
          />
        </Suspense>
      </div>
      </SelectionProvider>
      <RecentMeasurements />
    </div>
  );
}
