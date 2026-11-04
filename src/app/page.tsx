import { Suspense } from "react";

import { MeasureForm } from "@/features/measurements/measure-form";
import { RecentMeasurements } from "@/features/measurements/recent";

export default async function Home({ searchParams }: PageProps<"/">) {
  const { target } = await searchParams;
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Ping from many places at once</h1>
        <p className="text-muted-foreground">
          Enter an IP address, hostname or URL and see how it answers from every node, live.
        </p>
      </div>
      <Suspense>
        <MeasureForm initialTarget={typeof target === "string" ? target : ""} />
      </Suspense>
      <RecentMeasurements />
    </div>
  );
}
