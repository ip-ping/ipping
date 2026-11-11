// The administrator's IP data sources: nine of them, each with a switch (all on until turned off), a state, and for the online ones an optional
// key that is written and never read back. What the page says is what the lookup does: a source that is switched off answers "Turned off".
// It puts everything back as it found it. Needs a backend with the sources (0.12 or newer); it stops with a note otherwise.
import { noOverflow, open, screenshot, signIn } from "./lib.mjs";

const TOKEN = "UI-TEST-TOKEN-0123456789";

export default async function check(t) {
  const { page, errors, close } = await open(t.browser, { width: 1280 });
  await signIn(page);
  const call = (method, path, body) =>
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
  if (before.status !== 200 || !before.body.sources) {
    t.note("skipped: this backend has no IP data sources (it needs version 0.12 or newer)");
    await close();
    return;
  }
  const original = Object.fromEntries(before.body.sources.map((s) => [s.id, s.enabled]));
  const sourceOf = async (id) => (await call("GET", "/admin/ip-data")).body.sources.find((s) => s.id === id);
  const answerOf = async (id) => (await call("GET", "/ip/8.8.8.8")).body?.sources?.find((s) => s.id === id);

  try {
    await page.getByRole("tab", { name: "IP data" }).click();
    await page.getByTestId("ip-sources-card").waitFor();
    const ids = ["maxmind", "dbip", "iptoasn", "ipdeny", "ip2region", "ipinfo", "iplocate", "ipapi_is", "ip2location"];

    // 1. All nine, with a switch and a state each; everything is on unless an administrator turned it off
    for (const id of ids) t.eq(await page.getByTestId(`source-row-${id}`).count(), 1, `${id} should have a row`);
    t.eq(await page.getByTestId("ip-sources-card").getByRole("switch").count(), 9, "nine switches");
    t.eq(JSON.stringify(Object.keys(original)), JSON.stringify(ids), "the backend lists the nine sources in this order");
    t.ok(/\d+ of 9 sources are on/.test(await page.getByTestId("ip-sources-card").innerText()), "the card should count the sources that are on");
    await screenshot(page, "ip-sources");

    // 2. Switching one off is what the lookup sees: ipdeny says so, and the others still answer
    const ipdeny = page.getByTestId("source-row-ipdeny").getByRole("switch");
    const flip = async (want) => {
      if ((await ipdeny.getAttribute("aria-checked")) === String(want)) return;
      const saved = page.waitForResponse((r) => r.request().method() === "PUT" && /\/admin\/ip-data$/.test(r.url()));
      await ipdeny.click();
      t.eq((await saved).status(), 200, "switching a source should save");
    };
    await flip(false);
    await page.getByTestId("source-state-ipdeny").filter({ hasText: "off" }).waitFor({ timeout: 10000 });
    t.eq((await sourceOf("ipdeny")).enabled, false, "the backend should say it is off");
    const off = await answerOf("ipdeny");
    if (off) t.eq(off.status, "disabled", "a source that is off answers 'disabled' in a lookup");
    await flip(true);
    await page.getByTestId("source-state-ipdeny").filter({ hasText: /ready|waiting|offline/ }).waitFor({ timeout: 10000 });
    t.eq((await sourceOf("ipdeny")).enabled, true, "and on again");

    // 3. A key: written, never read back, kept, removed
    const row = page.getByTestId("source-row-ipinfo");
    await row.getByLabel(/Access token/).fill(TOKEN);
    const saved = page.waitForResponse((r) => r.request().method() === "PUT" && /\/admin\/ip-data$/.test(r.url()));
    await row.getByRole("button", { name: "Save key" }).click();
    t.eq((await saved).status(), 200, "saving a key should work");
    await row.getByText("saved", { exact: true }).waitFor({ timeout: 10000 });
    t.ok(!(await page.locator("main").innerText()).includes(TOKEN), "a saved key must never be shown again");
    t.ok(!JSON.stringify((await call("GET", "/admin/ip-data")).body).includes(TOKEN), "nor sent back by the API");
    t.eq((await sourceOf("ipinfo")).credentials[0].set, true, "the API says a token is set");
    await page.reload();
    await page.getByRole("tab", { name: "IP data" }).click();
    await page.getByTestId("source-row-ipinfo").getByText("saved", { exact: true }).waitFor({ timeout: 10000 });
    t.eq(await page.getByTestId("source-row-ipinfo").getByLabel(/Access token/).inputValue(), "", "the box is empty after a reload");
    const removed = page.waitForResponse((r) => r.request().method() === "PUT" && /\/admin\/ip-data$/.test(r.url()));
    await page.getByTestId("source-row-ipinfo").getByRole("button", { name: "Remove key" }).click();
    t.eq((await removed).status(), 200, "removing a key should work");
    await page.getByTestId("source-row-ipinfo").getByText("saved", { exact: true }).waitFor({ state: "detached", timeout: 10000 });
    t.eq((await sourceOf("ipinfo")).credentials[0].set, false, "and it is gone");
    // MaxMind's account is set in its own card
    t.ok(/set in the MaxMind card/.test(await page.getByTestId("source-row-maxmind").innerText()), "MaxMind points to its own card for the account");

    // 4. At the widths people use (once the toasts of the saves above have gone: they slide in from beyond the edge)
    await page.locator("[data-sonner-toast]").first().waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
      await page.getByTestId("ip-sources-card").waitFor();
      await noOverflow(t, page, `${width} IP data sources`);
    }
    t.ok(errors.length === 0, `console errors ${JSON.stringify(errors)}`);
  } finally {
    await call("PUT", "/admin/ip-data", { sources: Object.fromEntries(Object.entries(original).map(([id, enabled]) => [id, { enabled }])) });
    await call("PUT", "/admin/ip-data", { sources: { ipinfo: { credentials: { token: "" } } } });
    await close();
  }
}
