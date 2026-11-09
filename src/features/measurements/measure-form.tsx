"use client";

import { ActivityIcon, Loader2Icon, NetworkIcon, PlugIcon, GlobeIcon, SearchIcon, ShieldCheckIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/panel";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNodes } from "@/features/nodes/use-nodes";
import { api, ApiError, type Measurement, type Schemas } from "@/lib/api/client";
import { flag, place } from "@/lib/format";
import { cn } from "@/lib/utils";

import { useSelection } from "./selection";
import {
  DNS_RECORD_TYPES,
  DNS_RESOLVERS,
  DNS_TRANSPORTS,
  KIND_INFO,
  KINDS,
  canUseDoh,
  type DnsRecordType,
  type DnsResolver,
  type DnsTransport,
  type Kind,
} from "./kinds";

type Request = Schemas["CreateMeasurementRequest"];

const KIND_ICON: Record<Kind, typeof ActivityIcon> = {
  ping: ActivityIcon,
  tcp: PlugIcon,
  http: GlobeIcon,
  traceroute: NetworkIcon,
  dns: SearchIcon,
  tls: ShieldCheckIcon,
};

function Choice<T extends string>({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 space-y-1.5", className)}>
      <Label>{label}</Label>
      <Select
        value={value}
        items={options}
        onValueChange={(next) => next !== null && onChange(next as T)}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function MeasureForm({
  initialTarget = "",
  initialRecordType = "A",
  initialResolver = "system",
  initialTransport = "udp",
}: {
  initialTarget?: string;
  initialRecordType?: DnsRecordType;
  initialResolver?: DnsResolver;
  initialTransport?: DnsTransport;
}) {
  const router = useRouter();
  const { nodes } = useNodes();
  const { kind, setKind, scope, setScope, selected, setSelected } = useSelection();
  const info = KIND_INFO[kind];
  const online = nodes?.filter((n) => n.online) ?? [];
  // Older nodes only know ping; say so instead of failing after the click.
  const capable = online.filter((n) => n.kinds.includes(kind));

  const [target, setTarget] = useState(initialTarget);
  const [port, setPort] = useState("");
  const [follow, setFollow] = useState(false);
  const [dnsMode, setDnsMode] = useState<Request["dns_mode"]>("fixed");
  const [family, setFamily] = useState<Request["family"]>("auto");
  const [count, setCount] = useState("4");
  const [rounds, setRounds] = useState("1");
  const [recordType, setRecordType] = useState<DnsRecordType>(initialRecordType);
  const [resolver, setResolver] = useState<DnsResolver>(initialResolver);
  const [transport, setTransport] = useState<DnsTransport>(initialTransport);
  // DNS over HTTPS can be asked of Cloudflare and Google only; for any other resolver the question goes over UDP
  const viaHttps = transport === "doh" && canUseDoh(resolver);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | Error | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body: Request = {
        target: target.trim(),
        kind,
        dns_mode: dnsMode,
        family,
        follow_redirects: kind === "http" && follow,
        node_ids: scope === "selected" ? [...selected] : null,
      };
      if (kind === "dns") {
        body.record_type = recordType;
        body.resolver = resolver;
        if (viaHttps) body.transport = "doh";
      }
      if (kind === "ping" || kind === "tcp") body.count = Number(count);
      if (kind === "traceroute" && rounds !== "1") body.count = Number(rounds);
      if ((kind === "tcp" || kind === "http" || kind === "tls") && port.trim()) body.port = Number(port);
      const created = await api<Measurement>("POST", "/measurements", body);
      router.push(`/measurements/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e : new Error("Something went wrong."));
      setBusy(false);
    }
  };

  const noNodes = nodes !== null && online.length === 0;
  const noCapable = nodes !== null && online.length > 0 && capable.length === 0;
  const needsSelection = scope === "selected" && selected.size === 0;
  const KindIcon = KIND_ICON[kind];

  return (
    <Panel label="Command" meta={<span className="normal-case tracking-normal">{info.label}</span>}>
        <form onSubmit={submit} className="space-y-5">
          <Tabs value={kind} onValueChange={(next) => next !== null && setKind(next as Kind)}>
            <TabsList>
              {KINDS.map((k) => (
                <TabsTrigger key={k} value={k}>
                  {KIND_INFO[k].label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="space-y-1.5">
            <Label htmlFor="target">{kind === "dns" ? "Domain name" : "IP address, hostname or URL"}</Label>
            <div className="flex gap-2">
              <Input
                id="target"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder={info.placeholder}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                className="h-9 font-mono"
                required
                autoFocus
              />
              <Button
                type="submit"
                disabled={busy || !target.trim() || noNodes || noCapable || needsSelection}
              >
                {busy ? <Loader2Icon className="animate-spin" /> : <KindIcon />}
                {info.action}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {nodes === null
                ? "Checking which nodes are online…"
                : `${online.length} node${online.length === 1 ? "" : "s"} online${
                    kind !== "ping" && online.length > 0 ? `, ${capable.length} can run this` : ""
                  }.`}{" "}
              {info.explain}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-12">
            {kind === "dns" ? (
              <>
                <Choice
                  className="lg:col-span-3"
                  label="Record type"
                  value={recordType}
                  onChange={setRecordType}
                  options={DNS_RECORD_TYPES.map((t) => ({ value: t, label: t }))}
                />
                <Choice
                  className="lg:col-span-3"
                  label="Resolver"
                  value={resolver}
                  onChange={setResolver}
                  options={DNS_RESOLVERS}
                />
                {canUseDoh(resolver) && (
                  <Choice
                    className="lg:col-span-3"
                    label="Transport"
                    value={viaHttps ? "doh" : "udp"}
                    onChange={setTransport}
                    options={DNS_TRANSPORTS}
                  />
                )}
              </>
            ) : (
              <>
                <Choice
                  className="lg:col-span-3"
                  label="Name resolution"
                  value={dnsMode}
                  onChange={setDnsMode}
                  options={[
                    { value: "fixed", label: "Same IP for every node" },
                    { value: "regional", label: "Each node resolves it" },
                  ]}
                />
                <Choice
                  className="lg:col-span-3"
                  label="IP version"
                  value={family}
                  onChange={setFamily}
                  options={[
                    { value: "auto", label: "Automatic" },
                    { value: "4", label: "IPv4" },
                    { value: "6", label: "IPv6" },
                  ]}
                />
              </>
            )}
            {(kind === "ping" || kind === "tcp") && (
              <Choice
                className="lg:col-span-3"
                label={kind === "ping" ? "Echo requests per node" : "Connections per node"}
                value={count}
                onChange={setCount}
                options={[1, 2, 3, 4, 5, 6, 8, 10].map((n) => ({ value: String(n), label: String(n) }))}
              />
            )}
            {kind === "traceroute" && (
              <Choice
                className="lg:col-span-3"
                label="Rounds (like mtr)"
                value={rounds}
                onChange={setRounds}
                options={[1, 3, 5, 10].map((n) => ({ value: String(n), label: n === 1 ? "1 (just trace)" : String(n) }))}
              />
            )}
            {(kind === "tcp" || kind === "http" || kind === "tls") && (
              <div className="min-w-0 space-y-1.5 lg:col-span-3">
                <Label htmlFor="port">{kind === "tcp" ? "Port" : "Port (optional)"}</Label>
                <Input
                  id="port"
                  type="number"
                  min={1}
                  max={65535}
                  inputMode="numeric"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  placeholder={kind === "tcp" ? "443, or host:port above" : kind === "tls" ? "443, or host:port above" : "from the URL"}
                  className="h-9"
                />
              </div>
            )}
            {kind === "http" && (
              <label className="flex cursor-pointer items-center gap-2 self-end pb-2 text-sm lg:col-span-3">
                <Checkbox checked={follow} onCheckedChange={(checked) => setFollow(checked === true)} />
                Follow redirects
              </label>
            )}
            <div className="min-w-0 space-y-1.5 sm:col-span-2 lg:col-span-6">
              <Label>Nodes</Label>
              <div className="flex gap-2">
                <Select
                  value={scope}
                  items={[
                    { value: "all", label: "All online nodes" },
                    { value: "selected", label: `Selected (${selected.size})` },
                  ]}
                  onValueChange={(next) => {
                    if (next === null) return;
                    setScope(next as "all" | "selected");
                    if (next === "selected" && selected.size === 0) setPicking(true);
                  }}
                >
                  <SelectTrigger className="w-full min-w-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All online nodes</SelectItem>
                    <SelectItem value="selected">Selected ({selected.size})</SelectItem>
                  </SelectContent>
                </Select>
                <Dialog open={picking} onOpenChange={setPicking}>
                  <DialogTrigger
                    render={
                      <Button
                        type="button"
                        variant="outline"
                        className={scope === "selected" ? undefined : "hidden"}
                      />
                    }
                  >
                    Choose
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Choose nodes</DialogTitle>
                      <DialogDescription>
                        Only nodes that are online right now can be selected.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="max-h-72 space-y-2 overflow-y-auto">
                      {online.map((node) => (
                        <label key={node.id} className="flex cursor-pointer items-center gap-3 text-sm">
                          <Checkbox
                            checked={selected.has(node.id)}
                            onCheckedChange={(checked) => {
                              const next = new Set(selected);
                              if (checked) next.add(node.id);
                              else next.delete(node.id);
                              setSelected(next);
                            }}
                          />
                          <span className="font-medium">{node.name}</span>
                          <span className="text-muted-foreground">
                            {flag(node.country)} {place(node)}
                          </span>
                        </label>
                      ))}
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="ghost" onClick={() => setSelected(new Set(online.map((n) => n.id)))}>
                        Select all
                      </Button>
                      <Button type="button" variant="ghost" onClick={() => setSelected(new Set())}>
                        Clear
                      </Button>
                      <Button type="button" onClick={() => setPicking(false)}>
                        Done
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </div>

          {noCapable && (
            <Alert>
              <AlertTitle>No online node can run {info.label}</AlertTitle>
              <AlertDescription>
                The nodes that are online are older and only know ping. Update them to run{" "}
                {info.label} measurements.
              </AlertDescription>
            </Alert>
          )}
          {noNodes && (
            <Alert>
              <AlertTitle>No node is online</AlertTitle>
              <AlertDescription>
                Measurements need at least one approved, connected node.
              </AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertTitle>That measurement could not start</AlertTitle>
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          )}
        </form>
    </Panel>
  );
}
