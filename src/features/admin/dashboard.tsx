"use client";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/panel";
import { Readouts } from "@/components/viz/readout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Schemas } from "@/lib/api/client";
import { useApiData } from "@/lib/api/use-api-data";

import { AuditTab } from "./audit-tab";
import { NodesTab } from "./nodes-tab";
import { SettingsTab } from "./settings-tab";
import { TokensTab } from "./tokens-tab";

export function Dashboard({ username, onSignOut }: { username: string; onSignOut: () => void }) {
  const { data: status } = useApiData<Schemas["ServiceStatus"]>("/admin/status", 5000);
  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <p className="label">03 / control</p>
          <h1 className="figure text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">Administration</h1>
          <p className="truncate text-sm text-muted-foreground">Signed in as {username}</p>
        </div>
        <Button variant="outline" onClick={onSignOut}>
          Sign out
        </Button>
      </div>

      <Panel
        label="The service"
        meta={
          <>
            {status?.geoip && (status.geoip.city || status.geoip.asn) && (
              <span className="normal-case tracking-normal">{status.geoip.source} loaded</span>
            )}
            <span className="normal-case tracking-normal">refreshed every 5 s</span>
          </>
        }
        flush
      >
        <Readouts
          className="lg:grid-cols-4"
          items={[
            { label: "Nodes online", text: status ? `${status.nodes_online} / ${status.nodes_approved}` : "–", hint: "connected now" },
            { label: "Awaiting approval", value: status?.nodes_pending ?? null, format: (n) => String(Math.round(n)), alert: (status?.nodes_pending ?? 0) > 0, hint: "enrolled, not yet approved" },
            { label: "Measurements running", value: status?.measurements_running ?? null, format: (n) => String(Math.round(n)), hint: "in flight" },
            { label: "Live result streams", value: status?.live_streams ?? null, format: (n) => String(Math.round(n)), hint: "browsers watching" },
          ]}
        />
      </Panel>

      <Panel label="Control">
      <Tabs defaultValue="nodes">
        <TabsList>
          <TabsTrigger value="nodes">Nodes</TabsTrigger>
          <TabsTrigger value="tokens">Enrollment</TabsTrigger>
          <TabsTrigger value="settings">Limits &amp; safety</TabsTrigger>
          <TabsTrigger value="audit">Audit log</TabsTrigger>
        </TabsList>
        <TabsContent value="nodes" className="pt-4">
          <NodesTab />
        </TabsContent>
        <TabsContent value="tokens" className="pt-4">
          <TokensTab />
        </TabsContent>
        <TabsContent value="settings" className="pt-4">
          <SettingsTab />
        </TabsContent>
        <TabsContent value="audit" className="pt-4">
          <AuditTab />
        </TabsContent>
      </Tabs>
      </Panel>
    </div>
  );
}
