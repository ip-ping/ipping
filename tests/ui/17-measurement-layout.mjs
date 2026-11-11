// The layout of a measurement page: the answer first (headline numbers beside the target's IP info), then the map, the best
// guess where it is, the round trips and the nodes, then the evidence and the addresses; sharing in the header; a row of links to
// the sections. It fits at the widths people use. Needs the lookup's databases for the target card; says so when they are missing.
import { BASE, WIDTHS, measure, noOverflow, open, screenshot, warmUp } from "./lib.mjs";

const top = async (locator) => (await locator.first().boundingBox())?.y ?? Number.NaN;

export default async function check(t) {
  const { page, errors, close } = await open(t.browser, { width: 1440 });
  const call = await warmUp(page);
  const ping = await measure(call, page, { target: "93.184.216.34", kind: "ping", count: 3, dns_mode: "fixed" });
  await page.goto(`${BASE}/measurements/${ping}`);
  await page.waitForLoadState("networkidle");
  await page.getByTestId("estimate-summary").waitFor({ timeout: 15000 });

  // sharing is in the header, not at the bottom
  const share = page.getByRole("switch");
  t.ok((await share.boundingBox())?.y < 300, "the share switch should be in the header");
  await share.click();
  await page.getByRole("button", { name: /Copy link/ }).waitFor({ timeout: 5000 });
  await share.click();

  // the order of things: headline numbers, map, best guess, round trips, nodes, location evidence
  const hasTarget = (await page.getByTestId("target-card").count()) > 0;
  if (!hasTarget) t.note("no IP database on this backend: the target card and the addresses are left out");
  const y = {
    tiles: await top(page.getByText("Responding", { exact: true })),
    map: await top(page.locator("#map figure")),
    guess: await top(page.getByTestId("estimate-summary")),
    results: await top(page.locator("#results")),
    nodes: await top(page.locator("#nodes")),
    location: await top(page.locator("#location")),
  };
  const order = ["tiles", "map", "guess", "results", "nodes", "location"];
  for (let i = 1; i < order.length; i++) t.ok(y[order[i - 1]] < y[order[i]], `${order[i - 1]} should come before ${order[i]} (${JSON.stringify(y)})`);
  if (hasTarget) {
    const card = await top(page.getByTestId("target-card"));
    t.ok(Math.abs(card - y.tiles) < 120 && card < y.map, `the target card should sit beside the headline numbers (card ${card}, tiles ${y.tiles})`);
    const text = await page.getByTestId("target-card").innerText();
    t.ok(/[A-Z][a-z]+, [A-Z][a-z]+/.test(text) && /\d+\.\d+\.\d+\.\d+\/\d+/.test(text), `the target card should say where it is and the network record it comes from (${text.replace(/\s+/g, " ").slice(0, 120)})`);
  }
  const summary = await page.getByTestId("estimate-summary").innerText();
  t.ok(/\d+% within [\d,]+ km/.test(summary), `the best guess should carry its accuracy (${summary.replace(/\s+/g, " ").slice(0, 120)})`);

  // the links to the sections go there
  const nav = page.getByRole("navigation", { name: "Sections" });
  for (const label of ["Map", "Round trips", "Nodes", "Location"]) t.eq(await nav.getByRole("link", { name: label }).count(), 1, `a link to ${label}`);
  await nav.getByRole("link", { name: "Location" }).click();
  await page.waitForTimeout(600);
  const at = await top(page.locator("#location"));
  t.ok(at >= 0 && at < 400, `following the Location link should bring the section to the top of the window (it is at ${at})`);
  await screenshot(page, "measurement-layout");

  // a kind with no estimate has no location link, and the page still reads in order
  const dns = await measure(call, page, { target: "split-example.com", kind: "dns", record_type: "A", resolver: "system", dns_mode: "regional" });
  await page.goto(`${BASE}/measurements/${dns}`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("navigation", { name: "Sections" }).waitFor();
  t.eq(await page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Location" }).count(), 0, "a DNS check has no location");

  // it fits at every width
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
    await page.goto(`${BASE}/measurements/${ping}`);
    await page.waitForLoadState("networkidle");
    await page.getByTestId("estimate-summary").waitFor({ timeout: 15000 });
    await noOverflow(t, page, `measurement page at ${width}`);
  }
  t.ok(errors.length === 0, `console errors ${JSON.stringify(errors)}`);
  await close();
}
