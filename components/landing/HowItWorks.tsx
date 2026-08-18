"use client";

import { useT } from "@/lib/i18n/I18nProvider";
import type { TranslationKey } from "@/lib/i18n/dictionaries";

const steps: { step: string; titleKey: TranslationKey; descKey: TranslationKey }[] = [
  { step: "01", titleKey: "how.step1.title", descKey: "how.step1.desc" },
  { step: "02", titleKey: "how.step2.title", descKey: "how.step2.desc" },
  { step: "03", titleKey: "how.step3.title", descKey: "how.step3.desc" },
];

export function HowItWorks() {
  const { t } = useT();

  return (
    <section id="como-funciona" className="border-y border-border bg-surface/40">
      <div className="w-full px-6 py-24 md:px-10 xl:px-16 2xl:px-24">
        <h2 className="matchday-heading text-3xl md:text-4xl">{t("how.heading")}</h2>

        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {steps.map(({ step, titleKey, descKey }) => (
            <div key={step} className="border-t border-border pt-5">
              <span className="metric-value text-4xl font-black italic text-brand">{step}</span>
              <h3 className="mt-3 font-extrabold uppercase tracking-wide">{t(titleKey)}</h3>
              <p className="mt-2 text-sm text-muted">{t(descKey)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
