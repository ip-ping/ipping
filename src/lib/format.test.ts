import { describe, expect, it } from "vitest";

import { networkOf, nodeHeading, shortName } from "./format";

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
