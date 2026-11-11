"use client";

import { GlobeIcon } from "lucide-react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { isLanguage, LANGUAGES } from "@/lib/i18n/languages";
import { useI18n } from "@/lib/i18n/provider";

/** Chooses the language of the interface; the browser remembers it. Not shown when only one language is on. */
export function LanguageSwitcher() {
  const { lang, setLang, enabled, t } = useI18n();
  if (enabled.length < 2) return null;
  const items = LANGUAGES.filter((l) => enabled.includes(l.code)).map((l) => ({ value: l.code, label: l.name }));
  return (
    <Select value={lang} items={items} onValueChange={(next) => isLanguage(next) && setLang(next)}>
      <SelectTrigger size="sm" aria-label={t("language")} className="w-auto gap-1.5">
        <GlobeIcon className="text-muted-foreground" />
        <span className="hidden sm:inline">
          <SelectValue />
        </span>
        <span className="uppercase sm:hidden">{lang}</span>
      </SelectTrigger>
      <SelectContent align="end">
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
