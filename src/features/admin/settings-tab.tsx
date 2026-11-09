"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api, errorMessage, type Schemas } from "@/lib/api/client";
import { useApiData } from "@/lib/api/use-api-data";

type Settings = Schemas["RuntimeSettings"];
type NumericKey = {
  [K in keyof Settings]-?: Settings[K] extends number ? K : never;
}[keyof Settings];

const LIMITS: { key: NumericKey; label: string; help: string; min?: number }[] = [
  { key: "max_concurrent_per_session", label: "Running measurements per visitor", help: "One browser session." },
  { key: "max_concurrent_per_ip", label: "Running measurements per IP address", help: "Across all sessions behind one address." },
  { key: "creations_per_minute_per_ip", label: "New measurements per minute per IP", help: "" },
  { key: "max_probes_per_measurement", label: "Probe budget per measurement", help: "Nodes × probes. A request over the budget is refused, never silently trimmed." },
  { key: "max_global_inflight_probes", label: "Probes in flight, whole service", help: "New measurements wait (are refused) above this." },
  { key: "measurement_deadline_s", label: "Measurement deadline (seconds)", help: "Nodes that have not finished by then are marked as timed out." },
  { key: "default_count", label: "Default probes per node (ping, TCP)", help: "" },
  { key: "max_count", label: "Most probes per node (ping, TCP)", help: "Never more than 10." },
  { key: "sample_retention_days", label: "Keep individual results (days)", help: "Per-node summaries are kept longer." },
  { key: "measurement_retention_days", label: "Keep measurements (days)", help: "" },
  { key: "max_redirects", label: "Redirects an HTTP check may follow", help: "0 turns following off. Your blocklist applies to the first address only; each redirect is checked by the node for public addresses and allowed ports.", min: 0 },
  { key: "task_retries", label: "Times a task is sent again", help: "When the service instance holding a task stops before the node produced anything. 0 turns it off; partial results are never discarded.", min: 0 },
  { key: "traceroute_max_hops", label: "Most hops in a traceroute", help: "Between 5 and 30.", min: 5 },
  { key: "community_tasks_per_minute", label: "Tasks a minute for each community node", help: "Volunteers' nodes are asked for at most this many a minute: \"all nodes\" leaves out one that is at its limit.", min: 1 },
  { key: "max_watches", label: "Most watches", help: "Scheduled checks. 0 turns them off.", min: 0 },
  { key: "min_watch_interval_s", label: "Shortest watch interval (seconds)", help: "At least 30.", min: 30 },
  { key: "watch_history_days", label: "Keep a watch's run history (days)", help: "" },
];

const KINDS: { value: string; label: string; help: string }[] = [
  { value: "ping", label: "Ping", help: "ICMP echo." },
  { value: "tcp", label: "TCP", help: "Connect to an allowed port." },
  { value: "http", label: "HTTP", help: "One request, with timings and the certificate." },
  { value: "traceroute", label: "Traceroute", help: "Routers on the way (Linux nodes)." },
  { value: "dns", label: "DNS", help: "Ask resolvers about a name and compare the answers." },
  { value: "tls", label: "Certificate", help: "A TLS handshake with no request: expiry, issuer, names and trust." },
];

export function SettingsTab() {
  const { data, reload } = useApiData<Settings>("/admin/settings");
  // Re-key on the stored values so the form starts over from what the server now holds.
  return data ? <SettingsForm key={JSON.stringify(data)} data={data} reload={reload} /> : null;
}

