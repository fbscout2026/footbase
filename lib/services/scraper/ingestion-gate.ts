
// FOOTBASE Phase 6.5 — hard gate for LIVE ingestion writes.
//
// Live writes stay blocked until the Fase 6.5 operational checks are satisfied. This
// gate makes an accidental live write impossible: even calling `ingestMatch(..., {
// dryRun: false })` refuses to write unless `INGESTION_LIVE_ENABLED=true` is set in
// the server environment. Flipping that flag is the deliberate, auditable act that
// opens live ingestion — after backup, a dry-run review, and the contract checks.
//
// The flag is read from the server environment only. It must NEVER be a
// `NEXT_PUBLIC_*` var (that would ship it to the browser) — keep it server-side, next
// to SUPABASE_SERVICE_ROLE_KEY.

export function isLiveIngestionEnabled(): boolean {
  return process.env.INGESTION_LIVE_ENABLED === "true";
}

/** Throws unless live ingestion has been explicitly enabled. Call before any live write. */
export function assertLiveIngestionAllowed(): void {
  if (!isLiveIngestionEnabled()) {
    throw new Error(
      "live ingestion is disabled: set INGESTION_LIVE_ENABLED=true (server env) only after the Fase 6.5 gates " +
        "(backup, dry-run review, contract/RLS checks). Use { dryRun: true } to plan without writing.",
    );
  }
}
