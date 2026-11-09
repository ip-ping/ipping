import type { Measurement, Schemas } from "@/lib/api/client";

export type Kind = Schemas["CreateMeasurementRequest"]["kind"];

export const KINDS: Kind[] = ["ping", "tcp", "http", "traceroute", "dns", "tls"];

export type DnsRecordType = NonNullable<Schemas["CreateMeasurementRequest"]["record_type"]>;
export type DnsResolver = NonNullable<Schemas["CreateMeasurementRequest"]["resolver"]>;
export type DnsTransport = NonNullable<Schemas["CreateMeasurementRequest"]["transport"]>;

export const DNS_RECORD_TYPES: DnsRecordType[] = ["A", "AAAA", "CNAME", "MX", "NS", "TXT", "SOA"];

/** The resolvers a DNS check can ask. `system` is each node's own: what people near that node get. */
export const DNS_RESOLVERS: { value: DnsResolver; label: string }[] = [
  { value: "system", label: "Each node's own resolver" },
  { value: "cloudflare", label: "Cloudflare (1.1.1.1)" },
  { value: "google", label: "Google (8.8.8.8)" },
  { value: "quad9", label: "Quad9 (9.9.9.9)" },
];

export const DNS_TRANSPORTS: { value: DnsTransport; label: string }[] = [
  { value: "udp", label: "Plain DNS (UDP)" },
  { value: "doh", label: "DNS over HTTPS" },
];

/** The resolvers that can be asked over HTTPS: Quad9 answers only over HTTP/2, which the nodes do not speak, and a node's own resolvers are not public. */
export const DOH_RESOLVERS: readonly DnsResolver[] = ["cloudflare", "google"];
export const canUseDoh = (resolver: DnsResolver) => DOH_RESOLVERS.includes(resolver);

export type KindInfo = {
  label: string;
  /** The button on the form. */
  action: string;
  /** What one result row counts. */
  unit: { one: string; many: string };
  placeholder: string;
  /** One line under the form saying what this kind actually tests. */
  explain: string;
};

export const KIND_INFO: Record<Kind, KindInfo> = {
  ping: {
    label: "Ping",
    action: "Ping",
    unit: { one: "echo request", many: "echo requests" },
    placeholder: "1.1.1.1, example.com or https://example.com/",
    explain: "ICMP echo: does the machine answer, and how fast. For a URL only the host is used.",
  },
  tcp: {
    label: "TCP",
    action: "Connect",
    unit: { one: "connection", many: "connections" },
    placeholder: "example.com:443",
    explain:
      "How long a TCP connection takes to open. Give a port as host:port. A refusal means the machine answered but nothing listens there.",
  },
  http: {
    label: "HTTP",
    action: "Request",
    unit: { one: "request", many: "requests" },
    placeholder: "https://example.com/",
    explain:
      "One GET request: status, time spent in each phase and the TLS certificate. Only the path is kept, never a query string.",
  },
  traceroute: {
    label: "Traceroute",
    action: "Trace",
    unit: { one: "hop", many: "hops" },
    placeholder: "1.1.1.1 or example.com",
    explain:
      "The routers between each node and the target. A silent hop is normal; what matters is whether the target is reached. More rounds trace it again and again, like mtr, to show how much each hop loses.",
  },
  tls: {
    label: "Certificate",
    action: "Check",
    unit: { one: "handshake", many: "handshakes" },
    placeholder: "example.com or example.com:8443",
    explain:
      "A TLS handshake with no request after it: who the certificate is for, who issued it, when it expires, and whether this node trusts it. Works for any TLS service on an allowed port. The port defaults to 443.",
  },
  dns: {
    label: "DNS",
    action: "Look up",
    unit: { one: "question", many: "questions" },
    placeholder: "example.com",
    explain:
      "Ask each node's resolver, or a public one, about a name and compare the answers. A record that was just changed shows as two answers until the old one expires.",
  },
};

export function kindOf(measurement: Pick<Measurement, "kind">): Kind {
  return (KINDS as string[]).includes(measurement.kind) ? (measurement.kind as Kind) : "ping";
}
