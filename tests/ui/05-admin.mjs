// The administration pages at phone and desktop width: every tab fits, and so does every dialog (the
// enrollment dialog once overflowed because dialog grids need minmax(0, 1fr)).
import { BASE, DIALOG_OVERFLOW, noOverflow, open, screenshot, signIn } from "./lib.mjs";

const TABS = ["Nodes", "Watches", "API keys", "Enrollment", "Limits & safety", "Audit log"];

export default async function check(t) {
  for (const width of [390, 768, 1440]) {
    const { page, errors, close } = await open(t.browser, { width });
    await signIn(page);
    for (const tab of TABS) {
      await page.getByRole("tab", { name: tab }).click();
      await page.waitForTimeout(500);
      await noOverflow(t, page, `${width} admin ${tab}`);
    }

    const dialog = async (name) => {
      await page.waitForTimeout(350);
      const o = await page.evaluate(DIALOG_OVERFLOW);
      t.ok(!o.none, `${width} ${name}: no dialog opened`);
      t.ok(!o.none && o.out.length === 0 && !o.pageOverflow, `${width} ${name}: ${JSON.stringify(o)}`);
      await screenshot(page, `admin-${width}-${name}`, false);
    };

    // enrollment token dialog (long commands in boxes)
    await page.getByRole("tab", { name: "Enrollment" }).click();
    await page.getByLabel("Label (optional)").fill("Falkenstein 1");
    await page.getByRole("button", { name: "Create enrollment token" }).click();
    await dialog("enrollment");
    await page.getByRole("button", { name: "I have saved it" }).click();

    // node dialogs
    await page.getByRole("tab", { name: "Nodes" }).click();
    await page.waitForTimeout(500);
    const edit = page.getByRole("button", { name: "Edit" }).first();
    if (await edit.count()) {
      await edit.click();
      await dialog("edit-node");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    }
    const revoke = page.getByRole("button", { name: "Revoke" }).first();
    if (await revoke.count()) {
      await revoke.click();
      await dialog("revoke");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    }

    // watch and key dialogs
    await page.getByRole("tab", { name: "Watches" }).click();
    await page.getByRole("button", { name: /Add a watch/ }).click();
    await dialog("add-watch");
    await page.keyboard.press("Escape");
    await page.getByRole("tab", { name: "API keys" }).click();
    await page.getByRole("button", { name: /Create a key/ }).click();
    await dialog("create-key");
    await page.keyboard.press("Escape");

    // choose-nodes dialog on the home page
    await page.goto(BASE + "/");
    await page.getByText(/\d+ nodes? online/).waitFor();
    await page.getByRole("combobox").last().click();
    await page.getByRole("option", { name: /Selected/ }).click();
    await dialog("choose-nodes");
    t.ok(errors.length === 0, `${width}: console errors ${JSON.stringify([...new Set(errors)])}`);
    await close();
  }
}
