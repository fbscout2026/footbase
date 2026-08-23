"use client";

import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useT } from "@/lib/i18n/I18nProvider";
import type { TranslationKey } from "@/lib/i18n/dictionaries";
import Link from "next/link";

const links: { key: TranslationKey; href: string }[] = [
  { key: "nav.howItWorks", href: "#como-funciona" },
  { key: "nav.features", href: "#recursos" },
  { key: "nav.forWhom", href: "#para-quem" },
];

export function Header() {
  const { t } = useT();

  return (
    <header className="top-header-theme sticky top-0 z-50 border-b border-white/15 shadow-lg">
      <div className="flex h-16 w-full items-center justify-between gap-2 px-2 sm:px-6 lg:px-10 xl:px-16 2xl:px-24">
        <Link href="/" className="shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/footbase-logo.svg" alt="Footbase" width="1890" height="277" className="h-auto w-28 sm:w-48" />
        </Link>

        <nav className="hidden items-center gap-4 md:flex lg:gap-8">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-semibold text-white/65 transition-colors hover:text-brand"
            >
              {t(link.key)}
            </a>
          ))}
        </nav>

        <div className="flex min-w-0 items-center gap-1 sm:gap-3">
          <LanguageToggle />
          <ThemeToggle />
          <Button variant="ghost" href="/login" className="hidden border-white/20 text-white hover:border-brand/60 hover:bg-white/10 sm:inline-flex">
            {t("common.enter")}
          </Button>
          <Button href="/cadastro" className="px-2 text-[10px] sm:px-5 sm:text-sm">{t("common.requestAccess")}</Button>
        </div>
      </div>
    </header>
  );
}
