// A traceroute repeated in rounds: loss and spread for every hop, the networks it crosses and the route on the map.
// Needs a backend that can repeat a traceroute (newer than 0.4.1); against an older one it says so and stops.
// The map and the networks need GeoIP databases on the backend; without them the page must say so instead.
import { BASE, WIDTHS, measure, noOverflow, open, screenshot, warmUp } from "./lib.mjs";

const LADDER = '[role=group][aria-label^="The route from"]';

export default async function check(t) {
  const { page, errors, close } = await open(t.browser, { width: 1440 });
  const call = await warmUp(page);
  let id;
  try {
    // 3 rounds of up to 30 hops from 16 nodes is 800 probes; 5 rounds would be 1120, over the default budget of 1000
    id = await measure(call, page, { target: "example.com", kind: "traceroute", count: 3 }, 120);
  } catch (e) {
    if (!/invalid_option/.test(String(e.message))) throw e;
    t.note("skipped: this backend cannot repeat a traceroute (it needs a version newer than 0.4.1)");
    await close();
    return;
  }
  const done = await call("GET", "/measurements/" + id);
  t.eq(done.options.count, 3, "the measurement should remember its rounds");
  const withSent = done.tasks.flatMap((task) => task.samples).filter((s) => s.hop && s.hop.sent === 5).length;
  t.ok(withSent > 0, "no hop says it was sent 5 probes (3 in the first round, 1 in each of 2 more)");

  await page.goto(`${BASE}/measurements/${id}`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1200);
  const header = await page.locator("main").innerText();
  t.ok(/traced 3 times/.test(header), "the page should say the route was traced 3 times");

  // every hop that answered reads out its spread and loss
  const labels = await page.locator(`${LADDER} g[role=img]`).evaluateAll((rows) => rows.map((r) => r.getAttribute("aria-label") ?? ""));
  t.ok(labels.length >= 4, `the ladder has ${labels.length} rows`);
  t.ok(labels.some((l) => /best .* worst .* ms/.test(l)), `no hop reads out best and worst: ${JSON.stringify(labels.slice(0, 3))}`);
  const losses = await page.locator(`${LADDER} text`).evaluateAll((nodes) => nodes.map((n) => n.textContent ?? "").filter((x) => /^\d+%$/.test(x)));
  t.ok(losses.length >= 3, `the loss column shows ${losses.length} values`);

  // hovering a hop shows its numbers
  const row = page.locator(`${LADDER} g[role=img]`).nth(2);
  await row.hover();
  await page.waitForTimeout(250);
  const tip = await page.locator("main").innerText();
  t.ok(/Jitter/.test(tip) || /Many routers do not answer/.test(tip), "hovering a hop should show its jitter or say it is silent");

  // networks and places: only when the backend has databases
  const path = await call("GET", `/measurements/${id}/path`);
  const route = page.locator("main");
  if (path?.city_database || path?.asn_database) {
    t.ok((await route.locator('ol[aria-label^="Networks the route crosses"]').count()) > 0 || Object.keys(path.hops).length === 0, "the networks of the route are not listed");
    if (path.city_database && Object.keys(path.hops).length) {
      const map = page.locator('figure svg[aria-label^="Map of the route"]');
      t.ok((await map.count()) > 0 || /could not be placed/.test(await route.innerText()), "the route is neither drawn nor explained");
      t.ok(/hint/.test(await route.innerText()), "the map should say that places are only a hint");
    }
  } else {
    t.ok(/No GeoIP database is loaded/.test(await route.innerText()), "without databases the page should say why there is no map");
  }
  await screenshot(page, "route-rounds");
  t.ok(errors.length === 0, `console errors ${JSON.stringify(errors)}`);

  for (const width of WIDTHS) {
    const small = await open(t.browser, { width });
    await small.page.goto(`${BASE}/measurements/${id}`);
    await small.page.waitForLoadState("networkidle");
    await small.page.waitForTimeout(900);
    await noOverflow(t, small.page, `route with rounds at ${width}px`);
    t.ok(small.errors.length === 0, `console errors at ${width}px ${JSON.stringify(small.errors)}`);
    await small.close();
  }

  // the form offers the rounds only for a traceroute
  await page.goto(`${BASE}/?kind=traceroute`);
  await page.waitForLoadState("networkidle");
  t.ok((await page.getByText("Rounds (like mtr)").count()) > 0, "the form should offer rounds for a traceroute");
  await page.goto(`${BASE}/?kind=ping`);
  await page.waitForLoadState("networkidle");
  t.eq(await page.getByText("Rounds (like mtr)").count(), 0, "a ping should not offer rounds");
  await close();
}
