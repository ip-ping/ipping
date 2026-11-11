// The "IP data" administration tab (the sources, the lookup API) and nodes that fill themselves in from their address.
// It does not need any account: downloading is covered by the backend's tests. It checks what an administrator
// does in the page: the tab fits at every width, MaxMind is a row of the one list of sources like the others (no card of its own,
// no table of "databases in use"), the lookup API's settings are saved and really change who may use the
// API, and the node dialog sends only what was changed (a field that is sent becomes the administrator's own). It
// stops with a note when the backend is older than 0.13 (before that MaxMind had its own card).
import { BASE, noOverflow, open, screenshot, signIn } from "./lib.mjs";

export default async function check(t) {
  const { page, errors, close, context } = await open(t.browser, { width: 1280 });
  await signIn(page);
  const call = async (method, path, body) =>
    page.evaluate(
      async ([m, p, b]) => {
        const s = await (await fetch("/api/v1/session")).json();
        const r = await fetch("/api/v1" + p, { method: m, headers: { "Content-Type": "application/json", "X-CSRF-Token": s.csrf_token }, body: b ? JSON.stringify(b) : undefined });
        const text = await r.text();
        return { status: r.status, body: text ? JSON.parse(text) : null };
      },
      [method, path, body],
    );
  const before = await call("GET", "/admin/ip-data");
  if (before.status !== 200 || !before.body.sources || "maxmind" in before.body) {
    t.note("skipped: this backend still has MaxMind apart from the other sources (it needs version 0.13 or newer)");
    await close();
    return;
  }
  const original = before.body;
  const anonymous = await t.browser.newContext();
  const lookup = async () => (await anonymous.request.get(`${BASE}/api/v1/ip/8.8.8.8`)).status();

  try {
    // The tab, at the widths people use.
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
      await page.getByRole("tab", { name: "IP data" }).click();
      await page.getByTestId("ip-sources-card").waitFor();
      await page.getByText("IP lookup API").waitFor();
      await noOverflow(t, page, `${width} IP data`);
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    const text = await page.locator("main").innerText();
    // MaxMind is one row of the list, like every other source: no card or table of its own
    t.ok(!/Databases in use/.test(text), "there is no table of databases in use");
    t.eq(await page.getByText("MaxMind GeoLite2", { exact: true }).count(), 1, "MaxMind is named once, in the list of sources");
    t.eq(await page.getByTestId("source-row-maxmind").count(), 1, "and it is a row of the list");
    const maxmind = page.getByTestId("source-row-maxmind");
    t.ok((await maxmind.getByLabel("Account ID").count()) === 1 && (await maxmind.getByLabel("License key").count()) === 1, "its account fields are in its row");
    t.ok(await page.getByRole("button", { name: "Check for updates now" }).isVisible(), "there is one button to check every source");
    if (original.offline || !original.directory_configured) {
      t.ok(await page.getByRole("button", { name: "Check for updates now" }).isDisabled(), "checking needs a data directory, and is off in offline mode");
    }
    await screenshot(page, "ip-data", true);

    // The lookup API: off, public, key-only. What the page says is what the API does.
    const access = page.getByRole("combobox", { name: "Who may use it" });
    const rate = page.getByLabel("Lookups a minute for one client address");
    const enabled = page.getByRole("switch", { name: /The API is (on|off)/ });
    const saveButton = page.getByRole("button", { name: "Save lookup API settings" });
    // Wait for the request itself: the toast of the last save may still be on the screen.
    const save = async () => {
      const done = page.waitForResponse((r) => r.request().method() === "PUT" && /\/admin\/ip-data$/.test(r.url()));
      await saveButton.click();
      t.eq((await done).status(), 200, "saving the lookup settings should work");
    };
    if (!(await enabled.isChecked())) await enabled.click();
    await access.click();
    await page.getByRole("option", { name: "Anyone" }).click();
    await rate.fill("7");
    await save();
    const saved = (await call("GET", "/admin/ip-data")).body;
    t.eq(saved.lookup.access, "public", "access should be saved as public");
    t.eq(saved.lookup.per_minute, 7, "the rate should be saved");
    if (saved.databases_loaded) t.eq(await lookup(), 200, "anyone may look an address up when access is public");

    await access.click();
    await page.getByRole("option", { name: "Administrators only" }).click();
    await save();
    t.ok([401, 403].includes(await lookup()), "a visitor must be refused when access is administrators only");

    await enabled.click(); // off
    await save();
    t.ok([403, 404].includes(await lookup()), "no lookups at all while the API is off");
    await page.reload();
    await page.getByRole("tab", { name: "IP data" }).click();
    const off = await page.getByRole("switch", { name: "The API is off" }).waitFor({ timeout: 10000 }).then(() => true, () => false);
    t.ok(off, "the switch should come back off after a reload");

    // The node dialog sends only what was changed.
    await page.getByRole("tab", { name: "Nodes" }).click();
    await page.getByRole("button", { name: "Edit" }).first().waitFor();
    await page.getByRole("button", { name: "Edit" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Fill from IP data" }).waitFor();
    t.ok(await dialog.getByRole("button", { name: "Save" }).isDisabled(), "Save is for changes: nothing to save yet");
    const provider = dialog.getByLabel("Provider");
    const was = await provider.inputValue();
    await provider.fill("Typed Test Network");
    const sent = page.waitForRequest((r) => r.method() === "PATCH" && /\/admin\/nodes\//.test(r.url()));
    await dialog.getByRole("button", { name: "Save" }).click();
    const body = JSON.parse((await sent).postData() ?? "{}");
    t.eq(JSON.stringify(Object.keys(body)), JSON.stringify(["provider"]), "only the provider should be sent");
    await page.getByText("Node updated").first().waitFor();
    const nodes = (await call("GET", "/admin/nodes")).body;
    const edited = nodes.find((n) => n.provider === "Typed Test Network");
    t.ok(edited, "the typed provider should be saved");
    t.ok(edited && !edited.auto_fields.includes("provider"), "a typed value is the administrator's own, not automatic");

    // Put it back as it was (an empty value hands the field back to the IP data).
    await page.getByRole("button", { name: "Edit" }).first().click();
    await page.getByRole("dialog").getByLabel("Provider").fill(was);
    await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
    await page.getByText("Node updated").first().waitFor();
  } finally {
    // Leave the settings as they were found.
    await call("PUT", "/admin/ip-data", {
      lookup_enabled: original.lookup.enabled,
      lookup_access: original.lookup.access,
      lookup_per_minute: original.lookup.per_minute,
    });
    await anonymous.close();
  }
  t.ok(errors.length === 0, `console errors ${JSON.stringify([...new Set(errors)])}`);
  await context.close();
}
