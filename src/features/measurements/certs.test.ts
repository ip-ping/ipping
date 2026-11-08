import { describe, expect, it } from "vitest";

import { task } from "@/test/fixtures";

import { certificatesOf, certState, commonName, daysUntil, EXPIRY_WARNING_DAYS } from "./certs";

const NOW = Date.parse("2026-11-08T12:00:00Z");
const inDays = (n: number) => new Date(NOW + n * 86_400_000).toISOString();

function cert(name: string, days: number, over: Record<string, unknown> = {}, status = "ok") {
  return task(name, {
    samples: [
      {
        seq: 0,
        status,
        rtt_ms: 30,
        tls: {
          tls: { subject: "CN=example.com", issuer: "CN=Test CA", not_before: inDays(-60), not_after: inDays(days), verified: true, ...over },
          names: ["example.com", "www.example.com"],
          chain: 2,
        },
      } as never,
    ],
  });
}

describe("daysUntil", () => {
  it("counts whole days, negative once expired, null without a date", () => {
    expect(daysUntil(inDays(30.5), NOW)).toBe(30);
    expect(daysUntil(inDays(-0.5), NOW)).toBe(-1);
    expect(daysUntil(null, NOW)).toBeNull();
    expect(daysUntil("not a date", NOW)).toBeNull();
  });
});

describe("certState", () => {
  it("is bad when untrusted or expired, soon inside the warning, otherwise ok", () => {
    const state = (verified: boolean, days: number | null) => certState({ verified, notAfter: days === null ? null : inDays(days) }, NOW);
    expect(state(true, 90)).toBe("ok");
    expect(state(true, EXPIRY_WARNING_DAYS)).toBe("ok");
    expect(state(true, EXPIRY_WARNING_DAYS - 1)).toBe("soon");
    expect(state(true, 0)).toBe("soon");
    expect(state(true, -2)).toBe("bad");
    expect(state(false, 90)).toBe("bad");
    expect(state(true, null)).toBe("ok");
  });
});

describe("certificatesOf", () => {
  it("puts nodes that saw the same certificate together, most common first", () => {
    const groups = certificatesOf([cert("A", 60), cert("B", 60), cert("C", 60, { not_after: inDays(5) }), cert("D", 60)]);
    expect(groups.map((g) => g.nodeNames)).toEqual([["A", "B", "D"], ["C"]]);
    expect(groups[0].names).toEqual(["example.com", "www.example.com"]);
    expect(groups[0].chain).toBe(2);
    expect(groups.map((g) => g.slot)).toEqual([0, 1]);
    expect(groups[0].color).not.toBe(groups[1].color);
  });

  it("tells a certificate a node did not trust from the same certificate that another trusted", () => {
    const groups = certificatesOf([cert("A", 60), cert("B", 60, { verified: false, verify_error: "unknown issuer" }, "error")]);
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => !g.verified)?.verifyError).toBe("unknown issuer");
  });

  it("leaves out nodes that got no certificate, and gives the fifth group the shared grey", () => {
    const silent = task("Z", { samples: [{ seq: 0, status: "timeout" } as never] });
    const five = [1, 2, 3, 4, 5].map((n) => cert(`N${n}`, 10 + n));
    const groups = certificatesOf([silent, ...five]);
    expect(groups).toHaveLength(5);
    expect(groups.flatMap((g) => g.nodeNames)).not.toContain("Z");
    expect(groups[4].slot).toBeNull();
    expect(groups[4].color).toBe("var(--muted-foreground)");
  });
});

describe("commonName", () => {
  it("takes the common name out of a subject", () => {
    expect(commonName("CN=example.com")).toBe("example.com");
    expect(commonName("C=US, O=Example, CN=www.example.com")).toBe("www.example.com");
    expect(commonName("O=Only An Organisation")).toBe("O=Only An Organisation");
    expect(commonName(null)).toBe("unknown");
  });
});
