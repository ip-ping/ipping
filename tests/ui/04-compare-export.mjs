// The same measurement twice shows how each node moved; the results can be taken out as text, CSV and JSON.
import { readFileSync } from "node:fs";

import { BASE, measure, open, warmUp } from "./lib.mjs";

export default async function check(t) {
  const { page, errors, close } = await open(t.browser, { width: 1280, permissions: ["clipboard-read", "clipboard-write"] });
  const call = await warmUp(page);
  let last = "";
  for (let i = 0; i < 2; i++) {
    last = await measure(call, page, { target: "example.org", kind: "ping", count: 3 });
    await page.waitForTimeout(1200);
  }
  await page.goto(`${BASE}/measurements/${last}`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
  t.ok(await page.getByText(/compared with/i).first().isVisible().catch(() => false), "the chart should say what it is compared with");
  t.ok((await page.locator("tbody tr td [title$='ms last time']").count()) > 0, "the table should show how nodes moved");

  const menu = page.getByRole("button", { name: /Export/ });
  await menu.click();
  const [csv] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: /Download CSV/ }).click()]);
  const text = readFileSync(await csv.path(), "utf8");
  t.ok(/^node,country,city,provider,asn,status,tested_ip,error,sent,received/.test(text), `the CSV header is wrong: ${text.split("\r\n")[0]}`);
  t.ok(text.trim().split("\r\n").length > 2, "the CSV should have a row per node");
  t.ok(/^ipping-ping-example\.org-\d{8}-\d{4}\.csv$/.test(csv.suggestedFilename()), `file name ${csv.suggestedFilename()}`);

  await menu.click();
  const [json] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: /Download JSON/ }).click()]);
  const parsed = JSON.parse(readFileSync(await json.path(), "utf8"));
  t.ok(parsed.tasks.length > 0 && parsed.exported_from === "ipping", "the JSON should hold the whole measurement");

  await menu.click();
  await page.getByRole("menuitem", { name: /Copy as text/ }).click();
  await page.waitForTimeout(300);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  t.ok(/^Ping example\.org \(/.test(clip) && /nodes answered\. Measured with ipping\./.test(clip), "the copied text should be a report");
  t.ok(errors.length === 0, `console errors ${JSON.stringify(errors)}`);
  await close();
}
