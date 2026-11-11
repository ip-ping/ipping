// When no online node offers the chosen kind, the form says so, and says why a node can lack a kind (it is older, or its host does not
// allow it) instead of blaming age alone: a node with only CAP_NET_RAW used to ping and never offer traceroute, and the page then called
// it "older". The nodes are the fleet's, with every kind but ping taken away from the list the page receives.
import { BASE, noOverflow, open, screenshot } from "./lib.mjs";

export default async function check(t) {
  const { page, close, errors } = await open(t.browser, { width: 1280 });
  await page.route("**/api/v1/nodes", async (route) => {
    const response = await route.fetch();
    const nodes = await response.json();
    await route.fulfill({ response, json: nodes.map((n) => ({ ...n, kinds: n.kinds.filter((k) => k === "ping") })) });
  });
  await page.goto(BASE + "/");
  await page.waitForLoadState("networkidle");
  await page.getByRole("tab", { name: "Traceroute" }).click();
  const alert = page.getByRole("alert").filter({ hasText: "No online node can run Traceroute" });
  await alert.waitFor({ timeout: 10000 });
  const text = (await alert.innerText()).replace(/\s+/g, " ");
  t.ok(/host does not allow it/.test(text) && /older than that check needs/.test(text), `the alert gives both reasons (${text})`);
  t.ok(!/older and only know ping/.test(text), "and no longer says the nodes are older and only know ping");
  t.ok(await page.locator("form button[type=submit]").isDisabled(), "the button is off while no node can run it");
  await screenshot(page, "no-capable-node");
  await noOverflow(t, page, "the alert");

  // Ping is still offered by every node: no alert
  await page.getByRole("tab", { name: "Ping", exact: true }).click();
  t.eq(await page.getByRole("alert").filter({ hasText: "No online node can run" }).count(), 0, "no alert for ping, which the nodes offer");

  // In German, from the remembered choice
  await page.evaluate(() => localStorage.setItem("ipping.language", "de"));
  await page.reload();
  await page.waitForFunction(() => document.documentElement.lang === "de", null, { timeout: 10000 });
  await page.getByRole("tab", { name: "Traceroute" }).click();
  const german = page.getByRole("alert").filter({ hasText: "Keiner der Online-Knoten bietet" });
  await german.waitFor({ timeout: 10000 });
  t.ok(/Host sie nicht erlaubt/.test(await german.innerText()), "the German text gives the reason too");
  await page.evaluate(() => localStorage.removeItem("ipping.language"));
  t.ok(errors.length === 0, `the console is clean (${errors.join(" | ")})`);
  await close();
}
