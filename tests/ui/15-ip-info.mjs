// IP info from ipping's own IP databases: what each measurement says about the addresses its nodes tested (it belongs to the
// measurement, so a visitor who can see the measurement sees it), and the form's "IP info" option, which looks an address up and
// measures nothing and follows the lookup's access setting (API keys only by default): the check sets it, looks as a stranger
// would, and puts it back.
// Needs a backend with the lookup API (0.8 or newer) and IP databases installed; it stops with a note otherwise.
import { BASE, apiFor, measure, noOverflow, open, screenshot, signIn } from "./lib.mjs";

export default async function check(t) {
  const admin = await open(t.browser, { width: 1280 });
  await signIn(admin.page);
  const raw = async (method, path, body) =>
    admin.page.evaluate(
      async ([m, p, b]) => {
        const s = await (await fetch("/api/v1/session")).json();
        const r = await fetch("/api/v1" + p, { method: m, headers: { "Content-Type": "application/json", "X-CSRF-Token": s.csrf_token }, body: b ? JSON.stringify(b) : undefined });
        const text = await r.text();
        return { status: r.status, body: text ? JSON.parse(text) : null };
      },
      [method, path, body],
    );
  const before = await raw("GET", "/admin/ip-data");
  if (before.status !== 200 || !before.body.databases_loaded) {
    t.note("skipped: this backend has no IP lookup, or no IP database is installed");
    await admin.close();
    return;
  }
  const original = before.body.lookup;

  const stranger = await open(t.browser, { width: 1440 });
  try {
    await stranger.page.goto(BASE + "/");
    const call = apiFor(stranger.page);
    await call("GET", "/session");

    // 1. By default a stranger may not use the standalone lookup, but what the databases say about the address of a
    //    measurement they can see is part of that measurement (the target card): it shows, and the option says why it is closed
    await raw("PUT", "/admin/ip-data", { lookup_enabled: true, lookup_access: "api_key" });
    const id = await measure(call, stranger.page, { target: "93.184.216.34", kind: "ping", count: 1, dns_mode: "fixed" });
    await stranger.page.goto(`${BASE}/measurements/${id}`);
    await stranger.page.waitForLoadState("networkidle");
    await stranger.page.waitForTimeout(1500);
    await stranger.page.getByTestId("target-card").waitFor({ timeout: 15000 });
    t.eq(await stranger.page.getByText("Tested addresses").count(), 0, "one address is on the target card: no table repeating it");
    t.ok(/93\.184\.216\.34/.test(await stranger.page.getByTestId("target-card").innerText()), "the target card should show the address");
    const place = await stranger.page.getByTestId("target-place").innerText();
    t.ok(/\d+%/.test(await stranger.page.getByTestId("target-card").getByTestId("confidence").first().innerText()) || /\d+%/.test(place), "the target card should say how sure the place is");
    await stranger.page.getByTestId("target-card").getByRole("button", { name: "All fields and sources" }).click();
    await stranger.page.getByTestId("target-card").getByTestId("ip-info-details").waitFor();
    t.ok((await stranger.page.getByTestId("target-card").getByTestId("confidence").count()) >= 4, "the details of the target card should have a percentage for each field");
    await stranger.page.goto(`${BASE}/?kind=ip`);
    await stranger.page.waitForLoadState("networkidle");
    await stranger.page.locator("#ip-address").fill("8.8.8.8");
    await stranger.page.getByRole("button", { name: "Look up" }).click();
    await stranger.page.getByText("No answer").waitFor({ timeout: 10000 });
    t.ok(/API keys and administrators/.test(await stranger.page.locator("main").innerText()), "the option should say who may use the lookup");

    // 2. Opened to everyone, the option answers too, and a name each node resolved for itself gets a row for each address
    await raw("PUT", "/admin/ip-data", { lookup_enabled: true, lookup_access: "public" });
    const geo = await measure(call, stranger.page, { target: "example.org", kind: "ping", count: 1, dns_mode: "regional" });
    await stranger.page.goto(`${BASE}/measurements/${geo}`);
    await stranger.page.waitForLoadState("networkidle");
    await stranger.page.getByText("Tested addresses").waitFor({ timeout: 15000 });
    const panel = stranger.page.locator("[data-slot=card]").filter({ hasText: "Tested addresses" });
    await panel.locator("tbody tr").first().waitFor();
    await stranger.page.waitForTimeout(1500);
    const rows = await panel.locator("tbody tr").count();
    t.eq(rows, 2, "each node resolved the name itself, to two addresses: a row for each");
    const text = await panel.innerText();
    t.ok(/104\.18\.1\.10/.test(text) && /151\.101\.1\.77/.test(text), "both tested addresses should be listed");
    t.ok(!/Skeleton|animate-pulse/.test(await panel.innerHTML()), "every lookup should have come back");
    t.ok(/AS\d+|[A-Z][a-z]+, [A-Z]|not in the databases/.test(text), `a row should say where it is or whose it is (${text.replace(/\s+/g, " ").slice(0, 200)})`);
    await screenshot(stranger.page, "ip-info-tested");
    await noOverflow(t, stranger.page, "tested addresses");

    await stranger.page.goto(`${BASE}/?kind=ip`);
    await stranger.page.waitForLoadState("networkidle");
    const tab = stranger.page.getByRole("tab", { name: "IP info" });
    t.eq(await tab.getAttribute("aria-selected"), "true", "?kind=ip should open the IP info option");
    t.eq(await stranger.page.getByText("Echo requests per node").count(), 0, "an IP lookup has no measurement settings");
    await stranger.page.locator("#ip-address").fill("8.8.8.8");
    await stranger.page.getByRole("button", { name: "Look up" }).click();
    await stranger.page.getByTestId("ip-info").waitFor({ timeout: 10000 });
    const info = await stranger.page.getByTestId("ip-info").innerText();
    t.ok(/8\.8\.8\.8/.test(info) && /AS15169|Google/i.test(info), `the lookup should say whose 8.8.8.8 is (${info.replace(/\s+/g, " ").slice(0, 200)})`);
    await screenshot(stranger.page, "ip-info-lookup");
    // every field answered says how sure it is, and the sources behind the vote can be opened
    const sureTexts = await stranger.page.getByTestId("ip-info").getByTestId("confidence").evaluateAll((els) => els.map((e) => e.getAttribute("data-percent")));
    t.ok(sureTexts.length >= 4 && sureTexts.every((x) => /^([1-9]|[1-9][0-9])$/.test(x ?? "")), `each answered field should say how sure it is, 1 to 99 (${sureTexts.join(" ")})`);
    t.ok(/%/.test(await stranger.page.getByTestId("ip-country").innerText()) && /United States/.test(await stranger.page.getByTestId("ip-country").innerText()), "the country row should say the country and how sure");
    t.ok(/AS15169/.test(await stranger.page.getByTestId("ip-asn").innerText()), "the AS number row should say AS15169");
    const sourcesButton = stranger.page.getByTestId("ip-sources").getByRole("button", { name: /sources answered/ });
    t.ok(/^\d+ of 9 sources answered$/.test((await sourcesButton.innerText()).trim()), `the summary should count the nine sources (${await sourcesButton.innerText()})`);
    await sourcesButton.click();
    const sourceRows = await stranger.page.locator("[data-testid^='source-']:not([data-testid='ip-sources'])").count();
    t.eq(sourceRows, 9, "every source should be listed, whether or not it answered");
    t.ok(/Answered|Failed|Offline mode|Out of requests|Needs setup|Not downloaded/.test(await stranger.page.getByTestId("source-dbip").innerText()), "each source says what became of it");
    await screenshot(stranger.page, "ip-info-sources");
    await noOverflow(t, stranger.page, "the sources list");
    await stranger.page.locator("#ip-address").fill("192.168.1.1");
    await stranger.page.getByRole("button", { name: "Look up" }).click();
    await stranger.page.getByText(/not public|non-routable/).first().waitFor({ timeout: 10000 });
    await stranger.page.locator("#ip-address").fill("example.com");
    await stranger.page.getByRole("button", { name: "Look up" }).click();
    await stranger.page.getByText("That is not an IP address").waitFor({ timeout: 5000 });
    // the tab leads back to the measurements
    await stranger.page.getByRole("tab", { name: "Ping" }).click();
    await stranger.page.getByText("Echo requests per node").waitFor();
    for (const width of [390, 768]) {
      await stranger.page.setViewportSize({ width, height: 844 });
      await stranger.page.getByRole("tab", { name: "IP info" }).click();
      await noOverflow(t, stranger.page, `${width} IP info option`);
    }
    t.ok(stranger.errors.length === 0, `console errors ${JSON.stringify(stranger.errors)}`);
  } finally {
    await raw("PUT", "/admin/ip-data", { lookup_enabled: original.enabled, lookup_access: original.access, lookup_per_minute: original.per_minute });
    await stranger.close();
    await admin.close();
  }
}
