// A sponsored node's provider is the one thing in a line of grey words that is made to stand out. Drawn on the server, as the page is.
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TipTitle } from "@/components/viz/chart-tip";
import { networkParts } from "@/lib/format";
import { I18nProvider } from "@/lib/i18n/provider";

import { NetworkName, SponsorMark } from "./network-name";

const draw = (element: ReactElement) => renderToStaticMarkup(createElement(I18nProvider, null, element));
const node = (over: Record<string, unknown> = {}) => ({ provider: "OVH SAS", asn: 16276, ...over });

describe("NetworkName", () => {
  it("draws the network of an ordinary node as plain words", () => {
    const html = draw(createElement(NetworkName, { parts: networkParts(node()) }));
    expect(html).toBe("OVH SAS · AS16276");
  });

  it("makes a sponsored node's provider stand out, and leaves the AS number plain beside it", () => {
    const html = draw(createElement(NetworkName, { parts: networkParts(node({ sponsored: true })) }));
    expect(html).toContain('data-testid="sponsored-provider"');
    expect(html).toContain('data-slot="badge"');
    expect(html).toContain("<svg"); // the star
    expect(html).toContain('title="Sponsored node"');
    expect(html).toContain(">OVH SAS</span>");
    expect(html).toMatch(/<\/span> · AS16276$/); // the badge ends, then the number as words
    expect(html.match(/sponsored-provider/g)).toHaveLength(1);
  });

  it("tells a screen reader that the provider is a sponsor, not just a name", () => {
    const html = draw(createElement(NetworkName, { parts: networkParts(node({ sponsored: true })) }));
    expect(html).toContain('<span class="sr-only">Sponsored node: </span>');
  });

  it("marks nothing for a node that has no provider to mark", () => {
    const html = draw(createElement(NetworkName, { parts: networkParts(node({ sponsored: true, provider: null })) }));
    expect(html).toBe("AS16276");
  });
});

describe("SponsorMark, for the administrator's list", () => {
  it("is nothing for a node that is not sponsored", () => {
    expect(draw(createElement(SponsorMark, { node: node() }))).toBe("");
    expect(draw(createElement(SponsorMark, { node: node({ sponsored: false }) }))).toBe("");
  });
  it("shows the provider that stands out, or that the node is sponsored when it has no provider yet", () => {
    expect(draw(createElement(SponsorMark, { node: node({ sponsored: true }) }))).toContain(">OVH SAS</span>");
    const bare = draw(createElement(SponsorMark, { node: node({ sponsored: true, provider: null }) }));
    expect(bare).toContain("Sponsored node");
    expect(bare).not.toContain("sponsored-provider");
  });
});

describe("the readout of a chart", () => {
  it("names the sponsor in its title, and the place when no network is given", () => {
    const sponsored = draw(createElement(TipTitle, { name: "Sydney, AU", place: "OVH SAS · AS16276", network: networkParts(node({ sponsored: true })) }));
    expect(sponsored).toContain('data-testid="sponsored-provider"');
    expect(sponsored).not.toContain("OVH SAS · AS16276"); // drawn from the parts, not the text beside them
    const plain = draw(createElement(TipTitle, { name: "Sydney, AU", place: "AU" }));
    expect(plain).toContain(">AU<");
    expect(plain).not.toContain("sponsored-provider");
  });
});
