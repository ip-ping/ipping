import { describe, expect, it } from "vitest";

import { buildRequest, parseValue, pretty, pyLiteral, ready, snippets, type Result } from "./request";
import { orderedFields } from "./guide";
import { fieldsOf, operation } from "./spec";

const create = operation("POST /api/v1/measurements");
const lookup = operation("GET /api/v1/ip/{address}");
const text = operation("GET /api/v1/text");

describe("parseValue", () => {
  it("leaves out what was left alone", () => {
    expect(parseValue({ type: "string" }, undefined)).toEqual({ skip: true });
    expect(parseValue({ type: "string" }, "")).toEqual({ skip: true });
    expect(parseValue({ type: "string" }, "   ")).toEqual({ skip: true });
  });

  it("reads numbers, and refuses what is not one", () => {
    expect(parseValue({ type: "integer" }, " 5 ")).toEqual({ value: 5 });
    expect(parseValue({ type: "integer" }, "5.5")).toEqual({ error: "A whole number." });
    expect(parseValue({ type: "integer" }, "five")).toEqual({ error: "A whole number." });
    expect(parseValue({ type: "number" }, "2.5")).toEqual({ value: 2.5 });
    expect(parseValue({ type: "number" }, "x")).toEqual({ error: "A number." });
  });

  it("sends a value out of range, with a warning, so that the API's own answer can be seen", () => {
    expect(parseValue({ type: "integer", minimum: 1, maximum: 10 }, "50")).toEqual({ value: 50, warning: "The most is 10." });
    expect(parseValue({ type: "integer", minimum: 1, maximum: 10 }, "0")).toEqual({ value: 0, warning: "The least is 1." });
    expect(parseValue({ type: "integer", minimum: 1, maximum: 10 }, "7")).toEqual({ value: 7, warning: undefined });
  });

  it("reads booleans, lists and JSON", () => {
    expect(parseValue({ type: "boolean" }, true)).toEqual({ value: true });
    expect(parseValue({ type: "boolean" }, false)).toEqual({ value: false });
    expect(parseValue({ type: "array", items: { type: "string" } }, "a, b  c,,d")).toEqual({ value: ["a", "b", "c", "d"] });
    expect(parseValue({ type: "array", items: { type: "integer" } }, "1,2")).toEqual({ value: [1, 2] });
    expect(parseValue({ type: "array", items: { type: "integer" } }, "1,x")).toMatchObject({ error: expect.any(String) });
    expect(parseValue({ type: "object" }, '{"a":1}')).toEqual({ value: { a: 1 } });
    expect(parseValue({ type: "object" }, "{")).toEqual({ error: "JSON that can be read." });
  });
});

describe("buildRequest", () => {
  it("puts only what was filled in into the body, and says what is still needed", () => {
    const empty = buildRequest(create, {});
    expect(empty.body).toEqual({});
    expect(empty.missing).toEqual(["target"]);
    expect(ready(empty)).toBe(false);
    const built = buildRequest(create, { target: "example.com", kind: "tcp", port: "443", count: "", follow_redirects: undefined, node_ids: "a, b" });
    expect(built.body).toEqual({ target: "example.com", kind: "tcp", port: 443, node_ids: ["a", "b"] });
    expect(built.method).toBe("POST");
    expect(built.url).toBe("/api/v1/measurements");
    expect(ready(built)).toBe(true);
  });

  it("keeps a switch that was turned off, because off is an answer", () => {
    expect(buildRequest(create, { target: "x", include_community: false }).body).toMatchObject({ include_community: false });
  });

  it("fills a path and encodes it", () => {
    expect(buildRequest(lookup, { address: "8.8.8.8" }).url).toBe("/api/v1/ip/8.8.8.8");
    expect(buildRequest(lookup, { address: "2001:4860:4860::8888" }).url).toBe("/api/v1/ip/2001%3A4860%3A4860%3A%3A8888");
    expect(buildRequest(lookup, { address: "a/b ?x" }).url).toBe("/api/v1/ip/a%2Fb%20%3Fx");
    const open = buildRequest(lookup, {});
    expect(open.path).toBe("/api/v1/ip/{address}");
    expect(open.missing).toEqual(["address"]);
  });

  it("makes a query of the fields that are set", () => {
    const built = buildRequest(text, { target: "example.com", kind: "dns", record_type: "MX", wait: "", follow_redirects: true });
    expect(built.query).toEqual([
      ["target", "example.com"],
      ["kind", "dns"],
      ["record_type", "MX"],
      ["follow_redirects", "true"],
    ]);
    expect(built.url).toBe("/api/v1/text?target=example.com&kind=dns&record_type=MX&follow_redirects=true");
    expect(built.body).toBeNull();
  });

  it("holds back a request with a value that cannot be read", () => {
    const built = buildRequest(create, { target: "x", count: "many" });
    expect(built.errors).toEqual({ count: "A whole number." });
    expect(ready(built)).toBe(false);
    expect(buildRequest(create, { target: "x", count: "99" }).warnings.count).toBe("The most is 10.");
    expect(ready(buildRequest(create, { target: "x", count: "99" }))).toBe(true);
  });
});

