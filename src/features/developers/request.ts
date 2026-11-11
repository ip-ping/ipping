import { ensureSession } from "@/lib/api/client";

import { fieldsOf, type Field, type Operation, type Schema } from "./spec";

/** What a form holds: text for most fields, a boolean for a switch, nothing for a field that was left alone (and so is not sent). */
export type Values = Record<string, string | boolean | undefined>;

export type Parsed = { skip: true } | { value: unknown; warning?: string } | { error: string };

const WHOLE = /^-?\d+$/;

function outOfRange(schema: Schema, n: number): string | undefined {
  if (schema.minimum !== undefined && n < schema.minimum) return `The least is ${schema.minimum}.`;
  if (schema.maximum !== undefined && n > schema.maximum) return `The most is ${schema.maximum}.`;
  return undefined;
}

/** One field's value as the API wants it. A value that cannot be read is an error; one that is out of range is sent anyway, with a warning, so that the API's own answer can be seen. */
export function parseValue(schema: Schema, raw: string | boolean | undefined): Parsed {
  if (raw === undefined || raw === "") return { skip: true };
  if (schema.type === "boolean") return typeof raw === "boolean" ? { value: raw } : { value: raw === "true" };
  if (typeof raw === "boolean") return { value: raw };
  const text = raw.trim();
  if (text === "") return { skip: true };
  switch (schema.type) {
    case "integer": {
      if (!WHOLE.test(text)) return { error: "A whole number." };
      const n = Number(text);
      return { value: n, warning: outOfRange(schema, n) };
    }
    case "number": {
      const n = Number(text);
      return Number.isFinite(n) ? { value: n, warning: outOfRange(schema, n) } : { error: "A number." };
    }
    case "array": {
      const items = text.split(/[\s,]+/).filter(Boolean);
      if (schema.items?.type === "integer") {
        if (!items.every((i) => WHOLE.test(i))) return { error: "Whole numbers, separated by commas." };
        return { value: items.map(Number) };
      }
      return { value: items };
    }
    case "object": {
      try {
        return { value: JSON.parse(text) };
      } catch {
        return { error: "JSON that can be read." };
      }
    }
    default:
      return { value: text };
  }
}

export type Built = {
  method: "GET" | "POST";
  /** The path with its parameters filled in (a missing one stays as `{name}`), without the query. */
  path: string;
  query: [string, string][];
  body: Record<string, unknown> | null;
  /** The path and query: what follows the address of the site. */
  url: string;
  /** Required values that are not there. */
  missing: string[];
  /** Values that cannot be read, by field name. */
  errors: Record<string, string>;
  /** Values that were sent although they are out of range, by field name. */
  warnings: Record<string, string>;
};

/** The request that an operation and the values of its form make. */
export function buildRequest(op: Operation, values: Values, fields: Field[] = fieldsOf(op)): Built {
  const built: Built = { method: op.method, path: op.path, query: [], body: op.body ? {} : null, url: "", missing: [], errors: {}, warnings: {} };
  for (const field of fields) {
    const parsed = parseValue(field.schema, values[field.name]);
    if ("error" in parsed) {
      built.errors[field.name] = parsed.error;
      continue;
    }
    if ("skip" in parsed) {
      if (field.required) built.missing.push(field.name);
      continue;
    }
    if (parsed.warning) built.warnings[field.name] = parsed.warning;
    if (field.in === "path") built.path = built.path.replace(`{${field.name}}`, encodeURIComponent(String(parsed.value)));
    else if (field.in === "query") built.query.push([field.name, Array.isArray(parsed.value) ? parsed.value.join(",") : String(parsed.value)]);
    else if (built.body) built.body[field.name] = parsed.value;
  }
  const query = new URLSearchParams(built.query).toString();
  built.url = query ? `${built.path}?${query}` : built.path;
  return built;
}

export const ready = (built: Built): boolean => built.missing.length === 0 && Object.keys(built.errors).length === 0;

// ---- Snippets ------------------------------------------------------------------------------------------------------------

/** none: open to everyone. either: a browser session or an API key. key: an API key only. session: a browser session only (a key cannot do it). */
export type Auth = "none" | "either" | "key" | "session";
export type Mode = "json" | "text" | "stream";
export type Snippets = { curl: string; python: string; javascript: string };

