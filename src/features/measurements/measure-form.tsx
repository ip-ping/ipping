"use client";

import { ActivityIcon, Loader2Icon, NetworkIcon, PlugIcon, GlobeIcon, SearchIcon, ShieldCheckIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/panel";
import { CommunityBadge } from "@/components/community-badge";
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
import { IpInfoLookup } from "@/features/ip-info/ip-info-lookup";
import { useI18n } from "@/lib/i18n/provider";
import { useNodes } from "@/features/nodes/use-nodes";
import { api, ApiError, type Measurement, type Schemas } from "@/lib/api/client";
import { flag, nodeHeading } from "@/lib/format";
import { cn } from "@/lib/utils";

import { useSelection } from "./selection";
import {
  DNS_RECORD_TYPES,
  DNS_RESOLVERS,
  DNS_TRANSPORTS,
  KIND_INFO,
  TLS_TRANSPORTS,
  type TlsTransport,
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
  initialTlsTransport = "tcp",
  initialIpInfo = false,
}: {
  initialTarget?: string;
  initialRecordType?: DnsRecordType;
  initialResolver?: DnsResolver;
  initialTransport?: DnsTransport;
  initialTlsTransport?: TlsTransport;
  /** Open on the "IP info" option, which looks an address up and measures nothing. */
  initialIpInfo?: boolean;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const { nodes } = useNodes();
  const { kind, setKind, scope, setScope, selected, setSelected } = useSelection();
  const info = KIND_INFO[kind];
  const online = nodes?.filter((n) => n.online) ?? [];
  // Older nodes only know ping; say so instead of failing after the click.
  const capable = online.filter((n) => n.kinds.includes(kind));

  const [target, setTarget] = useState(initialTarget);
  const [port, setPort] = useState("");
  const [follow, setFollow] = useState(false);
  // Who resolves a hostname: each node for itself (the default), or one node, whose answer every node then probes.
  const [resolution, setResolution] = useState<"each" | "one">("each");
  const [resolverId, setResolverId] = useState<string | null>(null);
  // The node that resolves the name has to be able to ask DNS questions. One that went offline is not kept: the
  // control shows (and the request sends) the first that is left, so what is shown is what is sent.
  const askable = online.filter((n) => n.kinds.includes("dns"));
  const oneNode = kind !== "dns" && resolution === "one";
  const resolverNode = oneNode ? (askable.find((n) => n.id === resolverId) ?? askable[0] ?? null) : null;
  const [family, setFamily] = useState<Request["family"]>("auto");
  const [count, setCount] = useState("4");
  const [rounds, setRounds] = useState("1");
  const [includeCommunity, setIncludeCommunity] = useState(false);
  const [recordType, setRecordType] = useState<DnsRecordType>(initialRecordType);
  const [resolver, setResolver] = useState<DnsResolver>(initialResolver);
  const [transport, setTransport] = useState<DnsTransport>(initialTransport);
  const [tlsTransport, setTlsTransport] = useState<TlsTransport>(initialTlsTransport);
  // DNS over HTTPS can be asked of Cloudflare and Google only; for any other resolver the question goes over UDP
  const viaHttps = transport === "doh" && canUseDoh(resolver);
  const [ipInfo, setIpInfo] = useState(initialIpInfo);
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
        dns_mode: resolverNode ? "fixed" : "regional",
        resolve_node_id: resolverNode?.id ?? null,
        family,
        follow_redirects: kind === "http" && follow,
        node_ids: scope === "selected" ? [...selected] : null,
        include_community: scope === "all" && includeCommunity,
      };
      if (kind === "dns") {
        body.record_type = recordType;
        body.resolver = resolver;
        if (viaHttps) body.transport = "doh";
      }
      if (kind === "tls" && tlsTransport === "quic") body.transport = "quic";
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

  // The row of options is the same for a measurement and for an IP lookup; "IP info" is the one that measures nothing.
  const tabs = (
    <Tabs
      value={ipInfo ? "ip" : kind}
      onValueChange={(next) => {
        if (next === null) return;
        if (next === "ip") setIpInfo(true);
        else {
          setIpInfo(false);
          setKind(next as Kind);
        }
      }}
    >
      <TabsList>
        {KINDS.map((k) => (
          <TabsTrigger key={k} value={k}>
            {t(`kind.${k}`)}
          </TabsTrigger>
        ))}
        <TabsTrigger value="ip">{t("kind.ip")}</TabsTrigger>
      </TabsList>
    </Tabs>
  );
  if (ipInfo) return <IpInfoLookup tabs={tabs} initialAddress={/^[0-9a-fA-F:.]+$/.test(initialTarget) ? initialTarget : ""} />;

  const noNodes = nodes !== null && online.length === 0;
  const noCapable = nodes !== null && online.length > 0 && capable.length === 0;
  const needsSelection = scope === "selected" && selected.size === 0;
  const needsResolver = oneNode && resolverNode === null;
  const KindIcon = KIND_ICON[kind];

  return (
    <Panel label={t("form.command")} meta={<span className="normal-case tracking-normal">{t(`kind.${kind}`)}</span>}>
        <form onSubmit={submit} className="space-y-5">
          {tabs}
          <div className="space-y-1.5">
            <Label htmlFor="target">{kind === "dns" ? t("form.target.dns") : t("form.target")}</Label>
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
                disabled={busy || !target.trim() || noNodes || noCapable || needsSelection || needsResolver}
              >
                {busy ? <Loader2Icon className="animate-spin" /> : <KindIcon />}
                {t(`action.${kind}`)}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {nodes === null
                ? t("form.checking")
                : `${t("form.online", { n: online.length })}${kind !== "ping" && online.length > 0 ? ` ${t("form.canRun", { n: capable.length })}` : ""}`}{" "}
              {t(`explain.${kind}`)}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-12">
            {kind === "dns" ? (
              <>
                <Choice
                  className="lg:col-span-4"
                  label={t("form.recordType")}
                  value={recordType}
                  onChange={setRecordType}
                  options={DNS_RECORD_TYPES.map((rt) => ({ value: rt, label: rt }))}
                />
                <Choice
                  className="lg:col-span-4"
                  label={t("form.resolver")}
                  value={resolver}
                  onChange={setResolver}
                  options={DNS_RESOLVERS.map((r) => (r.value === "system" ? { ...r, label: t("dns.resolver.system") } : r))}
                />
                {canUseDoh(resolver) && (
                  <Choice
                    className="lg:col-span-4"
                    label={t("form.transport")}
                    value={viaHttps ? "doh" : "udp"}
                    onChange={setTransport}
                    options={DNS_TRANSPORTS.map((x) => ({ ...x, label: t(x.value === "doh" ? "dns.transport.doh" : "dns.transport.udp") }))}
                  />
                )}
              </>
            ) : (
              <>
                <Choice
                  className="lg:col-span-4"
                  label={t("form.nameResolution")}
                  value={resolution}
                  onChange={setResolution}
                  options={[
                    { value: "each", label: t("form.each") },
                    { value: "one", label: t("form.one") },
                  ]}
                />
                {resolution === "one" &&
                  (askable.length > 0 ? (
                    <Choice
                      className="lg:col-span-4"
                      label={t("form.resolvingNode")}
                      value={resolverNode?.id ?? ""}
                      onChange={setResolverId}
                      options={askable.map((n) => ({
                        value: n.id,
                        label: `${nodeHeading(n).named ? n.name : `${flag(n.country)} ${nodeHeading(n).title}${nodeHeading(n).sub ? ` · ${nodeHeading(n).sub}` : ""}`}${n.tier === "community" ? ` (${t("form.communityTag")})` : ""}`.trim(),
                      }))}
                    />
                  ) : (
                    <div className="min-w-0 space-y-1.5 lg:col-span-4">
                      <Label>{t("form.resolvingNode")}</Label>
                      <p className="text-xs text-muted-foreground">{t("form.noDnsNode")}</p>
                    </div>
                  ))}
                <Choice
                  className="lg:col-span-4"
                  label={t("form.ipVersion")}
                  value={family}
                  onChange={setFamily}
                  options={[
                    { value: "auto", label: t("form.auto") },
                    { value: "4", label: "IPv4" },
                    { value: "6", label: "IPv6" },
                  ]}
                />
              </>
            )}
            {(kind === "ping" || kind === "tcp") && (
              <Choice
                className="lg:col-span-4"
                label={kind === "ping" ? t("form.count.ping") : t("form.count.tcp")}
                value={count}
                onChange={setCount}
                options={[1, 2, 3, 4, 5, 6, 8, 10].map((n) => ({ value: String(n), label: String(n) }))}
              />
            )}
            {kind === "traceroute" && (
              <Choice
                className="lg:col-span-4"
                label={t("form.rounds")}
                value={rounds}
                onChange={setRounds}
                options={[1, 3, 5, 10].map((n) => ({ value: String(n), label: n === 1 ? t("form.rounds.one") : String(n) }))}
              />
            )}
            {kind === "tls" && (
              <Choice
                className="lg:col-span-4"
                label={t("form.transport")}
                value={tlsTransport}
                onChange={setTlsTransport}
                options={TLS_TRANSPORTS.map((x) => ({ ...x, label: t(x.value === "quic" ? "tls.quic" : "tls.tcp") }))}
              />
            )}
            {(kind === "tcp" || kind === "http" || kind === "tls") && (
              <div className="min-w-0 space-y-1.5 lg:col-span-4">
                <Label htmlFor="port">{kind === "tcp" ? t("form.port") : t("form.portOptional")}</Label>
                <Input
                  id="port"
                  type="number"
                  min={1}
                  max={65535}
                  inputMode="numeric"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  placeholder={kind === "tcp" || kind === "tls" ? t("form.port.hint") : t("form.port.fromUrl")}
                  className="h-9"
                />
              </div>
            )}
            {kind === "http" && (
              <Label className="flex cursor-pointer items-center gap-2 self-end pb-2 text-sm lg:col-span-4">
                <Checkbox checked={follow} onCheckedChange={(checked) => setFollow(checked === true)} />
                {t("form.follow")}
              </Label>
            )}
            {scope === "all" && online.some((n) => n.tier === "community") && (
              <Label className="flex cursor-pointer items-start gap-2 text-sm sm:col-span-2 lg:col-span-12">
                <Checkbox checked={includeCommunity} onCheckedChange={(checked) => setIncludeCommunity(checked === true)} className="mt-0.5" />
                <span>
                  {t("form.community", { n: online.filter((n) => n.tier === "community").length })}
                  <span className="block text-xs text-muted-foreground">{t("form.community.help")}</span>
                </span>
              </Label>
            )}
            <div className="min-w-0 space-y-1.5 sm:col-span-2 lg:col-span-6">
              <Label>{t("form.nodes")}</Label>
              <div className="flex gap-2">
                <Select
                  value={scope}
                  items={[
                    { value: "all", label: t("form.nodes.all") },
                    { value: "selected", label: t("form.nodes.selected", { n: selected.size }) },
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
                    <SelectItem value="all">{t("form.nodes.all")}</SelectItem>
                    <SelectItem value="selected">{t("form.nodes.selected", { n: selected.size })}</SelectItem>
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
                    {t("form.choose")}
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{t("form.chooseTitle")}</DialogTitle>
                      <DialogDescription>{t("form.chooseHelp")}</DialogDescription>
                    </DialogHeader>
                    <div className="max-h-72 space-y-2 overflow-y-auto">
                      {online.map((node) => (
                        <Label key={node.id} className="flex cursor-pointer items-center gap-3 text-sm">
                          <Checkbox
                            checked={selected.has(node.id)}
                            onCheckedChange={(checked) => {
                              const next = new Set(selected);
                              if (checked) next.add(node.id);
                              else next.delete(node.id);
                              setSelected(next);
                            }}
                          />
                          <span className="font-medium">
                            {nodeHeading(node).named ? node.name : `${flag(node.country)} ${nodeHeading(node).title}`.trim()}
                            <CommunityBadge tier={node.tier} />
                          </span>
                          <span className="text-muted-foreground">{nodeHeading(node).sub}</span>
                        </Label>
                      ))}
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="ghost" onClick={() => setSelected(new Set(online.map((n) => n.id)))}>
                        {t("form.selectAll")}
                      </Button>
                      <Button type="button" variant="ghost" onClick={() => setSelected(new Set())}>
                        {t("form.clear")}
                      </Button>
                      <Button type="button" onClick={() => setPicking(false)}>
                        {t("form.done")}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </div>

          {kind !== "dns" && (
            <p className="text-xs text-muted-foreground">
              {resolverNode ? t("form.noteOne", { node: resolverNode.name }) : t("form.noteEach")}
            </p>
          )}

          {noCapable && (
            <Alert>
              <AlertTitle>{t("form.noCapableTitle", { kind: t(`kind.${kind}`) })}</AlertTitle>
              <AlertDescription>{t("form.noCapableText", { kind: t(`kind.${kind}`) })}</AlertDescription>
            </Alert>
          )}
          {noNodes && (
            <Alert>
              <AlertTitle>{t("form.noNodesTitle")}</AlertTitle>
              <AlertDescription>{t("form.noNodesText")}</AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertTitle>{t("form.startFailed")}</AlertTitle>
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          )}
        </form>
    </Panel>
  );
}
