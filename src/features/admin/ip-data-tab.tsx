"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, errorMessage, type Schemas } from "@/lib/api/client";
import { useApiData } from "@/lib/api/use-api-data";

type IpData = Schemas["IpDataOut"];
type Update = Partial<Schemas["IpDataUpdate"]>;
type Edition = Schemas["IpDataOut"]["maxmind"]["editions"][number];

const EDITIONS: { value: Edition; label: string; help: string }[] = [
  { value: "GeoLite2-City", label: "City", help: "Country, region, city, position and time zone." },
  { value: "GeoLite2-ASN", label: "ASN", help: "The network: AS number and who runs it (a node's provider)." },
  { value: "GeoLite2-Country", label: "Country", help: "Only needed without City: the country of an address." },
];

const HOURS = [
  { value: "6", label: "Every 6 hours" },
  { value: "12", label: "Every 12 hours" },
  { value: "24", label: "Every day" },
  { value: "48", label: "Every 2 days" },
  { value: "72", label: "Every 3 days" },
  { value: "168", label: "Every week" },
];

const ACCESS = [
  { value: "api_key", label: "An API key or an administrator" },
  { value: "public", label: "Anyone" },
  { value: "admin", label: "Administrators only" },
];

const when = (iso: string | null | undefined): string => (iso ? new Date(iso).toLocaleString() : "never");
const day = (iso: string | null | undefined): string => (iso ? new Date(iso).toLocaleDateString() : "–");
const megabytes = (bytes: number | null | undefined): string => (bytes ? `${(bytes / 1_048_576).toFixed(1)} MB` : "–");

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
  const m = data.maxmind;
  const fromEnvironment = m.credentials_source === "environment";
  const [account, setAccount] = useState(m.account_id);
  const [key, setKey] = useState("");
  const [editions, setEditions] = useState<Edition[]>(m.editions);
  const [autoUpdate, setAutoUpdate] = useState(m.auto_update);
  const [hours, setHours] = useState(String(m.update_hours));
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

  const saveCredentials = async () => {
    const body: Update = { account_id: account.trim() };
    if (key.trim()) body.license_key = key.trim();
    if (await send("credentials", body, key.trim() ? "MaxMind account saved; downloading the databases" : "Account ID saved")) setKey("");
  };
  const updateNow = async () => {
    setBusy("update");
    try {
      await api("POST", "/admin/ip-data/update");
      toast.success("Downloading the databases");
      await reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const next = m.next_check ? when(m.next_check) : m.auto_update ? "when a key is saved" : "automatic updates are off";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>MaxMind GeoLite2</CardTitle>
          <CardDescription>
            Free IP databases from MaxMind (maxmind.com): where an address is and which network it belongs to. Create a free
            GeoLite2 account, make a license key under <em>Manage license keys</em>, and enter the account ID and the key here.
            The backend downloads the databases and keeps them up to date.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!m.directory_configured && (
            <Alert variant="destructive">
              <AlertTitle>Nowhere to keep the databases</AlertTitle>
              <AlertDescription>
                The backend has no directory for them (<code>IPPING_GEOIP_DIR</code>). Docker installs have one; for a direct
                install, update the installer and run <code>ipping.sh update</code>.
              </AlertDescription>
            </Alert>
          )}
          {fromEnvironment && (
            <Alert>
              <AlertTitle>The account comes from the environment</AlertTitle>
              <AlertDescription>
                <code>IPPING_MAXMIND_ACCOUNT_ID</code> and <code>IPPING_MAXMIND_LICENSE_KEY</code> are set, so they are used and
                cannot be changed here.
              </AlertDescription>
            </Alert>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="maxmind-account">Account ID</Label>
              <Input
                id="maxmind-account"
                inputMode="numeric"
                autoComplete="off"
                value={account}
                disabled={fromEnvironment}
                onChange={(e) => setAccount(e.target.value)}
                placeholder="123456"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="maxmind-key">License key</Label>
              <Input
                id="maxmind-key"
                type="password"
                autoComplete="new-password"
                value={key}
                disabled={fromEnvironment}
                onChange={(e) => setKey(e.target.value)}
                placeholder={m.license_key_set ? "Saved. Type a new one to replace it" : "Paste your license key"}
              />
              <p className="text-xs text-muted-foreground">It is kept on the server and is never shown again.</p>
            </div>
          </div>
          {!fromEnvironment && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={saveCredentials} disabled={busy !== null || (!account.trim() && !key.trim())}>
                Save account
              </Button>
              {(m.license_key_set || m.account_id) && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={async () => {
                    if (await send("clear", { clear_credentials: true }, "MaxMind account removed")) setAccount("");
                  }}
                >
                  Remove account
                </Button>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>Databases to keep</Label>
            <div className="grid gap-3 sm:grid-cols-3">
              {EDITIONS.map(({ value, label, help }) => (
                <Label key={value} className="flex cursor-pointer items-start gap-3 text-sm">
                  <Checkbox
                    checked={editions.includes(value)}
                    onCheckedChange={(checked) =>
                      setEditions((current) => (checked ? [...new Set([...current, value])] : current.filter((e) => e !== value)))
                    }
                  />
                  <span>
                    <span className="font-medium">{label}</span>
                    <span className="block text-xs text-muted-foreground">{help}</span>
                  </span>
                </Label>
              ))}
            </div>
          </div>
          <div className="grid items-end gap-4 sm:grid-cols-2">
            <div className="flex items-center gap-3 pb-2">
              <Switch id="maxmind-auto" checked={autoUpdate} onCheckedChange={setAutoUpdate} />
              <Label htmlFor="maxmind-auto">Keep them up to date automatically</Label>
            </div>
            <PickOne id="maxmind-hours" label="Look for newer databases" value={hours} options={HOURS} onChange={setHours} />
          </div>
          <p className="text-xs text-muted-foreground">
            MaxMind publishes City on Tuesdays and Fridays and ASN on weekdays, and allows 30 downloads a day. A check first asks
            whether anything newer exists and downloads only if so.
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={busy !== null || editions.length === 0}
            onClick={() =>
              send(
                "options",
                { maxmind_editions: editions, maxmind_auto_update: autoUpdate, maxmind_update_hours: Number(hours) },
                "Update settings saved",
              )
            }
          >
            Save update settings
          </Button>
        </CardContent>
        <CardFooter className="flex flex-wrap items-center justify-between gap-3 border-t text-sm">
          <div className="space-y-0.5 text-muted-foreground">
            <div>
              Last check: {when(m.last_attempt)}
              {m.last_success && m.last_success !== m.last_attempt ? ` · last success ${when(m.last_success)}` : ""}
            </div>
            <div>Next check: {next}</div>
          </div>
          <Button type="button" onClick={updateNow} disabled={busy !== null || m.running || !m.directory_configured || !(m.license_key_set && m.account_id)}>
            {m.running ? "Downloading…" : "Update now"}
          </Button>
        </CardFooter>
      </Card>

      {m.error && (
        <Alert variant="destructive">
          <AlertTitle>The last update did not work</AlertTitle>
          <AlertDescription>{m.error.message}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Databases in use</CardTitle>
          <CardDescription>
            {data.databases_loaded ? (
              <>Source: {data.source}. A file whose name starts with GeoLite2 is used in preference to any other.</>
            ) : (
              "No IP database is installed yet."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Database</TableHead>
                <TableHead>Built by MaxMind</TableHead>
                <TableHead>Downloaded</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {m.databases.map((d) => (
                <TableRow key={d.edition}>
                  <TableCell className="font-medium">{d.edition}</TableCell>
                  <TableCell>{day(d.built)}</TableCell>
                  <TableCell>{d.downloaded_at ? when(d.downloaded_at) : "–"}</TableCell>
                  <TableCell>{megabytes(d.size)}</TableCell>
                  <TableCell>
                    {d.error ? (
                      <Badge variant="destructive" title={d.error}>
                        failed
                      </Badge>
                    ) : d.present ? (
                      <Badge variant="secondary">in use</Badge>
                    ) : editions.includes(d.edition) ? (
                      <Badge variant="outline">waiting</Badge>
                    ) : (
                      <Badge variant="outline">not kept</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {data.attribution && <p className="mt-3 text-xs text-muted-foreground">{data.attribution}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>IP lookup API</CardTitle>
          <CardDescription>
            <code>GET /api/v1/ip/&lt;address&gt;</code> answers with the network, country, region, city, position, time zone and AS
            number from these databases; <code>GET /api/v1/ip</code> with the caller&apos;s own address.
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
            API keys are made in the <em>API keys</em> tab. MaxMind&apos;s license lets you answer single lookups, not hand out the
            databases.
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
            go back to the automatic value. The place from the databases is used only where it agrees with the place you or the node
            gave (another country, or a city about 300 km away, and the databases are not used for the place; the provider and AS
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
