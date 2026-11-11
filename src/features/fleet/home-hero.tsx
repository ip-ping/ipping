"use client";

import { useI18n } from "@/lib/i18n/provider";

/** The home page's title and one line saying what it is for; the accent is a word of the title, set apart. */
export function HomeHero() {
  const { t } = useI18n();
  const title = t("home.title");
  const accent = t("home.title.accent");
  const at = accent ? title.indexOf(accent) : -1;
  return (
    <header className="max-w-3xl space-y-2">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
        {at < 0 ? (
          title
        ) : (
          <>
            {title.slice(0, at)}
            <span className="text-signal">{accent}</span>
            {title.slice(at + accent.length)}
          </>
        )}
      </h1>
      <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">{t("home.subtitle")}</p>
    </header>
  );
}
