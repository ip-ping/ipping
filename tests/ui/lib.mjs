// Shared pieces of the UI checks: a browser page that remembers console errors, the API as the page sees it,
// the overflow test, and a little assertion vocabulary. Run against a live stack (see README.md).
import { chromium } from "playwright";

export const BASE = (process.env.BASE_URL ?? "http://127.0.0.1:13100").replace(/\/$/, "");
export const ADMIN = { user: process.env.ADMIN_USER ?? "admin", password: process.env.ADMIN_PASSWORD ?? "correct horse battery" };
export const SHOTS = process.env.SHOTS ?? "";

export const WIDTHS = [390, 768, 1024, 1440];
const heightFor = (w) => (w < 600 ? 844 : 900);

/** A page of its own browser context. Console errors and uncaught exceptions are collected in `errors`. */
export async function open(browser, { width = 1280, dark = false, permissions = [] } = {}) {
  const context = await browser.newContext({ viewport: { width, height: heightFor(width) }, colorScheme: dark ? "dark" : "light", permissions, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`${e.message}`));
  page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && !/Failed to load resource/.test(m.text()) && errors.push(m.text().slice(0, 200)));
  return { context, page, errors, close: () => context.close() };
}

/** The API as the page uses it (session cookie, CSRF token). The first call of a fresh browser has no cookie yet. */
export function apiFor(page) {
  const call = (method, path, body) =>
    page.evaluate(
      async ([m, p, b]) => {
        const s = await (await fetch("/api/v1/session")).json();
        const r = await fetch("/api/v1" + p, { method: m, headers: { "Content-Type": "application/json", "X-CSRF-Token": s.csrf_token }, body: b ? JSON.stringify(b) : undefined });
        const text = await r.text();
        return text ? JSON.parse(text) : null;
      },
      [method, path, body],
    );
  return call;
}

export async function warmUp(page) {
  await page.goto(BASE + "/");
  const call = apiFor(page);
  await call("GET", "/session");
  await page.waitForTimeout(300);
  return call;
}

/** Start a measurement through the API and wait for it to finish. Returns its id. */
export async function measure(call, page, body, timeoutS = 90) {
  const created = await call("POST", "/measurements", { dns_mode: "fixed", family: "auto", follow_redirects: false, ...body });
  if (!created?.id) throw new Error(`could not start ${JSON.stringify(body)}: ${JSON.stringify(created)}`);
  for (let i = 0; i < timeoutS; i++) {
    const m = await call("GET", "/measurements/" + created.id);
    if (m.status !== "running") return created.id;
    await page.waitForTimeout(1000);
  }
  throw new Error(`measurement ${created.id} did not finish`);
}

export async function signIn(page) {
  await page.goto(BASE + "/admin");
  await page.waitForLoadState("networkidle");
  await page.getByLabel(/username/i).fill(ADMIN.user);
  await page.getByLabel(/password/i).fill(ADMIN.password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.getByRole("tab", { name: "Nodes" }).waitFor({ timeout: 15000 });
}

/** Elements that stick out of the window and are not inside something that scrolls, and whether the page scrolls sideways. */
export const OVERFLOW = `(() => {
  const vw = innerWidth, out = [];
  const scrollable = (el) => { for (let e = el.parentElement; e; e = e.parentElement) { const o = getComputedStyle(e).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') return true; } return false; };
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width && r.right > vw + 1 && !scrollable(el)) out.push(el.tagName.toLowerCase() + '.' + String(el.className.baseVal ?? el.className).slice(0, 50) + ' right=' + Math.round(r.right));
  }
  return { vw, scrollW: document.documentElement.scrollWidth, out: out.slice(0, 5) };
})()`;

/** Descendants of the open dialog that leave its box (and are not in a scroll container). */
export const DIALOG_OVERFLOW = `(() => {
  const d = document.querySelector('[data-slot=dialog-content]'); if (!d) return { none: true };
  const r = d.getBoundingClientRect(), out = [];
  const scroll = (el) => { for (let e = el.parentElement; e && e !== d; e = e.parentElement) { const o = getComputedStyle(e).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') return true; } return false; };
  for (const el of d.querySelectorAll('*')) { const b = el.getBoundingClientRect(); if (b.width && (b.right > r.right + 1 || b.left < r.left - 1) && !scroll(el)) out.push(el.tagName.toLowerCase() + '.' + String(el.className.baseVal ?? el.className).slice(0, 40) + ' ' + Math.round(b.right - r.right) + 'px'); }
  return { out: out.slice(0, 6), pageOverflow: document.documentElement.scrollWidth > innerWidth + 1 };
})()`;

export async function noOverflow(t, page, where) {
  const o = await page.evaluate(OVERFLOW);
  t.ok(o.scrollW <= o.vw + 1 && o.out.length === 0, `${where}: the page overflows (${JSON.stringify(o)})`);
}

export async function screenshot(page, name, fullPage = true) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage });
}

export async function launch() {
  return chromium.launch();
}
