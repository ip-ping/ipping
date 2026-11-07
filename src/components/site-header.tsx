"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { FleetStatus } from "@/components/fleet-status";
import { Mark } from "@/components/mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Measure", n: "01" },
  { href: "/nodes", label: "Nodes", n: "02" },
  { href: "/admin", label: "Admin", n: "03" },
];

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-x-6 px-4">
        <Link href="/" className="flex items-center gap-2.5" aria-label="ipping, home">
          <Mark className="size-7" animated />
          <span className="figure text-[1.35rem] font-bold tracking-[-0.04em]">ipping</span>
        </Link>
        <nav className="ml-2 hidden items-stretch self-stretch sm:flex" aria-label="Main">
          {links.map(({ href, label, n }) => {
            const active = href === "/" ? pathname === "/" || pathname.startsWith("/measurements") : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "label relative flex items-center gap-1.5 border-x border-transparent px-4 transition-colors hover:text-foreground",
                  active && "border-border bg-card text-foreground",
                )}
              >
                <span className="text-signal">{n}</span>
                {label}
                {active && <span aria-hidden className="absolute inset-x-0 -bottom-px h-0.5 bg-signal" />}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-4">
          <FleetStatus />
          <ThemeToggle />
        </div>
      </div>
      <nav className="flex border-t sm:hidden" aria-label="Main">
        {links.map(({ href, label, n }) => {
          const active = href === "/" ? pathname === "/" || pathname.startsWith("/measurements") : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "label flex flex-1 items-center justify-center gap-1.5 py-2.5",
                active && "bg-card text-foreground shadow-[inset_0_-2px_0_var(--signal)]",
              )}
            >
              <span className="text-signal">{n}</span>
              {label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
