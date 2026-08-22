"use client";

import Link from "next/link";
import {
  ChevronLeft, TrendingUp, Globe, BadgeCheck, Clock3, Youtube, Trophy, Award, GitCompareArrows, Square,
} from "lucide-react";
import { useT } from "@/lib/i18n/I18nProvider";
import type { TranslationKey } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ClubeCrest } from "@/components/app/ClubeCrest";
import { EvolutionChart } from "@/components/atletas/dossie/EvolutionChart";
import { ClubHistory } from "@/components/atletas/dossie/ClubHistory";
import { AgentContact } from "@/components/atletas/dossie/AgentContact";
import { formatDate, formatMonthYear, formatAthleteCode } from "@/lib/format";
import type {
  AtletaRecord, ConquistaRecord, AgenteContactRecord, EvolucaoPoint, CategoriaAcimaMatch, CardEvent, MatchHistoryEntry,
} from "@/lib/services/atletas";
import { FavoriteButton } from "@/components/favorites/FavoriteButton";
import { AthleteClaimPanel } from "@/components/atletas/dossie/AthleteClaimPanel";

const CONTRACT_TONE = {
  active: "neutral", expiring_soon: "warning", expired: "danger", free_agent: "brand",
} as const;

export function AtletaDossie({
  atleta: a, conquistas, agent, evolucao, categoriaAcimaMatches, cardEvents, matchHistory,
}: {
  atleta: AtletaRecord; conquistas: ConquistaRecord[]; agent: AgenteContactRecord | null; evolucao: EvolucaoPoint[];
  categoriaAcimaMatches: CategoriaAcimaMatch[]; cardEvents: CardEvent[]; matchHistory: MatchHistoryEntry[];
}) {
  const { t } = useT();

  const isGK = a.mainPosition === "GK";
  const isClaimed = a.claimStatus === "claimed" && a.agentId !== null;

  const stats: { key: TranslationKey; value: string | number; show?: boolean }[] = [
    { key: "dossie.stats.matches", value: a.stats.totalMatches },
    { key: "dossie.stats.minutes", value: a.stats.totalMinutes },
    { key: "dossie.stats.goals", value: a.stats.totalGoals },
    { key: "dossie.stats.assists", value: a.stats.totalAssists },
    { key: "dossie.stats.goalContrib", value: a.stats.totalGoals + a.stats.totalAssists },
    { key: "dossie.stats.cleanSheets", value: a.stats.totalCleanSheets, show: isGK },
    { key: "dossie.stats.yellow", value: a.stats.totalYellowCards },
    { key: "dossie.stats.red", value: a.stats.totalRedCards },
    { key: "dossie.stats.suspended", value: a.jogosSuspenso },
    { key: "dossie.stats.aboveCategory", value: a.stats.timesPlayedAboveCategory },
    { key: "dossie.stats.lastMatch", value: a.stats.lastMatchDate ? formatDate(a.stats.lastMatchDate) : "—" },
  ].filter((s) => s.show !== false);

  return (
    <div className="space-y-4">
      <Link href="/atletas" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
        <ChevronLeft size={16} /> {t("nav.atletas")}
      </Link>

      {/* Header */}
      <section className="border border-border bg-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <ClubeCrest src={a.currentClubCrestUrl} name={a.currentClubName ?? "?"} size={56} />
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight">{a.name}</h1>
              <p className="text-sm text-muted">
                {a.apelido ? `"${a.apelido}" · ` : ""}{formatAthleteCode(a.fbId)} · {a.currentClubName ?? "—"} · {a.currentCategory ?? "—"}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {a.mainPosition && <Badge tone="brand">{a.mainPosition}</Badge>}
                {a.posicaoSecundaria && <Badge tone="neutral">{a.posicaoSecundaria}</Badge>}
                <Badge tone={CONTRACT_TONE[a.contractStatus]}>
                  <Clock3 size={11} />{" "}
                  {a.contractEndDate ? formatMonthYear(a.contractEndDate) : t("contract.free_agent")}
                </Badge>
              </div>
            </div>
          </div>

          <div className="text-right">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <FavoriteButton fbId={a.fbId} athleteName={a.name} />
              <Button href={`/atletas/comparar?bids=${a.fbId}`} variant="secondary" className="px-3 py-1.5">
                <GitCompareArrows size={15} /> {t("compare.singleCta")}
              </Button>
            </div>
            <AthleteClaimPanel fbId={a.fbId} />
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 border-t border-border pt-6 sm:grid-cols-4">
          <Info label={t("dossie.age")} value={a.age ? `${a.age} ${t("hero.years")}` : "—"} />
          <Info label={t("dossie.birth")} value={a.birthDate ? formatDate(a.birthDate) : "—"} />
          <Info label={t("dossie.height")} value={a.heightCm ? `${a.heightCm} cm` : "—"} />
          <Info label={t("dossie.weight")} value={a.weightKg ? `${a.weightKg} kg` : "—"} />
          <Info label={t("dossie.foot")} value={a.dominantFoot ? t(`foot.${a.dominantFoot}` as TranslationKey) : "—"} />
          <Info label={t("dossie.nationality")} value={a.nacionalidade} />
          <Info label={t("dossie.career")} value={a.inicioCarreira ? String(a.inicioCarreira) : "—"} />
          <Info label={t("dossie.category")} value={a.currentCategory ?? "—"} />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {a.stats.timesPlayedAboveCategory > 0 && <Flag icon={TrendingUp} tone="brand" label={t("dossie.flag.aboveCategory")} />}
          {a.experienciaInternacional && <Flag icon={Globe} tone="brand" label={t("dossie.flag.international")} />}
          {a.temPassaporte && <Flag icon={BadgeCheck} tone="neutral" label={t("dossie.flag.passport")} />}
          {a.isInactive30d && <Flag icon={Clock3} tone="danger" label={t("dossie.flag.inactive")} />}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Left/center: stats + evolution */}
        <div className="space-y-4 lg:col-span-2">
          {/* Stats */}
          <section className="border border-border bg-surface">
            <PanelTitle>{t("dossie.stats.title")}</PanelTitle>
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-b-2xl bg-border sm:grid-cols-3 lg:grid-cols-4">
              {stats.map((s) => (
                <div key={s.key} className="bg-surface p-4">
                  <p className="text-xl font-bold">{s.value}</p>
                  <p className="text-xs text-muted">{t(s.key)}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Evolution */}
          <Panel title={t("dossie.evolution.title")}>
            <EvolutionChart data={evolucao} />
          </Panel>

          {/* Gemas: categoria acima — standard section on every athlete's
              dossiê (Session 55), not just favorited/gem ones on the
              dashboard widget — an athlete with zero qualifying matches just
              shows the empty state below, same pattern as Conquistas. */}
          <Panel title={t("dossie.aboveCategory.title")}>
            {categoriaAcimaMatches.length === 0 ? (
              <p className="text-sm text-muted">{t("dossie.aboveCategory.empty")}</p>
            ) : (
              <>
                <p className="mb-3 text-sm text-muted">
                  {t("dossie.aboveCategory.summary")
                    .replace("{count}", String(categoriaAcimaMatches.length))
                    .replace("{category}", a.currentCategory ?? "—")}
                </p>
                <ul className="scroll-brand max-h-72 space-y-2 overflow-y-auto pr-1">
                  {categoriaAcimaMatches.map((m, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 border border-border bg-background px-3 py-2 text-sm">
                      <span className="flex items-center gap-2 min-w-0">
                        <Badge tone="brand">{m.matchCategory}</Badge>
                        <span className="truncate text-muted">{formatDate(m.matchDate)}</span>
                      </span>
                      <span className="shrink-0 text-xs text-muted">
                        {m.minutesPlayed}&apos; · {m.goals}{t("dossie.stats.goalsShort")} · {m.assists}{t("dossie.stats.assistsShort")}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Panel>
        </div>

        {/* Right: agent/video + conquistas + cartões + history */}
        <div className="space-y-4">
          {isClaimed ? (
            <Panel title={t("dossie.agent.title")}>
              <AgentContact agent={agent} youtubeUrl={a.youtubeVideoUrl} />
            </Panel>
          ) : (
            <Panel title={t("dossie.video.title")}>
              {a.youtubeVideoUrl ? (
                <a
                  href={a.youtubeVideoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 border border-border bg-background p-4 transition-colors hover:border-brand/50"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-danger/15 text-danger">
                    <Youtube size={20} />
                  </span>
                  <span className="text-sm font-medium text-brand">{t("dossie.video.watch")}</span>
                </a>
              ) : (
                <p className="text-sm text-muted">{t("dossie.video.none")}</p>
              )}
            </Panel>
          )}

          <Panel title={t("dossie.conquistas.title")}>
            {conquistas.length === 0 ? (
              <p className="text-sm text-muted">{t("dossie.conquistas.empty")}</p>
            ) : (
              <ul className="space-y-2">
                {conquistas.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 text-sm">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                      {c.tipo === "titulo" ? <Trophy size={15} /> : <Award size={15} />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{c.descricao}</span>
                      <span className="block text-xs text-muted">
                        {t(`dossie.conquistas.${c.tipo}` as TranslationKey)}{c.ano ? ` · ${c.ano}` : ""}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title={t("dossie.cards.title")}>
            {cardEvents.length === 0 ? (
              <p className="text-sm text-muted">{t("dossie.cards.empty")}</p>
            ) : (
              <ul className="scroll-brand max-h-72 space-y-2 overflow-y-auto pr-1">
                {cardEvents.map((c, i) => (
                  <li key={i} className="border border-border bg-background px-3 py-2 text-sm">
                    <span className="flex items-center gap-2 min-w-0">
                      <Badge tone="neutral">{c.matchCategory}</Badge>
                      <span className="truncate text-muted">{formatDate(c.matchDate)}</span>
                    </span>
                    <ul className="mt-2 space-y-1.5">
                      {c.cards.map((card, j) => (
                        <li key={j} className="flex items-start gap-2 text-xs">
                          <Square
                            size={10}
                            className={cn("mt-0.5 shrink-0", card.type === "yellow" ? "fill-warning text-warning" : "fill-danger text-danger")}
                          />
                          <span className="text-muted">{card.reason ?? t("dossie.cards.noReason")}</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title={t("dossie.matchHistory.title")}>
            {matchHistory.length === 0 ? (
              <p className="text-sm text-muted">{t("dossie.matchHistory.empty")}</p>
            ) : (
              <ul className="scroll-brand max-h-72 space-y-2 overflow-y-auto pr-1">
                {matchHistory.map((m, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 border border-border bg-background px-3 py-2 text-sm">
                    <span className="flex items-center gap-2 min-w-0">
                      <Badge tone="neutral">{m.matchCategory}</Badge>
                      <span className="truncate text-muted">{formatDate(m.matchDate)}</span>
                    </span>
                    <span className="shrink-0 truncate text-xs text-muted">
                      {m.opponentName ?? t("dossie.matchHistory.unknownOpponent")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title={t("dossie.history.title")}>
            <ClubHistory atleta={a} />
          </Panel>
        </div>
      </div>
    </div>
  );
}

function PanelTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="border-b border-border px-5 py-4 text-sm font-extrabold uppercase italic tracking-wide">
      {children}
    </h2>
  );
}

function Panel({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("border border-border bg-surface", className)}>
      <PanelTitle>{title}</PanelTitle>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

function Flag({ icon: Icon, label, tone }: { icon: typeof TrendingUp; label: string; tone: "brand" | "neutral" | "danger" }) {
  return (
    <Badge tone={tone}>
      <Icon size={11} /> {label}
    </Badge>
  );
}
