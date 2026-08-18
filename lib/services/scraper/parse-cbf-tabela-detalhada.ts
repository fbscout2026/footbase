// FOOTBASE Phase 6.x — CBF "Tabela Detalhada" PARSER (pure text → discovery index).
//
// Source: each CBF national competition (Brasileirão, Copa do Brasil, Copa do
// Nordeste, Liga de Desenvolvimento, ...) publishes a "Tabela Detalhada" PDF —
// hosted on `stcbfsiteprdimgbrs.blob.core.windows.net`, OUTSIDE the Next.js site, so
// unlike the rest of cbf.com.br it is reachable with a PLAIN fetch (confirmed live:
// no Cloudflare/bot challenge). It lists every match of the whole season: round,
// date, teams, final score.
//
// THIS IS A DISCOVERY INDEX, NOT A ParsedMatch SOURCE: it has no lineup, no goals/
// cards/subs, no súmula link, and no stable "código" that's confirmed to map onto
// `conteudo.cbf.com.br/sumulas/{ano}/{código}se.pdf` — that crosswalk is NOT verified
// yet (unlike the FPF one, which was confirmed live with the same athlete in two
// sources). Use this to know which matches exist and roughly when, not to seed
// `partidas_sumula` directly.
//
// TEXT QUALITY, verified against one real sample (Brasileirão SUB-20 Série A 2026,
// 190 matches, 75/77 dated+scored rows in the sample parsed correctly, the other 2
// are genuinely future/unplayed finals with no score yet — not a parser failure):
//   - pdf-parse concatenates table columns with NO separator in many rows
//     ("010120/02sex15:00Vasco da GamaRJ..."), so this parser works on the WHOLE
//     whitespace-collapsed text, anchored on the one unambiguous token (the
//     "DD/MM" + weekday pair), rather than trying to split fixed-width columns.
//   - A single stray uppercase letter (looks like a TV-channel code: "A"/"B"/"H"/"V"/
//     "I"...) is sometimes glued onto the digit code or the team name. It is only
//     stripped when NOT immediately followed by a lowercase letter, so a team name
//     starting with a real capital ("São Paulo", "Grêmio") is never truncated.
//   - The 1-2 digit round number is occasionally missing entirely from the extracted
//     text (a PDF-extraction artifact, not a formatting rule) — `rodada` is `null` in
//     that case rather than guessed.
//
// This parser is PURE and unit-tested; it performs no IO.

export interface CbfTabelaMatch {
  jogo: string; // the competition's internal match number (NOT confirmed to be the súmula "código")
  rodada: string | null;
  data: string; // "DD/MM" — no year in the source; caller supplies the season year
  dia: string; // weekday abbreviation, e.g. "sex", "sáb"
  hora: string;
  mandante: string;
  ufMandante: string;
  golsMandante: number;
  golsVisitante: number;
  visitante: string;
  ufVisitante: string;
}

const DIA = "seg|ter|qua|qui|sex|sáb|dom";
// A stray single uppercase letter, kept only when NOT immediately followed by a
// lowercase letter (i.e. not the real first letter of a capitalized word).
const STRAY_ANYWHERE = "(?:[A-ZÀ-Ú])?";
const STRAY_BEFORE_WORD = "(?:[A-ZÀ-Ú](?=[A-ZÀ-Ú]))?";

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Parse a "Tabela Detalhada" PDF's extracted text into the list of matches that
 * already have a date and a final score. Future/unplayed matches (no score yet) are
 * silently skipped — they carry no useful discovery information yet, not an error.
 */
export function parseCbfTabelaDetalhada(rawText: string): CbfTabelaMatch[] {
  const text = normalizeWhitespace(rawText);
  const anchorRe = new RegExp(`(\\d{2}\\/\\d{2})(${DIA})`, "g");
  const anchors = [...text.matchAll(anchorRe)].map((m) => ({
    index: m.index,
    data: m[1]!,
    dia: m[2]!,
  }));

  const codeRe = new RegExp(`(\\d{3})(\\d{0,2})[ªa]?\\s*${STRAY_ANYWHERE}\\s*$`);
  const bodyRe = new RegExp(
    `^\\s*${STRAY_ANYWHERE}\\s*(\\d{1,2}:\\d{2})\\s*${STRAY_BEFORE_WORD}(.+?)([A-ZÀ-Ú]{2})\\s*(\\d+)\\s*x\\s*(\\d+)\\s*(.+?)([A-ZÀ-Ú]{2})`,
  );

  const matches: CbfTabelaMatch[] = [];
  for (let i = 0; i < anchors.length; i++) {
    const anchor = anchors[i]!;
    const segEnd = i + 1 < anchors.length ? anchors[i + 1]!.index : text.length;
    const before = text.slice(Math.max(0, anchor.index - 9), anchor.index);
    const code = before.match(codeRe);
    if (!code) continue; // no recognizable jogo-code prefix — skip, don't guess

    const segment = text.slice(anchor.index + anchor.data.length + anchor.dia.length, segEnd);
    const body = segment.match(bodyRe);
    if (!body) continue; // most commonly a future match with no score yet

    matches.push({
      jogo: code[1]!,
      rodada: code[2] || null,
      data: anchor.data,
      dia: anchor.dia,
      hora: body[1]!,
      mandante: body[2]!.trim(),
      ufMandante: body[3]!,
      golsMandante: Number(body[4]!),
      golsVisitante: Number(body[5]!),
      visitante: body[6]!.trim(),
      ufVisitante: body[7]!,
    });
  }
  return matches;
}
