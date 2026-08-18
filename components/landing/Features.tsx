"use client";

import {
  Search,
  Fingerprint,
  FileClock,
  BellRing,
  TrendingUp,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { useT } from "@/lib/i18n/I18nProvider";
import type { TranslationKey } from "@/lib/i18n/dictionaries";

const features: { icon: LucideIcon; titleKey: TranslationKey; descKey: TranslationKey }[] = [
  { icon: Search, titleKey: "features.search.title", descKey: "features.search.desc" },
  { icon: Fingerprint, titleKey: "features.bid.title", descKey: "features.bid.desc" },
  { icon: FileClock, titleKey: "features.contract.title", descKey: "features.contract.desc" },
  { icon: BellRing, titleKey: "features.inactivity.title", descKey: "features.inactivity.desc" },
  { icon: TrendingUp, titleKey: "features.aboveCat.title", descKey: "features.aboveCat.desc" },
  { icon: ShieldCheck, titleKey: "features.agentClaim.title", descKey: "features.agentClaim.desc" },
];

export function Features() {
  const { t } = useT();

  return (
    <section id="recursos" className="w-full border-b border-border/50 bg-background">
      <div className="w-full px-6 py-24 md:px-10 xl:px-16 2xl:px-24">
        <div className="max-w-xl">
        <h2 className="matchday-heading text-3xl md:text-4xl">
          {t("features.heading")}
        </h2>
        <p className="mt-3 text-muted">{t("features.sub")}</p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {features.map(({ icon: Icon, titleKey, descKey }) => (
          <div
            key={titleKey}
            className="matchday-surface p-6 transition-colors hover:border-brand/60 hover:bg-surface-hover"
          >
            <div className="flex h-10 w-10 items-center justify-center border border-brand/30 bg-brand/10 text-brand">
              <Icon size={20} />
            </div>
            <h3 className="mt-4 font-extrabold uppercase tracking-wide">{t(titleKey)}</h3>
            <p className="mt-2 text-sm text-muted">{t(descKey)}</p>
          </div>
        ))}
        </div>
      </div>
    </section>
  );
}
