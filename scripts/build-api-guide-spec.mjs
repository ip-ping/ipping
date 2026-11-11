// Trims the backend's OpenAPI contract to what the API page (/developers) shows: the endpoints a script uses, with every $ref
// resolved so that the page can draw a form from a schema without carrying the whole contract (administration is left out).
//
//   node scripts/build-api-guide-spec.mjs            writes src/features/developers/spec.json
//
// `npm run api:types` and `scripts/sync-contracts.sh` run it, and a unit test fails when the committed file is not what this makes.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** The operations the page covers, in the order of the page. Everything else (administration, sessions, node enrolment) is not for scripts. */
export const OPERATIONS = [
  ["GET", "/api/v1/health/live"],
  ["GET", "/api/v1/health/ready"],
  ["GET", "/api/v1/nodes"],
  ["POST", "/api/v1/measurements"],
  ["GET", "/api/v1/text"],
  ["GET", "/api/v1/measurements"],
  ["GET", "/api/v1/measurements/{measurement_id}"],
  ["GET", "/api/v1/measurements/{measurement_id}/events"],
  ["POST", "/api/v1/measurements/{measurement_id}/cancel"],
  ["POST", "/api/v1/measurements/{measurement_id}/share"],
  ["GET", "/api/v1/measurements/{measurement_id}/location"],
  ["GET", "/api/v1/measurements/{measurement_id}/path"],
  ["GET", "/api/v1/measurements/{measurement_id}/addresses"],
  ["GET", "/api/v1/ip"],
  ["GET", "/api/v1/ip/{address}"],
];

// What a schema keeps: the things a form and its help text need.
const KEEP = ["type", "enum", "default", "description", "minimum", "maximum", "minLength", "maxLength", "maxItems", "format"];

/** A schema with its references followed, `anyOf [X, null]` made `nullable`, and the titles dropped. */
export function simplify(schema, components, seen = []) {
  if (schema === null || typeof schema !== "object") return schema;
  if (schema.$ref) {
    const name = schema.$ref.replace("#/components/schemas/", "");
    if (seen.includes(name)) return { type: "object" }; // a schema that holds itself: not drawn any deeper
    return simplify(components[name], components, [...seen, name]);
  }
  if (schema.anyOf) {
    const branches = schema.anyOf.filter((b) => b.type !== "null");
    if (branches.length === 1) {
      const outer = { ...schema };
      delete outer.anyOf; // the schema's own description and default stay with the branch that is left
      return { ...simplify({ ...branches[0], ...outer }, components, seen), nullable: true };
    }
  }
  const out = {};
  for (const key of KEEP) if (schema[key] !== undefined) out[key] = schema[key];
  if (schema.properties) {
    out.properties = Object.fromEntries(Object.entries(schema.properties).map(([k, v]) => [k, simplify(v, components, seen)]));
    if (schema.required) out.required = schema.required;
  }
  if (schema.items) out.items = simplify(schema.items, components, seen);
  return out;
}

export function buildSpec(openapi) {
  const components = openapi.components?.schemas ?? {};
  const operations = OPERATIONS.map(([method, path]) => {
    const op = openapi.paths?.[path]?.[method.toLowerCase()];
    if (!op) throw new Error(`the contract has no ${method} ${path}`);
    const body = op.requestBody?.content?.["application/json"]?.schema;
    return {
      method,
      path,
      summary: op.summary ?? "",
      description: op.description ?? "",
      parameters: (op.parameters ?? [])
        .filter((p) => p.in === "path" || p.in === "query") // a header such as Last-Event-ID is the browser's own
        .map((p) => ({ name: p.name, in: p.in, required: Boolean(p.required), description: p.description ?? "", schema: simplify(p.schema, components) })),
      body: body ? { required: Boolean(op.requestBody.required), schema: simplify(body, components) } : null,
      responses: Object.entries(op.responses ?? {})
        .filter(([status]) => status !== "422")
        .map(([status, r]) => ({ status, description: r.description ?? "", contentType: Object.keys(r.content ?? {})[0] ?? null })),
    };
  });
  return { version: openapi.info?.version ?? "", operations };
}

export const render = (spec) => `${JSON.stringify(spec, null, 2)}\n`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const spec = buildSpec(JSON.parse(readFileSync(join(root, "contracts/openapi.json"), "utf8")));
  writeFileSync(join(root, "src/features/developers/spec.json"), render(spec));
  console.log(`API page: ${spec.operations.length} operations from backend ${spec.version}`);
}
