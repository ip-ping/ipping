import { describe, expect, it } from "vitest";

import { canUseDoh, DNS_RESOLVERS, DNS_TRANSPORTS, DOH_RESOLVERS } from "./kinds";

describe("DNS over HTTPS", () => {
  it("can be asked of Cloudflare and Google, not of a node's own resolver or Quad9", () => {
    expect(canUseDoh("cloudflare")).toBe(true);
    expect(canUseDoh("google")).toBe(true);
    expect(canUseDoh("quad9")).toBe(false); // answers only over HTTP/2, which the nodes do not speak
    expect(canUseDoh("system")).toBe(false);
  });

  it("only offers resolvers the form knows", () => {
    const known = DNS_RESOLVERS.map((r) => r.value);
    expect(DOH_RESOLVERS.every((r) => known.includes(r))).toBe(true);
    expect(DNS_TRANSPORTS.map((t) => t.value)).toEqual(["udp", "doh"]);
  });
});
