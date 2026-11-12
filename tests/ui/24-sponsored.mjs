// Sponsored nodes: an administrator marks a node as sponsored (on the node, below "Run by a volunteer", or on the token it enrolls with)
// and its provider's name stands out wherever the node is shown: the nodes page and its map, the home map, the results table, the
// map and the evidence of a measurement, the node picker, the administrator's own list. Only that node: another node on the same
// provider is plain. A measurement keeps what the node was when it began. Needs a backend newer than 0.14.0; otherwise it says so
// and stops. It marks one of the simulated fleet's nodes and puts it back as it was.
import { BASE, measure, noOverflow, open, screenshot, signIn, warmUp } from "./lib.mjs";

const BADGE = '[data-testid="sponsored-provider"]';
const LONG = "Aktiengesellschaft für Netzwerkinfrastruktur und Rechenzentrumsbetrieb International";

/** A measurement of the administrator's session that anybody with the link can open (a visitor is another session). */
async function shared(call, page, body) {
  const id = await measure(call, page, body);
  await call("POST", `/measurements/${id}/share`, { shared: true });
  return id;
}

/** The badge looks like something: it has a fill of its own, and is as tall as a line of text and a little more. */
async function stands_out(t, locator, where) {
  const look = await locator.first().evaluate((el) => {
    const s = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    return { background: s.backgroundColor, weight: Number(s.fontWeight), height: box.height, star: !!el.querySelector("svg") };
  });
  t.ok(look.background !== "rgba(0, 0, 0, 0)" && look.background !== "transparent", `${where}: the provider should have a fill of its own (${look.background})`);
  t.ok(look.weight >= 500, `${where}: the provider should be heavier than the words around it (${look.weight})`);
  t.ok(look.height >= 16, `${where}: the provider should take the room of a badge (${look.height}px)`);
  t.ok(look.star, `${where}: the provider should carry a star`);
}

/** One part of the check: when it throws (an element that is not there), that is its failure, and the other parts still run. */
async function step(t, name, run) {
  try {
    await run();
  } catch (e) {
    t.ok(false, `${name}: ${String(e.message ?? e).split("\n")[0]}`);
  }
}

/** Focus the one station of the map that is sponsored and read its tooltip. */
async function stationTip(t, page, where) {
  const stations = page.locator('[role="button"][aria-label*="sponsored"]');
  t.eq(await stations.count(), 1, `${where}: exactly one station of the map is sponsored`);
  if ((await stations.count()) === 0) return;
  await stations.first().focus();
  const tip = page.locator('[role="status"]', { has: page.locator(BADGE) });
  await tip.first().waitFor({ timeout: 5000 }).catch(() => {});
  t.eq(await tip.count(), 1, `${where}: the tooltip of the sponsored station should name its provider as a badge`);
}

