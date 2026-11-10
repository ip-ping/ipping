// Geofeeds (RFC 8805) in the location panel: what the network's own feed says, checked against the measurements.
// Needs IPPING_UI_GEOIP_DIR set to the directory the backend under test reads its GeoIP files from (the check writes
// the feed there, as `ipping-backend geofeed-update` would), and a backend newer than 0.6.1; without either it says
// so and stops.
//
// The simulated fleet puts 93.184.216.34 in New York, 185.1.3.1 in Frankfurt and 93.184.217.5 in Singapore.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { BASE, open, measure, warmUp } from "./lib.mjs";

const SOURCE = "https://feeds.test/geofeed.csv";

export default async function check(t) {
  const dir = process.env.IPPING_UI_GEOIP_DIR;
  if (!dir) {
    t.note("skipped: set IPPING_UI_GEOIP_DIR to the directory the backend reads GeoIP files from");
    return;
  }
  const { page, errors, close } = await open(t.browser, { width: 1280 });
  const call = await warmUp(page);

  const rows = [
    ["93.184.216.0/24", "JP", "", "Tokyo", SOURCE], // the fleet puts this one in New York: a node there rules Tokyo out
    ["185.1.3.0/24", "DE", "", "Frankfurt", SOURCE], // and this one in Frankfurt: nothing contradicts it
    ["93.184.217.0/24", "DE", "", "Falkenstein", SOURCE], // a town the gazetteer does not have
  ];
  const file = path.join(dir, "geofeeds.csv.gz");
  fs.writeFileSync(file, zlib.gzipSync(rows.map((r) => r.join(",")).join("\n") + "\n"));
  try {
    const locate = async (ip) => {
      const id = await measure(call, page, { target: ip, kind: "ping", count: 2 }, 60);
      const estimate = await call("GET", `/measurements/${id}/location`);
      return { id, estimate };
    };

    const tokyo = await locate("93.184.216.34");
    if (!("geofeed" in tokyo.estimate)) {
      t.note("skipped: this backend does not know geofeeds (it needs a version newer than 0.6.1)");
      return;
    }
    t.eq(tokyo.estimate.geofeed?.verdict, "ruled_out", "Tokyo for an address near New York should be ruled out");
    t.eq(tokyo.estimate.geofeed?.source, "Geofeed from feeds.test", "the feed's host should be named");
    t.eq(tokyo.estimate.geofeed?.prefix, "93.184.216.0/24", "the prefix of the line should be named");
    t.eq(tokyo.estimate.likely?.country, "US", "the feed must not move the estimate");

    await page.goto(`${BASE}/measurements/${tokyo.id}`);
    await page.waitForLoadState("networkidle");
    await page.getByText("Estimated network location").waitFor({ timeout: 15000 });
    let text = await page.locator("main").innerText();
    t.ok(/Geofeed from feeds\.test says\s*Tokyo, JP/.test(text), "the panel should say what the feed says");
    t.ok(/for 93\.184\.216\.0\/24/.test(text), "and for which prefix");
    t.ok(/The measurements rule that out/.test(text), "and that the measurements rule it out");
    t.ok(/what the network's operator says/.test(text), "and whose word it is");

    const frankfurt = await locate("185.1.3.1");
    t.eq(frankfurt.estimate.geofeed?.verdict, "consistent", "Frankfurt for an address in Frankfurt is not contradicted");
    await page.goto(`${BASE}/measurements/${frankfurt.id}`);
    await page.waitForLoadState("networkidle");
    await page.getByText("Estimated network location").waitFor({ timeout: 15000 });
    text = await page.locator("main").innerText();
    t.ok(/Geofeed from feeds\.test says\s*Frankfurt am Main, DE/.test(text) && /No measurement contradicts that/.test(text), "a consistent claim says so");

    const town = await locate("93.184.217.5");
    t.eq(town.estimate.geofeed?.verdict, "not_checked", "a town the site does not know cannot be checked");
    t.eq(town.estimate.geofeed?.claim, "Falkenstein, DE", "but the feed's words are kept");
    await page.goto(`${BASE}/measurements/${town.id}`);
    await page.waitForLoadState("networkidle");
    await page.getByText("Estimated network location").waitFor({ timeout: 15000 });
    text = await page.locator("main").innerText();
    t.ok(/says\s*Falkenstein, DE/.test(text) && /not a place this site can check/.test(text), "the panel shows the claim as written");

    const uncovered = await locate("185.1.1.1");
    t.eq(uncovered.estimate.geofeed ?? null, null, "an address no feed covers has no geofeed line");
    await page.goto(`${BASE}/measurements/${uncovered.id}`);
    await page.waitForLoadState("networkidle");
    await page.getByText("Estimated network location").waitFor({ timeout: 15000 });
    t.ok(!/Geofeed from/.test(await page.locator("main").innerText()), "and the panel says nothing about one");
    t.ok(errors.length === 0, `console errors ${JSON.stringify(errors)}`);
  } finally {
    fs.rmSync(file, { force: true });
    await close();
  }
}
