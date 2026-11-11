import { describe, expect, it } from "vitest";

import { ago, networkOf, nodeHeading, shortName } from "./format";

const node = (over: Record<string, unknown> = {}) => ({
  name: "Sydney, AU - OVH SAS · AS16276",
  city: "Sydney",
  country: "AU",
  provider: "OVH SAS",
  asn: 16276,
  ...over,
});

describe("networkOf", () => {
  it("joins the provider and the AS number, whichever is known", () => {
    expect(networkOf(node())).toBe("OVH SAS · AS16276");
    expect(networkOf(node({ asn: null }))).toBe("OVH SAS");
    expect(networkOf(node({ provider: null }))).toBe("AS16276");
    expect(networkOf(node({ provider: null, asn: null }))).toBe("");
  });
});

describe("nodeHeading", () => {
  it("shows the place and the network, not the name, when both are known", () => {
    expect(nodeHeading(node({ name: "Falkenstein 1" }))).toEqual({ title: "Sydney, AU", sub: "OVH SAS · AS16276", named: false });
  });
  it("keeps the name when the place or the network is missing: it is all there is to tell the node by", () => {
    expect(nodeHeading(node({ name: "Falkenstein 1", provider: null, asn: null }))).toEqual({ title: "Falkenstein 1", sub: "Sydney, AU", named: true });
    expect(nodeHeading(node({ name: "Falkenstein 1", city: null, country: null }))).toEqual({ title: "Falkenstein 1", sub: "OVH SAS · AS16276", named: true });
    expect(nodeHeading(node({ name: "Node abc123", city: null, country: null, provider: null, asn: null }))).toEqual({ title: "Node abc123", sub: "", named: true });
  });
});

describe("shortName", () => {
  it("is the place for a chart's row label, or the name when there is no place", () => {
    expect(shortName(node())).toBe("Sydney, AU");
    expect(shortName(node({ city: null }))).toBe("AU");
    expect(shortName(node({ city: null, country: null, name: "Node abc123" }))).toBe("Node abc123");
  });
});

describe("ago", () => {
  const now = Date.parse("2026-11-11T12:00:00Z");
  const before = (seconds: number) => new Date(now - seconds * 1000).toISOString();
  it("says how long ago in the largest unit that fits", () => {
    expect(ago(before(5), "en", now)).toBe("5 sec. ago");
    expect(ago(before(3 * 60), "en", now)).toBe("3 min. ago");
    expect(ago(before(2 * 3600), "en", now)).toBe("2 hr. ago");
    expect(ago(before(86_400), "en", now)).toBe("yesterday");
    expect(ago(before(3 * 86_400), "en", now)).toBe("3 days ago");
  });
  it("uses the interface's language", () => {
    expect(ago(before(3 * 60), "de", now)).toMatch(/^vor 3 Min/);
    expect(ago(before(3 * 60), "ja", now)).toMatch(/3/);
    expect(ago(before(3 * 60), "ja", now)).not.toMatch(/ago/);
  });
  it("gives nothing for a date it cannot read", () => {
    expect(ago("not a date", "en", now)).toBe("");
  });
});
