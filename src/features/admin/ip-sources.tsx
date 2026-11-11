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
type Credential = Source["credentials"][number];
type Update = Partial<Schemas["IpDataUpdate"]>;
type Send = (name: string, body: Update, done: string) => Promise<boolean>;

const STATE: Record<Source["state"], { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  ready: { label: "ready", variant: "secondary" },
  disabled: { label: "off", variant: "outline" },
  needs_setup: { label: "needs setup", variant: "outline" },
  waiting: { label: "waiting for its first download", variant: "outline" },
  offline: { label: "offline mode", variant: "outline" },
  no_directory: { label: "no data directory", variant: "destructive" },
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

/**
 * What a source's free download needs from its account (MaxMind: an account ID and a license key, IPinfo: a token, ...). Every source is
 * handled the same way: typed here, kept on the server, and a secret is never shown again. An account ID is not a secret and is shown.
 */
function Credentials({ source, send, busy }: { source: Source; send: Send; busy: boolean }) {
  const [typed, setTyped] = useState<Record<string, string>>({});
  if (source.credentials.length === 0) return null;
  const fromEnvironment = source.credentials.some((c) => c.from_environment);
  const saved = (c: Credential) => (c.secret ? "" : (c.value ?? ""));
  const shown = (c: Credential) => typed[c.name] ?? saved(c);
  const changed = source.credentials.filter((c) => shown(c).trim() !== saved(c));
  const anySet = source.credentials.some((c) => c.set);
  const submit = async (credentials: Record<string, string>, done: string) => {
    if (await send(`key-${source.id}`, { sources: { [source.id]: { credentials } } }, `${source.name}: ${done}`)) setTyped({});
  };
  return (
    <div className="space-y-2">
      {source.credentials.map((c) => (
        <div key={c.name} className="grid items-center gap-2 sm:grid-cols-[9rem_minmax(0,1fr)_auto]">
          <Label htmlFor={`${source.id}-${c.name}`} className="text-sm">
            {c.label}
          </Label>
          <Input
            id={`${source.id}-${c.name}`}
            type={c.secret ? "password" : "text"}
            autoComplete={c.secret ? "new-password" : "off"}
            spellCheck={false}
            disabled={c.from_environment}
            value={shown(c)}
            onChange={(e) => setTyped({ ...typed, [c.name]: e.target.value })}
            placeholder={c.secret && c.set ? "Saved. Type a new one to replace it" : `Paste your ${c.label}`}
          />
          {c.set ? <Badge variant="secondary">saved</Badge> : <span />}
        </div>
      ))}
      {fromEnvironment ? (
        <p className="text-xs text-muted-foreground">This is set in the server&apos;s environment, which wins over this page: it cannot be changed here.</p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">It is kept on this server. A key is never shown again.</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={busy || changed.length === 0}
              onClick={() => submit(Object.fromEntries(changed.map((c) => [c.name, shown(c).trim()])), "key saved")}
            >
              Save key
            </Button>
            {anySet && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => submit(Object.fromEntries(source.credentials.map((c) => [c.name, ""])), "key removed")}
              >
                Remove key
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SourceRow({ source, send, busy }: { source: Source; send: Send; busy: boolean }) {
  const state = STATE[source.state];
  const timing = source.running ? "Downloading…" : source.last_attempt ? `Last check ${when(source.last_attempt)}` : null;
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
        </div>
        <Badge variant={state.variant} title={source.detail ?? undefined} data-testid={`source-state-${source.id}`}>
          {state.label}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        {source.summary} {source.cost}
      </p>
      {source.enabled && source.detail && source.state !== "ready" && <p className="text-xs text-muted-foreground">{source.detail}</p>}
      {source.error && <p className="text-xs text-destructive">The last download did not work: {source.error}</p>}
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
      {source.enabled && timing && (
        <p className="text-xs text-muted-foreground" data-testid={`source-timing-${source.id}`}>
          {timing}
          {!source.running && source.next_check ? ` · next ${when(source.next_check)}` : ""}
        </p>
      )}
      {source.attribution && <p className="text-xs text-muted-foreground">{source.attribution}</p>}
      <Credentials source={source} send={send} busy={busy} />
    </li>
  );
}

/**
 * Every IP data source, all the same: its switch (all on by default), what its download needs, what is on disk and how the last check went.
 * A lookup asks every source that is on and takes a majority vote. Every source is a database this server downloads and answers from.
 */
export function SourcesCard({ data, send, busy, checkNow }: { data: IpData; send: Send; busy: string | null; checkNow: () => void }) {
  const [hours, setHours] = useState(String(data.data_update_hours));
  const on = data.sources.filter((s) => s.enabled).length;
  const downloading = data.sources.some((s) => s.running);
  return (
    <Card data-testid="ip-sources-card">
      <CardHeader>
        <CardTitle>IP data sources</CardTitle>
        <CardDescription>
          {on} of {data.sources.length} sources are on. Each is a database this server downloads and answers from, so nothing is asked of a service when
          an address is looked up. Every address is put to every source that is on and the answers are voted on: the value most sources give wins, and
          each field says how sure the vote is. One source with something to say is enough.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {data.offline && (
          <Alert>
            <AlertTitle>Offline mode</AlertTitle>
            <AlertDescription>
              <code>IPPING_IPDATA_OFFLINE</code> is set on this server: nothing is downloaded. The databases already on disk still answer.
            </AlertDescription>
          </Alert>
        )}
        {!data.directory_configured && !data.offline && (
          <Alert variant="destructive">
            <AlertTitle>Nowhere to keep the databases</AlertTitle>
            <AlertDescription>
              The backend has no directory for them (<code>IPPING_GEOIP_DIR</code>), so nothing can be downloaded. Docker installs have one; for a direct
              install, update the installer and run <code>ipping.sh update</code>.
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
            <Label htmlFor="data-hours">Look for newer files</Label>
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
        <Button type="button" onClick={checkNow} disabled={busy !== null || downloading || data.offline || !data.directory_configured}>
          {downloading ? "Downloading…" : "Check for updates now"}
        </Button>
      </CardFooter>
    </Card>
  );
}
