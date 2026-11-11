// The interface's languages: the browser's language is followed until the visitor chooses one, the choice is remembered,
// the administrator decides which languages are on, the default and whether the browser is followed, nothing links to GitHub,
// and the home page has the command first. Needs a backend with GET /api/v1/config (0.11 or newer); it stops with a note otherwise.
import { BASE, noOverflow, open, screenshot, signIn } from "./lib.mjs";

const visitor = async (t, locale, fn) => {
  const context = await t.browser.newContext({ locale, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    return await fn(page, errors);
  } finally {
    await context.close();
  }
};
const navText = async (page) => (await page.locator("header nav").first().innerText()).replace(/\s+/g, " ").trim();

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
  const before = await raw("GET", "/admin/settings");
  if (before.body?.languages_enabled === undefined) {
    t.note("skipped: this backend has no language settings (it needs 0.11 or newer)");
    await admin.close();
    return;
  }
  const original = { languages_enabled: before.body.languages_enabled, default_language: before.body.default_language, language_auto_detect: before.body.language_auto_detect };
  const set = (body) => raw("PATCH", "/admin/settings", body);

  try {
    await set({ languages_enabled: ["en", "zh", "es", "fr", "de", "pt", "ru", "ja", "ko"], default_language: "en", language_auto_detect: true });

    // 1. English by default, and nothing links to GitHub
    await visitor(t, "en-US", async (page, errors) => {
      await page.goto(BASE + "/");
      await page.waitForLoadState("networkidle");
      t.ok(/Measure/.test(await navText(page)), "an English browser sees English");
      t.eq(await page.locator("a[href*='github']").count(), 0, "nothing in the page links to GitHub");
      t.eq(await page.getByText(/on GitHub/i).count(), 0, "and nothing says so");
      t.eq(await page.locator("html").getAttribute("lang"), "en", "the page says it is English");
      t.ok(errors.length === 0, `errors ${errors}`);
    });

    // 2. A German browser is followed
    await visitor(t, "de-DE", async (page) => {
      await page.goto(BASE + "/");
      await page.getByRole("button", { name: "Pingen" }).first().waitFor({ timeout: 10000 });
      t.ok(/Messen/.test(await navText(page)) && /Knoten/.test(await navText(page)), `a German browser sees German (${await navText(page)})`);
      t.eq(await page.locator("html").getAttribute("lang"), "de", "and the page says so");
      await screenshot(page, "language-de");

      // 3. Choosing one is remembered, and wins over the browser
      await page.getByRole("combobox", { name: "Sprache" }).click();
      await page.getByRole("option", { name: "日本語" }).click();
      await page.getByText("測定", { exact: true }).first().waitFor({ timeout: 5000 });
      t.eq(await page.locator("html").getAttribute("lang"), "ja", "choosing Japanese changes the page");
      await page.reload();
      await page.getByText("測定", { exact: true }).first().waitFor({ timeout: 10000 });
      t.ok(/測定/.test(await navText(page)), "and it is still Japanese after a reload, though the browser asks for German");
      await screenshot(page, "language-ja");
    });

    // 4. The home page: the command first, the map under it, the fleet and the recent list beside them
    await visitor(t, "en-US", async (page) => {
      await page.goto(BASE + "/");
      await page.waitForLoadState("networkidle");
      await page.locator("#target").waitFor();
      const y = async (loc) => (await loc.first().boundingBox())?.y ?? Number.NaN;
      const form = await y(page.locator("#target"));
      const map = await y(page.locator("figure"));
      const hero = await y(page.locator("h1"));
      t.ok(hero < form && form < map, `the title, then the command, then the map (${hero} ${form} ${map})`);
      const stats = page.getByText("Nodes online", { exact: true });
      t.ok((await stats.count()) > 0, "the fleet's numbers are on the page");
      t.ok(Math.abs((await y(stats)) - form) < 400, "and beside the command, not below the map");
      await screenshot(page, "home-layout");
      await noOverflow(t, page, "home at 1440");
      for (const width of [390, 768, 1024]) {
        await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
        await page.goto(BASE + "/");
        await page.waitForLoadState("networkidle");
        await noOverflow(t, page, `home at ${width}`);
      }
    });

    // 5. The administrator's settings: following the browser off, then only two languages with French the default
    t.eq((await set({ language_auto_detect: false, default_language: "en" })).status, 200, "the settings can be changed");
    await visitor(t, "de-DE", async (page) => {
      await page.goto(BASE + "/");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(500);
      t.ok(/Measure/.test(await navText(page)), "with the browser not followed a German browser gets the default, English");
    });
    t.eq((await set({ languages_enabled: ["en", "fr"], default_language: "fr", language_auto_detect: true })).status, 200, "two languages with French the default");
    await visitor(t, "ja-JP", async (page) => {
      await page.goto(BASE + "/");
      await page.getByText("Mesurer", { exact: true }).first().waitFor({ timeout: 10000 });
      t.ok(true, "a Japanese browser, Japanese being off, gets the default: French");
      await page.getByRole("combobox", { name: "Langue" }).click();
      await page.getByRole("option").first().waitFor();
      t.eq(await page.getByRole("option").count(), 2, "the switcher offers only the two that are on");
    });
    t.eq((await raw("PATCH", "/admin/settings", { languages_enabled: ["en"], default_language: "fr" })).status, 422, "a default that is switched off is refused");
    t.eq((await raw("PATCH", "/admin/settings", { languages_enabled: ["en"], default_language: "en" })).status, 200, "one language alone is allowed");
    await visitor(t, "de-DE", async (page) => {
      await page.goto(BASE + "/");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(500);
      t.eq(await page.getByRole("combobox", { name: "Language" }).count(), 0, "with one language on there is no switcher");
    });

    // 6. The settings page in the admin has the card
    await set({ languages_enabled: original.languages_enabled, default_language: original.default_language, language_auto_detect: original.language_auto_detect });
    await admin.page.goto(BASE + "/admin");
    await admin.page.getByRole("tab", { name: "Limits & safety" }).click();
    await admin.page.getByText("Follow the browser's language").waitFor({ timeout: 10000 });
    t.eq(await admin.page.getByRole("group", { name: "Languages on" }).getByRole("checkbox").count(), 9, "a checkbox for each language");
    await screenshot(admin.page, "admin-language");
    t.ok(admin.errors.length === 0, `console errors ${JSON.stringify(admin.errors)}`);
  } finally {
    await set(original);
    await admin.close();
  }
}
