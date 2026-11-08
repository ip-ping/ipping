"use client";

import { BellIcon, HistoryIcon, PauseIcon, PencilIcon, PlayIcon, PlusIcon, SendIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Panel } from "@/components/panel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Legend, UptimeStrip } from "@/components/viz/uptime-strip";
import { DNS_RECORD_TYPES, DNS_RESOLVERS, KIND_INFO, KINDS, type Kind } from "@/features/measurements/kinds";
import { api, ApiError, errorMessage, type Schemas } from "@/lib/api/client";
import { useApiData } from "@/lib/api/use-api-data";
import { ms } from "@/lib/format";

type Watch = Schemas["WatchOut"];
type Run = Schemas["WatchRunOut"];
type Input_ = Schemas["WatchIn"];

const INTERVALS = [
  { value: "60", label: "every minute" },
  { value: "300", label: "every 5 minutes" },
  { value: "900", label: "every 15 minutes" },
  { value: "3600", label: "every hour" },
  { value: "21600", label: "every 6 hours" },
  { value: "86400", label: "every day" },
];

const every = (seconds: number) =>
  INTERVALS.find((i) => i.value === String(seconds))?.label ?? (seconds % 60 === 0 ? `every ${seconds / 60} min` : `every ${seconds} s`);

function ago(iso: string | null | undefined): string {
  if (!iso) return "never";
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (seconds < 90) return `${seconds} s ago`;
  if (seconds < 5400) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 172_800) return `${Math.round(seconds / 3600)} h ago`;
  return `${Math.round(seconds / 86_400)} days ago`;
}

/** The state of a watch in one word, for the stamp: what the latest run said, or why it is quiet. */
function state(watch: Watch): { text: string; tone: "default" | "secondary" | "outline" | "destructive" } {
  if (!watch.enabled) return { text: "paused", tone: "outline" };
  if (watch.alerting) return { text: "alerting", tone: "destructive" };
  switch (watch.last_status) {
    case "ok":
      return { text: "ok", tone: "default" };
    case "degraded":
      return { text: "degraded", tone: "secondary" };
    case "down":
      return { text: "down", tone: "destructive" };
    case "error":
      return { text: "can't run", tone: "outline" };
    default:
      return { text: "waiting", tone: "outline" };
  }
}

export function WatchesTab() {
  const { data, reload } = useApiData<Watch[]>("/admin/watches", 10_000);
  const [editing, setEditing] = useState<Watch | "new" | null>(null);
  const [history, setHistory] = useState<Watch | null>(null);

  const act = async (work: () => Promise<unknown>, done?: string) => {
    try {
      await work();
      if (done) toast.success(done);
      await reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-prose text-sm text-muted-foreground">
          A watch runs a measurement on a schedule and tells you when the target stops answering: once when it goes bad, once
          when it is back. Runs are kept in short form; the measurements they make are in the history.
        </p>
        <Button onClick={() => setEditing("new")}>
          <PlusIcon /> Add a watch
        </Button>
      </div>

      {data?.length === 0 && (
        <Panel label="No watches yet" flush>
          <p className="p-4 text-sm text-muted-foreground">
            Add one to check a site, a server or a DNS record every few minutes from every node, and to be told when it breaks.
          </p>
        </Panel>
      )}

      <ul className="space-y-3">
        {data?.map((watch) => {
          const s = state(watch);
          const last = watch.history.at(-1);
          return (
            <li key={watch.id}>
              <Panel
                label={
                  <span className="flex items-center gap-2">
                    <Badge variant={s.tone}>{s.text}</Badge>
                    <span className="normal-case tracking-normal">{watch.name}</span>
                  </span>
                }
                meta={<span className="normal-case tracking-normal">{KIND_INFO[watch.kind as Kind]?.label ?? watch.kind}</span>}
              >
                <div className="space-y-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                    <span className="font-mono text-sm [overflow-wrap:anywhere]">
                      {watch.target}
                      {watch.options.port ? `:${watch.options.port}` : ""}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {every(watch.interval_s)} · bad below {watch.min_ok_pct}% of nodes · alert after {watch.alert_after}
                      {watch.alert_url ? ` · ${watch.alert_format === "ntfy" ? "ntfy" : "webhook"}` : " · no alert address"}
                    </span>
                  </div>
                  <UptimeStrip runs={watch.history} />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      Last run {ago(watch.last_run_at)}
                      {last && last.status !== "error" ? ` · ${last.nodes_ok} of ${last.nodes_total} nodes` : ""}
                      {last?.median_ms != null ? ` · median ${ms(last.median_ms)} ms` : ""}
                      {last?.status === "error" && last.note ? ` · ${last.note}` : ""}
                    </span>
                    <Legend />
                  </div>
                  {watch.alerting && (
                    <Alert variant="destructive">
                      <AlertTitle>An alert is open</AlertTitle>
                      <AlertDescription>
                        The target has been bad for {watch.bad_streak} runs in a row. You will be told once when it is back.
                      </AlertDescription>
                    </Alert>
                  )}
                  {watch.last_alert_error && (
                    <Alert>
                      <AlertTitle>The last alert was not delivered</AlertTitle>
                      <AlertDescription>{watch.last_alert_error}</AlertDescription>
                    </Alert>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => act(() => api("POST", `/admin/watches/${watch.id}/run`), "Started")}>
                      <PlayIcon /> Run now
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setHistory(watch)}>
                      <HistoryIcon /> History
                    </Button>
                    {watch.alert_url && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          act(async () => {
                            const result = await api<Schemas["TestAlertOut"]>("POST", `/admin/watches/${watch.id}/test-alert`);
                            if (!result.ok) throw new Error(result.error ?? "The test alert was not delivered.");
                          }, "Test alert delivered")
                        }
                      >
                        <SendIcon /> Test alert
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => setEditing(watch)}>
                      <PencilIcon /> Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => act(() => api("PATCH", `/admin/watches/${watch.id}`, { enabled: !watch.enabled }))}
                    >
                      {watch.enabled ? <PauseIcon /> : <PlayIcon />} {watch.enabled ? "Pause" : "Resume"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      onClick={() => {
                        if (window.confirm(`Delete the watch “${watch.name}” and its history?`)) void act(() => api("DELETE", `/admin/watches/${watch.id}`), "Deleted");
                      }}
                    >
                      <Trash2Icon /> Delete
                    </Button>
                  </div>
                </div>
              </Panel>
            </li>
          );
        })}
      </ul>

      {editing && (
        <WatchDialog
          key={editing === "new" ? "new" : editing.id}
          watch={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reload();
          }}
        />
      )}
      {history && <HistoryDialog watch={history} onClose={() => setHistory(null)} />}
    </div>
  );
}

