import type { Auth, Mode, Values } from "./request";
import type { Field } from "./spec";

/** What the page says about an operation, in plain words. The shapes (fields, ranges, choices) come from the contract; the explanations are here. */
export type OpGuide = {
  title: string;
  blurb: string;
  auth: Auth;
  mode: Mode;
  /** It starts a real measurement on real nodes. */
  starts?: boolean;
  /** What the answer holds that a later step uses. */
  captures?: { from: "id" | "x-measurement-id" };
  /** What the form starts with. */
  example?: Values;
};

export const AUTH_LABEL: Record<Auth, string> = {
  none: "No key needed",
  either: "Browser session or API key",
  key: "API key required",
  session: "Browser session only",
};

const MEASURE: Values = { target: "example.com", kind: "ping", count: "3" };

export const GUIDE: Record<string, OpGuide> = {
  "GET /api/v1/health/live": {
    title: "Is the service up?",
    blurb: "Answers as long as the server runs. Point an uptime monitor at it.",
    auth: "none",
    mode: "json",
  },
  "GET /api/v1/health/ready": {
    title: "Is it ready for work?",
    blurb: "Also checks that the database answers. Use it as a readiness probe behind a load balancer.",
    auth: "none",
    mode: "json",
  },
  "GET /api/v1/nodes": {
    title: "List the nodes",
    blurb:
      "The approved nodes: where each is, whether it is online, and which kinds of check it can run. Nothing that identifies the machine behind a node is shown. Put some of these `id` values in `node_ids` to choose where a measurement runs.",
    auth: "none",
    mode: "json",
  },
  "POST /api/v1/measurements": {
    title: "Start a measurement",
    blurb:
      "Asks the nodes to check a target and answers at once with the measurement's `id`. Results arrive as the nodes finish: read them with “Get a measurement”, or follow them live. This runs on real nodes and counts against your limits.",
    auth: "either",
    mode: "json",
    starts: true,
    captures: { from: "id" },
    example: MEASURE,
  },
  "GET /api/v1/text": {
    title: "Measure and read a plain-text report",
    blurb:
      "Starts a measurement, waits for it (up to `wait` seconds) and answers with a report like the one `ping` or `traceroute` prints. It is made for `curl` and for the `ipping-cli` command. If the measurement is still running when the wait ends, the text says so. `X-Measurement-Id` and `X-Measurement-Status` come back as headers.",
    auth: "key",
    mode: "text",
    starts: true,
    captures: { from: "x-measurement-id" },
    example: MEASURE,
  },
  "GET /api/v1/measurements": {
    title: "List your measurements",
    blurb: "The latest measurements of this browser session, or of this API key, newest first. A key sees only the measurements it started.",
    auth: "either",
    mode: "json",
  },
  "GET /api/v1/measurements/{measurement_id}": {
    title: "Get a measurement",
    blurb:
      "The state and the results so far. `status` is running, completed, cancelled or interrupted; each task is one node's check, with its samples and a summary. While it is running, ask again every second or two, or follow it live.",
    auth: "either",
    mode: "json",
  },
  "GET /api/v1/measurements/{measurement_id}/events": {
    title: "Follow a measurement live",
    blurb:
      "Server-Sent Events: a message for each update (`task.updated`, `measurement.finished`, ...). Reconnecting with `Last-Event-ID`, or `after`, replays what was missed, so a dropped connection loses nothing. A browser's `EventSource` cannot send an API key, so a script uses `fetch` as in the snippet.",
    auth: "either",
    mode: "stream",
  },
  "POST /api/v1/measurements/{measurement_id}/cancel": {
    title: "Cancel a measurement",
    blurb: "Stops a running measurement. Only the session or the key that started it can.",
    auth: "either",
    mode: "json",
  },
  "POST /api/v1/measurements/{measurement_id}/share": {
    title: "Share a measurement",
    blurb:
      "Turns the share link on or off: anyone with the link can see a shared measurement. It needs the browser session that owns the measurement, so an API key cannot do it.",
    auth: "session",
    mode: "json",
    example: { shared: true },
  },
  "GET /api/v1/measurements/{measurement_id}/location": {
    title: "Estimate where the target is",
    blurb:
      "A best guess of where the target address is, worked out from the nodes' round-trip times, with an accuracy percentage and the evidence. With IP data it also says whether the databases' place agrees with the measurements.",
    auth: "either",
    mode: "json",
  },
  "GET /api/v1/measurements/{measurement_id}/path": {
    title: "Name the networks on a traced path",
    blurb: "For a traceroute: the network (AS) and place of each router, from the IP data. A router's place is a hint to check against its round-trip time.",
    auth: "either",
    mode: "json",
  },
  "GET /api/v1/measurements/{measurement_id}/addresses": {
    title: "See the addresses that were tested",
    blurb:
      "Each address the nodes actually tested (one name can resolve differently on each node), with what the IP data says about it. It belongs to the measurement, so whoever can read the measurement can read it.",
    auth: "either",
    mode: "json",
  },
  "GET /api/v1/ip": {
    title: "Look up your own address",
    blurb:
      "What the IP data says about the address this request comes from: its network, place, time zone and AS number, each with how sure the vote is. Who may use lookups is a setting of the site: by default an API key or an administrator.",
    auth: "either",
    mode: "json",
  },
  "GET /api/v1/ip/{address}": {
    title: "Look up an address",
    blurb:
      "The same for any IPv4 or IPv6 address, voted from every IP data source the site has, with what each source said. A private or reserved address comes back with `public: false` and nothing looked up. Who may use lookups is a setting of the site.",
    auth: "either",
    mode: "json",
    example: { address: "8.8.8.8" },
  },
};

