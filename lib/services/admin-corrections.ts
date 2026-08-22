import type { SupabaseClient } from "@supabase/supabase-js";
import { formatAthleteCode } from "@/lib/format";

export type CorrectionSource = "club" | "athlete";
export type CorrectionStatus = "pending" | "approved" | "rejected";

export interface AdminCorrection {
  id: string;
  source: CorrectionSource;
  targetLabel: string;
  fieldName: string;
  currentValue: string | null;
  suggestedValue: string;
  reason: string | null;
  evidenceUrl: string | null;
  status: CorrectionStatus;
  createdAt: string;
}

function one<T>(rel: T | T[] | null): T | null {
  return Array.isArray(rel) ? (rel[0] ?? null) : (rel ?? null);
}

// Fields whose correction can't be a blind `update {[field]: suggested_value}`:
// - athlete `fbId` is the primary key other tables reference (favoritos, prancheta,
//   atuacoes_sumula) — repointing it needs a dedicated migration path, not a UI click.
// - athlete `performance_data` has no matching column (it's derived from
//   atuacoes_sumula; capture_correction_current_value() stores null for it already).
// - club `crest` isn't a real column (`clubes.webp_crest_url`/`crest_storage_path`) and
//   must go through the .webp ≤120x120 processing pipeline, not a raw URL write.
const ATHLETE_FIELDS_REQUIRING_MANUAL_APPLY = new Set(["fb_id", "performance_data"]);
const CLUB_FIELDS_REQUIRING_MANUAL_APPLY = new Set(["crest"]);

// Admin reads all institutional corrections (club + athlete).
export async function loadCorrections(client: SupabaseClient): Promise<AdminCorrection[]> {
  const [clubRes, athRes] = await Promise.all([
    client.from("club_correction_requests").select("id, field_name, current_value, suggested_value, reason, evidence_url, status, created_at, clubes(name)").order("created_at", { ascending: false }),
    client.from("solicitacoes_correcao").select("id, field_name, current_value, suggested_value, reason, comprovante_url, status, created_at, fb_id_atleta, atletas(name)").order("created_at", { ascending: false }),
  ]);
  if (clubRes.error) throw clubRes.error;
  if (athRes.error) throw athRes.error;

  const club: AdminCorrection[] = (clubRes.data ?? []).map((r) => ({
    id: String(r.id),
    source: "club",
    targetLabel: one<{ name?: string }>(r.clubes as never)?.name ?? "—",
    fieldName: String(r.field_name),
    currentValue: r.current_value as string | null,
    suggestedValue: String(r.suggested_value),
    reason: r.reason as string | null,
    evidenceUrl: r.evidence_url as string | null,
    status: r.status as CorrectionStatus,
    createdAt: r.created_at as string,
  }));

  const athlete: AdminCorrection[] = (athRes.data ?? []).map((r) => {
    const at = one<{ name?: string }>(r.atletas as never);
    return {
      id: String(r.id),
      source: "athlete",
      targetLabel: `${at?.name ?? "—"}${r.fb_id_atleta ? ` · ${formatAthleteCode(Number(r.fb_id_atleta))}` : ""}`,
      fieldName: String(r.field_name),
      currentValue: r.current_value as string | null,
      suggestedValue: String(r.suggested_value),
      reason: r.reason as string | null,
      evidenceUrl: r.comprovante_url as string | null,
      status: r.status as CorrectionStatus,
      createdAt: r.created_at as string,
    };
  });

  return [...club, ...athlete].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

// Approve/reject. RLS club_corrections_admin_update / solicitacoes_update_admin allow
// admin; the club/athlete tables' guard triggers set the reviewer.
//
// On approval, this also APPLIES suggested_value to the target row (clubes/atletas) in
// the same call — admin already has unrestricted RLS write access to both tables
// (clubes_write_admin, guard_atleta_update's is_admin() bypass), so this closes the gap
// where an admin had to open Supabase directly to make the institutional edit real.
// Fields in *_FIELDS_REQUIRING_MANUAL_APPLY are skipped (see comment above) — approval
// still records the decision, but the caller is told applied=false so the UI can say so.
export async function setCorrectionStatus(
  client: SupabaseClient,
  source: CorrectionSource,
  id: string,
  status: Exclude<CorrectionStatus, "pending">
): Promise<{ applied: boolean }> {
  const table = source === "club" ? "club_correction_requests" : "solicitacoes_correcao";
  let applied = false;

  if (status === "approved") {
    const idColumn = source === "club" ? "club_id" : "fb_id_atleta";
    const { data: row, error: readError } = await client
      .from(table)
      .select(`${idColumn}, field_name, suggested_value`)
      .eq("id", id)
      .single();
    if (readError) throw readError;

    const fieldName = String((row as Record<string, unknown>).field_name);
    const manualFields = source === "club" ? CLUB_FIELDS_REQUIRING_MANUAL_APPLY : ATHLETE_FIELDS_REQUIRING_MANUAL_APPLY;
    if (!manualFields.has(fieldName)) {
      const targetTable = source === "club" ? "clubes" : "atletas";
      const matchColumn = source === "club" ? "id" : "fb_id";
      const { error: applyError } = await client
        .from(targetTable)
        .update({ [fieldName]: (row as Record<string, unknown>).suggested_value })
        .eq(matchColumn, (row as Record<string, unknown>)[idColumn] as string | number);
      if (applyError) throw applyError;
      applied = true;
    }
  }

  const { error } = await client.from(table).update({ status }).eq("id", id);
  if (error) throw error;
  return { applied };
}
