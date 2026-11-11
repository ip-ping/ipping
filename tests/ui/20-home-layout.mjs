// The home page's layout at the sizes people use. "Recent in this browser" shows every address in full (an IPv6 address is the
// longest thing in it, and it was once squeezed to nothing beside the command), the command comes before the map, the fleet's numbers
// are in the title's header, and nothing sticks out. A phone gets them in one column, a laptop gets the command and the recent list
// side by side with the map across the whole width under them.
import { BASE, noOverflow, open, screenshot, warmUp, measure } from "./lib.mjs";

const LONG_V6 = "2001:4860:4860:1234:5678:9abc:def0:8888"; // 39 characters: the longest an address gets without a port
// The first five only fill the list (it holds eight, the longest the page asks for): the longer the list, the taller it wants to be
const FILLER = ["1.0.0.1", "8.8.8.8", "9.9.9.9", "208.67.222.222", "94.140.14.14"].map((target) => ({ target, kind: "ping", count: 1 }));
const TARGETS = [
  { target: "185.199.108.153", kind: "ping", count: 1 },
  { target: "2606:4700:4700::1111", kind: "ping", count: 1 },
  { target: LONG_V6, kind: "ping", count: 1 },
  { target: "example.com:443", kind: "tcp", count: 1 },
];

const SIZES = [
  [1920, 1080],
  [1440, 900],
  [1280, 800],
  [1024, 768],
  [768, 1024],
  [390, 844],
];

export default async function check(t) {
  const { page, errors, close } = await open(t.browser, { width: 1440 });
  const call = await warmUp(page);
  for (const body of [...FILLER, ...TARGETS]) await measure(call, page, body);

  const rows = () =>
    page.evaluate(() =>
      [...document.querySelectorAll("a[href^='/measurements/']")].map((a) => {
        const host = a.querySelector(".font-mono");
        const r = host.getBoundingClientRect();
        const line = parseFloat(getComputedStyle(host).lineHeight) || 20;
        const card = a.closest("[data-slot=card]").getBoundingClientRect();
        return { text: host.textContent, width: Math.round(r.width), lines: Math.round(r.height / line), inside: r.left >= card.left && r.right <= card.right + 1 };
      }),
    );
  const box = (selector) => page.locator(selector).first().boundingBox();

  for (const [width, height] of SIZES) {
    await page.setViewportSize({ width, height });
    await page.goto(BASE + "/");
    await page.waitForLoadState("networkidle");
    await page.locator("a[href^='/measurements/']").first().waitFor({ timeout: 10000 });
    const where = `home at ${width}`;

    // Every address is there, whole, and the line is wide enough to read
    const listed = await rows();
    for (const body of TARGETS) {
      const host = body.target.replace(/:443$/, "");
      const row = listed.find((r) => r.text.startsWith(host));
      t.ok(row, `${where}: ${host} is in the recent list`);
      if (!row) continue;
      t.ok(row.text.startsWith(host), `${where}: the whole address is written (${row.text})`);
      t.ok(row.width >= 100 && row.inside, `${where}: ${host} has room (${row.width}px, inside its card: ${row.inside})`);
    }
    t.eq(listed.length, 8, `${where}: a full list of eight (the height it would like to have)`);
    // On a laptop even the longest address is on one line; on a phone it may wrap, but never be cut
    const long = listed.find((r) => r.text.startsWith(LONG_V6));
    if (long && width >= 1024) t.eq(long.lines, 1, `${where}: the longest address fits on one line`);
    if (long) t.ok(long.lines <= 2, `${where}: and never takes more than two`);

    // The order: the title and the fleet's numbers, the command, the recent list beside it (or under it), the map
    const hero = await box("h1");
    const stats = await box("dl");
    const form = await box("#target");
    const recent = await box("a[href^='/measurements/']");
    const map = await box("figure");
    // No gap: the map follows the command and the list by the page's usual space, whichever is taller. Beside each other (from 1024 px)
    // the two cards are exactly as tall as one another, the list scrolling inside its card; stacked, each follows the one above.
    const cards = await page.evaluate(() => {
      const bottom = (el) => Math.round(el.closest("[data-slot=card]").getBoundingClientRect().bottom + scrollY);
      const top = (el) => Math.round(el.closest("[data-slot=card]").getBoundingClientRect().top + scrollY);
      return {
        form: bottom(document.querySelector("#target")),
        recent: bottom(document.querySelector("a[href^='/measurements/']")),
        recentTop: top(document.querySelector("a[href^='/measurements/']")),
        formTop: top(document.querySelector("#target")),
        map: top(document.querySelector("figure")),
      };
    });
    t.ok(hero && stats && form && recent && map, `${where}: the title, the numbers, the command, the list and the map are all there`);
    if (!(hero && stats && form && recent && map)) continue;
    t.ok(hero.y < form.y && stats.y < form.y, `${where}: the title and the fleet's numbers come first`);
    t.ok(form.y < map.y && recent.y < map.y, `${where}: the map is under the command and the list`);
    if (width >= 1024) {
      t.ok(Math.abs(cards.form - cards.recent) <= 2, `${where}: the command and the list end together (${cards.form} and ${cards.recent})`);
      t.ok(cards.map - cards.form <= 40, `${where}: no gap between the command and the map (${cards.map - cards.form}px)`);
      t.ok(cards.map - cards.recent <= 40, `${where}: no gap between the list and the map (${cards.map - cards.recent}px)`);
    } else {
      t.ok(cards.recentTop - cards.form <= 40, `${where}: the list follows the command closely (${cards.recentTop - cards.form}px)`);
      t.ok(cards.map - cards.recent <= 40, `${where}: and the map follows the list closely (${cards.map - cards.recent}px)`);
    }
    if (width >= 1024) {
      t.ok(recent.x > form.x + form.width && Math.abs(recent.y - form.y) < 250, `${where}: the recent list is beside the command (${Math.round(recent.x)}, ${Math.round(recent.y)})`);
      t.ok(map.width > form.width + recent.width * 0.8, `${where}: the map runs across both`);
    } else {
      t.ok(recent.y > form.y + 100, `${where}: the recent list follows the command`);
    }
    const numbers = (await page.locator("dl dd").allInnerTexts()).map((s) => s.trim());
    t.ok(numbers.length === 4 && numbers.every((n) => /^\d+$/.test(n)), `${where}: the fleet's four numbers are shown (${numbers.join(", ")})`);
    await noOverflow(t, page, where);
    if (width === 1440 || width === 390) await screenshot(page, `home-${width}`);
  }

  // The time is worded in the interface's language
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(BASE + "/");
  await page.evaluate(() => localStorage.setItem("ipping.language", "de"));
  await page.reload();
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => document.documentElement.lang === "de", null, { timeout: 10000 });
  const when = (await page.locator("a[href^='/measurements/'] span.truncate").first().innerText()).trim();
  t.ok(/^vor /.test(when), `in German the time reads "vor ..." (${when})`);
  await page.evaluate(() => localStorage.removeItem("ipping.language"));

  // Dark theme: the same page, nothing sticks out
  await close();
  const dark = await open(t.browser, { width: 1280, dark: true });
  await dark.page.goto(BASE + "/");
  await dark.page.waitForLoadState("networkidle");
  await noOverflow(t, dark.page, "home, dark");
  await screenshot(dark.page, "home-dark");
  t.ok(errors.length === 0 && dark.errors.length === 0, `the console is clean (${[...errors, ...dark.errors].join(" | ")})`);
  await dark.close();
}
