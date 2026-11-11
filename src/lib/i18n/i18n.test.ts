import { describe, expect, it } from "vitest";

import { FALLBACK_CONFIG, fromBrowser, LANGUAGE_CODES, resolveLanguage, type LanguageConfig } from "./languages";
import { MESSAGES } from "./messages";
import { en, type MessageKey } from "./messages/en";
import { translate } from "./translate";

const config = (over: Partial<LanguageConfig> = {}): LanguageConfig => ({ ...FALLBACK_CONFIG, ...over });

describe("fromBrowser", () => {
  it("takes the first preferred language that is on, by its primary subtag", () => {
    expect(fromBrowser(["de-CH", "en-US"], ["en", "de"])).toBe("de");
    expect(fromBrowser(["zh-TW", "en"], ["en", "zh"])).toBe("zh");
    expect(fromBrowser(["pt-BR"], ["en", "pt"])).toBe("pt");
    expect(fromBrowser(["fr_CA"], ["fr"])).toBe("fr");
  });
  it("skips a language that is off and finds nothing for one that is not translated", () => {
    expect(fromBrowser(["de", "fr"], ["en", "fr"])).toBe("fr");
    expect(fromBrowser(["sv", "nl"], ["en", "de"])).toBeNull();
    expect(fromBrowser([], ["en"])).toBeNull();
  });
});

describe("resolveLanguage", () => {
  it("lets the visitor's own choice win, while it is still on", () => {
    expect(resolveLanguage({ stored: "ja", browser: ["de"], config: config() })).toBe("ja");
    expect(resolveLanguage({ stored: "ja", browser: ["de"], config: config({ enabled: ["en", "de"] }) })).toBe("de"); // ja was switched off
  });
  it("follows the browser when the administrator has it followed", () => {
    expect(resolveLanguage({ stored: null, browser: ["es-MX", "en"], config: config() })).toBe("es");
  });
  it("does not follow the browser when that is off, and uses the default", () => {
    expect(resolveLanguage({ stored: null, browser: ["es"], config: config({ autoDetect: false, default: "fr" }) })).toBe("fr");
  });
  it("uses the default when the browser's language is not on, or not known", () => {
    expect(resolveLanguage({ stored: null, browser: ["sv"], config: config({ default: "de" }) })).toBe("de");
    expect(resolveLanguage({ stored: "klingon", browser: [], config: config({ default: "ko" }) })).toBe("ko");
  });
  it("falls back to the first language that is on when the default was switched off", () => {
    expect(resolveLanguage({ stored: null, browser: [], config: config({ enabled: ["zh", "ja"], default: "en" }) })).toBe("zh");
  });
});

describe("translate", () => {
  it("shows a message in the language, and English where it is not translated", () => {
    expect(translate("en", "nav.measure")).toBe("Measure");
    expect(translate("de", "nav.nodes")).toBe(MESSAGES.de["nav.nodes"] ?? en["nav.nodes"]);
  });
  it("puts values in, and leaves an unknown placeholder alone", () => {
    expect(translate("en", "fleet.live", { live: 3, total: 5 })).toBe("3/5 live");
    expect(translate("en", "fleet.live", { live: 3 })).toBe("3/{total} live");
  });
});

describe("the translations", () => {
  const keys = Object.keys(en) as MessageKey[];
  const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

  it("have an entry for every language", () => {
    expect(Object.keys(MESSAGES).sort()).toEqual([...LANGUAGE_CODES].sort());
  });

  for (const code of LANGUAGE_CODES.filter((c) => c !== "en")) {
    it(`${code}: only translates messages that exist, and keeps their {placeholders}`, () => {
      const messages = MESSAGES[code];
      const unknown = Object.keys(messages).filter((k) => !(k in en));
      expect(unknown).toEqual([]);
      const wrong = keys.filter((k) => messages[k] !== undefined && placeholders(messages[k] as string).join() !== placeholders(en[k]).join());
      expect(wrong).toEqual([]);
    });

    it(`${code}: translates all of the interface`, () => {
      const missing = keys.filter((k) => messages_(code)[k] === undefined);
      expect(missing).toEqual([]);
    });
  }
});

const messages_ = (code: (typeof LANGUAGE_CODES)[number]) => MESSAGES[code];

describe("what the components rely on", () => {
  for (const code of LANGUAGE_CODES) {
    const text = (key: MessageKey) => MESSAGES[code][key] ?? en[key];
    it(`${code}: the title's accent is a word of the title, and "every node tests" ends with the address`, () => {
      expect(text("home.title")).toContain(text("home.title.accent"));
      expect(text("m.everyNodeTests").trimEnd().endsWith("{ip}")).toBe(true);
    });
  }
});
