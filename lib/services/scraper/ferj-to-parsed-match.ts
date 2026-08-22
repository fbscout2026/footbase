import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedMatch, ParsedAppearance } from "./types.ts";
import type { FerjParsedMatch } from "./parse-ferj-events.ts";

// FOOTBASE Phase 6.x — FERJ súmula → ParsedMatch bridge (thin IO wrapper, no unit test
// — same "IO wrapper validated via dry-run/live" convention as `fpf-to-parsed-match.ts`
// and `ingest.ts` itself).
//
// `FerjParsedMatch` identifies players by "BIRA" (see parse-ferj-sumula.ts), not the
// CBF bid that `ingest.ts`/`ParsedMatch` require. This bridges the two, mirroring
// `buildParsedMatchFromFpf` exactly: every appearance's bira is looked up in
// `atleta_fontes` (fonte='ferj'). ONLY an ALREADY mapped bira resolves — this function
// NEVER creates a new atleta_fontes mapping or a new atletas row itself. An unmapped
// bira is skipped and reported, never guessed.

export interface FerjBridgeResult {
  match: ParsedMatch;
  unresolved: { bira: string; reason: string }[];
}

export async function buildParsedMatchFromFerj(admin: SupabaseClient, ferjMatch: FerjParsedMatch): Promise<FerjBridgeResult> {
  const biras = [...new Set(ferjMatch.appearances.map((a) => a.bira))];
  const unresolved: FerjBridgeResult["unresolved"] = [];

  let bidByBira = new Map<string, number>();
  if (biras.length > 0) {
    const { data, error } = await admin.from("atleta_fontes").select("id_externo, fb_id").eq("fonte", "ferj").in("id_externo", biras);
    if (error) throw error;
    bidByBira = new Map((data ?? []).map((r) => [String(r.id_externo), Number(r.fb_id)]));
  }

  const appearances: ParsedAppearance[] = [];
  for (const a of ferjMatch.appearances) {
    const bid = bidByBira.get(a.bira);
    if (bid == null) {
      unresolved.push({ bira: a.bira, reason: "no atleta_fontes mapping (fonte='ferj') for this bira yet" });
      continue;
    }
    appearances.push({
      bid,
      side: a.side,
      playerCategory: a.playerCategory,
      minutesPlayed: a.minutesPlayed,
      goals: a.goals,
      assists: a.assists,
      yellowCards: a.yellowCards,
      redCards: a.redCards,
      cleanSheet: a.cleanSheet,
      yellowCardReasons: a.yellowCardReasons,
      redCardReasons: a.redCardReasons,
    });
  }

  const match: ParsedMatch = {
    tournament: ferjMatch.tournament,
    matchDate: ferjMatch.matchDate,
    matchCategory: ferjMatch.matchCategory,
    rodada: ferjMatch.rodada,
    home: { sourceKey: `ferj:${ferjMatch.home.clubId}`, name: ferjMatch.home.name, state: "RJ", federacao: "FERJ", crestUrl: ferjMatch.home.crestUrl },
    away: { sourceKey: `ferj:${ferjMatch.away.clubId}`, name: ferjMatch.away.name, state: "RJ", federacao: "FERJ", crestUrl: ferjMatch.away.crestUrl },
    homeScore: ferjMatch.homeScore,
    awayScore: ferjMatch.awayScore,
    sourceUrl: ferjMatch.sourceUrl,
    athletes: [], // never seeds — every resolved bid above already exists (see module doc)
    appearances,
    ownGoals: ferjMatch.ownGoals,
  };

  return { match, unresolved };
}
