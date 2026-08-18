"use client";

import { Check } from "lucide-react";
import { useT } from "@/lib/i18n/I18nProvider";
import type { TranslationKey } from "@/lib/i18n/dictionaries";

const audiences: { titleKey: TranslationKey; itemKeys: TranslationKey[] }[] = [
  {
    titleKey: "forWhom.clubs.title",
    itemKeys: ["forWhom.clubs.item1", "forWhom.clubs.item2", "forWhom.clubs.item3"],
  },
  {
    titleKey: "forWhom.agents.title",
    itemKeys: ["forWhom.agents.item1", "forWhom.agents.item2", "forWhom.agents.item3"],
  },
];

export function ForWhom() {
  const { t } = useT();

  return (
    <section id="para-quem" className="w-full border-b border-border/50 bg-background">
      <div className="w-full px-6 py-24 md:px-10 xl:px-16 2xl:px-24">
        <h2 className="matchday-heading text-3xl md:text-4xl">{t("forWhom.heading")}</h2>

        <div className="mt-12 grid gap-6 md:grid-cols-2">
        {audiences.map(({ titleKey, itemKeys }) => (
          <div key={titleKey} className="matchday-surface p-8">
            <h3 className="text-xl font-extrabold uppercase italic tracking-wide">{t(titleKey)}</h3>
            <ul className="mt-5 space-y-3">
              {itemKeys.map((itemKey) => (
                <li key={itemKey} className="flex items-start gap-3 text-sm text-muted">
                  <Check size={16} className="mt-0.5 shrink-0 text-brand" />
                  {t(itemKey)}
                </li>
              ))}
            </ul>
          </div>
        ))}
        </div>
      </div>
    </section>
  );
}
