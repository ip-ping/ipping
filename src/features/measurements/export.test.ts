import { describe, expect, it } from "vitest";

import { dnsSample, measurement, sample, task } from "@/test/fixtures";

import { csvCell, exportFilename, toCsv, toJson, toText } from "./export";

describe("csvCell", () => {
  it("quotes what has to be quoted", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(0)).toBe("0");
  });

  it("stops a spreadsheet reading text from another machine as a formula", () => {
    for (const evil of ["=HYPERLINK(\"http://x\")", "+1+1", "-2+3", "@SUM(A1)", "\tTAB", "\rCR"]) {
      expect(csvCell(evil).replace(/^"/, "").startsWith("'"), evil).toBe(true);
    }
    // but a negative number is a number
    expect(csvCell("-12.5")).toBe("-12.5");
  });
});

describe("toCsv", () => {
  const ping = measurement("ping", [
    task("Dubai", {
      status: "completed",
      tested_ip: "93.184.216.34",
      summary: { sent: 4, received: 3, loss_pct: 25, min_ms: 1.4, median_ms: 3.1, avg_ms: 3.1, max_ms: 4.7 },
    }),
    task("Sydney, South", { status: "failed", error_message: "No route" }),
  ]);

  it("has a header and one row per node, with CRLF line ends", () => {
    const lines = toCsv(ping).split("\r\n");
    expect(lines[0]).toBe("node,country,city,provider,asn,status,tested_ip,error,sent,received,loss_pct,min_ms,median_ms,avg_ms,max_ms");
    expect(lines[1]).toBe("Dubai,NL,Dubai,,,completed,93.184.216.34,,4,3,25,1.4,3.1,3.1,4.7");
    // a comma in a name is quoted and a node without numbers leaves them empty
    expect(lines[2].startsWith('"Sydney, South",NL,"Sydney, South",,,failed,,No route')).toBe(true);
    expect(lines.at(-1)).toBe("");
  });

  it("uses the columns of the kind", () => {
    const dns = measurement(
      "dns",
      [task("A", { samples: [dnsSample([{ type: "A", data: "1.2.3.4", ttl: 60 }, { type: "A", data: "5.6.7.8", ttl: 30 }])] })],
      { options: { count: 1, interval_ms: 1000, timeout_ms: 5000, record_type: "A", resolver: "google" } as never },
    );
    const [header, row] = toCsv(dns).split("\r\n");
    expect(header.endsWith("record_type,resolver,transport,rcode,answers,min_ttl,time_ms")).toBe(true);
    expect(row.endsWith("A,system,udp,NOERROR,A 1.2.3.4 | A 5.6.7.8,30,12")).toBe(true);
  });

  it("neutralises a formula that arrives from another machine", () => {
    // an HTTP Server header is whatever the remote server says it is
    const http = { status_code: 200, server: '=HYPERLINK("http://evil.example","click")', total_us: 1000 };
    const evil = measurement("http", [task("A", { samples: [sample({ seq: 0, http } as never)] })]);
    const row = toCsv(evil).split("\r\n")[1];
    expect(row).toContain(`"'=HYPERLINK(""http://evil.example"",""click"")"`);
    // a DNS answer is written after its record type, so it can never start a cell with a formula character
    const dns = measurement("dns", [task("A", { samples: [dnsSample([{ type: "TXT", data: "=cmd|' /C calc'!A0" }])] })]);
    expect(toCsv(dns).split("\r\n")[1]).toContain(",TXT =cmd|");
  });
});

describe("toText", () => {
  it("reads like the tool it stands for", () => {
    const text = toText(
      measurement("ping", [
        task("Dubai", { summary: { sent: 4, received: 4, loss_pct: 0, min_ms: 1.4, median_ms: 3.1, avg_ms: 3.1, max_ms: 4.7 } }),
        task("Tokyo", { summary: { sent: 4, received: 0, loss_pct: 100 } }),
      ]),
    );
    expect(text).toContain("Ping example.com (2026-11-07 12:34 UTC, 4 echo requests per node)");
    expect(text).toMatch(/Dubai, NL\s+4\/4 received\s+min\/median\/avg\/max = 1\.4\/3\.1\/3\.1\/4\.7 ms\s+loss 0%/);
    expect(text).toMatch(/Tokyo, NL\s+0\/4 received/);
    expect(text).toContain("2 of 2 nodes answered.");
  });

  it("prints loss and spread for a route traced in rounds", () => {
    const route = task("A", {
      summary: { sent: 2, received: 2, loss_pct: 0, reached: true, median_ms: 20 },
      samples: [
        sample({ seq: 0, hop: { ttl: 1, ip: "62.115.1.1", private: false, reached: false, rtts_us: [9000, 9500, 12000], sent: 6 } } as never),
        sample({ seq: 1, hop: { ttl: 2, ip: "93.184.216.34", private: false, reached: true, rtts_us: [20_000, 20_000, 20_000, 20_000, 20_000, 20_000], sent: 6 } } as never),
      ],
    });
    const text = toText(measurement("traceroute", [route]));
    expect(text).toContain("50% loss");
    expect(text).toContain("best/avg/worst = 9.0/10.2/12.0 ms");
    expect(text).toContain("0% loss");
  });

  it("marks a DNS answer that came over HTTPS", () => {
    const answered = task("A", {
      samples: [
        sample({ seq: 0, rtt_ms: 31.2, dns: { resolver: "1.1.1.1", record_type: "A", rcode: "NOERROR", transport: "doh", answers: [{ name: "example.com", type: "A", ttl: 300, data: "93.184.216.34" }] } } as never),
      ],
    });
    const text = toText(measurement("dns", [answered]));
    expect(text).toMatch(/93\.184\.216\.34\s+31\.2 ms\s+\(DoH\)/);
  });

  it("lists the hops of a route", () => {
    const route = task("A", {
      summary: { sent: 2, received: 2, loss_pct: 0, reached: true, median_ms: 11 },
      samples: [
        sample({ seq: 0, hop: { ttl: 1, private: true, reached: false, rtts_us: [500] } } as never),
        sample({ seq: 1, hop: { ttl: 2, ip: "93.184.216.34", private: false, reached: true, rtts_us: [11_000] } } as never),
      ],
    });
    const text = toText(measurement("traceroute", [route]));
    expect(text).toContain("reached in 2 hops, 11.0 ms");
    expect(text).toContain("(private network)");
    expect(text).toContain("93.184.216.34");
  });
});

describe("toJson and filenames", () => {
  const m = measurement("ping", [task("A")]);
  it("keeps everything and says when and from where it was exported", () => {
    const parsed = JSON.parse(toJson(m, new Date("2026-11-08T01:02:03Z")));
    expect(parsed.exported_at).toBe("2026-11-08T01:02:03.000Z");
    expect(parsed.exported_from).toBe("ipping");
    expect(parsed.tasks).toHaveLength(1);
    expect(parsed.id).toBe("m1");
  });
  it("names a file after what was measured and when, safely", () => {
    expect(exportFilename(m, "csv")).toBe("ipping-ping-example.com-20261107-1234.csv");
    const odd = measurement("ping", [], { target: { host: "../../etc/passwd", ip: null, resolved_ips: [], input_kind: "hostname" } as never });
    expect(exportFilename(odd, "txt")).not.toMatch(/[/\\]/);
  });
});
