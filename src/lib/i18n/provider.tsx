"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";

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

type Choice = { lang: LanguageCode; enabled: readonly LanguageCode[] };

/**
 * The language being shown, outside React's own state and read with `useSyncExternalStore` by every component that uses it.
 *
 * A page drawn on a server is in the default language, and the visitor's language is only known once the page is up. React hydrates
 * the parts of a page that are in a `<Suspense>` boundary later than the rest: with the language in a provider's state, a language
 * chosen in between reached those parts before they were hydrated, and they were hydrated in it against HTML that said something else
 * (`Befehl` against `Command`), which React answers by throwing the part away and drawing it again. A component that reads the
 * language here is hydrated with `first` whenever it is hydrated, and shown the language that was chosen right after.
 */
type Store = { get: () => Choice; subscribe: (listener: () => void) => () => void; set: (next: Choice) => void };

const first: Choice = { lang: "en", enabled: FALLBACK_CONFIG.enabled };

function createStore(): Store {
  let choice = first;
  const listeners = new Set<() => void>();
  return {
    get: () => choice,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    set: (next) => {
      choice = next;
      if (typeof document !== "undefined") document.documentElement.lang = next.lang;
      listeners.forEach((listener) => listener());
    },
  };
}

const Context = createContext<Store | null>(null);
const serverChoice = () => first;

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
  const [store] = useState(createStore);

  useEffect(() => {
    let cancelled = false;
    void loadConfig().then((loaded) => {
      if (cancelled) return;
      store.set({
        enabled: loaded.enabled,
        lang: resolveLanguage({ stored: read(), browser: navigator.languages?.length ? navigator.languages : [navigator.language], config: loaded }),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [store]);

  return <Context.Provider value={store}>{children}</Context.Provider>;
}

export function useI18n(): I18n {
  const store = useContext(Context);
  if (!store) throw new Error("useI18n needs an I18nProvider");
  const { lang, enabled } = useSyncExternalStore(store.subscribe, store.get, serverChoice);

  const setLang = useCallback(
    (code: LanguageCode) => {
      try {
        window.localStorage.setItem(STORAGE_KEY, code);
      } catch {
        // not remembered, but the page still changes
      }
      store.set({ ...store.get(), lang: code });
    },
    [store],
  );
  const t = useCallback((key: MessageKey, vars?: Vars) => translate(lang, key, vars), [lang]);
  return useMemo<I18n>(() => ({ lang, t, setLang, enabled }), [lang, t, setLang, enabled]);
}
