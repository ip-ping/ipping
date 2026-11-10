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
      // each node in the evidence says where it is and whose it is: as columns from a tablet up, under the name on a phone
      const evidence = page.locator("[data-slot=accordion-content] table").first();
      const evidenceText = await evidence.innerText();
      t.ok(/[A-Z][a-z]+, [A-Z]{2}/.test(evidenceText), `${width}px: the evidence should name each node's region (${evidenceText.slice(0, 120)})`);
      t.ok(/Vultr|Hetzner|OVH|DigitalOcean|Linode|Contabo|Equinix/.test(evidenceText), `${width}px: the evidence should name each node's provider`);
      const headers = await evidence.locator("th:visible").allInnerTexts();
      t.eq(headers.some((h) => h === "Region") && headers.some((h) => h === "Provider / ASN"), width >= 768, `${width}px: the Region and Provider / ASN columns`);
      await page.locator("tbody tr").first().click();
      await page.waitForTimeout(400);
      await noOverflow(t, page, `${dark ? "dark" : "light"} ${width} location panel`);
      t.ok(errors.length === 0, `console errors ${JSON.stringify(errors)}`);
      await close();
    }
  }
}
