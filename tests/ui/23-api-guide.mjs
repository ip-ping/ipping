// The API page (/developers): a guide through the API with a form for each endpoint, a Send button that makes the real request, and the same
// request as curl, Python and JavaScript. It starts real measurements (on the simulated fleet), uses an API key it makes and revokes, and
// checks what matters about a key: a request with one carries an Authorization header and no cookie, and the key is never written into a
// snippet or into the page. It puts everything back as it found it.
import { BASE, apiFor, noOverflow, open, screenshot, signIn } from "./lib.mjs";

const TARGET = "93.184.216.34";

export default async function check(t) {
  const { page, errors, close } = await open(t.browser, { width: 1280 });
  const admin = await open(t.browser, { width: 1280 });
  await signIn(admin.page);
  const adminCall = apiFor(admin.page);
  let keyId = null;

  const panel = (key) => page.getByTestId(`op-${key}`).first();
  const statusOf = (key) => panel(key).getByTestId("response-status");
  const bodyOf = async (key) => panel(key).getByTestId("response").locator("pre").innerText();
  const press = async (key) => {
    const before = (await panel(key).getByTestId("response").count()) ? await bodyOf(key) : null;
    await panel(key).getByTestId("send").click();
    await statusOf(key).waitFor({ timeout: 30000 });
    // the previous answer may still be on the screen for a moment: wait until the request has come back
    for (let i = 0; i < 50 && (await panel(key).locator("[data-slot=skeleton]").count()); i++) await page.waitForTimeout(100);
    return before;
  };

  try {
    await page.goto(`${BASE}/developers`);
    await page.getByRole("heading", { name: "API", exact: true, level: 1 }).waitFor();

    // 1. It is in the header, and the page says where the API is and how it will send requests
    const link = page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "API", exact: true }).first(); // the header's links are shadcn Buttons drawn as links
    t.ok(await link.isVisible(), "the header should link to the API page");
    t.eq(await link.getAttribute("aria-current"), "page", "and mark it as the current page");
    t.eq(await page.getByLabel("Address of the API").inputValue(), `${BASE}/api/v1`, "the address of the API is this site's");
    t.eq(await page.getByTestId("connect-mode").innerText(), "Browser session", "without a key the page sends with the browser's session");

    // 2. Step 1: an open endpoint answers
    await press("GET /api/v1/health/live");
    t.eq((await statusOf("GET /api/v1/health/live").innerText()).slice(0, 3), "200", "the health check should answer 200");
    t.ok(/"status": "ok"/.test(await bodyOf("GET /api/v1/health/live")), "and say it is ok");

    // 3. Step 2: a value that cannot be read holds Send back; one that is out of range is sent, with a warning
    const create = "POST /api/v1/measurements";
    await panel(create).getByLabel("target", { exact: true }).fill(TARGET);
    await panel(create).getByLabel("count", { exact: true }).fill("abc");
    await panel(create).getByText("A whole number.").waitFor();
    t.ok(await panel(create).getByTestId("send").isDisabled(), "Send should wait for a count that is a number");
    await panel(create).getByLabel("count", { exact: true }).fill("50");
    await panel(create).getByText(/The most is 10\./).waitFor();
    t.ok(await panel(create).getByTestId("send").isEnabled(), "a count that is too large is still sent: the API says what is wrong with it");
    await panel(create).getByLabel("count", { exact: true }).fill("1");

    // 4. The same request as a terminal would make it, and never with a key in it
    const curl = await panel(create).locator("pre").first().innerText();
    t.ok(curl.includes(`'${BASE}/api/v1/measurements'`) && curl.includes(TARGET) && curl.includes("$IPPING_KEY"), `the curl line should be this request (${curl.slice(0, 160)})`);
    const shown = (key) => panel(key).locator("pre").filter({ visible: true }).first(); // the snippet of the tab that is open
    const showsSoon = (key, text) => shown(key).filter({ hasText: text }).waitFor({ timeout: 5000 }).then(() => true, () => false); // the panel swaps a moment after the click
    await panel(create).getByRole("tab", { name: "Python" }).click();
    t.ok(await showsSoon(create, "requests.post("), "the Python tab should be Python");
    await panel(create).getByRole("tab", { name: "JavaScript" }).click();
    t.ok(await showsSoon(create, "await fetch("), "and the JavaScript tab JavaScript");

    // 5. Send it: the measurement starts, and its id is what the next step reads
    await press(create);
    t.eq((await statusOf(create).innerText()).slice(0, 3), "201", "starting a measurement should answer 201");
    const id = JSON.parse(await bodyOf(create)).id;
    t.ok(typeof id === "string" && id.length > 8, "the answer holds the measurement's id");
    await panel(create).getByText(`Measurement ${id} is kept for the next steps.`).waitFor();
    const read = "GET /api/v1/measurements/{measurement_id}";
    t.eq(await panel(read).getByLabel("measurement_id", { exact: true }).inputValue(), id, "the next step has the id already");
    let status = "";
    for (let i = 0; i < 60 && status !== "completed"; i++) {
      await press(read);
      status = JSON.parse(await bodyOf(read)).status;
      if (status !== "completed") await page.waitForTimeout(1000);
    }
    t.eq(status, "completed", "reading the measurement again and again should end with it completed");
    t.ok(JSON.parse(await bodyOf(read)).tasks.length > 0, "and it has its tasks");

    // 6. A key: the step that needs one waits for it; with one, the request is a script's (a header, no cookie)
    const text = "GET /api/v1/text";
    t.ok(await panel(text).getByTestId("send").isDisabled(), "the plain-text step needs a key");
    await panel(text).getByText("This one needs an API key: paste one in the box above.").waitFor();
    const made = await adminCall("POST", "/admin/api-keys", { name: "UI check: api guide" });
    keyId = made.id;
    await page.getByLabel("API key (optional)").fill(made.key);
    t.ok(/^API key ipk_….{4}$/.test(await page.getByTestId("connect-mode").innerText()), "the page should say it sends with the key, and show only its ends");
    t.ok(await panel(text).getByTestId("send").isEnabled(), "with a key the plain-text step can be sent");
    await panel(text).getByLabel("target", { exact: true }).fill(TARGET);
    await panel(text).getByLabel("count", { exact: true }).fill("1");
    const sent = page.waitForRequest((r) => r.url().includes("/api/v1/text"));
    await press(text);
    const headers = await (await sent).allHeaders();
    t.eq(headers.authorization, `Bearer ${made.key}`, "the key goes in the Authorization header");
    t.ok(!("cookie" in headers), `and no cookie goes with it, as from a script (${Object.keys(headers).join(", ")})`);
    t.eq((await statusOf(text).innerText()).slice(0, 3), "200", "the plain-text endpoint should answer 200");
    const report = await bodyOf(text);
    t.ok(report.length > 20 && !report.trimStart().startsWith("{"), `the answer is a text report (${report.slice(0, 80)})`);
    t.ok(!(await page.locator("main").innerText()).includes(made.key), "the key is not written anywhere on the page");
    t.ok(!(await panel(text).locator("pre").first().innerText()).includes(made.key), "and not into a snippet");
    const where = await page.evaluate((k) => ({ session: sessionStorage.getItem("ipping.api-key") === k, local: Object.values(localStorage).some((v) => String(v).includes(k)) }), made.key);
    t.ok(where.session && !where.local, `the key is kept for this tab only (${JSON.stringify(where)})`);
    await page.reload();
    await page.getByTestId("connect-mode").filter({ hasText: /^API key/ }).waitFor();
    await page.getByRole("button", { name: "Clear" }).click();
    t.eq(await page.getByTestId("connect-mode").innerText(), "Browser session", "Clear goes back to the session");
    t.ok(await page.evaluate(() => sessionStorage.getItem("ipping.api-key") === null), "and forgets the key");

    // 7. The reference: every endpoint, opened one by one
    await page.getByRole("tab", { name: "Reference" }).click();
    t.eq(await page.locator('[data-testid^="ref-"]').count(), 15, "the reference lists the fifteen endpoints");
    const open_ = async (key) => {
      await page.getByTestId(`ref-${key}`).getByRole("button").first().click();
      await page.getByTestId(`op-${key}`).first().waitFor();
    };
    await open_("GET /api/v1/nodes");
    await press("GET /api/v1/nodes");
    t.ok(Array.isArray(JSON.parse(await bodyOf("GET /api/v1/nodes"))) && JSON.parse(await bodyOf("GET /api/v1/nodes")).length > 0, "the node list should hold the nodes");
    const share = "POST /api/v1/measurements/{measurement_id}/share";
    await open_(share);
    t.ok(await panel(share).getByText("Browser session only").isVisible(), "sharing says it needs the browser session");
    // (the reload above made the guide forget the measurement it had started: the id is typed in, as anyone would)
    t.eq(await panel(share).getByLabel("measurement_id", { exact: true }).inputValue(), "", "after a reload the guide no longer has the id");
    await panel(share).getByLabel("measurement_id", { exact: true }).fill(id);
    await press(share);
    t.eq((await statusOf(share).innerText()).slice(0, 3), "200", "sharing should answer 200");
    t.eq(JSON.parse(await bodyOf(share)).shared, true, "and the measurement is shared");
    const events = "GET /api/v1/measurements/{measurement_id}/events";
    await open_(events);
    await panel(events).getByLabel("measurement_id", { exact: true }).fill(id);
    await panel(events).getByRole("button", { name: "Watch" }).click();
    await panel(events).locator("pre").last().filter({ hasText: "event:" }).waitFor({ timeout: 20000 });
    t.ok(/event: /.test(await panel(events).locator("pre").last().innerText()), "watching a measurement shows its events as they arrive");
    if (await panel(events).getByRole("button", { name: "Stop" }).count()) await panel(events).getByRole("button", { name: "Stop" }).click();
    await screenshot(page, "api-guide-reference");

    // 8. At the widths people use, with long lines of code and an answer on the screen
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
      await page.getByRole("tab", { name: "Reference" }).click();
      await noOverflow(t, page, `${width} API reference`);
      await page.getByRole("tab", { name: "Guide" }).click();
      await panel(create).waitFor();
      await noOverflow(t, page, `${width} API guide`);
    }
    await screenshot(page, "api-guide");
    t.ok(errors.length === 0, `console errors ${JSON.stringify([...new Set(errors)])}`);
  } finally {
    if (keyId) await adminCall("DELETE", `/admin/api-keys/${keyId}`);
    await admin.close();
    await close();
  }
}
