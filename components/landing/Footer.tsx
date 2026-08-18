"use client";

import { useT } from "@/lib/i18n/I18nProvider";
import { Logo } from "@/components/Logo";

export function Footer() {
  const { t } = useT();

  return (
    <footer className="border-t-4 border-brand bg-surface">
      <div className="flex w-full flex-col items-center justify-between gap-4 px-6 py-10 text-sm text-muted md:flex-row md:px-10 xl:px-16 2xl:px-24">
        <Logo className="h-6" />
        <p>© {new Date().getFullYear()} Footbase. {t("footer.rights")}</p>
      </div>
    </footer>
  );
}
