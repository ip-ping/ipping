// Choosing who measures on the map: a click, a shift-drag, and the measurement runs on exactly those nodes.
import { BASE, open } from "./lib.mjs";

// the map's own coordinates: x = longitude + 180, y = 90 - latitude, in a viewBox of -9 0 378 152
const VIEW = { x: -9, w: 378, h: 152 };

export default async function check(t) {
  const { page, errors, close } = await open(t.browser, { width: 1280 });
  await page.goto(BASE + "/");
  await page.getByText(/\d+\/\d+ live/).first().waitFor();
  await page.waitForTimeout(800);
  const box = await page.locator("figure svg").first().boundingBox();
  const at = (lon, lat) => ({ x: box.x + ((lon + 180 - VIEW.x) / VIEW.w) * box.width, y: box.y + ((90 - lat) / VIEW.h) * box.height });

  const p = at(4.9, 52.37); // Amsterdam
  await page.mouse.move(p.x, p.y);
  await page.waitForTimeout(200);
  await page.mouse.down();
  await page.waitForTimeout(40);
  await page.mouse.up();
  await page.waitForTimeout(250);
  t.ok(/1 chosen of/.test(await page.locator("[data-slot=card-header]").first().innerText()), "a click should choose one station");
  t.ok(/Selected \(1\)/.test(await page.getByRole("combobox").last().innerText()), "the form should say Selected (1)");

  // shift-drag over the United States replaces the choice
  const a = at(-128, 52);
  const b = at(-66, 24);
  await page.keyboard.down("Shift");
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await page.waitForTimeout(300);
  const meta = await page.locator("[data-slot=card-header]").first().innerText();
  const chosen = Number(/(\d+) chosen of/.exec(meta)?.[1] ?? 0);
  t.ok(chosen >= 3, `the region should hold several US stations: ${meta}`);

  await page.getByLabel("IP address, hostname or URL").fill("1.1.1.1");
  await page.locator("form button[type=submit]").click();
  await page.waitForURL(/\/measurements\//);
  await page.getByText("Finished", { exact: true }).first().waitFor({ timeout: 90000 });
  const names = (await page.locator("tbody tr td:nth-child(2)").allInnerTexts())
    .map((n) => n.split("\n")[0].trim().replace(/^\p{Regional_Indicator}{2}\s*/u, ""))
    .filter(Boolean);
  t.eq(names.length, chosen, "the measurement should run on exactly the chosen nodes");
  t.ok(names.every((n) => ["Chicago, US", "Dallas, US", "Los Angeles, US", "New York, US"].includes(n)), `unexpected nodes: ${names}`);
  t.ok(errors.length === 0, `console errors ${JSON.stringify(errors)}`);
  await close();
}
