// Runs every check against a live stack and fails if any of them does.
//
//   BASE_URL=http://127.0.0.1:13100 node tests/ui/run.mjs [check-name ...]
//
// The stack needs a backend (with IPPING_SETUP_TOKEN=e2e-token), the frontend, and the simulated fleet from
// scripts/dev-fleet.py. See tests/ui/README.md.
import { readdirSync } from "node:fs";

import { SHOTS, launch, warmUp, open, measure } from "./lib.mjs";

const wanted = process.argv.slice(2);
const files = readdirSync(new URL(".", import.meta.url)).filter((f) => /^\d\d-.*\.mjs$/.test(f)).sort();
const browser = await launch();

// One measurement of each kind, shared so that any browser can open them: the checks use these.
const setup = await open(browser, { width: 1280 });
const call = await warmUp(setup.page);
const shared = {};
const kinds = {
  ping: { target: "1.1.1.1", kind: "ping", count: 3 },
  tcp: { target: "example.com:443", kind: "tcp", count: 3 },
  http: { target: "https://example.com/", kind: "http" },
  traceroute: { target: "example.com", kind: "traceroute" },
  dns: { target: "split-example.com", kind: "dns", record_type: "A", resolver: "system", dns_mode: "regional" },
};
for (const [name, body] of Object.entries(kinds)) {
  shared[name] = await measure(call, setup.page, body);
  await call("POST", `/measurements/${shared[name]}/share`, { shared: true });
}
await setup.close();

let failed = 0;
for (const file of files) {
  const name = file.replace(/^\d\d-/, "").replace(/\.mjs$/, "");
  if (wanted.length && !wanted.includes(name)) continue;
  const failures = [];
  const t = {
    browser,
    shared,
    ok: (condition, message) => condition || failures.push(message),
    eq: (a, b, message) => a === b || failures.push(`${message}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`),
    note: (text) => console.log(`     ${text}`),
  };
  const started = Date.now();
  try {
    await (await import(`./${file}`)).default(t);
  } catch (e) {
    failures.push(`threw: ${e.stack ?? e}`);
  }
  const seconds = ((Date.now() - started) / 1000).toFixed(0);
  if (failures.length) {
    failed += 1;
    console.log(`FAIL ${name} (${seconds}s)`);
    for (const f of failures.slice(0, 12)) console.log(`     - ${f}`);
    if (failures.length > 12) console.log(`     ... and ${failures.length - 12} more`);
  } else console.log(`ok   ${name} (${seconds}s)`);
}
await browser.close();
console.log(failed ? `\n${failed} check(s) failed${SHOTS ? `; screenshots are in ${SHOTS}` : ""}` : "\nall checks passed");
process.exit(failed ? 1 : 0);