const shell = (text: string): string => `'${text.replaceAll("'", `'\\''`)}'`;

/** A JSON value as a Python literal (`true` is `True`, `null` is `None`). */
export function pyLiteral(value: unknown, indent = 0): string {
  const pad = "    ".repeat(indent + 1);
  const end = "    ".repeat(indent);
  if (value === null || value === undefined) return "None";
  if (typeof value === "boolean") return value ? "True" : "False";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return value.length === 0 ? "[]" : `[\n${value.map((v) => `${pad}${pyLiteral(v, indent + 1)},`).join("\n")}\n${end}]`;
  const entries = Object.entries(value as Record<string, unknown>);
  return entries.length === 0 ? "{}" : `{\n${entries.map(([k, v]) => `${pad}${JSON.stringify(k)}: ${pyLiteral(v, indent + 1)},`).join("\n")}\n${end}}`;
}

/**
 * The same request for a terminal, Python and JavaScript. The key is never in them: they read `IPPING_KEY`, so a snippet can be shown,
 * copied or pasted into a chat without giving the key away.
 */
export function snippets(built: Built, baseUrl: string, auth: Auth, mode: Mode): Snippets {
  const url = `${baseUrl}${built.url}`;
  const withKey = auth === "either" || auth === "key";
  const body = built.body && Object.keys(built.body).length > 0 ? built.body : null;

  const curl = [
    `curl -s${mode === "stream" ? "N" : ""}${built.method === "POST" ? " -X POST" : ""}`,
    ...(withKey ? [`-H "Authorization: Bearer $IPPING_KEY"`] : []),
    ...(body ? [`-H "Content-Type: application/json"`, `-d ${shell(JSON.stringify(body))}`] : []),
    shell(url),
  ].join(" \\\n  ");

  const params = built.query.length > 0 ? `    params=${pyLiteral(Object.fromEntries(built.query), 1)},` : "";
  const pyUrl = `${baseUrl}${built.path}`;
  const python = [
    "import os",
    "import requests",
    "",
    `response = requests.${built.method.toLowerCase()}(`,
    `    ${JSON.stringify(pyUrl)},`,
    ...(withKey ? [`    headers={"Authorization": f"Bearer {os.environ['IPPING_KEY']}"},`] : []),
    ...(body ? [`    json=${pyLiteral(body, 1)},`] : []),
    ...(params ? [params] : []),
    ...(mode === "stream" ? ["    stream=True,"] : []),
    ")",
    ...(mode === "stream"
      ? ["for line in response.iter_lines(decode_unicode=True):", "    if line:", "        print(line)"]
      : ["print(response.status_code)", mode === "json" ? "print(response.json())" : "print(response.text)"]),
  ].join("\n");

  const options = [
    ...(built.method === "POST" ? [`  method: "POST",`] : []),
    ...(withKey || body
      ? [`  headers: {`, ...(withKey ? ["    Authorization: `Bearer ${process.env.IPPING_KEY}`,"] : []), ...(body ? [`    "Content-Type": "application/json",`] : []), `  },`]
      : []),
    ...(body ? [`  body: JSON.stringify(${JSON.stringify(body, null, 2).replaceAll("\n", "\n  ")}),`] : []),
  ];
  const call = options.length > 0 ? `await fetch(${JSON.stringify(url)}, {\n${options.join("\n")}\n})` : `await fetch(${JSON.stringify(url)})`;
  const javascript =
    mode === "stream"
      ? [`const response = ${call};`, "const decoder = new TextDecoder();", "for await (const chunk of response.body) process.stdout.write(decoder.decode(chunk, { stream: true }));"].join("\n")
      : [`const response = ${call};`, "console.log(response.status);", mode === "json" ? "console.log(await response.json());" : "console.log(await response.text());"].join("\n");

  return { curl, python, javascript };
}

// ---- Sending -------------------------------------------------------------------------------------------------------------

export type Result = {
  status: number;
  statusText: string;
  ok: boolean;
  ms: number;
  contentType: string;
  headers: [string, string][];
  text: string;
  json: unknown;
};

async function init(built: Built, key: string, signal?: AbortSignal): Promise<RequestInit> {
  const headers: Record<string, string> = {};
  if (key) headers.Authorization = `Bearer ${key}`;
  else {
    // Without a key this is the site's own way in: the browser's session, and its CSRF token for anything that changes something.
    const session = await ensureSession();
    if (built.method !== "GET") headers["X-CSRF-Token"] = session.csrf_token;
  }
  if (built.body) headers["Content-Type"] = "application/json";
  return {
    method: built.method,
    headers,
    body: built.body ? JSON.stringify(built.body) : undefined,
    // A script has no cookies, so a request with a key sends none: what works here works from a script.
    credentials: key ? "omit" : "same-origin",
    signal,
  };
}

export async function send(built: Built, key: string, signal?: AbortSignal): Promise<Result> {
  const started = performance.now();
  const response = await fetch(built.url, await init(built, key, signal));
  const text = await response.text();
  const ms = Math.round(performance.now() - started);
  const contentType = response.headers.get("content-type") ?? "";
  let json: unknown;
  if (contentType.includes("json")) {
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
  }
  return { status: response.status, statusText: response.statusText, ok: response.ok, ms, contentType, headers: [...response.headers.entries()], text, json };
}

/** Read a stream (Server-Sent Events) as it arrives, until it ends or `signal` stops it. */
export async function stream(built: Built, key: string, onText: (chunk: string) => void, signal?: AbortSignal): Promise<{ status: number }> {
  const response = await fetch(built.url, await init(built, key, signal));
  if (!response.ok || !response.body) {
    onText(await response.text());
    return { status: response.status };
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    onText(decoder.decode(value, { stream: true }));
  }
  return { status: response.status };
}

/** A response body to read: JSON laid out, anything else as it came, and never more than `limit` characters. */
export function pretty(result: Result, limit = 20000): { text: string; cut: boolean } {
  const text = result.json !== undefined ? JSON.stringify(result.json, null, 2) : result.text;
  return text.length > limit ? { text: text.slice(0, limit), cut: true } : { text, cut: false };
}
