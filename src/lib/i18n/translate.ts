import { en, type MessageKey } from "./messages/en";
import { MESSAGES } from "./messages";
import type { LanguageCode } from "./languages";

export type { MessageKey };
export type Vars = Record<string, string | number>;

/**
 * A message in `lang`, or in English when that language has not translated it (a new string is English until somebody translates
 * it, never blank), with `{name}` replaced by the value of `name`.
 */
export function translate(lang: LanguageCode, key: MessageKey, vars?: Vars): string {
  const text = MESSAGES[lang]?.[key] ?? en[key];
  return vars ? text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole)) : text;
}
