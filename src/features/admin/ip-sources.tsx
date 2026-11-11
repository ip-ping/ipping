"use client";

import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { Schemas } from "@/lib/api/client";

type IpData = Schemas["IpDataOut"];
type Source = Schemas["SourceAdminOut"];
type Update = Partial<Schemas["IpDataUpdate"]>;
type Send = (name: string, body: Update, done: string) => Promise<boolean>;

const STATE: Record<Source["state"], { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  ready: { label: "ready", variant: "secondary" },
  disabled: { label: "off", variant: "outline" },
  needs_setup: { label: "needs setup", variant: "outline" },
  waiting: { label: "waiting for its first download", variant: "outline" },
  offline: { label: "offline mode", variant: "outline" },
  no_directory: { label: "no data directory", variant: "destructive" },
  paused: { label: "out of requests", variant: "destructive" },
};

const HOURS = [
  { value: "6", label: "Every 6 hours" },
  { value: "12", label: "Every 12 hours" },
  { value: "24", label: "Every day" },
  { value: "48", label: "Every 2 days" },
  { value: "72", label: "Every 3 days" },
  { value: "168", label: "Every week" },
];

const when = (iso: string | null | undefined): string => (iso ? new Date(iso).toLocaleString() : "never");
const megabytes = (bytes: number | null | undefined): string => (bytes ? `${(bytes / 1_048_576).toFixed(1)} MB` : "–");

