// The administrator's tools end to end: a watch goes bad and a webhook on this machine hears about it once; an
// API key made in the browser works from the command line and is refused after it is revoked.
import { execFileSync } from "node:child_process";
import http from "node:http";
import { fileURLToPath } from "node:url";

import { BASE, apiFor, open, signIn } from "./lib.mjs";

const HOOK_HOST = process.env.WEBHOOK_HOST ?? "host.docker.internal"; // how the backend reaches this machine

export default async function check(t) {
  const received = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      received.push(JSON.parse(body || "{}"));
      res.writeHead(200);
      res.end("ok");
    });
  });
  await new Promise((r) => server.listen(0, "0.0.0.0", r));
  const port = server.address().port;

  const { page, errors, close } = await open(t.browser, { width: 1280 });
  await signIn(page);
  const call = apiFor(page);
  // a run that was cut short may have left its things behind
  for (const w of (await call("GET", "/admin/watches")) ?? []) if (w.name.startsWith("UI check")) await call("DELETE", `/admin/watches/${w.id}`);
  for (const k of (await call("GET", "/admin/api-keys")) ?? []) if (k.name.startsWith("UI check") && !k.revoked_at) await call("DELETE", `/admin/api-keys/${k.id}`);
  await call("PATCH", "/admin/settings", { allow_private_webhooks: true });

  // ---- a watch on a name that does not exist alerts once, however many bad runs follow
  await page.getByRole("tab", { name: "Watches" }).click();
  await page.getByRole("button", { name: /Add a watch/ }).click();
  await page.getByLabel("Name").fill("UI check: gone name");
  await page.getByRole("dialog").getByRole("combobox").first().click();
  await page.getByRole("option", { name: "DNS" }).click();
  await page.getByLabel(/Domain name/).fill("nx-ui-check.example.com");
  await page.getByLabel(/Alert after/).fill("1");
  await page.getByLabel(/Alert address/).fill(`http://${HOOK_HOST}:${port}/hook`);
  await page.getByRole("button", { name: "Add the watch" }).click();
  await page.getByRole("dialog").waitFor({ state: "detached", timeout: 15000 });
  const card = page.locator("li", { hasText: "UI check: gone name" });
  for (let i = 0; i < 3; i++) {
    await card.getByRole("button", { name: "Run now" }).click();
    await page.waitForTimeout(6500);
  }
  await page.waitForTimeout(1000);
  t.eq(received.filter((r) => r.event === "alert").length, 1, "three bad runs should send exactly one alert");
  t.ok(/nx-ui-check\.example\.com is not answering/.test(received[0]?.message ?? ""), `the alert says: ${received[0]?.message}`);
  t.ok(/alerting/i.test(await card.innerText()), "the watch should say it is alerting");
  await card.getByRole("button", { name: "Test alert" }).click();
  await page.waitForTimeout(1200);
  t.eq(received.at(-1)?.event, "test", "the test alert should arrive");
  await card.getByRole("button", { name: "History" }).click();
  await page.getByRole("dialog").locator("tbody tr").first().waitFor();
  t.ok((await page.getByRole("dialog").locator("tbody tr").count()) >= 3, "the history should list the runs");
  await page.keyboard.press("Escape");
  page.once("dialog", (d) => d.accept());
  await card.getByRole("button", { name: "Delete" }).click();
  await page.waitForTimeout(800);
  t.eq(await page.locator("li", { hasText: "UI check: gone name" }).count(), 0, "the watch should be gone");
  await call("PATCH", "/admin/settings", { allow_private_webhooks: false });
  server.close();

  // ---- an API key made in the browser works from the command line
  await page.getByRole("tab", { name: "API keys" }).click();
  await page.getByRole("button", { name: /Create a key/ }).click();
  const keyName = `UI check key ${Date.now()}`;
  await page.getByLabel("Name").fill(keyName);
  await page.getByRole("button", { name: "Create the key" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByText(/ipk_/).first().waitFor();
  const key = (await dialog.innerText()).match(/ipk_[A-Za-z0-9_-]+/)[0];
  await page.keyboard.press("Escape");
  const cli = fileURLToPath(new URL("../../scripts/ipping-cli.sh", import.meta.url));
  const run = (args, k = key) => execFileSync(cli, ["-s", BASE, "-k", k, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const report = run(["-n", "2", "ping", "1.1.1.1"]);
  t.ok(/^Ping 1\.1\.1\.1 \(/.test(report) && /nodes answered\. Measured with ipping\./.test(report), `the client printed:\n${report}`);
  t.ok(/MX records via google/.test(run(["-t", "MX", "-r", "google", "dns", "example.com"])), "the client should run a DNS lookup");
  t.ok((await page.locator("tr", { hasText: keyName }).first().innerText()).includes("1"), "the key table should count what it started");
  await page.reload();
  await page.getByRole("tab", { name: "API keys" }).click();
  page.once("dialog", (d) => d.accept());
  await page.locator("tr", { hasText: keyName }).getByRole("button", { name: "Revoke" }).click();
  await page.waitForTimeout(800);
  let refused = false;
  try {
    run(["ping", "1.1.1.1"]);
  } catch (e) {
    refused = e.status === 2 && /not valid/.test(String(e.stderr));
  }
  t.ok(refused, "a revoked key should be refused with exit status 2");
  t.ok(errors.length === 0, `console errors ${JSON.stringify([...new Set(errors)])}`);
  await close();
}
