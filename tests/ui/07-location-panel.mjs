// The location panel (evidence table, GeoIP note, long text) at phone width: a table that makes the whole page
// scroll sideways once did exactly that.
import { BASE, WIDTHS, noOverflow, open } from "./lib.mjs";

export default async function check(t) {
  for (const dark of [false, true]) {
    for (const width of WIDTHS.filter((w) => w < 1440)) {
      const { page, errors, close } = await open(t.browser, { width, dark });
      await page.goto(`${BASE}/measurements/${t.shared.tcp}`);
      await page.waitForLoadState("networkidle");
      await page.getByText("Estimated network location").waitFor({ timeout: 15000 });
      for (const label of [/Measurements used/, /What this can and cannot tell you/]) {
        const summary = page.getByText(label);
        if (await summary.count()) await summary.first().click();
      }
      await page.locator("tbody tr").first().click();
      await page.waitForTimeout(400);
      await noOverflow(t, page, `${dark ? "dark" : "light"} ${width} location panel`);
      t.ok(errors.length === 0, `console errors ${JSON.stringify(errors)}`);
      await close();
    }
  }
}
