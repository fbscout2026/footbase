"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Search, ChevronDown } from "lucide-react";
import { useT } from "@/lib/i18n/I18nProvider";
import type { TranslationKey } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/cn";
import { createClient } from "@/lib/supabase/client";
import { formatAthleteCode } from "@/lib/format";

type Entity = "atletas" | "clubes" | "torneios";
const ENTITIES: Entity[] = ["atletas", "clubes", "torneios"];

interface Result {
  href: string;
  primary: string;
  secondary: string;
}

export function UniversalSearch() {
  const { t } = useT();
  const router = useRouter();
  const [entity, setEntity] = useState<Entity>("atletas");
  const [query, setQuery] = useState("");
  const [entityMenuOpen, setEntityMenuOpen] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [atletaResults, setAtletaResults] = useState<Result[]>([]);
  const [clubResults, setClubResults] = useState<Result[]>([]);
  const [torneioResults, setTorneioResults] = useState<Result[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (entity !== "atletas" || query.trim().length < 2) {
      setAtletaResults([]);
      return;
    }
    let active = true;
    const timer = window.setTimeout(async () => {
      const safeQuery = query.trim().replace(/[%_]/g, "");
      if (safeQuery.length < 2) {
        if (active) setAtletaResults([]);
        return;
      }
      // BID is numeric — `ilike` on a bigint column errors, so a purely-numeric
      // query searches by exact bid instead of by name substring.
      const isNumeric = /^\d+$/.test(safeQuery);
      const q = createClient().from("atletas").select("bid,name,main_position,current_category").order("name").limit(6);
      const { data } = isNumeric ? await q.eq("bid", Number(safeQuery)) : await q.ilike("name", `%${safeQuery}%`);
      if (active) {
        setAtletaResults(
          (data ?? []).map((a) => ({
            href: `/atletas/${a.bid}`,
            primary: a.name,
            secondary: [a.main_position, a.current_category, formatAthleteCode(a.bid)].filter(Boolean).join(" · "),
          })),
        );
      }
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [entity, query]);

  useEffect(() => {
    if (entity !== "clubes" || query.trim().length < 2) {
      setClubResults([]);
      return;
    }
    let active = true;
    const timer = window.setTimeout(async () => {
      const safeQuery = query.trim().replace(/[%_]/g, "");
      if (safeQuery.length < 2) {
        if (active) setClubResults([]);
        return;
      }
      const { data } = await createClient().from("view_clube_resumo")
        .select("id,name,state,federacao").ilike("name", `%${safeQuery}%`).order("name").limit(6);
      if (active) setClubResults((data ?? []).map((club) => ({ href: `/clubes/${club.id}`, primary: club.name.toUpperCase(), secondary: [club.state, club.federacao].filter(Boolean).join(" · ") })));
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [entity, query]);

  useEffect(() => {
    if (entity !== "torneios" || query.trim().length < 2) {
      setTorneioResults([]);
      return;
    }
    let active = true;
    const timer = window.setTimeout(async () => {
      const safeQuery = query.trim().replace(/[%_]/g, "");
      if (safeQuery.length < 2) {
        if (active) setTorneioResults([]);
        return;
      }
      const { data } = await createClient().from("torneios")
        .select("id,name,federation,category,year").ilike("name", `%${safeQuery}%`).order("name").limit(6);
      if (active) setTorneioResults((data ?? []).map((tr) => ({ href: `/torneios/${tr.id}`, primary: tr.name, secondary: `${tr.federation} · ${tr.category ?? "—"} · ${tr.year}` })));
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [entity, query]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setEntityMenuOpen(false);
        setResultsOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const results = useMemo<Result[]>(() => {
    if (!query.trim()) return [];
    if (entity === "atletas") return atletaResults;
    if (entity === "clubes") return clubResults;
    return torneioResults;
  }, [atletaResults, clubResults, torneioResults, entity, query]);

  function go(href: string) {
    setResultsOpen(false);
    setQuery("");
    router.push(href);
  }

  const placeholderKey = `search.placeholder.${entity}` as TranslationKey;
  const entityKey = `search.entity.${entity}` as TranslationKey;

  return (
    <div ref={ref} className="relative w-full max-w-xl">
      <div className="flex h-11 items-center rounded-sm bg-white pr-4 shadow-md ring-1 ring-white/20">
        {/* entity selector */}
        <button
          type="button"
          aria-label={t(entityKey)}
          aria-expanded={entityMenuOpen}
          aria-haspopup="menu"
          onClick={() => {
            setEntityMenuOpen((v) => !v);
            setResultsOpen(false);
          }}
          className="flex h-full shrink-0 items-center gap-1 border-r border-neutral-200 px-4 text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-50"
        >
          {t(entityKey)}
          <ChevronDown size={14} className="text-neutral-400" />
        </button>

        {/* input */}
        <input
          name="universal-search"
          aria-label={t(placeholderKey)}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setResultsOpen(true);
          }}
          onFocus={() => query && setResultsOpen(true)}
          placeholder={t(placeholderKey)}
          className="h-full min-w-0 flex-1 bg-transparent px-4 text-sm text-neutral-900 outline-none placeholder:text-neutral-400"
        />
        <Search size={18} className="shrink-0 text-neutral-400" />
      </div>

      {/* entity menu */}
      {entityMenuOpen && (
        <div className="absolute left-0 z-50 mt-2 w-44 overflow-hidden rounded-sm bg-white py-1 shadow-xl ring-1 ring-black/10">
          {ENTITIES.map((e) => (
            <button
              key={e}
              onClick={() => {
                setEntity(e);
                setEntityMenuOpen(false);
              }}
              className={cn(
                "block w-full px-4 py-2 text-left text-sm transition-colors hover:bg-neutral-50",
                e === entity ? "font-semibold text-brand-dim" : "text-neutral-700"
              )}
            >
              {t(`search.entity.${e}` as TranslationKey)}
            </button>
          ))}
        </div>
      )}

      {/* results */}
      {resultsOpen && query.trim() && (
        <div className="absolute left-0 right-0 z-50 mt-2 overflow-hidden rounded-sm bg-white py-1 shadow-xl ring-1 ring-black/10">
          {results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-neutral-500">{t("search.noResults")}</p>
          ) : (
            results.map((r) => (
              <button
                key={r.href}
                onClick={() => go(r.href)}
                className="block w-full px-4 py-2.5 text-left transition-colors hover:bg-neutral-50"
              >
                <p className="text-sm font-medium text-neutral-900">{r.primary}</p>
                <p className="text-xs text-neutral-500">{r.secondary}</p>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