describe("snippets", () => {
  const values = { target: "example.com", kind: "tcp", port: "443", include_community: false };
  const post = buildRequest(create, values, orderedFields("POST /api/v1/measurements", fieldsOf(create), values));
  const base = "https://ping.example.org";

  it("makes a curl line that a terminal runs, with the key from the environment", () => {
    const { curl } = snippets(post, base, "either", "json");
    expect(curl).toBe(
      [
        "curl -s -X POST \\",
        '  -H "Authorization: Bearer $IPPING_KEY" \\',
        '  -H "Content-Type: application/json" \\',
        `  -d '{"target":"example.com","kind":"tcp","port":443,"include_community":false}' \\`,
        "  'https://ping.example.org/api/v1/measurements'",
      ].join("\n"),
    );
  });

  it("quotes a single quote for the shell", () => {
    const quoted = buildRequest(create, { target: "it's" });
    expect(snippets(quoted, base, "either", "json").curl).toContain(`-d '{"target":"it'\\''s"}'`);
  });

  it("writes Python with True, False and None, and reads the key from the environment", () => {
    const { python } = snippets(post, base, "either", "json");
    expect(python).toContain("import os\nimport requests");
    expect(python).toContain('requests.post(');
    expect(python).toContain('"https://ping.example.org/api/v1/measurements"');
    expect(python).toContain('headers={"Authorization": f"Bearer {os.environ[\'IPPING_KEY\']}"}');
    expect(python).toContain('"include_community": False,');
    expect(python).toContain('"port": 443,');
    expect(python).toContain("print(response.json())");
    expect(pyLiteral({ a: [true, null, { b: "x" }] })).toBe('{\n    "a": [\n        True,\n        None,\n        {\n            "b": "x",\n        },\n    ],\n}');
  });

  it("writes JavaScript that sends the same request", () => {
    const { javascript } = snippets(post, base, "either", "json");
    expect(javascript).toContain('await fetch("https://ping.example.org/api/v1/measurements", {');
    expect(javascript).toContain('method: "POST"');
    expect(javascript).toContain("Authorization: `Bearer ${process.env.IPPING_KEY}`");
    expect(javascript).toContain('"Content-Type": "application/json"');
    expect(javascript).toContain("body: JSON.stringify({");
    expect(javascript).toContain("console.log(await response.json());");
  });

  it("never holds a key, whatever the endpoint", () => {
    for (const auth of ["none", "either", "key", "session"] as const) {
      const all = Object.values(snippets(post, base, auth, "json")).join("\n");
      expect(all).not.toMatch(/ipk_/);
    }
  });

  it("leaves the key header out where a key is no use", () => {
    const get = buildRequest(operation("GET /api/v1/nodes"), {});
    for (const auth of ["none", "session"] as const) {
      const all = Object.values(snippets(get, base, auth, "json")).join("\n");
      expect(all).not.toMatch(/Authorization|IPPING_KEY/);
    }
    expect(snippets(get, base, "none", "json").curl).toBe("curl -s \\\n  'https://ping.example.org/api/v1/nodes'");
    expect(snippets(get, base, "none", "json").javascript).toContain('await fetch("https://ping.example.org/api/v1/nodes");');
  });

  it("asks for text where the answer is text, and for a stream where it is one", () => {
    const get = buildRequest(text, { target: "example.com", wait: "10" });
    const asText = snippets(get, base, "key", "text");
    expect(asText.curl).toContain("'https://ping.example.org/api/v1/text?target=example.com&wait=10'");
    expect(asText.python).toContain("print(response.text)");
    expect(asText.python).toContain('params={\n        "target": "example.com",\n        "wait": "10",\n    },');
    expect(asText.javascript).toContain("console.log(await response.text());");
    const events = buildRequest(operation("GET /api/v1/measurements/{measurement_id}/events"), { measurement_id: "abc" });
    const live = snippets(events, base, "either", "stream");
    expect(live.curl.startsWith("curl -sN")).toBe(true);
    expect(live.python).toContain("stream=True");
    expect(live.javascript).toContain("for await (const chunk of response.body)");
  });
});

describe("pretty", () => {
  const result = (over: Partial<Result>): Result => ({ status: 200, statusText: "OK", ok: true, ms: 1, contentType: "", headers: [], text: "", json: undefined, ...over });

  it("lays JSON out and leaves text as it came", () => {
    expect(pretty(result({ json: { a: 1 } })).text).toBe('{\n  "a": 1\n}');
    expect(pretty(result({ text: "64 bytes from..." }))).toEqual({ text: "64 bytes from...", cut: false });
  });

  it("cuts what is too long to read, and says so", () => {
    expect(pretty(result({ text: "x".repeat(50) }), 10)).toEqual({ text: "xxxxxxxxxx", cut: true });
  });
});
