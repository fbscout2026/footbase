"use client";

import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Search, TrendingUp, Clock3 } from "lucide-react";
import { useT } from "@/lib/i18n/I18nProvider";

export function Hero() {
  const { t } = useT();

  return (
    <section className="matchday-hero w-full border-b border-border/50">
      <div className="grid w-full gap-12 px-6 pb-24 pt-20 md:grid-cols-2 md:items-center md:px-10 md:pt-28 xl:px-16 2xl:px-24">
        <div>
        <span className="inline-block border-l-4 border-brand bg-surface px-3 py-1 text-xs font-extrabold uppercase tracking-[0.16em] text-muted">
          {t("hero.eyebrow")}
        </span>

        <h1 className="matchday-heading mt-5 text-4xl leading-[0.98] md:text-6xl">
          {t("hero.headlineLead")}
          <span className="text-brand">{t("hero.headlineHighlight")}</span>
        </h1>

        <p className="mt-5 max-w-lg text-lg text-muted">{t("hero.sub")}</p>

        <div className="mt-8 flex flex-wrap gap-4">
          <Button href="/cadastro">{t("common.requestAccess")}</Button>
          <Button variant="secondary" href="#como-funciona">
            {t("hero.ctaSecondary")}
          </Button>
        </div>

        <p className="mt-6 text-xs text-muted">{t("hero.trust")}</p>
        </div>

        <div className="relative overflow-hidden">
        <div className="absolute -inset-8 -z-10 bg-brand/10 blur-3xl" />
        <div className="matchday-surface p-5 shadow-premium">
          <div className="flex items-center gap-2 rounded-sm border border-border bg-background px-3 py-2 text-sm text-muted">
            <Search size={15} />
            {t("hero.searchPlaceholder")}
          </div>

          <div className="mt-4 border border-border bg-background p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center bg-surface-hover text-xs font-extrabold text-muted">
                  SPF
                </div>
                <div>
                  <p className="font-semibold">João P.</p>
                  <p className="text-xs text-muted">
                    {t("hero.cardPosition")} · 16 {t("hero.years")} · SUB-17
                  </p>
                </div>
              </div>
              <Badge tone="brand">{t("hero.cardStatusActive")}</Badge>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="border-t-2 border-brand bg-surface-hover py-2">
                <p className="metric-value font-extrabold">14</p>
                <p className="text-muted">{t("hero.matches")}</p>
              </div>
              <div className="border-t-2 border-brand bg-surface-hover py-2">
                <p className="metric-value font-extrabold">890</p>
                <p className="text-muted">{t("hero.minutes")}</p>
              </div>
              <div className="border-t-2 border-brand bg-surface-hover py-2">
                <p className="metric-value font-extrabold">6</p>
                <p className="text-muted">{t("hero.goals")}</p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Badge tone="warning">
                <Clock3 size={11} /> {t("hero.contractUntil")} 03/2027
              </Badge>
              <Badge tone="brand">
                <TrendingUp size={11} /> {t("hero.playedIn")} SUB-20
              </Badge>
            </div>
          </div>
        </div>
        </div>
      </div>
    </section>
  );
}
