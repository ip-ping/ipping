"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

const LIMITS: { key: NumericKey; label: string; help: string }[] = [
  { key: "max_concurrent_per_session", label: "Running measurements per visitor", help: "One browser session." },
  { key: "max_concurrent_per_ip", label: "Running measurements per IP address", help: "Across all sessions behind one address." },
  { key: "creations_per_minute_per_ip", label: "New measurements per minute per IP", help: "" },
  { key: "max_probes_per_measurement", label: "Probe budget per measurement", help: "Nodes × echo requests. A request over the budget is refused, never silently trimmed." },
  { key: "max_global_inflight_probes", label: "Probes in flight, whole service", help: "New measurements wait (are refused) above this." },
  { key: "measurement_deadline_s", label: "Measurement deadline (seconds)", help: "Nodes that have not finished by then are marked as timed out." },
  { key: "default_count", label: "Default echo requests per node", help: "" },
  { key: "max_count", label: "Most echo requests per node", help: "Never more than 10." },
  { key: "sample_retention_days", label: "Keep individual echo results (days)", help: "Per-node summaries are kept longer." },
  { key: "measurement_retention_days", label: "Keep measurements (days)", help: "" },
];

export function SettingsTab() {
  const { data, reload } = useApiData<Settings>("/admin/settings");
  // Re-key on the stored values so the form starts over from what the server now holds.
  return data ? <SettingsForm key={JSON.stringify(data)} data={data} reload={reload} /> : null;
}

function SettingsForm({ data, reload }: { data: Settings; reload: () => Promise<void> }) {
  const [draft, setDraft] = useState<Settings>(data);
  const [deny, setDeny] = useState((data.target_denylist ?? []).join("\n"));
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
    const list = deny.split("\n").map((l) => l.trim()).filter(Boolean);
    if (JSON.stringify(list) !== JSON.stringify(data.target_denylist ?? [])) changes.target_denylist = list;
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
              Counted as nodes × echo requests, not just browser requests, so one click on a large
              fleet cannot be a flood.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {LIMITS.map(({ key, label, help }) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={key}>{label}</Label>
                <Input
                  id={key}
                  type="number"
                  min={1}
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
