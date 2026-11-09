// DNS over HTTPS: the choice appears only for the resolvers that can be asked that way, a result says it came over
// HTTPS, and the combinations that cannot work are refused with the reason. Needs a backend newer than 0.5.1;
// against an older one it says so and stops.
import { BASE, measure, open, warmUp } from "./lib.mjs";

export default async function check(t) {
  const { page, errors, close } = await open(t.browser, { width: 1440 });
  const call = await warmUp(page);

  // Quad9 answers DNS over HTTPS only over HTTP/2, which the nodes do not speak: refused up front, with the reason
  const refused = await call("POST", "/measurements", { target: "example.com", kind: "dns", resolver: "quad9", transport: "doh", dns_mode: "regional" });
  if (refused?.error?.code !== "invalid_option" || !/HTTP\/2/.test(refused.error.message)) {
    t.note("skipped: this backend has no DNS over HTTPS (it needs a version newer than 0.5.1)");
    await close();
    return;
  }
  const own = await call("POST", "/measurements", { target: "example.com", kind: "dns", transport: "doh", dns_mode: "regional" });
  t.eq(own?.error?.code, "invalid_option", "a node's own resolver cannot be asked over HTTPS");

  const id = await measure(call, page, { target: "example.com", kind: "dns", resolver: "cloudflare", transport: "doh", record_type: "A", dns_mode: "regional" }, 60);
  const done = await call("GET", "/measurements/" + id);
  t.eq(done.options.transport, "doh", "the measurement should remember the transport");
  t.ok(done.tasks.some((task) => task.samples[0]?.dns?.transport === "doh"), "a node should report that it asked over HTTPS");

  await page.goto(`${BASE}/measurements/${id}`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
  const text = await page.locator("main").innerText();
  t.ok(/over HTTPS \(DoH\)/.test(text), "the page should say the question went over HTTPS");
  await page.locator("tbody tr").first().click();
  await page.waitForTimeout(300);
  t.ok(/from 1\.1\.1\.1\s+over HTTPS/i.test(await page.locator("main").innerText()), "an expanded row should flag the HTTPS transport");

  // the form offers the transport only where it can be used
  const offered = async (query) => {
    await page.goto(`${BASE}/?kind=dns${query}`);
    await page.waitForLoadState("networkidle");
    return (await page.getByText("Transport", { exact: true }).count()) > 0;
  };
  t.ok(await offered("&resolver=cloudflare"), "Cloudflare can be asked over HTTPS");
  t.ok(await offered("&resolver=google"), "Google can be asked over HTTPS");
  t.ok(!(await offered("&resolver=quad9")), "Quad9 cannot (HTTP/2 only), so the form must not offer it");
  t.ok(!(await offered("&resolver=system")), "a node's own resolver cannot");
  t.ok(errors.length === 0, `console errors ${JSON.stringify(errors)}`);
  await close();
}
