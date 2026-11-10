import { describe, expect, it } from "vitest";

import { looksLikeAddress, networkLine, nothingToShow, placeLine, positionLine, type IpInfo } from "./describe";

const info = (over: Partial<IpInfo> = {}): IpInfo => ({ address: "5.9.1.1", version: 4, public: true, found: true, ...over }) as IpInfo;

describe("placeLine", () => {
  it("names the city, region and country", () => {
    expect(placeLine(info({ city: "Falkenstein", region: "Saxony", country: "DE", country_name: "Germany" }))).toBe("Falkenstein, Saxony, Germany");
  });
  it("does not say a city twice", () => {
    expect(placeLine(info({ city: "Berlin", region: "Berlin", country_name: "Germany" }))).toBe("Berlin, Germany");
  });
  it("falls back to the country code, and to nothing", () => {
    expect(placeLine(info({ country: "DE" }))).toBe("DE");
    expect(placeLine(info())).toBe("");
  });
});

describe("networkLine", () => {
  it("joins the AS number and its owner, and copes with either missing", () => {
    expect(networkLine(info({ asn: 13335, organization: "Cloudflare, Inc." }))).toBe("AS13335 · Cloudflare, Inc.");
    expect(networkLine(info({ asn: 13335 }))).toBe("AS13335");
    expect(networkLine(info({ organization: "Someone" }))).toBe("Someone");
    expect(networkLine(info())).toBe("");
  });
});

describe("positionLine", () => {
  it("gives the point and how far off it may be", () => {
    expect(positionLine(info({ latitude: 50.4712, longitude: 12.3721, accuracy_radius_km: 20 }))).toBe("50.47, 12.37 · within about 20 km");
    expect(positionLine(info({ latitude: 50.4712, longitude: 12.3721 }))).toBe("50.47, 12.37");
    expect(positionLine(info())).toBe("");
  });
});

describe("nothingToShow", () => {
  it("explains a private address and an unknown one, and is quiet about a known one", () => {
    expect(nothingToShow(info({ public: false, found: false }))).toMatch(/private/);
    expect(nothingToShow(info({ found: false }))).toMatch(/know nothing/);
    expect(nothingToShow(info())).toBeNull();
  });
});

describe("looksLikeAddress", () => {
  it("accepts addresses and keeps names and URLs out", () => {
    for (const ok of ["8.8.8.8", "2606:4700:4700::1111", "::1", "::ffff:1.2.3.4"]) expect(looksLikeAddress(ok)).toBe(true);
    for (const no of ["example.com", "https://1.1.1.1/", "abc", "1234", ""]) expect(looksLikeAddress(no)).toBe(false);
  });
});
