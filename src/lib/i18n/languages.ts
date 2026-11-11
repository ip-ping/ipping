/** The languages the interface has translations for (the backend knows the same codes: `languages_enabled` in its settings). */
export const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "zh", name: "简体中文" },
  { code: "es", name: "Español" },
  { code: "fr", name: "Français" },
  { code: "de", name: "Deutsch" },
  { code: "pt", name: "Português" },
  { code: "ru", name: "Русский" },
  { code: "ja", name: "日本語" },
  { code: "ko", name: "한국어" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

export const LANGUAGE_CODES: readonly LanguageCode[] = LANGUAGES.map((l) => l.code);

export const isLanguage = (value: unknown): value is LanguageCode => LANGUAGE_CODES.includes(value as LanguageCode);

/** What an administrator decided (see `GET /api/v1/config`). */
export type LanguageConfig = {
  /** The languages a visitor can choose. */
  enabled: LanguageCode[];
  /** Used when the visitor has not chosen one and the browser's is not followed or not on. */
  default: LanguageCode;
  /** Follow the browser's language until the visitor chooses one. */
  autoDetect: boolean;
};

/** Until the site has said otherwise (or when it is too old to say): every language, English by default, following the browser. */
export const FALLBACK_CONFIG: LanguageConfig = { enabled: [...LANGUAGE_CODES], default: "en", autoDetect: true };

/** The first of the browser's preferred languages that is on: `zh-TW` and `zh-Hant` are `zh`, `pt-BR` is `pt`. */
export function fromBrowser(preferred: readonly string[], enabled: readonly LanguageCode[]): LanguageCode | null {
  for (const tag of preferred) {
    const primary = tag.trim().toLowerCase().split(/[-_]/)[0];
    const found = enabled.find((code) => code === primary);
    if (found) return found;
  }
  return null;
}

/**
 * Which language to show. The visitor's own choice (kept in the browser) wins as long as it is still on; otherwise the browser's
 * language if the administrator has it followed and it is on; otherwise the default (or the first language that is on, should the
 * default have been switched off since).
 */
export function resolveLanguage({
  stored,
  browser,
  config,
}: {
  stored: string | null | undefined;
  browser: readonly string[];
  config: LanguageConfig;
}): LanguageCode {
  if (isLanguage(stored) && config.enabled.includes(stored)) return stored;
  if (config.autoDetect) {
    const detected = fromBrowser(browser, config.enabled);
    if (detected) return detected;
  }
  return config.enabled.includes(config.default) ? config.default : (config.enabled[0] ?? "en");
}