export const GROUPS = [
  {
    id: "service",
    title: "The service",
    intro: "Open to everyone: no key, no session.",
    ops: ["GET /api/v1/health/live", "GET /api/v1/health/ready", "GET /api/v1/nodes"],
  },
  {
    id: "measure",
    title: "Measure",
    intro: "Start a check from many places and read what comes back.",
    ops: [
      "POST /api/v1/measurements",
      "GET /api/v1/text",
      "GET /api/v1/measurements",
      "GET /api/v1/measurements/{measurement_id}",
      "GET /api/v1/measurements/{measurement_id}/events",
      "POST /api/v1/measurements/{measurement_id}/cancel",
      "POST /api/v1/measurements/{measurement_id}/share",
    ],
  },
  {
    id: "results",
    title: "Results in depth",
    intro: "More about a measurement that has run.",
    ops: [
      "GET /api/v1/measurements/{measurement_id}/location",
      "GET /api/v1/measurements/{measurement_id}/path",
      "GET /api/v1/measurements/{measurement_id}/addresses",
    ],
  },
  {
    id: "ip",
    title: "IP info",
    intro: "Where an address is and whose network it is, voted from the site's IP data sources.",
    ops: ["GET /api/v1/ip", "GET /api/v1/ip/{address}"],
  },
] as const;

export const STEPS = [
  {
    op: "GET /api/v1/health/live",
    title: "Check that the service answers",
    text: "Press Send. A `200` with `\"status\": \"ok\"` and the backend's version means the site's API is reachable from here.",
  },
  {
    op: "POST /api/v1/measurements",
    title: "Start a measurement",
    text: "Choose a kind of check, give a target and press Send. The answer holds the measurement's `id`; the next step uses it.",
  },
  {
    op: "GET /api/v1/measurements/{measurement_id}",
    title: "Read the result",
    text: "The `id` from the last step is filled in. Send it again until `status` says `completed`: each node's check is a task with its own samples and summary.",
  },
  {
    op: "GET /api/v1/text",
    title: "Do it from a terminal",
    text: "The plain-text endpoint is for `curl` and scripts, and needs an API key (an administrator makes them). Paste a key above, press Send, then copy the `curl` line to your terminal.",
  },
  {
    op: "GET /api/v1/ip/{address}",
    title: "Look up an address",
    text: "Where an address is and whose network it is, each field with how sure the vote is.",
  },
] as const;

/** The kinds of check, with what each takes: the form shows only these next to `target` and `kind`, and the rest under “More options”. */
export const KIND_FIELDS: Record<string, string[]> = {
  ping: ["count", "family"],
  tcp: ["port", "count", "family"],
  http: ["follow_redirects", "family"],
  traceroute: ["count", "family"],
  dns: ["record_type", "resolver", "transport"],
  tls: ["port", "family"],
};

/** Operations whose form follows the kind of check. */
const BY_KIND = new Set(["POST /api/v1/measurements", "GET /api/v1/text"]);

export const PRESETS: { id: string; label: string; values: Values }[] = [
  { id: "ping", label: "Ping", values: { kind: "ping", target: "example.com", count: "3" } },
  { id: "tcp", label: "TCP connect", values: { kind: "tcp", target: "example.com", port: "443", count: "3" } },
  { id: "http", label: "HTTP request", values: { kind: "http", target: "https://example.com" } },
  { id: "traceroute", label: "Traceroute", values: { kind: "traceroute", target: "example.com", count: "3" } },
  { id: "dns", label: "DNS lookup", values: { kind: "dns", target: "example.com", record_type: "MX" } },
  { id: "tls", label: "TLS certificate", values: { kind: "tls", target: "example.com", port: "443" } },
];

export const followsKind = (key: string): boolean => BY_KIND.has(key);

/** The fields to show first, and the ones kept under “More options”. */
export function splitFields(key: string, fields: Field[], values: Values): { primary: Field[]; more: Field[] } {
  if (!BY_KIND.has(key)) return { primary: fields, more: [] };
  const wanted = ["target", "kind", ...(KIND_FIELDS[String(values.kind ?? "ping")] ?? []), ...(key === "GET /api/v1/text" ? ["wait"] : [])];
  const byName = new Map(fields.map((f) => [f.name, f]));
  const primary = wanted.map((name) => byName.get(name)).filter((f): f is Field => f !== undefined);
  return { primary, more: fields.filter((f) => !wanted.includes(f.name)) };
}

/** The fields in the order a request lists them: `target` and `kind`, then what the kind takes, then the rest (the contract's own order is alphabetical). */
export function orderedFields(key: string, fields: Field[], values: Values): Field[] {
  const { primary, more } = splitFields(key, fields, values);
  return [...primary, ...more];
}