/** The key or token of an online source: typed here, kept on the server, never shown again. */
function Credentials({ source, send, busy }: { source: Source; send: Send; busy: boolean }) {
  const [values, setValues] = useState<Record<string, string>>({});
  if (source.credentials.length === 0) return null;
  if (source.id === "maxmind") {
    return <p className="text-xs text-muted-foreground">The account ID and license key are set in the MaxMind card below.</p>;
  }
  const typed = source.credentials.filter((c) => (values[c.name] ?? "").trim());
  return (
    <div className="space-y-2">
      {source.credentials.map((c) => (
        <div key={c.name} className="grid items-center gap-2 sm:grid-cols-[9rem_minmax(0,1fr)_auto]">
          <Label htmlFor={`${source.id}-${c.name}`} className="text-sm">
            {c.label} <span className="text-xs font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id={`${source.id}-${c.name}`}
            type={c.secret ? "password" : "text"}
            autoComplete="new-password"
            spellCheck={false}
            value={values[c.name] ?? ""}
            onChange={(e) => setValues({ ...values, [c.name]: e.target.value })}
            placeholder={c.set ? "Saved. Type a new one to replace it" : `Paste a ${c.label.toLowerCase()} for a higher limit`}
          />
          {c.set ? <Badge variant="secondary">saved</Badge> : <span />}
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={busy || typed.length === 0}
          onClick={async () => {
            const credentials = Object.fromEntries(typed.map((c) => [c.name, (values[c.name] ?? "").trim()]));
            if (await send(`key-${source.id}`, { sources: { [source.id]: { credentials } } }, `${source.name}: key saved`)) setValues({});
          }}
        >
          Save key
        </Button>
        {source.credentials.some((c) => c.set) && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={async () => {
              const credentials = Object.fromEntries(source.credentials.map((c) => [c.name, ""]));
              if (await send(`key-${source.id}`, { sources: { [source.id]: { credentials } } }, `${source.name}: key removed`)) setValues({});
            }}
          >
            Remove key
          </Button>
        )}
      </div>
    </div>
  );
}

function SourceRow({ source, send, busy }: { source: Source; send: Send; busy: boolean }) {
  const state = STATE[source.state];
  return (
    <li className="space-y-2 py-4 first:pt-0 last:pb-0" data-testid={`source-row-${source.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <Switch
            id={`source-${source.id}`}
            checked={source.enabled}
            disabled={busy}
            aria-label={`${source.name} on or off`}
            onCheckedChange={(enabled) => send(`source-${source.id}`, { sources: { [source.id]: { enabled } } }, `${source.name} is ${enabled ? "on" : "off"}`)}
          />
          <Label htmlFor={`source-${source.id}`} className="min-w-0 text-sm font-medium">
            <a href={source.homepage} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
              {source.name}
            </a>
          </Label>
          <Badge variant="outline">{source.kind === "online" ? "online" : "database"}</Badge>
        </div>
        <Badge variant={state.variant} title={source.detail ?? undefined} data-testid={`source-state-${source.id}`}>
          {state.label}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        {source.summary} {source.cost}
      </p>
      {source.enabled && source.detail && source.state !== "ready" && <p className="text-xs text-muted-foreground">{source.detail}</p>}
      {source.error && <p className="text-xs text-destructive">The last {source.kind === "online" ? "lookup" : "download"} did not work: {source.error}</p>}
      {source.files.length > 0 && (
        <ul className="space-y-0.5 text-xs text-muted-foreground">
          {source.files.map((f) => (
            <li key={f.name} className="font-mono">
              {f.name} · {megabytes(f.size)}
              {f.built ? ` · built ${new Date(f.built).toLocaleDateString()}` : ""}
              {f.rows ? ` · ${f.rows.toLocaleString()} ranges` : ""}
            </li>
          ))}
        </ul>
      )}
      {source.kind === "database" && source.id !== "maxmind" && source.enabled && (
        <p className="text-xs text-muted-foreground">
          {source.running ? "Downloading…" : `Last check ${when(source.last_attempt)}`}
          {source.next_check ? ` · next ${when(source.next_check)}` : ""}
        </p>
      )}
      {source.attribution && <p className="text-xs text-muted-foreground">{source.attribution}</p>}
      <Credentials source={source} send={send} busy={busy} />
    </li>
  );
}

/**
 * Every IP data source with its switch (all on by default), what it needs, how it is doing and, for the online ones, a place for an optional
 * key. The lookup API and a measurement's addresses ask every source that is on and take a majority vote.
 */
export function SourcesCard({ data, send, busy, updateNow }: { data: IpData; send: Send; busy: string | null; updateNow: () => void }) {
  const [hours, setHours] = useState(String(data.data_update_hours));
  const on = data.sources.filter((s) => s.enabled).length;
  const downloading = data.sources.some((s) => s.running);
  return (
    <Card data-testid="ip-sources-card">
      <CardHeader>
        <CardTitle>IP data sources</CardTitle>
        <CardDescription>
          {on} of {data.sources.length} sources are on. Each address that is looked up is put to every source that is on and the answers are
          voted on: the value most sources give wins, and each field says how sure the vote is. One source with something to say is
          enough. The online services are sent the address that is looked up; turn them off if that is not wanted.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {data.offline && (
          <Alert>
            <AlertTitle>Offline mode</AlertTitle>
            <AlertDescription>
              <code>IPPING_IPDATA_OFFLINE</code> is set on this server: the online sources are not asked and nothing is downloaded. The databases
              already on disk still answer.
            </AlertDescription>
          </Alert>
        )}
        {!data.maxmind.directory_configured && !data.offline && (
          <Alert variant="destructive">
            <AlertTitle>Nowhere to keep the databases</AlertTitle>
            <AlertDescription>
              The backend has no directory for them (<code>IPPING_GEOIP_DIR</code>), so only the online sources can answer.
            </AlertDescription>
          </Alert>
        )}
        <ul className="divide-y">
          {data.sources.map((source) => (
            <SourceRow key={source.id} source={source} send={send} busy={busy !== null} />
          ))}
        </ul>
      </CardContent>
      <CardFooter className="flex flex-wrap items-end justify-between gap-3 border-t">
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="data-hours">Look for newer databases (those that need no account)</Label>
            <Select value={hours} items={HOURS} onValueChange={(next) => next !== null && setHours(next)}>
              <SelectTrigger id="data-hours" className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HOURS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={busy !== null || hours === String(data.data_update_hours)}
            onClick={() => send("hours", { data_update_hours: Number(hours) }, "Saved")}
          >
            Save
          </Button>
        </div>
        <Button type="button" onClick={updateNow} disabled={busy !== null || downloading || data.offline || !data.maxmind.directory_configured}>
          {downloading ? "Downloading…" : "Update databases now"}
        </Button>
      </CardFooter>
    </Card>
  );
}
