"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Schemas } from "@/lib/api/client";
import { useApiData } from "@/lib/api/use-api-data";

import { AuditTab } from "./audit-tab";
import { NodesTab } from "./nodes-tab";
import { SettingsTab } from "./settings-tab";
import { TokensTab } from "./tokens-tab";

function Stat({ title, value }: { title: string; value: number | string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

export function Dashboard({ username, onSignOut }: { username: string; onSignOut: () => void }) {
  const { data: status } = useApiData<Schemas["ServiceStatus"]>("/admin/status", 5000);
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Administration</h1>
          <p className="text-sm text-muted-foreground">Signed in as {username}</p>
        </div>
        <Button variant="outline" onClick={onSignOut}>
          Sign out
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat title="Nodes online" value={status ? `${status.nodes_online} / ${status.nodes_approved}` : "–"} />
        <Stat title="Awaiting approval" value={status?.nodes_pending ?? "–"} />
        <Stat title="Measurements running" value={status?.measurements_running ?? "–"} />
        <Stat title="Live result streams" value={status?.live_streams ?? "–"} />
      </div>

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
    </div>
  );
}
