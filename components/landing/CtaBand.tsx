"use client";

import { Button } from "@/components/ui/Button";
import { useT } from "@/lib/i18n/I18nProvider";

export function CtaBand() {
  const { t } = useT();

  return (
    <section className="w-full bg-surface/40 px-6 py-24 md:px-10 xl:px-16 2xl:px-24">
      <div className="matchday-surface w-full overflow-hidden border-brand/40 bg-[linear-gradient(115deg,rgb(var(--brand)/0.18),transparent_48%)] px-8 py-16 text-center">
        <h2 className="matchday-heading text-3xl md:text-4xl">{t("cta.heading")}</h2>
        <p className="mx-auto mt-3 max-w-md text-muted">{t("cta.sub")}</p>
        <div className="mt-8">
          <Button href="/cadastro">{t("common.requestAccess")}</Button>
        </div>
      </div>
    </section>
  );
}
