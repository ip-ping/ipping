import { Suspense } from "react";

import { FleetMap } from "@/features/fleet/fleet-map";
import { FleetStats } from "@/features/fleet/fleet-stats";
import { HomeHero } from "@/features/fleet/home-hero";
import { DNS_RECORD_TYPES, DNS_RESOLVERS, KINDS } from "@/features/measurements/kinds";
import { MeasureForm } from "@/features/measurements/measure-form";
import { SelectionProvider } from "@/features/measurements/selection";
import { RecentMeasurements } from "@/features/measurements/recent";

/**
 * The command first (it is what people came to do), the map under it where the nodes to measure from are chosen, and, beside them
 * from a wide screen up, the fleet in numbers and the measurements this browser made. On a phone they follow one another.
 */
export default async function Home({ searchParams }: PageProps<"/">) {
  const { target, kind, record, resolver, transport } = await searchParams;
  return (
    <div className="space-y-6">
      <HomeHero />
      <SelectionProvider initialKind={KINDS.find((k) => k === kind) ?? "ping"}>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
          <div className="min-w-0 space-y-6">
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
            <FleetMap />
          </div>
          <aside className="min-w-0 space-y-6">
            <FleetStats />
            <RecentMeasurements />
          </aside>
        </div>
      </SelectionProvider>
    </div>
  );
}
