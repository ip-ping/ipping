"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { FALLBACK_CONFIG, isLanguage, resolveLanguage, type LanguageCode, type LanguageConfig } from "./languages";
import { translate, type MessageKey, type Vars } from "./translate";

const STORAGE_KEY = "ipping.language";

type I18n = {
  lang: LanguageCode;
  /** A message in the language being shown. */
  t: (key: MessageKey, vars?: Vars) => string;
  /** The visitor's own choice: kept in this browser, and it wins over the browser's language from then on. */
  setLang: (code: LanguageCode) => void;
  /** The languages that can be chosen (an administrator's setting). */
  enabled: readonly LanguageCode[];
};

const Context = createContext<I18n | null>(null);

const read = (): string | null => {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null; // a private window, or storage turned off: the browser's language is followed instead
  }
};

async function loadConfig(): Promise<LanguageConfig> {
  try {
    const response = await fetch("/api/v1/config", { credentials: "same-origin" });
    if (!response.ok) return FALLBACK_CONFIG;
    const body = (await response.json()) as { languages?: { enabled?: unknown[]; default?: unknown; auto_detect?: unknown } };
    const enabled = (body.languages?.enabled ?? []).filter(isLanguage);
    if (enabled.length === 0) return FALLBACK_CONFIG;
    return {
      enabled,
      default: isLanguage(body.languages?.default) ? body.languages.default : enabled[0],
      autoDetect: body.languages?.auto_detect !== false,
    };
  } catch {
    return FALLBACK_CONFIG; // a site too old to say: every language, following the browser
  }
}

/**
 * Chooses the language once the page is up (the first paint is the default language: a page that is drawn on a server cannot know
 * the visitor's), and keeps `<html lang>` right. The choice order is in `resolveLanguage`.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<LanguageConfig>(FALLBACK_CONFIG);
  const [lang, setLangState] = useState<LanguageCode>("en");

  useEffect(() => {
    let cancelled = false;
    void loadConfig().then((loaded) => {
      if (cancelled) return;
      setConfig(loaded);
      setLangState(resolveLanguage({ stored: read(), browser: navigator.languages?.length ? navigator.languages : [navigator.language], config: loaded }));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((code: LanguageCode) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, code);
    } catch {
      // not remembered, but the page still changes
    }
    setLangState(code);
  }, []);

  const t = useCallback((key: MessageKey, vars?: Vars) => translate(lang, key, vars), [lang]);
  const value = useMemo<I18n>(() => ({ lang, t, setLang, enabled: config.enabled }), [lang, t, setLang, config.enabled]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useI18n(): I18n {
  const value = useContext(Context);
  if (!value) throw new Error("useI18n needs an I18nProvider");
  return value;
}