function HistoryDialog({ watch, onClose }: { watch: Watch; onClose: () => void }) {
  const { data } = useApiData<Run[]>(`/admin/watches/${watch.id}/runs?limit=200`);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{watch.name}: runs</DialogTitle>
          <DialogDescription>The latest runs, newest first. A run that made a measurement links to it.</DialogDescription>
        </DialogHeader>
        <div className="max-h-96 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="label sticky top-0 bg-card">
              <tr>
                <th className="py-1.5 pr-3 font-normal">When</th>
                <th className="py-1.5 pr-3 font-normal">Result</th>
                <th className="py-1.5 pr-3 text-right font-normal">Nodes</th>
                <th className="py-1.5 pr-3 text-right font-normal">Median</th>
                <th className="py-1.5 font-normal" />
              </tr>
            </thead>
            <tbody>
              {data?.map((run) => (
                <tr key={run.at} className="border-t align-top">
                  <td className="py-1.5 pr-3 whitespace-nowrap tabular-nums">{new Date(run.at).toLocaleString()}</td>
                  <td className="py-1.5 pr-3">
                    <Badge variant={run.status === "ok" ? "default" : run.status === "error" ? "outline" : "secondary"}>{run.status === "error" ? "can't run" : run.status}</Badge>
                    {run.note && <div className="text-xs text-muted-foreground">{run.note}</div>}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{run.status === "error" ? "–" : `${run.nodes_ok} / ${run.nodes_total}`}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{run.median_ms != null ? `${ms(run.median_ms)} ms` : "–"}</td>
                  <td className="py-1.5 text-right">
                    {run.measurement_id && (
                      <Link href={`/measurements/${run.measurement_id}`} className="text-xs underline">
                        open
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
              {data?.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-muted-foreground">
                    No runs yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Choose<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label>{label}</Label>
      <Select value={value} items={options} onValueChange={(next) => next !== null && onChange(next as T)}>
        <SelectTrigger className="w-full">
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

function WatchDialog({ watch, onClose, onSaved }: { watch: Watch | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const o = (watch?.options ?? {}) as Record<string, unknown>;
  const [name, setName] = useState(watch?.name ?? "");
  const [kind, setKind] = useState<Kind>((watch?.kind as Kind) ?? "http");
  const [target, setTarget] = useState(watch?.target ?? "");
  const [port, setPort] = useState(o.port ? String(o.port) : "");
  const [count, setCount] = useState(o.count ? String(o.count) : "");
  const [follow, setFollow] = useState(Boolean(o.follow_redirects));
  const [record, setRecord] = useState<(typeof DNS_RECORD_TYPES)[number]>((o.record_type as (typeof DNS_RECORD_TYPES)[number]) ?? "A");
  const [resolver, setResolver] = useState<(typeof DNS_RESOLVERS)[number]["value"]>((o.resolver as (typeof DNS_RESOLVERS)[number]["value"]) ?? "system");
  const [interval, setInterval_] = useState(watch ? String(watch.interval_s) : "300");
  const [minOk, setMinOk] = useState(String(watch?.min_ok_pct ?? 80));
  const [after, setAfter] = useState(String(watch?.alert_after ?? 2));
  const [url, setUrl] = useState(watch?.alert_url ?? "");
  const [format, setFormat] = useState<"json" | "ntfy">((watch?.alert_format as "json" | "ntfy") ?? "json");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const body: Record<string, unknown> = {
      name: name.trim(),
      target: target.trim(),
      interval_s: Number(interval),
      min_ok_pct: Number(minOk),
      alert_after: Number(after),
      alert_url: url.trim(),
      alert_format: format,
    };
    if (!watch) body.kind = kind;
    if ((kind === "tcp" || kind === "http" || kind === "tls") && port.trim()) body.port = Number(port);
    if ((kind === "ping" || kind === "tcp") && count.trim()) body.count = Number(count);
    if (kind === "http") body.follow_redirects = follow;
    if (kind === "dns") {
      body.record_type = record;
      body.resolver = resolver;
    }
    try {
      if (watch) await api("PATCH", `/admin/watches/${watch.id}`, body);
      else await api("POST", "/admin/watches", body as unknown as Input_);
      toast.success(watch ? "Saved" : "Watch added");
      await onSaved();
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong.");
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={submit} className="grid grid-cols-[minmax(0,1fr)] gap-4">
          <DialogHeader>
            <DialogTitle>{watch ? "Edit the watch" : "Add a watch"}</DialogTitle>
            <DialogDescription>It measures from every online node, on a schedule, and judges each run.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="w-name">Name</Label>
            <Input id="w-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Main site" required maxLength={80} />
          </div>
          <div className="grid gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
            <Choose
              label="Check"
              value={kind}
              onChange={setKind}
              options={(watch ? [kind] : KINDS).map((k) => ({ value: k, label: KIND_INFO[k].label }))}
            />
            <div className="space-y-1.5">
              <Label htmlFor="w-target">{kind === "dns" ? "Domain name" : "Target"}</Label>
              <Input id="w-target" value={target} onChange={(e) => setTarget(e.target.value)} placeholder={KIND_INFO[kind].placeholder} className="font-mono" required autoCapitalize="off" spellCheck={false} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {(kind === "tcp" || kind === "http" || kind === "tls") && (
              <div className="space-y-1.5">
                <Label htmlFor="w-port">{kind === "tcp" ? "Port" : "Port (optional)"}</Label>
                <Input id="w-port" type="number" min={1} max={65535} value={port} onChange={(e) => setPort(e.target.value)} />
              </div>
            )}
            {(kind === "ping" || kind === "tcp") && (
              <div className="space-y-1.5">
                <Label htmlFor="w-count">Probes per node</Label>
                <Input id="w-count" type="number" min={1} max={10} value={count} onChange={(e) => setCount(e.target.value)} placeholder="4" />
              </div>
            )}
            {kind === "http" && (
              <label className="flex cursor-pointer items-center gap-2 self-end pb-2 text-sm">
                <Checkbox checked={follow} onCheckedChange={(c) => setFollow(c === true)} /> Follow redirects
              </label>
            )}
            {kind === "dns" && (
              <>
                <Choose label="Record type" value={record} onChange={setRecord} options={DNS_RECORD_TYPES.map((t) => ({ value: t, label: t }))} />
                <Choose label="Resolver" value={resolver} onChange={setResolver} options={DNS_RESOLVERS} />
              </>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Choose
              label="Run"
              value={interval}
              onChange={setInterval_}
              options={INTERVALS.some((i) => i.value === interval) ? INTERVALS : [{ value: interval, label: every(Number(interval)) }, ...INTERVALS]}
            />
            <div className="space-y-1.5">
              <Label htmlFor="w-min">Bad below (% of nodes)</Label>
              <Input id="w-min" type="number" min={1} max={100} value={minOk} onChange={(e) => setMinOk(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="w-after">Alert after (bad runs)</Label>
              <Input id="w-after" type="number" min={1} max={10} value={after} onChange={(e) => setAfter(e.target.value)} required />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
            <div className="space-y-1.5">
              <Label htmlFor="w-url">
                <BellIcon className="mr-1 inline size-3.5" /> Alert address (optional)
              </Label>
              <Input id="w-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://ntfy.sh/your-topic" className="font-mono" autoCapitalize="off" spellCheck={false} />
            </div>
            <Choose label="Format" value={format} onChange={setFormat} options={[{ value: "json", label: "Webhook (JSON)" }, { value: "ntfy", label: "ntfy" }]} />
          </div>
          <p className="text-xs text-muted-foreground">
            The address must be public unless private webhooks are allowed in the settings. It is never written to the audit log.
          </p>
          {error && (
            <Alert variant="destructive">
              <AlertTitle>That could not be saved</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {watch ? "Save" : "Add the watch"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
