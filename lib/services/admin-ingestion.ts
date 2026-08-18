import type { SupabaseClient } from "@supabase/supabase-js";

export type ScrapingStatus = "running" | "success" | "partial" | "failed";

export interface ScrapingLog {
  id: string;
  source: string;
  targetUrl: string | null;
  status: ScrapingStatus;
  recordsIngested: number;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
}

// Read-only ingestion monitor (scraping_logs_select_admin). Writes come from the
// scraper (service_role) / admin; the panel only observes.
export async function loadScrapingLogs(client: SupabaseClient, limit = 100): Promise<ScrapingLog[]> {
  const { data, error } = await client
    .from("scraping_logs")
    .select("id, source, target_url, status, records_ingested, error_message, started_at, finished_at")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: String(r.id),
    source: String(r.source),
    targetUrl: r.target_url as string | null,
    status: r.status as ScrapingStatus,
    recordsIngested: Number(r.records_ingested ?? 0),
    errorMessage: r.error_message as string | null,
    startedAt: r.started_at as string,
    finishedAt: r.finished_at as string | null,
  }));
}
