import { Suspense } from "react";

import { FleetMap } from "@/features/fleet/fleet-map";
import { DNS_RECORD_TYPES, DNS_RESOLVERS, KINDS } from "@/features/measurements/kinds";
import { MeasureForm } from "@/features/measurements/measure-form";
import { RecentMeasurements } from "@/features/measurements/recent";

export default async function Home({ searchParams }: PageProps<"/">) {
  const { target, kind, record, resolver } = await searchParams;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-3">
        <h1 className="figure max-w-3xl text-[clamp(2.1rem,5.4vw,4rem)] font-bold">
          Ping the internet
          <br className="hidden sm:block" /> from <span className="text-signal">everywhere</span>.
        </h1>
        <p className="label max-w-xs leading-relaxed normal-case tracking-normal sm:text-right">
          Ping, TCP, HTTP, traceroute and DNS, live from every node you run. See where the answer comes from, and how
          far away it is.
        </p>
      </div>

      <div className="space-y-0 [&>*+*]:-mt-px">
        <FleetMap />
        <Suspense>
          <MeasureForm
            initialTarget={typeof target === "string" ? target : ""}
            initialKind={KINDS.find((k) => k === kind) ?? "ping"}
            initialRecordType={DNS_RECORD_TYPES.find((t) => t === record) ?? "A"}
            initialResolver={DNS_RESOLVERS.find((r) => r.value === resolver)?.value ?? "system"}
          />
        </Suspense>
      </div>
      <RecentMeasurements />
    </div>
  );
}
