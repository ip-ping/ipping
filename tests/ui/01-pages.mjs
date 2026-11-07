// Every page, at the widths people use, in light and dark: nothing sticks out of the window, nothing scrolls
// sideways and the console stays clean.
import { BASE, WIDTHS, noOverflow, open, screenshot } from "./lib.mjs";

export default async function check(t) {
  for (const dark of [false, true]) {
    for (const width of WIDTHS) {
      const session = await open(t.browser, { width, dark });
      const tag = `${dark ? "dark" : "light"} ${width}`;
      const paths = ["/", "/nodes", ...Object.entries(t.shared).map(([kind, id]) => [kind, `/measurements/${id}`])];
      for (const entry of paths) {
        const [label, path] = Array.isArray(entry) ? entry : [entry, entry];
        await session.page.goto(BASE + path);
        await session.page.waitForLoadState("networkidle");
        await session.page.waitForTimeout(700);
        await noOverflow(t, session.page, `${tag} ${label}`);
        if (!dark && width === 1440) await screenshot(session.page, `pages-${String(label).replace(/\W+/g, "") || "home"}`);
      }
      t.ok(session.errors.length === 0, `${tag}: console errors ${JSON.stringify([...new Set(session.errors)])}`);
      await session.close();
    }
  }
}
