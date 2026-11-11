// Nodes without a name (called after their place and network), the places that need no name because the place and the
// network are shown, enrollment keys that can be reused, a revoked node that is gone, no way to rotate a key, no Admin link in
// the header, and result numbers on the map. Needs a backend with reusable keys and default names (0.10 or newer); it stops with
// a note otherwise.
import { BASE, WIDTHS, measure, noOverflow, open, screenshot, signIn, warmUp } from "./lib.mjs";

export default async function check(t) {
  const admin = await open(t.browser, { width: 1280 });
  await signIn(admin.page);
  const raw = (method, path, body) =>
    admin.page.evaluate(
      async ([m, p, b]) => {
        const s = await (await fetch("/api/v1/session")).json();
        const r = await fetch("/api/v1" + p, { method: m, headers: { "Content-Type": "application/json", "X-CSRF-Token": s.csrf_token }, body: b ? JSON.stringify(b) : undefined });
        const text = await r.text();
        return { status: r.status, body: text ? JSON.parse(text) : null };
      },
      [method, path, body],
    );
  const created = await raw("POST", "/admin/enrollment-tokens", { label: "UI check reusable", reusable: true, ttl_minutes: 30 });
  if (created.status !== 201) {
    t.note("skipped: this backend cannot make a reusable enrollment key (it needs 0.10 or newer)");
    await admin.close();
    return;
  }
  const enroll = (details) =>
    admin.page.evaluate(
      async ([token, d]) => {
        const x = await fetch("/api/v1/nodes/enroll", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, version: "0.8.0", ...d }) });
        return { status: x.status, body: await x.json() };
      },
      [created.body.token, details],
    );
  const nodeIds = [];
  try {
    // 1. One reusable key enrolls many nodes, and none of them needs a name
    const a = await enroll({ country: "AU", city: "Sydney", provider: "OVH SAS", asn: 16276 });
    const b = await enroll({ name: "", country: "DE", city: "Falkenstein" });
    t.eq(a.status, 201, "the first enrollment should work");
    t.eq(b.status, 201, "and so should a second one with the same key");
    nodeIds.push(a.body.node_id, b.body.node_id);
    const listed = (await raw("GET", "/admin/nodes")).body;
    const byId = Object.fromEntries(listed.map((n) => [n.id, n]));
    t.eq(byId[a.body.node_id]?.name, "Sydney, AU - OVH SAS · AS16276", "a node with no name is called after its place and network");
    t.eq(byId[b.body.node_id]?.name, "Falkenstein, DE", "and after its place alone when its network is not known yet");

    // 2. The admin page: the key says it is reusable, the node has its default name, no rotate button, a revoked node leaves
    await admin.page.goto(BASE + "/admin");
    await admin.page.getByRole("tab", { name: "Enrollment" }).click();
    await admin.page.getByText("Reusable (many nodes can enroll with it)").waitFor();
    await admin.page.getByText(/reusable · 2 nodes enrolled/).first().waitFor({ timeout: 10000 }); // (an earlier run's key may still be listed)
    await admin.page.getByRole("tab", { name: "Nodes" }).click();
    await admin.page.getByText("Sydney, AU - OVH SAS · AS16276").first().waitFor({ timeout: 10000 });
    t.eq(await admin.page.getByRole("button", { name: "Rotate key" }).count(), 0, "there is no way to rotate a node's key any more");
    await screenshot(admin.page, "admin-nodes-default-names");
    t.eq((await raw("POST", `/admin/nodes/${a.body.node_id}/rotate-credential`)).status, 404, "the backend has no rotation either");
    const revoked = await raw("POST", `/admin/nodes/${b.body.node_id}/revoke`);
    t.eq(revoked.status, 200, "revoking should work");
    t.ok(!(await raw("GET", "/admin/nodes")).body.some((n) => n.id === b.body.node_id), "a revoked node should be gone from the list");
    await admin.page.reload();
    await admin.page.getByRole("tab", { name: "Nodes" }).click();
    await admin.page.getByText("Sydney, AU - OVH SAS · AS16276").first().waitFor({ timeout: 10000 });
    t.eq(await admin.page.getByText("Falkenstein, DE").count(), 0, "and it should not come back on the page");
    // the edit dialog asks for no name, and shows what the node is called instead
    await admin.page.locator("tr", { hasText: "Sydney, AU - OVH SAS" }).getByRole("button", { name: "Edit" }).first().click();
    const name = admin.page.getByLabel("Name (optional)");
    await name.waitFor();
    t.eq(await name.inputValue(), "", "a node with no name has an empty name field");
    t.ok(/Sydney, AU/.test((await name.getAttribute("placeholder")) ?? ""), "which shows what it is called instead");
    await admin.page.keyboard.press("Escape");
  } finally {
    for (const id of nodeIds) await raw("POST", `/admin/nodes/${id}/revoke`);
    const mine = ((await raw("GET", "/admin/enrollment-tokens")).body ?? []).filter((x) => x.label === "UI check reusable");
    for (const x of mine) await raw("DELETE", `/admin/enrollment-tokens/${x.id}`);
  }

  // 3. No Admin link in the header; the page is still there at its address
  const { page, errors, close } = await open(t.browser, { width: 1440 });
  const call = await warmUp(page);
  // (the header's buttons are links in the page: `a` elements, whatever role they are given)
  t.eq(await page.locator("header a", { hasText: "Admin" }).count(), 0, "the header should not link to the administration page");
  t.ok((await page.locator("header a", { hasText: "Nodes" }).count()) > 0, "but the nodes are linked");
  t.eq((await page.goto(BASE + "/admin"))?.status(), 200, "the page is still there at its own address");

  // 4. Results: the place with the network beneath it, no name, and no node list in a certificate card
  const ping = await measure(call, page, { target: "93.184.216.34", kind: "ping", count: 3, dns_mode: "fixed" });
  await page.goto(`${BASE}/measurements/${ping}`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
  const header = await page.locator("#nodes thead").innerText();
  t.ok(!/Region/.test(header) && !/Provider/.test(header), "the results table has one column for the node, not a name, a region and a provider");
  const first = await page.locator("#nodes tbody tr").first().innerText();
  t.ok(
    /[A-Z][a-z]+, [A-Z]{2}/.test(first) && /Vultr|Hetzner|OVH|DigitalOcean|Linode|Contabo|Equinix|Bahnhof|Afrihost/.test(first),
    `a node is shown by its place with its network beneath (${first.replace(/\s+/g, " ").slice(0, 100)})`,
  );
  const tls = await measure(call, page, { target: "example.com", kind: "tls", dns_mode: "fixed" });
  await page.goto(`${BASE}/measurements/${tls}`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
  t.ok((await page.getByText(/Seen by \d+ nodes?/).count()) > 0, "a certificate card says how many nodes saw it");
  t.eq(await page.getByLabel("Nodes that were shown this certificate").count(), 0, "and does not list them");

  // 5. Result numbers on the map: beside the stations on a wide screen, none on a phone
  await page.goto(`${BASE}/measurements/${ping}`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
  const numbers = await page.locator("#map figure svg text.tabular-nums").evaluateAll((els) => els.map((e) => e.textContent ?? ""));
  t.ok(numbers.length >= 4 && numbers.every((n) => /^\d+(\.\d)?$/.test(n)), `numbers should stand beside the stations (${numbers.join(" ")})`);
  await screenshot(page, "map-results");
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
    await page.goto(`${BASE}/measurements/${ping}`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(800);
    const shown = await page.locator("#map figure svg g.max-sm\\:hidden").evaluate((g) => getComputedStyle(g).display !== "none");
    t.eq(shown, width >= 640, `the numbers on the map at ${width}px`);
    await noOverflow(t, page, `results at ${width}`);
  }
  t.ok(errors.length === 0 && admin.errors.length === 0, `console errors ${JSON.stringify([...errors, ...admin.errors])}`);
  await close();
  await admin.close();
}
