import raw from "./spec.json";

/** The part of a JSON schema the API page draws a form from (`scripts/build-api-guide-spec.mjs` makes it from the backend's contract). */
export type Schema = {
  type?: "string" | "integer" | "number" | "boolean" | "array" | "object";
  enum?: string[];
  default?: unknown;
  description?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  maxItems?: number;
  format?: string;
  nullable?: boolean;
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
};

export type Parameter = { name: string; in: "path" | "query"; required: boolean; description: string; schema: Schema };

export type Operation = {
  method: "GET" | "POST";
  path: string;
  summary: string;
  description: string;
  parameters: Parameter[];
  body: { required: boolean; schema: Schema } | null;
  responses: { status: string; description: string; contentType: string | null }[];
};

export const operations = raw.operations as Operation[];
export const backendVersion: string = raw.version;

/** `GET /api/v1/ip/{address}`: how an operation is named in the guide. */
export const keyOf = (op: Pick<Operation, "method" | "path">): string => `${op.method} ${op.path}`;

const byKey = new Map(operations.map((op) => [keyOf(op), op]));

export function operation(key: string): Operation {
  const op = byKey.get(key);
  if (!op) throw new Error(`the API page has no operation ${key}`);
  return op;
}

/** What a form asks for: the parameters of an operation and, for one with a JSON body, the properties of the body. */
export type Field = { name: string; in: "path" | "query" | "body"; required: boolean; description: string; schema: Schema };

export function fieldsOf(op: Operation): Field[] {
  const fields: Field[] = op.parameters.map((p) => ({ name: p.name, in: p.in, required: p.required, description: p.description || p.schema.description || "", schema: p.schema }));
  if (op.body?.schema.properties) {
    const required = new Set(op.body.schema.required ?? []);
    for (const [name, schema] of Object.entries(op.body.schema.properties)) {
      fields.push({ name, in: "body", required: required.has(name), description: schema.description ?? "", schema });
    }
  }
  return fields;
}
