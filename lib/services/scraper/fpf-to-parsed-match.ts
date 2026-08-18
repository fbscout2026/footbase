import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedMatch, ParsedAppearance } from "./types.ts";
import type { FpfParsedMatch } from "./parse-fpf-sumula.ts";

// FOOTBASE Phase 6.x — FPF súmula → ParsedMatch bridge (thin IO wrapper, no unit test —
// same "IO wrapper validated via dry-run/live" convention as ingest.ts itself).
//
// `FpfParsedMatch` identifies players by "Registro" (see parse-fpf-sumula.ts), not the
// CBF bid that `ingest.ts`/`ParsedMatch` require. This bridges the two: every
// appearance's registro is looked up in `atleta_fontes` (fonte='fpf'). ONLY an ALREADY
// mapped registro resolves — this function NEVER creates a new atleta_fontes mapping
// or a new atletas row itself (that decision belongs to plan-fpf-identity-seed.ts's
// admin-review path, run separately by the roster/profile pipeline). An unmapped
// registro is skipped and reported, never guessed.
//
// `athletes: []` in the returned ParsedMatch is deliberate: every resolved bid here is
// already a real atletas row (that's what having a mapping means), so there is nothing
// for ingest.ts to seed — this bridge only ever contributes match + appearance data,
// never athlete bio fields (those stay owned by the roster/profile adapters).

export interface FpfBridgeResult {
  match: ParsedMatch;
  unresolved: { registro: string; reason: string }[];
}

export async function buildParsedMatchFromFpf(
  admin: SupabaseClient,
  fpfMatch: FpfParsedMatch,
): Promise<FpfBridgeResult> {
  const registros = [...new Set(fpfMatch.appearances.map((a) => a.registro))];
  const unresolved: FpfBridgeResult["unresolved"] = [];

  let bidByRegistro = new Map<string, number>();
  if (registros.length > 0) {
    const { data, error } = await admin
      .from("atleta_fontes")
      .select("id_externo, bid")
      .eq("fonte", "fpf")
      .in("id_externo", registros);
    if (error) throw error;
    bidByRegistro = new Map((data ?? []).map((r) => [String(r.id_externo), Number(r.bid)]));
  }

  const appearances: ParsedAppearance[] = [];
  for (const a of fpfMatch.appearances) {
    const bid = bidByRegistro.get(a.registro);
    if (bid == null) {
      unresolved.push({ registro: a.registro, reason: "no atleta_fontes mapping (fonte='fpf') for this registro yet" });
      continue;
    }
    appearances.push({
      bid,
      playerCategory: a.playerCategory,
      minutesPlayed: a.minutesPlayed,
      goals: a.goals,
      assists: a.assists,
      yellowCards: a.yellowCards,
      redCards: a.redCards,
      cleanSheet: a.cleanSheet,
    });
  }

  const match: ParsedMatch = {
    tournament: fpfMatch.tournament,
    matchDate: fpfMatch.matchDate,
    matchCategory: fpfMatch.matchCategory,
    rodada: fpfMatch.rodada,
    home: { sourceKey: fpfMatch.home.sourceKey, name: fpfMatch.home.name, state: null, federacao: "FPF" },
    away: { sourceKey: fpfMatch.away.sourceKey, name: fpfMatch.away.name, state: null, federacao: "FPF" },
    homeScore: fpfMatch.homeScore,
    awayScore: fpfMatch.awayScore,
    sourceUrl: fpfMatch.sourceUrl,
    athletes: [], // never seeds — every resolved bid above already exists (see module doc)
    appearances,
    ownGoals: fpfMatch.ownGoals,
  };

  return { match, unresolved };
}
