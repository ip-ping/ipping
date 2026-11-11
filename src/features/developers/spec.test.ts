import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

// a plain script, shared with `npm run api:types`
import { OPERATIONS, buildSpec, render, simplify } from "../../../scripts/build-api-guide-spec.mjs";
import { KIND_FIELDS, GROUPS, GUIDE, PRESETS, STEPS, followsKind, orderedFields, splitFields } from "./guide";
import { fieldsOf, keyOf, operation, operations } from "./spec";

const contract = JSON.parse(readFileSync(new URL("../../../contracts/openapi.json", import.meta.url), "utf8"));
const committed = readFileSync(new URL("./spec.json", import.meta.url), "utf8");

describe("the API page's spec", () => {
  it("is what the script makes from the backend's contract (run `npm run api:types` when it differs)", () => {
    expect(committed).toBe(render(buildSpec(contract)));
  });

  it("covers the endpoints for scripts and none of administration", () => {
    expect(operations).toHaveLength(OPERATIONS.length);
    for (const op of operations) {
      expect(op.path.startsWith("/api/v1/")).toBe(true);
      expect(op.path).not.toMatch(/\/admin|\/setup|\/session|\/enroll/);
    }
  });

  it("has the schema of the measurement a form is drawn from, with the backend's own help text", () => {
    const fields = fieldsOf(operation("POST /api/v1/measurements"));
    const names = fields.map((f) => f.name);
    expect(names).toEqual(expect.arrayContaining(["target", "kind", "count", "port", "record_type", "node_ids", "dns_mode"]));
    expect(fields.find((f) => f.name === "target")).toMatchObject({ in: "body", required: true });
    expect(fields.find((f) => f.name === "count")?.schema).toMatchObject({ type: "integer", minimum: 1, maximum: 10, nullable: true });
    expect(fields.find((f) => f.name === "kind")?.schema.enum).toEqual(["ping", "tcp", "http", "traceroute", "dns", "tls"]);
    expect(fields.every((f) => f.description.length > 0 || ["family"].includes(f.name))).toBe(true);
  });

  it("reads a path parameter and the query of an endpoint", () => {
    expect(fieldsOf(operation("GET /api/v1/ip/{address}")).map((f) => [f.name, f.in, f.required])).toEqual([["address", "path", true]]);
    const text = fieldsOf(operation("GET /api/v1/text"));
    expect(text.find((f) => f.name === "target")).toMatchObject({ in: "query", required: true });
    expect(text.find((f) => f.name === "wait")?.schema).toMatchObject({ minimum: 1, maximum: 30, default: 20 });
  });

  it("follows references, keeps the null out of `anyOf` and cuts a schema that holds itself", () => {
    const components = { Loop: { type: "object", properties: { again: { $ref: "#/components/schemas/Loop" } } } };
    expect(simplify({ anyOf: [{ type: "integer", minimum: 1 }, { type: "null" }], title: "X", description: "d" }, {})).toEqual({ type: "integer", minimum: 1, description: "d", nullable: true });
    expect(simplify({ $ref: "#/components/schemas/Loop" }, components)).toEqual({ type: "object", properties: { again: { type: "object" } } });
  });
});

describe("the guide's own words", () => {
  const keys = operations.map(keyOf);

  it("explains every operation of the spec, and only those", () => {
    expect(Object.keys(GUIDE).sort()).toEqual([...keys].sort());
  });

  it("shows each operation once in the reference, and every step names one that exists", () => {
    const listed = GROUPS.flatMap((g) => [...g.ops]);
    expect([...listed].sort()).toEqual([...keys].sort());
    for (const step of STEPS) expect(keys).toContain(step.op);
  });

  it("says in the right words who may call what", () => {
    expect(GUIDE["GET /api/v1/text"].auth).toBe("key"); // the backend never lets a session start a measurement this way
    expect(GUIDE["POST /api/v1/measurements/{measurement_id}/share"].auth).toBe("session");
    expect(GUIDE["GET /api/v1/health/live"].auth).toBe("none");
    expect(GUIDE["GET /api/v1/nodes"].auth).toBe("none");
    expect(GUIDE["POST /api/v1/measurements"].starts).toBe(true);
  });

  it("offers a preset for every kind of check, and only the fields that kind takes", () => {
    const kinds = fieldsOf(operation("POST /api/v1/measurements")).find((f) => f.name === "kind")?.schema.enum ?? [];
    expect(PRESETS.map((p) => p.id).sort()).toEqual([...kinds].sort());
    expect(Object.keys(KIND_FIELDS).sort()).toEqual([...kinds].sort());
    const names = new Set(fieldsOf(operation("POST /api/v1/measurements")).map((f) => f.name));
    for (const list of Object.values(KIND_FIELDS)) for (const name of list) expect(names.has(name)).toBe(true);
    for (const preset of PRESETS) expect(preset.values.kind).toBe(preset.id);
  });

  it("shows a kind's own fields first and keeps the rest under more options", () => {
    const fields = fieldsOf(operation("POST /api/v1/measurements"));
    const tcp = splitFields("POST /api/v1/measurements", fields, { kind: "tcp" });
    expect(tcp.primary.map((f) => f.name)).toEqual(["target", "kind", "port", "count", "family"]);
    expect(tcp.more.map((f) => f.name)).toEqual(expect.arrayContaining(["node_ids", "countries", "dns_mode", "include_community"]));
    expect(tcp.primary.length + tcp.more.length).toBe(fields.length);
    const dns = splitFields("POST /api/v1/measurements", fields, { kind: "dns" });
    expect(dns.primary.map((f) => f.name)).toEqual(["target", "kind", "record_type", "resolver", "transport"]);
    // the text endpoint also takes how long to wait
    const text = splitFields("GET /api/v1/text", fieldsOf(operation("GET /api/v1/text")), { kind: "ping" });
    expect(text.primary.map((f) => f.name)).toEqual(["target", "kind", "count", "family", "wait"]);
    // a request lists them the same way: target and kind first, whatever order the contract keeps them in
    expect(orderedFields("POST /api/v1/measurements", fields, { kind: "tcp" }).map((f) => f.name).slice(0, 5)).toEqual(["target", "kind", "port", "count", "family"]);
    // other operations show everything
    const ip = fieldsOf(operation("GET /api/v1/ip/{address}"));
    expect(splitFields("GET /api/v1/ip/{address}", ip, {})).toEqual({ primary: ip, more: [] });
    expect(followsKind("GET /api/v1/ip/{address}")).toBe(false);
  });
});