export default async function check(t) {
  const { page, errors, close } = await open(t.browser, { width: 1440 });
  const call = await warmUp(page);
  const nodes = await call("GET", "/nodes");
  if (!nodes.length || nodes[0].sponsored === undefined) {
    t.note("skipped: this backend does not know sponsored nodes (it needs a backend newer than 0.14.0)");
    await close();
    return;
  }
  // a node whose provider another node shares: the mark is the node's, not the provider's
  const onSharedProvider = (n) => nodes.filter((o) => o.provider === n.provider).length > 1;
  const pick = nodes.find((n) => n.online && n.tier === "official" && n.latitude != null && n.provider && n.city && onSharedProvider(n));
  if (!pick) throw new Error("the simulated fleet has no online official node on a provider that another node shares");
  const others = nodes.filter((n) => n.id !== pick.id && n.provider === pick.provider);

  await signIn(page);
  const admin = async (id) => (await call("GET", "/admin/nodes")).find((n) => n.id === id);
  const original = await admin(pick.id);
  const created = { tokens: [], nodes: [] };
  let completed = false;
  let id, visitor, vp; // the measurement made while the node is sponsored, and a visitor's browser
  try {
    t.ok(original.sponsored === false, "no node of the fleet should be sponsored to begin with");

    // ---- the administrator's dialog: the option is below "Run by a volunteer", sends only itself, and the list shows the mark
    await step(t, "the administrator's dialog", async () => {
    await page.getByRole("tab", { name: "Nodes" }).click();
    const row = page.locator("tbody tr", { hasText: original.name }).first();
    await row.waitFor();
    await row.getByRole("button", { name: "Edit" }).click();
    const dialog = page.getByRole("dialog");
    const volunteer = await dialog.getByText("Run by a volunteer (community node)").boundingBox();
    const sponsorSwitch = dialog.getByRole("switch", { name: /Sponsored/ });
    const option = await dialog.getByText("Sponsored", { exact: true }).boundingBox();
    t.ok(volunteer && option && option.y > volunteer.y, "the Sponsored option should sit below Run by a volunteer");
    t.eq(await sponsorSwitch.getAttribute("aria-checked"), "false", "the Sponsored option should start off for a node that is not sponsored");
    await sponsorSwitch.click();
    t.ok(new RegExp(`provider's name \\(${original.provider}\\) stands out`).test(await dialog.innerText()), "the dialog should say whose name will stand out");
    const [request] = await Promise.all([
      page.waitForRequest((r) => r.method() === "PATCH" && r.url().includes("/admin/nodes/")),
      dialog.getByRole("button", { name: "Save" }).click(),
    ]);
    t.eq(JSON.stringify(Object.keys(JSON.parse(request.postData()))), JSON.stringify(["sponsored"]), "only the flag should be sent");
    await page.waitForTimeout(800);
    t.eq((await admin(pick.id)).sponsored, true, "the node should now be sponsored");
    t.eq((await admin(pick.id)).tier, "official", "and still official: it is not the same thing as a volunteer");
    const mark = page.locator("tbody tr", { hasText: original.name }).first().getByTestId("sponsor-mark");
    t.ok((await mark.innerText()).includes(original.provider), "the administrator's list should show the provider that stands out");
    await screenshot(page, "sponsored-admin-list");
    });
    // the rest needs the flag on, whatever the dialog did
    await call("PATCH", `/admin/nodes/${pick.id}`, { sponsored: true });

    visitor = await open(t.browser, { width: 1440 });
    vp = visitor.page;

    // ---- the nodes page and its map
    await step(t, "the nodes page", async () => {
    await vp.goto(`${BASE}/nodes`);
    await vp.waitForLoadState("networkidle");
    await vp.locator("li", { hasText: pick.city }).first().waitFor();
    t.eq(await vp.locator(`li ${BADGE}`).count(), 1, "the nodes page should make one provider stand out");
    t.ok((await vp.locator("li", { has: vp.locator(BADGE) }).first().innerText()).includes(pick.city), "and it should be the sponsored node's");
    t.eq(await vp.locator("li", { hasText: others[0].city }).first().locator(BADGE).count(), 0, "another node on the same provider is plain");
    await stands_out(t, vp.locator(`li ${BADGE}`), "nodes page");
    await stationTip(t, vp, "nodes page map");
    await screenshot(vp, "sponsored-nodes-page");
    });

    // ---- the home page's map
    await step(t, "the home page's map", async () => {
    await vp.goto(`${BASE}/?kind=ping`);
    await vp.waitForLoadState("networkidle");
    await vp.waitForTimeout(500);
    await stationTip(t, vp, "home map");
    });

    // ---- the node picker of the form
    await step(t, "the node picker", async () => {
    await vp.goto(`${BASE}/?kind=ping`);
    await vp.waitForLoadState("networkidle");
    await vp.getByRole("combobox").filter({ hasText: /All online nodes/ }).first().click();
    await vp.getByRole("option", { name: /Selected/ }).click();
    const picker = vp.getByRole("dialog");
    await picker.waitFor();
    t.eq(await picker.locator(BADGE).count(), 1, "the list of nodes to choose from should make the provider stand out");
    await screenshot(vp, "sponsored-picker");
    await vp.keyboard.press("Escape");
    });

    // ---- a measurement: the results table, the map, the evidence of the estimate
    id = await shared(call, page, { target: "example.com:443", kind: "tcp", count: 2 });
    await step(t, "the measurement page", async () => {
      await vp.goto(`${BASE}/measurements/${id}`);
      await vp.waitForLoadState("networkidle");
      await vp.locator("tbody tr").first().waitFor();
      await vp.waitForTimeout(900);
    });
    await step(t, "the results table", async () => {
      const rows = vp.locator("tbody tr", { has: vp.locator(BADGE) });
      t.eq(await rows.count(), 1, "the results table should make one provider stand out");
      t.ok((await rows.first().innerText()).includes(pick.city), "in the row of the sponsored node");
      await stands_out(t, rows.first().locator(BADGE), "results table");
    });
    await step(t, "the map of the measurement", async () => {
      await stationTip(t, vp, "measurement map");
    });
    await step(t, "the evidence of the location estimate", async () => {
      await vp.getByText("Estimated network location").waitFor({ timeout: 15000 });
      const summary = vp.getByText(/Measurements used/);
      if (await summary.count()) await summary.first().click();
      const evidence = vp.locator("[data-slot=accordion-content] table").first();
      // in the Provider / ASN column (the same words are also under the name on a phone, where they are not shown at this width)
      t.ok((await evidence.locator(`td ${BADGE}:visible`).count()) > 0, "the evidence of the location estimate should make the provider stand out");
      await screenshot(vp, "sponsored-measurement");
    });

    // ---- the tooltips of the charts: the strip of round trips (tcp) and the waterfall of an HTTP request
    const where = `${pick.city}, ${pick.country}`;
    const chartTip = (page) => page.locator('div[aria-hidden="true"]', { has: page.locator(BADGE) });
    await step(t, "the chart of round trips", async () => {
      const row = vp.locator(`svg g[role="img"][aria-label^="${where}:"]`).first();
      await row.hover(); // the pointer is put on the row, so that what lies under a pointer left elsewhere cannot take the tooltip
      await chartTip(vp).first().waitFor({ timeout: 5000 }).catch(() => {});
      t.eq(await chartTip(vp).count(), 1, "the tooltip of the round-trip chart should name the sponsored provider as a badge");
    });
    await step(t, "the chart of an HTTP request", async () => {
      const web = await shared(call, page, { target: "https://example.com/", kind: "http" });
      await vp.goto(`${BASE}/measurements/${web}`);
      await vp.waitForLoadState("networkidle");
      await vp.locator("tbody tr").first().waitFor();
      await vp.waitForTimeout(900);
      const row = vp.locator(`svg g[role="img"][aria-label^="${where}:"]`).first();
      await row.hover(); // the pointer is put on the row, so that what lies under a pointer left elsewhere cannot take the tooltip
      await chartTip(vp).first().waitFor({ timeout: 5000 }).catch(() => {});
      t.eq(await chartTip(vp).count(), 1, "the tooltip of the HTTP chart should name the sponsored provider as a badge");
    });

    // ---- where only text fits: the list of nodes that can resolve a name
    await step(t, "the list of resolving nodes", async () => {
      await vp.goto(`${BASE}/?kind=ping`);
      await vp.waitForLoadState("networkidle");
      await vp.getByRole("combobox").filter({ hasText: "Each node resolves it" }).click();
      await vp.getByRole("option", { name: "One node resolves it" }).click();
      await vp.getByText("Resolving node", { exact: true }).waitFor();
      await vp.getByRole("combobox").filter({ hasText: /·/ }).last().click();
      await vp.getByRole("option").first().waitFor(); // the list takes a moment to open
      const options = await vp.getByRole("option").allInnerTexts();
      const starred = options.filter((o) => o.includes("★"));
      t.eq(starred.length, 1, `one node of the list should be starred (${JSON.stringify(options.slice(0, 3))}...)`);
      t.ok(starred[0]?.includes(`★ ${original.provider}`), `and it is the sponsored provider (${starred[0]})`);
      await vp.keyboard.press("Escape");
    });

    // ---- a phone: the detail of a row, with a long name for the provider (it must wrap or shorten, not push the page sideways)
    await call("PATCH", `/admin/nodes/${pick.id}`, { provider: LONG });
    const phone = await open(t.browser, { width: 390 });
    const pp = phone.page;
    await step(t, "a phone", async () => {
    await pp.goto(`${BASE}/nodes`);
    await pp.waitForLoadState("networkidle");
    await pp.locator("li", { hasText: pick.city }).first().waitFor();
    await noOverflow(t, pp, "a phone, the nodes page with a long provider");
    await pp.goto(`${BASE}/measurements/${id}`); // this measurement keeps the short name it began with
    await pp.waitForLoadState("networkidle");
    await pp.locator("tbody tr", { has: pp.locator(BADGE) }).first().click();
    await pp.waitForTimeout(500);
    const detail = pp.locator("tbody tr").filter({ hasText: "Tested" }).first();
    t.ok((await detail.locator(BADGE).count()) >= 1, "the line under an opened row (the phone's one) should make the provider stand out");
    await noOverflow(t, pp, "a phone, an opened row");
    const later = await shared(call, page, { target: "example.com:443", kind: "tcp", count: 2 });
    await pp.goto(`${BASE}/measurements/${later}`);
    await pp.waitForLoadState("networkidle");
    await pp.locator("tbody tr").first().waitFor();
    await pp.waitForTimeout(600);
    t.ok((await pp.locator("tbody tr", { has: pp.locator(BADGE) }).first().innerText()).includes("Aktiengesellschaft"), "a measurement begun after the change shows the node as it is then");
    await noOverflow(t, pp, "a phone, a measurement with a long provider");
    await screenshot(pp, "sponsored-phone");
    });
    await phone.close();
    await call("PATCH", `/admin/nodes/${pick.id}`, { provider: original.provider });

    // ---- the flag is off again: the pages follow, and the first measurement still says what it said
    await call("PATCH", `/admin/nodes/${pick.id}`, { sponsored: false });
    await step(t, "the flag turned off", async () => {
    await vp.goto(`${BASE}/nodes`);
    await vp.waitForLoadState("networkidle");
    await vp.locator("li", { hasText: pick.city }).first().waitFor();
    t.eq(await vp.locator(`li ${BADGE}`).count(), 0, "with the flag off the nodes page makes nothing stand out");
    await vp.goto(`${BASE}/measurements/${id}`);
    await vp.waitForLoadState("networkidle");
    await vp.locator("tbody tr").first().waitFor();
    t.eq(await vp.locator("tbody tr", { has: vp.locator(BADGE) }).count(), 1, "a measurement made while the node was sponsored keeps saying so");
    const unmarked = await shared(call, page, { target: "example.com:443", kind: "tcp", count: 2 });
    await vp.goto(`${BASE}/measurements/${unmarked}`);
    await vp.waitForLoadState("networkidle");
    await vp.locator("tbody tr").first().waitFor();
    t.eq(await vp.locator(BADGE).count(), 0, "a measurement made after it says nothing of it");
    });
    await visitor.close();

    // ---- the token: the option is below "For a volunteer's node", says what it does, and a node that enrolls with the token is sponsored
    await step(t, "the token", async () => {
    await page.goto(`${BASE}/admin`);
    await page.getByRole("tab", { name: /Enrollment/ }).click();
    await page.getByRole("checkbox", { name: /For a volunteer/ }).waitFor();
    const volunteerBox = await page.getByText(/For a volunteer/).boundingBox();
    const sponsoredBox = await page.getByText(/Sponsored \(its provider/).boundingBox();
    t.ok(volunteerBox && sponsoredBox && (sponsoredBox.y > volunteerBox.y || sponsoredBox.x > volunteerBox.x), "the token form should offer Sponsored after For a volunteer's node");
    await page.getByRole("checkbox", { name: /Sponsored/ }).click();
    t.ok(/provider is named wherever the node is shown/.test(await page.locator("main").innerText()), "the token form should say what a sponsored node is");
    await page.locator("#token-label").fill("sponsored-check-ui");
    await page.getByRole("button", { name: /Create enrollment token/ }).click();
    await page.waitForTimeout(800);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    const labelled = page.locator("tbody tr", { hasText: "sponsored-check-ui" }).first();
    t.ok(/us, sponsored/.test(await labelled.innerText()), "the token list should say that the token is for a sponsored node");
    for (const token of await call("GET", "/admin/enrollment-tokens")) if (token.label?.startsWith("sponsored-check")) created.tokens.push(token.id);

    const made = await call("POST", "/admin/enrollment-tokens", { label: "sponsored-check-api", ttl_minutes: 5, sponsored: true });
    if (made?.id) created.tokens.push(made.id);
    const enrolled = await call("POST", "/nodes/enroll", { token: made.token, name: "Sponsored check node", version: "0.8.2", country: "NL", city: "Utrecht", provider: "Check Hosting BV" });
    t.ok(!!enrolled?.node_id, `the node should enroll with the token (${JSON.stringify(enrolled)})`);
    if (enrolled?.node_id) created.nodes.push(enrolled.node_id);
    t.eq((await admin(enrolled.node_id))?.sponsored, true, "a node that enrolls with a sponsored token is sponsored");
    t.eq((await admin(enrolled.node_id))?.tier, "official", "and official, as the token was");
    await page.getByRole("tab", { name: "Nodes" }).click();
    const fresh = page.locator("tbody tr", { hasText: "Sponsored check node" }).first();
    await fresh.waitFor();
    t.ok((await fresh.getByTestId("sponsor-mark").innerText()).includes("Check Hosting BV"), "the administrator's list should show the new node's provider as the one that stands out");
    });
    completed = true;
  } finally {
    // put the fleet back as it was found
    await call("PATCH", `/admin/nodes/${pick.id}`, { sponsored: false, provider: original.provider }).catch(() => {});
    for (const id of created.nodes) await call("POST", `/admin/nodes/${id}/revoke`).catch(() => {});
    for (const id of created.tokens) await call("DELETE", `/admin/enrollment-tokens/${id}`).catch(() => {});
    const now = (await call("GET", "/admin/nodes")).find((n) => n.id === pick.id);
    t.ok(now && now.sponsored === false && now.provider === original.provider, "the fleet should be left as it was found");
  }
  t.ok(completed, "the whole check should have run");
  t.ok(errors.length === 0, `console errors ${JSON.stringify(errors)}`);
  await close();
}
