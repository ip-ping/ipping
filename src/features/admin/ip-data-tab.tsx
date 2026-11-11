"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { api, errorMessage, type Schemas } from "@/lib/api/client";
import { useApiData } from "@/lib/api/use-api-data";

import { SourcesCard } from "./ip-sources";

type IpData = Schemas["IpDataOut"];
type Update = Partial<Schemas["IpDataUpdate"]>;

const ACCESS = [
  { value: "api_key", label: "An API key or an administrator" },
  { value: "public", label: "Anyone" },
  { value: "admin", label: "Administrators only" },
];

function PickOne({
  label,
  value,
  options,
  onChange,
  id,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  id: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} items={options} onValueChange={(next) => next !== null && onChange(next)}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function IpDataTab() {
  // Polled, so that a download's result shows as it lands.
  const { data, reload } = useApiData<IpData>("/admin/ip-data", 5000);
  if (!data) return <Skeleton className="h-64 w-full" />;
  return <IpDataForms data={data} reload={reload} />;
}

function IpDataForms({ data, reload }: { data: IpData; reload: () => Promise<void> }) {
  const [lookup, setLookup] = useState({ enabled: data.lookup.enabled, access: data.lookup.access as string, perMinute: String(data.lookup.per_minute) });
  const [busy, setBusy] = useState<string | null>(null);

  const send = async (name: string, body: Update, done: string) => {
    setBusy(name);
    try {
      await api("PUT", "/admin/ip-data", body);
      toast.success(done);
      await reload();
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const checkNow = async () => {
    setBusy("update");
    try {
      await api("POST", "/admin/ip-data/update");
      toast.success("Checking for newer files");
      await reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <SourcesCard data={data} send={send} busy={busy} checkNow={checkNow} />

      <Card>
        <CardHeader>
          <CardTitle>IP lookup API</CardTitle>
          <CardDescription>
            <code>GET /api/v1/ip/&lt;address&gt;</code> answers with the network, country, region, city, position, time zone and AS
            number, each with how sure the vote of the sources that are on is, and what every source said; <code>GET /api/v1/ip</code> with
            the caller&apos;s own address.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch id="lookup-enabled" checked={lookup.enabled} onCheckedChange={(enabled) => setLookup({ ...lookup, enabled })} />
            <Label htmlFor="lookup-enabled">{lookup.enabled ? "The API is on" : "The API is off"}</Label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <PickOne id="lookup-access" label="Who may use it" value={lookup.access} options={ACCESS} onChange={(access) => setLookup({ ...lookup, access })} />
            <div className="space-y-1.5">
              <Label htmlFor="lookup-rate">Lookups a minute for one client address</Label>
              <Input id="lookup-rate" type="number" min={1} max={6000} value={lookup.perMinute} onChange={(e) => setLookup({ ...lookup, perMinute: e.target.value })} />
              <p className="text-xs text-muted-foreground">Administrators are not limited.</p>
            </div>
          </div>
          <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs">
            {lookup.access === "public"
              ? "curl https://YOUR-SITE/api/v1/ip/1.1.1.1"
              : 'curl -H "Authorization: Bearer YOUR-API-KEY" https://YOUR-SITE/api/v1/ip/1.1.1.1'}
          </pre>
          <p className="text-xs text-muted-foreground">
            API keys are made in the <em>API keys</em> tab. The sources&apos; licenses let you answer single lookups, not hand out the databases.
          </p>
          <Button
            type="button"
            disabled={busy !== null}
            onClick={() =>
              send(
                "lookup",
                { lookup_enabled: lookup.enabled, lookup_access: lookup.access as Update["lookup_access"], lookup_per_minute: Number(lookup.perMinute) },
                "Lookup API settings saved",
              )
            }
          >
            Save lookup API settings
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Node details</CardTitle>
          <CardDescription>
            A node&apos;s country, region, city, position, provider and AS number are filled in from the address it connects from.
            Anything you type in a node&apos;s edit dialog (or the node reported when it enrolled) is kept as it is; clear a field to
            go back to the automatic value. The place from the IP data is used only where it agrees with the place you or the node
            gave (another country, or a city about 300 km away, and the IP data is not used for the place; the provider and AS
            number still are), and a position from them is a city&apos;s, so it is never marked verified.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <Switch
            id="node-autofill"
            checked={data.node_autofill}
            disabled={busy !== null}
            onCheckedChange={(next) => send("autofill", { node_autofill: next }, next ? "Nodes are filled in from their address" : "Nodes are left as they are")}
          />
          <Label htmlFor="node-autofill">{data.node_autofill ? "Fill in nodes automatically" : "Do not fill in nodes"}</Label>
        </CardContent>
      </Card>
    </div>
  );
}
