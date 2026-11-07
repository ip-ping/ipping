// What each kind of measurement shows, and that the map, the chart and the table are one selection.
import { BASE, open } from "./lib.mjs";

const PANELS = {
  ping: /Every round trip, by node/i,
  tcp: /Every connection time, by node/i,
  http: /Where the time went/i,
  traceroute: /The route/i,
  dns: /Do the answers agree\?/i,
};

export default async function check(t) {
  const { page, errors, close } = await open(t.browser, { width: 1440 });
  for (const [kind, id] of Object.entries(t.shared)) {
    await page.goto(`${BASE}/measurements/${id}`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(900);
    const text = await page.locator("main").innerText();
    t.ok(/the reading/i.test(text), `${kind}: no reading panel`);
    t.ok(PANELS[kind].test(text), `${kind}: no ${PANELS[kind]} panel`);
    const rows = await page.locator("tbody tr").count();
    const readoutNodes = await page.getByText(/^\d+ of \d+ nodes finished/i).first().innerText();
    t.ok(rows > 0 && readoutNodes, `${kind}: the table has ${rows} rows`);

    // pointing at a row of the table lights the same node on the map and in the chart
    const first = page.locator("tbody tr").first();
    const name = (await first.locator("td").nth(1).innerText()).split("\n")[0].trim();
    await first.hover();
    await page.waitForTimeout(250);
    const tooltip = await page.locator("figure").first().innerText();
    t.ok(tooltip.includes(name), `${kind}: hovering ${name} in the table did not light it on the map`);
    await page.mouse.move(5, 5);
  }

  // keyboard: Tab onto a row of the chart reads out its numbers and lights the table row
  await page.goto(`${BASE}/measurements/${t.shared.ping}`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(900);
  let label = null;
  for (let i = 0; i < 80 && !label; i++) {
    await page.keyboard.press("Tab");
    label = await page.evaluate(() => {
      const a = document.activeElement;
      return a && a.tagName === "g" && a.getAttribute("role") === "img" && a.closest("[role=group]") ? a.getAttribute("aria-label") : null;
    });
  }
  t.ok(label && /median/.test(label), `the keyboard never reached a chart row (${label})`);
  const lit = await page.locator("tbody tr").evaluateAll((rows) => rows.filter((r) => r.className.includes("bg-signal-soft")).length);
  t.eq(lit, 1, "focusing a chart row should light exactly one table row");

  // the anycast address is shown as such
  const text = await page.locator("main").innerText();
  t.ok(/anycast/i.test(text), "ping to 1.1.1.1 should explain that it looks like anycast");
  t.ok(errors.length === 0, `console errors ${JSON.stringify(errors)}`);
  await close();
}
