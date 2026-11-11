// Who resolves a hostname: each node by default (example.org, which the simulated fleet treats as geo-DNS, a server in
// Singapore for the nodes in the east and one in Frankfurt for the rest, is then measured at two addresses, and the
// location estimate is made per address), or one node chosen in the form, whose answer every node then probes.
// Needs a backend with `resolve_node_id` (0.9.0 or newer); against an older one it says so and stops.
import { BASE, measure, open, screenshot, warmUp } from "./lib.mjs";

const NAME = "example.org";

export default async function check(t) {
  const { page, errors, close } = await open(t.browser, { width: 1440 });
  const call = await warmUp(page);

  const nodes = await call("GET", "/nodes");
  const tokyo = nodes.find((n) => n.online && n.name === "Tokyo" && n.kinds.includes("dns"));
  if (!tokyo) throw new Error("the simulated fleet has no online Tokyo node that can ask DNS questions");
  const refused = await call("POST", "/measurements", { target: NAME, kind: "ping", dns_mode: "regional", resolve_node_id: tokyo.id });
  if (refused?.error?.code !== "invalid_option") {
    t.note("skipped: this backend cannot choose the node that resolves a name (it needs 0.9.0 or newer)");
    await close();
    return;
  }

  // 1. The default: every node is sent the name and probes what it gets
  const each = await call("POST", "/measurements", { target: NAME, kind: "ping", count: 3 });
  t.eq(each.dns_mode, "regional", "each node should resolve the name unless asked otherwise");
  t.ok(each.resolved_by === null && each.target.ip === null, "nobody resolved it for the others");
  for (let i = 0; i < 90 && (await call("GET", "/measurements/" + each.id)).status === "running"; i++) await page.waitForTimeout(1000);
  const eachDone = await call("GET", "/measurements/" + each.id);
  const addresses = new Set(eachDone.tasks.map((task) => task.tested_ip).filter(Boolean));
  t.eq([...addresses].sort().join(), "104.18.1.10,151.101.1.77", "the nodes should have measured two addresses");

  // The estimate is made for the address most nodes measured, and says what the others measured
  const estimate = await call("GET", `/measurements/${each.id}/location`);
  t.eq(estimate.groups.length, 2, "the estimate should list both addresses");
  t.eq(estimate.target_ip, "104.18.1.10", "the estimate should be for the address most nodes measured");
  const east = await call("GET", `/measurements/${each.id}/location?ip=151.101.1.77`);
  t.eq(east.target_ip, "151.101.1.77", "another address can be asked for");

  await call("POST", `/measurements/${each.id}/share`, { shared: true });
  await page.goto(`${BASE}/measurements/${each.id}`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
  const body = await page.locator("main").innerText();
  t.ok(/each node resolves the name itself/.test(body), "the page should say each node resolved the name");
  t.ok(/resolved the name to 2 different addresses/.test(body), "the location panel should say there are two addresses");
  t.ok((await page.getByRole("button", { name: /151\.101\.1\.77/ }).count()) > 0, "the other address should be offered");
  await page.getByRole("button", { name: /151\.101\.1\.77/ }).first().click();
  await page.waitForTimeout(1200);
  t.ok(/The rings and the estimate are for\s+151\.101\.1\.77/.test(await page.locator("main").innerText()), "choosing the address should move the estimate to it");
  await screenshot(page, "name-resolution-each");

  // 2. One node resolves it: through the form
  await page.goto(BASE + "/");
  await page.waitForLoadState("networkidle");
  const mode = page.getByRole("combobox").filter({ hasText: "Each node resolves it" });
  t.eq(await mode.count(), 1, "the form should start with each node resolving it");
  t.eq(await page.getByText("Resolving node", { exact: true }).count(), 0, "no node is asked for until one is to resolve it");
  await page.locator("#target").fill(NAME);
  await mode.click();
  await page.getByRole("option", { name: "One node resolves it" }).click();
  await page.getByText("Resolving node", { exact: true }).waitFor();
  const picker = page.getByRole("combobox").filter({ hasText: /·/ }).last();
  await picker.click();
  await page.getByRole("option", { name: /Tokyo, JP/ }).click();
  t.ok(/Tokyo looks the name up/.test(await page.locator("main").innerText()), "the form should say which node looks the name up");
  await screenshot(page, "name-resolution-form");
  await page.getByRole("button", { name: /^Ping/ }).click();
  await page.waitForURL(/\/measurements\//, { timeout: 30000 });
  const id = page.url().split("/").pop();
  for (let i = 0; i < 90 && (await call("GET", "/measurements/" + id)).status === "running"; i++) await page.waitForTimeout(1000);
  const one = await call("GET", "/measurements/" + id);
  t.eq(one.dns_mode, "fixed", "one node resolving it makes it one address for everybody");
  t.eq(one.resolved_by?.name, "Tokyo", "the measurement should say who resolved the name");
  t.eq(one.target.ip, "151.101.1.77", "the address should be the one Tokyo got, not the backend's");
  t.eq([...new Set(one.tasks.map((task) => task.tested_ip))].join(), "151.101.1.77", "every node should have measured it");
  await page.waitForTimeout(1500);
  t.ok(/as resolved by Tokyo/.test(await page.locator("main").innerText()), "the page should say who resolved it");

  // 3. A name that exists nowhere is refused, with the node named, whatever the form did
  const none = await call("POST", "/measurements", { target: "nx-example.com", kind: "ping", dns_mode: "fixed", resolve_node_id: tokyo.id });
  t.eq(none?.error?.code, "dns_failure", "a name the node cannot resolve should be a DNS failure");
  t.ok(/Tokyo/.test(none?.error?.message ?? ""), "the refusal should name the node");

  await measure(call, page, { target: "93.184.216.34", kind: "ping", count: 1, dns_mode: "fixed", resolve_node_id: tokyo.id }); // an address needs no lookup
  t.ok(errors.length === 0, `console errors ${JSON.stringify(errors)}`);
  await close();
}
