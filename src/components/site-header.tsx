"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { FleetStatus } from "@/components/fleet-status";
import { Mark } from "@/components/mark";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/provider";

// The administration page is not linked from here: administrators go to /admin by its address.
const links = [
  { href: "/", label: "nav.measure" },
  { href: "/nodes", label: "nav.nodes" },
  { href: "/developers", label: "nav.api" },
] as const;

export function SiteHeader() {
  const pathname = usePathname();
  const { t } = useI18n();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" || pathname.startsWith("/measurements") : pathname.startsWith(href);
  const nav = (className: string) =>
    links.map(({ href, label }) => (
      <Button
        key={href}
        variant={isActive(href) ? "secondary" : "ghost"}
        size="sm"
        className={className}
        nativeButton={false}
        render={<Link href={href} aria-current={isActive(href) ? "page" : undefined} />}
      >
        {t(label)}
      </Button>
    ));
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
        <Link href="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight" aria-label="ipping, home">
          <Mark className="size-6" animated />
          ipping
        </Link>
        <nav className="ml-2 hidden items-center gap-1 sm:flex" aria-label={t("nav.main")}>
          {nav("")}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <FleetStatus />
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </div>
      <nav className="flex gap-1 border-t px-2 py-1.5 sm:hidden" aria-label={t("nav.main")}>
        {nav("flex-1")}
      </nav>
    </header>
  );
}
