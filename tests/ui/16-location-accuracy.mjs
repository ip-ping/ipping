// The location estimate is never refused and says how accurate answers like it are: a percentage, with its radius and what it
// is a rate of. Thin evidence (two nodes) still gets an answer and a warning; an anycast address, where the nodes disagree, gets
// one too and says they disagree. Needs a backend with `accuracy` on the estimate (0.10 or newer); it stops with a note otherwise.
import { BASE, measure, noOverflow, open, screenshot, warmUp } from "./lib.mjs";

const accuracyOf = async (page) => {
  const card = page.getByTestId("accuracy");
  await card.waitFor({ timeout: 15000 });
  const text = await card.innerText();
  const m = /(\d+)% within ([\d,]+) km/.exec(text);
  return { text, percent: m ? Number(m[1]) : null, radius: m ? Number(m[2].replace(/,/g, "")) : null };
};

export default async function check(t) {
  const { page, errors, close } = await open(t.browser, { width: 1440 });
  const call = await warmUp(page);

  // 1. An ordinary measurement of a target some node is near
  const normal = await measure(call, page, { target: "93.184.216.34", kind: "ping", count: 3, dns_mode: "fixed" });
  const estimate = await call("GET", `/measurements/${normal}/location`);
  if (!estimate.accuracy) {
    t.note("skipped: this backend does not give an accuracy for the location estimate (it needs 0.10 or newer)");
    await close();
    return;
  }
  t.eq(estimate.status, "estimated", "the estimate should be given");
  t.ok(estimate.accuracy.percent >= 1 && estimate.accuracy.percent <= 99, "the percentage is never certainty");
  await page.goto(`${BASE}/measurements/${normal}`);
  await page.waitForLoadState("networkidle");
  const shown = await accuracyOf(page);
  t.eq(shown.percent, estimate.accuracy.percent, "the page should show the API's percentage");
  t.eq(shown.radius, estimate.accuracy.radius_km, "and the radius it is for");
  t.ok(/100 km/.test(shown.text) && /2,000 km/.test(shown.text), "the figure for other radii should be listed");
  t.ok(/not a probability for this address/.test(shown.text), "the page should say what the figure is");
  await screenshot(page, "accuracy-normal");
  await noOverflow(t, page, "accuracy at 1440");

  // 2. Thin evidence: two nodes still give an answer, with a warning and a lower figure than a near node would
  const nodes = (await call("GET", "/nodes")).filter((n) => n.online && n.latitude != null).slice(0, 2);
  const thin = await measure(call, page, { target: "93.184.216.34", kind: "ping", count: 2, dns_mode: "fixed", node_ids: nodes.map((n) => n.id) });
  const thinEstimate = await call("GET", `/measurements/${thin}/location`);
  t.eq(thinEstimate.status, "estimated", "two nodes should still give an estimate");
  t.ok(thinEstimate.warnings.some((w) => /Only 2 node/.test(w)), "and a warning that there are only two");
  await page.goto(`${BASE}/measurements/${thin}`);
  await page.waitForLoadState("networkidle");
  await accuracyOf(page);
  t.ok(/Only 2 node/.test(await page.locator("main").innerText()), "the page should show the warning");

  // 3. An anycast address: every node is a few ms away, so the nodes disagree, and the estimate is still given
  const anycast = await measure(call, page, { target: "1.1.1.1", kind: "ping", count: 3, dns_mode: "fixed" });
  const any = await call("GET", `/measurements/${anycast}/location`);
  t.eq(any.status, "estimated", "an anycast address should still get an estimate");
  t.ok(any.conflicting === true && any.likely, "the nodes disagree and there is a place anyway");
  t.ok(any.strength === "low", "disagreeing nodes are never strong evidence");
  await page.goto(`${BASE}/measurements/${anycast}`);
  await page.waitForLoadState("networkidle");
  await accuracyOf(page);
  const text = await page.locator("main").innerText();
  t.ok(/The nodes disagree/.test(text), "the page should say the nodes disagree");
  t.ok(/figure is lower/.test(text.replace(/\s+/g, " ")), "and that the figure is lower for such an address");
  await screenshot(page, "accuracy-anycast");

  // 4. It fits on a phone
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`${BASE}/measurements/${normal}`);
    await page.waitForLoadState("networkidle");
    await accuracyOf(page);
    await noOverflow(t, page, `accuracy at ${width}`);
  }
  t.ok(errors.length === 0, `console errors ${JSON.stringify(errors)}`);
  await close();
}
