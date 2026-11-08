// A certificate check: one card per distinct certificate (trust, days left, names, which nodes), the readouts,
// the table, the form, and every width. Needs a backend that has the `tls` kind (newer than 0.4.1) and a fleet
// that answers it (scripts/dev-fleet.py: port 993 shows nodes east of 60 degrees E an older certificate with 9
// days left, port 8443 serves an expired one that is not trusted); against an older backend it says so and stops.
import { BASE, WIDTHS, measure, noOverflow, open, screenshot, warmUp } from "./lib.mjs";

export default async function check(t) {
  const { page, errors, close } = await open(t.browser, { width: 1440 });
  const call = await warmUp(page);
  let split, expired;
  try {
    split = await measure(call, page, { target: "example.com:993", kind: "tls" }, 60);
    expired = await measure(call, page, { target: "example.com:8443", kind: "tls" }, 60);
  } catch (e) {
    if (!/validation_error|kind_not_supported|invalid_kind|Input should be/.test(String(e.message))) throw e;
    t.note("skipped: this backend has no certificate checks (it needs a version newer than 0.4.1)");
    await close();
    return;
  }

  // two certificates: the one most nodes saw, and the older one that is about to expire
  await page.goto(`${BASE}/measurements/${split}`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1200);
  const text = await page.locator("main").innerText();
  t.ok(/Certificate measurement/i.test(text), "the page should be headed as a certificate measurement");
  t.ok(/The certificate/i.test(text), "no certificate panel");
  t.ok(/shown 2 different certificates/.test(text), `the nodes should have seen two certificates: ${text.slice(0, 200)}`);
  const cards = await page.locator("article[aria-label^='Certificate for']").count();
  t.eq(cards, 2, "one card for each distinct certificate");
  t.ok(/trusted, (59|60) days left/.test(text), "the healthy certificate should say how long it has left");
  t.ok(/(8|9) days left: renew soon/.test(text), "the old certificate should be flagged to renew");
  t.ok(/example\.com/.test(text) && /www\.example\.com/.test(text), "the names it is valid for are listed");
  t.ok(/Let.s Encrypt|R11/.test(text), "the issuer is shown");

  // the readout and the table
  t.ok(/trusted\s+\d+ \/ \d+/i.test(text), "the Trusted readout is missing");
  const heads = await page.locator("thead th").allInnerTexts();
  t.ok(heads.some((h) => /Expires/i.test(h)) && heads.some((h) => /Result/i.test(h)), `table headers: ${JSON.stringify(heads)}`);
  const rows = await page.locator("tbody tr").count();
  t.ok(rows >= 16, `the table has ${rows} rows`);
  const badges = await page.locator("tbody").innerText();
  t.ok(/\d+ d left/i.test(badges), "the table should show days left");

  // pointing at a node chip lights the node in the table
  const chip = page.locator("article[aria-label^='Certificate for'] ul[aria-label^='Nodes'] button").first();
  const name = (await chip.innerText()).trim();
  await chip.hover();
  await page.waitForTimeout(250);
  const lit = await page.locator("tbody tr").evaluateAll((trs) => trs.filter((r) => r.className.includes("bg-signal-soft")).map((r) => r.innerText));
  t.ok(lit.some((row) => row.includes(name)), `hovering ${name} should light its row`);
  await page.mouse.move(5, 5);
  await screenshot(page, "certificate-split");

  // a certificate that is not trusted still shows what it is, and why
  await page.goto(`${BASE}/measurements/${expired}`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1200);
  const bad = await page.locator("main").innerText();
  t.ok(/not trusted/i.test(bad), "an expired certificate should say it is not trusted");
  t.ok(/the certificate has expired/.test(bad), "the reason should be shown");
  t.ok(/trusted\s+0 \/ \d+/i.test(bad), "no node trusts it: the readout should say 0");
  await screenshot(page, "certificate-expired");
  t.ok(errors.length === 0, `console errors ${JSON.stringify(errors)}`);

  for (const id of [split, expired]) {
    for (const width of WIDTHS) {
      const small = await open(t.browser, { width });
      await small.page.goto(`${BASE}/measurements/${id}`);
      await small.page.waitForLoadState("networkidle");
      await small.page.waitForTimeout(700);
      await noOverflow(t, small.page, `certificate result at ${width}px`);
      t.ok(small.errors.length === 0, `console errors at ${width}px ${JSON.stringify(small.errors)}`);
      await small.close();
    }
  }

  // the form: a port is optional, and the button says what it does
  await page.goto(`${BASE}/?kind=tls`);
  await page.waitForLoadState("networkidle");
  t.ok((await page.getByText("Port (optional)").count()) > 0, "the form should offer a port for a certificate check");
  t.ok((await page.getByRole("button", { name: "Check", exact: true }).count()) > 0, "the button should say Check");
  await close();
}
