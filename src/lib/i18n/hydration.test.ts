// @vitest-environment jsdom
//
// A page drawn on the server is in the default language. React hydrates the parts of it that sit in a <Suspense> boundary later than the
// rest, and the visitor's language is chosen once the page is up: when it was chosen before such a boundary was hydrated, the boundary
// hydrated in German against HTML that says English, and React threw the boundary away ("Hydration failed because the server rendered
// text didn't match the client": seen on the home page, whose form is in a boundary, as `Befehl` against `Command`).
//
// The boundary here is held back by a component that has not loaded yet, which is what makes the order of events certain.
import { createElement, lazy, Suspense, type ReactElement } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider, useI18n } from "./provider";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;

const CONFIG = { languages: { enabled: ["en", "de", "fr"], default: "en", auto_detect: true } };
/** Waits for what React has not done yet, as long as a slow machine needs (a fixed sleep failed on a CI runner), and says what was missing if it never is. */
const settled = (check: () => void) => vi.waitFor(check, { timeout: 5000, interval: 10 });

/** Shows "Command" in the language being shown, in the page and in the held-back part. */
function Heading({ id }: { id: string }): ReactElement {
  const { t } = useI18n();
  return createElement("h2", { id }, t("form.command"));
}

const tree = (Inner: () => ReactElement) =>
  createElement(I18nProvider, null, createElement(Heading, { id: "outside" }), createElement(Suspense, { fallback: null }, createElement(Inner)));

describe("a language chosen before a part of the page is hydrated", () => {
  const errors: unknown[] = [];
  let container: HTMLDivElement;

  beforeEach(() => {
    errors.length = 0;
    window.localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify(CONFIG), { status: 200, headers: { "content-type": "application/json" } }));
  });
  afterEach(() => {
    container.remove();
    vi.unstubAllGlobals();
  });

  it("is applied after hydration, without throwing away what the server drew", async () => {
    // the server: no storage, the default language
    const Inside = () => createElement(Heading, { id: "inside" });
    container.innerHTML = renderToString(tree(Inside));
    expect(container.querySelector("#inside")?.textContent).toBe("Command");

    // the browser: the visitor chose German earlier, and the part of the page in the boundary is not ready to be hydrated yet
    window.localStorage.setItem("ipping.language", "de");
    let release: (() => void) | undefined;
    const Held = lazy(() => new Promise<{ default: () => ReactElement }>((resolve) => (release = () => resolve({ default: Inside }))));
    hydrateRoot(container, tree(() => createElement(Held)), { onRecoverableError: (error) => errors.push(error) });

    // the page is hydrated, its effects have run, the language is chosen, and the part in the boundary is still held back
    await settled(() => {
      expect(document.documentElement.lang).toBe("de");
      expect(container.querySelector("#outside")?.textContent).toBe("Befehl");
      expect(release).toBeDefined();
    });

    release?.(); // now the boundary is hydrated
    await settled(() => expect(container.querySelector("#inside")?.textContent).toBe("Befehl")); // in the language that was chosen
    expect(errors.map(String)).toEqual([]); // and what the server drew was not thrown away
  });

  it("changes the whole page when the visitor chooses another language, in the boundary too", async () => {
    // the visitor's choice, as the language switcher makes it
    const Chooser = () => {
      const { setLang } = useI18n();
      return createElement("button", { id: "choose-fr", onClick: () => setLang("fr") });
    };
    const Inside = () => createElement(Heading, { id: "inside" });
    const page = () => createElement(I18nProvider, null, createElement(Chooser), createElement(Heading, { id: "outside" }), createElement(Suspense, { fallback: null }, createElement(Inside)));
    container.innerHTML = renderToString(page());
    hydrateRoot(container, page(), { onRecoverableError: (error) => errors.push(error) });
    // hydrated, and the language chosen for the visitor (English: nothing is stored) once the page is up
    await settled(() => expect(document.documentElement.lang).toBe("en"));
    expect(container.querySelector("#inside")?.textContent).toBe("Command");
    expect(errors).toEqual([]);

    container.querySelector<HTMLButtonElement>("#choose-fr")?.click();
    await settled(() => {
      expect(container.querySelector("#outside")?.textContent).toBe("Commande");
      expect(container.querySelector("#inside")?.textContent).toBe("Commande");
      expect(document.documentElement.lang).toBe("fr");
      expect(window.localStorage.getItem("ipping.language")).toBe("fr"); // remembered
    });
  });
});
