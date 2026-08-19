"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LayoutGrid, LoaderCircle, Minus, Plus, RefreshCw, ShieldAlert, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { TacticalPitch } from "@/components/prancheta/TacticalPitch";
import { SlotPicker } from "@/components/prancheta/SlotPicker";
import { BenchPanel } from "@/components/prancheta/BenchPanel";
import { useFavorites } from "@/lib/favorites/FavoritesProvider";
import { useT } from "@/lib/i18n/I18nProvider";
import { createClient } from "@/lib/supabase/client";
import { loadFavoritesBoardData } from "@/lib/prancheta-adapter";
import type { AtletaRecord } from "@/lib/services/atletas";
import { FORMATIONS, FORMATION_SLOTS, type Formation, type FormationSlot } from "@/lib/prancheta-formations";
import { buildBestLineup, rankBench, rankCandidatesForSlot, type RankingCandidate } from "@/lib/prancheta-ranking";
import {
  replaceBoardSlots,
  updateBoardName,
  type TacticalBoardRecord,
  type TacticalBoardSlotRecord,
} from "@/lib/services/tactical-board";

export function TacticalBoardClient({
  board,
  initialSlots,
}: {
  board: TacticalBoardRecord;
  initialSlots: TacticalBoardSlotRecord[];
}) {
  const { t } = useT();
  const { favorites, savingBid } = useFavorites();
  const client = useMemo(() => createClient(), []);
  const [candidates, setCandidates] = useState<RankingCandidate[]>([]);
  const [athletes, setAthletes] = useState<Map<number, AtletaRecord>>(new Map());
  useEffect(() => {
    let active = true;
    loadFavoritesBoardData(client, favorites).then((data) => {
      if (!active) return;
      setCandidates(data.candidates);
      setAthletes(data.athletes);
    });
    return () => { active = false; };
  }, [client, favorites]);
  const [formation, setFormation] = useState<Formation>(board.formation);
  const [boardName, setBoardName] = useState(board.name);
  const [lineup, setLineup] = useState(initialSlots);
  const [pickerSlot, setPickerSlot] = useState<FormationSlot | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [manualChanges, setManualChanges] = useState(false);
  const [zoom, setZoom] = useState(100);
  const autoInitialized = useRef(false);
  const mutationInFlight = useRef(false);
  const confirmedBoardName = useRef(board.name);
  const slots = FORMATION_SLOTS[formation];

  function generatedLineup(nextFormation: Formation): TacticalBoardSlotRecord[] {
    const nextSlots = FORMATION_SLOTS[nextFormation];
    return buildBestLineup(candidates, nextSlots).map((entry) => ({
      bid: entry.bid,
      position: entry.slot.position,
      order: nextSlots.findIndex((slot) => slot.id === entry.slot.id),
    }));
  }

  async function persist(nextFormation: Formation, nextLineup: TacticalBoardSlotRecord[]) {
    if (mutationInFlight.current) return;
    mutationInFlight.current = true;
    const previousFormation = formation;
    const previousLineup = lineup;
    setFormation(nextFormation);
    setLineup(nextLineup);
    setSaving(true);
    setError(false);
    try {
      // Force a session check before mutating: a browser tab left open past the
      // access-token TTL won't auto-refresh in time (timers are throttled in
      // background tabs), so the RPC below would otherwise fail with a stale JWT.
      await client.auth.getSession();
      await replaceBoardSlots(client, board.id, nextFormation, nextLineup);
    } catch (err) {
      console.error("[prancheta] falha ao salvar a prancheta:", err);
      setFormation(previousFormation);
      setLineup(previousLineup);
      setError(true);
      throw new Error("board-save-failed");
    } finally {
      setSaving(false);
      mutationInFlight.current = false;
    }
  }

  useEffect(() => {
    if (autoInitialized.current || board.lineupInitialized || candidates.length === 0) return;
    autoInitialized.current = true;
    void persist(board.formation, generatedLineup(board.formation)).catch(() => undefined);
    // First-open bootstrap only; later favorite changes never rewrite a custom XI.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates.length]);

  useEffect(() => {
    if (savingBid !== null) return;
    const favoriteBids = new Set(favorites.map((favorite) => favorite.bid));
    setLineup((current) => current.filter((entry) => favoriteBids.has(entry.bid)));
  }, [favorites, savingBid]);

  async function handleNameSave() {
    if (mutationInFlight.current) return;
    const previous = confirmedBoardName.current;
    mutationInFlight.current = true;
    setSaving(true);
    setError(false);
    try {
      const savedName = await updateBoardName(client, board.id, boardName);
      confirmedBoardName.current = savedName;
      setBoardName(savedName);
    } catch {
      setBoardName(previous);
      setError(true);
    } finally {
      setSaving(false);
      mutationInFlight.current = false;
    }
  }

  async function handleFormationChange(raw: string) {
    const nextFormation = raw as Formation;
    if (nextFormation === formation) return;
    if (manualChanges && !window.confirm(t("board.confirmFormation"))) return;
    try {
      await persist(nextFormation, generatedLineup(nextFormation));
      setManualChanges(false);
    } catch {
      // Error state is rendered below.
    }
  }

  async function handleAutoFill() {
    try {
      await persist(formation, generatedLineup(formation));
      setManualChanges(false);
    } catch {
      // Error state is rendered below.
    }
  }

  async function chooseAthlete(slot: FormationSlot, bid: number) {
    const order = slots.findIndex((entry) => entry.id === slot.id);
    const next = [
      ...lineup.filter((entry) => entry.order !== order && entry.bid !== bid),
      { bid, position: slot.position, order },
    ].sort((a, b) => a.order - b.order);
    setPickerSlot(null);
    try {
      await persist(formation, next);
      setManualChanges(true);
    } catch {
      // Error state is rendered below.
    }
  }

  async function clearSlot(slot: FormationSlot) {
    const order = slots.findIndex((entry) => entry.id === slot.id);
    setPickerSlot(null);
    try {
      await persist(formation, lineup.filter((entry) => entry.order !== order));
      setManualChanges(true);
    } catch {
      // Error state is rendered below.
    }
  }

  const selectedBids = new Set(lineup.map((entry) => entry.bid));
  const bench = rankBench(candidates, selectedBids);
  const scores = new Map<number, number>();
  lineup.forEach((entry) => {
    const slot = slots[entry.order];
    if (!slot) return;
    const ranked = rankCandidatesForSlot(candidates, slot);
    scores.set(entry.order, ranked.find((item) => item.candidate.bid === entry.bid)?.score ?? 0);
  });

  const pickerCandidates = pickerSlot
    ? rankCandidatesForSlot(candidates, pickerSlot).filter((entry) =>
        !selectedBids.has(entry.candidate.bid)
        || lineup.find((item) => item.order === slots.findIndex((slot) => slot.id === pickerSlot.id))?.bid === entry.candidate.bid
      )
    : [];

  if (favorites.length === 0) {
    return (
      <div className="matchday-surface border-dashed p-12 text-center">
        <Users size={36} className="mx-auto text-brand" />
        <h1 className="mt-4 text-xl font-extrabold uppercase italic">{t("board.noFavoritesTitle")}</h1>
        <p className="mx-auto mt-2 max-w-lg text-sm text-muted">{t("board.noFavoritesDescription")}</p>
        <Button href="/atletas" className="mt-5">{t("board.findAthletes")}</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2 text-brand">
            <LayoutGrid size={18} />
            <span className="text-xs font-bold uppercase tracking-wider">UC06</span>
          </div>
          <h1 className="text-2xl font-extrabold uppercase italic tracking-tight">{t("board.title")}</h1>
          <p className="mt-1 text-sm text-muted">{t("board.subtitle")}</p>
          <label className="mt-3 block max-w-sm text-xs font-semibold text-muted">
            {t("board.name")}
            <input
              value={boardName}
              maxLength={80}
              disabled={saving}
              onChange={(event) => setBoardName(event.target.value)}
              onBlur={() => void handleNameSave()}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-brand disabled:opacity-60"
            />
          </label>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-40">
            <p className="mb-1 text-xs font-semibold text-muted">{t("board.formation")}</p>
            <Select
              value={formation}
              onChange={handleFormationChange}
              options={FORMATIONS.map((value) => ({ value, label: value }))}
              ariaLabel={t("board.formation")}
              disabled={saving}
            />
          </div>
          <Button onClick={handleAutoFill} disabled={saving}>
            {saving ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            {t("board.bestEleven")}
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          <ShieldAlert size={16} /> {t("board.saveError")}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="matchday-surface p-3 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
            <div className="flex flex-wrap items-center gap-4">
              <span>{lineup.length}/11 {t("board.starters")}</span>
              <span>{favorites.length} {t("board.favoritesCount")}</span>
            </div>
            <div className="flex items-center border border-border bg-background" role="group" aria-label={t("board.zoomControls")}>
              <button
                type="button"
                onClick={() => setZoom((value) => Math.max(60, value - 10))}
                disabled={zoom === 60}
                aria-label={t("board.zoomOut")}
                className="flex h-11 w-11 items-center justify-center border-r border-border text-foreground transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Minus size={16} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setZoom(100)}
                disabled={zoom === 100}
                aria-label={t("board.zoomReset")}
                className="metric-value h-11 min-w-16 px-3 font-bold text-foreground transition-colors hover:bg-surface-hover disabled:cursor-default"
              >
                <span aria-live="polite">{zoom}%</span>
              </button>
              <button
                type="button"
                onClick={() => setZoom((value) => Math.min(140, value + 10))}
                disabled={zoom === 140}
                aria-label={t("board.zoomIn")}
                className="flex h-11 w-11 items-center justify-center border-l border-border text-foreground transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="scroll-brand w-full overflow-auto pb-2">
            <TacticalPitch
              slots={slots}
              lineup={lineup}
              scores={scores}
              athletes={athletes}
              zoom={zoom}
              disabled={saving}
              onSelectSlot={setPickerSlot}
            />
          </div>
        </section>
        <BenchPanel candidates={bench} athletes={athletes} />
      </div>

      {pickerSlot && (
        <SlotPicker
          slot={pickerSlot}
          candidates={pickerCandidates}
          athletes={athletes}
          hasCurrent={lineup.some((entry) => entry.order === slots.findIndex((slot) => slot.id === pickerSlot.id))}
          onChoose={(bid) => chooseAthlete(pickerSlot, bid)}
          onClear={() => clearSlot(pickerSlot)}
          onClose={() => setPickerSlot(null)}
        />
      )}
    </div>
  );
}
