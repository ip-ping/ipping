import { Suspense } from "react";

import { FleetMap } from "@/features/fleet/fleet-map";
import { HomeHero } from "@/features/fleet/home-hero";
import { DNS_RECORD_TYPES, DNS_RESOLVERS, KINDS } from "@/features/measurements/kinds";
import { MeasureForm } from "@/features/measurements/measure-form";
import { SelectionProvider } from "@/features/measurements/selection";
import { RecentMeasurements } from "@/features/measurements/recent";

/**
 * The title with the fleet's numbers, then the command with this browser's recent measurements beside it, then the map where the
 * nodes to measure from are chosen, across the whole width. On a phone they follow one another in that order.
 */
export default async function Home({ searchParams }: PageProps<"/">) {
  const { target, kind, record, resolver, transport } = await searchParams;
  return (
    <div className="space-y-6 lg:space-y-8">
      <HomeHero />
      <SelectionProvider initialKind={KINDS.find((k) => k === kind) ?? "ping"}>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
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
          <RecentMeasurements />
          <FleetMap className="lg:col-span-2" />
        </div>
      </SelectionProvider>
    </div>
  );
}