function SettingsForm({ data, reload }: { data: Settings; reload: () => Promise<void> }) {
  const [draft, setDraft] = useState<Settings>(data);
  const [deny, setDeny] = useState((data.target_denylist ?? []).join("\n"));
  const [ports, setPorts] = useState((data.allowed_ports ?? []).join(", "));
  const [kinds, setKinds] = useState<string[]>(data.enabled_kinds ?? []);
  const [busy, setBusy] = useState(false);
  const enabled = data.measurements_enabled;

  const patch = async (body: Partial<Settings>, message: string) => {
    setBusy(true);
    try {
      await api("PATCH", "/admin/settings", body);
      toast.success(message);
      await reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const save = (event: FormEvent) => {
    event.preventDefault();
    const changes: Partial<Settings> = {};
    for (const { key } of LIMITS) if (draft[key] !== data[key]) changes[key] = draft[key];
    if (draft.allow_private_webhooks !== data.allow_private_webhooks) changes.allow_private_webhooks = draft.allow_private_webhooks;
    const list = deny.split("\n").map((l) => l.trim()).filter(Boolean);
    if (JSON.stringify(list) !== JSON.stringify(data.target_denylist ?? [])) changes.target_denylist = list;
    const portList = ports.split(/[\s,]+/).filter(Boolean).map(Number);
    if (portList.some((p) => !Number.isInteger(p) || p < 1 || p > 65535)) {
      return toast.error("Ports must be whole numbers between 1 and 65535.");
    }
    const sortedPorts = [...new Set(portList)].sort((a, b) => a - b);
    if (JSON.stringify(sortedPorts) !== JSON.stringify([...(data.allowed_ports ?? [])].sort((a, b) => a - b))) {
      changes.allowed_ports = sortedPorts;
    }
    if (JSON.stringify([...kinds].sort()) !== JSON.stringify([...(data.enabled_kinds ?? [])].sort())) {
      changes.enabled_kinds = kinds;
    }
    if (Object.keys(changes).length === 0) return toast.info("Nothing to save");
    void patch(changes, "Settings saved");
  };

  return (
    <div className="space-y-6">
      <Card className={enabled ? undefined : "border-destructive"}>
        <CardHeader>
          <CardTitle>Emergency stop</CardTitle>
          <CardDescription>
            Turn this off to refuse every new measurement at once. Running ones finish.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <Switch
            id="enabled"
            checked={enabled}
            disabled={busy}
            onCheckedChange={(next) =>
              patch({ measurements_enabled: next }, next ? "Measurements are on" : "Measurements are stopped")
            }
          />
          <Label htmlFor="enabled">{enabled ? "Accepting new measurements" : "New measurements are stopped"}</Label>
        </CardContent>
      </Card>

      <form onSubmit={save} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Limits</CardTitle>
            <CardDescription>
              Counted as nodes × probes (echo requests, connections, requests or hops), not just browser
              requests, so one click on a large fleet cannot be a flood.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {LIMITS.map(({ key, label, help, min }) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={key}>{label}</Label>
                <Input
                  id={key}
                  type="number"
                  min={min ?? 1}
                  value={draft[key]}
                  onChange={(e) => setDraft({ ...draft, [key]: Number(e.target.value) })}
                />
                {help && <p className="text-xs text-muted-foreground">{help}</p>}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Kinds of measurement</CardTitle>
            <CardDescription>
              Which kinds visitors can start. A node must also support the kind; older nodes only
              know ping.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {KINDS.map(({ value, label, help }) => (
                <label key={value} className="flex cursor-pointer items-start gap-3 text-sm">
                  <Checkbox
                    checked={kinds.includes(value)}
                    onCheckedChange={(checked) =>
                      setKinds((current) =>
                        checked ? [...new Set([...current, value])] : current.filter((k) => k !== value),
                      )
                    }
                  />
                  <span>
                    <span className="font-medium">{label}</span>
                    <span className="block text-xs text-muted-foreground">{help}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ports">Ports TCP and HTTP checks may use</Label>
              <Input id="ports" value={ports} onChange={(e) => setPorts(e.target.value)} className="font-mono" />
              <p className="text-xs text-muted-foreground">
                Comma-separated. Keep it short: a service that connects to any port of any host is a
                port scanner. Nodes keep their own list too (<code>IPPING_NODE_PORTS</code>), so a
                port added here also has to be allowed on the nodes.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Watch alerts</CardTitle>
            <CardDescription>
              An alert address is a place this server connects to. By default it must be a public address, like a
              target.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <label className="flex cursor-pointer items-start gap-3 text-sm">
              <Checkbox
                checked={draft.allow_private_webhooks ?? false}
                onCheckedChange={(checked) => setDraft({ ...draft, allow_private_webhooks: checked === true })}
              />
              <span>
                <span className="font-medium">Allow alerts to private addresses</span>
                <span className="block text-xs text-muted-foreground">
                  For a webhook or an ntfy server on your own network. Anyone who can sign in as administrator can then
                  make this server send a request to your internal network, so leave it off unless you need it.
                </span>
              </span>
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Blocked targets</CardTitle>
            <CardDescription>
              One entry per line: a CIDR range (<code>203.0.113.0/24</code>) or a hostname
              (<code>example.org</code>, which also blocks its subdomains). Private and reserved
              addresses are always blocked.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea value={deny} onChange={(e) => setDeny(e.target.value)} rows={5} className="font-mono text-sm" />
          </CardContent>
        </Card>

        <Button type="submit" disabled={busy}>
          Save settings
        </Button>
      </form>

      {!enabled && (
        <Alert variant="destructive">
          <AlertTitle>Measurements are stopped</AlertTitle>
          <AlertDescription>Visitors see a message that measurements are temporarily disabled.</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
