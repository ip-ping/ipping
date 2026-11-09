// Community nodes: a volunteer's node is left out of "all nodes", is marked wherever it is named, can be asked for, cannot
// move a location estimate, and an administrator can enrol one and audit its declared place. Needs a backend newer than
// 0.5.1 and the simulated fleet's volunteer node ("Lisbon", enrolled as a community node); otherwise it says so and stops.
import { BASE, measure, open, signIn, warmUp } from "./lib.mjs";

export default async function check(t) {
  const { page, errors, close } = await open(t.browser, { width: 1440 });
  const call = await warmUp(page);
  const nodes = await call("GET", "/nodes");
  const volunteer = nodes.find((n) => n.tier === "community");
  if (!volunteer) {
    t.note("skipped: this stack has no community node (it needs a backend newer than 0.5.1 and the simulated fleet's volunteer)");
    await close();
    return;
  }
  const officials = nodes.filter((n) => n.tier !== "community" && n.online).length;

  // "all nodes" means the official ones; asking for community nodes adds them
  const plain = await call("GET", "/measurements/" + (await measure(call, page, { target: "1.1.1.1", kind: "ping", count: 2 })));
  t.eq(plain.tasks.length, officials, "all nodes should mean the official ones");
  t.ok(plain.tasks.every((task) => task.node.tier === "official"), "no volunteer in a default measurement");
  const withVolunteers = await measure(call, page, { target: "1.1.1.1", kind: "ping", count: 2, include_community: true });
  const done = await call("GET", "/measurements/" + withVolunteers);
  t.eq(done.tasks.length, officials + 1, "asking for community nodes should add the volunteer");
  t.ok(done.tasks.some((task) => task.node.id === volunteer.id && task.node.tier === "community"), "the volunteer is in, marked as community");

  // it is marked where it is named, and it does not take part in the location estimate
  await page.goto(`${BASE}/measurements/${withVolunteers}`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(900);
  const row = page.locator("tbody tr", { hasText: volunteer.name }).first();
  t.ok((await row.getByText("community", { exact: true }).count()) > 0, "the results table should mark the volunteer's node");
  const tcp = await measure(call, page, { target: "example.com:443", kind: "tcp", count: 2, include_community: true });
  const estimate = await call("GET", `/measurements/${tcp}/location`);
  t.ok(!(estimate.evidence ?? []).some((e) => e.node_id === volunteer.id), "an unverified volunteer must not be evidence for a location estimate");

  // the node list and the form
  await page.goto(`${BASE}/nodes`);
  await page.waitForLoadState("networkidle");
  const listed = page.locator("li", { hasText: volunteer.name }).first();
  t.ok((await listed.getByText("community", { exact: true }).count()) > 0, "the nodes page should mark the volunteer's node");
  await page.goto(`${BASE}/?kind=ping`);
  await page.waitForLoadState("networkidle");
  t.ok((await page.getByText(/Include community nodes/).count()) > 0, "the form should offer community nodes when one is online");

  // an administrator: a token for a volunteer, the node's tier, and the audit of its declared place
  await signIn(page);
  await page.getByRole("tab", { name: /Enrollment/ }).click();
  await page.getByRole("checkbox", { name: /For a volunteer/ }).click();
  t.ok(/left out of measurements unless a visitor asks/.test(await page.locator("main").innerText()), "the token form should say what a community node is");
  await page.getByRole("button", { name: /Create enrollment token/ }).click();
  await page.waitForTimeout(800);
  await page.keyboard.press("Escape");
  t.ok(/a volunteer/.test(await page.locator("main").innerText()), "the token list should say who the token is for");
  await page.waitForTimeout(500); // the dialog closes
  await page.getByRole("tab", { name: "Nodes" }).click();
  await page.getByRole("button", { name: "Check location" }).first().waitFor();
  const adminRow = page.locator("tbody tr", { hasText: volunteer.name }).first();
  await adminRow.waitFor();
  t.ok((await adminRow.getByText("community", { exact: true }).count()) > 0, "the admin list should mark the volunteer's node");
  await adminRow.getByRole("button", { name: "Check location" }).click();
  await page.waitForTimeout(2500);
  const audit = await page.locator("tbody tr", { hasText: volunteer.name }).first().getByTestId("location-audit").first().innerText();
  t.ok(/inconclusive|consistent|inconsistent/i.test(audit), `an audit result should be shown: ${audit}`);
  t.ok(errors.length === 0, `console errors ${JSON.stringify(errors)}`);
  await close();
}
